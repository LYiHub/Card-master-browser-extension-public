import type { Configuration } from '@adguard/tswebextension/mv3';

import type { ContentBlockingState } from '../domain/types';

export type AdguardFilterListFactory = (
  source: string,
  cacheKey?: string,
) => Configuration['userrules'];

export function createAdguardConfiguration(
  state: ContentBlockingState,
  filterList: AdguardFilterListFactory,
): Configuration {
  return {
    allowlist: [...state.allowlist],
    logLevel: 'error' as Configuration['logLevel'],
    trustedDomains: [],
    staticFiltersIds: [...state.enabledStaticFilterIds],
    customFilters: state.subscriptions
      .filter(
        (subscription) =>
          subscription.enabled && Boolean(subscription.content.trim()),
      )
      .map((subscription) => ({
        filterId: subscription.filterId,
        trusted: false,
        ...filterList(subscription.content, `subscription:${subscription.id}`),
      })),
    filtersPath: 'filters',
    rulesetsPath: 'filters/declarative',
    declarativeLogEnabled: false,
    userrules: filterList(state.userRules, 'user-rules'),
    settings: {
      assistantUrl: '',
      gpcScriptUrl: 'adguard-gpc.js',
      hideDocumentReferrerScriptUrl: 'adguard-hide-document-referrer.js',
      filteringEnabled: true,
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
  };
}
