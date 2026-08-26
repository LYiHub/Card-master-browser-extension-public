import { describe, expect, it } from 'vitest';

import { defaultContentBlockingState } from '../domain/types';
import { createAdguardFirefoxConfiguration } from './adguard-firefox-configuration';

const asset = (filterId: number) => ({
  filterId,
  content: `||filter-${filterId}.example^`,
  conversionData: {
    originals: [],
    conversions: {},
  },
});
const filterList = (content: string) => ({ content });

describe('Firefox AdGuard webRequest configuration', () => {
  it('loads enabled built-in filters without declarative rule conversion', () => {
    const state = defaultContentBlockingState();
    const configuration = createAdguardFirefoxConfiguration(
      state,
      state.enabledStaticFilterIds.map(asset),
      filterList,
    );

    expect(configuration.filters).toEqual(
      state.enabledStaticFilterIds.map((filterId) => ({
        ...asset(filterId),
        trusted: true,
      })),
    );
    expect(configuration.settings.filteringEnabled).toBe(true);
  });

  it('keeps subscriptions untrusted and pauses filtering in engine settings', () => {
    const state = defaultContentBlockingState();
    state.rulesEnabled = false;
    state.subscriptions = [
      {
        id: 'custom',
        filterId: 10_000,
        name: 'Custom',
        url: 'https://example.com/filter.txt',
        enabled: true,
        content: 'example.com##.ad',
        ruleCount: 1,
        rejectedRuleCount: 0,
      },
    ];

    const configuration = createAdguardFirefoxConfiguration(
      state,
      state.enabledStaticFilterIds.map(asset),
      filterList,
    );

    expect(configuration.filters.at(-1)).toEqual(
      expect.objectContaining({
        filterId: 10_000,
        trusted: false,
        content: 'example.com##.ad',
      }),
    );
    expect(configuration.settings.filteringEnabled).toBe(false);
  });

  it('accepts the AdGuard 5 filter assets that no longer ship conversion data', () => {
    const state = defaultContentBlockingState();
    const assets = state.enabledStaticFilterIds.map((filterId) => ({
      filterId,
      content: `||filter-${filterId}.example^`,
    }));

    const configuration = createAdguardFirefoxConfiguration(
      state,
      assets,
      filterList,
    );

    expect(configuration.filters).toEqual(
      assets.map((filter) => ({
        ...filter,
        trusted: true,
      })),
    );
  });
});
