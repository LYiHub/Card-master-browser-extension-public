import type { ConfigurationMV2 } from '@adguard/tswebextension';

import type { ContentBlockingState } from '../domain/types';

export type FirefoxFilterAsset = {
  filterId: number;
  content: string;
  conversionData?: {
    originals: string[];
    conversions: Record<number, number>;
  };
};

export type AdguardFirefoxFilterListFactory = (
  source: string,
) => ConfigurationMV2['userrules'];

export function createAdguardFirefoxConfiguration(
  state: ContentBlockingState,
  builtInFilters: readonly FirefoxFilterAsset[],
  filterList: AdguardFirefoxFilterListFactory,
): ConfigurationMV2 {
  const builtInById = new Map(
    builtInFilters.map((filter) => [filter.filterId, filter]),
  );
  const filters: ConfigurationMV2['filters'] = state.enabledStaticFilterIds.map(
    (filterId) => {
      const filter = builtInById.get(filterId);
      if (!filter) {
        throw new Error(`Firefox 内置过滤器 ${filterId} 尚未加载。`);
      }
      return {
        filterId,
        content: filter.content,
        ...(filter.conversionData
          ? { conversionData: filter.conversionData }
          : {}),
        trusted: true,
      };
    },
  );

  filters.push(
    ...state.subscriptions
      .filter(
        (subscription) =>
          subscription.enabled && Boolean(subscription.content.trim()),
      )
      .map((subscription) => ({
        filterId: subscription.filterId,
        trusted: false,
        ...filterList(subscription.content),
      })),
  );

  return {
    allowlist: [...state.allowlist],
    filters,
    logLevel: 'error' as ConfigurationMV2['logLevel'],
    settings: {
      assistantUrl: '',
      filteringEnabled: state.rulesEnabled,
      allowlistEnabled: true,
      allowlistInverted: false,
      collectStats: false,
      debugScriptlets: false,
      stealthModeEnabled: false,
      stealth: {
        selfDestructFirstPartyCookies: false,
        selfDestructFirstPartyCookiesTime: 0,
        selfDestructThirdPartyCookies: false,
        selfDestructThirdPartyCookiesTime: 0,
        hideReferrer: false,
        hideSearchQueries: false,
        blockChromeClientData: false,
        sendDoNotTrack: false,
        blockWebRTC: false,
      },
    },
    trustedDomains: [],
    userrules: filterList(state.userRules),
  };
}
