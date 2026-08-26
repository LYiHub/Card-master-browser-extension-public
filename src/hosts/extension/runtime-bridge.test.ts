import { describe, expect, it, vi } from 'vitest';

import type { UserscriptRequestService } from '../../userscript/application/request-service';
import type { InstalledUserscript } from '../../userscript/domain/types';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import type { ExtensionAiServices } from './ai-services';
import type { ExtensionBackgroundApi, ExtensionPort } from './api';
import type { RegisteredUserscriptSynchronizer } from './registration-sync';
import { ExtensionRuntimeBridge } from './runtime-bridge';

function portHarness(documentId = 'document-1', tabId = 42) {
  let messageListener: ((message: unknown) => void) | undefined;
  let disconnectListener: (() => void) | undefined;
  const postMessage = vi.fn((_message: unknown) => undefined);
  const disconnect = vi.fn(() => disconnectListener?.());
  const port = {
    disconnect,
    name: 'card-master:test',
    onDisconnect: {
      addListener: (listener: () => void) => {
        disconnectListener = listener;
      },
    },
    onMessage: {
      addListener: (listener: (message: unknown) => void) => {
        messageListener = listener;
      },
    },
    postMessage,
    sender: {
      documentId,
      frameId: 0,
      tab: { id: tabId, url: 'https://example.com/page' },
      url: 'https://example.com/page',
    },
  } as unknown as ExtensionPort;

  return {
    disconnect,
    emitDisconnect: () => disconnectListener?.(),
    emitMessage: (message: unknown) => messageListener?.(message),
    port,
    postMessage,
  };
}

function harness(
  script: InstalledUserscript = INITIAL_USERSCRIPTS[0],
  aiServices?: ExtensionAiServices,
  ensureRuntimeReady: () => Promise<void> = async () => undefined,
  requestService?: UserscriptRequestService,
) {
  const sendMessage = vi.fn(
    async (
      _tabId: number,
      _message: unknown,
      _options?: { frameId?: number },
    ) => undefined,
  );
  const localStorage = new Map<string, unknown>();
  const sessionStorage = new Map<string, unknown>();
  const createTab = vi.fn(async () => ({ id: 99 }) as chrome.tabs.Tab);
  const getTab = vi.fn(
    async () =>
      ({
        id: 42,
        index: 3,
        windowId: 8,
        incognito: false,
      }) as chrome.tabs.Tab,
  );
  const event = { addListener: vi.fn() };
  const api = {
    cookies: {
      getAll: vi.fn(),
      remove: vi.fn(),
      set: vi.fn(),
    },
    declarativeNetRequest: {
      getSessionRules: vi.fn(async () => []),
      updateSessionRules: vi.fn(),
    },
    downloads: {
      cancel: vi.fn(),
      download: vi.fn(),
      search: vi.fn(async () => []),
      onChanged: event,
    },
    notifications: {
      clear: vi.fn(),
      create: vi.fn(),
      onClicked: event,
      onClosed: event,
    },
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
    storage: {
      local: {
        get: vi.fn(async (key: string | string[] | null) => {
          if (key === null) return Object.fromEntries(localStorage);
          const keys = Array.isArray(key) ? key : [key];
          return Object.fromEntries(
            keys.flatMap((entry) =>
              localStorage.has(entry) ? [[entry, localStorage.get(entry)]] : [],
            ),
          );
        }),
        set: vi.fn(async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values)) {
            localStorage.set(key, value);
          }
        }),
        remove: vi.fn(async (key: string | string[]) => {
          for (const entry of Array.isArray(key) ? key : [key]) {
            localStorage.delete(entry);
          }
        }),
      },
      session: {
        get: vi.fn(async (key: string | string[] | null) => {
          if (key === null) return Object.fromEntries(sessionStorage);
          const keys = Array.isArray(key) ? key : [key];
          return Object.fromEntries(
            keys.flatMap((entry) =>
              sessionStorage.has(entry)
                ? [[entry, sessionStorage.get(entry)]]
                : [],
            ),
          );
        }),
        set: vi.fn(async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values)) {
            sessionStorage.set(key, value);
          }
        }),
        remove: vi.fn(async (key: string | string[]) => {
          for (const entry of Array.isArray(key) ? key : [key]) {
            sessionStorage.delete(entry);
          }
        }),
      },
    },
    tabs: {
      create: createTab,
      get: getTab,
      onRemoved: event,
      onUpdated: event,
      remove: vi.fn(),
      sendMessage,
      update: vi.fn(),
    },
    webRequest: {
      onBeforeRequest: event,
    },
    windows: {
      create: vi.fn(),
    },
  } as unknown as ExtensionBackgroundApi;
  const synchronizer = {
    accepts: vi.fn(() => true),
    ensureReady: vi.fn(async () => undefined),
    ensureRuntimeReady: vi.fn(ensureRuntimeReady),
    getScript: vi.fn(() => script),
  } as unknown as RegisteredUserscriptSynchronizer;
  const bridge = new ExtensionRuntimeBridge(
    api,
    synchronizer,
    requestService,
    aiServices,
  );

  return {
    api,
    bridge,
    createTab,
    getTab,
    localStorage,
    sendMessage,
    sessionStorage,
  };
}

