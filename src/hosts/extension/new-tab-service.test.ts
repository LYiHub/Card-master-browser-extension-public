import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExtensionNewTabService } from './new-tab-service';

afterEach(() => {
  vi.unstubAllGlobals();
});

function event() {
  return { addListener: vi.fn(), removeListener: vi.fn() };
}

function serviceApi() {
  const bookmark = {
    id: 'bookmark-1',
    title: 'Example bookmark',
    url: 'https://example.com/',
    syncing: false,
  } satisfies chrome.bookmarks.BookmarkTreeNode;
  return {
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://card-master${path}`),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        remove: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
      },
      sync: {
        get: vi.fn(async () => ({})),
        remove: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
      },
    },
    tabs: {
      create: vi.fn(async (details: chrome.tabs.CreateProperties) => ({
        id: 90,
        active: details.active ?? true,
        highlighted: false,
        incognito: false,
        pinned: false,
        selected: false,
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
        index: 0,
        windowId: 1,
      })),
      query: vi.fn(async () => [
        {
          id: 42,
          windowId: 1,
          active: true,
          title: 'Example open tab',
          url: 'https://example.com/#section',
          favIconUrl: 'https://example.com/favicon.ico',
        },
      ]),
      update: vi.fn(
        async (tabId: number, details: chrome.tabs.UpdateProperties) => ({
          id: tabId,
          active: details.active ?? false,
          highlighted: false,
          incognito: false,
          pinned: false,
          selected: false,
          discarded: false,
          autoDiscardable: true,
          groupId: -1,
          index: 0,
          windowId: 1,
        }),
      ),
      onActivated: event(),
      onCreated: event(),
      onRemoved: event(),
      onUpdated: event(),
      get: vi.fn(),
      reload: vi.fn(),
      remove: vi.fn(),
      sendMessage: vi.fn(),
    },
    windows: {
      update: vi.fn(async () => ({ id: 1 })),
    },
    history: {
      search: vi.fn(async () => [
        {
          id: 'history-1',
          title: 'Example history',
          url: 'https://example.com/?utm_source=history',
          lastVisitTime: Date.now(),
          visitCount: 20,
        },
      ]),
      deleteUrl: vi.fn(async () => undefined),
    },
    bookmarks: {
      getTree: vi.fn(async () => [
        {
          id: '0',
          title: '',
          syncing: false,
          children: [bookmark],
        },
      ]),
      search: vi.fn(async () => [bookmark]),
      create: vi.fn(async () => bookmark),
      update: vi.fn(async () => bookmark),
      move: vi.fn(async () => bookmark),
      remove: vi.fn(async () => undefined),
      removeTree: vi.fn(async () => undefined),
    },
    topSites: {
      get: vi.fn(async () => [
        { title: 'Example top site', url: 'https://example.com/' },
        { title: 'Blocked', url: 'https://blocked.example/' },
      ]),
    },
    search: {
      query: vi.fn(async () => undefined),
    },
  };
}

