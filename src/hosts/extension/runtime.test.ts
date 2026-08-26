import { describe, expect, it, vi } from 'vitest';
import type { UserscriptRuntimeState } from '../../userscript/domain/types';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import type { ExtensionApi, ExtensionMessageListener } from './api';
import { ExtensionUserscriptRuntime } from './runtime';

function extensionApi(
  runtimeState?: UserscriptRuntimeState,
  invocationResponse: unknown = {},
) {
  const listeners = new Set<ExtensionMessageListener>();
  const sendMessage = vi.fn(async (message: unknown) => {
    const request = message as { type?: string };
    if (request.type === 'get-page-context') {
      return { tabId: 42, frameId: 0 };
    }
    if (request.type === 'get-runtime-state') {
      return runtimeState ? { state: runtimeState } : {};
    }
    if (request.type === 'invoke-command') return invocationResponse;
    return {};
  });
  const api = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (listener: ExtensionMessageListener) =>
          listeners.add(listener),
        removeListener: (listener: ExtensionMessageListener) =>
          listeners.delete(listener),
      },
    },
  } as unknown as ExtensionApi;
  return {
    api,
    emitMessage: (message: unknown) => {
      for (const listener of listeners) {
        listener(message, {} as chrome.runtime.MessageSender, () => undefined);
      }
    },
    sendMessage,
  };
}

