import { t } from '../../localization/messages';
export type NewTabSiteSearchProvider = {
  key: string;
  aliases: readonly string[];
  name: string;
  template: string;
  group: 'search-engine' | 'website';
};

export const NEW_TAB_SITE_SEARCH_PROVIDERS: readonly NewTabSiteSearchProvider[] =
  [
    {
      key: 'bd',
      aliases: ['baidu', '百度'],
      get name() {
        return t('cm_site_search_name_2');
      },
      template: 'https://www.baidu.com/s?wd={query}',
      group: 'search-engine',
    },
    {
      key: 'bi',
      aliases: ['bing', '必应'],
      get name() {
        return t('cm_site_search_name_4');
      },
      template: 'https://www.bing.com/search?q={query}',
      group: 'search-engine',
    },
    {
      key: 'gg',
      aliases: ['google', '谷歌'],
      name: 'Google',
      template: 'https://www.google.com/search?q={query}',
      group: 'search-engine',
    },
    {
      key: 'ddg',
      aliases: ['duckduckgo', 'duck'],
      name: 'DuckDuckGo',
      template: 'https://duckduckgo.com/?q={query}',
      group: 'search-engine',
    },
    {
      key: 'br',
      aliases: ['brave', 'brave search'],
      name: 'Brave Search',
      template: 'https://search.brave.com/search?q={query}',
      group: 'search-engine',
    },
    {
      key: 'sg',
      aliases: ['sogou', '搜狗'],
      get name() {
        return t('cm_site_search_name_7');
      },
      template: 'https://www.sogou.com/web?query={query}',
      group: 'search-engine',
    },
    {
      key: 'yt',
      aliases: ['youtube'],
      name: 'YouTube',
      template: 'https://www.youtube.com/results?search_query={query}',
      group: 'website',
    },
    {
      key: 'bb',
      aliases: ['bilibili', 'bili', '哔哩哔哩', 'b站'],
      get name() {
        return t('cm_site_search_name_10');
      },
      template: 'https://search.bilibili.com/all?keyword={query}',
      group: 'website',
    },
    {
      key: 'gh',
      aliases: ['github'],
      name: 'GitHub',
      template: 'https://github.com/search?q={query}',
      group: 'website',
    },
    {
      key: 'sf',
      aliases: ['stackoverflow', 'stack overflow'],
      name: 'Stack Overflow',
      template: 'https://stackoverflow.com/search?q={query}',
      group: 'website',
    },
    {
      key: 'mdn',
      aliases: ['mdn web docs'],
      name: 'MDN',
      template: 'https://developer.mozilla.org/zh-CN/search?q={query}',
      group: 'website',
    },
    {
      key: 'npm',
      aliases: ['npmjs'],
      name: 'npm',
      template: 'https://www.npmjs.com/search?q={query}',
      group: 'website',
    },
    {
      key: 'hf',
      aliases: ['huggingface', 'hugging face'],
      name: 'Hugging Face',
      template: 'https://huggingface.co/search/full-text?q={query}',
      group: 'website',
    },
    {
      key: 'gs',
      aliases: ['scholar', 'google scholar'],
      name: 'Google Scholar',
      template: 'https://scholar.google.com/scholar?q={query}',
      group: 'website',
    },
    {
      key: 'maps',
      aliases: ['map', 'google maps', '地图'],
      get name() {
        return t('cm_site_search_name_12');
      },
      template: 'https://www.google.com/maps/search/?api=1&query={query}',
      group: 'website',
    },
    {
      key: 'zh',
      aliases: ['zhihu', '知乎'],
      get name() {
        return t('cm_site_search_name_14');
      },
      template: 'https://www.zhihu.com/search?q={query}',
      group: 'website',
    },
    {
      key: 'db',
      aliases: ['douban', '豆瓣'],
      get name() {
        return t('cm_site_search_name_16');
      },
      template: 'https://www.douban.com/search?q={query}',
      group: 'website',
    },
    {
      key: 'jj',
      aliases: ['juejin', '掘金'],
      get name() {
        return t('cm_site_search_name_18');
      },
      template: 'https://juejin.cn/search?query={query}',
      group: 'website',
    },
    {
      key: 'tb',
      aliases: ['taobao', '淘宝'],
      get name() {
        return t('cm_site_search_name_20');
      },
      template: 'https://s.taobao.com/search?q={query}',
      group: 'website',
    },
    {
      key: 'tm',
      aliases: ['tmall', '天猫'],
      get name() {
        return t('cm_site_search_name_22');
      },
      template: 'https://list.tmall.com/search_product.htm?q={query}',
      group: 'website',
    },
    {
      key: 'wx',
      aliases: ['weixin', 'wechat', '微信'],
      get name() {
        return t('cm_site_search_name_24');
      },
      template: 'https://weixin.sogou.com/weixin?query={query}',
      group: 'website',
    },
    {
      key: 'wb',
      aliases: ['weibo', '微博'],
      get name() {
        return t('cm_site_search_name_26');
      },
      template: 'https://s.weibo.com/weibo?q={query}',
      group: 'website',
    },
    {
      key: 'xhs',
      aliases: ['xiaohongshu', '小红书'],
      get name() {
        return t('cm_site_search_name_28');
      },
      template: 'https://www.xiaohongshu.com/search_result?keyword={query}',
      group: 'website',
    },
    {
      key: 'dy',
      aliases: ['douyin', '抖音'],
      get name() {
        return t('cm_site_search_name_30');
      },
      template: 'https://www.douyin.com/search/{query}',
      group: 'website',
    },
    {
      key: 'jd',
      aliases: ['jd', 'jingdong', '京东'],
      get name() {
        return t('cm_site_search_name_32');
      },
      template: 'https://search.jd.com/Search?keyword={query}',
      group: 'website',
    },
    {
      key: 'wiki',
      aliases: ['wikipedia', '维基百科'],
      get name() {
        return t('cm_site_search_name_34');
      },
      template: 'https://zh.wikipedia.org/w/index.php?search={query}',
      group: 'website',
    },
  ];

function providerTokens(provider: NewTabSiteSearchProvider) {
  return [provider.key, provider.name, ...provider.aliases].map((value) =>
    value.trim().toLocaleLowerCase(),
  );
}

export function findNewTabSiteSearchProvider(
  trigger: string,
  providers = NEW_TAB_SITE_SEARCH_PROVIDERS,
) {
  const normalized = trigger.trim().replace(/^@/, '').toLocaleLowerCase();
  if (!normalized) return null;
  return (
    providers.find((provider) =>
      providerTokens(provider).includes(normalized),
    ) ?? null
  );
}

export function parseInlineNewTabSiteSearch(
  input: string,
  providers = NEW_TAB_SITE_SEARCH_PROVIDERS,
) {
  const raw = input.trim();
  const separator = raw.search(/\s/);
  if (separator <= 0) return null;
  const provider = findNewTabSiteSearchProvider(
    raw.slice(0, separator),
    providers,
  );
  const query = raw.slice(separator).trim();
  return provider && query ? { provider, query } : null;
}

export function newTabSiteSearchUrl(
  provider: NewTabSiteSearchProvider,
  query: string,
) {
  return provider.template.replaceAll(
    '{query}',
    encodeURIComponent(query.trim()),
  );
}
