import type {
  AiConversationMessage,
  AiConversationSnapshot,
  AiImageAttachment,
  AssistantTabTargetState,
} from '../../ai/domain/types';
import { isAiImageMimeType } from '../../ai/domain/types';

const AI_ASSISTANT_PORT_PREFIX = 'card-master:assistant:';

export function assistantPortName(tabId: number) {
  if (!Number.isSafeInteger(tabId) || tabId < 0) {
    throw new Error('AI 会话缺少有效的标签页身份。');
  }
  return `${AI_ASSISTANT_PORT_PREFIX}${tabId}`;
}

export function parseAssistantPortName(name: string) {
  if (!name.startsWith(AI_ASSISTANT_PORT_PREFIX)) return null;
  const tabId = Number(name.slice(AI_ASSISTANT_PORT_PREFIX.length));
  return Number.isSafeInteger(tabId) && tabId >= 0 ? tabId : null;
}

export type AiAssistantPortRequestPayload =
  | { type: 'read' }
  | { type: 'create' }
  | { type: 'cancel' }
  | { type: 'heartbeat' }
  | { type: 'select'; conversationId: string }
  | { type: 'rename'; conversationId: string; title: string }
  | { type: 'delete'; conversationId: string }
  | {
      type: 'send';
      message: string;
      images?: readonly AiImageAttachment[];
    };

export type AiAssistantPortRequest = AiAssistantPortRequestPayload & {
  requestId: string;
};

export type AiAssistantPortEvent =
  | {
      type: 'snapshot';
      snapshot: AiConversationSnapshot;
    }
  | {
      type: 'message';
      activeConversationId: string;
      message: AiConversationMessage;
      running: boolean;
    }
  | {
      type: 'received';
      requestId: string;
    }
  | {
      type: 'target';
      target: AssistantTabTargetState;
    }
  | {
      type: 'ack';
      requestId: string;
      error?: string;
    };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validImageAttachment(value: unknown) {
  if (!record(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 256 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= 512 &&
    typeof value.mimeType === 'string' &&
    isAiImageMimeType(value.mimeType) &&
    typeof value.size === 'number' &&
    Number.isSafeInteger(value.size) &&
    value.size > 0 &&
    value.available === true &&
    typeof value.dataUrl === 'string' &&
    value.dataUrl.length > 0 &&
    value.dataUrl.startsWith(`data:${value.mimeType};base64,`)
  );
}

export function aiAssistantPortRequest(
  value: unknown,
): value is AiAssistantPortRequest {
  if (
    !record(value) ||
    typeof value.requestId !== 'string' ||
    value.requestId.length === 0 ||
    value.requestId.length > 256
  ) {
    return false;
  }
  switch (value.type) {
    case 'read':
    case 'create':
    case 'cancel':
    case 'heartbeat':
      return true;
    case 'select':
    case 'delete':
      return (
        typeof value.conversationId === 'string' &&
        value.conversationId.length > 0 &&
        value.conversationId.length <= 256
      );
    case 'rename':
      return (
        typeof value.conversationId === 'string' &&
        value.conversationId.length > 0 &&
        value.conversationId.length <= 256 &&
        typeof value.title === 'string' &&
        value.title.trim().length > 0 &&
        value.title.length <= 256
      );
    case 'send':
      return (
        typeof value.message === 'string' &&
        value.message.trim().length > 0 &&
        (value.images === undefined ||
          (Array.isArray(value.images) &&
            value.images.every(validImageAttachment)))
      );
    default:
      return false;
  }
}
