import { describe, expect, it } from 'vitest';

import type { AiConversationMessage } from '../../ai/domain/types';
import {
  appendConversationSegment,
  appendConversationSegmentBoundary,
  completeConversationToolCall,
  startConversationToolCall,
  upsertConversationToolSegment,
} from './assistant-timeline';

describe('AI 会话时间线', () => {
  it('用 Markdown 段落分隔连续的推理摘要', () => {
    const message: AiConversationMessage = {
      id: 'message',
      role: 'assistant',
      segments: [],
      createdAt: 1,
      status: 'streaming',
    };

    appendConversationSegment(message, 'reasoning', '**检查页面结构**');
    appendConversationSegmentBoundary(message, 'reasoning');
    appendConversationSegment(message, 'reasoning', '**规划元素隐藏**');

    expect(message.segments).toHaveLength(1);
    expect(message.segments[0]).toMatchObject({
      type: 'reasoning',
      content: '**检查页面结构**\n\n**规划元素隐藏**',
    });
  });

  it('严格保留思考、工具和正文的到达顺序', () => {
    const message: AiConversationMessage = {
      id: 'message',
      role: 'assistant',
      segments: [],
      createdAt: 1,
      status: 'streaming',
    };

    appendConversationSegment(message, 'reasoning', '思考 1');
    upsertConversationToolSegment(message, {
      id: 'tool-1',
      name: 'inspect_page',
      arguments: '{}',
    });
    appendConversationSegment(message, 'text', '正文 1');
    appendConversationSegment(message, 'reasoning', '思考 2');
    upsertConversationToolSegment(message, {
      id: 'tool-2',
      name: 'query_dom',
      arguments: '{"selector":"main","limit":1}',
    });
    appendConversationSegment(message, 'text', '最终正文');

    expect(message.segments.map((segment) => segment.type)).toEqual([
      'reasoning',
      'tool',
      'text',
      'reasoning',
      'tool',
      'text',
    ]);
    expect(message.segments.at(-1)).toMatchObject({
      type: 'text',
      content: '最终正文',
    });
  });

  it('工具流式增量只更新首次出现的位置', () => {
    const message: AiConversationMessage = {
      id: 'message',
      role: 'assistant',
      segments: [],
      createdAt: 1,
      status: 'streaming',
    };

    const first = upsertConversationToolSegment(message, {
      id: 'tool',
      name: 'create_userscript',
      arguments: '{"source":"',
    });
    appendConversationSegment(message, 'reasoning', '继续检查');
    const updated = upsertConversationToolSegment(message, {
      id: 'tool',
      name: 'create_userscript',
      arguments: '{"source":"完整源码"}',
    });

    expect(message.segments.map((segment) => segment.type)).toEqual([
      'tool',
      'reasoning',
    ]);
    expect(message.segments[0]).toMatchObject({
      type: 'tool',
      call: {
        id: 'tool',
        arguments: '{"source":"完整源码"}',
        startedAt: first.startedAt,
      },
    });
    expect(updated).toBe(first);
  });

  it('从工具首次出现开始累计完整调用耗时', () => {
    const message: AiConversationMessage = {
      id: 'message',
      role: 'assistant',
      segments: [],
      createdAt: 1,
      status: 'streaming',
    };
    const call = upsertConversationToolSegment(message, {
      id: 'tool',
      name: 'create_userscript',
      arguments: '{"source":"',
    });
    call.startedAt = 100;

    startConversationToolCall(call, 350);
    completeConversationToolCall(call, 900);

    expect(call).toMatchObject({
      status: 'running',
      startedAt: 100,
      completedAt: 900,
      durationMs: 800,
    });
  });
});
