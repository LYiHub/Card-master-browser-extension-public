(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoFaviconViewCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  function noop() {}
  const FAVICON_INTRINSIC_SIZE = 128;

  function createFaviconViewCore(options) {
    const config = options || {};
    const doc = config.document || (root && root.document) || null;
    const win = config.windowObj || (root && root.window) || root || {};
    const chromeApi = config.chromeApi || (root && root.chrome) || {};
    const ImageCtor = win.Image || (root && root.Image) || null;
    const customRequestFaviconData = typeof config.requestFaviconData === 'function'
      ? config.requestFaviconData
      : null;
    const requestFrame = typeof win.requestAnimationFrame === 'function'
      ? win.requestAnimationFrame.bind(win)
      : (callback) => win.setTimeout(callback, 16);
    const getHostFromUrl = typeof config.getHostFromUrl === 'function' ? config.getHostFromUrl : (() => '');
    const shouldBlockFaviconForHost = typeof config.shouldBlockFaviconForHost === 'function'
      ? config.shouldBlockFaviconForHost
      : (() => false);
    const isBlockedLocalFaviconUrl = typeof config.isBlockedLocalFaviconUrl === 'function'
      ? config.isBlockedLocalFaviconUrl
      : (() => false);
    const showResolvedFavicon = typeof config.showResolvedFavicon === 'function' ? config.showResolvedFavicon : noop;
    const showPendingFallbackIcon = typeof config.showPendingFallbackIcon === 'function' ? config.showPendingFallbackIcon : noop;
    const getPersistCacheKey = typeof config.getPersistCacheKey === 'function' ? config.getPersistCacheKey : (() => '');
    const setPersistedFaviconUrl = typeof config.setPersistedFaviconUrl === 'function' ? config.setPersistedFaviconUrl : noop;
    const setPersistedFaviconData = typeof config.setPersistedFaviconData === 'function' ? config.setPersistedFaviconData : noop;
    const shouldPersistFaviconUrl = typeof config.shouldPersistFaviconUrl === 'function'
      ? config.shouldPersistFaviconUrl
      : (() => true);
    const preloadThemeFromFavicon = typeof config.preloadThemeFromFavicon === 'function' ? config.preloadThemeFromFavicon : noop;
    const getThemeFaviconUrl = typeof config.getThemeFaviconUrl === 'function' ? config.getThemeFaviconUrl : (() => '');
    const hasThemeForHost = typeof config.hasThemeForHost === 'function' ? config.hasThemeForHost : (() => false);
    const customDetectDefaultExtensionFavicon = typeof config.detectDefaultExtensionFavicon === 'function'
      ? config.detectDefaultExtensionFavicon
      : null;
    const faviconDataCache = config.faviconDataCache || new Map();
    const faviconDataPending = config.faviconDataPending || new Map();
    const iconPreloadCache = config.iconPreloadCache || new Map();
    const extensionFaviconPlaceholderProbeCache = new Map();
    const ignoreLastWorkingWhenFallback = Boolean(config.ignoreLastWorkingWhenFallback);
    const faviconDataCacheMaxEntries = Number.isFinite(config.faviconDataCacheMaxEntries)
      ? Math.max(1, Math.floor(config.faviconDataCacheMaxEntries))
      : 256;
    const iconPreloadCacheMaxEntries = Number.isFinite(config.iconPreloadCacheMaxEntries)
      ? Math.max(1, Math.floor(config.iconPreloadCacheMaxEntries))
      : 192;
    const placeholderProbeCacheMaxEntries = Number.isFinite(config.placeholderProbeCacheMaxEntries)
      ? Math.max(1, Math.floor(config.placeholderProbeCacheMaxEntries))
      : 32;
    const faviconUtils = (root && root.LumnoFaviconUtils) || {};

    function setBoundedCacheEntry(cache, key, value, maxEntries) {
      if (typeof faviconUtils.setBoundedCacheEntry === 'function') {
        return faviconUtils.setBoundedCacheEntry(cache, key, value, maxEntries);
      }
      if (!cache || typeof cache.set !== 'function') {
        return value;
      }
      if (typeof cache.delete === 'function' && typeof cache.has === 'function' && cache.has(key)) {
        cache.delete(key);
      }
      cache.set(key, value);
      while (cache.size > maxEntries && typeof cache.keys === 'function' &&
          typeof cache.delete === 'function') {
        const oldest = cache.keys().next();
        if (!oldest || oldest.done) {
          break;
        }
        cache.delete(oldest.value);
      }
      return value;
    }

    function cacheFaviconData(url, dataUrl) {
      return setBoundedCacheEntry(
        faviconDataCache,
        url,
        dataUrl,
        faviconDataCacheMaxEntries
      );
    }

    function createImage() {
      return typeof ImageCtor === 'function'
        ? new ImageCtor()
        : (doc && typeof doc.createElement === 'function' ? doc.createElement('img') : {});
    }

    function setFaviconIntrinsicSize(img) {
      if (!img || typeof img.setAttribute !== 'function') {
        return;
      }
      img.setAttribute('width', String(FAVICON_INTRINSIC_SIZE));
      img.setAttribute('height', String(FAVICON_INTRINSIC_SIZE));
    }

    function buildExtensionFaviconPlaceholderProbeUrl(faviconUrl) {
      try {
        const parsed = new URL(String(faviconUrl || ''));
        if (parsed.protocol !== 'chrome-extension:' || !parsed.pathname.startsWith('/_favicon/')) {
          return '';
        }
        parsed.searchParams.set('pageUrl', 'https://lumno.invalid/__favicon_placeholder_probe__');
        return parsed.toString();
      } catch (e) {
        return '';
      }
    }

    function getCanvasImageSignature(image) {
      if (!image || !doc || typeof doc.createElement !== 'function') {
        return '';
      }
      try {
        const canvas = doc.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          return '';
        }
        context.clearRect(0, 0, 16, 16);
        context.drawImage(image, 0, 0, 16, 16);
        const data = context.getImageData(0, 0, 16, 16).data;
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 1) {
          hash ^= data[i];
          hash = Math.imul(hash, 16777619) >>> 0;
        }
        return `${hash}:${data.length}`;
      } catch (e) {
        return '';
      }
    }

    function loadImageSignature(url) {
      return new Promise((resolve) => {
        const probe = createImage();
        if (!probe) {
          resolve('');
          return;
        }
        probe.onload = () => resolve(getCanvasImageSignature(probe));
        probe.onerror = () => resolve('');
        probe.src = url;
      });
    }

    function getExtensionPlaceholderSignature(faviconUrl) {
      const probeUrl = buildExtensionFaviconPlaceholderProbeUrl(faviconUrl);
      if (!probeUrl) {
        return Promise.resolve('');
      }
      if (!extensionFaviconPlaceholderProbeCache.has(probeUrl)) {
        setBoundedCacheEntry(
          extensionFaviconPlaceholderProbeCache,
          probeUrl,
          loadImageSignature(probeUrl),
          placeholderProbeCacheMaxEntries
        );
      }
      return extensionFaviconPlaceholderProbeCache.get(probeUrl);
    }

    function detectDefaultExtensionFavicon(img, faviconUrl) {
      if (customDetectDefaultExtensionFavicon) {
        return Promise.resolve(customDetectDefaultExtensionFavicon(img, faviconUrl))
          .then(Boolean)
          .catch(() => false);
      }
      const currentSignature = getCanvasImageSignature(img);
      if (!currentSignature) {
        return Promise.resolve(false);
      }
      return getExtensionPlaceholderSignature(faviconUrl)
        .then((placeholderSignature) => Boolean(placeholderSignature && placeholderSignature === currentSignature))
        .catch(() => false);
    }

    function setFallbackNodeVisible(node, visible) {
      if (!node) {
        return;
      }
      node.setAttribute('data-visible', visible ? 'true' : 'false');
    }

    function setFaviconLoadState(img, state) {
      if (!img) {
        return;
      }
      if (state) {
        img.setAttribute('data-favicon-load-state', state);
      } else {
        img.removeAttribute('data-favicon-load-state');
      }
    }

    function applyFaviconOpticalShift(img) {
      if (!img || !doc) {
        return;
      }
      const targetSize = 16;
      const visualCenter = (targetSize - 1) / 2;
      try {
        if (!(img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)) {
          img.style.setProperty('transform', 'none');
          return;
        }
        const canvas = doc.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          img.style.setProperty('transform', 'none');
          return;
        }
        context.clearRect(0, 0, targetSize, targetSize);
        context.drawImage(img, 0, 0, targetSize, targetSize);
        const data = context.getImageData(0, 0, targetSize, targetSize).data;
        let sumAlpha = 0;
        let weightedX = 0;
        let weightedY = 0;
        for (let y = 0; y < targetSize; y += 1) {
          for (let x = 0; x < targetSize; x += 1) {
            const alpha = data[(y * targetSize + x) * 4 + 3];
            if (alpha < 18) {
              continue;
            }
            sumAlpha += alpha;
            weightedX += x * alpha;
            weightedY += y * alpha;
          }
        }
        if (sumAlpha <= 0) {
          img.style.setProperty('transform', 'none');
          return;
        }
        const contentCenterX = weightedX / sumAlpha;
        const contentCenterY = weightedY / sumAlpha;
        const clamp = (value) => Math.max(-2, Math.min(2, value));
        let offsetX = clamp(visualCenter - contentCenterX);
        let offsetY = clamp(visualCenter - contentCenterY);
        if (Math.abs(offsetX) < 0.4) {
          offsetX = 0;
        }
        if (Math.abs(offsetY) < 0.4) {
          offsetY = 0;
        }
        img.style.setProperty('transform', `translate(${offsetX}px, ${offsetY}px)`);
      } catch (e) {
        img.style.setProperty('transform', 'none');
      }
    }

    function applyFaviconOpticalAlignment(img) {
      if (!img) {
        return;
      }
      setFaviconIntrinsicSize(img);
      img.style.setProperty('object-fit', 'contain');
      img.style.setProperty('object-position', 'center center');
      applyFaviconOpticalShift(img);
    }

    function ensureFaviconStartsLoading(img) {
      if (!img) {
        return;
      }
      try {
        const loadingValue = String(
          (typeof img.getAttribute === 'function' ? img.getAttribute('loading') : '') ||
            img.loading ||
            ''
        ).toLowerCase();
        if (loadingValue === 'lazy') {
          img.loading = 'eager';
          if (typeof img.setAttribute === 'function') {
            img.setAttribute('loading', 'eager');
          }
        }
      } catch (e) {
        // Ignore unsupported loading mutations on non-browser test doubles.
      }
    }

    function requestFaviconData(url, pageUrl) {
      if (!url || url.startsWith('data:') || isBlockedLocalFaviconUrl(url)) {
        return Promise.resolve(null);
      }
      if (customRequestFaviconData) {
        return Promise.resolve(customRequestFaviconData(url, pageUrl)).catch(() => null);
      }
      if (faviconDataCache.has(url)) {
        return Promise.resolve(faviconDataCache.get(url));
      }
      if (faviconDataPending.has(url)) {
        return faviconDataPending.get(url);
      }
      const promise = new Promise((resolve) => {
        if (!chromeApi.runtime || typeof chromeApi.runtime.sendMessage !== 'function') {
          faviconDataPending.delete(url);
          resolve(null);
          return;
        }
        chromeApi.runtime.sendMessage({ action: 'getFaviconData', url: url, pageUrl: pageUrl || '' }, (response) => {
          const dataUrl = response && response.data ? response.data : '';
          if (dataUrl) {
            cacheFaviconData(url, dataUrl);
          }
          faviconDataPending.delete(url);
          resolve(dataUrl || null);
        });
      });
      faviconDataPending.set(url, promise);
      return promise;
    }

    function isCurrentFaviconSource(img, sourceUrl) {
      const expected = String(sourceUrl || '').trim();
      if (!img || !expected || !img.isConnected) {
        return false;
      }
      const resolvedSrc = String(img.getAttribute('data-favicon-current-src') || '').trim();
      const renderedSrc = String(img.getAttribute('src') || img.src || '').trim();
      const dataSource = String(img.getAttribute('data-favicon-data-source') || '').trim();
      return resolvedSrc === expected || renderedSrc === expected || dataSource === expected;
    }

    function setFaviconSrcWithAnimation(img, nextSrc, optionsArg) {
      if (!img || !nextSrc || isBlockedLocalFaviconUrl(nextSrc)) {
        return false;
      }
      setFaviconIntrinsicSize(img);
      const shouldPersist = !(optionsArg && optionsArg.persist === false);
      const shouldDeferResolve = Boolean(optionsArg && optionsArg.deferResolve);
      const sourceUrl = String((optionsArg && optionsArg.sourceUrl) || '').trim();
      const currentSrc = img.getAttribute('data-favicon-current-src') || '';
      const isFallbackVisible = img.getAttribute('data-fallback-icon') === 'true';
      const isPlaceholderVisible = img.getAttribute('data-favicon-placeholder') === 'true';
      const currentRenderedSrc = String(img.getAttribute('src') || img.src || '');
      const shouldRestartSameSource = (isFallbackVisible || isPlaceholderVisible) &&
        currentRenderedSrc === nextSrc &&
        currentSrc !== nextSrc;
      if (currentSrc === nextSrc) {
        if ((isFallbackVisible || isPlaceholderVisible) && img.complete && img.naturalWidth > 0) {
          if (!shouldDeferResolve) {
            showResolvedFavicon(img);
          }
          return false;
        }
        if (!isFallbackVisible && !isPlaceholderVisible) {
          return false;
        }
      }
      const hasAppeared = img.getAttribute('data-favicon-has-appeared') === 'true';
      const shouldAnimate = !hasAppeared;
      if (shouldAnimate || isFallbackVisible || isPlaceholderVisible) {
        ensureFaviconStartsLoading(img);
        showPendingFallbackIcon(img);
      }
      img._xFaviconLoadToken = (img._xFaviconLoadToken || 0) + 1;
      const token = img._xFaviconLoadToken;
      const finalize = () => {
        if (!img || token !== img._xFaviconLoadToken) {
          return;
        }
        if (!shouldDeferResolve) {
          showResolvedFavicon(img);
        }
        img.setAttribute('data-favicon-current-src', nextSrc);
        if (nextSrc.startsWith('data:') && sourceUrl) {
          img.setAttribute('data-favicon-data-source', sourceUrl);
        } else {
          img.removeAttribute('data-favicon-data-source');
        }
        img.setAttribute('data-favicon-has-appeared', 'true');
        applyFaviconOpticalShift(img);
        const persistKey = getPersistCacheKey(img);
        if (shouldPersist && persistKey) {
          if (nextSrc.startsWith('data:')) {
            setPersistedFaviconData(persistKey, nextSrc);
          } else if (shouldPersistFaviconUrl(nextSrc, img)) {
            setPersistedFaviconUrl(persistKey, nextSrc);
          }
        }
        if (shouldDeferResolve || !shouldAnimate) {
          setFaviconLoadState(img, '');
          img.style.setProperty('filter', 'none');
          img.style.setProperty('opacity', '1');
          img.style.setProperty('transition', 'none');
          return;
        }
        setFaviconLoadState(img, 'priming');
        requestFrame(() => {
          if (!img || token !== img._xFaviconLoadToken) {
            return;
          }
          setFaviconLoadState(img, 'loaded');
        });
      };
      img.addEventListener('load', finalize, { once: true });
      if (shouldRestartSameSource) {
        img.removeAttribute('src');
      }
      img.src = nextSrc;
      if (img.complete && img.naturalWidth > 0) {
        finalize();
      }
      return true;
    }

    function canReuseCurrentFavicon(img, nextSrc) {
      if (!img || !nextSrc) {
        return false;
      }
      const currentSrc = img.getAttribute('data-favicon-current-src') || img.src || '';
      if (currentSrc !== nextSrc) {
        return false;
      }
      const isFallback = img.getAttribute('data-fallback-icon') === 'true';
      const isPlaceholder = img.getAttribute('data-favicon-placeholder') === 'true';
      if (isFallback || isPlaceholder) {
        return false;
      }
      const currentResolved = img.getAttribute('data-favicon-current-src') || '';
      if (currentResolved === nextSrc) {
        return true;
      }
      return Boolean(img.complete && img.naturalWidth > 0);
    }

    function getLastWorkingFaviconSrc(img) {
      if (!img) {
        return '';
      }
      if (ignoreLastWorkingWhenFallback && img.getAttribute('data-fallback-icon') === 'true') {
        return '';
      }
      const resolved = img.getAttribute('data-favicon-current-src') || '';
      if (resolved) {
        return resolved;
      }
      if (img.complete && img.naturalWidth > 0) {
        return img.src || '';
      }
      return '';
    }

    function restoreWorkingFaviconOrFallback(img, previousSrc, restoreOptions) {
      const fallbackSrc = String(previousSrc || '').trim();
      const optionsForRestore = restoreOptions || {};
      if (fallbackSrc) {
        const applied = setFaviconSrcWithAnimation(img, fallbackSrc);
        if (applied || canReuseCurrentFavicon(img, fallbackSrc)) {
          if (!applied) {
            showResolvedFavicon(img);
          }
          return true;
        }
      }
      if (typeof optionsForRestore.removeFallbackNode === 'function') {
        optionsForRestore.removeFallbackNode(img);
      }
      if (typeof optionsForRestore.onFailed === 'function') {
        optionsForRestore.onFailed();
      } else if (typeof optionsForRestore.applyFallbackIcon === 'function') {
        optionsForRestore.applyFallbackIcon(img);
      }
      return false;
    }

    function attachFaviconData(img, url, hostOverride, pageUrl) {
      if (!img || !url) {
        return;
      }
      const sourceUrl = String(url || '').trim();
      const cached = faviconDataCache.get(url);
      if (cached) {
        if (!isCurrentFaviconSource(img, sourceUrl)) {
          return;
        }
        setFaviconSrcWithAnimation(img, cached, { sourceUrl });
        preloadThemeFromFavicon(url, cached, hostOverride);
        return;
      }
      requestFaviconData(url, pageUrl).then((dataUrl) => {
        if (!dataUrl || !isCurrentFaviconSource(img, sourceUrl)) {
          return;
        }
        setFaviconSrcWithAnimation(img, dataUrl, { sourceUrl });
        preloadThemeFromFavicon(url, dataUrl, hostOverride);
      });
    }

    function preloadIcon(url) {
      if (!url || url.startsWith('data:') || iconPreloadCache.has(url) || isBlockedLocalFaviconUrl(url)) {
        return;
      }
      const host = getHostFromUrl(url);
      if (host && shouldBlockFaviconForHost(host)) {
        return;
      }
      const img = createImage();
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.src = url;
      setBoundedCacheEntry(iconPreloadCache, url, img, iconPreloadCacheMaxEntries);
    }

    function warmIconCache(list) {
      if (!Array.isArray(list)) {
        return;
      }
      list.forEach((item) => {
        if (!item) {
          return;
        }
        const skipType = item.type === 'browserPage' ||
          item.type === 'directUrl' ||
          item.type === 'newtab' ||
          item.type === 'googleSuggest';
        if (item.favicon && !skipType) {
          preloadIcon(item.favicon);
          const hostKey = item && item.url ? getHostFromUrl(item.url) : '';
          requestFaviconData(item.favicon).then((dataUrl) => {
            if (dataUrl) {
              preloadThemeFromFavicon(item.favicon, dataUrl, hostKey);
            }
          });
        }
        const hostKeyForTheme = item && item.url ? getHostFromUrl(item.url) : '';
        if (hostKeyForTheme && !hasThemeForHost(hostKeyForTheme)) {
          const themeIcon = getThemeFaviconUrl(hostKeyForTheme, item);
          if (themeIcon) {
            requestFaviconData(themeIcon).then((dataUrl) => {
              if (dataUrl) {
                preloadThemeFromFavicon(themeIcon, dataUrl, hostKeyForTheme);
              }
            });
          }
        }
      });
    }

    function dedupeFaviconCandidateUrls(urls) {
      const unique = [];
      const seen = new Set();
      (urls || []).forEach((item) => {
        const value = String(item || '').trim();
        if (!value || seen.has(value)) {
          return;
        }
        seen.add(value);
        unique.push(value);
      });
      return unique;
    }

    return Object.freeze({
      createImage,
      setFallbackNodeVisible,
      setFaviconLoadState,
      applyFaviconOpticalShift,
      applyFaviconOpticalAlignment,
      cacheFaviconData,
      requestFaviconData,
      setFaviconSrcWithAnimation,
      canReuseCurrentFavicon,
      getLastWorkingFaviconSrc,
      restoreWorkingFaviconOrFallback,
      attachFaviconData,
      preloadIcon,
      warmIconCache,
      dedupeFaviconCandidateUrls,
      detectDefaultExtensionFavicon
    });
  }

  return Object.freeze({
    createFaviconViewCore
  });
});
