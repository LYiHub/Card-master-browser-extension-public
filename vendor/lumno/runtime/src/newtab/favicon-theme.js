(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabFaviconTheme = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  const faviconUtils = root.LumnoFaviconUtils || {};
  const defaultAccentColor = [59, 130, 246];
  const MIN_THEME_FOREGROUND_CONTRAST = 4.5;
  const MIN_THEME_STRONG_BOUNDARY_CONTRAST = 3;
  const MIN_THEME_SOFT_BOUNDARY_CONTRAST = 1.4;
  const MIN_THEME_HIGHLIGHT_CONTRAST = 1.18;
  const MIN_THEME_HOVER_CONTRAST = 1.12;
  const LIGHT_THEME_SURFACE_MAX_SATURATION = 0.68;
  const DARK_THEME_SURFACE_MAX_SATURATION = 0.6;
  const brandAccentMap = {
    'github.com': [36, 41, 46],
    'docs.github.com': [36, 41, 46],
    'douban.com': [0, 181, 29],
    'zhihu.com': [23, 127, 255],
    'bilibili.com': [0, 174, 236],
    'dribbble.com': [234, 100, 217],
    'youtube.com': [255, 0, 0],
    'youtu.be': [255, 0, 0],
    'google.com': [66, 133, 244],
    'chatgpt.com': [16, 163, 127],
    'gemini.google.com': [66, 133, 244],
    'doubao.com': [79, 70, 229],
    'qianwen.com': [37, 99, 235],
    'yuanbao.tencent.com': [0, 82, 217],
    'chat.minimax.io': [24, 119, 242],
    'chat.deepseek.com': [74, 107, 255],
    'kimi.com': [77, 92, 255],
    'bing.com': [0, 120, 215],
    'baidu.com': [41, 98, 255],
    'taobao.com': [255, 80, 0],
    'tmall.com': [226, 35, 26],
    'juejin.cn': [30, 128, 255],
    'reddit.com': [255, 69, 0],
    'wikipedia.org': [64, 64, 64],
    'zh.wikipedia.org': [64, 64, 64],
    'dodopayments.com': [190, 255, 0],
    'x.com': [17, 24, 39],
    'twitter.com': [29, 161, 242]
  };

  function mixColor(color, target, amount) {
    return [
      Math.round(color[0] + (target[0] - color[0]) * amount),
      Math.round(color[1] + (target[1] - color[1]) * amount),
      Math.round(color[2] + (target[2] - color[2]) * amount)
    ];
  }

  function stableHashCode(text) {
    const input = String(text || '');
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function rgbToCss(rgb) {
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function rgbToCssAlpha(rgb, alpha) {
    const nextAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${nextAlpha})`;
  }

  function rgbToCssParts(rgb) {
    return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
  }

  function parseCssColor(color) {
    if (!color || typeof color !== 'string') {
      return null;
    }
    const trimmed = color.trim().toLowerCase();
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
          return [r, g, b];
        }
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
          return [r, g, b];
        }
      }
      return null;
    }
    const rgbMatch = trimmed.match(/^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*(?:[0-9.]+|[0-9.]+%))?\s*\)$/);
    if (rgbMatch) {
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      if ([r, g, b].every((value) => Number.isFinite(value))) {
        return [r, g, b];
      }
    }
    return null;
  }

  function getLuminance(rgb) {
    const [r, g, b] = rgb.map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function getContrastRatio(firstRgb, secondRgb) {
    const firstLuminance = getLuminance(firstRgb);
    const secondLuminance = getLuminance(secondRgb);
    return (Math.max(firstLuminance, secondLuminance) + 0.05) /
      (Math.min(firstLuminance, secondLuminance) + 0.05);
  }

  function getSaturationCappedColor(color, maximumSaturation) {
    const source = Array.isArray(color) && color.length === 3
      ? color
      : defaultAccentColor;
    const [red, green, blue] = source.map((channel) => channel / 255);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    const lightness = (max + min) / 2;
    if (!delta) {
      return source.slice();
    }
    const saturation = delta / (1 - Math.abs((2 * lightness) - 1));
    const nextSaturation = Math.min(
      saturation,
      Math.max(0, Math.min(1, Number(maximumSaturation) || 0))
    );
    if (nextSaturation === saturation) {
      return source.slice();
    }
    let hueSegment = 0;
    if (max === red) {
      hueSegment = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hueSegment = ((blue - red) / delta) + 2;
    } else {
      hueSegment = ((red - green) / delta) + 4;
    }
    const hue = ((hueSegment * 60) + 360) % 360;
    const chroma = (1 - Math.abs((2 * lightness) - 1)) * nextSaturation;
    const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    let rgb = [0, 0, 0];
    if (hue < 60) {
      rgb = [chroma, secondary, 0];
    } else if (hue < 120) {
      rgb = [secondary, chroma, 0];
    } else if (hue < 180) {
      rgb = [0, chroma, secondary];
    } else if (hue < 240) {
      rgb = [0, secondary, chroma];
    } else if (hue < 300) {
      rgb = [secondary, 0, chroma];
    } else {
      rgb = [chroma, 0, secondary];
    }
    const offset = lightness - (chroma / 2);
    return rgb.map((channel) => Math.round((channel + offset) * 255));
  }

  function getAccessibleThemeColor(color, background, minimumContrast) {
    const source = Array.isArray(color) && color.length === 3
      ? color
      : defaultAccentColor;
    const surface = Array.isArray(background) && background.length === 3
      ? background
      : [255, 255, 255];
    const requiredContrast = Number.isFinite(minimumContrast)
      ? Math.max(1, minimumContrast)
      : MIN_THEME_FOREGROUND_CONTRAST;
    if (getContrastRatio(source, surface) >= requiredContrast) {
      return source.slice();
    }
    const darkTarget = [17, 24, 39];
    const lightTarget = [248, 250, 252];
    const target = getContrastRatio(darkTarget, surface) >=
      getContrastRatio(lightTarget, surface)
      ? darkTarget
      : lightTarget;
    let lowerWeight = 0;
    let upperWeight = 1;
    let accessibleColor = target.slice();
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const weight = (lowerWeight + upperWeight) / 2;
      const candidate = mixColor(source, target, weight);
      if (getContrastRatio(candidate, surface) >= requiredContrast) {
        accessibleColor = candidate;
        upperWeight = weight;
      } else {
        lowerWeight = weight;
      }
    }
    return accessibleColor;
  }

  function getTintedSurfaceColor(accent, base, baseWeight, minimumContrast) {
    const preferredColor = mixColor(accent, base, baseWeight);
    if (getContrastRatio(preferredColor, base) >= minimumContrast) {
      return preferredColor;
    }
    const contrastColor = getAccessibleThemeColor(accent, base, minimumContrast);
    let lowerWeight = 0;
    let upperWeight = baseWeight;
    let tintedColor = contrastColor.slice();
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const weight = (lowerWeight + upperWeight) / 2;
      const candidate = mixColor(contrastColor, base, weight);
      if (getContrastRatio(candidate, base) >= minimumContrast) {
        tintedColor = candidate;
        lowerWeight = weight;
      } else {
        upperWeight = weight;
      }
    }
    return tintedColor;
  }

  function getSoftThemeBorderColor(accent, background) {
    return getTintedSurfaceColor(
      accent,
      background,
      1,
      MIN_THEME_SOFT_BOUNDARY_CONTRAST
    );
  }

  function getReadableTextColor(bgRgb) {
    if (!bgRgb || bgRgb.length !== 3) {
      return '#111827';
    }
    const darkText = [17, 24, 39];
    const lightText = [248, 250, 252];
    const contrastWithDark = getContrastRatio(darkText, bgRgb);
    const contrastWithLight = getContrastRatio(lightText, bgRgb);
    return contrastWithDark >= contrastWithLight ? '#111827' : '#F8FAFC';
  }

  function normalizeAccentColor(rgb) {
    if (!rgb || rgb.length !== 3) {
      return defaultAccentColor.slice();
    }
    const max = Math.max(...rgb);
    const min = Math.min(...rgb);
    if (min >= 235 && max >= 245) {
      return defaultAccentColor.slice();
    }
    const luminance = getLuminance(rgb);
    if (luminance < 0.12) {
      return mixColor(rgb, [255, 255, 255], 0.55);
    }
    if (luminance > 0.9) {
      return mixColor(rgb, [0, 0, 0], 0.2);
    }
    return rgb;
  }

  function buildThemeVariant(accent, mode) {
    const isDark = mode === 'dark';
    const base = isDark ? [48, 48, 48] : [255, 255, 255];
    const surfaceAccent = getSaturationCappedColor(
      accent,
      isDark ? DARK_THEME_SURFACE_MAX_SATURATION : LIGHT_THEME_SURFACE_MAX_SATURATION
    );
    const highlightBg = getTintedSurfaceColor(
      surfaceAccent,
      base,
      isDark ? 0.82 : 0.86,
      MIN_THEME_HIGHLIGHT_CONTRAST
    );
    const markBg = mixColor(surfaceAccent, base, isDark ? 0.74 : 0.78);
    const activeMarkBg = getTintedSurfaceColor(
      surfaceAccent,
      highlightBg,
      1,
      MIN_THEME_SOFT_BOUNDARY_CONTRAST
    );
    const tagBg = mixColor(surfaceAccent, base, isDark ? 0.76 : 0.74);
    const keyBg = mixColor(surfaceAccent, base, isDark ? 0.88 : 0.9);
    const buttonBg = mixColor(surfaceAccent, base, isDark ? 0.8 : 0.94);
    const highlightBorder = getAccessibleThemeColor(
      surfaceAccent,
      base,
      MIN_THEME_STRONG_BOUNDARY_CONTRAST
    );
    const tagBorder = getSoftThemeBorderColor(surfaceAccent, tagBg);
    const keyBorder = getSoftThemeBorderColor(surfaceAccent, keyBg);
    const buttonBorder = getSoftThemeBorderColor(surfaceAccent, buttonBg);
    const accentColor = getAccessibleThemeColor(
      accent,
      highlightBg,
      MIN_THEME_FOREGROUND_CONTRAST
    );
    const buttonText = getAccessibleThemeColor(
      accent,
      buttonBg,
      MIN_THEME_FOREGROUND_CONTRAST
    );
    const placeholderText = getAccessibleThemeColor(
      accent,
      base,
      MIN_THEME_FOREGROUND_CONTRAST
    );
    return {
      accent: rgbToCss(accentColor),
      accentRgb: accent,
      highlightBg: rgbToCss(highlightBg),
      highlightBorder: rgbToCss(highlightBorder),
      markBg: rgbToCss(markBg),
      markText: getReadableTextColor(markBg),
      activeMarkBg: rgbToCss(activeMarkBg),
      activeMarkText: getReadableTextColor(activeMarkBg),
      tagBg: rgbToCss(tagBg),
      tagText: getReadableTextColor(tagBg),
      tagBorder: rgbToCss(tagBorder),
      keyBg: rgbToCss(keyBg),
      keyText: getReadableTextColor(keyBg),
      keyBorder: rgbToCss(keyBorder),
      buttonText: rgbToCss(buttonText),
      buttonBg: rgbToCss(buttonBg),
      buttonBorder: rgbToCss(buttonBorder),
      placeholderText: rgbToCss(placeholderText)
    };
  }

  function buildTheme(rgb) {
    const accent = normalizeAccentColor(rgb);
    return buildThemeVariant(accent, 'light');
  }

  function createDefaultTheme() {
    const theme = buildTheme(defaultAccentColor);
    theme._xIsDefault = true;
    theme._xIsBrand = false;
    theme._xThemeSource = 'fallback';
    return theme;
  }

  function createUrlHighlightTheme() {
    const theme = buildTheme(defaultAccentColor);
    theme._xIsBrand = true;
    theme._xIsUrl = true;
    theme._xThemeSource = 'url';
    return theme;
  }

  function normalizeHost(hostname) {
    if (!hostname) {
      return '';
    }
    const lower = String(hostname).toLowerCase();
    const stripped = lower.replace(/^www\./i, '');
    if (stripped === 'my.feishu.cn') {
      return 'feishu.cn';
    }
    return stripped;
  }

  function normalizeFaviconHost(hostname) {
    if (typeof faviconUtils.normalizeFaviconHost === 'function') {
      return faviconUtils.normalizeFaviconHost(hostname);
    }
    if (!hostname) {
      return '';
    }
    const host = String(hostname).toLowerCase().replace(/^www\./i, '');
    if (host === 'feishu.cn' || host.endsWith('.feishu.cn')) {
      return 'feishu.cn';
    }
    return host;
  }

  function getBrandAccentForHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (!host) {
      return null;
    }
    if (brandAccentMap[host]) {
      return brandAccentMap[host];
    }
    const entry = Object.keys(brandAccentMap).find((key) => host === key || host.endsWith(`.${key}`));
    return entry ? brandAccentMap[entry] : null;
  }

  function getBrandAccentForUrl(url) {
    if (!url) {
      return null;
    }
    try {
      const hostname = normalizeHost(new URL(url).hostname);
      return getBrandAccentForHost(hostname);
    } catch (e) {
      return null;
    }
  }

  function buildFallbackThemeForHost(hostname) {
    const theme = createDefaultTheme();
    theme._xIsFallback = true;
    return theme;
  }

  function getThemeFingerprint(theme) {
    const source = theme && theme._xThemeSource
      ? String(theme._xThemeSource)
      : (theme && theme._xIsDefault ? 'fallback' : (theme && theme._xIsBrand ? 'brand' : 'unknown'));
    const confidence = theme && theme._xThemeConfidence ? String(theme._xThemeConfidence) : '';
    const neutral = theme && theme._xThemeNeutral ? 'neutral' : 'color';
    const rgb = theme && (theme.accentRgb || parseCssColor(theme.accent));
    const accent = rgb && rgb.length === 3 ? rgb : defaultAccentColor;
    return `${source}:${confidence || neutral}:${accent.join(',')}`;
  }

  function hasThemeTokenInUrl(url, token) {
    if (typeof faviconUtils.hasThemeTokenInUrl === 'function') {
      return faviconUtils.hasThemeTokenInUrl(url, token);
    }
    const lower = String(url || '').toLowerCase();
    return new RegExp(`(^|[._/-])${token}([._/-]|$)`).test(lower);
  }

  function shouldSkipThemeUpgradeCandidate(candidateUrl, preferredTheme, currentUrl) {
    if (typeof faviconUtils.shouldSkipThemeUpgradeCandidate === 'function') {
      return faviconUtils.shouldSkipThemeUpgradeCandidate(candidateUrl, preferredTheme, currentUrl);
    }
    const mode = preferredTheme === 'dark' ? 'dark' : (preferredTheme === 'light' ? 'light' : '');
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

  function getKnownThemedFaviconCandidates(hostname, preferredTheme) {
    if (typeof faviconUtils.getKnownThemedFaviconCandidateUrls === 'function') {
      return faviconUtils.getKnownThemedFaviconCandidateUrls(hostname, preferredTheme, {
        getRuntimeUrl: (path) => {
          const chromeApi = root.chrome;
          return chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getURL === 'function'
            ? chromeApi.runtime.getURL(path)
            : '';
        }
      });
    }
    const host = normalizeFaviconHost(hostname);
    if (!host) {
      return [];
    }
    if (host === 'lumno.kubai.design') {
      const chromeApi = root.chrome;
      const lumnoIconUrl = (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getURL === 'function')
        ? chromeApi.runtime.getURL('assets/images/lumno.png')
        : 'https://lumno.kubai.design/favicon.png';
      return [
        lumnoIconUrl
      ];
    }
    if (host === 'github.com' || host.endsWith('.github.com')) {
      if (preferredTheme === 'dark') {
        return [
          'https://github.githubassets.com/favicons/favicon-dark.svg',
          'https://github.githubassets.com/favicons/favicon.svg',
          'https://github.githubassets.com/favicons/favicon.png'
        ];
      }
      return [
        'https://github.githubassets.com/favicons/favicon.svg',
        'https://github.githubassets.com/favicons/favicon-dark.svg',
        'https://github.githubassets.com/favicons/favicon.png'
      ];
    }
    return [];
  }

  function hostHasExplicitDarkFavicon(hostname) {
    if (typeof faviconUtils.hostHasExplicitDarkFavicon === 'function') {
      return faviconUtils.hostHasExplicitDarkFavicon(hostname);
    }
    const host = normalizeFaviconHost(hostname);
    if (!host) {
      return false;
    }
    return host === 'github.com' || host.endsWith('.github.com');
  }

  function isFaviconProxyUrl(url) {
    if (typeof faviconUtils.isFaviconProxyUrl === 'function') {
      return faviconUtils.isFaviconProxyUrl(url);
    }
    if (!url) {
      return false;
    }
    return /google\.com\/s2\/favicons/i.test(url) ||
      /gstatic\.com\/favicon/i.test(url) ||
      /favicon\.is\//i.test(url);
  }

  function extractAverageColor(image) {
    const size = 16;
    const doc = root.document;
    if (!doc || typeof doc.createElement !== 'function') {
      return null;
    }
    const canvas = doc.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }
    try {
      context.drawImage(image, 0, 0, size, size);
      const data = context.getImageData(0, 0, size, size).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 32) {
          continue;
        }
        const red = data[i];
        const green = data[i + 1];
        const blue = data[i + 2];
        const brightness = (red + green + blue) / 3;
        if (brightness > 245) {
          continue;
        }
        r += red;
        g += green;
        b += blue;
        count += 1;
      }
      if (!count) {
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 32) {
            continue;
          }
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count += 1;
        }
      }
      if (!count) {
        return null;
      }
      return [
        Math.round(r / count),
        Math.round(g / count),
        Math.round(b / count)
      ];
    } catch (e) {
      return null;
    }
  }

  function resolveDarkModeOption(options) {
    if (options && typeof options.isDarkMode === 'function') {
      return Boolean(options.isDarkMode());
    }
    return Boolean(options && options.isDarkMode);
  }

  function getThemeForMode(theme, options) {
    const fallbackTheme = options && options.defaultTheme ? options.defaultTheme : createDefaultTheme();
    const sourceTheme = theme || fallbackTheme;
    if (!resolveDarkModeOption(options)) {
      return sourceTheme;
    }
    if (sourceTheme._xDark) {
      return sourceTheme._xDark;
    }
    const accentRgb = sourceTheme.accentRgb || parseCssColor(sourceTheme.accent) || defaultAccentColor;
    const darkTheme = buildThemeVariant(accentRgb, 'dark');
    darkTheme._xIsDefault = Boolean(sourceTheme._xIsDefault);
    darkTheme._xIsBrand = Boolean(sourceTheme._xIsBrand);
    sourceTheme._xDark = darkTheme;
    return darkTheme;
  }

  function getHoverColors(theme, options) {
    const resolvedTheme = getThemeForMode(theme, options);
    const accentRgb = resolvedTheme.accentRgb || parseCssColor(resolvedTheme.accent) || defaultAccentColor;
    const isDark = resolveDarkModeOption(options);
    const base = isDark ? [48, 48, 48] : [255, 255, 255];
    const surfaceAccent = getSaturationCappedColor(
      accentRgb,
      isDark ? DARK_THEME_SURFACE_MAX_SATURATION : LIGHT_THEME_SURFACE_MAX_SATURATION
    );
    const hoverBg = getTintedSurfaceColor(
      surfaceAccent,
      base,
      isDark ? 0.6 : 0.9,
      MIN_THEME_HOVER_CONTRAST
    );
    return {
      bg: rgbToCss(hoverBg),
      border: rgbToCss(getSoftThemeBorderColor(surfaceAccent, hoverBg))
    };
  }

  return {
    defaultAccentColor,
    mixColor,
    stableHashCode,
    rgbToCss,
    rgbToCssAlpha,
    rgbToCssParts,
    parseCssColor,
    getLuminance,
    getContrastRatio,
    getSaturationCappedColor,
    getAccessibleThemeColor,
    getTintedSurfaceColor,
    getSoftThemeBorderColor,
    getReadableTextColor,
    normalizeAccentColor,
    buildThemeVariant,
    buildTheme,
    createDefaultTheme,
    createUrlHighlightTheme,
    normalizeHost,
    normalizeFaviconHost,
    getBrandAccentForHost,
    getBrandAccentForUrl,
    buildFallbackThemeForHost,
    getThemeFingerprint,
    hasThemeTokenInUrl,
    shouldSkipThemeUpgradeCandidate,
    getKnownThemedFaviconCandidates,
    hostHasExplicitDarkFavicon,
    isFaviconProxyUrl,
    extractAverageColor,
    getThemeForMode,
    getHoverColors
  };
});
