import type {
  AiConversationMessage,
  AiConversationSegment,
  AiToolCall,
} from '../../ai/domain/types';
import type { AiModelToolCall } from '../../ai/infrastructure/model-client';

export function conversationSegmentContentLength(
  message: AiConversationMessage,
  type: 'text' | 'reasoning',
) {
  return message.segments.reduce(
    (total, segment) =>
      segment.type === type ? total + segment.content.length : total,
    0,
  );
}

export function appendConversationSegment(
  message: AiConversationMessage,
  type: 'text' | 'reasoning',
  delta: string,
) {
  if (!delta) return undefined;
  const last = message.segments.at(-1);
  if (last?.type === type) {
    last.content += delta;
    return last;
  }
  const segment = {
    id: crypto.randomUUID(),
    type,
    content: delta,
  } as Extract<AiConversationSegment, { type: typeof type }>;
  message.segments.push(segment);
  return segment;
}

export function appendConversationSegmentBoundary(
  message: AiConversationMessage,
  type: 'text' | 'reasoning',
) {
  const last = message.segments.at(-1);
  if (last?.type !== type || !last.content) return undefined;
  const separator = last.content.endsWith('\n\n')
    ? ''
    : last.content.endsWith('\n')
      ? '\n'
      : '\n\n';
  return separator ? appendConversationSegment(message, type, separator) : last;
}

export function upsertConversationToolSegment(
  message: AiConversationMessage,
  item: AiModelToolCall,
) {
  const existing = message.segments.find(
    (segment): segment is Extract<AiConversationSegment, { type: 'tool' }> =>
      segment.type === 'tool' && segment.call.id === item.id,
  );
  if (existing) {
    existing.call.name = item.name || existing.call.name;
    existing.call.arguments = item.arguments;
    return existing.call;
  }
  const call: AiToolCall = {
    id: item.id,
    name: item.name,
    arguments: item.arguments,
    status: 'pending',
    startedAt: Date.now(),
  };
  message.segments.push({
    id: crypto.randomUUID(),
    type: 'tool',
    call,
  });
  return call;
}

export function startConversationToolCall(
  call: AiToolCall,
  now: number = Date.now(),
) {
  call.status = 'running';
  call.startedAt ??= now;
  delete call.completedAt;
  delete call.durationMs;
}

export function completeConversationToolCall(
  call: AiToolCall,
  now: number = Date.now(),
) {
  call.completedAt = now;
  call.durationMs = Math.max(
    0,
    call.completedAt - (call.startedAt ?? call.completedAt),
  );
}
