import { describe, expect, it, vi } from 'vitest';

import {
  USERSCRIPT_REQUEST_HEADER_RULE_ID,
  USERSCRIPT_WEB_REQUEST_RULE_ID_START,
} from '../../userscript/runtime/capabilities';
import type { ExtensionBackgroundApi } from './api';
import { UserscriptCapabilityService } from './userscript-capability-service';

function event<Listener extends (...args: never[]) => unknown>() {
  let listener: Listener | undefined;
  return {
    api: {
      addListener: vi.fn((next: Listener) => {
        listener = next;
      }),
      removeListener: vi.fn(),
    },
    emit: (...args: Parameters<Listener>) => listener?.(...args),
  };
}

function harness(sessionRules: chrome.declarativeNetRequest.Rule[] = []) {
  const tabRemoved = event<(tabId: number) => void>();
  const tabUpdated =
    event<
      (
        tabId: number,
        changeInfo: { mutedInfo?: chrome.tabs.MutedInfo },
        tab: chrome.tabs.Tab,
      ) => void
    >();
  const notificationClicked = event<(notificationId: string) => void>();
  const notificationClosed =
    event<(notificationId: string, byUser: boolean) => void>();
  const downloadChanged =
    event<(delta: chrome.downloads.DownloadDelta) => void>();
  const beforeRequest =
    event<
      (
        details: chrome.webRequest.OnBeforeRequestDetails,
      ) => chrome.webRequest.BlockingResponse | undefined
    >();
  const storage = new Map<string, unknown>();
  const updateSessionRules = vi.fn(async () => undefined);
  const createNotification = vi.fn(async () => 'notification-1');
  const api = {
    cookies: {
      getAllCookieStores: vi.fn(async () => [{ id: 'store-2', tabIds: [3] }]),
      getAll: vi.fn(async () => []),
      remove: vi.fn(async () => null),
      set: vi.fn(async () => null),
    },
    declarativeNetRequest: {
      getSessionRules: vi.fn(async () => sessionRules),
      updateSessionRules,
    },
    downloads: {
      cancel: vi.fn(async () => undefined),
      download: vi.fn(async () => 7),
      onChanged: downloadChanged.api,
      search: vi.fn(async () => [
        {
          id: 7,
          state: 'complete',
          bytesReceived: 64,
          totalBytes: 64,
        },
      ]),
    },
    notifications: {
      clear: vi.fn(async () => true),
      create: createNotification,
      onClicked: notificationClicked.api,
      onClosed: notificationClosed.api,
    },
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
    storage: {
      session: {
        get: vi.fn(async (key: string | null) =>
          key === null
            ? Object.fromEntries(storage)
            : { [key]: storage.get(key) },
        ),
        set: vi.fn(async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values)) {
            storage.set(key, value);
          }
        }),
      },
    },
    tabs: {
      create: vi.fn(async () => ({ id: 9 }) as chrome.tabs.Tab),
      get: vi.fn(
        async () =>
          ({
            id: 3,
            index: 1,
            windowId: 2,
            incognito: false,
            mutedInfo: { muted: false },
          }) as chrome.tabs.Tab,
      ),
      onRemoved: tabRemoved.api,
      onUpdated: tabUpdated.api,
      remove: vi.fn(async () => undefined),
      update: vi.fn(
        async (_tabId: number, properties: chrome.tabs.UpdateProperties) =>
          ({
            id: 3,
            mutedInfo: { muted: properties.muted ?? false },
          }) as chrome.tabs.Tab,
      ),
    },
    webRequest: {
      onBeforeRequest: beforeRequest.api,
    },
    windows: {
      create: vi.fn(),
    },
  } as unknown as ExtensionBackgroundApi;
  const events: unknown[] = [];
  const context = {
    runtimeId: '3:0:script-one',
    scriptId: 'script-one',
    tabId: 3,
    frameId: 0,
    sourceUrl: 'https://example.com/page',
    post: (message: unknown) => events.push(message),
  };

  return {
    api,
    beforeRequest,
    context,
    createNotification,
    downloadChanged,
    events,
    notificationClicked,
    notificationClosed,
    service: new UserscriptCapabilityService(api),
    updateSessionRules,
  };
}

