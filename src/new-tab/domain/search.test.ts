import { afterEach, describe, expect, it, vi } from 'vitest';

import { newTabSearchUrlBlocked, rankNewTabSearchCandidates } from './search';

afterEach(() => {
  vi.useRealTimers();
});

describe('new-tab search', () => {
  it('applies exact, prefix, and domain blacklist entries', () => {
    expect(
      newTabSearchUrlBlocked('https://example.com/private/page', [
        { mode: 'domain', value: 'example.com' },
      ]),
    ).toBe(true);
    expect(
      newTabSearchUrlBlocked('https://example.com/private/page', [
        { mode: 'url-prefix', value: 'https://example.com/private' },
      ]),
    ).toBe(true);
    expect(
      newTabSearchUrlBlocked('https://example.com/?utm_source=test', [
        { mode: 'exact-url', value: 'https://example.com/' },
      ]),
    ).toBe(true);
    expect(
      newTabSearchUrlBlocked('https://allowed.example.net/', [
        { mode: 'domain', value: 'example.com' },
      ]),
    ).toBe(false);
  });

  it('deduplicates tracking variants and keeps the strongest source', () => {
    const results = rankNewTabSearchCandidates(
      [
        {
          source: 'history',
          title: 'Example',
          url: 'https://example.com/?utm_source=history',
          visitCount: 12,
        },
        {
          source: 'bookmark',
          title: 'Example bookmark',
          url: 'https://example.com/',
          bookmarkId: 'bookmark-1',
        },
        {
          source: 'open-tab',
          title: 'Example open tab',
          url: 'https://example.com/#section',
          tabId: 42,
        },
      ],
      {
        query: 'example',
        limit: 12,
        sources: ['open-tab', 'bookmark', 'history', 'top-site'],
        blacklist: [],
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      source: 'open-tab',
      tabId: 42,
    });
    expect(results[0]?.sources).toEqual(['history', 'bookmark', 'open-tab']);
  });

  it('uses title quality, source priority, visits, and recency for ranking', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T00:00:00Z'));
    const results = rankNewTabSearchCandidates(
      [
        {
          source: 'history',
          title: 'Card Master documentation',
          url: 'https://example.com/card-master',
          visitCount: 60,
          lastVisitTime: Date.now() - 60_000,
        },
        {
          source: 'top-site',
          title: 'Unrelated',
          url: 'https://card-master.example/',
        },
        {
          source: 'bookmark',
          title: 'Card Master',
          url: 'https://bookmark.example/',
        },
      ],
      {
        query: 'card master',
        limit: 2,
        sources: ['open-tab', 'bookmark', 'history', 'top-site'],
        blacklist: [],
      },
    );

    expect(results.map((result) => result.source)).toEqual([
      'bookmark',
      'history',
    ]);
  });
});
