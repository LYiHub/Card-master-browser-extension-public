import { describe, expect, it } from 'vitest';

import {
  activeAssistantConversation,
  compactAssistantInput,
  createStoredAssistantConversation,
  emptyAssistantState,
  normalizeAssistantState,
  prepareAssistantStateForPersistence,
  rememberAssistantTurnContext,
} from './assistant-state';

describe('AI 会话状态', () => {
  it('不会主动压缩已经建立的模型输入历史', () => {
    const source = '/* 完整私有脚本源码 */';
    const state = emptyAssistantState('gpt-5.5');
    const conversation = activeAssistantConversation(state);
    rememberAssistantTurnContext(
      conversation,
      'user-1',
      '<page_context>URL: https://example.com</page_context>\n<user_message>创建页面辅助脚本。</user_message>',
    );
    conversation.messages.push(
      {
        id: 'user-1',
        role: 'user',
        segments: [
          {
            id: 'user-text',
            type: 'text',
            content: '创建页面辅助脚本。',
          },
        ],
        createdAt: 1,
        status: 'complete',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        segments: [
          {
            id: 'assistant-text',
            type: 'text',
            content: '脚本已经写入并同步。',
          },
          {
            id: 'assistant-tool',
            type: 'tool',
            call: {
              id: 'call-1',
              name: 'create_userscript',
              arguments: JSON.stringify({ source }),
              result: JSON.stringify({ source }),
              status: 'completed',
            },
          },
        ],
        createdAt: 2,
        status: 'complete',
      },
    );
    conversation.input.push({
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call-1',
          name: 'create_userscript',
          arguments: JSON.stringify({ source }),
        },
      ],
    });

    compactAssistantInput(conversation);

    const serialized = JSON.stringify(conversation.input);
    expect(serialized).toContain(source);
    expect(conversation.input).toHaveLength(1);
  });

  it('持久化完整的工具参数和结果', () => {
    const state = emptyAssistantState('gpt-5.5');
    const conversation = activeAssistantConversation(state);
    const argumentsText = JSON.stringify({ source: 'a'.repeat(8_000) });
    const resultText = JSON.stringify({ output: 'b'.repeat(8_000) });
    conversation.messages.push({
      id: 'assistant-tool-result',
      role: 'assistant',
      segments: [
        {
          id: 'tool-segment',
          type: 'tool',
          call: {
            id: 'call-complete',
            name: 'read_userscript',
            arguments: argumentsText,
            result: resultText,
            status: 'completed',
          },
        },
      ],
      createdAt: 1,
      status: 'complete',
    });

    const persisted = prepareAssistantStateForPersistence(state);
    const segment =
      activeAssistantConversation(persisted).messages[0]?.segments[0];
    expect(segment?.type).toBe('tool');
    if (segment?.type !== 'tool') throw new Error('工具片段不存在。');
    expect(segment.call.arguments).toBe(argumentsText);
    expect(segment.call.result).toBe(resultText);
  });

  it('持久化时剔除空会话并回退到最近的有效会话', () => {
    const state = emptyAssistantState('gpt-5.5');
    const blank = activeAssistantConversation(state);
    blank.updatedAt = 3;
    const saved = createStoredAssistantConversation('gpt-5.5', 2, 'saved');
    saved.messages.push({
      id: 'user-message',
      role: 'user',
      segments: [{ id: 'text', type: 'text', content: '已经发送' }],
      createdAt: 2,
      status: 'complete',
    });
    state.conversations.push(saved);

    const persisted = prepareAssistantStateForPersistence(state);

    expect(
      persisted.conversations.map((conversation) => conversation.id),
    ).toEqual(['saved']);
    expect(persisted.activeConversationId).toBe('saved');
  });

  it('拒绝非首发版本的会话结构', () => {
    const restored = normalizeAssistantState({
      version: 2,
      activeConversationId: 'legacy',
      conversations: [],
    });

    expect(restored.version).toBe(1);
    expect(restored.conversations).toHaveLength(1);
  });

  it('恢复有效会话、剔除空草稿并将中断的流标记为错误', () => {
    const state = emptyAssistantState('deepseek-v4-flash');
    const interrupted = activeAssistantConversation(state);
    interrupted.messages.push({
      id: 'assistant-1',
      role: 'assistant',
      segments: [
        {
          id: 'reasoning',
          type: 'reasoning',
          content: '部分思考',
        },
      ],
      createdAt: 1,
      status: 'streaming',
    });
    interrupted.input.push({
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call-1',
          name: 'create_userscript',
          arguments: '{"source":"不得保留"}',
        },
      ],
    });
    state.conversations.push(
      createStoredAssistantConversation('gpt-5.6-terra', 2),
    );
    state.runningConversationId = interrupted.id;

    const restored = normalizeAssistantState(state);
    const restoredInterrupted = restored.conversations.find(
      (conversation) => conversation.id === interrupted.id,
    );
    const restoredMessage = restoredInterrupted?.messages[0];

    expect(restored.runningConversationId).toBeNull();
    expect(restored.conversations).toHaveLength(1);
    expect(restoredMessage).toMatchObject({
      status: 'error',
      error: '上一次 AI 请求因扩展后台重启而中断。',
    });
    expect(restoredMessage?.segments).toEqual([
      {
        id: 'reasoning',
        type: 'reasoning',
        content: '部分思考',
      },
    ]);
    expect(JSON.stringify(restoredInterrupted?.input)).toContain('不得保留');
  });

  it('后台重启后将未完成工具标记为状态未知', () => {
    const state = emptyAssistantState('gpt-5.5');
    const conversation = activeAssistantConversation(state);
    conversation.messages.push({
      id: 'assistant-tool',
      role: 'assistant',
      segments: [
        {
          id: 'tool-segment',
          type: 'tool',
          call: {
            id: 'tool-call',
            name: 'create_userscript',
            arguments: '{}',
            status: 'running',
            result: '{"status":"pending"}',
            startedAt: 10,
          },
        },
        {
          id: 'final-text',
          type: 'text',
          content: '操作仍在后台执行。',
        },
      ],
      finalSegmentId: 'final-text',
      createdAt: 1,
      status: 'complete',
    });

    const restored = normalizeAssistantState(state);
    const tool = restored.conversations[0]?.messages[0]?.segments[0];

    expect(tool).toMatchObject({
      type: 'tool',
      call: {
        status: 'error',
        result: expect.stringContaining('最终状态无法确认'),
        completedAt: expect.any(Number),
        durationMs: expect.any(Number),
      },
    });
  });

  it('持久化时完整保留长会话历史', () => {
    const state = emptyAssistantState('gpt-5.5');
    const conversation = activeAssistantConversation(state);
    for (let index = 0; index < 80; index += 1) {
      conversation.messages.push({
        id: `message-${index}`,
        role: index % 2 === 0 ? 'user' : 'assistant',
        segments: [
          {
            id: `text-${index}`,
            type: 'text',
            content: `${index}:${'x'.repeat(96 * 1024)}`,
          },
        ],
        createdAt: index,
        status: 'complete',
      });
    }

    const persisted = prepareAssistantStateForPersistence(state);
    expect(activeAssistantConversation(persisted).messages).toHaveLength(80);
    expect(
      activeAssistantConversation(persisted).messages[0]?.segments[0],
    ).toMatchObject({
      type: 'text',
      content: `0:${'x'.repeat(96 * 1024)}`,
    });
  });

  it('持久化时完整保留图片附件', () => {
    const state = emptyAssistantState('gpt-5.5');
    const conversation = activeAssistantConversation(state);
    conversation.messages.push({
      id: 'user-image',
      role: 'user',
      segments: [
        {
          id: 'image',
          type: 'image',
          attachment: {
            id: 'attachment',
            name: '页面截图.png',
            mimeType: 'image/png',
            size: 12,
            available: true,
            dataUrl: 'data:image/png;base64,aGVsbG8=',
          },
        },
      ],
      createdAt: 1,
      status: 'complete',
    });

    const persisted = prepareAssistantStateForPersistence(state);
    const segment =
      activeAssistantConversation(persisted).messages[0]?.segments[0];

    expect(segment?.type).toBe('image');
    if (segment?.type !== 'image') throw new Error('图片片段不存在。');
    expect(segment.attachment).toMatchObject({
      name: '页面截图.png',
      size: 12,
      available: true,
      dataUrl: 'data:image/png;base64,aGVsbG8=',
    });
  });

  it('恢复后的模型历史明确标记已经失效的图片', () => {
    const state = emptyAssistantState('gpt-5.5');
    const conversation = activeAssistantConversation(state);
    rememberAssistantTurnContext(
      conversation,
      'user-image',
      '<page_context>URL: https://example.com</page_context>\n<user_message>检查截图。</user_message>',
    );
    conversation.messages.push({
      id: 'user-image',
      role: 'user',
      segments: [
        {
          id: 'text',
          type: 'text',
          content: '检查截图。',
        },
        {
          id: 'image',
          type: 'image',
          attachment: {
            id: 'attachment',
            name: '页面截图.png',
            mimeType: 'image/png',
            size: 12,
            available: false,
          },
        },
      ],
      createdAt: 1,
      status: 'complete',
    });

    compactAssistantInput(conversation);

    expect(JSON.stringify(conversation.input)).toContain(
      '<expired_image_attachments>1 张图片需要重新附加</expired_image_attachments>',
    );
    expect(JSON.stringify(conversation.input)).not.toContain('页面截图.png');
  });
});
