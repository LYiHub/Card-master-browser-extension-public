import { describe, expect, it, vi } from 'vitest';

import type { ExtensionBackgroundApi } from './api';
import { AssistantSurfaceCoordinator } from './assistant-surface-background';
import { assistantSurfaceLifecyclePortName } from './assistant-surface-path';

function event<Arguments extends unknown[]>() {
  type Listener = (...args: Arguments) => void;
  const listeners = new Set<Listener>();
  return {
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    emit: (...args: Arguments) => {
      for (const listener of listeners) listener(...args);
    },
  };
}

function api() {
  const onCreated = event<[tab: chrome.tabs.Tab]>();
  const onConnect = event<[port: chrome.runtime.Port]>();
  const onInstalled = event<[]>();
  const onStartup = event<[]>();
  const setOptions = vi.fn(async () => undefined);
  const open = vi.fn(async () => undefined);
  const value = {
    runtime: {
      onConnect,
      onInstalled,
      onStartup,
    },
    tabs: {
      get: vi.fn(async (tabId: number) => ({
        id: tabId,
        title: 'Example',
        url: 'https://example.com/',
      })),
      onCreated,
      query: vi.fn(async () => []),
    },
    sidePanel: {
      open,
      setOptions,
    },
  } as unknown as ExtensionBackgroundApi;
  return { onConnect, onCreated, open, setOptions, value };
}

function port(name: string) {
  const onDisconnect = event<[]>();
  const onMessage = event<[message: unknown]>();
  const postMessage = vi.fn();
  return {
    port: {
      name,
      onDisconnect,
      onMessage,
      postMessage,
    } as unknown as chrome.runtime.Port,
    disconnect: () => onDisconnect.emit(),
    postMessage,
  };
}

