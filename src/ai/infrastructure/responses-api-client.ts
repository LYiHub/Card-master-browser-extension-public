import { normalizeAiServiceBaseUrl } from '../domain/ai-services-schema';
import { DEFAULT_MODEL_SERVICE_MODEL } from '../domain/model-catalog';
import type {
  AiUsage,
  ModelServiceConfig,
  UserscriptAiRequest,
  UserscriptAiResponse,
} from '../domain/types';
import {
  type AiServiceFetch,
  aiServiceHttpError,
  consumeAiServiceSse,
  readAiServiceText,
  requestAiService,
  requestStreamingAiService,
} from './ai-service-http';
import type {
  AiModelClient,
  AiModelCompletion,
  AiModelMessage,
  AiModelStreamCallbacks,
  AiModelStreamRequest,
  AiModelToolCall,
  AiModelToolDefinition,
} from './model-client';

export const DEFAULT_RESPONSES_API_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_RESPONSES_API_MODEL = DEFAULT_MODEL_SERVICE_MODEL;

export type ResponsesOutputItem = Record<string, unknown>;

export type ResponsesPayload = {
  id?: string;
  model?: string;
  output?: ResponsesOutputItem[];
  output_text?: string;
  usage?: Record<string, unknown>;
  incomplete_details?: { reason?: string };
  error?: { message?: string; type?: string; code?: string };
};

type ResponsesStreamEvent = {
  type?: string;
  delta?: string;
  arguments?: string;
  item_id?: string;
  output_index?: number;
  item?: ResponsesOutputItem;
  response?: ResponsesPayload;
  error?: { message?: string; type?: string; code?: string };
};

export function normalizeResponsesApiBaseUrl(value: string) {
  return normalizeAiServiceBaseUrl(value, '/v1');
}

function parsePayload(raw: string, status: number) {
  let payload: ResponsesPayload;
  try {
    payload = JSON.parse(raw) as ResponsesPayload;
  } catch {
    throw new Error(
      `AI 服务返回了非 JSON 数据（HTTP ${status}）。请确认基础地址指向 /v1 等 API 根路径。`,
    );
  }
  return payload;
}

function textFromContent(content: unknown) {
  if (!Array.isArray(content)) return [];
  return content.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const text = (entry as { text?: unknown }).text;
    return typeof text === 'string' ? [text] : [];
  });
}

export function responseText(payload: ResponsesPayload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const texts: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== 'message') continue;
    texts.push(...textFromContent(item.content));
  }
  return texts.join('\n');
}

export function responseReasoningSummary(payload: ResponsesPayload) {
  const summaries: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== 'reasoning') continue;
    summaries.push(...textFromContent(item.summary));
  }
  return summaries.join('\n\n') || undefined;
}

export function responseReasoningText(payload: ResponsesPayload) {
  const texts: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== 'reasoning') continue;
    texts.push(...textFromContent(item.content));
  }
  return texts.join('\n\n') || undefined;
}

export function responseUsage(payload: ResponsesPayload): AiUsage | undefined {
  const usage = payload.usage;
  if (!usage) return undefined;
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const totalTokens = usage.total_tokens;
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
    return undefined;
  }
  return {
    inputTokens,
    outputTokens,
    ...(typeof totalTokens === 'number' ? { totalTokens } : {}),
  };
}

function responseToolCall(item: ResponsesOutputItem): AiModelToolCall | null {
  if (
    item.type !== 'function_call' ||
    typeof item.name !== 'string' ||
    typeof item.arguments !== 'string'
  ) {
    return null;
  }
  const id =
    typeof item.call_id === 'string'
      ? item.call_id
      : typeof item.id === 'string'
        ? item.id
        : null;
  return id ? { id, name: item.name, arguments: item.arguments } : null;
}

function responseToolCalls(payload: ResponsesPayload) {
  const calls = (payload.output ?? []).flatMap((item) => {
    const call = responseToolCall(item);
    if (item.type === 'function_call' && !call) {
      throw new Error('AI 服务在完整响应中返回了不完整的工具调用。');
    }
    return call ? [call] : [];
  });
  if (new Set(calls.map((call) => call.id)).size !== calls.length) {
    throw new Error('AI 服务返回了重复的工具调用 ID。');
  }
  return calls;
}