function registerCommand(
  runtime: ReturnType<typeof portHarness>,
  id = 'command-1',
) {
  runtime.emitMessage({
    type: 'register-command',
    command: {
      id,
      title: 'Run command',
      autoClose: true,
      order: 0,
    },
  });
}

function invocationMessage(runtime: ReturnType<typeof portHarness>) {
  const messages = runtime.postMessage.mock.calls
    .map(([value]) => value as Record<string, unknown>)
    .filter((value) => value.type === 'invoke-command');
  const message = messages.at(-1);
  if (!message || typeof message.invocationId !== 'string') {
    throw new Error('Expected an invocation message.');
  }
  return message;
}

function mainWorldScript(): InstalledUserscript {
  return {
    ...INITIAL_USERSCRIPTS[0],
    metadata: {
      ...INITIAL_USERSCRIPTS[0].metadata,
      grants: ['GM_registerMenuCommand', 'GM_unregisterMenuCommand'],
      sandbox: 'raw',
    },
  };
}

describe('ExtensionRuntimeBridge', () => {
  it('routes cross-origin fetch and GM requests through the background bridge without @connect', async () => {
    const response = {
      finalUrl: 'https://connect.linux.do/',
      readyState: 4 as const,
      status: 200,
      statusText: 'OK',
      responseHeaders: 'content-type: text/plain',
      response: new ArrayBuffer(0),
      responseText: '',
    };
    const request = vi.fn(() => ({
      abort: vi.fn(),
      promise: Promise.resolve(response),
    }));
    const { bridge } = harness(
      INITIAL_USERSCRIPTS[0],
      undefined,
      async () => undefined,
      { request } as unknown as UserscriptRequestService,
    );
    const runtime = portHarness();
    await bridge.connect(runtime.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });

    runtime.emitMessage({
      type: 'fetch-request',
      requestId: 'fetch-1',
      details: {
        url: 'https://connect.linux.do/',
        responseType: 'arraybuffer',
      },
    });
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        INITIAL_USERSCRIPTS[0],
        'https://example.com/page',
        {
          url: 'https://connect.linux.do/',
          responseType: 'arraybuffer',
        },
        expect.objectContaining({
          enforceConnect: false,
          onEvent: expect.any(Function),
        }),
      );
    });
    const fetchOptions = (
      request.mock.calls[0] as unknown as
        | Parameters<UserscriptRequestService['request']>
        | undefined
    )?.[3];
    fetchOptions?.onEvent?.({
      type: 'progress',
      readyState: 3,
      loaded: 4,
      total: 8,
      lengthComputable: true,
    });
    expect(runtime.postMessage).toHaveBeenCalledWith({
      type: 'http-event',
      requestId: 'fetch-1',
      event: expect.objectContaining({
        type: 'progress',
        loaded: 4,
        total: 8,
      }),
    });

    runtime.emitMessage({
      type: 'http-request',
      requestId: 'xhr-1',
      details: {
        url: 'https://connect.linux.do/',
        responseType: 'arraybuffer',
      },
    });
    await vi.waitFor(() => {
      expect(request).toHaveBeenLastCalledWith(
        INITIAL_USERSCRIPTS[0],
        'https://example.com/page',
        {
          url: 'https://connect.linux.do/',
          responseType: 'arraybuffer',
        },
        expect.objectContaining({
          enforceConnect: false,
          onEvent: expect.any(Function),
        }),
      );
    });
    expect(runtime.postMessage).toHaveBeenCalledWith({
      type: 'http-response',
      requestId: 'fetch-1',
      response,
    });
  });

  it('buffers runtime messages while registration resources are still loading', async () => {
    let releaseRuntime: (() => void) | undefined;
    const runtimeReady = new Promise<void>((resolve) => {
      releaseRuntime = resolve;
    });
    const { bridge } = harness(
      INITIAL_USERSCRIPTS[0],
      undefined,
      () => runtimeReady,
    );
    const runtime = portHarness();
    const connection = bridge.connect(runtime.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });

    runtime.emitMessage({
      type: 'runtime-error',
      error: 'Initialization failed before the registration sync completed.',
    });
    releaseRuntime?.();
    await connection;

    await expect(
      bridge.state(42, 0, INITIAL_USERSCRIPTS[0].id),
    ).resolves.toMatchObject({
      status: 'error',
      error: 'Initialization failed before the registration sync completed.',
    });
  });

  it('waits for the concrete command callback result', async () => {
    const { bridge } = harness();
    const runtime = portHarness();
    await bridge.connect(runtime.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });
    registerCommand(runtime);

    const successful = bridge.invoke(
      42,
      0,
      INITIAL_USERSCRIPTS[0].id,
      'command-1',
    );
    const successfulMessage = invocationMessage(runtime);
    runtime.emitMessage({
      type: 'command-result',
      invocationId: successfulMessage.invocationId,
      value: { removed: 12 },
    });
    await expect(successful).resolves.toEqual({
      ok: true,
      value: { removed: 12 },
    });

    const failed = bridge.invoke(42, 0, INITIAL_USERSCRIPTS[0].id, 'command-1');
    const failedMessage = invocationMessage(runtime);
    runtime.emitMessage({
      type: 'command-result',
      invocationId: failedMessage.invocationId,
      error: 'Callback failed.',
    });
    await expect(failed).resolves.toEqual({
      ok: false,
      error: 'Callback failed.',
    });
  });

  it('publishes and invokes commands registered in the MAIN world', async () => {
    const script = mainWorldScript();
    const { bridge, sendMessage } = harness(script);
    bridge.reportMainWorld(42, 0, 'document-1', script.id, 'capability', {
      type: 'register-command',
      command: {
        id: 'main-command',
        title: 'Run in page',
        autoClose: true,
        order: 0,
      },
    });
    bridge.reportMainWorld(42, 0, 'document-1', script.id, 'capability', {
      type: 'ready',
    });

    await expect(
      bridge.state(42, 0, script.id, 'document-1'),
    ).resolves.toMatchObject({
      status: 'ready',
      commands: [expect.objectContaining({ id: 'main-command' })],
    });

    const invocation = bridge.invoke(42, 0, script.id, 'main-command');
    const invokeMessage = sendMessage.mock.calls
      .map(([, value]) => value as Record<string, unknown>)
      .find((value) => value.type === 'main-world-command-invoke');
    if (!invokeMessage || typeof invokeMessage.invocationId !== 'string') {
      throw new Error('Expected a MAIN-world command invocation.');
    }
    expect(invokeMessage).toMatchObject({
      scriptId: script.id,
      capability: 'capability',
      commandId: 'main-command',
    });
    bridge.reportMainWorld(42, 0, 'document-1', script.id, 'capability', {
      type: 'command-result',
      invocationId: invokeMessage.invocationId,
      value: { mode: 'main' },
    });
    await expect(invocation).resolves.toEqual({
      ok: true,
      value: { mode: 'main' },
    });
  });

  it('discards MAIN-world commands when a new document replaces the runtime', async () => {
    const script = mainWorldScript();
    const { bridge } = harness(script);
    bridge.reportMainWorld(42, 0, 'document-1', script.id, 'capability', {
      type: 'register-command',
      command: {
        id: 'stale-command',
        title: 'Stale',
        autoClose: true,
        order: 0,
      },
    });
    bridge.reportMainWorld(42, 0, 'document-2', script.id, 'capability', {
      type: 'ready',
    });

    await expect(
      bridge.state(42, 0, script.id, 'document-2'),
    ).resolves.toMatchObject({
      status: 'ready',
      commands: [],
    });
  });

  it('settles pending invocations when a newer runtime replaces the port', async () => {
    const { bridge } = harness();
    const first = portHarness('document-1');
    await bridge.connect(first.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });
    registerCommand(first, 'first');
    const pending = bridge.invoke(42, 0, INITIAL_USERSCRIPTS[0].id, 'first');

    const second = portHarness('document-2');
    await bridge.connect(second.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });
    registerCommand(first, 'stale');
    registerCommand(second, 'second');

    await expect(pending).resolves.toEqual({
      ok: false,
      error: 'The script connection closed during invocation.',
    });
    expect(first.disconnect).toHaveBeenCalledOnce();
    expect(
      (await bridge.state(42, 0, INITIAL_USERSCRIPTS[0].id))?.commands,
    ).toEqual([expect.objectContaining({ id: 'second' })]);
  });

  it('returns immediately when the command cannot be posted', async () => {
    const { bridge } = harness();
    const runtime = portHarness();
    await bridge.connect(runtime.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });
    registerCommand(runtime);
    runtime.postMessage.mockImplementationOnce(() => {
      throw new Error('Port is disconnected.');
    });

    await expect(
      bridge.invoke(42, 0, INITIAL_USERSCRIPTS[0].id, 'command-1'),
    ).resolves.toEqual({
      ok: false,
      error: 'Port is disconnected.',
    });
  });

  it('publishes an idle state without stale commands when a runtime disconnects', async () => {
    const { bridge, sendMessage } = harness();
    const runtime = portHarness();
    await bridge.connect(runtime.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });
    registerCommand(runtime);
    runtime.emitMessage({ type: 'ready' });
    sendMessage.mockClear();

    runtime.emitDisconnect();

    await expect(
      bridge.state(42, 0, INITIAL_USERSCRIPTS[0].id),
    ).resolves.toMatchObject({
      instanceId: null,
      status: 'idle',
      commands: [],
      pendingRefresh: true,
    });
    await expect(
      bridge.state(42, 0, INITIAL_USERSCRIPTS[0].id, 'document-replacement'),
    ).resolves.toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        type: 'runtime-state',
        state: expect.objectContaining({
          status: 'idle',
          commands: [],
          pendingRefresh: true,
        }),
      }),
      { frameId: 0 },
    );
  });

  it('persists runtime errors through disconnect until a later ready state', async () => {
    const { api, bridge, sendMessage } = harness();
    const runtime = portHarness();
    await bridge.connect(runtime.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });

    registerCommand(runtime, 'diagnostic-command');
    runtime.emitMessage({
      type: 'runtime-error',
      error: 'Illegal invocation',
    });
    await vi.waitFor(() => {
      expect(api.storage.session.set).toHaveBeenCalled();
    });
    sendMessage.mockClear();
    runtime.emitDisconnect();

    expect(await bridge.state(42, 0, INITIAL_USERSCRIPTS[0].id)).toMatchObject({
      status: 'error',
      error: 'Illegal invocation',
      commands: [],
      pendingRefresh: true,
    });
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        type: 'runtime-state',
        state: expect.objectContaining({
          status: 'error',
          error: 'Illegal invocation',
        }),
      }),
      { frameId: 0 },
    );

    const recovered = portHarness('document-2');
    await bridge.connect(recovered.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });
    recovered.emitMessage({ type: 'ready' });
    await vi.waitFor(() => {
      expect(api.storage.session.remove).toHaveBeenCalled();
    });
    expect(await bridge.state(42, 0, INITIAL_USERSCRIPTS[0].id)).toMatchObject({
      status: 'ready',
      error: undefined,
    });
  });

  it('clears resident diagnostics and publishes recovered runtime state', async () => {
    const { bridge, sendMessage, sessionStorage } = harness();
    const runtime = portHarness();
    await bridge.connect(runtime.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });
    runtime.emitMessage({
      type: 'runtime-error',
      error: 'Resident failure.',
    });
    await vi.waitFor(() => expect(sessionStorage.size).toBe(1));
    sendMessage.mockClear();

    await bridge.clearDiagnostics();

    expect(sessionStorage.size).toBe(0);
    await expect(
      bridge.state(42, 0, INITIAL_USERSCRIPTS[0].id),
    ).resolves.toMatchObject({
      status: 'ready',
      error: undefined,
    });
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        type: 'runtime-state',
        state: expect.objectContaining({
          status: 'ready',
          error: undefined,
        }),
      }),
      { frameId: 0 },
    );
  });

  it('serializes a global GM value reset after pending mutations and updates runtimes', async () => {
    const { bridge, localStorage } = harness();
    const runtime = portHarness();
    await bridge.connect(runtime.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });
    runtime.postMessage.mockClear();

    runtime.emitMessage({
      type: 'set-value',
      mutationId: 'mutation-1',
      key: 'theme',
      value: 'night',
    });
    await expect(bridge.clearValues()).resolves.toBe(0);

    expect(
      localStorage.has(
        `card-master.value:${encodeURIComponent(INITIAL_USERSCRIPTS[0].id)}`,
      ),
    ).toBe(false);
    expect(
      runtime.postMessage.mock.calls.map(
        ([message]) => (message as { type?: string }).type,
      ),
    ).toEqual(['value-changed', 'values-reset']);
  });

  it('does not project one tab or document diagnostic into another context', async () => {
    const { bridge } = harness();
    const failed = portHarness('document-1', 42);
    await bridge.connect(failed.port, {
      scriptId: INITIAL_USERSCRIPTS[0].id,
      capability: 'capability',
    });
    failed.emitMessage({
      type: 'runtime-error',
      error: 'Document one failed.',
    });
    await vi.waitFor(() =>
      expect(
        bridge.state(42, 0, INITIAL_USERSCRIPTS[0].id, 'document-1'),
      ).resolves.toMatchObject({ status: 'error' }),
    );

    await expect(
      bridge.state(43, 0, INITIAL_USERSCRIPTS[0].id, 'document-2'),
    ).resolves.toBeUndefined();
    await expect(
      bridge.state(42, 0, INITIAL_USERSCRIPTS[0].id, 'document-2'),
    ).resolves.toBeUndefined();
  });

  it('routes explicitly granted AI requests through the global provider', async () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['CM_ai'],
      },
    };
    const aiServices = {
      complete: vi.fn(async () => ({
        text: 'summary',
        model: 'model-one',
      })),
    } as unknown as ExtensionAiServices;
    const { bridge } = harness(script, aiServices);
    const runtime = portHarness();
    await bridge.connect(runtime.port, {
      scriptId: script.id,
      capability: 'capability',
    });

    runtime.emitMessage({
      type: 'ai-request',
      requestId: 'ai-1',
      request: { input: 'Summarize.' },
    });

    await vi.waitFor(() => {
      expect(runtime.postMessage).toHaveBeenCalledWith({
        type: 'ai-response',
        requestId: 'ai-1',
        response: { text: 'summary', model: 'model-one' },
      });
    });
    expect(aiServices.complete).toHaveBeenCalledWith(
      { input: 'Summarize.' },
      expect.any(AbortSignal),
    );
  });

  it('routes only explicitly granted privileged capabilities', async () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['GM_openInTab'],
      },
    };
    const { bridge, createTab, getTab } = harness(script);
    getTab.mockResolvedValue({
      id: 42,
      index: 3,
      windowId: 8,
      incognito: false,
    } as chrome.tabs.Tab);
    createTab.mockResolvedValue({
      id: 99,
    } as chrome.tabs.Tab);
    const runtime = portHarness();
    await bridge.connect(runtime.port, {
      scriptId: script.id,
      capability: 'capability',
    });

    runtime.emitMessage({
      type: 'capability-request',
      requestId: 'open-1',
      capability: 'open-tab',
      payload: {
        url: 'https://example.org/',
        eventId: 'tab-1',
        options: { insert: true },
      },
    });

    await vi.waitFor(() => {
      expect(runtime.postMessage).toHaveBeenCalledWith({
        type: 'capability-response',
        requestId: 'open-1',
        result: { tabId: 99 },
      });
    });
    expect(createTab).toHaveBeenCalledWith({
      url: 'https://example.org/',
      active: true,
      pinned: false,
      index: 4,
      openerTabId: 42,
      windowId: 8,
    });

    runtime.emitMessage({
      type: 'capability-request',
      requestId: 'cookie-1',
      capability: 'cookie-list',
      payload: {},
    });
    expect(runtime.postMessage).toHaveBeenCalledWith({
      type: 'capability-response',
      requestId: 'cookie-1',
      error: '用户脚本能力未获授权：cookie-list',
    });
  });
});
