(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoCommunityLinks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  const WEB_ORIGIN = 'https://lumno.kubai.design';
  const COMMUNITY_LINKS_URL = `${WEB_ORIGIN}/community-links.json`;
  const FETCH_TIMEOUT_MS = 2500;
  const FALLBACK_LINKS = Object.freeze({
    x: 'https://x.com/kubai087',
    githubIssue: 'https://github.com/kubai087/lumno-extension/issues/new',
    chromeReview: 'https://chromewebstore.google.com/detail/lumno-%E8%81%9A%E7%84%A6%E6%90%9C%E7%B4%A2%E6%96%B0%E6%A0%87%E7%AD%BE%E9%A1%B5/nggfkkbmogmadfoikakkfegkoilfcfao/reviews?utm_source=item-share-cb',
    discord: 'https://discord.gg/2u9sg7ZNkJ',
    wechatQr: `${WEB_ORIGIN}/qrcode-20260730.webp`,
    communityByLocale: Object.freeze({
      'zh-CN': 'wechat',
      'zh-TW': 'wechat',
      ja: 'discord',
      en: 'discord'
    })
  });

  function normalizeHttpsUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' ? url.toString() : '';
    } catch (error) {
      return '';
    }
  }

  function normalizeCommunityChannel(value, fallback) {
    return value === 'wechat' || value === 'discord' ? value : fallback;
  }

  function normalizeCommunityMap(value) {
    const fallbackMap = FALLBACK_LINKS.communityByLocale;
    const source = value && typeof value === 'object' ? value : {};
    return {
      'zh-CN': normalizeCommunityChannel(
        source['zh-CN'] || source.zh_CN,
        fallbackMap['zh-CN']
      ),
      'zh-TW': normalizeCommunityChannel(
        source['zh-TW'] || source.zh_TW,
        fallbackMap['zh-TW']
      ),
      ja: normalizeCommunityChannel(source.ja, fallbackMap.ja),
      en: normalizeCommunityChannel(source.en, fallbackMap.en)
    };
  }

  function normalizeLinksPayload(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const links = source.links && typeof source.links === 'object' ? source.links : source;
    return {
      x: normalizeHttpsUrl(links.x) || FALLBACK_LINKS.x,
      githubIssue: normalizeHttpsUrl(
        links.githubIssue || links.github_issue || links.issue
      ) || FALLBACK_LINKS.githubIssue,
      chromeReview: normalizeHttpsUrl(
        links.chromeReview ||
        links.chrome_review ||
        links.chromeWebStoreReview ||
        links.chrome_web_store_review ||
        links.chromeRating ||
        links.chrome_rating
      ) || FALLBACK_LINKS.chromeReview,
      discord: normalizeHttpsUrl(links.discord) || FALLBACK_LINKS.discord,
      wechatQr: normalizeHttpsUrl(links.wechatQr || links.wechat_qr) ||
        FALLBACK_LINKS.wechatQr,
      communityByLocale: normalizeCommunityMap(
        source.communityByLocale || source.community_by_locale
      )
    };
  }

  function normalizeWebLocale(locale) {
    const normalized = String(locale || '')
      .trim()
      .replace(/_/g, '-')
      .toLowerCase();
    if (normalized === 'zh' || normalized.startsWith('zh-')) {
      return normalized.startsWith('zh-hant') ||
        /^zh-(tw|hk|mo)(-|$)/.test(normalized)
        ? 'zh-TW'
        : 'zh-CN';
    }
    if (normalized === 'ja' || normalized.startsWith('ja-')) {
      return 'ja';
    }
    return 'en';
  }

  function getCommunityChannel(links, locale) {
    const webLocale = normalizeWebLocale(locale);
    // Chinese community support lives in WeChat. Keep this product policy
    // local so a stale remote map cannot send zh-CN or zh-TW users to Discord.
    if (webLocale === 'zh-CN' || webLocale === 'zh-TW') {
      return 'wechat';
    }
    const source = links && typeof links === 'object' ? links : FALLBACK_LINKS;
    const communityMap = source.communityByLocale &&
        typeof source.communityByLocale === 'object'
      ? source.communityByLocale
      : FALLBACK_LINKS.communityByLocale;
    return normalizeCommunityChannel(
      communityMap[webLocale],
      FALLBACK_LINKS.communityByLocale[webLocale]
    );
  }

  function getCommunityUrl(links, locale) {
    const source = links && typeof links === 'object' ? links : FALLBACK_LINKS;
    return getCommunityChannel(source, locale) === 'wechat'
      ? (source.wechatQr || FALLBACK_LINKS.wechatQr)
      : (source.discord || FALLBACK_LINKS.discord);
  }

  function buildFreshQrUrl(value, timestamp) {
    const safeUrl = normalizeHttpsUrl(value);
    if (!safeUrl) {
      return '';
    }
    const url = new URL(safeUrl);
    url.searchParams.set(
      '_lumno_refresh',
      String(Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now())
    );
    return url.toString();
  }

  function createLoader(options) {
    const config = options && typeof options === 'object' ? options : {};
    let currentLinks = FALLBACK_LINKS;
    let loaded = false;
    let loadingPromise = null;

    function getLinks() {
      return currentLinks;
    }

    function load(loadOptions) {
      const settings = loadOptions && typeof loadOptions === 'object' ? loadOptions : {};
      const force = settings.force === true;
      if (!force && loaded) {
        return Promise.resolve(currentLinks);
      }
      if (loadingPromise) {
        return loadingPromise;
      }
      const fetchImpl = settings.fetchImpl || config.fetchImpl ||
        (root && typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
      if (!fetchImpl) {
        return Promise.resolve(currentLinks);
      }
      const timeoutRuntime = settings.windowObj || config.windowObj || root;
      const AbortControllerImpl = settings.AbortControllerImpl ||
        config.AbortControllerImpl ||
        (root && typeof root.AbortController === 'function' ? root.AbortController : null);
      const controller = AbortControllerImpl ? new AbortControllerImpl() : null;
      const timeoutMs = Number.isFinite(Number(settings.timeoutMs))
        ? Math.max(0, Number(settings.timeoutMs))
        : FETCH_TIMEOUT_MS;
      const timeoutId = controller && timeoutRuntime &&
          typeof timeoutRuntime.setTimeout === 'function'
        ? timeoutRuntime.setTimeout(() => controller.abort(), timeoutMs)
        : 0;
      loadingPromise = Promise.resolve(fetchImpl(settings.url || COMMUNITY_LINKS_URL, {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      }))
        .then((response) => {
          if (!response || !response.ok || typeof response.json !== 'function') {
            throw new Error('community links unavailable');
          }
          return response.json();
        })
        .then((payload) => {
          currentLinks = normalizeLinksPayload(payload);
          loaded = true;
          return currentLinks;
        })
        .catch(() => {
          // Cache the fallback for this page session. A forced load remains
          // available for user-triggered refreshes without retrying on every
          // consumer after an offline or timed-out request.
          loaded = true;
          return currentLinks;
        })
        .finally(() => {
          if (timeoutId && timeoutRuntime &&
              typeof timeoutRuntime.clearTimeout === 'function') {
            timeoutRuntime.clearTimeout(timeoutId);
          }
          loadingPromise = null;
        });
      return loadingPromise;
    }

    return Object.freeze({
      getLinks,
      load
    });
  }

  const defaultLoader = createLoader();

  return Object.freeze({
    COMMUNITY_LINKS_URL,
    FALLBACK_LINKS,
    FETCH_TIMEOUT_MS,
    WEB_ORIGIN,
    buildFreshQrUrl,
    createLoader,
    getCommunityChannel,
    getCommunityUrl,
    getLinks: defaultLoader.getLinks,
    load: defaultLoader.load,
    normalizeHttpsUrl,
    normalizeLinksPayload,
    normalizeWebLocale
  });
});
