import { resolveSiteScope } from '../../lib/site-scope';
import { t } from '../../localization/messages';

export function userscriptSiteSearchUrl(pageUrl: string) {
  const url = new URL(pageUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(t('cm_site_search_error_1'));
  }
  const site = resolveSiteScope(url.href);
  if (!site) throw new Error(t('cm_site_search_error_2'));
  return `https://greasyfork.org/en/scripts/by-site/${encodeURIComponent(site.host)}?filter_locale=0`;
}
