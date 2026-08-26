import { describe, expect, it, vi } from 'vitest';

import type {
  AiConversationMessage,
  AiConversationSegment,
  AiServicesConfigView,
} from '../../ai/domain/types';
import type {
  AiModelClient,
  AiModelStreamCallbacks,
  AiModelStreamRequest,
} from '../../ai/infrastructure/model-client';
import {
  queryInstalledUserscripts,
  type TransactionalScriptRepository,
} from '../../userscript/application/script-repository';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import type { ExtensionBackgroundApi, ExtensionPort } from './api';
import { assistantPortName } from './assistant-protocol';
import {
  type AssistantToolPlatform,
  ExtensionAssistantService,
} from './assistant-service';
import { AI_CONVERSATION_STORAGE_KEY } from './assistant-state';

function extensionEvent<T extends (...args: never[]) => void>() {
  const listeners = new Set<T>();
  return {
    addListener: (listener: T) => listeners.add(listener),
    emit: (...args: Parameters<T>) => {
      for (const listener of listeners) listener(...args);
    },
  };
}

function port(documentId: string) {
  const onMessage = extensionEvent<(message: unknown) => void>();
  const onDisconnect = extensionEvent<() => void>();
  const postMessage = vi.fn();
  return {
    value: {
      name: assistantPortName(7),
      sender: {
        tab: { id: 7 },
        frameId: 0,
        documentId,
      },
      onMessage,
      onDisconnect,
      postMessage,
      disconnect: vi.fn(),
    } as unknown as ExtensionPort,
    onMessage,
    onDisconnect,
    postMessage,
  };
}

function repository(): TransactionalScriptRepository {
  let scripts = structuredClone(INITIAL_USERSCRIPTS);
  return {
    list: async () => structuredClone(scripts),
    get: async (scriptId) =>
      structuredClone(scripts.find((script) => script.id === scriptId) ?? null),
    query: async (options) => queryInstalledUserscripts(scripts, options),
    upsert: async (script) => {
      scripts = scripts.some((item) => item.id === script.id)
        ? scripts.map((item) => (item.id === script.id ? script : item))
        : [...scripts, script];
      return structuredClone(scripts);
    },
    remove: async () => structuredClone(scripts),
    reorder: async () => structuredClone(scripts),
    replaceAll: async (next) => {
      scripts = structuredClone([...next]);
      return structuredClone(scripts);
    },
    transact: async (operation) => {
      const current = structuredClone(scripts);
      const transaction = await operation(current);
      const committed = transaction.scripts !== current;
      if (committed) scripts = structuredClone([...transaction.scripts]);
      return {
        scripts: structuredClone(scripts),
        result: transaction.result,
        committed,
      };
    },
    subscribe: () => () => undefined,
  };
}

function provider(client: AiModelClient) {
  const view: AiServicesConfigView = {
    modelService: {
      baseUrl: 'https://example.com/v1',
      model: 'gpt-5.5',
      protocol: 'responses',
      reasoningEffort: 'medium',
      hasCredential: true,
    },
    imageService: {
      credentialSource: 'model-service',
      protocol: 'openai-images',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-image-2',
      hasCredential: true,
    },
    speechService: { hasCredential: true },
  };
  return {
    readView: async () => structuredClone(view),
    openModelSession: async () => ({
      view: structuredClone(view),
      client,
    }),
  };
}

const page = {
  url: 'https://example.com/',
  title: 'Example',
  language: 'en',
  selectedText: '',
  visibleText: 'Example page',
};

function toolPlatform(
  overrides: Partial<AssistantToolPlatform> = {},
): AssistantToolPlatform {
  return {
    readRuntimeStates: async () => [],
    readRuntimeState: async () => undefined,
    invokeRuntimeCommand: async () => undefined,
    readPageUrl: async () => page.url,
    setDeckVisibility: async () => undefined,
    ...overrides,
  };
}

function assistantService(api: ExtensionBackgroundApi, client: AiModelClient) {
  return new ExtensionAssistantService(
    api,
    repository(),
    provider(client),
    vi.fn(async () => ({
      injection: {
        eligible: 1,
        attempted: 1,
        succeeded: 1,
        failed: 0,
      },
      refreshRequired: false,
      reloadRequested: false,
      executions: [
        {
          status: 'ready' as const,
          url: page.url,
          completedAt: Date.now(),
        },
      ],
    })),
    vi.fn(async (tabId: number) => ({
      context: page,
      target: { tabId, frameId: 0, documentId: 'document-current' },
    })),
    toolPlatform(),
  );
}

