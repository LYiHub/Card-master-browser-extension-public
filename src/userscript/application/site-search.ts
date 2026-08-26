import { resolveSiteScope } from '../../lib/site-scope';

export function userscriptSiteSearchUrl(pageUrl: string) {
  const url = new URL(pageUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('当前页面不支持查找站点脚本。');
  }
  const site = resolveSiteScope(url.href);
  if (!site) throw new Error('当前页面不支持查找站点脚本。');
  return `https://greasyfork.org/en/scripts/by-site/${encodeURIComponent(site.host)}?filter_locale=0`;
}
