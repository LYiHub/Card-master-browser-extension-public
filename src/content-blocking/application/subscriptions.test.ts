import { describe, expect, it } from 'vitest';

import {
  ContentBlockingSubscriptionFetcher,
  normalizeSubscriptionUrl,
  sanitizeSubscription,
  subscriptionNameFromSource,
} from './subscriptions';

describe('content blocking subscriptions', () => {
  it('accepts HTTPS and strips URL fragments', () => {
    expect(
      normalizeSubscriptionUrl('https://filters.example/list.txt#section'),
    ).toBe('https://filters.example/list.txt');
  });

  it('rejects insecure remote sources', () => {
    expect(() =>
      normalizeSubscriptionUrl('http://filters.example/list.txt'),
    ).toThrow('HTTPS');
  });

  it('rejects subscription URLs that embed credentials', () => {
    expect(() =>
      normalizeSubscriptionUrl('https://user:secret@filters.example/list.txt'),
    ).toThrow('登录凭据');
  });

  it('keeps declarative rules and rejects executable remote rules', () => {
    expect(
      sanitizeSubscription(`! list
||ads.example^
example.com##.sponsor
example.com#%#alert('remote')
example.com##+js(abort-on-property-read, ad)
`),
    ).toEqual({
      content: '! list\n||ads.example^\nexample.com##.sponsor',
      ruleCount: 2,
      rejectedRuleCount: 2,
    });
  });

  it('derives a custom-list title from standard filter metadata', () => {
    expect(
      subscriptionNameFromSource(
        '! Title: Example Privacy List\n||tracker.example^',
        'https://filters.example/privacy.txt',
      ),
    ).toBe('Example Privacy List');
    expect(
      subscriptionNameFromSource(
        '||tracker.example^',
        'https://filters.example/privacy.txt',
      ),
    ).toBe('filters.example / privacy.txt');
  });

  it('enforces the byte limit while streaming a subscription body', async () => {
    const oversized = new Uint8Array(8 * 1024 * 1024 + 1);
    const fetcher = new ContentBlockingSubscriptionFetcher(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(oversized);
              controller.close();
            },
          }),
          { status: 200 },
        ),
    );

    await expect(
      fetcher.download({ url: 'https://filters.example/list.txt' }),
    ).rejects.toThrow('8 MB');
  });
});
