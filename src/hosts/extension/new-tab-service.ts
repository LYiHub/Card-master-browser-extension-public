import { rankNewTabSearchCandidates } from '../../new-tab/domain/search';
import {
  type NewTabNavigationDisposition,
  type NewTabSearchRequestInput,
  type NewTabSite,
  normalizeNewTabBookmarkNode,
} from '../../new-tab/domain/types';
import type { ExtensionBackgroundApi } from './api';
import {
  newTabCapabilities,
  newTabSiteTitle,
  readNewTabBookmarkCandidates,
  readNewTabHistoryCandidates,
  readNewTabOpenTabCandidates,
  readNewTabTopSiteCandidates,
} from './new-tab-browser-data';
import type { NewTabRequest } from './new-tab-protocol';
import { extensionTarget } from './platform';

type NewTabSender = Pick<chrome.runtime.MessageSender, 'tab'>;

function available(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function';
}

function unsupported(
  capability: keyof ReturnType<typeof newTabCapabilities>,
  reason: string,
) {
  return { supported: false as const, capability, reason };
}

function safeNavigationUrl(value: string) {
  const input = value.trim();
  const url = new URL(input);
  if (
    url.protocol !== 'http:' &&
    url.protocol !== 'https:' &&
    url.protocol !== 'file:' &&
    url.protocol !== 'chrome:' &&
    url.protocol !== 'edge:' &&
    url.protocol !== 'brave:' &&
    url.protocol !== 'vivaldi:' &&
    url.protocol !== 'opera:' &&
    url.protocol !== 'about:'
  ) {
    throw new Error('新标签页拒绝打开不受支持的网址协议。');
  }
  return url.toString();
}

function browserPageFaviconUrl(
  api: ExtensionBackgroundApi,
  pageUrl: string,
  size: number,
) {
  const page = new URL(pageUrl);
  if (page.protocol !== 'http:' && page.protocol !== 'https:') return null;
  const faviconUrl = new URL(api.runtime.getURL('/_favicon/'));
  faviconUrl.searchParams.set('pageUrl', page.toString());
  faviconUrl.searchParams.set('size', String(size));
  return faviconUrl.toString();
}

function bookmarkManagerUrls() {
  if (extensionTarget() === 'firefox') {
    return ['about:bookmarks', 'chrome://bookmarks/'];
  }
  if (extensionTarget() === 'safari') return [];
  const userAgent = globalThis.navigator?.userAgent ?? '';
  if (userAgent.includes('Edg/')) {
    return ['edge://favorites/', 'edge://bookmarks/', 'chrome://bookmarks/'];
  }
  if (userAgent.includes('Vivaldi/')) {
    return ['vivaldi://bookmarks/', 'chrome://bookmarks/'];
  }
  if (userAgent.includes('OPR/') || userAgent.includes('Opera')) {
    return ['opera://bookmarks/', 'chrome://bookmarks/'];
  }
  if (userAgent.includes('Brave/')) {
    return ['brave://bookmarks/', 'chrome://bookmarks/'];
  }
  return ['chrome://bookmarks/'];
}

export class ExtensionNewTabService {
  constructor(private readonly api: ExtensionBackgroundApi) {}

  capabilities() {
    return newTabCapabilities(this.api);
  }

  async search(input: NewTabSearchRequestInput) {
    const requested = new Set(input.sources);
    const [history, bookmarks, topSites, openTabs] = await Promise.all([
      requested.has('history')
        ? readNewTabHistoryCandidates(
            this.api,
            input.query,
            Math.max(input.limit * 4, 20),
          )
        : [],
      requested.has('bookmark')
        ? readNewTabBookmarkCandidates(this.api, input.query)
        : [],
      requested.has('top-site') ? readNewTabTopSiteCandidates(this.api) : [],
      requested.has('open-tab') ? readNewTabOpenTabCandidates(this.api) : [],
    ]);
    return rankNewTabSearchCandidates(
      [...openTabs, ...bookmarks, ...history, ...topSites],
      input,
    );
  }

  async readHistory(limit: number) {
    if (!this.capabilities().history) {
      return unsupported('history', '当前浏览器未提供历史记录读取能力。');
    }
    return {
      supported: true as const,
      items: await readNewTabHistoryCandidates(this.api, '', limit),
    };
  }

  async deleteHistory(url: string) {
    if (!this.capabilities().history || !this.api.history) {
      return unsupported('history', '当前浏览器未提供历史记录删除能力。');
    }
    await this.api.history.deleteUrl({ url });
    return { supported: true as const };
  }