describe('UserscriptCapabilityService', () => {
  it('persists tab data and scopes empty cookie queries to the current page', async () => {
    const { api, context, service } = harness();

    await service.request(context, 'tab-data-save', { theme: 'dark' });
    await expect(
      service.request(context, 'tab-data-get', undefined),
    ).resolves.toEqual({ theme: 'dark' });
    await service.request(context, 'cookie-list', {});

    expect(api.cookies?.getAll).toHaveBeenCalledWith({
      storeId: 'store-2',
      url: 'https://example.com/page',
    });
  });

  it('uses an explicit cookie store instead of the current tab store', async () => {
    const { api, context, service } = harness();

    await service.request(context, 'cookie-set', {
      url: 'https://example.com/',
      name: 'session',
      value: 'one',
      storeId: 'explicit-store',
    });
    await service.request(context, 'cookie-delete', {
      url: 'https://example.com/',
      name: 'session',
      storeId: 'explicit-store',
    });

    expect(api.cookies?.set).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 'explicit-store' }),
    );
    expect(api.cookies?.remove).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 'explicit-store' }),
    );
    expect(api.cookies?.getAllCookieStores).not.toHaveBeenCalled();
  });

  it('retries invalid notification icons and forwards lifecycle events', async () => {
    const {
      context,
      createNotification,
      events,
      notificationClicked,
      notificationClosed,
      service,
    } = harness();
    createNotification
      .mockRejectedValueOnce(new Error('Invalid icon'))
      .mockResolvedValueOnce('notification-1');

    await service.request(context, 'notification-create', {
      eventId: 'notice-1',
      details: {
        title: '完成',
        text: '脚本任务已完成。',
        image: 'https://example.com/broken.png',
      },
    });
    notificationClicked.emit('notification-1');
    notificationClosed.emit('notification-1', true);

    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      expect.objectContaining({
        capability: 'notification',
        event: 'clicked',
        eventId: 'notice-1',
      }),
      expect.objectContaining({
        capability: 'notification',
        event: 'closed',
        eventId: 'notice-1',
        data: { byUser: true },
      }),
    ]);
  });

  it('publishes completed download progress', async () => {
    const { context, downloadChanged, events, service } = harness();
    await service.request(context, 'download-start', {
      eventId: 'download-1',
      details: { url: 'https://example.com/file.zip', name: 'file.zip' },
    });

    downloadChanged.emit({
      id: 7,
      state: { current: 'complete', previous: 'in_progress' },
    });
    await vi.waitFor(() => expect(events).toHaveLength(1));

    expect(events[0]).toEqual(
      expect.objectContaining({
        capability: 'download',
        eventId: 'download-1',
        data: expect.objectContaining({
          state: 'complete',
          bytesReceived: 64,
          totalBytes: 64,
        }),
      }),
    );
  });

  it('translates cancellable web request rules to session DNR and observes matches', async () => {
    const { beforeRequest, context, events, service, updateSessionRules } =
      harness();
    await service.request(context, 'web-request-register', {
      eventId: 'web-1',
      rules: [
        {
          selector: 'https://ads.example.com/*',
          action: 'cancel',
        },
      ],
    });

    expect(updateSessionRules).toHaveBeenCalledWith({
      addRules: [
        expect.objectContaining({
          action: { type: 'block' },
          condition: {
            regexFilter: 'https://ads\\.example\\.com/.*',
          },
        }),
      ],
    });

    beforeRequest.emit({
      requestId: 'request-1',
      url: 'https://ads.example.com/banner.js',
      method: 'GET',
      type: 'script',
      tabId: 3,
      frameId: 0,
      parentFrameId: -1,
      timeStamp: 1,
      documentLifecycle: 'active',
      frameType: 'outermost_frame',
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        capability: 'web-request',
        eventId: 'web-1',
        data: expect.objectContaining({ ruleIndex: 0 }),
      }),
    );
  });

  it('cleans only persistent GM_webRequest rules and leaves transient header ownership isolated', async () => {
    const persistentRule = {
      id: USERSCRIPT_WEB_REQUEST_RULE_ID_START,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: '*' },
    } as chrome.declarativeNetRequest.Rule;
    const transientRule = {
      ...persistentRule,
      id: USERSCRIPT_REQUEST_HEADER_RULE_ID,
    };
    const { context, service, updateSessionRules } = harness([
      persistentRule,
      transientRule,
    ]);

    await service.request(context, 'web-request-register', {
      eventId: 'empty-web-request',
      rules: [],
    });

    expect(updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [USERSCRIPT_WEB_REQUEST_RULE_ID_START],
    });
    expect(updateSessionRules).not.toHaveBeenCalledWith({
      removeRuleIds: [USERSCRIPT_REQUEST_HEADER_RULE_ID],
    });
  });
});
