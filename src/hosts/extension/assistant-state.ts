import type {
  AiConversationMessage,
  AiConversationSnapshot,
  AiToolCall,
} from '../../ai/domain/types';
import { isAiImageMimeType } from '../../ai/domain/types';
import type { AiModelMessage } from '../../ai/infrastructure/model-client';

export const AI_CONVERSATION_STORAGE_KEY = 'card-master.ai-conversations.v1';

const DEFAULT_CONVERSATION_TITLE = '新会话';

export type StoredAssistantConversation = {
  id: string;
  title: string;
  model?: string;
  createdAt: number;
  updatedAt: number;
  messages: AiConversationMessage[];
  turnContexts: StoredAssistantTurnContext[];
  input: AiModelMessage[];
};

export type StoredAssistantTurnContext = {
  messageId: string;
  content: string;
};

export type StoredAssistantState = {
  version: 1;
  activeConversationId: string;
  runningConversationId: string | null;
  conversations: StoredAssistantConversation[];
};

export function createStoredAssistantConversation(
  model?: string,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): StoredAssistantConversation {
  return {
    id,
    title: DEFAULT_CONVERSATION_TITLE,
    ...(model ? { model } : {}),
    createdAt: now,
    updatedAt: now,
    messages: [],
    turnContexts: [],
    input: [],
  };
}

export function emptyAssistantState(model?: string): StoredAssistantState {
  const conversation = createStoredAssistantConversation(model);
  return {
    version: 1,
    activeConversationId: conversation.id,
    runningConversationId: null,
    conversations: [conversation],
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function boundedString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.length <= maxLength;
}

function optionalBoundedString(value: unknown, maxLength: number) {
  return value === undefined || boundedString(value, maxLength);
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === 'string';
}

function validUsage(value: unknown) {
  if (value === undefined) return true;
  if (!record(value)) return false;
  return (
    typeof value.inputTokens === 'number' &&
    Number.isFinite(value.inputTokens) &&
    typeof value.outputTokens === 'number' &&
    Number.isFinite(value.outputTokens) &&
    (value.totalTokens === undefined ||
      (typeof value.totalTokens === 'number' &&
        Number.isFinite(value.totalTokens)))
  );
}

function validToolCall(value: unknown): value is AiToolCall {
  if (!record(value)) return false;
  return (
    boundedString(value.id, 256) &&
    boundedString(value.name, 256) &&
    typeof value.arguments === 'string' &&
    (value.status === 'pending' ||
      value.status === 'running' ||
      value.status === 'completed' ||
      value.status === 'error') &&
    optionalString(value.result) &&
    (value.startedAt === undefined ||
      (typeof value.startedAt === 'number' &&
        Number.isFinite(value.startedAt))) &&
    (value.completedAt === undefined ||
      (typeof value.completedAt === 'number' &&
        Number.isFinite(value.completedAt))) &&
    (value.durationMs === undefined ||
      (typeof value.durationMs === 'number' &&
        Number.isFinite(value.durationMs) &&
        value.durationMs >= 0))
  );
}

function validSegment(value: unknown) {
  if (!record(value) || !boundedString(value.id, 256)) return false;
  if (value.type === 'tool') return validToolCall(value.call);
  if (value.type === 'image') {
    const attachment = value.attachment;
    return (
      record(attachment) &&
      boundedString(attachment.id, 256) &&
      boundedString(attachment.name, 512) &&
      isAiImageMimeType(attachment.mimeType) &&
      typeof attachment.size === 'number' &&
      Number.isSafeInteger(attachment.size) &&
      attachment.size > 0 &&
      typeof attachment.available === 'boolean' &&
      (attachment.available
        ? typeof attachment.dataUrl === 'string' &&
          attachment.dataUrl.startsWith(`data:${attachment.mimeType};base64,`)
        : attachment.dataUrl === undefined)
    );
  }
  if (value.type === 'text') {
    return typeof value.content === 'string';
  }
  if (value.type === 'reasoning') {
    return typeof value.content === 'string';
  }
  return false;
}

function validMessage(value: unknown): value is AiConversationMessage {
  if (!record(value)) return false;
  return (
    boundedString(value.id, 256) &&
    (value.role === 'user' || value.role === 'assistant') &&
    Array.isArray(value.segments) &&
    value.segments.every(validSegment) &&
    optionalBoundedString(value.finalSegmentId, 256) &&
    (value.finalSegmentId === undefined ||
      value.segments.some(
        (segment) =>
          record(segment) &&
          segment.type === 'text' &&
          segment.id === value.finalSegmentId,
      )) &&
    optionalBoundedString(value.model, 256) &&
    validUsage(value.usage) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    (value.status === 'complete' ||
      value.status === 'streaming' ||
      value.status === 'error') &&
    optionalString(value.error)
  );
}

function validTurnContext(value: unknown): value is StoredAssistantTurnContext {
  return (
    record(value) &&
    boundedString(value.messageId, 256) &&
    typeof value.content === 'string'
  );
}

function validConversation(
  value: unknown,
): value is StoredAssistantConversation {
  if (!record(value)) return false;
  return (
    boundedString(value.id, 256) &&
    boundedString(value.title, 256) &&
    optionalBoundedString(value.model, 256) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt) &&
    Array.isArray(value.messages) &&
    value.messages.every(validMessage) &&
    Array.isArray(value.turnContexts) &&
    value.turnContexts.every(validTurnContext) &&
    Array.isArray(value.input)
  );
}

