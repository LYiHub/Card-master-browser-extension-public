import type {
  NewTabBookmarkNode,
  NewTabCapabilities,
  NewTabNavigationDisposition,
  NewTabNavigationTarget,
  NewTabOpenTab,
  NewTabSearchBlacklistEntry,
  NewTabSearchCandidate,
  NewTabSearchResult,
  NewTabSearchSource,
  NewTabSite,
} from '../../new-tab/domain/types';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './extension-channel';

type SupportedResponse = {
  supported: true;
};

type UnsupportedResponse = {
  supported: false;
  capability: keyof NewTabCapabilities;
  reason: string;
};

export type NewTabCapabilityResponse<T extends object = Record<string, never>> =
  | (SupportedResponse & T)
  | UnsupportedResponse;

export class ExtensionNewTabClient {
  constructor(private readonly api: ExtensionApi) {}

  readCapabilities() {
    return sendExtensionRequest<{ capabilities: NewTabCapabilities }>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-capabilities-read',
      },
    );
  }

  search(input: {
    query: string;
    limit: number;
    sources: NewTabSearchSource[];
    blacklist: NewTabSearchBlacklistEntry[];
  }) {
    return sendExtensionRequest<{ results: NewTabSearchResult[] }>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-search',
      ...input,
    });
  }

  readHistory(limit: number) {
    return sendExtensionRequest<
      NewTabCapabilityResponse<{ items: NewTabSearchCandidate[] }>
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-history-read',
      limit,
    });
  }

  deleteHistory(url: string) {
    return sendExtensionRequest<NewTabCapabilityResponse>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-history-delete',
      url,
    });
  }

  readBookmarkTree() {
    return sendExtensionRequest<
      NewTabCapabilityResponse<{ tree: NewTabBookmarkNode[] }>
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-bookmarks-tree-read',
    });
  }

  createBookmark(input: {
    parentId?: string;
    index?: number;
    title: string;
    url?: string;
  }) {
    return sendExtensionRequest<
      NewTabCapabilityResponse<{ node: NewTabBookmarkNode }>
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-bookmark-create',
      ...input,
    });
  }

  updateBookmark(input: { id: string; title?: string; url?: string }) {
    return sendExtensionRequest<
      NewTabCapabilityResponse<{ node: NewTabBookmarkNode }>
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-bookmark-update',
      ...input,
    });
  }

  moveBookmark(input: { id: string; parentId?: string; index?: number }) {
    return sendExtensionRequest<
      NewTabCapabilityResponse<{ node: NewTabBookmarkNode }>
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-bookmark-move',
      ...input,
    });
  }

  removeBookmark(id: string, recursive: boolean) {
    return sendExtensionRequest<NewTabCapabilityResponse>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-bookmark-remove',
      id,
      recursive,
    });
  }

  openBookmarkManager() {
    return sendExtensionRequest<NewTabCapabilityResponse<{ url: string }>>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-bookmark-manager-open',
      },
    );
  }

  openSettings() {
    return sendExtensionRequest<NewTabCapabilityResponse<{ url: string }>>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-settings-open',
      },
    );
  }

  readTopSites() {
    return sendExtensionRequest<
      NewTabCapabilityResponse<{ items: NewTabSite[] }>
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-top-sites-read',
    });
  }

  readOpenTabs() {
    return sendExtensionRequest<
      NewTabCapabilityResponse<{ items: NewTabOpenTab[] }>
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-open-tabs-read',
    });
  }

  activateOpenTab(tabId: number, windowId?: number) {
    return sendExtensionRequest<NewTabCapabilityResponse<{ tabId: number }>>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-open-tab-activate',
        tabId,
        ...(typeof windowId === 'number' ? { windowId } : {}),
      },
    );
  }

  navigate(
    target: NewTabNavigationTarget,
    disposition: NewTabNavigationDisposition,
  ) {
    return sendExtensionRequest<NewTabCapabilityResponse<{ tabId?: number }>>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-navigate',
        target,
        disposition,
      },
    );
  }

  readFavicon(url: string, size = 64) {
    return sendExtensionRequest<NewTabCapabilityResponse<{ url: string }>>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-favicon-read',
        url,
        size,
      },
    );
  }
}
