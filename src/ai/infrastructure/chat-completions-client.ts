import { normalizeAiServiceBaseUrl } from '../domain/ai-services-schema';
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

type ChatCompletionsToolCallDelta = {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
};

type ChatCompletionsStreamPayload = {
  model?: string;
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: ChatCompletionsToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};

type ChatCompletionsMessage =
  | { role: 'system'; content: string }
  | {
      role: 'user';
      content:
        | string
        | Array<
            | { type: 'text'; text: string }
            | {
                type: 'image_url';
                image_url: { url: string };
              }
          >;
    }
  | {
      role: 'assistant';
      content: string | null;
      reasoning_content?: string;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export function normalizeChatCompletionsApiBaseUrl(value: string) {
  return normalizeAiServiceBaseUrl(value);
}

function chatCompletionsMessage(
  message: AiModelMessage,
): ChatCompletionsMessage {
  if (message.role === 'user') {
    return {
      role: 'user',
      content: message.images?.length
        ? [
            { type: 'text', text: message.content },
            ...message.images.map((image) => ({
              type: 'image_url' as const,
              image_url: { url: image.dataUrl },
            })),
          ]
        : message.content,
    };
  }
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }
  return {
    role: 'assistant',
    content: message.content || (message.toolCalls.length > 0 ? null : ''),
    ...(message.reasoning ? { reasoning_content: message.reasoning } : {}),
    ...(message.toolCalls.length > 0
      ? {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: {
              name: call.name,
              arguments: call.arguments,
            },
          })),
        }
      : {}),
  };
}

function chatCompletionsTool(tool: AiModelToolDefinition, strict: boolean) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      ...(strict && tool.strict ? { strict: true } : {}),
    },
  };
}

function usage(payload: ChatCompletionsStreamPayload): AiUsage | undefined {
  const inputTokens = payload.usage?.prompt_tokens;
  const outputTokens = payload.usage?.completion_tokens;
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
    return undefined;
  }
  return {
    inputTokens,
    outputTokens,
    ...(typeof payload.usage?.total_tokens === 'number'
      ? { totalTokens: payload.usage.total_tokens }
      : {}),
  };
}

function errorPayload(raw: string) {
  try {
    return JSON.parse(raw) as ChatCompletionsStreamPayload;
  } catch {
    return null;
  }
}

export class ChatCompletionsClient implements AiModelClient {
  private readonly baseUrl: string;
  private readonly fetcher: AiServiceFetch;

  constructor(
    private readonly config: ModelServiceConfig,
    fetcher: AiServiceFetch = (input, init) => globalThis.fetch(input, init),
  ) {
    this.baseUrl = normalizeChatCompletionsApiBaseUrl(config.baseUrl);
    this.fetcher = fetcher;
  }

  async stream(
    request: AiModelStreamRequest,
    callbacks: AiModelStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<AiModelCompletion> {
    const strictTools = new URL(this.baseUrl).pathname
      .split('/')
      .includes('beta');
    const streamRequest = await requestStreamingAiService(
      this.fetcher,
      this.config,
      `${this.baseUrl}/chat/completions`,
      {
        model: request.model,
        messages: [
          ...(request.instructions
            ? [
                {
                  role: 'system' as const,
                  content: request.instructions,
                },
              ]
            : []),
          ...request.messages.map(chatCompletionsMessage),
        ],
        tools: request.tools?.map((tool) =>
          chatCompletionsTool(tool, strictTools),
        ),
        tool_choice: request.tools?.length
          ? (request.toolChoice ?? 'auto')
          : undefined,
        response_format:
          request.responseFormat === 'json-object'
            ? { type: 'json_object' }
            : undefined,
        ...(request.reasoningEffort === 'off'
          ? {}
          : { reasoning_effort: request.reasoningEffort }),
        stream: true,
      },
      signal,
      { protocol: 'chat-completions' },
    );
    const { response, signal: requestSignal } = streamRequest;
    if (!response.ok || !response.body) {
      const raw = await readAiServiceText(response, requestSignal);
      throw aiServiceHttpError(
        response,
        raw,
        errorPayload(raw)?.error?.message,
        {
          protocol: 'chat-completions',
          model: request.model,
        },
      );
    }

    const calls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let model = request.model;
    let text = '';
    let reasoning = '';
    let tokenUsage: AiUsage | undefined;
    let completed = false;
    await consumeAiServiceSse(response, requestSignal, (data) => {
      if (data === '[DONE]') {
        completed = true;
        return;
      }
      const payload = JSON.parse(data) as ChatCompletionsStreamPayload;
      if (payload.error?.message) throw new Error(payload.error.message);
      if (payload.model) model = payload.model;
      tokenUsage = usage(payload) ?? tokenUsage;
      const choice = payload.choices?.[0];
      const delta = choice?.delta;
      if (delta?.reasoning_content) {
        reasoning += delta.reasoning_content;
        callbacks.onReasoningDelta?.(delta.reasoning_content);
      }
      if (delta?.content) {
        text += delta.content;
        callbacks.onTextDelta?.(delta.content);
      }
      for (const toolDelta of delta?.tool_calls ?? []) {
        const index = toolDelta.index ?? 0;
        const current = calls.get(index) ?? {
          id: '',
          name: '',
          arguments: '',
        };
        const next = {
          id: toolDelta.id ?? current.id,
          name: current.name + (toolDelta.function?.name ?? ''),
          arguments: current.arguments + (toolDelta.function?.arguments ?? ''),
        };
        calls.set(index, next);
        if (next.id) callbacks.onToolCall?.(next);
      }
      if (choice?.finish_reason) completed = true;
    });
    if (!completed) {
      throw new Error('Chat Completions 事件流结束时缺少完成标记。');
    }
    const toolCalls = [...calls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => {
        if (!call.id) {
          throw new Error('Chat Completions 返回了缺少 ID 的工具调用。');
        }
        if (!call.name) {
          throw new Error(
            `Chat Completions 返回了缺少名称的工具调用：${call.id}`,
          );
        }
        try {
          JSON.parse(call.arguments || '{}');
        } catch {
          throw new Error(
            `Chat Completions 为 ${call.name} 返回了无效的 JSON 参数。`,
          );
        }
        return call satisfies AiModelToolCall;
      });
    if (new Set(toolCalls.map((call) => call.id)).size !== toolCalls.length) {
      throw new Error('Chat Completions 返回了重复的工具调用 ID。');
    }
    return {
      model,
      text,
      reasoning: reasoning || undefined,
      toolCalls,
      usage: tokenUsage,
    };
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
      throw new Error('Chat Completions 响应中没有最终正文。');
    }
    return {
      text: result.text,
      reasoning: result.reasoning,
      model: result.model,
      usage: result.usage,
    };
  }
}