function restoreConversation(
  value: StoredAssistantConversation,
): StoredAssistantConversation {
  const conversation: StoredAssistantConversation = {
    id: value.id,
    title: value.title,
    ...(value.model ? { model: value.model } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    messages: structuredClone(value.messages),
    turnContexts: structuredClone(value.turnContexts),
    input: structuredClone(value.input),
  };
  for (const message of conversation.messages) {
    for (const segment of message.segments) {
      if (
        segment.type !== 'tool' ||
        (segment.call.status !== 'pending' && segment.call.status !== 'running')
      ) {
        continue;
      }
      segment.call.status = 'error';
      segment.call.result = JSON.stringify({
        error: '工具执行因扩展后台重启而中断，最终状态无法确认。',
      });
      segment.call.completedAt = Date.now();
      segment.call.durationMs = Math.max(
        0,
        segment.call.completedAt -
          (segment.call.startedAt ?? segment.call.completedAt),
      );
    }
    if (message.status !== 'streaming') continue;
    message.status = 'error';
    message.error = '上一次 AI 请求因扩展后台重启而中断。';
  }
  if (conversation.input.length === 0) compactAssistantInput(conversation);
  return conversation;
}

export function normalizeAssistantState(value: unknown): StoredAssistantState {
  if (
    !record(value) ||
    value.version !== 1 ||
    !boundedString(value.activeConversationId, 256) ||
    !Array.isArray(value.conversations) ||
    !value.conversations.every(validConversation)
  ) {
    return emptyAssistantState();
  }
  const storedConversations =
    value.conversations as StoredAssistantConversation[];
  if (
    new Set(storedConversations.map((conversation) => conversation.id)).size !==
    storedConversations.length
  ) {
    return emptyAssistantState();
  }
  const conversations = storedConversations
    .map(restoreConversation)
    .filter((conversation) => conversation.messages.length > 0);
  if (conversations.length === 0) return emptyAssistantState();
  const storedActiveConversationId = value.activeConversationId as string;
  const activeConversationId = conversations.some(
    (conversation) => conversation.id === storedActiveConversationId,
  )
    ? storedActiveConversationId
    : [...conversations].sort(
        (left, right) => right.updatedAt - left.updatedAt,
      )[0].id;
  return {
    version: 1,
    activeConversationId,
    runningConversationId: null,
    conversations,
  };
}

export function activeAssistantConversation(state: StoredAssistantState) {
  const conversation = state.conversations.find(
    (candidate) => candidate.id === state.activeConversationId,
  );
  if (!conversation) {
    throw new Error('当前 AI 会话不存在。');
  }
  return conversation;
}

export function assistantConversation(
  state: StoredAssistantState,
  conversationId: string,
) {
  return (
    state.conversations.find(
      (conversation) => conversation.id === conversationId,
    ) ?? null
  );
}

export function trimAssistantState(state: StoredAssistantState) {
  for (const conversation of state.conversations) {
    const retainedMessageIds = new Set(
      conversation.messages.map((message) => message.id),
    );
    conversation.turnContexts = conversation.turnContexts.filter((context) =>
      retainedMessageIds.has(context.messageId),
    );
  }
}

export function prepareAssistantStateForPersistence(
  state: StoredAssistantState,
) {
  const persisted = structuredClone(state);
  persisted.runningConversationId = null;
  persisted.conversations = persisted.conversations.filter(
    (conversation) => conversation.messages.length > 0,
  );
  if (
    persisted.conversations.length > 0 &&
    !persisted.conversations.some(
      (conversation) => conversation.id === persisted.activeConversationId,
    )
  ) {
    persisted.activeConversationId = [...persisted.conversations].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    )[0].id;
  }
  trimAssistantState(persisted);
  return persisted;
}

