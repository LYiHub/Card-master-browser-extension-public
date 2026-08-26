import type { ExtensionBackgroundApi } from './api';
import { extensionTarget } from './platform';

type LumnoRequest = Record<string, unknown> & { action: string };
type LumnoSender = Pick<chrome.runtime.MessageSender, 'tab'>;

const LUMNO_ACTIONS = new Set([
  'createTab',
  'deleteHistoryUrl',
  'getFaviconData',
  'getFileSchemeAccessStatus',
  'getSearchEngineSuggestions',
  'getSearchSuggestions',
  'getShortcutFaviconData',
  'getShortcutRules',
  'getShowSearchShortcut',
  'getSiteSearchProviders',
  'getTabsForOverlay',
  'openBookmarkManager',
  'openExtensionDetailsPage',
  'openNewTab',
  'openOptionsPage',
  'openReleasePage',
  'recordSearchSuggestionSelection',
  'resolveFaviconCandidates',
  'resolveSiteThemeColor',
  'runSiteSearchProviderQuery',
  'searchOrNavigate',
  'switchToTab',
  'trackSearchTab',
]);

const SEARCH_SELECTION_STATS_KEY =
  '_x_extension_search_selection_stats_2026_unique_';

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

function disposition(value: unknown) {
  return value === 'currentTab' || value === 'backgroundTab' ? value : 'newTab';
}

