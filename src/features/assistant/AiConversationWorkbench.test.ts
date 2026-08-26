import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiConversationMessage } from '../../ai/domain/types';
import {
  AiConversationWorkbench,
  conversationMessageParts,
} from './AiConversationWorkbench';

afterEach(() => vi.unstubAllGlobals());

describe('卡牌大师智能体消息分组', () => {
  it('将最终回复之前的文本、推理和工具统一归入思考过程', () => {
    const message: AiConversationMessage = {
      id: 'assistant-message',
      role: 'assistant',
      segments: [
        { id: 'reasoning-1', type: 'reasoning', content: '先检查页面。' },
        { id: 'text-1', type: 'text', content: '我先读取页面结构。' },
        {
          id: 'tool-1',
          type: 'tool',
          call: {
            id: 'call-1',
            name: 'inspect_page',
            arguments: '{}',
            status: 'completed',
          },
        },
        { id: 'reasoning-2', type: 'reasoning', content: '整理工具结果。' },
        { id: 'final', type: 'text', content: '页面已经处理完成。' },
      ],
      finalSegmentId: 'final',
      createdAt: 1,
      status: 'complete',
    };

    const parts = conversationMessageParts(message);

    expect(parts.finalStarted).toBe(true);
    expect(parts.thoughtSegments.map((segment) => segment.id)).toEqual([
      'reasoning-1',
      'text-1',
      'tool-1',
      'reasoning-2',
    ]);
    expect(parts.finalSegments.map((segment) => segment.id)).toEqual(['final']);
  });

  it('在最终回复开始前保持完整思考时间线展开', () => {
    const message: AiConversationMessage = {
      id: 'streaming-message',
      role: 'assistant',
      segments: [
        { id: 'reasoning', type: 'reasoning', content: '正在分析。' },
        {
          id: 'tool',
          type: 'tool',
          call: {
            id: 'call',
            name: 'query_dom',
            arguments: '{}',
            status: 'running',
          },
        },
      ],
      createdAt: 1,
      status: 'streaming',
    };

    const parts = conversationMessageParts(message);

    expect(parts.finalStarted).toBe(false);
    expect(parts.thoughtSegments).toHaveLength(2);
    expect(parts.finalSegments).toHaveLength(0);
  });
});

describe('卡牌大师智能体平台能力', () => {
  it('在不支持后台语音的平台完全移除对话输入语音按钮', () => {
    vi.stubGlobal('navigator', { mediaDevices: undefined });

    const markup = renderToStaticMarkup(
      createElement(AiConversationWorkbench, {
        snapshot: {
          activeConversationId: '',
          conversations: [],
          messages: [],
          running: false,
        },
        speechCapability: {
          available: false,
          title: 'Safari 暂不支持语音输入',
          message: '请使用 Chrome、Edge 等 Chromium 浏览器。',
        },
        userscriptCapability: null,
        onSend: () => undefined,
        onCancel: () => undefined,
        onCreateConversation: () => undefined,
        onSelectConversation: () => undefined,
        onRenameConversation: () => undefined,
        onDeleteConversation: () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="对话内容"');
    expect(markup).toContain('aria-label="附加参考图片"');
    expect(markup).not.toContain('aria-label="开始语音输入"');
    expect(markup).not.toContain('aria-label="停止语音输入"');
    expect(markup).not.toContain('>语音识别<');
  });

  it('显示实际模型 ID，但不展示其他内部编号、文件名或工具原始结果', () => {
    vi.stubGlobal('navigator', { mediaDevices: undefined });

    const markup = renderToStaticMarkup(
      createElement(AiConversationWorkbench, {
        snapshot: {
          activeConversationId: 'conversation-internal-id',
          conversations: [
            {
              id: 'conversation-internal-id',
              title: '测试会话',
              model: 'deepseek-v4-flash',
              createdAt: 1,
              updatedAt: 1,
              messageCount: 2,
            },
          ],
          messages: [
            {
              id: 'user-internal-id',
              role: 'user',
              segments: [
                {
                  id: 'image-internal-id',
                  type: 'image',
                  attachment: {
                    id: 'attachment-internal-id',
                    name: 'private-upload-name.png',
                    mimeType: 'image/png',
                    size: 12,
                    available: true,
                    dataUrl: 'data:image/png;base64,aGVsbG8=',
                  },
                },
              ],
              createdAt: 1,
              status: 'complete',
            },
            {
              id: 'assistant-internal-id',
              role: 'assistant',
              model: 'deepseek-v4-flash-20260806',
              segments: [
                {
                  id: 'reasoning-internal-id',
                  type: 'reasoning',
                  content:
                    '内部分析：使用标签页 ID 42 和 requestId=reasoning-secret。',
                },
                {
                  id: 'tool-internal-id',
                  type: 'tool',
                  call: {
                    id: 'call-internal-id',
                    name: 'query_dom',
                    arguments: '{"selector":"body","limit":50}',
                    result: '{"tabId":42,"requestId":"secret"}',
                    durationMs: 1_234,
                    status: 'completed',
                  },
                },
                {
                  id: 'final',
                  type: 'text',
                  content: '页面已经处理完成。',
                },
              ],
              finalSegmentId: 'final',
              error: 'AI 服务请求失败（HTTP 500）：internal requestId=secret',
              createdAt: 2,
              status: 'error',
            },
          ],
          running: false,
        },
        error: 'AI 会话后台未确认请求。 requestId=surface-secret',
        attachedPage: {
          tabId: 42,
          windowId: 7,
          title: '示例页面',
          url: 'https://example.com/private/path',
          active: true,
          available: true,
        },
        speechCapability: {
          available: false,
          title: 'Safari 暂不支持语音输入',
          message: '请使用 Chrome、Edge 等 Chromium 浏览器。',
        },
        userscriptCapability: null,
        onSend: () => undefined,
        onCancel: () => undefined,
        onCreateConversation: () => undefined,
        onSelectConversation: () => undefined,
        onRenameConversation: () => undefined,
        onDeleteConversation: () => undefined,
      }),
    );

    expect(markup).toContain('示例页面');
    expect(markup).toContain('参考图片');
    expect(markup).toContain('查找页面内容');
    expect(markup).toContain('deepseek-v4-flash-20260806');
    expect(markup).not.toContain('>deepseek-v4-flash<');
    expect(markup).not.toContain('标签页 42');
    expect(markup).not.toContain('private-upload-name.png');
    expect(markup).not.toContain('requestId');
    expect(markup).not.toContain('内部分析');
    expect(markup).not.toContain('&quot;tabId&quot;');
    expect(markup).not.toContain('HTTP 500');
    expect(markup).not.toContain('1234');
  });
});