function streamedToolCall(
  item: ResponsesOutputItem | undefined,
  fallbackId: string,
) {
  if (item?.type !== 'function_call') return null;
  const id =
    typeof item.call_id === 'string'
      ? item.call_id
      : typeof item.id === 'string'
        ? item.id
        : fallbackId;
  return {
    id,
    name: typeof item.name === 'string' ? item.name : '',
    arguments: typeof item.arguments === 'string' ? item.arguments : '',
  };
}

function responsesTool(tool: AiModelToolDefinition) {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    strict: tool.strict,
    parameters: tool.parameters,
  };
}

function responsesInput(message: AiModelMessage): Record<string, unknown>[] {
  if (message.role === 'user') {
    return [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: message.content },
          ...(message.images ?? []).map((image) => ({
            type: 'input_image',
            image_url: image.dataUrl,
          })),
        ],
      },
    ];
  }
  if (message.role === 'tool') {
    return [
      {
        type: 'function_call_output',
        call_id: message.toolCallId,
        output: message.content,
      },
    ];
  }
  if (message.continuation?.format === 'responses') {
    return [...message.continuation.items];
  }
  const input: Record<string, unknown>[] = [];
  if (message.content) {
    input.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: message.content }],
    });
  }
  input.push(
    ...message.toolCalls.map((call) => ({
      type: 'function_call',
      call_id: call.id,
      name: call.name,
      arguments: call.arguments,
    })),
  );
  return input;
}

function completion(payload: ResponsesPayload): AiModelCompletion {
  return {
    model: payload.model || '',
    text: responseText(payload),
    reasoning:
      responseReasoningSummary(payload) ?? responseReasoningText(payload),
    toolCalls: responseToolCalls(payload),
    usage: responseUsage(payload),
    continuation: {
      format: 'responses',
      items: payload.output ?? [],
    },
  };
}

export class ResponsesApiClient implements AiModelClient {
  private readonly baseUrl: string;
  private readonly fetcher: AiServiceFetch;

  constructor(
    private readonly config: ModelServiceConfig,
    fetcher: AiServiceFetch = (input, init) => globalThis.fetch(input, init),
  ) {
    this.baseUrl = normalizeResponsesApiBaseUrl(config.baseUrl);
    this.fetcher = fetcher;
  }