function pageTitle(title: string | undefined, url: string) {
  const normalized = title?.trim();
  if (normalized) return normalized;
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function normalizedUrl(value: string) {
  const input = value.trim();
  if (!input) return '';
  try {
    return new URL(input).toString();
  } catch {
    if (
      /^[^\s/]+\.[^\s/]{2,}(?:[/:?#]|$)/u.test(input) &&
      !input.includes(' ')
    ) {
      try {
        return new URL(`https://${input}`).toString();
      } catch {
        return '';
      }
    }
    return '';
  }
}

function searchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function faviconUrl(api: ExtensionBackgroundApi, pageUrl: string, size = 64) {
  if (extensionTarget() !== 'chromium') return '';
  try {
    const page = new URL(pageUrl);
    if (page.protocol !== 'http:' && page.protocol !== 'https:') return '';
  } catch {
    return '';
  }
  const url = new URL(api.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}

function scoreMatch(query: string, title: string, url: string) {
  const needle = query.toLocaleLowerCase('zh-CN');
  const normalizedTitle = title.toLocaleLowerCase('zh-CN');
  const normalizedUrl = url.toLocaleLowerCase('zh-CN');
  if (normalizedTitle === needle) return 220;
  if (normalizedTitle.startsWith(needle)) return 190;
  if (normalizedUrl.startsWith(needle)) return 175;
  if (normalizedTitle.includes(needle)) return 150;
  if (normalizedUrl.includes(needle)) return 125;
  return 0;
}

function browserBookmarkManagerUrls() {
  if (extensionTarget() === 'firefox') {
    return ['about:bookmarks', 'chrome://bookmarks/'];
  }
  if (extensionTarget() === 'safari') return [];
  const userAgent = globalThis.navigator?.userAgent ?? '';
  if (userAgent.includes('Edg/')) {
    return ['edge://favorites/', 'edge://bookmarks/', 'chrome://bookmarks/'];
  }
  if (userAgent.includes('Brave/')) {
    return ['brave://bookmarks/', 'chrome://bookmarks/'];
  }
  if (userAgent.includes('Vivaldi/')) {
    return ['vivaldi://bookmarks/', 'chrome://bookmarks/'];
  }
  if (userAgent.includes('OPR/') || userAgent.includes('Opera')) {
    return ['opera://bookmarks/', 'chrome://bookmarks/'];
  }
  return ['chrome://bookmarks/'];
}

function extensionDetailsUrl(api: ExtensionBackgroundApi) {
  if (extensionTarget() === 'firefox') return 'about:addons';
  if (extensionTarget() === 'safari') return '';
  const userAgent = globalThis.navigator?.userAgent ?? '';
  const scheme = userAgent.includes('Edg/') ? 'edge' : 'chrome';
  return `${scheme}://extensions/?id=${api.runtime.id}`;
}

async function resourceItems(
  api: ExtensionBackgroundApi,
  name: 'shortcut-rules' | 'site-search',
) {
  const response = await fetch(api.runtime.getURL(`assets/data/${name}.json`), {
    cache: 'no-store',
  });
  const data = (await response.json()) as { items?: unknown[] };
  return Array.isArray(data.items) ? data.items : [];
}

async function openUrl(
  api: ExtensionBackgroundApi,
  url: string,
  target: ReturnType<typeof disposition>,
  sender: LumnoSender,
) {
  if (target === 'currentTab' && typeof sender.tab?.id === 'number') {
    const tab = await api.tabs.update(sender.tab.id, { active: true, url });
    return { ok: true, tabId: tab?.id ?? sender.tab.id, url };
  }
  const tab = await api.tabs.create({
    active: target !== 'backgroundTab',
    url,
  });
  return { ok: true, tabId: tab.id, url };
}

async function searchOrNavigate(
  api: ExtensionBackgroundApi,
  request: LumnoRequest,
  sender: LumnoSender,
) {
  const query = stringValue(request.query);
  if (!query) return { ok: false };
  const target = disposition(request.disposition);
  const directUrl = request.forceSearch === true ? '' : normalizedUrl(query);
  if (directUrl) return openUrl(api, directUrl, target, sender);

  if (
    target !== 'backgroundTab' &&
    api.search &&
    typeof api.search.query === 'function'
  ) {
    await api.search.query(
      target === 'currentTab' && typeof sender.tab?.id === 'number'
        ? { tabId: sender.tab.id, text: query }
        : { disposition: 'NEW_TAB', text: query },
    );
    return { ok: true, url: searchUrl(query) };
  }
  return openUrl(api, searchUrl(query), target, sender);
}

async function localSearchSuggestions(
  api: ExtensionBackgroundApi,
  request: LumnoRequest,
) {
  const query = stringValue(request.query);
  if (!query) return [];
  const allowedSources = new Set(
    Array.isArray(request.sourceTypes)
      ? request.sourceTypes.map((value) => stringValue(value))
      : ['topSite', 'bookmark', 'history'],
  );
  const includeOpenTabs = request.includeOpenTabs !== false;
  const [historyItems, bookmarks, topSites, tabs] = await Promise.all([
    allowedSources.has('history') && api.history
      ? api.history
          .search({
            maxResults: 120,
            startTime: 0,
            text: query,
          })
          .catch(() => [])
      : [],
    allowedSources.has('bookmark') && api.bookmarks
      ? api.bookmarks.search({ query }).catch(() => [])
      : [],
    allowedSources.has('topSite') && api.topSites
      ? api.topSites.get().catch(() => [])
      : [],
    includeOpenTabs ? api.tabs.query({}).catch(() => []) : [],
  ]);
  const suggestions: Array<Record<string, unknown>> = [];
  const byUrl = new Map<string, number>();

  const add = (
    item: {
      title?: string;
      url?: string;
      lastVisitTime?: number;
      visitCount?: number;
    },
    type: string,
    extras: Record<string, unknown> = {},
  ) => {
    const url = stringValue(item.url);
    if (!url) return;
    const title = pageTitle(item.title, url);
    const score = scoreMatch(query, title, url);
    if (score <= 0) return;
    const next = {
      type,
      title,
      url,
      favicon: faviconUrl(api, url),
      score,
      lastVisitTime: Number(item.lastVisitTime) || 0,
      visitCount: Number(item.visitCount) || 0,
      reasons: [],
      ...extras,
    };
    const currentIndex = byUrl.get(url);
    if (currentIndex === undefined) {
      byUrl.set(url, suggestions.length);
      suggestions.push(next);
      return;
    }
    suggestions[currentIndex] = {
      ...suggestions[currentIndex],
      ...next,
      score: Math.max(
        Number(suggestions[currentIndex]?.score) || 0,
        Number(next.score) || 0,
      ),
    };
  };

  historyItems.forEach((item) => {
    add(item, 'history');
  });
  topSites.forEach((item) => {
    add(item, 'topSite', { isTopSite: true });
  });
  bookmarks.forEach((item) => {
    add(item, 'bookmark');
  });
  tabs.forEach((tab) => {
    const url = tab.url ?? tab.pendingUrl;
    if (typeof tab.id !== 'number' || !url) return;
    add({ title: tab.title, url }, 'openTab', {
      _xMatchedTabId: tab.id,
      windowId: tab.windowId,
      score: scoreMatch(query, pageTitle(tab.title, url), url) + 12,
    });
  });
  return suggestions
    .sort((left, right) => Number(right.score) - Number(left.score))
    .slice(0, 12);
}

async function remoteSearchSuggestions(
  api: ExtensionBackgroundApi,
  request: LumnoRequest,
) {
  const local = Array.isArray(request.localSuggestions)
    ? request.localSuggestions.filter(record)
    : [];
  const query = stringValue(request.query);
  if (!query) return local;
  try {
    const response = await fetch(
      `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`,
      { cache: 'no-store' },
    );
    const payload = (await response.json()) as unknown;
    const values =
      Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1] : [];
    const additions = values
      .map((value) => stringValue(value))
      .filter((value) => value && value !== query)
      .slice(0, local.length > 0 ? 3 : 5)
      .map((value) => ({
        type: 'googleSuggest',
        title: value,
        url: searchUrl(value),
        favicon: faviconUrl(api, searchUrl(value)),
        score: local.length > 0 ? 1 : 160,
        searchQuery: value,
        forceSearch: true,
        reasons: ['来源：搜索建议'],
      }));
    return [...local, ...additions].slice(0, 12);
  } catch {
    return local;
  }
}

async function responseDataUrl(url: string) {
  if (!url || url.startsWith('data:')) return url;
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) return '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${response.headers.get('content-type') || 'image/png'};base64,${btoa(binary)}`;
}

async function recordSelection(
  api: ExtensionBackgroundApi,
  request: LumnoRequest,
) {
  const url = stringValue(request.url);
  if (!url) return { ok: false };
  const stored = await api.storage.local.get(SEARCH_SELECTION_STATS_KEY);
  const current: Record<string, unknown> = record(
    stored[SEARCH_SELECTION_STATS_KEY],
  )
    ? stored[SEARCH_SELECTION_STATS_KEY]
    : {};
  const previous: Record<string, unknown> = record(current[url])
    ? current[url]
    : {};
  await api.storage.local.set({
    [SEARCH_SELECTION_STATS_KEY]: {
      ...current,
      [url]: {
        count: (Number(previous.count) || 0) + 1,
        lastSelectedAt: Date.now(),
        query: stringValue(request.query),
        title: stringValue(request.title),
        type: stringValue(request.type),
      },
    },
  });
  return { ok: true };
}

export function lumnoNewTabRequest(value: unknown): value is LumnoRequest {
  return record(value) && LUMNO_ACTIONS.has(stringValue(value.action));
}

export class LumnoNewTabCompatibilityService {
  constructor(private readonly api: ExtensionBackgroundApi) {}

  async handle(request: LumnoRequest, sender: LumnoSender) {
    switch (request.action) {
      case 'getShowSearchShortcut': {
        const commands = await this.api.commands?.getAll().catch(() => []);
        const command = commands?.find((item) => item.name === 'show-search');
        return { shortcut: command?.shortcut ?? '' };
      }
      case 'getShortcutRules':
        return {
          items: await resourceItems(this.api, 'shortcut-rules').catch(
            () => [],
          ),
        };
      case 'getSiteSearchProviders':
        return {
          items: await resourceItems(this.api, 'site-search').catch(() => []),
        };
      case 'searchOrNavigate':
        return searchOrNavigate(this.api, request, sender);
      case 'getSearchSuggestions':
        return {
          suggestions: await localSearchSuggestions(this.api, request),
        };
      case 'getSearchEngineSuggestions': {
        const suggestions = await remoteSearchSuggestions(this.api, request);
        return {
          suggestions,
          aborted: false,
          hasRemoteSuggestions: suggestions.some(
            (item) => item.type === 'googleSuggest',
          ),
        };
      }
      case 'recordSearchSuggestionSelection':
        return recordSelection(this.api, request);
      case 'deleteHistoryUrl': {
        const url = stringValue(request.url);
        if (!url || !this.api.history) return { ok: false };
        await this.api.history.deleteUrl({ url });
        return { ok: true, url };
      }
      case 'runSiteSearchProviderQuery': {
        const provider = record(request.provider) ? request.provider : {};
        const query = stringValue(request.query);
        const template = stringValue(provider.template);
        if (!query || !template) return { ok: false };
        const url = template.includes('{query}')
          ? template.replaceAll('{query}', encodeURIComponent(query))
          : template;
        return openUrl(this.api, url, disposition(request.disposition), sender);
      }
      case 'getTabsForOverlay': {
        const tabs = await this.api.tabs.query({});
        return {
          tabs: tabs.filter((tab) => tab.incognito !== true),
          currentTabId:
            sender.tab?.id ?? numberValue(request.currentTabId) ?? undefined,
        };
      }
      case 'switchToTab': {
        const tabId = numberValue(request.tabId);
        if (tabId === null) return { ok: false };
        const windowId = numberValue(request.windowId);
        if (windowId !== null) {
          await this.api.windows?.update?.(windowId, { focused: true });
        }
        await this.api.tabs.update(tabId, { active: true });
        return { ok: true, tabId };
      }
      case 'trackSearchTab':
        return { ok: numberValue(request.tabId) !== null };
      case 'createTab': {
        const url = stringValue(request.url);
        return url
          ? openUrl(this.api, url, disposition(request.disposition), sender)
          : { ok: false };
      }
      case 'openNewTab':
        return openUrl(
          this.api,
          this.api.runtime.getURL('new-tab.html?focus=1'),
          disposition(request.disposition),
          sender,
        );
      case 'openOptionsPage':
        return openUrl(
          this.api,
          this.api.runtime.getURL('new-tab-settings.html'),
          disposition(request.disposition),
          sender,
        );
      case 'openReleasePage':
        return { ok: false };
      case 'openBookmarkManager': {
        for (const url of browserBookmarkManagerUrls()) {
          try {
            await this.api.tabs.create({ active: true, url });
            return { ok: true, url };
          } catch {}
        }
        return { ok: false };
      }
      case 'openExtensionDetailsPage': {
        const url = extensionDetailsUrl(this.api);
        if (!url) return { ok: false, url: '' };
        const result = await openUrl(
          this.api,
          url,
          disposition(request.disposition),
          sender,
        );
        return { ...result, url };
      }
      case 'getFileSchemeAccessStatus': {
        const extensionApi = globalThis.chrome?.extension;
        if (
          !extensionApi ||
          typeof extensionApi.isAllowedFileSchemeAccess !== 'function'
        ) {
          return {
            ok: true,
            allowed: false,
            supported: false,
            detailsUrl: extensionDetailsUrl(this.api),
          };
        }
        const allowed = await extensionApi.isAllowedFileSchemeAccess();
        return {
          ok: true,
          allowed,
          supported: true,
          detailsUrl: extensionDetailsUrl(this.api),
        };
      }
      case 'resolveFaviconCandidates': {
        const url = stringValue(request.url);
        const fallback = stringValue(request.fallbackUrl);
        return {
          urls: [faviconUrl(this.api, url), fallback].filter(Boolean),
        };
      }
      case 'getFaviconData': {
        const data = await responseDataUrl(stringValue(request.url)).catch(
          () => '',
        );
        return { data };
      }
      case 'getShortcutFaviconData': {
        const pageUrl = stringValue(request.pageUrl);
        const sourceUrl = faviconUrl(this.api, pageUrl);
        const data = await responseDataUrl(sourceUrl).catch(() => '');
        return {
          data,
          sourceUrl,
          width: data ? 64 : 0,
          height: data ? 64 : 0,
          vector: false,
        };
      }
      case 'resolveSiteThemeColor':
        return {
          accentRgb: null,
          source: '',
        };
    }
  }
}