  async readBookmarkTree() {
    if (!this.capabilities().bookmarks || !this.api.bookmarks) {
      return unsupported('bookmarks', '当前浏览器未提供书签读取能力。');
    }
    const tree = await this.api.bookmarks.getTree();
    return {
      supported: true as const,
      tree: tree.map(normalizeNewTabBookmarkNode),
    };
  }

  async createBookmark(
    request: Extract<NewTabRequest, { type: 'new-tab-bookmark-create' }>,
  ) {
    if (!this.capabilities().bookmarks || !this.api.bookmarks) {
      return unsupported('bookmarks', '当前浏览器未提供书签编辑能力。');
    }
    const node = await this.api.bookmarks.create({
      ...(request.parentId ? { parentId: request.parentId } : {}),
      ...(typeof request.index === 'number' ? { index: request.index } : {}),
      title: request.title,
      ...(request.url ? { url: request.url } : {}),
    });
    return {
      supported: true as const,
      node: normalizeNewTabBookmarkNode(node),
    };
  }

  async updateBookmark(
    request: Extract<NewTabRequest, { type: 'new-tab-bookmark-update' }>,
  ) {
    if (!this.capabilities().bookmarks || !this.api.bookmarks) {
      return unsupported('bookmarks', '当前浏览器未提供书签编辑能力。');
    }
    const node = await this.api.bookmarks.update(request.id, {
      ...(request.title !== undefined ? { title: request.title } : {}),
      ...(request.url !== undefined ? { url: request.url } : {}),
    });
    return {
      supported: true as const,
      node: normalizeNewTabBookmarkNode(node),
    };
  }

  async moveBookmark(
    request: Extract<NewTabRequest, { type: 'new-tab-bookmark-move' }>,
  ) {
    if (!this.capabilities().bookmarks || !this.api.bookmarks) {
      return unsupported('bookmarks', '当前浏览器未提供书签移动能力。');
    }
    const node = await this.api.bookmarks.move(request.id, {
      ...(request.parentId ? { parentId: request.parentId } : {}),
      ...(typeof request.index === 'number' ? { index: request.index } : {}),
    });
    return {
      supported: true as const,
      node: normalizeNewTabBookmarkNode(node),
    };
  }

  async removeBookmark(
    request: Extract<NewTabRequest, { type: 'new-tab-bookmark-remove' }>,
  ) {
    if (!this.capabilities().bookmarks || !this.api.bookmarks) {
      return unsupported('bookmarks', '当前浏览器未提供书签删除能力。');
    }
    if (request.recursive) {
      await this.api.bookmarks.removeTree(request.id);
    } else {
      await this.api.bookmarks.remove(request.id);
    }
    return { supported: true as const };
  }

