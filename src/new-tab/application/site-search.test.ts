import { describe, expect, it } from 'vitest';

import {
  findNewTabSiteSearchProvider,
  NEW_TAB_SITE_SEARCH_PROVIDERS,
  newTabSiteSearchUrl,
  parseInlineNewTabSiteSearch,
} from './site-search';

describe('new tab site search', () => {
  it('keeps only normal search engines and websites', () => {
    expect(NEW_TAB_SITE_SEARCH_PROVIDERS.length).toBeGreaterThan(20);
    expect(
      NEW_TAB_SITE_SEARCH_PROVIDERS.some((provider) =>
        /ChatGPT|Gemini|DeepSeek|Kimi|豆包|千问/.test(provider.name),
      ),
    ).toBe(false);
  });

  it('matches keys, aliases, and inline queries', () => {
    expect(findNewTabSiteSearchProvider('bili')?.key).toBe('bb');
    expect(findNewTabSiteSearchProvider('@知乎')?.key).toBe('zh');
    expect(parseInlineNewTabSiteSearch('bb 卡牌大师')).toMatchObject({
      query: '卡牌大师',
      provider: { key: 'bb' },
    });
    expect(
      newTabSiteSearchUrl(
        findNewTabSiteSearchProvider('bb') as NonNullable<
          ReturnType<typeof findNewTabSiteSearchProvider>
        >,
        '卡牌 大师',
      ),
    ).toContain('%E5%8D%A1%E7%89%8C%20%E5%A4%A7%E5%B8%88');
  });
});
