import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SPONSOR_RUNTIME_MESSAGE,
  SPONSOR_STORAGE_CHANGED,
} from './sponsor-runtime';
import { installSponsorRuntimeAdapter } from './sponsor-runtime-adapter';

function eventHarness() {
  const listeners = new Set<(...args: unknown[]) => unknown>();
  return {
    addListener: vi.fn((listener: (...args: unknown[]) => unknown) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener: (...args: unknown[]) => unknown) => {
      listeners.delete(listener);
    }),
    dispatch(...args: unknown[]) {
      return [...listeners].map((listener) => listener(...args));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (
    globalThis as typeof globalThis & {
      __cardMasterSponsorRuntimes?: unknown;
    }
  ).__cardMasterSponsorRuntimes;
});

describe('Sponsor runtime adapter', () => {
  it('delivers scoped runtime messages only to their owning vendor', () => {
    const onMessage = eventHarness();
    const onMessageExternal = eventHarness();
    const onConnect = eventHarness();
    const sendTabMessage = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'extension-id',
        getManifest: () => ({ manifest_version: 3 }),
        getURL: (path: string) => `extension://${path}`,
        sendMessage: vi.fn(async () => undefined),
        connect: vi.fn(),
        onMessage,
        onMessageExternal,
        onConnect,
      },
      storage: {
        onChanged: eventHarness(),
      },
      tabs: {
        sendMessage: sendTabMessage,
      },
      i18n: {
        getMessage: (name: string) => name,
      },
    });

    installSponsorRuntimeAdapter({
      runtimeId: 'bilibili',
      assetRoot: 'vendor/bilibili/sponsor',
      localePrefix: 'sponsor_bilibili_',
      pageHosts: ['bilibili.com'],
    });
    installSponsorRuntimeAdapter({
      runtimeId: 'youtube',
      assetRoot: 'vendor/youtube/sponsor',
      localePrefix: 'sponsor_youtube_',
      pageHosts: ['youtube.com'],
    });

    const runtimes = (
      globalThis as typeof globalThis & {
        __cardMasterSponsorRuntimes: Record<
          string,
          {
            runtime: typeof chrome.runtime & {
              sendTabMessage: typeof chrome.tabs.sendMessage;
            };
            storage: {
              onChanged: typeof chrome.storage.onChanged;
            };
          }
        >;
      }
    ).__cardMasterSponsorRuntimes;
    const bilibiliListener = vi.fn();
    const youtubeListener = vi.fn();
    runtimes.bilibili.runtime.onMessage.addListener(bilibiliListener);
    runtimes.youtube.runtime.onMessage.addListener(youtubeListener);

    onMessage.dispatch(
      {
        type: SPONSOR_RUNTIME_MESSAGE,
        runtimeId: 'youtube',
        payload: { message: 'refreshSegments' },
      },
      {},
      vi.fn(),
    );

    expect(youtubeListener).toHaveBeenCalledWith(
      { message: 'refreshSegments' },
      {},
      expect.any(Function),
    );
    expect(bilibiliListener).not.toHaveBeenCalled();

    runtimes.youtube.runtime.sendTabMessage(17, {
      message: 'refreshSegments',
    });
    expect(sendTabMessage).toHaveBeenCalledWith(17, {
      type: SPONSOR_RUNTIME_MESSAGE,
      runtimeId: 'youtube',
      payload: { message: 'refreshSegments' },
    });
  });

  it('delivers storage changes only to the matching runtime and area', () => {
    const onMessage = eventHarness();
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'extension-id',
        getManifest: () => ({ manifest_version: 3 }),
        getURL: (path: string) => `extension://${path}`,
        sendMessage: vi.fn(async () => undefined),
        connect: vi.fn(),
        onMessage,
        onMessageExternal: eventHarness(),
        onConnect: eventHarness(),
      },
      storage: {
        onChanged: eventHarness(),
      },
      tabs: {
        sendMessage: vi.fn(),
      },
      i18n: {
        getMessage: (name: string) => name,
      },
    });

    installSponsorRuntimeAdapter({
      runtimeId: 'youtube',
      assetRoot: 'vendor/youtube/sponsor',
      localePrefix: 'sponsor_youtube_',
      pageHosts: ['youtube.com'],
    });

    const runtime = (
      globalThis as typeof globalThis & {
        __cardMasterSponsorRuntimes: Record<
          string,
          {
            storage: {
              sync: chrome.storage.StorageArea;
              local: chrome.storage.StorageArea;
            };
          }
        >;
      }
    ).__cardMasterSponsorRuntimes.youtube;
    const syncListener = vi.fn();
    const localListener = vi.fn();
    runtime.storage.sync.onChanged.addListener(syncListener);
    runtime.storage.local.onChanged.addListener(localListener);

    onMessage.dispatch({
      type: SPONSOR_STORAGE_CHANGED,
      runtimeId: 'youtube',
      areaName: 'sync',
      changes: {
        disableSkipping: { newValue: false },
      },
    });

    expect(syncListener).toHaveBeenCalledWith(
      { disableSkipping: { newValue: false } },
      'sync',
    );
    expect(localListener).not.toHaveBeenCalled();
  });

  it('does not leak storage events into vendor runtime message listeners', () => {
    const onMessage = eventHarness();
    vi.stubGlobal('location', {
      protocol: 'https:',
      hostname: 'www.youtube.com',
    });
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'extension-id',
        getManifest: () => ({ manifest_version: 3 }),
        getURL: (path: string) => `extension://${path}`,
        sendMessage: vi.fn(async () => undefined),
        connect: vi.fn(),
        onMessage,
        onMessageExternal: eventHarness(),
        onConnect: eventHarness(),
      },
      storage: {
        onChanged: eventHarness(),
      },
      tabs: {
        sendMessage: vi.fn(),
      },
      i18n: {
        getMessage: (name: string) => name,
      },
    });

    installSponsorRuntimeAdapter({
      runtimeId: 'youtube',
      assetRoot: 'vendor/youtube/sponsor',
      localePrefix: 'sponsor_youtube_',
      pageHosts: ['youtube.com'],
    });

    const runtime = (
      globalThis as typeof globalThis & {
        __cardMasterSponsorRuntimes: Record<
          string,
          { runtime: typeof chrome.runtime }
        >;
      }
    ).__cardMasterSponsorRuntimes.youtube;
    const listener = vi.fn();
    runtime.runtime.onMessage.addListener(listener);

    onMessage.dispatch({
      type: SPONSOR_STORAGE_CHANGED,
      runtimeId: 'bilibili',
      areaName: 'sync',
      changes: {},
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not deliver foreign extension protocols to the vendor listener', () => {
    const onMessage = eventHarness();
    vi.stubGlobal('location', {
      protocol: 'https:',
      hostname: 'www.bilibili.com',
    });
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'extension-id',
        getManifest: () => ({ manifest_version: 3 }),
        getURL: (path: string) => `extension://${path}`,
        sendMessage: vi.fn(async () => undefined),
        connect: vi.fn(),
        onMessage,
        onMessageExternal: eventHarness(),
        onConnect: eventHarness(),
      },
      storage: {
        onChanged: eventHarness(),
      },
      tabs: {
        sendMessage: vi.fn(),
      },
      i18n: {
        getMessage: (name: string) => name,
      },
    });

    installSponsorRuntimeAdapter({
      runtimeId: 'bilibili',
      assetRoot: 'vendor/bilibili/sponsor',
      localePrefix: 'sponsor_bilibili_',
      pageHosts: ['bilibili.com'],
    });

    const runtime = (
      globalThis as typeof globalThis & {
        __cardMasterSponsorRuntimes: Record<
          string,
          { runtime: typeof chrome.runtime }
        >;
      }
    ).__cardMasterSponsorRuntimes.bilibili;
    const listener = vi.fn();
    runtime.runtime.onMessage.addListener(listener);
    const sendResponse = vi.fn();

    onMessage.dispatch({ Message: 'getKey' }, {}, sendResponse);
    onMessage.dispatch(
      {
        channel: 'card-master-extension',
        type: 'deck-entry-settings-read',
      },
      {},
      sendResponse,
    );
    expect(listener).not.toHaveBeenCalled();

    onMessage.dispatch({ message: 'getVideoID' }, {}, sendResponse);
    expect(listener).toHaveBeenCalledWith(
      { message: 'getVideoID' },
      {},
      sendResponse,
    );
  });

  it('cleans up reload-invalidated runtimes without reading native events again', () => {
    const onMessage = eventHarness();
    const onMessageExternal = eventHarness();
    const onConnect = eventHarness();
    const removeWindowListener = vi.fn();
    let invalidated = false;
    const runtime = {
      get id() {
        if (invalidated) throw new Error('Extension context invalidated.');
        return 'extension-id';
      },
      getManifest: () => ({ manifest_version: 3 }),
      getURL: (path: string) => `extension://${path}`,
      sendMessage: vi.fn(async () => undefined),
      connect: vi.fn(),
      get onMessage() {
        if (invalidated) throw new Error('Extension context invalidated.');
        return onMessage;
      },
      get onMessageExternal() {
        if (invalidated) throw new Error('Extension context invalidated.');
        return onMessageExternal;
      },
      get onConnect() {
        if (invalidated) throw new Error('Extension context invalidated.');
        return onConnect;
      },
    };
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: removeWindowListener,
    });
    vi.stubGlobal('chrome', {
      runtime,
      storage: {
        onChanged: eventHarness(),
      },
      tabs: {
        sendMessage: vi.fn(),
      },
      i18n: {
        getMessage: (name: string) => name,
      },
    });

    const deactivate = installSponsorRuntimeAdapter({
      runtimeId: 'bilibili',
      assetRoot: 'vendor/bilibili/sponsor',
      localePrefix: 'sponsor_bilibili_',
      pageHosts: ['bilibili.com'],
    });
    invalidated = true;

    expect(() => deactivate()).not.toThrow();
    expect(removeWindowListener).not.toHaveBeenCalled();
    expect(onMessage.removeListener).toHaveBeenCalled();
    expect(onMessageExternal.removeListener).toHaveBeenCalledTimes(0);
    expect(onConnect.removeListener).toHaveBeenCalledTimes(0);
  });
});
