export const NEW_TAB_SEARCH_SOURCES = [
  'open-tab',
  'bookmark',
  'history',
  'top-site',
] as const;

export type NewTabSearchSource = (typeof NEW_TAB_SEARCH_SOURCES)[number];

export type NewTabSearchBlacklistMode = 'exact-url' | 'url-prefix' | 'domain';

export type NewTabSearchBlacklistEntry = {
  mode: NewTabSearchBlacklistMode;
  value: string;
};

export type NewTabSearchRequestInput = {
  query: string;
  limit: number;
  sources: readonly NewTabSearchSource[];
  blacklist: readonly NewTabSearchBlacklistEntry[];
};

export type NewTabSearchCandidate = {
  source: NewTabSearchSource;
  title: string;
  url: string;
  faviconUrl?: string;
  active?: boolean;
  tabId?: number;
  windowId?: number;
  bookmarkId?: string;
  parentId?: string;
  lastVisitTime?: number;
  visitCount?: number;
};

export type NewTabSearchResult = NewTabSearchCandidate & {
  id: string;
  score: number;
  sources: readonly NewTabSearchSource[];
};

export type NewTabBookmarkNode = {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  index?: number;
  dateAdded?: number;
  unmodifiable?: string;
  children?: NewTabBookmarkNode[];
};

export type NewTabSite = {
  title: string;
  url: string;
};

export type NewTabOpenTab = NewTabSite & {
  tabId: number;
  windowId?: number;
  active: boolean;
};

export type NewTabCapabilities = {
  history: boolean;
  bookmarks: boolean;
  topSites: boolean;
  openTabs: boolean;
  browserSearch: boolean;
  favicon: boolean;
  storageSync: boolean;
};

export type NewTabNavigationDisposition =
  | 'current-tab'
  | 'new-foreground-tab'
  | 'new-background-tab';

export type NewTabNavigationTarget =
  | {
      kind: 'url';
      value: string;
    }
  | {
      kind: 'search';
      value: string;
    };

export function isNewTabSearchSource(
  value: unknown,
): value is NewTabSearchSource {
  return (
    typeof value === 'string' &&
    NEW_TAB_SEARCH_SOURCES.includes(value as NewTabSearchSource)
  );
}

export function isNewTabSearchBlacklistEntry(
  value: unknown,
): value is NewTabSearchBlacklistEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.mode === 'exact-url' ||
      candidate.mode === 'url-prefix' ||
      candidate.mode === 'domain') &&
    typeof candidate.value === 'string' &&
    candidate.value.trim().length > 0 &&
    candidate.value.length <= 2_048
  );
}

export function isNewTabNavigationDisposition(
  value: unknown,
): value is NewTabNavigationDisposition {
  return (
    value === 'current-tab' ||
    value === 'new-foreground-tab' ||
    value === 'new-background-tab'
  );
}

export function isNewTabNavigationTarget(
  value: unknown,
): value is NewTabNavigationTarget {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.kind === 'url' || candidate.kind === 'search') &&
    typeof candidate.value === 'string' &&
    candidate.value.trim().length > 0 &&
    candidate.value.length <= 8_192
  );
}

export function normalizeNewTabBookmarkNode(
  node: chrome.bookmarks.BookmarkTreeNode,
): NewTabBookmarkNode {
  return {
    id: node.id,
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(node.parentId ? { parentId: node.parentId } : {}),
    ...(typeof node.index === 'number' ? { index: node.index } : {}),
    ...(typeof node.dateAdded === 'number'
      ? { dateAdded: node.dateAdded }
      : {}),
    ...(node.unmodifiable ? { unmodifiable: node.unmodifiable } : {}),
    ...(node.children
      ? { children: node.children.map(normalizeNewTabBookmarkNode) }
      : {}),
  };
}
