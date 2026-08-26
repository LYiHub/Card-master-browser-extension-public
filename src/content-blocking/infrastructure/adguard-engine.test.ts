import { describe, expect, it } from 'vitest';

import {
  CONTENT_BLOCKER_DEFAULT_STATIC_FILTER_IDS,
  defaultContentBlockingState,
} from '../domain/types';
import { createAdguardConfiguration } from './adguard-configuration';
import { normalizeAdguardDiagnostics } from './adguard-diagnostics';
import { adguardEnginePhaseError } from './adguard-engine-error';

const filterList = (content: string) => ({ content });
const unavailableFilter = (filterId: number) =>
  `Cannot scan rules from filter ${filterId}: e: Filter content is unavailable`;

describe('AdGuard content blocking configuration', () => {
  it('keeps privacy side effects disabled and enables the bundled base filter', () => {
    const configuration = createAdguardConfiguration(
      defaultContentBlockingState(),
      filterList,
    );

    expect(configuration.staticFiltersIds).toEqual(
      CONTENT_BLOCKER_DEFAULT_STATIC_FILTER_IDS,
    );
    expect(configuration.rulesetsPath).toBe('filters/declarative');
    expect(configuration.logLevel).toBe('error');
    expect(configuration.settings.filteringEnabled).toBe(true);
    expect(configuration.settings.assistantUrl).toBe('');
    expect(configuration.settings.gpcScriptUrl).toBe('adguard-gpc.js');
    expect(configuration.settings.hideDocumentReferrerScriptUrl).toBe(
      'adguard-hide-document-referrer.js',
    );
    expect(configuration.settings.stealthModeEnabled).toBe(false);
    expect(configuration.settings.stealth).toEqual({
      selfDestructFirstPartyCookies: false,
      selfDestructFirstPartyCookiesTime: 0,
      selfDestructThirdPartyCookies: false,
      selfDestructThirdPartyCookiesTime: 0,
      hideReferrer: false,
      hideSearchQueries: false,
      blockChromeClientData: false,
      sendDoNotTrack: false,
      blockWebRTC: false,
    });
  });

  it('keeps the engine configured while browser rules are paused', () => {
    const state = defaultContentBlockingState();
    state.rulesEnabled = false;

    expect(
      createAdguardConfiguration(state, filterList).settings.filteringEnabled,
    ).toBe(true);
  });

  it('maps enabled third-party subscriptions to untrusted custom filters', () => {
    const state = defaultContentBlockingState();
    state.subscriptions = [
      {
        id: 'filter',
        filterId: 10_000,
        name: 'Example',
        url: 'https://example.com/filter.txt',
        enabled: true,
        content: 'example.com##.ad',
        ruleCount: 1,
        rejectedRuleCount: 0,
      },
    ];

    expect(createAdguardConfiguration(state, filterList).customFilters).toEqual(
      [
        expect.objectContaining({
          filterId: 10_000,
          trusted: false,
          content: 'example.com##.ad',
        }),
      ],
    );
  });
});

describe('AdGuard engine diagnostics', () => {
  it('identifies the failing startup phase and preserves its cause', () => {
    const failure = adguardEnginePhaseError(
      '首次规则配置',
      new Error('Invalid Firefox webRequest option.'),
    );

    expect(failure.message).toBe(
      'AdGuard 首次规则配置失败：Invalid Firefox webRequest option.',
    );
    expect(failure.cause).toBeInstanceOf(Error);
  });

  it('ignores unavailable content for reserved filters that are expected to be empty', () => {
    expect(
      normalizeAdguardDiagnostics(
        {
          staticErrors: [],
          dynamicErrors: [
            unavailableFilter(0),
            unavailableFilter(100),
            unavailableFilter(-10),
          ],
          limitations: [],
        },
        defaultContentBlockingState(),
      ),
    ).toEqual({ errors: [], limitations: [] });
  });

  it('removes repeated expected empty-filter diagnostics', () => {
    const repeatedError = unavailableFilter(0);

    expect(
      normalizeAdguardDiagnostics(
        {
          staticErrors: [],
          dynamicErrors: [repeatedError, repeatedError],
          limitations: [],
        },
        defaultContentBlockingState(),
      ).errors,
    ).toEqual([]);
  });

  it('keeps unavailable user-filter content errors when user rules exist', () => {
    const state = defaultContentBlockingState();
    state.userRules = 'example.com##.ad';
    const error = unavailableFilter(0);

    expect(
      normalizeAdguardDiagnostics(
        {
          staticErrors: [],
          dynamicErrors: [error],
          limitations: [],
        },
        state,
      ).errors,
    ).toEqual([error]);
  });

  it('keeps unavailable allowlist content errors when the allowlist is not empty', () => {
    const state = defaultContentBlockingState();
    state.allowlist = ['example.com'];
    const error = unavailableFilter(100);

    expect(
      normalizeAdguardDiagnostics(
        {
          staticErrors: [],
          dynamicErrors: [error],
          limitations: [],
        },
        state,
      ).errors,
    ).toEqual([error]);
  });

  it('preserves static, unknown dynamic, unrelated errors, and limitations', () => {
    const staticError = 'Static filter failed';
    const unknownFilterError = unavailableFilter(42);
    const unrelatedError = 'Dynamic rules quota exceeded';
    const limitation = 'Some rules were excluded';

    expect(
      normalizeAdguardDiagnostics(
        {
          staticErrors: [new Error(staticError)],
          dynamicErrors: [unknownFilterError, new Error(unrelatedError)],
          limitations: [new Error(limitation)],
        },
        defaultContentBlockingState(),
      ),
    ).toEqual({
      errors: [staticError, unknownFilterError, unrelatedError],
      limitations: [limitation],
    });
  });

  it('reports Firefox filter conversion errors through the shared diagnostics', () => {
    const conversionError = new Error(
      'Filter 2 rule 4 could not be converted.',
    );

    expect(
      normalizeAdguardDiagnostics(
        {
          staticErrors: [],
          dynamicErrors: [],
          conversionErrors: [conversionError],
          limitations: [],
        },
        defaultContentBlockingState(),
      ),
    ).toEqual({
      errors: ['Filter 2 rule 4 could not be converted.'],
      limitations: [],
    });
  });

  it('preserves the browser cause of static ruleset activation failures', () => {
    const failure = new Error('Cannot change list of enabled rule sets', {
      cause: new Error('The static rule limit was exceeded.'),
    });

    expect(
      normalizeAdguardDiagnostics(
        {
          staticErrors: [failure],
          dynamicErrors: [],
          limitations: [],
        },
        defaultContentBlockingState(),
      ).errors,
    ).toEqual([
      'Cannot change list of enabled rule sets The static rule limit was exceeded.',
    ]);
  });
});
