import { describe, expect, it, vi } from 'vitest';

import type { ExtensionApi, ExtensionPort } from './api';
import {
  ASSISTANT_HEARTBEAT_INTERVAL_MS,
  ExtensionAssistantController,
} from './assistant';

function event<Listener extends (...args: never[]) => void>() {
  const listeners = new Set<Listener>();
  return {
    addListener: (listener: Listener) => listeners.add(listener),
    emit: (...args: Parameters<Listener>) => {
      for (const listener of listeners) listener(...args);
    },
  };
}

function port() {
  const onMessage = event<(message: unknown) => void>();
  const onDisconnect = event<() => void>();
  const postMessage = vi.fn();
  const value = {
    disconnect: vi.fn(() => onDisconnect.emit()),
    onDisconnect,
    onMessage,
    postMessage,
  } as unknown as ExtensionPort;
  return { onDisconnect, onMessage, postMessage, value };
}

describe('ExtensionAssistantController', () => {
  it('retries an unacknowledged request with the same id after reconnect', async () => {
    vi.useFakeTimers();
    try {
      const first = port();
      const second = port();
      const connect = vi
        .fn()
        .mockReturnValueOnce(first.value)
        .mockReturnValue(second.value);
      const controller = new ExtensionAssistantController(
        {
          runtime: { connect },
        } as unknown as ExtensionApi,
        7,
      );

      const creating = controller.createConversation();
      const firstRequest = first.postMessage.mock.calls[0]?.[0] as
        | { requestId?: string; type?: string }
        | undefined;
      expect(firstRequest).toMatchObject({ type: 'create' });
      expect(firstRequest?.requestId).toBeTypeOf('string');
      if (!firstRequest?.requestId) {
        throw new Error('Expected a generated assistant request id.');
      }

      first.onDisconnect.emit();
      await vi.advanceTimersByTimeAsync(0);

      expect(second.postMessage).toHaveBeenCalledWith(firstRequest);
      second.onMessage.emit({
        type: 'ack',
        requestId: firstRequest.requestId,
      });
      await expect(creating).resolves.toBeUndefined();
      expect(connect).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reject or resend a received request while background work continues', async () => {
    vi.useFakeTimers();
    try {
      const connected = port();
      const connect = vi.fn(() => connected.value);
      const controller = new ExtensionAssistantController(
        {
          runtime: { connect },
        } as unknown as ExtensionApi,
        7,
      );

      const creating = controller.createConversation();
      const request = connected.postMessage.mock.calls[0]?.[0] as
        | { requestId?: string; type?: string }
        | undefined;
      if (!request?.requestId) {
        throw new Error('Expected a generated assistant request id.');
      }
      const settled = vi.fn();
      void creating.then(
        () => settled('resolved'),
        () => settled('rejected'),
      );

      connected.onMessage.emit({
        type: 'received',
        requestId: request.requestId,
      });
      await vi.advanceTimersByTimeAsync(10_000);

      expect(settled).not.toHaveBeenCalled();
      expect(connect).toHaveBeenCalledOnce();
      expect(connected.postMessage).toHaveBeenCalledOnce();
      expect(connected.value.disconnect).not.toHaveBeenCalled();

      connected.onMessage.emit({
        type: 'ack',
        requestId: request.requestId,
      });
      await expect(creating).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('按原位顺序合并流式消息片段', () => {
    const connected = port();
    const controller = new ExtensionAssistantController(
      {
        runtime: {
          connect: vi.fn(() => connected.value),
        },
      } as unknown as ExtensionApi,
      7,
    );
    const snapshots: string[][] = [];
    controller.subscribe((snapshot) => {
      snapshots.push(
        snapshot.messages[0]?.segments.map((segment) => segment.type) ?? [],
      );
    });
    connected.onMessage.emit({
      type: 'snapshot',
      snapshot: {
        activeConversationId: 'conversation',
        conversations: [],
        messages: [],
        running: true,
      },
    });
    connected.onMessage.emit({
      type: 'message',
      activeConversationId: 'conversation',
      message: {
        id: 'assistant',
        role: 'assistant',
        segments: [
          {
            id: 'reasoning',
            type: 'reasoning',
            content: '先检查页面',
          },
          {
            id: 'tool',
            type: 'tool',
            call: {
              id: 'call',
              name: 'inspect_page',
              arguments: '{}',
              status: 'completed',
              result: '{}',
            },
          },
          {
            id: 'text',
            type: 'text',
            content: '已经完成',
          },
        ],
        createdAt: 1,
        status: 'streaming',
      },
      running: true,
    });

    expect(snapshots.at(-1)).toEqual(['reasoning', 'tool', 'text']);
  });

  it('后台端口断开时立即结束前端的假运行状态', () => {
    const connected = port();
    const controller = new ExtensionAssistantController(
      {
        runtime: {
          connect: vi.fn(() => connected.value),
        },
      } as unknown as ExtensionApi,
      7,
    );
    const snapshots: Array<{
      running: boolean;
      status?: string;
      error?: string;
    }> = [];
    controller.subscribe((snapshot) => {
      snapshots.push({
        running: snapshot.running,
        status: snapshot.messages.at(-1)?.status,
        error: snapshot.messages.at(-1)?.error,
      });
    });
    connected.onMessage.emit({
      type: 'snapshot',
      snapshot: {
        activeConversationId: 'conversation',
        conversations: [],
        messages: [
          {
            id: 'assistant',
            role: 'assistant',
            segments: [],
            createdAt: 1,
            status: 'streaming',
          },
        ],
        running: true,
      },
    });

    connected.onDisconnect.emit();

    expect(snapshots.at(-1)).toEqual({
      running: false,
      status: 'error',
      error: 'AI 请求因扩展后台重新加载或连接中断而停止。',
    });
    controller.dispose();
  });

  it('仅在 AI 运行期间向后台发送心跳', async () => {
    vi.useFakeTimers();
    try {
      const connected = port();
      const controller = new ExtensionAssistantController(
        {
          runtime: {
            connect: vi.fn(() => connected.value),
          },
        } as unknown as ExtensionApi,
        7,
      );
      controller.subscribe(() => undefined);
      connected.onMessage.emit({
        type: 'snapshot',
        snapshot: {
          activeConversationId: 'conversation',
          conversations: [],
          messages: [],
          running: true,
        },
      });

      await vi.advanceTimersByTimeAsync(ASSISTANT_HEARTBEAT_INTERVAL_MS);
      expect(connected.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'heartbeat' }),
      );
      const heartbeatCount = connected.postMessage.mock.calls.filter(
        ([message]) =>
          (message as { type?: string } | undefined)?.type === 'heartbeat',
      ).length;

      connected.onMessage.emit({
        type: 'snapshot',
        snapshot: {
          activeConversationId: 'conversation',
          conversations: [],
          messages: [],
          running: false,
        },
      });
      await vi.advanceTimersByTimeAsync(ASSISTANT_HEARTBEAT_INTERVAL_MS * 2);
      expect(
        connected.postMessage.mock.calls.filter(
          ([message]) =>
            (message as { type?: string } | undefined)?.type === 'heartbeat',
        ),
      ).toHaveLength(heartbeatCount);
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('publishes background target changes to surface listeners', () => {
    const connected = port();
    const controller = new ExtensionAssistantController(
      {
        runtime: {
          connect: vi.fn(() => connected.value),
        },
      } as unknown as ExtensionApi,
      7,
      {
        tabId: 7,
        title: 'Initial',
        url: 'https://example.com/7',
        active: true,
        available: true,
      },
    );
    const listener = vi.fn();

    controller.subscribeTarget(listener);
    connected.onMessage.emit({
      type: 'target',
      target: {
        tabId: 11,
        windowId: 2,
        title: 'Selected',
        url: 'https://example.com/11',
        active: false,
        available: true,
      },
    });

    expect(listener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tabId: 7 }),
    );
    expect(listener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tabId: 11, title: 'Selected' }),
    );
    controller.dispose();
  });
});
