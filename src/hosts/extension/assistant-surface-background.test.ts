import { describe, expect, it, vi } from 'vitest';

import type { ExtensionBackgroundApi } from './api';
import {
  AssistantSurfaceCoordinator,
  normalizeAssistantPanelMode,
} from './assistant-surface-background';
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
  return {
    onConnect,
    onCreated,
    onInstalled,
    onStartup,
    open,
    setOptions,
    value,
  };
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

  it('does not report failure when tab configuration fails due to restricted browser page', async () => {
    const test = api();
    const report = vi.fn();
    test.setOptions.mockRejectedValueOnce(
      new Error('Cannot access a chrome:// URL'),
    );
    const coordinator = new AssistantSurfaceCoordinator(test.value, report);
    coordinator.install();

    test.onCreated.emit({ id: 9 } as chrome.tabs.Tab);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(report).not.toHaveBeenCalled();
  });

  it('skips configuring tabs on restricted browser schemes during existing tab configuration', async () => {
    const test = api();
    const report = vi.fn();
    (
      test.value.tabs.query as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce([
      { id: 1, url: 'chrome://extensions' },
      { id: 2, url: 'arc://flags' },
      { id: 3, url: 'https://example.com' },
    ]);
    const coordinator = new AssistantSurfaceCoordinator(test.value, report);
    coordinator.install();

    test.onStartup.emit();
    await vi.waitFor(() => expect(test.setOptions).toHaveBeenCalledTimes(1));

    expect(test.setOptions).toHaveBeenCalledWith({
      tabId: 3,
      path: 'assistant.html?tabId=3',
      enabled: true,
    });
    expect(report).not.toHaveBeenCalled();
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
      state: 'normal',
      width: 480,
      height: 900,
      focused: true,
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

  describe('assistant panel mode preference', () => {
    it('normalizes preference values correctly', () => {
      expect(normalizeAssistantPanelMode('popup')).toBe('popup');
      expect(normalizeAssistantPanelMode('sidePanel')).toBe('sidePanel');
      expect(normalizeAssistantPanelMode(undefined)).toBe('sidePanel');
      expect(normalizeAssistantPanelMode('other')).toBe('sidePanel');
    });

    it('switches to popup surface and creates a popup window', async () => {
      const test = api();
      const create = vi.fn(async () => undefined);
      test.value.windows = { create } as ExtensionBackgroundApi['windows'];
      test.value.runtime.getURL = vi.fn(
        (path: string) => `chrome-extension://id/${path}`,
      );
      const coordinator = new AssistantSurfaceCoordinator(test.value);

      coordinator.setSurfacePreference('popup');
      await coordinator.open(7);

      expect(create).toHaveBeenCalledWith({
        url: 'chrome-extension://id/assistant.html?tabId=7',
        type: 'popup',
        state: 'normal',
        width: 480,
        height: 900,
        focused: true,
      });
      expect(test.open).not.toHaveBeenCalled();
    });

    it('switches back to sidePanel surface from popup', async () => {
      const test = api();
      const create = vi.fn(async () => undefined);
      test.value.windows = { create } as ExtensionBackgroundApi['windows'];
      test.value.runtime.getURL = vi.fn(
        (path: string) => `chrome-extension://id/${path}`,
      );
      const coordinator = new AssistantSurfaceCoordinator(test.value, 'popup');

      coordinator.setSurfacePreference('sidePanel');
      await coordinator.open(7);

      expect(test.open).toHaveBeenCalledWith({ tabId: 7 });
      expect(create).not.toHaveBeenCalled();
    });

    it('dispatches native sidebar immediately and synchronously on cold start in Firefox without microtask delay', async () => {
      const test = api();
      Reflect.deleteProperty(test.value, 'sidePanel');
      test.value.sidebarAction = { open: test.open, setPanel: test.setOptions };
      const coordinator = new AssistantSurfaceCoordinator(test.value);
      let resolveReady: () => void = () => undefined;
      const readyPromise = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });
      coordinator.setPreferenceReady(readyPromise);

      const pendingOpen = coordinator.open(7);

      // Must be called immediately in the same tick to preserve user action!
      expect(test.open).toHaveBeenCalledWith();

      resolveReady();
      await pendingOpen;
    });

    it('awaits preference in non-Firefox environment to prevent premature native sidebar dispatch', async () => {
      const test = api();
      const create = vi.fn(async () => undefined);
      test.value.windows = { create } as ExtensionBackgroundApi['windows'];
      test.value.runtime.getURL = vi.fn(
        (path: string) => `chrome-extension://id/${path}`,
      );
      const coordinator = new AssistantSurfaceCoordinator(test.value);
      let resolveReady: () => void = () => undefined;
      const readyPromise = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });
      coordinator.setPreferenceReady(readyPromise);

      const pendingOpen = coordinator.open(7);

      // In non-Firefox (Chromium/Arc), wait for preference before opening
      expect(test.open).not.toHaveBeenCalled();

      coordinator.setSurfacePreference('popup');
      resolveReady();

      await pendingOpen;

      expect(create).toHaveBeenCalledWith({
        url: 'chrome-extension://id/assistant.html?tabId=7',
        type: 'popup',
        state: 'normal',
        width: 480,
        height: 900,
        focused: true,
      });
      expect(test.open).not.toHaveBeenCalled();
    });

    it('catches up and opens popup surface when cold start preference resolves to popup in Firefox', async () => {
      const test = api();
      Reflect.deleteProperty(test.value, 'sidePanel');
      test.value.sidebarAction = { open: test.open, setPanel: test.setOptions };
      const create = vi.fn(async () => undefined);
      test.value.windows = { create } as ExtensionBackgroundApi['windows'];
      test.value.runtime.getURL = vi.fn(
        (path: string) => `chrome-extension://id/${path}`,
      );
      const coordinator = new AssistantSurfaceCoordinator(test.value);

      let resolveReady: () => void = () => undefined;
      const readyPromise = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });
      coordinator.setPreferenceReady(readyPromise);

      const pendingOpen = coordinator.open(7);

      expect(test.open).toHaveBeenCalledWith();
      expect(create).not.toHaveBeenCalled();

      coordinator.setSurfacePreference('popup');
      resolveReady();

      await pendingOpen;

      await vi.waitFor(() =>
        expect(create).toHaveBeenCalledWith({
          url: 'chrome-extension://id/assistant.html?tabId=7',
          type: 'popup',
          state: 'normal',
          width: 480,
          height: 900,
          focused: true,
        }),
      );
    });

    it('catches up and opens popup surface even if premature native sidebar connected lifecycle port during cold start', async () => {
      const test = api();
      Reflect.deleteProperty(test.value, 'sidePanel');
      test.value.sidebarAction = { open: test.open, setPanel: test.setOptions };
      const create = vi.fn(async () => undefined);
      test.value.windows = { create } as ExtensionBackgroundApi['windows'];
      test.value.runtime.getURL = vi.fn(
        (path: string) => `chrome-extension://id/${path}`,
      );
      const coordinator = new AssistantSurfaceCoordinator(test.value);
      coordinator.install();

      let resolveReady: () => void = () => undefined;
      const readyPromise = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });
      coordinator.setPreferenceReady(readyPromise);

      const pendingOpen = coordinator.open(7);
      expect(test.open).toHaveBeenCalledWith();

      // Premature side panel opens and connects lifecycle port:
      test.onConnect.emit(port(assistantSurfaceLifecyclePortName(7)).port);

      coordinator.setSurfacePreference('popup');
      resolveReady();

      await pendingOpen;

      await vi.waitFor(() =>
        expect(create).toHaveBeenCalledWith({
          url: 'chrome-extension://id/assistant.html?tabId=7',
          type: 'popup',
          state: 'normal',
          width: 480,
          height: 900,
          focused: true,
        }),
      );
    });

    it('calculates right-docked sidebar bounds based on current browser window', async () => {
      const test = api();
      const create = vi.fn(async () => undefined);
      const update = vi.fn(async () => undefined);
      const getCurrent = vi.fn(async () => ({
        id: 101,
        left: 100,
        top: 25,
        width: 2370,
        height: 1664,
      }));
      test.value.windows = {
        create,
        update,
        getCurrent,
      } as unknown as ExtensionBackgroundApi['windows'];
      test.value.runtime.getURL = vi.fn(
        (path: string) => `chrome-extension://id/${path}`,
      );
      const coordinator = new AssistantSurfaceCoordinator(test.value, 'popup');

      await coordinator.open(7);

      // Expected right edge: 100 + 2370 - 480 = 1990
      expect(create).toHaveBeenCalledWith({
        url: 'chrome-extension://id/assistant.html?tabId=7',
        type: 'popup',
        state: 'normal',
        left: 1990,
        top: 25,
        width: 480,
        height: 1664,
        focused: true,
      });
    });

    it('clears preferenceReady so subsequent opens run directly without microtask delay', async () => {
      const test = api();
      const coordinator = new AssistantSurfaceCoordinator(test.value);
      const readyPromise = Promise.resolve();
      coordinator.setPreferenceReady(readyPromise);

      await readyPromise;

      const openPromise = coordinator.open(7);
      expect(test.open).toHaveBeenCalledWith({ tabId: 7 });
      await openPromise;
    });

    it('awaits preferenceReady when coordinator is configured for popup mode', async () => {
      const test = api();
      const create = vi.fn(async () => undefined);
      test.value.windows = { create } as ExtensionBackgroundApi['windows'];
      test.value.runtime.getURL = vi.fn(
        (path: string) => `chrome-extension://id/${path}`,
      );
      const coordinator = new AssistantSurfaceCoordinator(test.value, 'popup');

      let resolveReady: () => void = () => undefined;
      const readyPromise = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });
      coordinator.setPreferenceReady(readyPromise);

      const pendingOpen = coordinator.open(7);
      expect(create).not.toHaveBeenCalled();

      resolveReady();
      await pendingOpen;

      expect(create).toHaveBeenCalledWith({
        url: 'chrome-extension://id/assistant.html?tabId=7',
        type: 'popup',
        state: 'normal',
        width: 480,
        height: 900,
        focused: true,
      });
    });

    it('calculates bounds using tab windowId when api.tabs.get and api.windows.get are available', async () => {
      const test = api();
      const create = vi.fn(async () => undefined);
      const getWindow = vi.fn(async (winId: number) => ({
        id: winId,
        left: 200,
        top: 50,
        width: 1920,
        height: 1080,
      }));
      test.value.tabs.get = vi.fn(
        async (tabId: number) =>
          ({
            id: tabId,
            windowId: 88,
          }) as chrome.tabs.Tab,
      );
      test.value.windows = {
        create,
        get: getWindow,
      } as unknown as ExtensionBackgroundApi['windows'];
      test.value.runtime.getURL = vi.fn(
        (path: string) => `chrome-extension://id/${path}`,
      );
      const coordinator = new AssistantSurfaceCoordinator(test.value, 'popup');

      await coordinator.open(7);

      // Expected right edge: 200 + 1920 - 480 = 1640
      expect(create).toHaveBeenCalledWith({
        url: 'chrome-extension://id/assistant.html?tabId=7',
        type: 'popup',
        state: 'normal',
        left: 1640,
        top: 50,
        width: 480,
        height: 1080,
        focused: true,
      });
      expect(test.value.tabs.get).toHaveBeenCalledWith(7);
      expect(getWindow).toHaveBeenCalledWith(88);
    });
  });
});