describe('ExtensionNewTabService', () => {
  it('reports browser capabilities without inventing unavailable Safari APIs', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Version/27.0 Safari/620.1.14',
    });
    const api = serviceApi();
    delete (api as Partial<typeof api>).history;
    delete (api as Partial<typeof api>).bookmarks;
    delete (api as Partial<typeof api>).topSites;
    delete (api as Partial<typeof api>).search;
    const service = new ExtensionNewTabService(api as never);

    expect(service.capabilities()).toEqual({
      history: false,
      bookmarks: false,
      topSites: false,
      openTabs: true,
      browserSearch: false,
      favicon: false,
      storageSync: true,
    });
  });

  it('merges local browser sources, deduplicates URLs, and applies blacklist rules', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36',
    });
    const service = new ExtensionNewTabService(serviceApi() as never);
    const results = await service.search({
      query: 'example',
      limit: 12,
      sources: ['open-tab', 'bookmark', 'history', 'top-site'],
      blacklist: [{ mode: 'domain', value: 'blocked.example' }],
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      source: 'open-tab',
      tabId: 42,
      faviconUrl: 'https://example.com/favicon.ico',
    });
    expect(results[0]?.sources).toEqual([
      'open-tab',
      'bookmark',
      'history',
      'top-site',
    ]);
  });

  it('performs bookmark mutations through the browser bookmark API', async () => {
    const api = serviceApi();
    const service = new ExtensionNewTabService(api as never);

    await service.createBookmark({
      channel: 'card-master',
      type: 'new-tab-bookmark-create',
      parentId: '1',
      title: 'Created',
      url: 'https://created.example/',
    });
    await service.updateBookmark({
      channel: 'card-master',
      type: 'new-tab-bookmark-update',
      id: 'bookmark-1',
      title: 'Updated',
    });
    await service.moveBookmark({
      channel: 'card-master',
      type: 'new-tab-bookmark-move',
      id: 'bookmark-1',
      parentId: '2',
      index: 3,
    });
    await service.removeBookmark({
      channel: 'card-master',
      type: 'new-tab-bookmark-remove',
      id: 'bookmark-1',
      recursive: true,
    });

    expect(api.bookmarks.create).toHaveBeenCalledWith({
      parentId: '1',
      title: 'Created',
      url: 'https://created.example/',
    });
    expect(api.bookmarks.update).toHaveBeenCalledWith('bookmark-1', {
      title: 'Updated',
    });
    expect(api.bookmarks.move).toHaveBeenCalledWith('bookmark-1', {
      parentId: '2',
      index: 3,
    });
    expect(api.bookmarks.removeTree).toHaveBeenCalledWith('bookmark-1');
  });

  it('activates open tabs and keeps default search disposition explicit', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36',
    });
    const api = serviceApi();
    const service = new ExtensionNewTabService(api as never);

    await service.activateOpenTab(42, 1);
    await service.navigate(
      {
        channel: 'card-master',
        type: 'new-tab-navigate',
        target: { kind: 'search', value: 'card master' },
        disposition: 'current-tab',
      },
      { tab: { id: 42 } as chrome.tabs.Tab },
    );
    const backgroundSearch = await service.navigate(
      {
        channel: 'card-master',
        type: 'new-tab-navigate',
        target: { kind: 'search', value: 'card master' },
        disposition: 'new-background-tab',
      },
      { tab: { id: 42 } as chrome.tabs.Tab },
    );

    expect(api.windows.update).toHaveBeenCalledWith(1, { focused: true });
    expect(api.tabs.update).toHaveBeenCalledWith(42, { active: true });
    expect(api.search.query).toHaveBeenCalledWith({
      text: 'card master',
      tabId: 42,
    });
    expect(backgroundSearch).toMatchObject({
      supported: false,
      capability: 'browserSearch',
    });
  });

  it('returns the Chromium favicon endpoint without reading image pixels', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36',
    });
    const service = new ExtensionNewTabService(serviceApi() as never);

    expect(service.readFavicon('https://example.com/', 64)).toEqual({
      supported: true,
      url: 'chrome-extension://card-master/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2F&size=64',
    });
  });

  it('does not create favicon resources for Edge internal pages', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Edg/135.0.0.0 Safari/537.36',
    });
    const api = serviceApi();
    const service = new ExtensionNewTabService(api as never);

    expect(
      service.readFavicon('chrome-search://local-ntp/local-ntp.html', 128),
    ).toMatchObject({ supported: false, capability: 'favicon' });
    expect(api.runtime.getURL).not.toHaveBeenCalled();
  });

  it('opens the dedicated settings page through the existing background worker', async () => {
    const api = serviceApi();
    const service = new ExtensionNewTabService(api as never);

    await expect(service.openSettings()).resolves.toEqual({
      supported: true,
      url: 'chrome-extension://card-masternew-tab-settings.html',
    });
    expect(api.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://card-masternew-tab-settings.html',
    });
  });

  it('creates and activates a browser new tab without forcing a URL', async () => {
    const api = serviceApi();
    const service = new ExtensionNewTabService(api as never);

    await expect(service.openNewTab()).resolves.toEqual({
      supported: true,
      tabId: 90,
    });
    expect(api.tabs.create).toHaveBeenCalledWith({ active: true });
  });
});
