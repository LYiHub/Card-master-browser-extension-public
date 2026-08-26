import type {
  AiReasoningEffort,
  AiUsage,
  UserscriptAiRequest,
  UserscriptAiResponse,
} from '../domain/types';

export type AiModelToolDefinition = {
  name: string;
  description: string;
  strict: boolean;
  parameters: Record<string, unknown>;
};

export type AiModelToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AiModelToolChoice = 'auto' | 'required';
export type AiModelResponseFormat = 'json-object';

export type AiModelImage = {
  mimeType: string;
  dataUrl: string;
};

export type AiModelContinuation = {
  format: 'responses';
  items: readonly Record<string, unknown>[];
};

export type AiModelMessage =
  | { role: 'user'; content: string; images?: readonly AiModelImage[] }
  | {
      role: 'assistant';
      content: string;
      reasoning?: string;
      toolCalls: AiModelToolCall[];
      continuation?: AiModelContinuation;
    }
  | { role: 'tool'; toolCallId: string; content: string };

export type AiModelStreamRequest = {
  model: string;
  instructions?: string;
  reasoningEffort: AiReasoningEffort;
  messages: readonly AiModelMessage[];
  tools?: readonly AiModelToolDefinition[];
  toolChoice?: AiModelToolChoice;
  responseFormat?: AiModelResponseFormat;
};

export type AiModelCompletion = {
  model: string;
  text: string;
  reasoning?: string;
  toolCalls: AiModelToolCall[];
  usage?: AiUsage;
  continuation?: AiModelContinuation;
};

export function toolContinuationMessages(
  completion: Pick<
    AiModelCompletion,
    'text' | 'reasoning' | 'toolCalls' | 'continuation'
  >,
  results: readonly Extract<AiModelMessage, { role: 'tool' }>[],
): AiModelMessage[] {
  const callsById = new Map<string, AiModelToolCall>();
  for (const call of completion.toolCalls) {
    if (!call.id.trim()) {
      throw new Error('AI 服务返回了缺少 ID 的工具调用。');
    }
    if (!call.name.trim()) {
      throw new Error(`AI 服务返回了缺少名称的工具调用：${call.id}`);
    }
    if (callsById.has(call.id)) {
      throw new Error(`AI 服务返回了重复的工具调用 ID：${call.id}`);
    }
    callsById.set(call.id, call);
  }

  const resultsById = new Map<
    string,
    Extract<AiModelMessage, { role: 'tool' }>
  >();
  for (const result of results) {
    if (!callsById.has(result.toolCallId)) {
      throw new Error(`工具结果无法匹配对应调用：${result.toolCallId}`);
    }
    if (resultsById.has(result.toolCallId)) {
      throw new Error(`工具结果重复：${result.toolCallId}`);
    }
    resultsById.set(result.toolCallId, result);
  }

  const missing = [...callsById.keys()].filter((id) => !resultsById.has(id));
  if (missing.length > 0) {
    throw new Error(`缺少以下工具调用的结果：${missing.join(', ')}`);
  }

  return [
    {
      role: 'assistant',
      content: completion.text,
      reasoning: completion.reasoning,
      toolCalls: [...callsById.values()],
      ...(completion.continuation
        ? { continuation: completion.continuation }
        : {}),
    },
    ...completion.toolCalls.map((call) => {
      const result = resultsById.get(call.id);
      if (!result) {
        throw new Error(`缺少工具调用结果：${call.id}`);
      }
      return result;
    }),
  ];
}

export type AiModelStreamCallbacks = {
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onReasoningBoundary?: () => void;
  onToolCall?: (toolCall: AiModelToolCall) => void;
};

export interface AiModelClient {
  stream(
    request: AiModelStreamRequest,
    callbacks: AiModelStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<AiModelCompletion>;
  completeUserscriptRequest(
    request: UserscriptAiRequest,
    signal?: AbortSignal,
  ): Promise<UserscriptAiResponse>;
}
