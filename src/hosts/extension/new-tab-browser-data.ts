import type {
  NewTabCapabilities,
  NewTabSearchCandidate,
} from '../../new-tab/domain/types';
import type { ExtensionBackgroundApi } from './api';
import { extensionTarget } from './platform';

function available(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function';
}

function displayTitle(title: string | undefined, url: string) {
  const value = title?.trim();
  if (value) return value;
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function apiOrigin(api: ExtensionBackgroundApi) {
  try {
    return new URL(api.runtime.getURL('/')).origin;
  } catch {
    return '';
  }
}

export function newTabCapabilities(
  api: ExtensionBackgroundApi,
): NewTabCapabilities {
  return {
    history:
      available(api.history?.search) && available(api.history?.deleteUrl),
    bookmarks:
      available(api.bookmarks?.getTree) &&
      available(api.bookmarks?.search) &&
      available(api.bookmarks?.create) &&
      available(api.bookmarks?.update) &&
      available(api.bookmarks?.move) &&
      available(api.bookmarks?.remove) &&
      available(api.bookmarks?.removeTree),
    topSites: available(api.topSites?.get),
    openTabs: available(api.tabs?.query) && available(api.tabs?.update),
    browserSearch:
      available(api.search?.query) || available(api.search?.search),
    favicon: extensionTarget() === 'chromium' && available(api.runtime.getURL),
    storageSync:
      available(api.storage.sync?.get) && available(api.storage.sync?.set),
  };
}

export async function readNewTabHistoryCandidates(
  api: ExtensionBackgroundApi,
  query: string,
  limit: number,
) {
  if (!newTabCapabilities(api).history || !api.history) return [];
  const items = await api.history.search({
    text: query,
    startTime: 0,
    maxResults: limit,
  });
  return items.flatMap<NewTabSearchCandidate>((item) =>
    item.url
      ? [
          {
            source: 'history',
            title: displayTitle(item.title, item.url),
            url: item.url,
            ...(typeof item.lastVisitTime === 'number'
              ? { lastVisitTime: item.lastVisitTime }
              : {}),
            ...(typeof item.visitCount === 'number'
              ? { visitCount: item.visitCount }
              : {}),
          },
        ]
      : [],
  );
}

export async function readNewTabBookmarkCandidates(
  api: ExtensionBackgroundApi,
  query: string,
) {
  if (!newTabCapabilities(api).bookmarks || !api.bookmarks) return [];
  const nodes = await api.bookmarks.search(query);
  return nodes.flatMap<NewTabSearchCandidate>((node) =>
    node.url
      ? [
          {
            source: 'bookmark',
            title: displayTitle(node.title, node.url),
            url: node.url,
            bookmarkId: node.id,
            ...(node.parentId ? { parentId: node.parentId } : {}),
          },
        ]
      : [],
  );
}

export async function readNewTabTopSiteCandidates(api: ExtensionBackgroundApi) {
  if (!newTabCapabilities(api).topSites || !api.topSites) return [];
  const sites = await api.topSites.get();
  return sites.flatMap<NewTabSearchCandidate>((site) =>
    site.url
      ? [
          {
            source: 'top-site',
            title: displayTitle(site.title, site.url),
            url: site.url,
          },
        ]
      : [],
  );
}

export async function readNewTabOpenTabCandidates(api: ExtensionBackgroundApi) {
  if (!newTabCapabilities(api).openTabs) return [];
  const ownOrigin = apiOrigin(api);
  const tabs = await api.tabs.query({});
  return tabs.flatMap<NewTabSearchCandidate>((tab) => {
    const url = tab.url ?? tab.pendingUrl;
    if (
      typeof tab.id !== 'number' ||
      !url ||
      (ownOrigin && url.startsWith(ownOrigin))
    ) {
      return [];
    }
    return [
      {
        source: 'open-tab',
        title: displayTitle(tab.title, url),
        url,
        tabId: tab.id,
        active: Boolean(tab.active),
        ...(typeof tab.windowId === 'number' ? { windowId: tab.windowId } : {}),
        ...(tab.favIconUrl ? { faviconUrl: tab.favIconUrl } : {}),
      },
    ];
  });
}

export function newTabSiteTitle(title: string | undefined, url: string) {
  return displayTitle(title, url);
}