describe('AssistantSurfaceCoordinator', () => {
  it('opens immediately and reports a non-fatal tab configuration failure', async () => {
    const test = api();
    const report = vi.fn();
    test.setOptions.mockRejectedValueOnce(new Error('configuration failed'));
    const coordinator = new AssistantSurfaceCoordinator(test.value, report);

    await expect(coordinator.open(7)).resolves.toBeUndefined();

    expect(test.open).toHaveBeenCalledWith({ tabId: 7 });
    expect(report).toHaveBeenCalledWith(
      'tab-configuration-failed',
      expect.any(Error),
      { tabId: 7 },
    );
  });

  it('opens before tab configuration has settled', async () => {
    const test = api();
    let finishConfiguration: () => void = () => undefined;
    test.setOptions.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishConfiguration = () => resolve(undefined);
        }),
    );
    const coordinator = new AssistantSurfaceCoordinator(test.value);

    const pending = coordinator.open(7);

    expect(test.open).toHaveBeenCalledWith({ tabId: 7 });
    finishConfiguration();
    await expect(pending).resolves.toBeUndefined();
  });

  it('does not reopen an already active assistant surface', async () => {
    const test = api();
    const coordinator = new AssistantSurfaceCoordinator(test.value);
    coordinator.install();
    const active = port(assistantSurfaceLifecyclePortName(7));
    test.onConnect.emit(active.port);

    await expect(coordinator.open(7)).resolves.toBeUndefined();

    expect(test.open).not.toHaveBeenCalled();
    expect(test.setOptions).toHaveBeenCalledWith({
      tabId: 7,
      path: 'assistant.html?tabId=7',
      enabled: true,
    });

    active.disconnect();
    await expect(coordinator.open(7)).resolves.toBeUndefined();
    expect(test.open).toHaveBeenCalledWith({ tabId: 7 });
  });

  it('navigates an active panel to the requested tab', async () => {
    const test = api();
    const coordinator = new AssistantSurfaceCoordinator(test.value);
    coordinator.install();
    const active = port(assistantSurfaceLifecyclePortName(7));
    test.onConnect.emit(active.port);

    await expect(coordinator.open(7, 'settings')).resolves.toBeUndefined();

    expect(test.open).not.toHaveBeenCalled();
    expect(active.postMessage).toHaveBeenCalledWith({
      type: 'assistant-surface-navigate',
      tab: 'settings',
    });
  });

  it('configures created tabs without leaking rejected promises', async () => {
    const test = api();
    const report = vi.fn();
    test.setOptions.mockRejectedValueOnce(new Error('configuration failed'));
    const coordinator = new AssistantSurfaceCoordinator(test.value, report);
    coordinator.install();

    test.onCreated.emit({ id: 9 } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());

    expect(test.setOptions).toHaveBeenCalledWith({
      tabId: 9,
      path: 'assistant.html?tabId=9',
      enabled: true,
    });
  });

  it('returns the current tab identity without transient entry state', async () => {
    const test = api();
    const coordinator = new AssistantSurfaceCoordinator(test.value);

    await expect(coordinator.context(11)).resolves.toEqual({
      tabId: 11,
      title: 'Example',
      url: 'https://example.com/',
    });
  });

  it('keeps the assistant surface bootable after its launch tab closes', async () => {
    const test = api();
    (test.value.tabs.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('No tab with id: 11'),
    );
    const coordinator = new AssistantSurfaceCoordinator(test.value);

    await expect(coordinator.context(11)).resolves.toEqual({
      tabId: 11,
      title: '',
      url: '',
    });
  });

  it('delivers a requested initial tab once when opening a new panel', async () => {
    const test = api();
    const coordinator = new AssistantSurfaceCoordinator(test.value);

    await coordinator.open(11, 'settings');

    await expect(coordinator.context(11)).resolves.toEqual({
      tabId: 11,
      title: 'Example',
      url: 'https://example.com/',
      initialTab: 'settings',
    });
    await expect(coordinator.context(11)).resolves.toEqual({
      tabId: 11,
      title: 'Example',
      url: 'https://example.com/',
    });
  });

  it('opens a popup surface when Chromium Side Panel is absent', async () => {
    const test = api();
    const create = vi.fn(async () => undefined);
    Reflect.deleteProperty(test.value, 'sidePanel');
    Reflect.deleteProperty(test.value, 'sidebarAction');
    test.value.runtime.getURL = vi.fn(
      (path: string) => `safari-web-extension://id/${path}`,
    );
    test.value.windows = { create } as ExtensionBackgroundApi['windows'];
    const coordinator = new AssistantSurfaceCoordinator(test.value);

    await coordinator.open(7);

    expect(create).toHaveBeenCalledWith({
      url: 'safari-web-extension://id/assistant.html?tabId=7',
      type: 'popup',
      width: 480,
      height: 780,
    });
  });

  it('uses the native Firefox sidebar when Chromium Side Panel is absent', async () => {
    const test = api();
    const open = vi.fn(async () => undefined);
    const setPanel = vi.fn(async () => undefined);
    Reflect.deleteProperty(test.value, 'sidePanel');
    test.value.sidebarAction = { open, setPanel };
    const coordinator = new AssistantSurfaceCoordinator(test.value);

    await coordinator.open(7);

    expect(setPanel).toHaveBeenCalledWith({
      tabId: 7,
      panel: 'assistant.html?tabId=7',
    });
    expect(open).toHaveBeenCalledOnce();
  });

  it('does not replace the Firefox sidebar with a popup when page user activation is unavailable', async () => {
    const test = api();
    const open = vi.fn(async () => {
      throw new Error(
        'sidebarAction.open may only be called from a user input handler',
      );
    });
    const setPanel = vi.fn(async () => undefined);
    const create = vi.fn(async () => undefined);
    Reflect.deleteProperty(test.value, 'sidePanel');
    test.value.sidebarAction = { open, setPanel };
    test.value.runtime.getURL = vi.fn(
      (path: string) => `moz-extension://id/${path}`,
    );
    test.value.windows = { create } as ExtensionBackgroundApi['windows'];
    const coordinator = new AssistantSurfaceCoordinator(test.value);

    await expect(coordinator.open(7, 'settings')).rejects.toThrow(
      '请点击工具栏中的 卡牌大师图标',
    );

    expect(create).not.toHaveBeenCalled();
    await expect(coordinator.context(7)).resolves.toEqual({
      tabId: 7,
      title: 'Example',
      url: 'https://example.com/',
      initialTab: 'settings',
    });
  });

  it('does not hide unrelated Firefox sidebar failures', async () => {
    const test = api();
    Reflect.deleteProperty(test.value, 'sidePanel');
    test.value.sidebarAction = {
      open: vi.fn(async () => {
        throw new Error('sidebar unavailable');
      }),
      setPanel: vi.fn(async () => undefined),
    };
    const coordinator = new AssistantSurfaceCoordinator(test.value);

    await expect(coordinator.open(7)).rejects.toThrow('sidebar unavailable');
  });
});