function assistantHistoryContent(message: AiConversationMessage) {
  const tools = [
    ...new Set(
      message.segments.flatMap((segment) =>
        segment.type === 'tool'
          ? [`${segment.call.name}:${segment.call.status}`]
          : [],
      ),
    ),
  ];
  const content = message.segments
    .flatMap((segment) => (segment.type === 'text' ? [segment.content] : []))
    .join('\n\n');
  if (tools.length === 0) return content;
  return `${content}${
    content ? '\n\n' : ''
  }<tool_activity>${tools.join(', ')}</tool_activity>`;
}

function userHistoryContent(
  message: AiConversationMessage,
  context: string | undefined,
) {
  const content =
    context ??
    message.segments
      .flatMap((segment) => (segment.type === 'text' ? [segment.content] : []))
      .join('\n\n');
  const expiredImageCount = message.segments.filter(
    (segment) => segment.type === 'image' && !segment.attachment.available,
  ).length;
  if (expiredImageCount === 0) return content;
  return `${content}${
    content ? '\n\n' : ''
  }<expired_image_attachments>${expiredImageCount} 张图片需要重新附加</expired_image_attachments>`;
}

export function compactAssistantInput(
  conversation: StoredAssistantConversation,
) {
  if (conversation.input.length > 0) return;
  const contexts = new Map(
    conversation.turnContexts.map((context) => [
      context.messageId,
      context.content,
    ]),
  );
  conversation.input = conversation.messages.flatMap((message) =>
    message.segments.length > 0
      ? [
          message.role === 'assistant'
            ? {
                role: 'assistant' as const,
                content: assistantHistoryContent(message),
                toolCalls: [],
              }
            : {
                role: 'user' as const,
                content: userHistoryContent(message, contexts.get(message.id)),
                images: message.segments.flatMap((segment) =>
                  segment.type === 'image' &&
                  segment.attachment.available &&
                  segment.attachment.dataUrl
                    ? [
                        {
                          mimeType: segment.attachment.mimeType,
                          dataUrl: segment.attachment.dataUrl,
                        },
                      ]
                    : [],
                ),
              },
        ]
      : [],
  );
}

export function rememberAssistantTurnContext(
  conversation: StoredAssistantConversation,
  messageId: string,
  content: string,
) {
  conversation.turnContexts = [
    ...conversation.turnContexts.filter(
      (context) => context.messageId !== messageId,
    ),
    {
      messageId,
      content,
    },
  ];
}

export function titleAssistantConversation(
  conversation: StoredAssistantConversation,
  message: string,
) {
  if (
    conversation.title !== DEFAULT_CONVERSATION_TITLE ||
    conversation.messages.length > 0
  ) {
    return;
  }
  const title = message.replace(/\s+/g, ' ').trim();
  conversation.title = title.length > 34 ? `${title.slice(0, 34)}…` : title;
}

export function assistantSnapshot(
  state: StoredAssistantState,
): AiConversationSnapshot {
  const active = activeAssistantConversation(state);
  return {
    activeConversationId: active.id,
    conversations: state.conversations
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        model: conversation.model,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt),
    messages: structuredClone(active.messages),
    running: state.runningConversationId === active.id,
  };
}