  async openBookmarkManager() {
    if (!this.capabilities().bookmarks) {
      return unsupported('bookmarks', '当前浏览器未提供书签管理能力。');
    }
    const candidates = bookmarkManagerUrls();
    if (candidates.length === 0) {
      return unsupported(
        'bookmarks',
        'Safari 未提供可由扩展直接打开的书签管理页面。',
      );
    }
    let lastError: unknown = null;
    for (const url of candidates) {
      try {
        await this.api.tabs.create({ url });
        return { supported: true as const, url };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error('浏览器书签管理页面无法打开。');
  }

  async openSettings() {
    const url = this.api.runtime.getURL('new-tab-settings.html');
    await this.api.tabs.create({ url });
    return { supported: true as const, url };
  }

  async openNewTab() {
    const tab = await this.api.tabs.create({ active: true });
    return { supported: true as const, tabId: tab.id };
  }

  async readTopSites() {
    if (!this.capabilities().topSites || !this.api.topSites) {
      return unsupported('topSites', '当前浏览器未提供常用网站读取能力。');
    }
    const sites = await this.api.topSites.get();
    const items: NewTabSite[] = sites.flatMap((site) =>
      site.url
        ? [{ title: newTabSiteTitle(site.title, site.url), url: site.url }]
        : [],
    );
    return { supported: true as const, items };
  }

  async readOpenTabs() {
    if (!this.capabilities().openTabs) {
      return unsupported('openTabs', '当前浏览器未提供标签页读取能力。');
    }
    const tabs = await readNewTabOpenTabCandidates(this.api);
    return {
      supported: true as const,
      items: tabs.map((tab) => ({
        tabId: tab.tabId as number,
        ...(typeof tab.windowId === 'number' ? { windowId: tab.windowId } : {}),
        active: Boolean(tab.active),
        title: tab.title,
        url: tab.url,
        ...(tab.faviconUrl ? { faviconUrl: tab.faviconUrl } : {}),
      })),
    };
  }

  async activateOpenTab(tabId: number, windowId?: number) {
    if (!this.capabilities().openTabs) {
      return unsupported('openTabs', '当前浏览器未提供标签页切换能力。');
    }
    if (typeof windowId === 'number' && available(this.api.windows?.update)) {
      await this.api.windows?.update?.(windowId, { focused: true });
    }
    const tab = await this.api.tabs.update(tabId, { active: true });
    return { supported: true as const, tabId: tab?.id ?? tabId };
  }

  private async searchWithBrowser(
    text: string,
    disposition: NewTabNavigationDisposition,
    sender: NewTabSender,
  ) {
    if (!this.capabilities().browserSearch || !this.api.search) {
      return unsupported(
        'browserSearch',
        '当前浏览器未提供默认搜索引擎调用能力。',
      );
    }
    const tabId = sender.tab?.id;
    if (available(this.api.search.query)) {
      if (disposition === 'new-background-tab') {
        return unsupported(
          'browserSearch',
          '浏览器默认搜索接口不能在后台新标签页中打开结果。',
        );
      }
      await this.api.search.query(
        disposition === 'current-tab' && typeof tabId === 'number'
          ? { text, tabId }
          : { text, disposition: 'NEW_TAB' },
      );
      return { supported: true as const };
    }
    if (disposition === 'new-background-tab') {
      return unsupported(
        'browserSearch',
        '当前浏览器不能在后台新标签页中调用默认搜索引擎。',
      );
    }
    await this.api.search.search?.({
      query: text,
      ...(disposition === 'current-tab' && typeof tabId === 'number'
        ? { tabId }
        : {}),
    });
    return { supported: true as const };
  }

  private async openUrl(
    urlValue: string,
    disposition: NewTabNavigationDisposition,
    sender: NewTabSender,
  ) {
    const url = safeNavigationUrl(urlValue);
    const tabId = sender.tab?.id;
    if (disposition === 'current-tab' && typeof tabId === 'number') {
      await this.api.tabs.update(tabId, { url });
      return { supported: true as const, tabId };
    }
    const tab = await this.api.tabs.create({
      url,
      active: disposition === 'new-foreground-tab',
    });
    return { supported: true as const, tabId: tab.id };
  }

  navigate(
    request: Extract<NewTabRequest, { type: 'new-tab-navigate' }>,
    sender: NewTabSender,
  ) {
    return request.target.kind === 'search'
      ? this.searchWithBrowser(
          request.target.value,
          request.disposition,
          sender,
        )
      : this.openUrl(request.target.value, request.disposition, sender);
  }

  readFavicon(url: string, size: number) {
    if (!this.capabilities().favicon) {
      return unsupported(
        'favicon',
        '当前浏览器未提供 Chromium favicon 页面能力。',
      );
    }
    const faviconUrl = browserPageFaviconUrl(this.api, url, size);
    if (!faviconUrl) {
      return unsupported(
        'favicon',
        '浏览器内部页面不提供可由扩展加载的网站图标。',
      );
    }
    return {
      supported: true as const,
      url: faviconUrl,
    };
  }

  handle(request: NewTabRequest, sender: NewTabSender) {
    switch (request.type) {
      case 'new-tab-capabilities-read':
        return Promise.resolve({ capabilities: this.capabilities() });
      case 'new-tab-search':
        return this.search(request).then((results) => ({ results }));
      case 'new-tab-history-read':
        return this.readHistory(request.limit);
      case 'new-tab-history-delete':
        return this.deleteHistory(request.url);
      case 'new-tab-bookmarks-tree-read':
        return this.readBookmarkTree();
      case 'new-tab-bookmark-create':
        return this.createBookmark(request);
      case 'new-tab-bookmark-update':
        return this.updateBookmark(request);
      case 'new-tab-bookmark-move':
        return this.moveBookmark(request);
      case 'new-tab-bookmark-remove':
        return this.removeBookmark(request);
      case 'new-tab-bookmark-manager-open':
        return this.openBookmarkManager();
      case 'new-tab-open':
        return this.openNewTab();
      case 'new-tab-settings-open':
        return this.openSettings();
      case 'new-tab-daily-review-wallpaper-read':
      case 'new-tab-daily-review-wallpaper-generate':
        return Promise.reject(
          new Error('每日回顾请求必须由专用后台服务处理。'),
        );
      case 'new-tab-top-sites-read':
        return this.readTopSites();
      case 'new-tab-open-tabs-read':
        return this.readOpenTabs();
      case 'new-tab-open-tab-activate':
        return this.activateOpenTab(request.tabId, request.windowId);
      case 'new-tab-navigate':
        return this.navigate(request, sender);
      case 'new-tab-favicon-read':
        return Promise.resolve(this.readFavicon(request.url, request.size));
    }
  }
}
