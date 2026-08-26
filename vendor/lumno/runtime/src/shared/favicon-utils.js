(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoFaviconUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const LUMNO_EXTENSION_ICON_PATH = 'assets/images/lumno.png';

  function setBoundedCacheEntry(cache, key, value, maxEntries) {
    if (!cache || typeof cache.set !== 'function' || key === null || typeof key === 'undefined') {
      return value;
    }
    const parsedLimit = Math.floor(Number(maxEntries));
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 1;
    if (typeof cache.delete === 'function' && typeof cache.has === 'function' && cache.has(key)) {
      cache.delete(key);
    }
    cache.set(key, value);
    if (typeof cache.size !== 'number' || cache.size <= limit ||
        typeof cache.keys !== 'function' || typeof cache.delete !== 'function') {
      return value;
    }
    while (cache.size > limit) {
      const oldest = cache.keys().next();
      if (!oldest || oldest.done) {
        break;
      }
      cache.delete(oldest.value);
    }
    return value;
  }

  function normalizeFaviconHost(hostname) {
    if (!hostname) {
      return '';
    }
    const host = String(hostname).toLowerCase().replace(/^www\./i, '');
    if (host === 'feishu.cn' || host.endsWith('.feishu.cn')) {
      return 'feishu.cn';
    }
    return host;
  }

  function isFaviconProxyUrl(url) {
    return /google\.com\/s2\/favicons/i.test(String(url || '')) ||
      /gstatic\.com\/favicon/i.test(String(url || '')) ||
      /gstatic\.cn\/faviconv2/i.test(String(url || '')) ||
      /^chrome-extension:\/\/[^/]+\/_favicon\//i.test(String(url || '').trim()) ||
      /favicon\.is\//i.test(String(url || ''));
  }

  function isChromeMonogramFaviconUrl(url) {
    return /^chrome:\/\/favicon2\//i.test(String(url || '').trim());
  }

  function isSafeVirtualFaviconRequestUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) {
      return false;
    }
    if (isChromeMonogramFaviconUrl(raw)) {
      return true;
    }
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'chrome-extension:' &&
        String(parsed.pathname || '').toLowerCase().startsWith('/_favicon/');
    } catch (e) {
      return false;
    }
  }

  function isFaviconSourceAllowedByEnhancedFetchPolicy(url, enhancedFetchEnabled, options) {
    const raw = String(url || '').trim();
    if (!raw) {
      return false;
    }
    if (raw.startsWith('data:') || isChromeMonogramFaviconUrl(raw)) {
      return true;
    }
    try {
      const parsed = new URL(raw);
      if (!isBrowserExtensionProtocol(parsed.protocol)) {
        return enhancedFetchEnabled === true;
      }
      const config = options || {};
      const runtime = config.chromeApi && config.chromeApi.runtime ? config.chromeApi.runtime : null;
      const ownExtensionId = String(config.ownExtensionId || (runtime && runtime.id) || '').trim();
      const isOwnExtensionUrl = Boolean(
        ownExtensionId &&
        isBrowserExtensionProtocol(parsed.protocol) &&
        String(parsed.hostname || '') === ownExtensionId
      );
      if (!isOwnExtensionUrl) {
        return false;
      }
      const pathname = String(parsed.pathname || '').toLowerCase();
      return pathname.startsWith('/_favicon/') ||
        pathname === `/${LUMNO_EXTENSION_ICON_PATH.toLowerCase()}` ||
        /^\/assets\/images\/site-search\/[^/]+\.(?:svg|png)$/.test(pathname);
    } catch (e) {
      return enhancedFetchEnabled === true;
    }
  }

  function getFaviconDecisionHostname(pageUrl, candidateUrl) {
    const values = [pageUrl, getCanonicalPageUrlForFavicon(candidateUrl), candidateUrl];
    for (let index = 0; index < values.length; index += 1) {
      try {
        const parsed = new URL(String(values[index] || '').trim());
        if (parsed.hostname) {
          return String(parsed.hostname).toLowerCase();
        }
      } catch (e) {
        // Try the next redaction-safe source.
      }
    }
    return '';
  }

  function getFaviconCandidateKind(url, providedKind) {
    const explicitKind = String(providedKind || '').trim().toLowerCase();
    if (explicitKind) {
      return explicitKind;
    }
    const raw = String(url || '').trim();
    if (/^chrome-extension:\/\/[^/]+\/_favicon\//i.test(raw)) {
      return 'browser-cache';
    }
    if (isChromeMonogramFaviconUrl(raw)) {
      return 'browser-favicon';
    }
    if (isFaviconProxyUrl(raw)) {
      return 'third-party-proxy';
    }
    if (/^https?:\/\//i.test(raw)) {
      return 'direct';
    }
    return 'other';
  }

  function createFaviconDecisionLogger(options) {
    const config = options || {};
    const surface = String(config.surface || 'unknown').trim() || 'unknown';
    const consoleObj = config.consoleObj || (typeof console !== 'undefined' ? console : null);
    const seen = new Set();
    return function logFaviconDecision(candidateUrl, reason, details) {
      const decisionReason = String(reason || '').trim();
      if (!decisionReason || !consoleObj || typeof consoleObj.debug !== 'function') {
        return false;
      }
      const metadata = details || {};
      const hostname = getFaviconDecisionHostname(metadata.pageUrl, candidateUrl);
      const candidateKind = getFaviconCandidateKind(candidateUrl, metadata.candidateKind);
      const key = `${surface}|${hostname}|${decisionReason}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      consoleObj.debug('[Lumno][favicon]', {
        surface,
        candidateKind,
        hostname,
        decision: 'blocked',
        reason: decisionReason
      });
      return true;
    };
  }

  function getHttpPageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    try {
      const parsed = new URL(raw);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
    } catch (e) {
      return '';
    }
  }

  function getFaviconPageSearchParam(parsedUrl) {
    if (!parsedUrl || !parsedUrl.searchParams) {
      return '';
    }
    return parsedUrl.searchParams.get('pageUrl') ||
      parsedUrl.searchParams.get('url') ||
      parsedUrl.searchParams.get('domain_url') ||
      '';
  }

  function getPageUrlFromFaviconProxyUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) {
      return '';
    }
    try {
      const parsed = new URL(raw);
      const lowerHost = parsed.hostname.toLowerCase();
      const lowerPath = parsed.pathname.toLowerCase();
      const isExtensionFavicon = parsed.protocol === 'chrome-extension:' && lowerPath.startsWith('/_favicon/');
      const isChromeFavicon = parsed.protocol === 'chrome:' && lowerHost === 'favicon2';
      const isGstaticFavicon = /(?:^|\.)gstatic\.(?:com|cn)$/i.test(lowerHost) && lowerPath.includes('/favicon');
      const isGoogleS2Favicon = /(?:^|\.)google\.[^/]+$/i.test(lowerHost) && lowerPath.includes('/s2/favicons');
      const isFaviconIs = /(?:^|\.)favicon\.is$/i.test(lowerHost);
      if (isExtensionFavicon || isChromeFavicon || isGstaticFavicon || isGoogleS2Favicon || isFaviconIs) {
        const directPageUrl = getHttpPageUrl(getFaviconPageSearchParam(parsed));
        if (directPageUrl) {
          return directPageUrl;
        }
        const domain = String(parsed.searchParams.get('domain') || '').trim();
        if (domain && !/[/?#]/.test(domain)) {
          return getHttpPageUrl(`https://${domain}/`);
        }
      }
    } catch (e) {
      return '';
    }
    return '';
  }

  function getCanonicalPageUrlForFavicon(url) {
    let current = String(url || '').trim();
    if (!current) {
      return '';
    }
    for (let i = 0; i < 4; i += 1) {
      const next = getPageUrlFromFaviconProxyUrl(current);
      if (!next || next === current) {
        return current;
      }
      current = next;
    }
    return current;
  }

  function getCanonicalFaviconHost(url) {
    const pageUrl = getCanonicalPageUrlForFavicon(url);
    if (!pageUrl) {
      return '';
    }
    try {
      return normalizeFaviconHost(new URL(pageUrl).hostname);
    } catch (e) {
      return '';
    }
  }

  function getExtensionFaviconUrl(pageUrl, options) {
    if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) {
      return '';
    }
    const getRuntimeUrl = options && typeof options.getRuntimeUrl === 'function'
      ? options.getRuntimeUrl
      : null;
    if (!getRuntimeUrl) {
      return '';
    }
    const size = Number.isFinite(Number(options && options.size))
      ? Math.max(1, Math.round(Number(options.size)))
      : 128;
    try {
      const faviconUrl = new URL(getRuntimeUrl('/_favicon/'));
      faviconUrl.searchParams.set('pageUrl', pageUrl);
      faviconUrl.searchParams.set('size', String(size));
      return faviconUrl.toString();
    } catch (e) {
      return '';
    }
  }

  function getGstaticFaviconUrl(pageUrl, options) {
    if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) {
      return '';
    }
    const size = Number.isFinite(Number(options && options.size))
      ? Math.max(1, Math.round(Number(options.size)))
      : 128;
    const host = options && options.host ? String(options.host) : 't2.gstatic.cn';
    try {
      const faviconUrl = new URL(`https://${host}/faviconV2`);
      faviconUrl.searchParams.set('client', 'SOCIAL');
      faviconUrl.searchParams.set('type', 'FAVICON');
      faviconUrl.searchParams.set('fallback_opts', 'TYPE,SIZE,URL');
      faviconUrl.searchParams.set('url', pageUrl);
      faviconUrl.searchParams.set('size', String(size));
      return faviconUrl.toString();
    } catch (e) {
      return '';
    }
  }

  function getChromeFaviconUrl(pageUrl, options) {
    const page = String(pageUrl || '').trim();
    if (!page) {
      return '';
    }
    const size = Number.isFinite(Number(options && options.size))
      ? Math.max(1, Math.round(Number(options.size)))
      : 128;
    try {
      const faviconUrl = new URL('chrome://favicon2/');
      faviconUrl.searchParams.set('pageUrl', page);
      faviconUrl.searchParams.set('size', String(size));
      return faviconUrl.toString();
    } catch (e) {
      return '';
    }
  }

  function isBrowserInternalPageUrl(url) {
    const lower = String(url || '').trim().toLowerCase();
    return lower.startsWith('chrome://') ||
      lower.startsWith('chrome-search://') ||
      lower.startsWith('edge://') ||
      lower.startsWith('brave://') ||
      lower.startsWith('vivaldi://') ||
      lower.startsWith('opera://') ||
      lower.startsWith('about:');
  }

  function isBrowserExtensionProtocol(protocol) {
    const normalized = String(protocol || '').toLowerCase();
    return normalized === 'chrome-extension:' ||
      normalized === 'moz-extension:' ||
      normalized === 'ms-browser-extension:';
  }

  function getBrowserPageFaviconUrl(pageUrl, options) {
    const page = String(pageUrl || '').trim();
    if (!isBrowserInternalPageUrl(page)) {
      return '';
    }
    const size = Number.isFinite(Number(options && options.size))
      ? Math.max(1, Math.round(Number(options.size)))
      : 128;
    const getRuntimeUrl = options && typeof options.getRuntimeUrl === 'function'
      ? options.getRuntimeUrl
      : null;
    if (getRuntimeUrl) {
      try {
        const faviconUrl = new URL(getRuntimeUrl('/_favicon/'));
        faviconUrl.searchParams.set('pageUrl', page);
        faviconUrl.searchParams.set('size', String(size));
        return faviconUrl.toString();
      } catch (e) {
        // Fall through to chrome://favicon2 below.
      }
    }
    return getChromeFaviconUrl(page, { size });
  }

  function normalizeFaviconThemePreference(theme) {
    const value = String(theme || '').trim().toLowerCase();
    return value === 'dark' || value === 'light' ? value : '';
  }

  function hasThemeTokenInUrl(url, token) {
    const mode = normalizeFaviconThemePreference(token);
    if (!mode) {
      return false;
    }
    const lower = String(url || '').toLowerCase();
    return new RegExp(`(^|[._/-])${mode}([._/-]|$)`).test(lower);
  }

  function shouldSkipThemeUpgradeCandidate(candidateUrl, preferredTheme, currentUrl) {
    const mode = normalizeFaviconThemePreference(preferredTheme);
    if (!mode) {
      return false;
    }
    const opposite = mode === 'dark' ? 'light' : 'dark';
    if (hasThemeTokenInUrl(candidateUrl, opposite)) {
      return true;
    }
    const currentHasPreferredToken = hasThemeTokenInUrl(currentUrl, mode);
    const candidateHasPreferredToken = hasThemeTokenInUrl(candidateUrl, mode);
    if (currentHasPreferredToken && !candidateHasPreferredToken) {
      return true;
    }
    return false;
  }

  function getRuntimeFaviconUrl(path, options) {
    const getRuntimeUrl = options && typeof options.getRuntimeUrl === 'function'
      ? options.getRuntimeUrl
      : null;
    if (!getRuntimeUrl) {
      return '';
    }
    try {
      return String(getRuntimeUrl(path) || '');
    } catch (e) {
      return '';
    }
  }

  function getOwnExtensionRuntimeInfo(options, getRuntimeUrl) {
    const runtime = options && options.chromeApi && options.chromeApi.runtime
      ? options.chromeApi.runtime
      : null;
    const info = {
      id: runtime && runtime.id ? String(runtime.id) : '',
      protocol: 'chrome-extension:'
    };
    if (typeof getRuntimeUrl !== 'function') {
      return info;
    }
    ['', '/'].some((path) => {
      let runtimeUrl = '';
      try {
        runtimeUrl = String(getRuntimeUrl(path) || '').trim();
      } catch (e) {
        return false;
      }
      if (!runtimeUrl) {
        return false;
      }
      try {
        const parsed = new URL(runtimeUrl);
        if (!isBrowserExtensionProtocol(parsed.protocol)) {
          return false;
        }
        if (!info.id && parsed.hostname) {
          info.id = parsed.hostname;
        }
        if (!info.protocol || !info.id || parsed.hostname === info.id) {
          info.protocol = parsed.protocol;
        }
        return Boolean(info.id);
      } catch (e) {
        return false;
      }
    });
    return info;
  }

  function getOwnExtensionAssetUrl(path, runtimeInfo, options) {
    const assetPath = String(path || '').replace(/^\/+/, '');
    if (!assetPath) {
      return '';
    }
    const runtimeUrl = getRuntimeFaviconUrl(assetPath, options);
    if (runtimeUrl) {
      try {
        const parsed = new URL(runtimeUrl);
        if (isBrowserExtensionProtocol(parsed.protocol) &&
            (!runtimeInfo || !runtimeInfo.id || parsed.hostname === runtimeInfo.id)) {
          return runtimeUrl;
        }
      } catch (e) {
        // Fall through to constructing the known extension asset URL below.
      }
    }
    if (runtimeInfo && runtimeInfo.id) {
      return `${runtimeInfo.protocol || 'chrome-extension:'}//${runtimeInfo.id}/${assetPath}`;
    }
    return runtimeUrl;
  }

  function getKnownThemedFaviconCandidateScores(hostname, preferredTheme, options) {
    const host = normalizeFaviconHost(hostname);
    const mode = normalizeFaviconThemePreference(preferredTheme);
    if (!host) {
      return [];
    }
    if (host === 'lumno.kubai.design') {
      return [
        {
          url: getRuntimeFaviconUrl(LUMNO_EXTENSION_ICON_PATH, options) || 'https://lumno.kubai.design/favicon.png',
          score: 58
        }
      ];
    }
    if (host === 'github.com' || host.endsWith('.github.com')) {
      if (mode === 'dark') {
        return [
          { url: 'https://github.githubassets.com/favicons/favicon-dark.svg', score: 60 },
          { url: 'https://github.githubassets.com/favicons/favicon.svg', score: 42 },
          { url: 'https://github.githubassets.com/favicons/favicon.png', score: 36 }
        ];
      }
      if (mode === 'light') {
        return [
          { url: 'https://github.githubassets.com/favicons/favicon.svg', score: 60 },
          { url: 'https://github.githubassets.com/favicons/favicon-dark.svg', score: 40 },
          { url: 'https://github.githubassets.com/favicons/favicon.png', score: 36 }
        ];
      }
      return [
        { url: 'https://github.githubassets.com/favicons/favicon.svg', score: 52 },
        { url: 'https://github.githubassets.com/favicons/favicon-dark.svg', score: 52 },
        { url: 'https://github.githubassets.com/favicons/favicon.png', score: 36 }
      ];
    }
    return [];
  }

  function getKnownThemedFaviconCandidateUrls(hostname, preferredTheme, options) {
    const mode = normalizeFaviconThemePreference(preferredTheme);
    const scoreMode = mode === 'dark' ? 'dark' : 'light';
    return getKnownThemedFaviconCandidateScores(hostname, scoreMode, options)
      .map((item) => item.url)
      .filter(Boolean);
  }

  function getRootFaviconCandidateScores(hostname, preferredTheme) {
    const host = normalizeFaviconHost(hostname);
    const mode = normalizeFaviconThemePreference(preferredTheme);
    if (!host) {
      return [];
    }
    const themed = mode === 'dark'
      ? [
        { url: `https://${host}/favicon-dark.svg`, score: 34 },
        { url: `https://${host}/favicon.svg`, score: 28 },
        { url: `https://${host}/favicon-light.svg`, score: 16 }
      ]
      : mode === 'light'
        ? [
          { url: `https://${host}/favicon-light.svg`, score: 32 },
          { url: `https://${host}/favicon.svg`, score: 29 },
          { url: `https://${host}/favicon-dark.svg`, score: 15 }
        ]
        : [
          { url: `https://${host}/favicon.svg`, score: 28 },
          { url: `https://${host}/favicon-dark.svg`, score: 20 },
          { url: `https://${host}/favicon-light.svg`, score: 20 }
        ];
    return [
      ...themed,
      { url: `https://${host}/favicon.ico`, score: 24 },
      { url: `https://${host}/apple-touch-icon.png`, score: 16 }
    ];
  }

  function getRootFaviconCandidateUrls(hostname, preferredTheme) {
    const host = normalizeFaviconHost(hostname);
    const mode = normalizeFaviconThemePreference(preferredTheme);
    if (!host) {
      return [];
    }
    const siteSvgFavicon = `https://${host}/favicon.svg`;
    const siteDarkSvgFavicon = `https://${host}/favicon-dark.svg`;
    const siteLightSvgFavicon = `https://${host}/favicon-light.svg`;
    const sitePngFavicon = `https://${host}/favicon.png`;
    const site32PngFavicon = `https://${host}/favicon-32x32.png`;
    const site16PngFavicon = `https://${host}/favicon-16x16.png`;
    const siteIcoFavicon = `https://${host}/favicon.ico`;
    const siteAppleTouchIcon = `https://${host}/apple-touch-icon.png`;
    const siteAppleTouchIconPrecomposed = `https://${host}/apple-touch-icon-precomposed.png`;
    const siteIconPng = `https://${host}/icon.png`;
    const candidates = mode === 'dark'
      ? [
        siteDarkSvgFavicon,
        siteSvgFavicon,
        sitePngFavicon,
        siteIcoFavicon,
        site32PngFavicon,
        site16PngFavicon,
        siteAppleTouchIcon,
        siteAppleTouchIconPrecomposed,
        siteIconPng,
        siteLightSvgFavicon
      ]
      : [
        siteLightSvgFavicon,
        siteSvgFavicon,
        sitePngFavicon,
        siteIcoFavicon,
        site32PngFavicon,
        site16PngFavicon,
        siteAppleTouchIcon,
        siteAppleTouchIconPrecomposed,
        siteIconPng,
        siteDarkSvgFavicon
      ];
    const seen = new Set();
    return candidates.filter((candidate) => {
      if (!candidate || seen.has(candidate)) {
        return false;
      }
      seen.add(candidate);
      return true;
    });
  }

  function getThemeHintScore(url, mediaValue, preferredTheme) {
    const normalizedTheme = normalizeFaviconThemePreference(preferredTheme);
    if (!normalizedTheme) {
      return 0;
    }
    let score = 0;
    const lowerMedia = String(mediaValue || '').toLowerCase();
    if (lowerMedia.includes('prefers-color-scheme')) {
      const hasDark = /prefers-color-scheme\s*:\s*dark/.test(lowerMedia);
      const hasLight = /prefers-color-scheme\s*:\s*light/.test(lowerMedia);
      if ((normalizedTheme === 'dark' && hasDark) || (normalizedTheme === 'light' && hasLight)) {
        score += 34;
      }
      if ((normalizedTheme === 'dark' && hasLight) || (normalizedTheme === 'light' && hasDark)) {
        score -= 20;
      }
    }
    const hasDarkToken = hasThemeTokenInUrl(url, 'dark');
    const hasLightToken = hasThemeTokenInUrl(url, 'light');
    if (normalizedTheme === 'dark') {
      if (hasDarkToken) {
        score += 16;
      }
      if (hasLightToken) {
        score -= 8;
      }
    } else if (normalizedTheme === 'light') {
      if (hasLightToken) {
        score += 16;
      }
      if (hasDarkToken) {
        score -= 8;
      }
    }
    return score;
  }

  function getHtmlAttributeValue(tag, name) {
    if (!tag || !name) {
      return '';
    }
    const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
    const match = String(tag).match(pattern);
    return match ? String(match[2] || match[3] || match[4] || '').trim() : '';
  }

  function parseHtmlIconCandidateScores(html, pageUrl, preferredTheme) {
    if (!html || !pageUrl) {
      return [];
    }
    const normalizedTheme = normalizeFaviconThemePreference(preferredTheme);
    const list = [];
    const linkMatches = String(html).match(/<link\b[^>]*>/gi) || [];
    linkMatches.forEach((tag) => {
      const rel = getHtmlAttributeValue(tag, 'rel').toLowerCase();
      const hrefRaw = getHtmlAttributeValue(tag, 'href');
      if (!rel.includes('icon') || !hrefRaw) {
        return;
      }
      let href = '';
      try {
        href = new URL(hrefRaw, pageUrl).href;
      } catch (e) {
        return;
      }
      const type = getHtmlAttributeValue(tag, 'type').toLowerCase();
      const sizes = getHtmlAttributeValue(tag, 'sizes').toLowerCase();
      const media = getHtmlAttributeValue(tag, 'media').toLowerCase();
      let score = 10;
      if (/\bicon\b/.test(rel)) {
        score += 20;
      }
      if (rel.includes('shortcut')) {
        score += 6;
      }
      if (rel.includes('apple-touch-icon')) {
        score += 8;
      }
      if (type.includes('svg') || href.toLowerCase().endsWith('.svg')) {
        score += 14;
      }
      if (href.toLowerCase().includes('favicon')) {
        score += 6;
      }
      score += getThemeHintScore(href, media, normalizedTheme);
      const sizeNumbers = sizes.match(/\d+/g);
      if (sizeNumbers && sizeNumbers.length > 0) {
        const size = Math.max(...sizeNumbers.map((n) => Number(n) || 0));
        score += Math.min(20, Math.floor(size / 8));
      }
      list.push({ url: href, score: score });
      if (normalizedTheme === 'dark' && /\/favicon\.svg(?:[?#].*)?$/i.test(href)) {
        list.push({
          url: href.replace(/\/favicon\.svg([?#].*)?$/i, '/favicon-dark.svg$1'),
          score: score + 14
        });
      }
      if (normalizedTheme === 'light' && /\/favicon-dark\.svg(?:[?#].*)?$/i.test(href)) {
        list.push({
          url: href.replace(/\/favicon-dark\.svg([?#].*)?$/i, '/favicon.svg$1'),
          score: score + 14
        });
      }
      const baseHrefRaw = getHtmlAttributeValue(tag, 'data-base-href');
      if (baseHrefRaw) {
        let baseHref = '';
        try {
          baseHref = new URL(baseHrefRaw, pageUrl).href;
        } catch (e) {
          baseHref = '';
        }
        if (baseHref) {
          if (normalizedTheme === 'dark') {
            list.push({ url: `${baseHref}-dark.svg`, score: score + 20 });
            list.push({ url: `${baseHref}.svg`, score: score + 8 });
          } else if (normalizedTheme === 'light') {
            list.push({ url: `${baseHref}.svg`, score: score + 20 });
            list.push({ url: `${baseHref}-light.svg`, score: score + 12 });
          } else {
            list.push({ url: `${baseHref}.svg`, score: score + 12 });
            list.push({ url: `${baseHref}-dark.svg`, score: score + 12 });
          }
        }
      }
    });
    return list;
  }

  function getThemeFaviconCandidateUrls(urls, options) {
    const includeProxy = !options || options.includeProxy !== false;
    const includeChrome = Boolean(options && options.includeChrome);
    const concrete = [];
    const proxy = [];
    const seen = new Set();
    (Array.isArray(urls) ? urls : []).forEach((item) => {
      const value = String(item || '').trim();
      if (!value || seen.has(value) || isBlockedLocalFaviconUrl(value)) {
        return;
      }
      if (isChromeMonogramFaviconUrl(value)) {
        if (includeChrome) {
          seen.add(value);
          concrete.push(value);
        }
        return;
      }
      seen.add(value);
      if (isFaviconProxyUrl(value)) {
        if (includeProxy) {
          proxy.push(value);
        }
        return;
      }
      concrete.push(value);
    });
    return concrete.concat(proxy);
  }

  function parseCssThemeColor(color) {
    const value = String(color || '').trim().toLowerCase();
    if (!value || value === 'transparent') {
      return null;
    }
    if (value.startsWith('#')) {
      const hex = value.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        return [r, g, b].every((channel) => Number.isFinite(channel)) ? [r, g, b] : null;
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return [r, g, b].every((channel) => Number.isFinite(channel)) ? [r, g, b] : null;
      }
      return null;
    }
    const rgbMatch = value.match(/^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*(?:[0-9.]+|[0-9.]+%))?\s*\)$/);
    if (!rgbMatch) {
      return null;
    }
    const rgb = [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
    return rgb.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)
      ? rgb.map((channel) => Math.round(channel))
      : null;
  }

  function isNeutralThemeColor(rgb) {
    if (!Array.isArray(rgb) || rgb.length !== 3) {
      return false;
    }
    const channels = rgb.map((channel) => Math.round(Number(channel)));
    if (!channels.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
      return false;
    }
    const max = Math.max(...channels);
    const min = Math.min(...channels);
    const range = max - min;
    const saturation = max === 0 ? 0 : range / max;
    return range <= 24 ||
      saturation <= 0.12 ||
      (min >= 235 && max >= 245) ||
      (max <= 36 && min <= 24);
  }

  function getThemeColorConfidence(rgb) {
    return isNeutralThemeColor(rgb) ? 'neutral' : 'color';
  }

  function buildThemeColorCandidate(accentRgb, source, baseScore, extraScore) {
    const rgb = parseCssThemeColor(Array.isArray(accentRgb) ? `rgb(${accentRgb.join(',')})` : accentRgb);
    if (!rgb) {
      return null;
    }
    const confidence = getThemeColorConfidence(rgb);
    const neutralPenalty = confidence === 'neutral' ? 56 : 0;
    return {
      accentRgb: rgb,
      source: source || 'meta',
      neutral: confidence === 'neutral',
      confidence,
      score: Number(baseScore || 0) + Number(extraScore || 0) - neutralPenalty
    };
  }

  function getThemeMediaScore(media, preferredTheme) {
    const theme = normalizeFaviconThemePreference(preferredTheme);
    const value = String(media || '').toLowerCase();
    if (!value) {
      return 8;
    }
    const wantsDark = value.includes('prefers-color-scheme') && value.includes('dark');
    const wantsLight = value.includes('prefers-color-scheme') && value.includes('light');
    if (theme === 'dark') {
      return wantsDark ? 28 : (wantsLight ? -18 : 4);
    }
    if (theme === 'light') {
      return wantsLight ? 28 : (wantsDark ? -18 : 4);
    }
    return wantsDark || wantsLight ? 12 : 4;
  }

  function parseHtmlThemeColorCandidates(html, pageUrl, preferredTheme) {
    const list = [];
    const metaMatches = String(html || '').match(/<meta\b[^>]*>/gi) || [];
    metaMatches.forEach((tag) => {
      const name = getHtmlAttributeValue(tag, 'name').toLowerCase();
      if (name !== 'theme-color') {
        return;
      }
      const candidate = buildThemeColorCandidate(
        getHtmlAttributeValue(tag, 'content'),
        'meta',
        80,
        getThemeMediaScore(getHtmlAttributeValue(tag, 'media'), preferredTheme)
      );
      if (candidate) {
        list.push(candidate);
      }
    });
    const manifestMatches = String(html || '').match(/<link\b[^>]*>/gi) || [];
    manifestMatches.forEach((tag) => {
      const rel = getHtmlAttributeValue(tag, 'rel').toLowerCase();
      const hrefRaw = getHtmlAttributeValue(tag, 'href');
      if (rel.includes('mask-icon')) {
        const candidate = buildThemeColorCandidate(
          getHtmlAttributeValue(tag, 'color'),
          'mask-icon',
          96,
          0
        );
        if (candidate) {
          list.push(candidate);
        }
      }
      if (!rel.includes('manifest') || !hrefRaw) {
        return;
      }
      try {
        list.push({
          manifestUrl: new URL(hrefRaw, pageUrl).href,
          source: 'manifest',
          score: 42
        });
      } catch (e) {
        // Ignore malformed manifest links.
      }
    });
    return list;
  }

  function pickBestThemeColorCandidate(candidates) {
    const sorted = (Array.isArray(candidates) ? candidates : [])
      .filter((item) => item && (item.accentRgb || item.manifestUrl))
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    return sorted[0] || null;
  }

  function hostHasExplicitDarkFavicon(hostname) {
    const host = normalizeFaviconHost(hostname);
    if (!host) {
      return false;
    }
    return host === 'github.com' || host.endsWith('.github.com');
  }

  function isLocalNetworkHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) {
      return false;
    }
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host === 'host.docker.internal'
    ) {
      return true;
    }
    if (/^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(host)) {
      const shortParts = host.split('.').map((part) => Number(part));
      if (shortParts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
        return true;
      }
    }
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      const parts = host.split('.').map((part) => Number(part));
      if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
        return false;
      }
      if (
        parts[0] === 0 ||
        parts[0] === 10 ||
        parts[0] === 127 ||
        (parts[0] === 169 && parts[1] === 254)
      ) {
        return true;
      }
      if (parts[0] === 192 && parts[1] === 168) {
        return true;
      }
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
        return true;
      }
      if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) {
        return true;
      }
      return false;
    }
    const ipv6 = host.split('%')[0];
    if (
      ipv6 === '::1' ||
      ipv6 === '0:0:0:0:0:0:0:1' ||
      ipv6 === '::' ||
      /^fe[89ab][0-9a-f]*:/i.test(ipv6) ||
      /^[fd][0-9a-f]{1,3}:/i.test(ipv6)
    ) {
      return true;
    }
    const mappedIpv4 = ipv6.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    if (mappedIpv4 && mappedIpv4[1]) {
      return isLocalNetworkHost(mappedIpv4[1]);
    }
    return false;
  }

  function isSuspiciousLocalFaviconHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) {
      return false;
    }
    const ipv6 = host.split('%')[0];
    if (host.includes(':') || ipv6.includes(':')) {
      return false;
    }
    if (/^\d{1,3}(?:\.\d{1,3}){0,3}$/.test(host)) {
      return false;
    }
    if (!host.includes('.')) {
      return /^[a-z0-9-]+$/i.test(host);
    }
    const labels = host.split('.').filter(Boolean);
    if (labels.length < 2) {
      return false;
    }
    const suffix = labels[labels.length - 1];
    return [
      'internal',
      'intern',
      'test',
      'localdev',
      'lan',
      'home',
      'corp',
      'localdomain'
    ].includes(suffix);
  }

  function shouldBlockFaviconForHost(hostname) {
    return false;
  }

  function shouldAvoidDirectFaviconForHost(hostname) {
    return isLocalNetworkHost(hostname) || isSuspiciousLocalFaviconHost(hostname);
  }

  function getFaviconHostPolicy(hostname, options) {
    const config = options || {};
    const shouldBlockHost = typeof config.shouldBlockFaviconForHost === 'function'
      ? config.shouldBlockFaviconForHost
      : shouldBlockFaviconForHost;
    const shouldAvoidDirectHost = typeof config.shouldAvoidDirectFaviconForHost === 'function'
      ? config.shouldAvoidDirectFaviconForHost
      : shouldAvoidDirectFaviconForHost;
    const host = String(hostname || '').trim();
    if (!host) {
      return { hardBlocked: false, avoidDirect: false };
    }
    return {
      hardBlocked: Boolean(shouldBlockHost(host)),
      avoidDirect: Boolean(shouldAvoidDirectHost(host))
    };
  }

  function shouldBlockDirectFaviconHost(hostname, options) {
    const policy = getFaviconHostPolicy(hostname, options);
    return policy.hardBlocked || policy.avoidDirect;
  }

  function isAllowedFaviconProxyRequestUrl(url) {
    const raw = String(url || '').trim();
    return Boolean(raw && (isSafeVirtualFaviconRequestUrl(raw) || isFaviconProxyUrl(raw)));
  }

  function getFaviconUrlHostCandidate(url) {
    const raw = String(url || '').trim();
    if (!raw) {
      return '';
    }
    const decodedRaw = (() => {
      try {
        return decodeURIComponent(raw);
      } catch (e) {
        return raw;
      }
    })();
    const withoutScheme = decodedRaw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    const authority = withoutScheme.split(/[/?#]/)[0] || '';
    const hostCandidateRaw = authority.includes('@') ? authority.split('@').pop() : authority;
    const value = String(hostCandidateRaw || '').trim().toLowerCase();
    if (!value) {
      return '';
    }
    if (value.startsWith('[')) {
      const endBracket = value.indexOf(']');
      if (endBracket > 1) {
        return value.slice(1, endBracket);
      }
    }
    return value.replace(/^\[|\]$/g, '').split(':')[0];
  }

  function getFaviconUrlPolicy(url, options) {
    const raw = String(url || '').trim();
    const config = options || {};
    const allowProxyAvoidDirect = config.allowProxyAvoidDirect !== false;
    if (!raw) {
      return { hardBlocked: false, avoidDirect: false };
    }
    if (isBrowserInternalPageUrl(raw)) {
      return { hardBlocked: false, avoidDirect: false };
    }
    const canonicalProxyPage = getPageUrlFromFaviconProxyUrl(raw);
    let hostCandidate = '';
    if (canonicalProxyPage) {
      hostCandidate = getFaviconUrlHostCandidate(canonicalProxyPage);
    } else {
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return { hardBlocked: false, avoidDirect: false };
        }
        const nestedPageUrl = getFaviconPageSearchParam(parsed);
        if (nestedPageUrl && nestedPageUrl !== raw) {
          const nestedPolicy = getFaviconUrlPolicy(nestedPageUrl, config);
          if (nestedPolicy.hardBlocked || nestedPolicy.avoidDirect) {
            return nestedPolicy;
          }
        }
        hostCandidate = parsed.hostname;
      } catch (e) {
        hostCandidate = getFaviconUrlHostCandidate(raw);
      }
    }
    const hostPolicy = getFaviconHostPolicy(hostCandidate, config);
    if (canonicalProxyPage && allowProxyAvoidDirect) {
      return {
        hardBlocked: hostPolicy.hardBlocked,
        avoidDirect: false
      };
    }
    return hostPolicy;
  }

  function isFaviconUrlPolicyBlocked(url, options) {
    const policy = getFaviconUrlPolicy(url, options);
    return policy.hardBlocked || policy.avoidDirect;
  }

  function isBlockedLocalFaviconUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) {
      return false;
    }
    return isFaviconUrlPolicyBlocked(raw);
  }

  function getFaviconResolverSize(options) {
    return Number.isFinite(Number(options && options.size))
      ? Math.max(1, Math.round(Number(options.size)))
      : 128;
  }

  function createFaviconUrlResolver(options) {
    const config = options || {};
    const size = getFaviconResolverSize(config);
    const getRuntimeUrl = typeof config.getRuntimeUrl === 'function'
      ? config.getRuntimeUrl
      : (config.chromeApi && config.chromeApi.runtime && typeof config.chromeApi.runtime.getURL === 'function'
        ? config.chromeApi.runtime.getURL.bind(config.chromeApi.runtime)
        : null);
    const shouldBlockHost = typeof config.shouldBlockFaviconForHost === 'function'
      ? config.shouldBlockFaviconForHost
      : shouldBlockFaviconForHost;
    const shouldAvoidDirectHost = typeof config.shouldAvoidDirectFaviconForHost === 'function'
      ? config.shouldAvoidDirectFaviconForHost
      : shouldAvoidDirectFaviconForHost;
    const blockFaviconUrl = typeof config.isBlockedLocalFaviconUrl === 'function'
      ? config.isBlockedLocalFaviconUrl
      : isBlockedLocalFaviconUrl;
    const customExtensionFaviconUrl = typeof config.getExtensionFaviconUrl === 'function'
      ? config.getExtensionFaviconUrl
      : null;
    const customBrowserPageFaviconUrl = typeof config.getBrowserPageFaviconUrl === 'function'
      ? config.getBrowserPageFaviconUrl
      : null;
    const customGstaticFaviconUrl = typeof config.getGstaticFaviconUrl === 'function'
      ? config.getGstaticFaviconUrl
      : null;
    const customChromeFaviconUrl = typeof config.getChromeFaviconUrl === 'function'
      ? config.getChromeFaviconUrl
      : null;
    const ownExtensionRuntime = getOwnExtensionRuntimeInfo(config, getRuntimeUrl);
    const isEnhancedFaviconFetchEnabled = typeof config.isEnhancedFaviconFetchEnabled === 'function'
      ? config.isEnhancedFaviconFetchEnabled
      : (() => true);
    const getStrictFaviconReason = typeof config.getStrictFaviconReason === 'function'
      ? config.getStrictFaviconReason
      : ((pageUrl) => isEnhancedFaviconFetchEnabled(pageUrl) === true ? '' : 'global-off');
    const logFaviconDecision = typeof config.logFaviconDecision === 'function'
      ? config.logFaviconDecision
      : (() => {});

    function isSourceAllowedByEnhancedFetchPolicy(url, pageUrl) {
      const policyPageUrl = getCanonicalFaviconPage(pageUrl || url);
      return isFaviconSourceAllowedByEnhancedFetchPolicy(url, isEnhancedFaviconFetchEnabled(policyPageUrl), {
        chromeApi: config.chromeApi,
        ownExtensionId: ownExtensionRuntime.id
      });
    }

    function getCanonicalFaviconPage(pageUrl) {
      const raw = String(pageUrl || '').trim();
      if (!raw) {
        return '';
      }
      return getCanonicalPageUrlForFavicon(raw) || raw;
    }

    function getResolverExtensionFaviconUrl(pageUrl) {
      const page = getCanonicalFaviconPage(pageUrl);
      if (!page || !/^https?:\/\//i.test(page)) {
        return '';
      }
      if (customExtensionFaviconUrl) {
        const configured = String(customExtensionFaviconUrl(page) || '').trim();
        if (configured) {
          return configured;
        }
      }
      return getExtensionFaviconUrl(page, { getRuntimeUrl, size });
    }

    function getResolverBrowserPageFaviconUrl(pageUrl) {
      const page = getCanonicalFaviconPage(pageUrl);
      if (!isBrowserInternalPageUrl(page)) {
        return '';
      }
      if (customBrowserPageFaviconUrl) {
        const configured = String(customBrowserPageFaviconUrl(page) || '').trim();
        if (configured) {
          return configured;
        }
      }
      return getBrowserPageFaviconUrl(page, { getRuntimeUrl, size });
    }

    function getResolverGstaticFaviconUrl(pageUrl) {
      const page = getCanonicalFaviconPage(pageUrl);
      if (!page || !/^https?:\/\//i.test(page)) {
        return '';
      }
      if (customGstaticFaviconUrl) {
        const configured = String(customGstaticFaviconUrl(page) || '').trim();
        if (configured) {
          return configured;
        }
      }
      return getGstaticFaviconUrl(page, { size });
    }

    function getResolverChromeFaviconUrl(pageUrl) {
      const page = getCanonicalFaviconPage(pageUrl);
      if (!page) {
        return '';
      }
      if (customChromeFaviconUrl) {
        const configured = String(customChromeFaviconUrl(page) || '').trim();
        if (configured) {
          return configured;
        }
      }
      return getChromeFaviconUrl(page, { size });
    }

    function isResolverOwnExtensionPageUrl(pageUrl) {
      if (!ownExtensionRuntime.id) {
        return false;
      }
      try {
        const parsed = new URL(String(pageUrl || '').trim());
        return isBrowserExtensionProtocol(parsed.protocol) &&
          String(parsed.hostname || '') === String(ownExtensionRuntime.id) &&
          !String(parsed.pathname || '').toLowerCase().startsWith('/_favicon/');
      } catch (e) {
        return false;
      }
    }

    function isResolverOtherExtensionPageUrl(pageUrl) {
      try {
        const parsed = new URL(String(pageUrl || '').trim());
        return isBrowserExtensionProtocol(parsed.protocol) &&
          (!ownExtensionRuntime.id || String(parsed.hostname || '') !== String(ownExtensionRuntime.id));
      } catch (e) {
        return false;
      }
    }

    function getResolverOwnExtensionFaviconUrl(pageUrl) {
      if (!isResolverOwnExtensionPageUrl(pageUrl)) {
        return '';
      }
      return getOwnExtensionAssetUrl(LUMNO_EXTENSION_ICON_PATH, ownExtensionRuntime, { getRuntimeUrl });
    }

    function isBlockedFaviconPageUrl(pageUrl) {
      return getFaviconUrlPolicy(pageUrl, {
        shouldBlockFaviconForHost: shouldBlockHost,
        shouldAvoidDirectFaviconForHost: () => false
      }).hardBlocked;
    }

    function isBlockedFaviconUrl(url, pageUrl, candidateKind) {
      const raw = String(url || '').trim();
      if (!raw) {
        return false;
      }
      const policyPageUrl = getCanonicalFaviconPage(pageUrl || raw);
      if (!isSourceAllowedByEnhancedFetchPolicy(raw, policyPageUrl)) {
        logFaviconDecision(raw, getStrictFaviconReason(policyPageUrl) || 'global-off', {
          pageUrl: policyPageUrl,
          candidateKind
        });
        return true;
      }
      const policy = getFaviconUrlPolicy(raw, {
        shouldBlockFaviconForHost: shouldBlockHost,
        shouldAvoidDirectFaviconForHost: shouldAvoidDirectHost
      });
      if (policy.hardBlocked || policy.avoidDirect) {
        logFaviconDecision(raw, 'local-rule', {
          pageUrl: policyPageUrl,
          candidateKind
        });
        return true;
      }
      const blocked = Boolean(blockFaviconUrl(raw, policyPageUrl));
      if (blocked) {
        logFaviconDecision(raw, 'local-rule', {
          pageUrl: policyPageUrl,
          candidateKind
        });
      }
      return blocked;
    }

    function getSafeFaviconCandidateUrl(value, pageUrl, candidateKind) {
      const raw = String(value || '').trim();
      if (isResolverOtherExtensionPageUrl(pageUrl)) {
        return '';
      }
      if (!raw || isBlockedFaviconUrl(raw, pageUrl, candidateKind)) {
        return '';
      }
      if (raw.startsWith('data:')) {
        return raw;
      }
      try {
        const parsed = new URL(raw);
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
            shouldBlockDirectFaviconHost(parsed.hostname, {
              shouldBlockFaviconForHost: shouldBlockHost,
              shouldAvoidDirectFaviconForHost: shouldAvoidDirectHost
            })) {
          return '';
        }
        return raw;
      } catch (e) {
        return '';
      }
    }

    function getPageFaviconCandidateUrl(pageUrl, candidateOptions) {
      const candidateConfig = candidateOptions || {};
      const page = getCanonicalFaviconPage(pageUrl);
      if (!page) {
        return '';
      }
      const ownExtensionFavicon = getResolverOwnExtensionFaviconUrl(page);
      if (ownExtensionFavicon) {
        return getSafeFaviconCandidateUrl(ownExtensionFavicon, page, 'lumno-asset');
      }
      if (isResolverOtherExtensionPageUrl(page)) {
        return '';
      }
      if (isBrowserInternalPageUrl(page)) {
        return '';
      }
      if (/^https?:\/\//i.test(page)) {
        return getSafeFaviconCandidateUrl(getResolverExtensionFaviconUrl(page), page, 'browser-cache') ||
          (candidateConfig.includeChromeForHttp
            ? getSafeFaviconCandidateUrl(getResolverChromeFaviconUrl(page), page, 'browser-favicon')
            : '') ||
          getSafeFaviconCandidateUrl(getResolverGstaticFaviconUrl(page), page, 'third-party-proxy');
      }
      return candidateConfig.includeChromeForNonHttp === false
        ? ''
        : getSafeFaviconCandidateUrl(getResolverChromeFaviconUrl(page), page, 'browser-favicon');
    }

    function getDistinctFallbackUrl(url, primaryUrl) {
      const safeUrl = getSafeFaviconCandidateUrl(url);
      return safeUrl && safeUrl !== primaryUrl ? safeUrl : '';
    }

    function getPageFaviconRenderCandidates(pageUrl, explicitUrl, candidateOptions) {
      const candidateConfig = candidateOptions || {};
      const page = getCanonicalFaviconPage(pageUrl);
      const explicitFavicon = getSafeFaviconCandidateUrl(explicitUrl, page, 'explicit');
      if (!page) {
        return {
          primaryUrl: explicitFavicon,
          browserUrl: ''
        };
      }

      if (isResolverOtherExtensionPageUrl(page)) {
        return { primaryUrl: '', browserUrl: '' };
      }
      if (isBrowserInternalPageUrl(page)) {
        return { primaryUrl: '', browserUrl: '' };
      }
      const ownExtensionFavicon = getResolverOwnExtensionFaviconUrl(page);
      if (ownExtensionFavicon) {
        return {
          primaryUrl: getSafeFaviconCandidateUrl(ownExtensionFavicon, page, 'lumno-asset'),
          browserUrl: ''
        };
      }
      const browserPageFavicon = getSafeFaviconCandidateUrl(getResolverBrowserPageFaviconUrl(page), page, 'browser-cache');
      const chromeFavicon = getSafeFaviconCandidateUrl(getResolverChromeFaviconUrl(page), page, 'browser-favicon');
      const isInternalPage = isBrowserInternalPageUrl(page);
      const primaryUrl = isInternalPage
        ? (browserPageFavicon || explicitFavicon || chromeFavicon || '')
        : (browserPageFavicon || explicitFavicon || '');
      const shouldUseChromeFallback = isInternalPage ||
        candidateConfig.includeChromeFallback === true ||
        (!/^https?:\/\//i.test(page) && candidateConfig.includeChromeForNonHttp !== false);

      return {
        primaryUrl,
        browserUrl: shouldUseChromeFallback ? getDistinctFallbackUrl(chromeFavicon, primaryUrl) : ''
      };
    }

    function buildFaviconCandidatePlan(state) {
      const input = state || {};
      const pageUrl = getCanonicalFaviconPage(input.pageUrl || input.url || '');
      if (pageUrl && isBrowserInternalPageUrl(pageUrl)) {
        return [];
      }
      const browserUrl = String(input.browserUrl || '').trim() ||
        (pageUrl && isBrowserInternalPageUrl(pageUrl) ? getResolverChromeFaviconUrl(pageUrl) : '');
      const persistedCandidates = input.skipPersisted === true
        ? []
        : [
          { kind: 'persisted-data', url: input.persistedDataUrl || '' },
          { kind: 'primary', url: input.persistedUrl || '' }
        ];
      // A full-page resolution is more specific than host-scoped browser and
      // persisted caches, which may legitimately collapse sibling URLs.
      const rawCandidates = [
        { kind: 'page-specific', url: input.pageSpecificUrl || '' },
        ...persistedCandidates,
        { kind: 'primary', url: input.primaryUrl || input.fallbackUrl || '' },
        { kind: 'extension', url: input.extensionFavicon || input.extensionUrl || getResolverExtensionFaviconUrl(pageUrl) },
        { kind: 'browser', url: browserUrl },
        { kind: 'gstatic', url: input.gstaticFavicon || input.gstaticUrl || getResolverGstaticFaviconUrl(pageUrl) }
      ];
      const seen = new Set();
      return rawCandidates.filter((candidate) => {
        const safeUrl = getSafeFaviconCandidateUrl(candidate.url, pageUrl, candidate.kind);
        if (!safeUrl || seen.has(safeUrl)) {
          return false;
        }
        seen.add(safeUrl);
        candidate.url = safeUrl;
        return true;
      });
    }

    function getFaviconProxyCheckKind(candidate) {
      if (!candidate || !candidate.url) {
        return '';
      }
      if (candidate.kind === 'extension') {
        return 'extension';
      }
      if (candidate.kind === 'gstatic') {
        return 'gstatic';
      }
      if (candidate.kind !== 'primary' && candidate.kind !== 'page-specific') {
        return '';
      }
      const url = String(candidate.url || '').trim();
      if (/^chrome-extension:\/\/[^/]+\/_favicon\//i.test(url)) {
        return 'extension';
      }
      if (/^https:\/\/[^/]*gstatic\.(?:com|cn)\/favicon/i.test(url)) {
        return 'gstatic';
      }
      return '';
    }

    return Object.freeze({
      buildFaviconCandidatePlan,
      getBrowserPageFaviconUrl: getResolverBrowserPageFaviconUrl,
      getChromeFaviconUrl: getResolverChromeFaviconUrl,
      getExtensionFaviconUrl: getResolverExtensionFaviconUrl,
      getFaviconProxyCheckKind,
      getFaviconUrlHostCandidate,
      getGstaticFaviconUrl: getResolverGstaticFaviconUrl,
      getPageFaviconCandidateUrl,
      getPageFaviconRenderCandidates,
      getSafeFaviconCandidateUrl,
      isBlockedFaviconPageUrl,
      isBlockedFaviconUrl,
      isBrowserInternalPageUrl
    });
  }

  return Object.freeze({
    setBoundedCacheEntry,
    createFaviconDecisionLogger,
    createFaviconUrlResolver,
    getBrowserPageFaviconUrl,
    getExtensionFaviconUrl,
    getGstaticFaviconUrl,
    getChromeFaviconUrl,
    getCanonicalFaviconHost,
    getCanonicalPageUrlForFavicon,
    getHtmlAttributeValue,
    getKnownThemedFaviconCandidateScores,
    getKnownThemedFaviconCandidateUrls,
    getRootFaviconCandidateScores,
    getRootFaviconCandidateUrls,
    getThemeHintScore,
    getThemeFaviconCandidateUrls,
    getThemeColorConfidence,
    getThemeMediaScore,
    getPageUrlFromFaviconProxyUrl,
    getFaviconHostPolicy,
    getFaviconUrlPolicy,
    hasThemeTokenInUrl,
    hostHasExplicitDarkFavicon,
    isBlockedLocalFaviconUrl,
    isBrowserInternalPageUrl,
    isChromeMonogramFaviconUrl,
    isFaviconProxyUrl,
    isAllowedFaviconProxyRequestUrl,
    isFaviconSourceAllowedByEnhancedFetchPolicy,
    isSafeVirtualFaviconRequestUrl,
    isLocalNetworkHost,
    isSuspiciousLocalFaviconHost,
    normalizeFaviconThemePreference,
    normalizeFaviconHost,
    isNeutralThemeColor,
    parseCssThemeColor,
    parseHtmlIconCandidateScores,
    parseHtmlThemeColorCandidates,
    pickBestThemeColorCandidate,
    shouldSkipThemeUpgradeCandidate,
    shouldBlockFaviconForHost,
    shouldBlockDirectFaviconHost,
    shouldAvoidDirectFaviconForHost
  });
});
