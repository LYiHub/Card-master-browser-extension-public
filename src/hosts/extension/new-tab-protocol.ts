import {
  type DailyReviewWallpaperPlan,
  isDailyReviewWallpaperPlan,
} from '../../new-tab/application/daily-review-wallpaper';
import {
  isNewTabNavigationDisposition,
  isNewTabNavigationTarget,
  isNewTabSearchBlacklistEntry,
  isNewTabSearchSource,
  type NewTabNavigationDisposition,
  type NewTabNavigationTarget,
  type NewTabSearchBlacklistEntry,
  type NewTabSearchSource,
} from '../../new-tab/domain/types';
import { EXTENSION_CHANNEL } from './extension-channel';

type NewTabRequestBase = {
  channel: typeof EXTENSION_CHANNEL;
};

export type NewTabRequest =
  | (NewTabRequestBase & { type: 'new-tab-capabilities-read' })
  | (NewTabRequestBase & {
      type: 'new-tab-search';
      query: string;
      limit: number;
      sources: NewTabSearchSource[];
      blacklist: NewTabSearchBlacklistEntry[];
    })
  | (NewTabRequestBase & {
      type: 'new-tab-history-read';
      limit: number;
    })
  | (NewTabRequestBase & {
      type: 'new-tab-history-delete';
      url: string;
    })
  | (NewTabRequestBase & { type: 'new-tab-bookmarks-tree-read' })
  | (NewTabRequestBase & {
      type: 'new-tab-bookmark-create';
      parentId?: string;
      index?: number;
      title: string;
      url?: string;
    })
  | (NewTabRequestBase & {
      type: 'new-tab-bookmark-update';
      id: string;
      title?: string;
      url?: string;
    })
  | (NewTabRequestBase & {
      type: 'new-tab-bookmark-move';
      id: string;
      parentId?: string;
      index?: number;
    })
  | (NewTabRequestBase & {
      type: 'new-tab-bookmark-remove';
      id: string;
      recursive: boolean;
    })
  | (NewTabRequestBase & { type: 'new-tab-bookmark-manager-open' })
  | (NewTabRequestBase & { type: 'new-tab-open' })
  | (NewTabRequestBase & { type: 'new-tab-settings-open' })
  | (NewTabRequestBase & { type: 'new-tab-daily-review-wallpaper-read' })
  | (NewTabRequestBase & {
      type: 'new-tab-daily-review-wallpaper-generate';
      plan?: DailyReviewWallpaperPlan;
    })
  | (NewTabRequestBase & { type: 'new-tab-top-sites-read' })
  | (NewTabRequestBase & { type: 'new-tab-open-tabs-read' })
  | (NewTabRequestBase & {
      type: 'new-tab-open-tab-activate';
      tabId: number;
      windowId?: number;
    })
  | (NewTabRequestBase & {
      type: 'new-tab-navigate';
      target: NewTabNavigationTarget;
      disposition: NewTabNavigationDisposition;
    })
  | (NewTabRequestBase & {
      type: 'new-tab-favicon-read';
      url: string;
      size: number;
    });

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function boundedString(value: unknown, maxLength: number) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function optionalString(value: unknown, maxLength: number) {
  return value === undefined || boundedString(value, maxLength);
}

function optionalIndex(value: unknown) {
  return (
    value === undefined ||
    (typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= 100_000)
  );
}

function tabId(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function newTabRequest(value: unknown): value is NewTabRequest {
  if (!record(value) || value.channel !== EXTENSION_CHANNEL) return false;
  switch (value.type) {
    case 'new-tab-capabilities-read':
    case 'new-tab-bookmarks-tree-read':
    case 'new-tab-bookmark-manager-open':
    case 'new-tab-open':
    case 'new-tab-settings-open':
    case 'new-tab-daily-review-wallpaper-read':
    case 'new-tab-top-sites-read':
    case 'new-tab-open-tabs-read':
      return true;
    case 'new-tab-daily-review-wallpaper-generate':
      return value.plan === undefined || isDailyReviewWallpaperPlan(value.plan);
    case 'new-tab-search':
      return (
        typeof value.query === 'string' &&
        value.query.length <= 2_048 &&
        typeof value.limit === 'number' &&
        Number.isSafeInteger(value.limit) &&
        value.limit >= 1 &&
        value.limit <= 100 &&
        Array.isArray(value.sources) &&
        value.sources.length > 0 &&
        value.sources.every(isNewTabSearchSource) &&
        Array.isArray(value.blacklist) &&
        value.blacklist.length <= 1_000 &&
        value.blacklist.every(isNewTabSearchBlacklistEntry)
      );
    case 'new-tab-history-read':
      return (
        typeof value.limit === 'number' &&
        Number.isSafeInteger(value.limit) &&
        value.limit >= 1 &&
        value.limit <= 100
      );
    case 'new-tab-history-delete':
      return boundedString(value.url, 8_192);
    case 'new-tab-bookmark-create':
      return (
        optionalString(value.parentId, 512) &&
        optionalIndex(value.index) &&
        typeof value.title === 'string' &&
        value.title.length <= 2_048 &&
        (value.url === undefined || boundedString(value.url, 8_192))
      );
    case 'new-tab-bookmark-update':
      return (
        boundedString(value.id, 512) &&
        (value.title !== undefined || value.url !== undefined) &&
        (value.title === undefined ||
          (typeof value.title === 'string' && value.title.length <= 2_048)) &&
        (value.url === undefined || boundedString(value.url, 8_192))
      );
    case 'new-tab-bookmark-move':
      return (
        boundedString(value.id, 512) &&
        optionalString(value.parentId, 512) &&
        optionalIndex(value.index) &&
        (value.parentId !== undefined || value.index !== undefined)
      );
    case 'new-tab-bookmark-remove':
      return (
        boundedString(value.id, 512) && typeof value.recursive === 'boolean'
      );
    case 'new-tab-open-tab-activate':
      return (
        tabId(value.tabId) &&
        (value.windowId === undefined || tabId(value.windowId))
      );
    case 'new-tab-navigate':
      return (
        isNewTabNavigationTarget(value.target) &&
        isNewTabNavigationDisposition(value.disposition)
      );
    case 'new-tab-favicon-read':
      return (
        boundedString(value.url, 8_192) &&
        typeof value.size === 'number' &&
        Number.isSafeInteger(value.size) &&
        value.size >= 16 &&
        value.size <= 128
      );
    default:
      return false;
  }
}