describe('extension assistant service lifecycle', () => {
  it('acknowledges receipt before slow conversation persistence completes', async () => {
    let releaseStorage: (() => void) | undefined;
    const set = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseStorage = resolve;
        }),
    );
    const stream = vi.fn(
      (
        _request: unknown,
        _callbacks: unknown,
        signal: AbortSignal | undefined,
      ) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set,
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const service = assistantService(api, {
      stream,
      completeUserscriptRequest: vi.fn(),
    } as unknown as AiModelClient);
    const connected = port('document-slow-storage');
    service.connect(connected.value, 7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-slow-storage',
      message: 'slow',
    });

    expect(connected.postMessage).toHaveBeenCalledWith({
      type: 'received',
      requestId: 'send-slow-storage',
    });
    expect(
      connected.postMessage.mock.calls.some(
        ([event]) =>
          event.type === 'ack' && event.requestId === 'send-slow-storage',
      ),
    ).toBe(false);

    await vi.waitFor(() => expect(set).toHaveBeenCalledOnce());
    releaseStorage?.();

    await vi.waitFor(() =>
      expect(
        connected.postMessage.mock.calls.some(
          ([event]) =>
            event.type === 'ack' && event.requestId === 'send-slow-storage',
        ),
      ).toBe(true),
    );
    connected.onMessage.emit({
      type: 'cancel',
      requestId: 'cancel-slow-storage',
    });
  });

  it('releases the global run lock when initial persistence fails', async () => {
    const set = vi.fn(async () => {
      throw new Error('storage unavailable');
    });
    const stream = vi.fn();
    const client = {
      stream,
      completeUserscriptRequest: vi.fn(),
    } as unknown as AiModelClient;
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set,
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const service = assistantService(api, client);
    const connected = port('document-a');
    service.connect(connected.value, 7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-first',
      message: 'first',
    });
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    expect(
      connected.postMessage.mock.calls.some(
        ([event]) =>
          event.type === 'ack' &&
          event.requestId === 'send-first' &&
          event.error === 'storage unavailable',
      ),
    ).toBe(true);
    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-second',
      message: 'second',
    });
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));

    expect(stream).not.toHaveBeenCalled();
    expect(
      connected.postMessage.mock.calls.some(
        ([event]) =>
          event.type === 'ack' &&
          event.requestId === 'send-second' &&
          event.error === 'storage unavailable',
      ),
    ).toBe(true);
  });

  it('rejects a second send instead of acknowledging and dropping it', async () => {
    const stream = vi.fn(
      (
        _request: unknown,
        _callbacks: unknown,
        nextSignal: AbortSignal | undefined,
      ) => {
        return new Promise((_resolve, reject) => {
          nextSignal?.addEventListener(
            'abort',
            () => reject(nextSignal.reason),
            {
              once: true,
            },
          );
        });
      },
    );
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const service = assistantService(api, {
      stream,
      completeUserscriptRequest: vi.fn(),
    } as unknown as AiModelClient);
    const connected = port('document-busy');
    service.connect(connected.value, 7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-running',
      message: 'first',
    });
    await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-rejected',
      message: 'second',
    });

    await vi.waitFor(() =>
      expect(
        connected.postMessage.mock.calls.some(
          ([event]) =>
            event.type === 'ack' &&
            event.requestId === 'send-rejected' &&
            String(event.error).includes('正在处理另一条请求'),
        ),
      ).toBe(true),
    );
    expect(stream).toHaveBeenCalledOnce();
    connected.onMessage.emit({
      type: 'cancel',
      requestId: 'cancel-running',
    });
    await vi.waitFor(() =>
      expect(
        connected.postMessage.mock.calls.some(
          ([event]) =>
            event.type === 'ack' && event.requestId === 'cancel-running',
        ),
      ).toBe(true),
    );
    expect(stream.mock.calls[0]?.[2]?.aborted).toBe(true);
  });

  it('取消时不会把工具前文本升级为最终回复', async () => {
    const stream = vi.fn(
      (
        _request: unknown,
        callbacks: AiModelStreamCallbacks,
        signal: AbortSignal | undefined,
      ) => {
        callbacks.onTextDelta?.('正在分析页面。');
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        });
      },
    );
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const service = assistantService(api, {
      stream,
      completeUserscriptRequest: vi.fn(),
    } as unknown as AiModelClient);
    const connected = port('document-cancel-boundary');
    service.connect(connected.value, 7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-cancel-boundary',
      message: '检查页面',
    });
    await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
    connected.onMessage.emit({
      type: 'cancel',
      requestId: 'cancel-boundary',
    });

    await vi.waitFor(() =>
      expect(
        connected.postMessage.mock.calls.some(
          ([event]) =>
            event.type === 'snapshot' &&
            event.snapshot.messages.at(-1)?.status === 'complete',
        ),
      ).toBe(true),
    );
    const snapshot = [...connected.postMessage.mock.calls]
      .reverse()
      .map(([event]) => event)
      .find(
        (event) =>
          event.type === 'snapshot' &&
          event.snapshot.messages.at(-1)?.status === 'complete',
      );
    const message = snapshot?.snapshot.messages.at(-1);
    expect(message?.segments).toMatchObject([
      { type: 'text', content: '正在分析页面。' },
      { type: 'text', content: '本次生成已取消。' },
    ]);
    expect(message?.finalSegmentId).toBe(message?.segments.at(-1)?.id);
  });

  it('非用户触发的 AbortError 必须显示真实错误而不是生成已取消', async () => {
    const errorLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const stream = vi.fn(async () => {
        throw new DOMException('模型事件流意外中断', 'AbortError');
      });
      const api = {
        storage: {
          local: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async () => undefined),
          },
        },
      } as unknown as ExtensionBackgroundApi;
      const service = assistantService(api, {
        stream,
        completeUserscriptRequest: vi.fn(),
      } as unknown as AiModelClient);
      const connected = port('document-transport-abort');
      service.connect(connected.value, 7);

      connected.onMessage.emit({
        type: 'send',
        requestId: 'send-transport-abort',
        message: '检查页面',
      });

      await vi.waitFor(() =>
        expect(
          connected.postMessage.mock.calls.some(
            ([event]) =>
              event.type === 'snapshot' &&
              event.snapshot.messages.at(-1)?.status === 'error',
          ),
        ).toBe(true),
      );
      const snapshot = [...connected.postMessage.mock.calls]
        .reverse()
        .map(([event]) => event)
        .find(
          (event) =>
            event.type === 'snapshot' &&
            event.snapshot.messages.at(-1)?.status === 'error',
        );
      const message = snapshot?.snapshot.messages.at(-1);

      expect(message?.error).toBe('智能体暂时无法连接，请稍后重试。');
      expect(errorLog).toHaveBeenCalled();
      expect(
        message?.segments.some(
          (segment: AiConversationSegment) =>
            segment.type === 'text' && segment.content === '本次生成已取消。',
        ),
      ).toBe(false);
    } finally {
      errorLog.mockRestore();
    }
  });

  it('keeps new conversations transient and replaces earlier empty drafts', async () => {
    const set = vi.fn(async () => undefined);
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set,
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const client = {
      stream: vi.fn(),
      completeUserscriptRequest: vi.fn(),
    } as unknown as AiModelClient;
    const service = assistantService(api, client);
    const connected = port('document-create');
    service.connect(connected.value, 7);

    await service.createConversation('create-first');
    await service.createConversation('create-second');

    const snapshot = [...connected.postMessage.mock.calls]
      .reverse()
      .map(([event]) => event)
      .find((event) => event.type === 'snapshot');
    expect(set).not.toHaveBeenCalled();
    expect(snapshot?.snapshot.conversations).toMatchObject([
      { id: 'create-second', messageCount: 0 },
    ]);
  });

  it('keeps a run alive across a controller reconnect until explicitly cancelled', async () => {
    let firstSignal: AbortSignal | undefined;
    const stream = vi
      .fn()
      .mockImplementationOnce(
        (
          _request: unknown,
          _callbacks: unknown,
          signal: AbortSignal | undefined,
        ) => {
          firstSignal = signal;
          return new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          });
        },
      )
      .mockResolvedValueOnce({
        model: 'gpt-5.5',
        text: 'done',
        toolCalls: [],
      });
    const client = {
      stream,
      completeUserscriptRequest: vi.fn(),
    } as unknown as AiModelClient;
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const service = assistantService(api, client);
    const first = port('document-a');
    service.connect(first.value, 7);
    first.onMessage.emit({
      type: 'send',
      requestId: 'send-first',
      message: 'first',
    });
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(1));

    first.onDisconnect.emit();
    expect(firstSignal?.aborted).toBe(false);
    const second = port('document-b');
    service.connect(second.value, 7);
    second.onMessage.emit({
      type: 'send',
      requestId: 'send-first',
      message: 'first',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stream).toHaveBeenCalledTimes(1);
    second.onMessage.emit({ type: 'cancel', requestId: 'cancel-first' });
    await vi.waitFor(() =>
      expect(
        (api.storage.local.set as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBeGreaterThanOrEqual(2),
    );
    second.onMessage.emit({
      type: 'send',
      requestId: 'send-second',
      message: 'second',
    });

    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
  });

  it('aborts an active run before replacing all conversations with one blank session', async () => {
    const stored: Record<string, unknown> = {};
    let signal: AbortSignal | undefined;
    const stream = vi.fn(
      (
        _request: unknown,
        _callbacks: unknown,
        nextSignal: AbortSignal | undefined,
      ) => {
        signal = nextSignal;
        return new Promise((_resolve, reject) => {
          nextSignal?.addEventListener(
            'abort',
            () => reject(nextSignal.reason),
            { once: true },
          );
        });
      },
    );
    const api = {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(stored, structuredClone(items));
          }),
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const service = assistantService(api, {
      stream,
      completeUserscriptRequest: vi.fn(),
    } as unknown as AiModelClient);
    const connected = port('document-clear');
    service.connect(connected.value, 7);
    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-clear',
      message: '开始处理',
    });
    await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());

    await service.clearConversations();

    expect(signal?.aborted).toBe(true);
    const state = stored[AI_CONVERSATION_STORAGE_KEY] as {
      runningConversationId: string | null;
      conversations: Array<{
        title: string;
        messages: unknown[];
        input: unknown[];
      }>;
    };
    expect(state.runningConversationId).toBeNull();
    expect(state.conversations).toEqual([]);
  });

  it('continues through more than eight tool rounds until the model finishes', async () => {
    const stream = vi.fn();
    for (let index = 0; index < 10; index += 1) {
      stream.mockResolvedValueOnce({
        model: 'gpt-5.5',
        text: '',
        toolCalls: [
          {
            id: `call-${index}`,
            name: 'query_userscripts',
            arguments: JSON.stringify({
              query: null,
              offset: index,
              limit: 1,
            }),
          },
        ],
      });
    }
    stream.mockResolvedValueOnce({
      model: 'gpt-5.5',
      text: 'done',
      toolCalls: [],
    });
    const client = {
      stream,
      completeUserscriptRequest: vi.fn(),
    } as unknown as AiModelClient;
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const service = assistantService(api, client);
    const connected = port('document-tools');
    service.connect(connected.value, 7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-tools',
      message: 'inspect',
    });
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(11));

    expect(
      connected.postMessage.mock.calls.some(([event]) =>
        JSON.stringify(event).includes('结果没有变化'),
      ),
    ).toBe(false);
  });

  it('does not impose a semantic cycle limit on tool calls', async () => {
    const stream = vi.fn();
    for (let index = 0; index < 4; index += 1) {
      stream.mockResolvedValueOnce({
        model: 'gpt-5.5',
        text: '',
        toolCalls: [
          {
            id: `repeated-${index}`,
            name: 'query_userscripts',
            arguments: JSON.stringify({
              query: null,
              offset: 0,
              limit: 10,
            }),
          },
        ],
      });
    }
    stream.mockResolvedValueOnce({
      model: 'gpt-5.5',
      text: 'done',
      toolCalls: [],
    });
    const client = {
      stream,
      completeUserscriptRequest: vi.fn(),
    } as unknown as AiModelClient;
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const service = assistantService(api, client);
    const connected = port('document-cycle');
    service.connect(connected.value, 7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-cycle',
      message: 'inspect',
    });
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(5));
    expect(
      connected.postMessage.mock.calls.some(([event]) =>
        JSON.stringify(event).includes('结果没有变化'),
      ),
    ).toBe(false);
  });

  it('在多轮工具调用中严格保留思考、工具和正文的到达顺序', async () => {
    const firstCall = {
      id: 'inspect-call',
      name: 'query_userscripts',
      arguments: JSON.stringify({
        query: null,
        offset: 0,
        limit: 10,
      }),
    };
    const stream = vi
      .fn()
      .mockImplementationOnce(
        async (_request: unknown, callbacks: AiModelStreamCallbacks) => {
          callbacks.onReasoningDelta?.('先检查已安装卡牌。');
          callbacks.onToolCall?.(firstCall);
          callbacks.onTextDelta?.('已经找到相关卡牌。');
          return {
            model: 'gpt-5.5',
            text: '已经找到相关卡牌。',
            reasoning: '先检查已安装卡牌。',
            toolCalls: [firstCall],
          };
        },
      )
      .mockImplementationOnce(
        async (_request: unknown, callbacks: AiModelStreamCallbacks) => {
          callbacks.onReasoningDelta?.('继续整理执行结果。');
          callbacks.onTextDelta?.('脚本已经完成写入和执行。');
          return {
            model: 'gpt-5.5',
            text: '脚本已经完成写入和执行。',
            reasoning: '继续整理执行结果。',
            toolCalls: [],
          };
        },
      );
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const service = assistantService(api, {
      stream,
      completeUserscriptRequest: vi.fn(),
    } as unknown as AiModelClient);
    const connected = port('document-timeline');
    service.connect(connected.value, 7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-timeline',
      message: '检查并处理页面',
    });

    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(
        connected.postMessage.mock.calls.some(
          ([event]) =>
            event.type === 'snapshot' &&
            event.snapshot.messages.at(-1)?.status === 'complete',
        ),
      ).toBe(true),
    );
    const finalEvent = [...connected.postMessage.mock.calls]
      .reverse()
      .map(([event]) => event)
      .find(
        (event) =>
          event.type === 'snapshot' &&
          event.snapshot.messages.at(-1)?.status === 'complete',
      );
    const message = finalEvent?.snapshot.messages.at(-1) as
      | AiConversationMessage
      | undefined;

    expect(message?.segments.map((segment) => segment.type)).toEqual([
      'reasoning',
      'tool',
      'text',
      'reasoning',
      'text',
    ]);
    expect(message?.segments.at(-1)).toMatchObject({
      type: 'text',
      content: '脚本已经完成写入和执行。',
    });
    expect(message?.finalSegmentId).toBe(message?.segments.at(-1)?.id);
  });

  it('在同一轮中选择新标签页后让页面工具改用新目标', async () => {
    const listCall = {
      id: 'list-tabs-call',
      name: 'list_tabs',
      arguments: '{}',
    };
    const selectCall = {
      id: 'select-tab-call',
      name: 'select_tab',
      arguments: JSON.stringify({ tab_id: 11 }),
    };
    const inspectCall = {
      id: 'inspect-selected-tab-call',
      name: 'inspect_page',
      arguments: '{}',
    };
    const stream = vi
      .fn()
      .mockResolvedValueOnce({
        model: 'gpt-5.5',
        text: '',
        toolCalls: [listCall],
      })
      .mockResolvedValueOnce({
        model: 'gpt-5.5',
        text: '',
        toolCalls: [selectCall],
      })
      .mockResolvedValueOnce({
        model: 'gpt-5.5',
        text: '',
        toolCalls: [inspectCall],
      })
      .mockResolvedValueOnce({
        model: 'gpt-5.5',
        text: '已经检查标签页 11。',
        toolCalls: [],
      });
    const onRemoved = extensionEvent<(tabId: number) => void>();
    const onUpdated =
      extensionEvent<
        (tabId: number, changeInfo: unknown, tab: chrome.tabs.Tab) => void
      >();
    const onActivated =
      extensionEvent<
        (activeInfo: { tabId: number; windowId: number }) => void
      >();
    const tabs = new Map<number, chrome.tabs.Tab>([
      [
        7,
        {
          id: 7,
          index: 0,
          windowId: 1,
          active: true,
          pinned: false,
          title: 'First',
          url: 'https://example.com/first',
          status: 'complete',
        } as chrome.tabs.Tab,
      ],
      [
        11,
        {
          id: 11,
          index: 1,
          windowId: 1,
          active: false,
          pinned: false,
          title: 'Second',
          url: 'https://example.com/second',
          status: 'complete',
        } as chrome.tabs.Tab,
      ],
    ]);
    const executeScript = vi.fn(async () => [
      { result: { title: 'Second', counts: { elements: 17 } } },
    ]);
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
      tabs: {
        get: vi.fn(async (tabId: number) => {
          const candidate = tabs.get(tabId);
          if (!candidate) throw new Error(`No tab with id: ${tabId}`);
          return structuredClone(candidate);
        }),
        query: vi.fn(async () => structuredClone([...tabs.values()])),
        update: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        onRemoved,
        onUpdated,
        onActivated,
      },
      scripting: { executeScript },
    } as unknown as ExtensionBackgroundApi;
    const resolvePageAttachment = vi.fn(async (tabId: number) => ({
      context: {
        ...page,
        url: `https://example.com/${tabId}`,
        title: `Tab ${tabId}`,
      },
      target: {
        tabId,
        frameId: 0,
        documentId: `document-${tabId}`,
      },
    }));
    const service = new ExtensionAssistantService(
      api,
      repository(),
      provider({
        stream,
        completeUserscriptRequest: vi.fn(),
      } as unknown as AiModelClient),
      vi.fn(),
      resolvePageAttachment,
      toolPlatform(),
    );
    const connected = port('document-multi-tab');
    service.connect(connected.value, 7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-multi-tab',
      message: '检查另一个标签页',
    });

    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(4));
    expect(resolvePageAttachment.mock.calls.map(([tabId]) => tabId)).toEqual([
      7, 11,
    ]);
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: {
          tabId: 11,
          documentIds: ['document-11'],
        },
      }),
    );
    expect(
      connected.postMessage.mock.calls.some(
        ([event]) => event.type === 'target' && event.target.tabId === 11,
      ),
    ).toBe(true);
  });

  it('目标标签页关闭后仍允许模型列出并重新选择标签页', async () => {
    const stream = vi.fn(async (request: AiModelStreamRequest) => {
      const userMessage = request.messages.find(
        (message) => message.role === 'user',
      );
      expect(userMessage?.content).not.toContain('标签页 ID');
      expect(userMessage?.content).not.toContain('窗口 ID');
      expect(userMessage?.content).toContain('当前没有选定可操作的页面');
      return {
        model: 'gpt-5.5',
        text: '我可以重新列出标签页并选择目标。',
        toolCalls: [],
      };
    });
    const onRemoved = extensionEvent<(tabId: number) => void>();
    const onUpdated =
      extensionEvent<
        (tabId: number, changeInfo: unknown, tab: chrome.tabs.Tab) => void
      >();
    const onActivated =
      extensionEvent<
        (activeInfo: { tabId: number; windowId: number }) => void
      >();
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
      tabs: {
        get: vi.fn(async () => {
          throw new Error('No tab with id: 7');
        }),
        query: vi.fn(async () => []),
        update: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        onRemoved,
        onUpdated,
        onActivated,
      },
    } as unknown as ExtensionBackgroundApi;
    const resolvePageAttachment = vi.fn();
    const service = new ExtensionAssistantService(
      api,
      repository(),
      provider({
        stream,
        completeUserscriptRequest: vi.fn(),
      } as unknown as AiModelClient),
      vi.fn(),
      resolvePageAttachment,
      toolPlatform(),
    );
    const connected = port('document-closed-target');
    service.connect(connected.value, 7);
    onRemoved.emit(7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-closed-target',
      message: '继续处理',
    });

    await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
    expect(resolvePageAttachment).not.toHaveBeenCalled();
    expect(
      connected.postMessage.mock.calls.some(
        ([event]) =>
          event.type === 'snapshot' &&
          event.snapshot.messages.at(-1)?.status === 'complete',
      ),
    ).toBe(true);
  });

  it('拒绝使用过期 revision 覆盖已经变化的脚本源码', async () => {
    const target = INITIAL_USERSCRIPTS[0];
    const editCall = {
      id: 'edit-stale',
      name: 'edit_userscript',
      arguments: JSON.stringify({
        target_script_id: target.id,
        expected_revision: 'sha256:stale',
        edits: [
          {
            old_text: '// @version     2.4.1',
            new_text: '// @version     9.0.0',
          },
        ],
      }),
    };
    const stream = vi
      .fn()
      .mockImplementationOnce(
        async (_request: unknown, callbacks: AiModelStreamCallbacks) => {
          callbacks.onToolCall?.(editCall);
          return {
            model: 'gpt-5.5',
            text: '',
            toolCalls: [editCall],
          };
        },
      )
      .mockResolvedValueOnce({
        model: 'gpt-5.5',
        text: '脚本已经变化，需要重新读取。',
        toolCalls: [],
      });
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const scriptRepository = repository();
    const afterLibraryCommit = vi.fn();
    const service = new ExtensionAssistantService(
      api,
      scriptRepository,
      provider({
        stream,
        completeUserscriptRequest: vi.fn(),
      } as unknown as AiModelClient),
      afterLibraryCommit,
      vi.fn(async (tabId: number) => ({
        context: page,
        target: { tabId, frameId: 0, documentId: 'document-current' },
      })),
      toolPlatform(),
    );
    const connected = port('document-stale');
    service.connect(connected.value, 7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-stale',
      message: '修改脚本',
    });

    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
    expect(afterLibraryCommit).not.toHaveBeenCalled();
    expect((await scriptRepository.get(target.id))?.source.code).toBe(
      target.source.code,
    );
    expect(
      connected.postMessage.mock.calls.some(([event]) =>
        JSON.stringify(event).includes('请重新读取最新脚本'),
      ),
    ).toBe(true);
  });

  it('工具完成前不会向模型返回临时结果', async () => {
    const runtimeCall = {
      id: 'runtime-pending',
      name: 'inspect_userscript_runtime',
      arguments: JSON.stringify({
        script_id: INITIAL_USERSCRIPTS[0].id,
      }),
    };
    const stream = vi
      .fn()
      .mockImplementationOnce(
        async (_request: unknown, callbacks: AiModelStreamCallbacks) => {
          callbacks.onToolCall?.(runtimeCall);
          return {
            model: 'gpt-5.5',
            text: '',
            toolCalls: [runtimeCall],
          };
        },
      )
      .mockResolvedValueOnce({
        model: 'gpt-5.5',
        text: '运行时读取完成。',
        toolCalls: [],
      });
    let finishRuntime:
      | ((value: (typeof INITIAL_USERSCRIPTS)[number]['runtime']) => void)
      | undefined;
    const runtime = new Promise<
      (typeof INITIAL_USERSCRIPTS)[number]['runtime']
    >((resolve) => {
      finishRuntime = resolve;
    });
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const service = new ExtensionAssistantService(
      api,
      repository(),
      provider({
        stream,
        completeUserscriptRequest: vi.fn(),
      } as unknown as AiModelClient),
      vi.fn(),
      vi.fn(async (tabId: number) => ({
        context: page,
        target: { tabId, frameId: 0, documentId: 'document-current' },
      })),
      toolPlatform({ readRuntimeState: vi.fn(() => runtime) }),
    );
    const connected = port('document-pending-tool');
    service.connect(connected.value, 7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-pending-tool',
      message: '读取运行时',
    });

    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(1));
    const runningEvent = [...connected.postMessage.mock.calls]
      .reverse()
      .map(([event]) => event)
      .find(
        (event) =>
          event.type === 'snapshot' &&
          event.snapshot.messages
            .at(-1)
            ?.segments.some(
              (segment: AiConversationSegment) =>
                segment.type === 'tool' &&
                segment.call.id === runtimeCall.id &&
                segment.call.status === 'running',
            ),
      );
    expect(runningEvent).toBeDefined();
    expect(stream).toHaveBeenCalledTimes(1);

    finishRuntime?.(INITIAL_USERSCRIPTS[0].runtime);
    await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
    expect(
      connected.postMessage.mock.calls.some(
        ([event]) =>
          event.type === 'snapshot' &&
          event.snapshot.messages
            .at(-1)
            ?.segments.some(
              (segment: AiConversationSegment) =>
                segment.type === 'tool' &&
                segment.call.id === runtimeCall.id &&
                segment.call.status === 'completed',
            ),
      ),
    ).toBe(true);
  });

  it('创建工具使用预设封面过渡并在下一轮生成正式封面', async () => {
    const source = `// ==UserScript==
// @name        即时演示脚本
// @namespace   card-master.test
// @version     1.0.0
// @match       https://example.com/*
// ==/UserScript==

document.documentElement.dataset.immediateDemo = 'ready';
`;
    const createCall = {
      id: 'create-call',
      name: 'create_userscript',
      arguments: JSON.stringify({
        source,
      }),
    };
    const stream = vi
      .fn()
      .mockImplementationOnce(
        async (_request: unknown, callbacks: AiModelStreamCallbacks) => {
          callbacks.onToolCall?.(createCall);
          return {
            model: 'gpt-5.5',
            text: '',
            toolCalls: [createCall],
          };
        },
      )
      .mockImplementationOnce(
        async (
          request: AiModelStreamRequest,
          callbacks: AiModelStreamCallbacks,
        ) => {
          const createResult = [...request.messages]
            .reverse()
            .find((message) => message.role === 'tool');
          if (createResult?.role !== 'tool') {
            throw new Error('创建工具结果不存在。');
          }
          const parsed = JSON.parse(createResult.content) as {
            nextAction: {
              target_script_id: string;
              expected_revision: string;
            };
          };
          const coverCall = {
            id: 'cover-call',
            name: 'generate_userscript_cover',
            arguments: JSON.stringify({
              target_script_id: parsed.nextAction.target_script_id,
              expected_revision: parsed.nextAction.expected_revision,
              visual_concept:
                'A nimble workshop scribe instantly inscribing a glowing browser page',
            }),
          };
          callbacks.onToolCall?.(coverCall);
          return {
            model: 'gpt-5.5',
            text: '',
            toolCalls: [coverCall],
          };
        },
      )
      .mockImplementationOnce(
        async (_request: unknown, callbacks: AiModelStreamCallbacks) => {
          callbacks.onTextDelta?.('脚本已经写入并在当前页面执行。');
          return {
            model: 'gpt-5.5',
            text: '脚本已经写入并在当前页面执行。',
            toolCalls: [],
          };
        },
      );
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => undefined),
        },
      },
      tabs: {
        sendMessage: vi.fn(async () => undefined),
      },
    } as unknown as ExtensionBackgroundApi;
    const scriptRepository = repository();
    const generateCardCover = vi.fn(async () => ({
      dataUrl: 'data:image/webp;base64,Y292ZXI=',
      width: 480,
      height: 640,
      mimeType: 'image/webp' as const,
      accent: '#72aabb',
    }));
    const afterLibraryCommit = vi.fn(async () => ({
      injection: {
        eligible: 1,
        attempted: 1,
        succeeded: 1,
        failed: 0,
      },
      refreshRequired: false,
      reloadRequested: false,
      executions: [
        {
          status: 'ready' as const,
          url: page.url,
          completedAt: Date.now(),
        },
      ],
    }));
    const service = new ExtensionAssistantService(
      api,
      scriptRepository,
      {
        ...provider({
          stream,
          completeUserscriptRequest: vi.fn(),
        } as unknown as AiModelClient),
        generateCardCover,
      },
      afterLibraryCommit,
      vi.fn(async (tabId: number) => ({
        context: page,
        target: { tabId, frameId: 0, documentId: 'document-current' },
      })),
      toolPlatform(),
    );
    const connected = port('document-write');
    service.connect(connected.value, 7);

    connected.onMessage.emit({
      type: 'send',
      requestId: 'send-write',
      message: '创建一个演示脚本',
    });

    await vi.waitFor(() => expect(generateCardCover).toHaveBeenCalledOnce());
    const scripts = await scriptRepository.list();
    const createdScript = scripts.find(
      (script) => script.metadata.name === '即时演示脚本',
    );
    expect(createdScript?.presentation?.media).toMatchObject({
      kind: 'image',
      image: 'data:image/webp;base64,Y292ZXI=',
    });
    expect(createdScript?.presentation?.accent).toBe('#72aabb');
    expect(generateCardCover).toHaveBeenCalledWith(
      'A nimble workshop scribe instantly inscribing a glowing browser page',
      expect.any(AbortSignal),
    );
    expect(afterLibraryCommit).toHaveBeenCalledTimes(2);
    expect(afterLibraryCommit).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      7,
    );
    await vi.waitFor(() =>
      expect(
        connected.postMessage.mock.calls.some(
          ([event]) =>
            event.type === 'snapshot' &&
            event.snapshot.messages.at(-1)?.status === 'complete',
        ),
      ).toBe(true),
    );
    const completedEvent = [...connected.postMessage.mock.calls]
      .reverse()
      .map(([event]) => event)
      .find(
        (event) =>
          event.type === 'snapshot' &&
          event.snapshot.messages.at(-1)?.status === 'complete',
      );
    const completedMessage = completedEvent?.snapshot.messages.at(-1) as
      | AiConversationMessage
      | undefined;
    const toolSegment = completedMessage?.segments.find(
      (segment) => segment.type === 'tool',
    );
    expect(toolSegment?.type).toBe('tool');
    if (toolSegment?.type !== 'tool') throw new Error('工具片段不存在。');
    expect(JSON.parse(toolSegment.call.result ?? '{}')).toMatchObject({
      persisted: true,
      mutation: 'installed',
      nextAction: {
        required: true,
        tool: 'generate_userscript_cover',
        target_script_id: createdScript?.id,
      },
      runtime: {
        status: 'completed',
        effect: 'succeeded',
        injection: {
          eligible: 1,
          attempted: 1,
          succeeded: 1,
          failed: 0,
        },
        refreshRequired: false,
        reloadRequested: false,
      },
      execution: { status: 'ready' },
    });
    expect(toolSegment.call.result).not.toContain('awaitingUserConfirmation');
    expect(toolSegment.call.startedAt).toBeTypeOf('number');
    expect(toolSegment.call.completedAt).toBeTypeOf('number');
    expect(toolSegment.call.durationMs).toBeGreaterThanOrEqual(0);
  });
});
