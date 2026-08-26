import type { ExtensionBackgroundApi } from './api';
import { extensionDiagnostics } from './diagnostics';

const BADGE_BACKGROUND = '#d8b867';
const BADGE_TEXT = '#241a08';
const MAX_BADGE_COUNT = 99;

type BadgeResolution = {
  count: number;
  visible: boolean;
};

export function deckActionBadgeText(count: number) {
  const normalized = Math.max(0, Math.floor(count));
  return normalized > MAX_BADGE_COUNT
    ? `${MAX_BADGE_COUNT}+`
    : String(normalized);
}

export class DeckActionBadgeController {
  private readonly revisions = new Map<number, number>();

  constructor(private readonly api: ExtensionBackgroundApi) {}

  async initialize() {
    await this.api.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND });
    await this.api.action.setBadgeTextColor?.({ color: BADGE_TEXT });
  }

  async setTabCount(tabId: number, count: number, visible: boolean) {
    await this.api.action.setBadgeText({
      tabId,
      text: visible ? deckActionBadgeText(count) : '',
    });
  }

  async refreshAll(
    resolve: (url: string, tabId: number) => Promise<BadgeResolution>,
  ) {
    const tabs = await this.api.tabs.query({});
    const results = await Promise.allSettled(
      tabs.flatMap((tab) => {
        const tabId = tab.id;
        if (typeof tabId !== 'number' || !tab.url) return [];
        return [
          resolve(tab.url, tabId).then(({ count, visible }) =>
            this.setTabCount(tabId, count, visible),
          ),
        ];
      }),
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.length > 0) {
      extensionDiagnostics.warn(
        'deck-action-badge',
        'refresh-incomplete',
        new Error('部分标签页的激活卡牌数量未能刷新。'),
        { failedDeliveries: failures.length },
      );
    }
  }

  installNavigationSync(
    resolve: (url: string, tabId: number) => Promise<BadgeResolution>,
  ) {
    const handleUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (changeInfo.status !== 'loading' && !changeInfo.url) return;
      const url = changeInfo.url ?? tab.url;
      if (!url) return;
      const revision = (this.revisions.get(tabId) ?? 0) + 1;
      this.revisions.set(tabId, revision);
      void this.setTabCount(tabId, 0, false)
        .then(() => resolve(url, tabId))
        .then(({ count, visible }) => {
          if (this.revisions.get(tabId) !== revision) return;
          return this.setTabCount(tabId, count, visible);
        })
        .catch((error) =>
          extensionDiagnostics.warn(
            'deck-action-badge',
            'navigation-sync-failed',
            error,
            { tabId, url },
          ),
        );
    };
    const handleRemoved = (tabId: number) => {
      this.revisions.delete(tabId);
    };
    this.api.tabs.onUpdated.addListener(handleUpdated);
    this.api.tabs.onRemoved.addListener(handleRemoved);
    return () => {
      this.api.tabs.onUpdated.removeListener(handleUpdated);
      this.api.tabs.onRemoved.removeListener(handleRemoved);
    };
  }
}
