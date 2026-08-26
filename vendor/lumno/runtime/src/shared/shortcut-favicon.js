(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoShortcutFavicon = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULT_STORAGE_KEY = '_x_extension_newtab_shortcut_favicon_cache_2026_unique_';
  const SITE_SEARCH_STORAGE_KEY = '_x_extension_site_search_icon_cache_canonical_2026_unique_';
  const SITE_SEARCH_LEGACY_STORAGE_KEYS = Object.freeze([
    '_x_extension_site_search_icon_cache_2026_unique_',
    '_x_extension_site_search_icon_cache_retina_2026_unique_'
  ]);
  const GOOGLE_BRAND_ICON_URL =
    'https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png';
  const SITE_SEARCH_PINNED_ICON_ASSETS = Object.freeze({
    yt: 'assets/images/site-search/tile-yt.png',
    bb: 'assets/images/site-search/tile-bb.png',
    gh: 'assets/images/site-search/tile-gh.png',
    sf: 'assets/images/site-search/tile-sf.png',
    mdn: 'assets/images/site-search/tile-mdn.png',
    npm: 'assets/images/site-search/tile-npm.png',
    hf: 'assets/images/site-search/tile-hf.png',
    gs: 'assets/images/site-search/tile-gs.png',
    ss: 'assets/images/site-search/tile-ss.png',
    maps: 'assets/images/site-search/tile-maps.png',
    gpt: 'assets/images/site-search/tile-gpt.png',
    gm: 'assets/images/site-search/tile-gm.png',
    dbai: 'assets/images/site-search/tile-dbai.png',
    qw: 'assets/images/site-search/tile-qw.png',
    yb: 'assets/images/site-search/tile-yb.png',
    mx: 'assets/images/site-search/tile-mx.png',
    ds: 'assets/images/site-search/tile-ds.png',
    kimi: 'assets/images/site-search/tile-kimi.png',
    pplx: 'assets/images/site-search/tile-pplx.png',
    metaso: 'assets/images/site-search/tile-metaso.png',
    felo: 'assets/images/site-search/tile-felo.png',
    bd: 'assets/images/site-search/tile-bd.png',
    bi: 'assets/images/site-search/tile-bi.png',
    gg: 'assets/images/site-search/tile-gg.png',
    ddg: 'assets/images/site-search/tile-ddg.png',
    br: 'assets/images/site-search/tile-br.png',
    eco: 'assets/images/site-search/tile-eco.png',
    sg: 'assets/images/site-search/tile-sg.png',
    yh: 'assets/images/site-search/tile-yh.png',
    yx: 'assets/images/site-search/tile-yx.png',
    sm: 'assets/images/site-search/tile-sm.png',
    zh: 'assets/images/site-search/tile-zh.png',
    db: 'assets/images/site-search/tile-db.png',
    jj: 'assets/images/site-search/tile-jj.png',
    wx: 'assets/images/site-search/tile-wx.png',
    tb: 'assets/images/site-search/tile-tb.png',
    tm: 'assets/images/site-search/tile-tm.png',
    tw: 'assets/images/site-search/tile-tw.png',
    rd: 'assets/images/site-search/tile-rd.png',
    wb: 'assets/images/site-search/tile-wb.png',
    xhs: 'assets/images/site-search/tile-xhs.png',
    dy: 'assets/images/site-search/tile-dy.png',
    jd: 'assets/images/site-search/tile-jd.png',
    wk: 'assets/images/site-search/tile-wk.png',
    zw: 'assets/images/site-search/tile-zw.png'
  });
  const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
  const CACHE_MAX_ENTRIES = 24;
  const MAX_DATA_URL_LENGTH = 384 * 1024;
  const SITE_SEARCH_CACHE_OPTIONS = Object.freeze({
    cacheTtlMs: 1000 * 60 * 60 * 24 * 180,
    cacheMaxEntries: 40,
    maxDataUrlLength: 192 * 1024
  });
  // The panel renders provider artwork at 36 CSS px. A 2x display therefore needs
  // at least 72 physical pixels; 128px leaves enough headroom for scaling and zoom.
  const MIN_ICON_DIMENSION = 128;
  const SUPPORTED_DATA_URL_PATTERN =
    /^data:image\/(?:png|webp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon|jpeg|jpg|gif);base64,/i;

  function getHtmlAttributeValue(tag, name) {
    if (!tag || !name) {
      return '';
    }
    const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
    const match = String(tag).match(pattern);
    return match ? String(match[2] || match[3] || match[4] || '').trim() : '';
  }

  function normalizePageUrl(value) {
    try {
      const parsed = new URL(String(value || '').trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }
      parsed.hash = '';
      return parsed.href;
    } catch (error) {
      return '';
    }
  }

  function getCacheKey(pageUrl) {
    return normalizePageUrl(pageUrl);
  }

  function getSiteSearchProviderPageUrl(provider) {
    const template = provider && provider.template ? String(provider.template).trim() : '';
    if (!template) {
      return '';
    }
    try {
      const parsed = new URL(template.replace(/\{query\}/g, 'test'));
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }
      return `${parsed.origin}/`;
    } catch (error) {
      return '';
    }
  }

  function getSiteSearchProviderExplicitIcon(provider) {
    return String(provider && (provider.icon || provider.iconUrl) || '').trim();
  }

  function getSiteSearchPinnedIconAssetPath(provider) {
    const providerKey = String(provider && provider.key || '').trim().toLowerCase();
    return SITE_SEARCH_PINNED_ICON_ASSETS[providerKey] || '';
  }

  function getSiteSearchIconAssetPath(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    try {
      return new URL(raw, 'https://lumno.invalid/').pathname.replace(/^\/+/, '');
    } catch (error) {
      return raw.split(/[?#]/, 1)[0].replace(/^\/+/, '');
    }
  }

  function isSiteSearchPinnedIconAssetUrl(value) {
    const assetPath = getSiteSearchIconAssetPath(value);
    return Boolean(
      assetPath && Object.values(SITE_SEARCH_PINNED_ICON_ASSETS).includes(assetPath)
    );
  }

  function shouldHydrateSiteSearchProviderIcon(value) {
    const iconUrl = String(value || '').trim();
    return Boolean(
      iconUrl &&
      !iconUrl.startsWith('data:') &&
      !isSiteSearchPinnedIconAssetUrl(iconUrl)
    );
  }

  function createSiteSearchProviderIconHydrator(attachFaviconData) {
    const attach = typeof attachFaviconData === 'function' ? attachFaviconData : null;
    return function hydrateSiteSearchProviderIcon(icon, iconUrl, iconHost) {
      const resolvedIconUrl = String(iconUrl || '').trim();
      if (!attach || !shouldHydrateSiteSearchProviderIcon(resolvedIconUrl)) {
        return false;
      }
      attach(icon, resolvedIconUrl, iconHost);
      return true;
    };
  }

  function getPinnedSiteSearchProviderIcon(provider) {
    const explicitIcon = getSiteSearchProviderExplicitIcon(provider);
    if (!explicitIcon) {
      return '';
    }
    const providerKey = String(provider && provider.key || '').trim().toLowerCase();
    return providerKey === 'gg' && explicitIcon === GOOGLE_BRAND_ICON_URL
      ? explicitIcon
      : '';
  }

  function getSiteSearchProviderIcon(cacheMap, provider, nowValue, options) {
    const pinnedAssetPath = getSiteSearchPinnedIconAssetPath(provider);
    const resolveAssetUrl = options && typeof options.resolveAssetUrl === 'function'
      ? options.resolveAssetUrl
      : null;
    if (pinnedAssetPath && resolveAssetUrl) {
      const assetUrl = String(resolveAssetUrl(pinnedAssetPath) || '').trim();
      if (assetUrl) {
        return assetUrl;
      }
    }
    const pageUrl = getSiteSearchProviderPageUrl(provider);
    const cacheKey = getCacheKey(pageUrl);
    const normalizedCache = normalizeCacheMap(cacheMap, nowValue, options);
    const cachedEntry = cacheKey ? normalizedCache[cacheKey] : null;
    const pinnedIcon = getPinnedSiteSearchProviderIcon(provider);
    if (cachedEntry && cachedEntry.dataUrl) {
      const cachedSource = normalizePageUrl(cachedEntry.sourceUrl);
      const pinnedSource = normalizePageUrl(pinnedIcon);
      if (!pinnedSource || cachedSource === pinnedSource) {
        return cachedEntry.dataUrl;
      }
    }
    return pinnedIcon || getSiteSearchProviderExplicitIcon(provider);
  }

  function normalizeCacheOptions(options) {
    const settings = options && typeof options === 'object' ? options : {};
    return Object.freeze({
      cacheTtlMs: Number.isFinite(Number(settings.cacheTtlMs)) && Number(settings.cacheTtlMs) > 0
        ? Number(settings.cacheTtlMs)
        : CACHE_TTL_MS,
      cacheMaxEntries: Number.isFinite(Number(settings.cacheMaxEntries)) && Number(settings.cacheMaxEntries) > 0
        ? Math.floor(Number(settings.cacheMaxEntries))
        : CACHE_MAX_ENTRIES,
      maxDataUrlLength: Number.isFinite(Number(settings.maxDataUrlLength)) && Number(settings.maxDataUrlLength) > 0
        ? Math.floor(Number(settings.maxDataUrlLength))
        : MAX_DATA_URL_LENGTH
    });
  }

  function normalizeDataUrl(value, options) {
    const cacheOptions = normalizeCacheOptions(options);
    const dataUrl = String(value || '').trim();
    if (!SUPPORTED_DATA_URL_PATTERN.test(dataUrl) || dataUrl.length > cacheOptions.maxDataUrlLength) {
      return '';
    }
    return dataUrl;
  }

  function getLargestDeclaredSize(value) {
    const sizes = String(value || '').trim().toLowerCase();
    if (!sizes) {
      return 0;
    }
    if (sizes.split(/\s+/).includes('any')) {
      return Number.POSITIVE_INFINITY;
    }
    const dimensions = sizes.match(/(\d+)\s*x\s*(\d+)/g) || [];
    return dimensions.reduce((largest, dimension) => {
      const parts = dimension.split('x').map((part) => Number(part));
      return Math.max(largest, Math.min(parts[0] || 0, parts[1] || 0));
    }, 0);
  }

  function getThemeScore(url, media, preferredTheme) {
    const theme = String(preferredTheme || '').trim().toLowerCase();
    if (theme !== 'dark' && theme !== 'light') {
      return 0;
    }
    const haystack = `${String(url || '').toLowerCase()} ${String(media || '').toLowerCase()}`;
    const opposite = theme === 'dark' ? 'light' : 'dark';
    let score = 0;
    if (haystack.includes(theme)) {
      score += 80;
    }
    if (haystack.includes(opposite)) {
      score -= 120;
    }
    return score;
  }

  function scoreIconCandidate(candidate) {
    const item = candidate || {};
    const declaredSize = Number(item.declaredSize || 0);
    let score = 0;
    if (item.vector) {
      score += 1200;
    } else if (declaredSize >= 256) {
      score += 1000;
    } else if (declaredSize >= 180) {
      score += 940;
    } else if (declaredSize >= 128) {
      score += 900;
    } else if (declaredSize >= 96) {
      score += 800;
    } else if (declaredSize >= 64) {
      score += 700;
    } else if (declaredSize >= 48) {
      score += 400;
    } else if (declaredSize > 0) {
      score += 100;
    } else {
      score += 520;
    }
    if (item.source === 'manifest') {
      score += 60;
    }
    if (item.source === 'apple-touch-icon') {
      score += 50;
    }
    if (item.purpose === 'any') {
      score += 20;
    }
    score += Number(item.themeScore || 0);
    return score;
  }

  function createCandidate(url, options) {
    const normalizedUrl = normalizePageUrl(url);
    if (!normalizedUrl) {
      return null;
    }
    const settings = options && typeof options === 'object' ? options : {};
    const candidate = {
      url: normalizedUrl,
      source: String(settings.source || 'icon'),
      declaredSize: Number(settings.declaredSize || 0),
      vector: settings.vector === true,
      purpose: String(settings.purpose || ''),
      themeScore: Number(settings.themeScore || 0)
    };
    candidate.score = scoreIconCandidate(candidate);
    return candidate;
  }

  function parseHtmlIconCandidates(html, pageUrl, preferredTheme) {
    const normalizedPageUrl = normalizePageUrl(pageUrl);
    if (!html || !normalizedPageUrl) {
      return [];
    }
    let baseUrl = normalizedPageUrl;
    const baseTag = (String(html).match(/<base\b[^>]*>/i) || [])[0];
    const baseHref = getHtmlAttributeValue(baseTag, 'href');
    if (baseHref) {
      try {
        baseUrl = new URL(baseHref, normalizedPageUrl).href;
      } catch (error) {
        baseUrl = normalizedPageUrl;
      }
    }
    const candidates = [];
    const links = String(html).match(/<link\b[^>]*>/gi) || [];
    links.forEach((tag) => {
      const rel = getHtmlAttributeValue(tag, 'rel').toLowerCase();
      const href = getHtmlAttributeValue(tag, 'href');
      if (!href || (!rel.includes('icon') && !rel.includes('apple-touch-icon'))) {
        return;
      }
      let resolvedUrl = '';
      try {
        resolvedUrl = new URL(href, baseUrl).href;
      } catch (error) {
        return;
      }
      const type = getHtmlAttributeValue(tag, 'type').toLowerCase();
      const media = getHtmlAttributeValue(tag, 'media');
      const vector = type.includes('svg') || /\.svg(?:[?#]|$)/i.test(resolvedUrl);
      const source = rel.includes('apple-touch-icon') ? 'apple-touch-icon' : 'icon';
      const candidate = createCandidate(resolvedUrl, {
        source,
        declaredSize: vector ? Number.POSITIVE_INFINITY : getLargestDeclaredSize(getHtmlAttributeValue(tag, 'sizes')),
        vector,
        themeScore: getThemeScore(resolvedUrl, media, preferredTheme)
      });
      if (candidate) {
        candidates.push(candidate);
      }
    });
    return mergeCandidates(candidates);
  }

  function parseHtmlManifestUrls(html, pageUrl) {
    const normalizedPageUrl = normalizePageUrl(pageUrl);
    if (!html || !normalizedPageUrl) {
      return [];
    }
    let baseUrl = normalizedPageUrl;
    const baseTag = (String(html).match(/<base\b[^>]*>/i) || [])[0];
    const baseHref = getHtmlAttributeValue(baseTag, 'href');
    if (baseHref) {
      try {
        baseUrl = new URL(baseHref, normalizedPageUrl).href;
      } catch (error) {
        baseUrl = normalizedPageUrl;
      }
    }
    const seen = new Set();
    return (String(html).match(/<link\b[^>]*>/gi) || []).flatMap((tag) => {
      const rel = getHtmlAttributeValue(tag, 'rel').toLowerCase();
      const href = getHtmlAttributeValue(tag, 'href');
      if (!rel.split(/\s+/).includes('manifest') || !href) {
        return [];
      }
      try {
        const url = new URL(href, baseUrl).href;
        if (!normalizePageUrl(url) || seen.has(url)) {
          return [];
        }
        seen.add(url);
        return [url];
      } catch (error) {
        return [];
      }
    });
  }

  function parseManifestIconCandidates(manifest, manifestUrl) {
    const source = manifest && typeof manifest === 'object' ? manifest : {};
    const icons = Array.isArray(source.icons) ? source.icons : [];
    return mergeCandidates(icons.flatMap((icon) => {
      const src = String(icon && icon.src || '').trim();
      if (!src) {
        return [];
      }
      let resolvedUrl = '';
      try {
        resolvedUrl = new URL(src, manifestUrl).href;
      } catch (error) {
        return [];
      }
      const type = String(icon && icon.type || '').toLowerCase();
      const vector = type.includes('svg') || /\.svg(?:[?#]|$)/i.test(resolvedUrl);
      const purposeTokens = String(icon && icon.purpose || 'any').toLowerCase().split(/\s+/);
      const candidate = createCandidate(resolvedUrl, {
        source: 'manifest',
        declaredSize: vector ? Number.POSITIVE_INFINITY : getLargestDeclaredSize(icon && icon.sizes),
        vector,
        purpose: purposeTokens.includes('any') ? 'any' : (purposeTokens[0] || '')
      });
      return candidate ? [candidate] : [];
    }));
  }

  function getRootIconCandidates(pageUrl) {
    const normalizedPageUrl = normalizePageUrl(pageUrl);
    if (!normalizedPageUrl) {
      return [];
    }
    const origin = new URL(normalizedPageUrl).origin;
    return [
      createCandidate(`${origin}/favicon.svg`, {
        source: 'root-svg',
        declaredSize: Number.POSITIVE_INFINITY,
        vector: true
      }),
      createCandidate(`${origin}/apple-touch-icon.png`, {
        source: 'apple-touch-icon',
        declaredSize: 180
      }),
      createCandidate(`${origin}/favicon-192.png`, {
        source: 'root',
        declaredSize: 192
      }),
      createCandidate(`${origin}/favicon.png`, { source: 'root' }),
      createCandidate(`${origin}/favicon.ico`, { source: 'root' })
    ].filter(Boolean);
  }

  function mergeCandidates(candidates) {
    const byUrl = new Map();
    (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
      if (!candidate || !candidate.url) {
        return;
      }
      const current = byUrl.get(candidate.url);
      if (!current || Number(candidate.score || 0) > Number(current.score || 0)) {
        byUrl.set(candidate.url, candidate);
      }
    });
    return Array.from(byUrl.values()).sort((left, right) =>
      Number(right.score || 0) - Number(left.score || 0));
  }

  function readUint16BigEndian(bytes, offset) {
    return ((bytes[offset] || 0) << 8) | (bytes[offset + 1] || 0);
  }

  function readUint32BigEndian(bytes, offset) {
    return (
      ((bytes[offset] || 0) * 0x1000000) +
      ((bytes[offset + 1] || 0) << 16) +
      ((bytes[offset + 2] || 0) << 8) +
      (bytes[offset + 3] || 0)
    ) >>> 0;
  }

  function readUint24LittleEndian(bytes, offset) {
    return (bytes[offset] || 0) |
      ((bytes[offset + 1] || 0) << 8) |
      ((bytes[offset + 2] || 0) << 16);
  }

  function getPngDimensions(bytes) {
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
      return null;
    }
    return {
      width: readUint32BigEndian(bytes, 16),
      height: readUint32BigEndian(bytes, 20)
    };
  }

  function getGifDimensions(bytes) {
    if (bytes.length < 10 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
      return null;
    }
    return {
      width: (bytes[6] || 0) | ((bytes[7] || 0) << 8),
      height: (bytes[8] || 0) | ((bytes[9] || 0) << 8)
    };
  }

  function getIcoDimensions(bytes) {
    if (bytes.length < 22 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) {
      return null;
    }
    const count = Math.min(((bytes[4] || 0) | ((bytes[5] || 0) << 8)), 64);
    let width = 0;
    let height = 0;
    for (let index = 0; index < count; index += 1) {
      const offset = 6 + (index * 16);
      if (offset + 15 >= bytes.length) {
        break;
      }
      width = Math.max(width, bytes[offset] || 256);
      height = Math.max(height, bytes[offset + 1] || 256);
    }
    return width && height ? { width, height } : null;
  }

  function getJpegDimensions(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return null;
    }
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = readUint16BigEndian(bytes, offset + 2);
      if (length < 2) {
        break;
      }
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return {
          width: readUint16BigEndian(bytes, offset + 7),
          height: readUint16BigEndian(bytes, offset + 5)
        };
      }
      offset += length + 2;
    }
    return null;
  }

  function getWebpDimensions(bytes) {
    if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' ||
        String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP') {
      return null;
    }
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8X') {
      return {
        width: readUint24LittleEndian(bytes, 24) + 1,
        height: readUint24LittleEndian(bytes, 27) + 1
      };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = (bytes[21] || 0) | ((bytes[22] || 0) << 8) |
        ((bytes[23] || 0) << 16) | ((bytes[24] || 0) << 24);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1
      };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d &&
        bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return {
        width: ((bytes[26] || 0) | ((bytes[27] || 0) << 8)) & 0x3fff,
        height: ((bytes[28] || 0) | ((bytes[29] || 0) << 8)) & 0x3fff
      };
    }
    return null;
  }

  function isAvifResource(bytes) {
    if (bytes.length < 16 || String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') {
      return false;
    }
    const brands = String.fromCharCode(...bytes.slice(8, Math.min(bytes.length, 32)));
    return brands.includes('avif') || brands.includes('avis');
  }

  function inspectIconResource(arrayBuffer, mimeType, url, candidate) {
    const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
    const type = String(mimeType || '').split(';')[0].trim().toLowerCase();
    let leadingText = '';
    if (bytes.length > 0) {
      try {
        leadingText = new TextDecoder().decode(bytes.slice(0, 512)).trim().toLowerCase();
      } catch (error) {
        leadingText = '';
      }
    }
    const vector = /<svg(?:\s|>)/i.test(leadingText);
    if (vector) {
      return {
        usable: true,
        vector: true,
        width: 0,
        height: 0,
        mimeType: 'image/svg+xml'
      };
    }
    const detectedResources = [
      { dimensions: getPngDimensions(bytes), mimeType: 'image/png' },
      { dimensions: getGifDimensions(bytes), mimeType: 'image/gif' },
      { dimensions: getIcoDimensions(bytes), mimeType: 'image/x-icon' },
      { dimensions: getJpegDimensions(bytes), mimeType: 'image/jpeg' },
      { dimensions: getWebpDimensions(bytes), mimeType: 'image/webp' }
    ];
    const detected = detectedResources.find((item) => item.dimensions);
    const avif = isAvifResource(bytes);
    const declaredSize = Number(candidate && candidate.declaredSize || 0);
    const effectiveWidth = detected ? detected.dimensions.width : (avif ? declaredSize : 0);
    const effectiveHeight = detected ? detected.dimensions.height : (avif ? declaredSize : 0);
    const usable = Number.isFinite(effectiveWidth) && Number.isFinite(effectiveHeight) &&
      Math.max(effectiveWidth, effectiveHeight) >= MIN_ICON_DIMENSION &&
      Math.min(effectiveWidth, effectiveHeight) >= Math.floor(MIN_ICON_DIMENSION / 2);
    const resolvedMimeType = detected
      ? detected.mimeType
      : (avif ? 'image/avif' : (type.startsWith('image/') ? type : 'image/png'));
    return {
      usable,
      vector: false,
      width: Number(effectiveWidth || 0),
      height: Number(effectiveHeight || 0),
      mimeType: resolvedMimeType
    };
  }

  function normalizeCacheMap(value, nowValue, options) {
    const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();
    const cacheOptions = normalizeCacheOptions(options);
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const entries = Object.keys(source).flatMap((rawKey) => {
      const item = source[rawKey];
      const key = getCacheKey(rawKey);
      const dataUrl = normalizeDataUrl(item && item.dataUrl, cacheOptions);
      const sourceUrl = normalizePageUrl(item && item.sourceUrl);
      const updatedAt = Number(item && item.updatedAt || 0);
      if (!key || !dataUrl || !Number.isFinite(updatedAt) || updatedAt <= 0 ||
          now - updatedAt > cacheOptions.cacheTtlMs) {
        return [];
      }
      return [{ key, dataUrl, sourceUrl, updatedAt }];
    }).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, cacheOptions.cacheMaxEntries);
    return entries.reduce((result, entry) => {
      result[entry.key] = {
        dataUrl: entry.dataUrl,
        sourceUrl: entry.sourceUrl,
        updatedAt: entry.updatedAt
      };
      return result;
    }, {});
  }

  function setCachedIcon(cacheMap, pageUrl, dataUrl, sourceUrl, nowValue, options) {
    const key = getCacheKey(pageUrl);
    const iconDataUrl = normalizeDataUrl(dataUrl, options);
    if (!key || !iconDataUrl) {
      return normalizeCacheMap(cacheMap, nowValue, options);
    }
    return normalizeCacheMap({
      ...(cacheMap || {}),
      [key]: {
        dataUrl: iconDataUrl,
        sourceUrl: normalizePageUrl(sourceUrl),
        updatedAt: Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now()
      }
    }, nowValue, options);
  }

  function retainCachedIcons(cacheMap, pageUrls, nowValue, options) {
    const allowed = new Set((Array.isArray(pageUrls) ? pageUrls : []).map(getCacheKey).filter(Boolean));
    const normalized = normalizeCacheMap(cacheMap, nowValue, options);
    return Object.keys(normalized).reduce((result, key) => {
      if (allowed.has(key)) {
        result[key] = normalized[key];
      }
      return result;
    }, {});
  }

  function getCachedIconDataUrl(cacheMap, pageUrl, nowValue, options) {
    const normalized = normalizeCacheMap(cacheMap, nowValue, options);
    const entry = normalized[getCacheKey(pageUrl)];
    return entry ? entry.dataUrl : '';
  }

  function createShortcutFaviconStore(options) {
    const settings = options && typeof options === 'object' ? options : {};
    const storageArea = settings.storageArea || null;
    const storageKey = String(settings.storageKey || DEFAULT_STORAGE_KEY);
    const chromeApi = settings.chromeApi || null;
    const lockManager = settings.lockManager || null;
    const lockName = `lumno-shortcut-favicon-store:${storageKey}`;
    const cacheOptions = normalizeCacheOptions(settings);

    function getRuntimeError() {
      return chromeApi && chromeApi.runtime ? chromeApi.runtime.lastError : null;
    }

    function readAll() {
      return new Promise((resolve) => {
        if (!storageArea || typeof storageArea.get !== 'function') {
          resolve({});
          return;
        }
        storageArea.get([storageKey], (result) => {
          if (getRuntimeError()) {
            resolve({});
            return;
          }
          resolve(normalizeCacheMap(result && result[storageKey], undefined, cacheOptions));
        });
      });
    }

    function writeAll(cacheMap) {
      const normalized = normalizeCacheMap(cacheMap, undefined, cacheOptions);
      return new Promise((resolve, reject) => {
        if (!storageArea || typeof storageArea.set !== 'function') {
          resolve(normalized);
          return;
        }
        storageArea.set({ [storageKey]: normalized }, () => {
          const runtimeError = getRuntimeError();
          if (runtimeError) {
            reject(new Error(runtimeError.message || 'Failed to store shortcut favicons.'));
            return;
          }
          resolve(normalized);
        });
      });
    }

    function runExclusive(task) {
      if (lockManager && typeof lockManager.request === 'function') {
        return Promise.resolve(lockManager.request(lockName, task));
      }
      return Promise.resolve().then(task);
    }

    function updateAll(updater) {
      return runExclusive(() => readAll().then((current) => {
        const next = typeof updater === 'function' ? updater(current) : current;
        return writeAll(next);
      }));
    }

    function mergeAll(cacheMap) {
      const additions = normalizeCacheMap(cacheMap, undefined, cacheOptions);
      return updateAll((current) => normalizeCacheMap({
        ...current,
        ...additions
      }, undefined, cacheOptions));
    }

    function retainAll(pageUrls) {
      return updateAll((current) => retainCachedIcons(
        current,
        pageUrls,
        undefined,
        cacheOptions
      ));
    }

    return Object.freeze({ storageKey, cacheOptions, readAll, writeAll, mergeAll, retainAll });
  }

  return Object.freeze({
    DEFAULT_STORAGE_KEY,
    SITE_SEARCH_STORAGE_KEY,
    SITE_SEARCH_LEGACY_STORAGE_KEYS,
    GOOGLE_BRAND_ICON_URL,
    SITE_SEARCH_PINNED_ICON_ASSETS,
    CACHE_TTL_MS,
    CACHE_MAX_ENTRIES,
    MAX_DATA_URL_LENGTH,
    SITE_SEARCH_CACHE_OPTIONS,
    MIN_ICON_DIMENSION,
    getCacheKey,
    getSiteSearchProviderPageUrl,
    getSiteSearchProviderExplicitIcon,
    getSiteSearchPinnedIconAssetPath,
    isSiteSearchPinnedIconAssetUrl,
    shouldHydrateSiteSearchProviderIcon,
    createSiteSearchProviderIconHydrator,
    getPinnedSiteSearchProviderIcon,
    getSiteSearchProviderIcon,
    normalizePageUrl,
    normalizeCacheOptions,
    normalizeDataUrl,
    getLargestDeclaredSize,
    parseHtmlIconCandidates,
    parseHtmlManifestUrls,
    parseManifestIconCandidates,
    getRootIconCandidates,
    mergeCandidates,
    inspectIconResource,
    normalizeCacheMap,
    setCachedIcon,
    retainCachedIcons,
    getCachedIconDataUrl,
    createShortcutFaviconStore
  });
});
