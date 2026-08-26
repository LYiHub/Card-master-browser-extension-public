import { describe, expect, it } from 'vitest';

import { userscriptSiteSearchUrl } from './site-search';

describe('userscript site search', () => {
  it('opens the Greasy Fork site index with locale filtering disabled', () => {
    expect(
      userscriptSiteSearchUrl('https://duckduckgo.com/?q=userscript'),
    ).toBe(
      'https://greasyfork.org/en/scripts/by-site/duckduckgo.com?filter_locale=0',
    );
  });

  it('uses the registrable host spelling expected by Greasy Fork for www sites', () => {
    expect(
      userscriptSiteSearchUrl('https://www.baidu.com/s?wd=userscript'),
    ).toBe(
      'https://greasyfork.org/en/scripts/by-site/baidu.com?filter_locale=0',
    );
  });

  it.each([
    ['https://open.spotify.com/playlist/example', 'spotify.com'],
    ['https://music.example.co.uk/album/example', 'example.co.uk'],
  ])('uses the registrable domain for %s', (pageUrl, domain) => {
    expect(userscriptSiteSearchUrl(pageUrl)).toBe(
      `https://greasyfork.org/en/scripts/by-site/${domain}?filter_locale=0`,
    );
  });

  it('rejects pages that cannot host userscripts', () => {
    expect(() => userscriptSiteSearchUrl('chrome://extensions/')).toThrow(
      '当前页面不支持查找站点脚本。',
    );
  });
});