const context = {
  url: 'http://127.0.0.1:5173/extension-fixture',
  frameId: 0,
  topFrame: true,
};

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ExtensionUserscriptRuntime', () => {
  it('keeps an initial eligible registration pending without requiring refresh', async () => {
    const { api } = extensionApi();
    const runtime = new ExtensionUserscriptRuntime(api);
    await flushPromises();

    const state = runtime.synchronizeState(INITIAL_USERSCRIPTS[0], context);
    await flushPromises();

    expect(state).toMatchObject({
      tabId: 42,
      status: 'running',
      pendingRefresh: false,
    });
    runtime.dispose();
  });

  it('marks a newly matching SPA projection as refresh-required', async () => {
    const { api } = extensionApi();
    const runtime = new ExtensionUserscriptRuntime(api);
    const states: UserscriptRuntimeState[] = [];
    runtime.subscribe((_scriptId, state) => states.push(state));
    await flushPromises();

    runtime.synchronizeState(INITIAL_USERSCRIPTS[0], {
      ...context,
      softNavigation: true,
    });
    await flushPromises();

    expect(states.at(-1)).toMatchObject({
      tabId: 42,
      status: 'idle',
      pendingRefresh: true,
    });
    runtime.dispose();
  });

  it('uses the concrete top-frame instance when the background has one', async () => {
    const ready: UserscriptRuntimeState = {
      tabId: 42,
      frameId: 0,
      instanceId: 'instance-1',
      status: 'ready',
      commands: [],
      pendingRefresh: false,
    };
    const { api } = extensionApi(ready);
    const runtime = new ExtensionUserscriptRuntime(api);
    const states: UserscriptRuntimeState[] = [];
    runtime.subscribe((_scriptId, state) => states.push(state));
    await flushPromises();

    runtime.synchronizeState(INITIAL_USERSCRIPTS[0], {
      ...context,
      softNavigation: true,
    });
    await flushPromises();

    expect(states.at(-1)).toEqual(ready);
    runtime.dispose();
  });

  it('ignores a stale runtime response after a newer projection wins', async () => {
    const listeners = new Set<ExtensionMessageListener>();
    let resolveRuntime:
      | ((value: { state: UserscriptRuntimeState }) => void)
      | undefined;
    const api = {
      runtime: {
        sendMessage: vi.fn((message: { type?: string }) => {
          if (message.type === 'get-page-context') {
            return Promise.resolve({ tabId: 42, frameId: 0 });
          }
          return new Promise<{ state: UserscriptRuntimeState }>((resolve) => {
            resolveRuntime = resolve;
          });
        }),
        onMessage: {
          addListener: (listener: ExtensionMessageListener) =>
            listeners.add(listener),
          removeListener: (listener: ExtensionMessageListener) =>
            listeners.delete(listener),
        },
      },
    } as unknown as ExtensionApi;
    const runtime = new ExtensionUserscriptRuntime(api);
    const states: UserscriptRuntimeState[] = [];
    runtime.subscribe((_scriptId, state) => states.push(state));
    await flushPromises();

    runtime.synchronizeState(INITIAL_USERSCRIPTS[0], context);
    const sleeping = {
      ...INITIAL_USERSCRIPTS[0],
      manager: { ...INITIAL_USERSCRIPTS[0].manager, enabled: false },
    };
    runtime.synchronizeState(sleeping, context);
    resolveRuntime?.({
      state: {
        tabId: 42,
        frameId: 0,
        instanceId: 'stale',
        status: 'ready',
        commands: [],
        pendingRefresh: false,
      },
    });
    await flushPromises();

    expect(states.at(-1)?.status).toBe('sleeping');
    expect(states.at(-1)?.instanceId).toBeNull();
    runtime.dispose();
  });

  it('ignores late runtime events after a script becomes disabled', async () => {
    const { api, emitMessage } = extensionApi();
    const runtime = new ExtensionUserscriptRuntime(api);
    const states: UserscriptRuntimeState[] = [];
    runtime.subscribe((_scriptId, state) => states.push(state));
    await flushPromises();

    runtime.synchronizeState(INITIAL_USERSCRIPTS[0], context);
    runtime.synchronizeState(
      {
        ...INITIAL_USERSCRIPTS[0],
        manager: { ...INITIAL_USERSCRIPTS[0].manager, enabled: false },
      },
      context,
    );
    emitMessage({
      channel: 'card-master',
      type: 'runtime-state',
      scriptId: INITIAL_USERSCRIPTS[0].id,
      state: {
        tabId: 42,
        frameId: 0,
        instanceId: 'late-instance',
        status: 'ready',
        commands: [{ id: 'late', title: 'Late', autoClose: true, order: 0 }],
        pendingRefresh: false,
      },
    });

    expect(states.at(-1)).toMatchObject({
      status: 'sleeping',
      commands: [],
    });
    runtime.dispose();
  });

  it('allows a later successful instance to clear a runtime error', async () => {
    const { api, emitMessage } = extensionApi({
      tabId: 42,
      frameId: 0,
      instanceId: null,
      status: 'error',
      commands: [],
      error: 'Previous execution failed.',
      pendingRefresh: true,
    });
    const runtime = new ExtensionUserscriptRuntime(api);
    const states: UserscriptRuntimeState[] = [];
    runtime.subscribe((_scriptId, state) => states.push(state));
    await flushPromises();
    runtime.synchronizeState(INITIAL_USERSCRIPTS[0], context);
    await flushPromises();

    emitMessage({
      channel: 'card-master',
      type: 'runtime-state',
      scriptId: INITIAL_USERSCRIPTS[0].id,
      state: {
        tabId: 42,
        frameId: 0,
        instanceId: 'recovered-instance',
        status: 'ready',
        commands: [],
        pendingRefresh: false,
      },
    });

    expect(states.at(-1)).toMatchObject({
      status: 'ready',
      instanceId: 'recovered-instance',
    });
    expect(states.at(-1)?.error).toBeUndefined();
    runtime.dispose();
  });

  it('does not block a matching script for non-fatal compatibility warnings', async () => {
    const { api } = extensionApi();
    const runtime = new ExtensionUserscriptRuntime(api);
    await flushPromises();
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['GM_futureCapability'],
      },
    };

    const state = runtime.synchronizeState(script, context);

    expect(state.status).toBe('running');
    expect(state.error).toBeUndefined();
    runtime.dispose();
  });

  it('returns the structured value produced by a runtime command', async () => {
    const { api } = extensionApi(undefined, {
      ok: true,
      value: { removed: 12, mode: 'strict' },
    });
    const runtime = new ExtensionUserscriptRuntime(api);

    await expect(
      runtime.invoke(INITIAL_USERSCRIPTS[0].id, 'command-1'),
    ).resolves.toEqual({ removed: 12, mode: 'strict' });
    runtime.dispose();
  });

  it('clears stale commands when the background no longer has the instance', async () => {
    const ready: UserscriptRuntimeState = {
      tabId: 42,
      frameId: 0,
      instanceId: 'instance-1',
      status: 'ready',
      commands: [
        {
          id: 'command-1',
          title: '执行',
          autoClose: true,
          order: 0,
        },
      ],
      pendingRefresh: false,
    };
    const { api } = extensionApi(ready, {
      error: 'The script instance is not running.',
      code: 'instance-not-running',
    });
    const runtime = new ExtensionUserscriptRuntime(api);
    const states: UserscriptRuntimeState[] = [];
    runtime.subscribe((_scriptId, state) => states.push(state));
    await flushPromises();
    runtime.synchronizeState(INITIAL_USERSCRIPTS[0], context);
    await flushPromises();

    await expect(
      runtime.invoke(INITIAL_USERSCRIPTS[0].id, 'command-1'),
    ).rejects.toThrow('当前脚本实例未运行，请刷新页面后重试。');
    expect(states.at(-1)).toMatchObject({
      instanceId: null,
      status: 'idle',
      commands: [],
      pendingRefresh: true,
    });
    runtime.dispose();
  });

  it('removes a command that the live instance has unregistered', async () => {
    const ready: UserscriptRuntimeState = {
      tabId: 42,
      frameId: 0,
      instanceId: 'instance-1',
      status: 'ready',
      commands: [
        {
          id: 'command-1',
          title: '执行',
          autoClose: true,
          order: 0,
        },
      ],
      pendingRefresh: false,
    };
    const { api } = extensionApi(ready, {
      error: 'The runtime command is no longer registered.',
      code: 'command-not-registered',
    });
    const runtime = new ExtensionUserscriptRuntime(api);
    const states: UserscriptRuntimeState[] = [];
    runtime.subscribe((_scriptId, state) => states.push(state));
    await flushPromises();
    runtime.synchronizeState(INITIAL_USERSCRIPTS[0], context);
    await flushPromises();

    await expect(
      runtime.invoke(INITIAL_USERSCRIPTS[0].id, 'command-1'),
    ).rejects.toThrow('该脚本指令已失效，牌阵状态已经刷新。');
    expect(states.at(-1)?.commands).toEqual([]);
    expect(states.at(-1)?.instanceId).toBe('instance-1');
    runtime.dispose();
  });
});