  async create(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ResponsesPayload> {
    const response = await requestAiService(
      this.fetcher,
      this.config,
      `${this.baseUrl}/responses`,
      body,
      signal,
      { protocol: 'responses' },
    );
    const raw = await readAiServiceText(response, signal);
    const payload = parsePayload(raw, response.status);
    if (!response.ok) {
      throw aiServiceHttpError(response, raw, payload.error?.message, {
        protocol: 'responses',
        model: typeof body.model === 'string' ? body.model : this.config.model,
      });
    }
    return payload;
  }

  async stream(
    request: AiModelStreamRequest,
    callbacks: AiModelStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<AiModelCompletion> {
    const streamRequest = await requestStreamingAiService(
      this.fetcher,
      this.config,
      `${this.baseUrl}/responses`,
      {
        model: request.model,
        instructions: request.instructions,
        reasoning:
          request.reasoningEffort === 'off'
            ? { effort: 'none' }
            : {
                effort: request.reasoningEffort,
                summary: 'auto',
              },
        input: request.messages.flatMap((message) => responsesInput(message)),
        text:
          request.responseFormat === 'json-object'
            ? { format: { type: 'json_object' } }
            : undefined,
        tools: request.tools?.map(responsesTool),
        tool_choice: request.tools?.length
          ? (request.toolChoice ?? 'auto')
          : undefined,
        stream: true,
      },
      signal,
      { protocol: 'responses' },
    );
    const { response, signal: requestSignal } = streamRequest;
    if (!response.ok || !response.body) {
      const raw = await readAiServiceText(response, requestSignal);
      const payload = parsePayload(raw, response.status);
      throw aiServiceHttpError(response, raw, payload.error?.message, {
        protocol: 'responses',
        model: request.model,
      });
    }

    let completed: ResponsesPayload | null = null;
    const streamedCalls = new Map<string | number, AiModelToolCall>();
    let reasoningHasText = false;
    let reasoningCompleted = false;
    await consumeAiServiceSse(response, requestSignal, (data) => {
      if (data === '[DONE]') return;
      const event = JSON.parse(data) as ResponsesStreamEvent;
      switch (event.type) {
        case 'response.output_text.delta':
          if (event.delta) {
            callbacks.onTextDelta?.(event.delta);
          }
          break;
        case 'response.reasoning_summary_text.delta':
        case 'response.reasoning_text.delta':
          if (event.delta) {
            if (reasoningCompleted && reasoningHasText) {
              callbacks.onReasoningBoundary?.();
              reasoningHasText = false;
              reasoningCompleted = false;
            }
            callbacks.onReasoningDelta?.(event.delta);
            reasoningHasText = true;
          }
          break;
        case 'response.reasoning_summary_text.done':
        case 'response.reasoning_text.done':
          reasoningCompleted = true;
          break;
        case 'response.reasoning_summary_part.added':
          if (reasoningHasText) {
            callbacks.onReasoningBoundary?.();
          }
          reasoningHasText = false;
          reasoningCompleted = false;
          break;
        case 'response.output_item.added': {
          const key = event.output_index ?? event.item_id ?? 'tool';
          const toolCall = streamedToolCall(event.item, String(key));
          if (!toolCall) break;
          streamedCalls.set(key, toolCall);
          callbacks.onToolCall?.(toolCall);
          break;
        }
        case 'response.function_call_arguments.delta': {
          const key = event.output_index ?? event.item_id ?? 'tool';
          const current = streamedCalls.get(key);
          if (!current || typeof event.delta !== 'string') break;
          const next = {
            ...current,
            arguments: current.arguments + event.delta,
          };
          streamedCalls.set(key, next);
          callbacks.onToolCall?.(next);
          break;
        }
        case 'response.function_call_arguments.done': {
          const key = event.output_index ?? event.item_id ?? 'tool';
          const current = streamedCalls.get(key);
          if (!current || typeof event.arguments !== 'string') break;
          const next = { ...current, arguments: event.arguments };
          streamedCalls.set(key, next);
          callbacks.onToolCall?.(next);
          break;
        }
        case 'response.output_item.done': {
          const toolCall = event.item && responseToolCall(event.item);
          if (toolCall) {
            const key = event.output_index ?? event.item_id ?? toolCall.id;
            streamedCalls.set(key, toolCall);
            callbacks.onToolCall?.(toolCall);
          }
          break;
        }
        case 'response.completed':
          completed = event.response ?? completed;
          break;
        case 'response.failed':
        case 'response.incomplete': {
          const failure = event.response?.error ?? event.error;
          const code = failure?.code || failure?.type;
          const incompleteReason = event.response?.incomplete_details?.reason;
          throw new Error(
            `AI 服务请求失败${code ? `（${code}）` : ''}：${
              failure?.message ||
              (incompleteReason
                ? `响应未完成（${incompleteReason}）。`
                : '服务未返回具体原因。')
            }`,
          );
        }
        case 'error':
          throw new Error(
            `AI 服务事件流失败${
              event.error?.code || event.error?.type
                ? `（${event.error.code || event.error.type}）`
                : ''
            }：${event.error?.message || '服务未返回具体原因。'}`,
          );
      }
    });
    if (!completed) {
      throw new Error('AI 服务事件流结束时没有完整响应。');
    }
    const result = completion(completed);
    result.model ||= request.model;
    return result;
  }

  async completeUserscriptRequest(
    request: UserscriptAiRequest,
    signal?: AbortSignal,
  ): Promise<UserscriptAiResponse> {
    const result = await this.stream(
      {
        model: this.config.model,
        instructions: request.instructions,
        reasoningEffort: request.reasoningEffort ?? this.config.reasoningEffort,
        messages: [{ role: 'user', content: request.input }],
      },
      {},
      signal,
    );
    if (!result.text) {
      throw new Error('AI 服务响应中没有正文。');
    }
    return {
      text: result.text,
      reasoning: result.reasoning,
      model: result.model || this.config.model,
      usage: result.usage,
    };
  }
}
