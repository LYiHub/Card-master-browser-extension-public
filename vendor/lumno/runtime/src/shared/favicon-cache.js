(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoFaviconCache = api;
  root.LumnoNewtabFaviconCache = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  const DEFAULTS = Object.freeze({
    faviconPersistStorageKey: '_x_extension_favicon_url_cache_2024_unique_',
    faviconPersistTtlMs: 1000 * 60 * 60 * 24 * 14,
    faviconPersistMaxEntries: 800,
    faviconDataPersistStorageKey: '_x_extension_favicon_data_cache_2024_unique_',
    faviconDataPersistMaxEntries: 220,
    faviconDataPersistMaxLength: 96000,
    siteThemePersistStorageKey: '_x_extension_site_theme_cache_2026_unique_',
    siteThemePersistTtlMs: 1000 * 60 * 60 * 24 * 30,
    siteThemePersistMaxEntries: 800,
    faviconVisitDirtyStorageKey: '_x_extension_favicon_visit_dirty_2026_unique_',
    faviconVisitDirtyTtlMs: 1000 * 60 * 60 * 24,
    faviconVisitDirtyMaxEntries: 600,
    faviconCacheBootWaitMs: 120
  });

  function createFaviconCache(options) {
    const config = options || {};
    const storageArea = config.storageArea || null;
    const windowObj = config.windowObj || root.window || root;
    const normalizeFaviconHost = typeof config.normalizeFaviconHost === 'function'
      ? config.normalizeFaviconHost
      : ((value) => String(value || '').toLowerCase().replace(/^www\./i, ''));
    const isBlockedLocalFaviconUrl = typeof config.isBlockedLocalFaviconUrl === 'function'
      ? config.isBlockedLocalFaviconUrl
      : (() => false);
    const isChromeMonogramFaviconUrl = typeof config.isChromeMonogramFaviconUrl === 'function'
      ? config.isChromeMonogramFaviconUrl
      : ((url) => /^chrome:\/\/favicon2\//i.test(String(url || '').trim()));

    const faviconPersistStorageKey = config.faviconPersistStorageKey || DEFAULTS.faviconPersistStorageKey;
    const faviconPersistTtlMs = Number.isFinite(config.faviconPersistTtlMs)
      ? config.faviconPersistTtlMs
      : DEFAULTS.faviconPersistTtlMs;
    const faviconPersistMaxEntries = Number.isFinite(config.faviconPersistMaxEntries)
      ? config.faviconPersistMaxEntries
      : DEFAULTS.faviconPersistMaxEntries;
    const faviconDataPersistStorageKey = config.faviconDataPersistStorageKey || DEFAULTS.faviconDataPersistStorageKey;
    const faviconDataPersistMaxEntries = Number.isFinite(config.faviconDataPersistMaxEntries)
      ? config.faviconDataPersistMaxEntries
      : DEFAULTS.faviconDataPersistMaxEntries;
    const faviconDataPersistMaxLength = Number.isFinite(config.faviconDataPersistMaxLength)
      ? config.faviconDataPersistMaxLength
      : DEFAULTS.faviconDataPersistMaxLength;
    const siteThemePersistStorageKey = config.siteThemePersistStorageKey || DEFAULTS.siteThemePersistStorageKey;
    const siteThemePersistTtlMs = Number.isFinite(config.siteThemePersistTtlMs)
      ? config.siteThemePersistTtlMs
      : DEFAULTS.siteThemePersistTtlMs;
    const siteThemePersistMaxEntries = Number.isFinite(config.siteThemePersistMaxEntries)
      ? config.siteThemePersistMaxEntries
      : DEFAULTS.siteThemePersistMaxEntries;
    const faviconVisitDirtyStorageKey = config.faviconVisitDirtyStorageKey || DEFAULTS.faviconVisitDirtyStorageKey;
    const faviconVisitDirtyTtlMs = Number.isFinite(config.faviconVisitDirtyTtlMs)
      ? config.faviconVisitDirtyTtlMs
      : DEFAULTS.faviconVisitDirtyTtlMs;
    const faviconVisitDirtyMaxEntries = Number.isFinite(config.faviconVisitDirtyMaxEntries)
      ? config.faviconVisitDirtyMaxEntries
      : DEFAULTS.faviconVisitDirtyMaxEntries;
    const faviconCacheBootWaitMs = Number.isFinite(config.faviconCacheBootWaitMs)
      ? config.faviconCacheBootWaitMs
      : DEFAULTS.faviconCacheBootWaitMs;

    const faviconPersistCache = new Map();
    const faviconDataPersistCache = new Map();
    const siteThemePersistCache = new Map();
    const faviconVisitDirtyCache = new Map();
    let faviconPersistLoaded = false;
    let faviconPersistLoadPromise = null;
    let faviconPersistWriteTimer = null;
    let faviconDataPersistLoaded = false;
    let faviconDataPersistLoadPromise = null;
    let faviconDataPersistWriteTimer = null;
    let siteThemePersistLoaded = false;
    let siteThemePersistLoadPromise = null;
    let siteThemePersistWriteTimer = null;
    let faviconVisitDirtyLoaded = false;
    let faviconVisitDirtyLoadPromise = null;

    function getValidFaviconPersistEntries(rawEntries) {
      const now = Date.now();
      const input = rawEntries && typeof rawEntries === 'object' ? rawEntries : {};
      const valid = [];
      Object.keys(input).forEach((key) => {
        const item = input[key];
        if (!item || typeof item !== 'object') {
          return;
        }
        const url = String(item.url || '').trim();
        const updatedAt = Number(item.updatedAt || 0);
        if (!key || !url || !Number.isFinite(updatedAt)) {
          return;
        }
        if (now - updatedAt > faviconPersistTtlMs) {
          return;
        }
        if (url.startsWith('data:') || isBlockedLocalFaviconUrl(url) || isChromeMonogramFaviconUrl(url)) {
          return;
        }
        valid.push({ key, url, updatedAt });
      });
      valid.sort((a, b) => b.updatedAt - a.updatedAt);
      return valid.slice(0, faviconPersistMaxEntries);
    }

    function isValidDataUrlIcon(value) {
      const raw = String(value || '');
      if (!raw || raw.length > faviconDataPersistMaxLength) {
        return false;
      }
      return /^data:image\/(?:png|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|jpeg|jpg);base64,/i.test(raw);
    }

    function getValidFaviconDataPersistEntries(rawEntries) {
      const now = Date.now();
      const input = rawEntries && typeof rawEntries === 'object' ? rawEntries : {};
      const valid = [];
      Object.keys(input).forEach((key) => {
        const item = input[key];
        if (!item || typeof item !== 'object') {
          return;
        }
        const dataUrl = String(item.dataUrl || '').trim();
        const updatedAt = Number(item.updatedAt || 0);
        if (!key || !isValidDataUrlIcon(dataUrl) || !Number.isFinite(updatedAt)) {
          return;
        }
        if (now - updatedAt > faviconPersistTtlMs) {
          return;
        }
        valid.push({ key, dataUrl, updatedAt });
      });
      valid.sort((a, b) => b.updatedAt - a.updatedAt);
      return valid.slice(0, faviconDataPersistMaxEntries);
    }

    function normalizeAccentRgb(value) {
      if (!Array.isArray(value) || value.length !== 3) {
        return null;
      }
      const rgb = value.map((channel) => Math.round(Number(channel)));
      if (!rgb.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
        return null;
      }
      return rgb;
    }

    function normalizeThemeSource(value) {
      const source = String(value || '').trim().toLowerCase();
      if (
        source === 'brand' ||
        source === 'mask-icon' ||
        source === 'meta' ||
        source === 'manifest' ||
        source === 'favicon'
      ) {
        return source;
      }
      return '';
    }

    function isNeutralThemeColor(rgb) {
      const channels = normalizeAccentRgb(rgb);
      if (!channels) {
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

    function normalizeThemeConfidence(value, accentRgb) {
      const confidence = String(value || '').trim().toLowerCase();
      if (confidence === 'color' || confidence === 'neutral') {
        return confidence;
      }
      return isNeutralThemeColor(accentRgb) ? 'neutral' : 'color';
    }

    function getValidSiteThemePersistEntries(rawEntries) {
      const now = Date.now();
      const input = rawEntries && typeof rawEntries === 'object' ? rawEntries : {};
      const valid = [];
      Object.keys(input).forEach((key) => {
        const item = input[key];
        if (!item || typeof item !== 'object') {
          return;
        }
        const accentRgb = normalizeAccentRgb(item.accentRgb);
        const source = normalizeThemeSource(item.source);
        const confidence = normalizeThemeConfidence(item.confidence, accentRgb);
        const neutral = typeof item.neutral === 'boolean'
          ? item.neutral
          : confidence === 'neutral';
        const updatedAt = Number(item.updatedAt || 0);
        if (!key || !accentRgb || !source || !Number.isFinite(updatedAt)) {
          return;
        }
        if (now - updatedAt > siteThemePersistTtlMs) {
          return;
        }
        valid.push({ key, accentRgb, source, neutral, confidence, updatedAt });
      });
      valid.sort((a, b) => b.updatedAt - a.updatedAt);
      return valid.slice(0, siteThemePersistMaxEntries);
    }

    function getValidFaviconVisitDirtyEntries(rawEntries) {
      const now = Date.now();
      const input = rawEntries && typeof rawEntries === 'object' ? rawEntries : {};
      const valid = [];
      Object.keys(input).forEach((key) => {
        const updatedAt = Number(input[key] || 0);
        if (!key || !Number.isFinite(updatedAt)) {
          return;
        }
        if (now - updatedAt > faviconVisitDirtyTtlMs) {
          return;
        }
        valid.push({ key, updatedAt });
      });
      valid.sort((a, b) => b.updatedAt - a.updatedAt);
      return valid.slice(0, faviconVisitDirtyMaxEntries);
    }

    function loadFaviconPersistCache() {
      if (faviconPersistLoadPromise) {
        return faviconPersistLoadPromise;
      }
      if (!storageArea) {
        faviconPersistLoaded = true;
        faviconPersistLoadPromise = Promise.resolve();
        return faviconPersistLoadPromise;
      }
      if (faviconPersistLoaded) {
        faviconPersistLoadPromise = Promise.resolve();
        return faviconPersistLoadPromise;
      }
      faviconPersistLoadPromise = new Promise((resolve) => {
        storageArea.get([faviconPersistStorageKey], (result) => {
          const payload = result && result[faviconPersistStorageKey];
          const entries = getValidFaviconPersistEntries(payload && payload.entries ? payload.entries : null);
          entries.forEach((item) => {
            faviconPersistCache.set(item.key, { url: item.url, updatedAt: item.updatedAt });
          });
          faviconPersistLoaded = true;
          resolve();
        });
      });
      return faviconPersistLoadPromise;
    }

    function loadFaviconDataPersistCache() {
      if (faviconDataPersistLoadPromise) {
        return faviconDataPersistLoadPromise;
      }
      if (!storageArea) {
        faviconDataPersistLoaded = true;
        faviconDataPersistLoadPromise = Promise.resolve();
        return faviconDataPersistLoadPromise;
      }
      if (faviconDataPersistLoaded) {
        faviconDataPersistLoadPromise = Promise.resolve();
        return faviconDataPersistLoadPromise;
      }
      faviconDataPersistLoadPromise = new Promise((resolve) => {
        storageArea.get([faviconDataPersistStorageKey], (result) => {
          const payload = result && result[faviconDataPersistStorageKey];
          const entries = getValidFaviconDataPersistEntries(payload && payload.entries ? payload.entries : null);
          entries.forEach((item) => {
            faviconDataPersistCache.set(item.key, { dataUrl: item.dataUrl, updatedAt: item.updatedAt });
          });
          faviconDataPersistLoaded = true;
          resolve();
        });
      });
      return faviconDataPersistLoadPromise;
    }

    function loadSiteThemePersistCache() {
      if (siteThemePersistLoadPromise) {
        return siteThemePersistLoadPromise;
      }
      if (!storageArea) {
        siteThemePersistLoaded = true;
        siteThemePersistLoadPromise = Promise.resolve();
        return siteThemePersistLoadPromise;
      }
      if (siteThemePersistLoaded) {
        siteThemePersistLoadPromise = Promise.resolve();
        return siteThemePersistLoadPromise;
      }
      siteThemePersistLoadPromise = new Promise((resolve) => {
        storageArea.get([siteThemePersistStorageKey], (result) => {
          const payload = result && result[siteThemePersistStorageKey];
          const entries = getValidSiteThemePersistEntries(payload && payload.entries ? payload.entries : null);
          entries.forEach((item) => {
            siteThemePersistCache.set(item.key, {
              accentRgb: item.accentRgb,
              source: item.source,
              neutral: item.neutral,
              confidence: item.confidence,
              updatedAt: item.updatedAt
            });
          });
          siteThemePersistLoaded = true;
          resolve();
        });
      });
      return siteThemePersistLoadPromise;
    }

    function loadFaviconVisitDirtyCache() {
      if (faviconVisitDirtyLoadPromise) {
        return faviconVisitDirtyLoadPromise;
      }
      if (!storageArea) {
        faviconVisitDirtyLoaded = true;
        faviconVisitDirtyLoadPromise = Promise.resolve();
        return faviconVisitDirtyLoadPromise;
      }
      if (faviconVisitDirtyLoaded) {
        faviconVisitDirtyLoadPromise = Promise.resolve();
        return faviconVisitDirtyLoadPromise;
      }
      faviconVisitDirtyLoadPromise = new Promise((resolve) => {
        storageArea.get([faviconVisitDirtyStorageKey], (result) => {
          const payload = result && result[faviconVisitDirtyStorageKey];
          const entries = getValidFaviconVisitDirtyEntries(payload && payload.entries ? payload.entries : null);
          entries.forEach((item) => {
            faviconVisitDirtyCache.set(item.key, item.updatedAt);
          });
          faviconVisitDirtyLoaded = true;
          resolve();
        });
      });
      return faviconVisitDirtyLoadPromise;
    }

    function ensureCachesReady() {
      return Promise.all([
        loadFaviconPersistCache(),
        loadFaviconDataPersistCache(),
        loadSiteThemePersistCache(),
        loadFaviconVisitDirtyCache()
      ]).then(() => undefined).catch(() => undefined);
    }

    function waitForCachesOrTimeout(maxWaitMs) {
      const waitMs = Number.isFinite(maxWaitMs) && maxWaitMs >= 0
        ? maxWaitMs
        : faviconCacheBootWaitMs;
      return Promise.race([
        ensureCachesReady(),
        new Promise((resolve) => {
          windowObj.setTimeout(resolve, waitMs);
        })
      ]).then(() => undefined).catch(() => undefined);
    }

    function schedulePersistFaviconCache() {
      if (!storageArea) {
        return;
      }
      if (faviconPersistWriteTimer !== null) {
        return;
      }
      faviconPersistWriteTimer = windowObj.setTimeout(() => {
        faviconPersistWriteTimer = null;
        const entries = Array.from(faviconPersistCache.entries())
          .map(([key, value]) => ({
            key: String(key || ''),
            url: String(value && value.url ? value.url : ''),
            updatedAt: Number(value && value.updatedAt ? value.updatedAt : 0)
          }))
          .filter((item) => item.key && item.url && Number.isFinite(item.updatedAt))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, faviconPersistMaxEntries);
        const serialized = {};
        entries.forEach((item) => {
          serialized[item.key] = { url: item.url, updatedAt: item.updatedAt };
        });
        storageArea.set({
          [faviconPersistStorageKey]: {
            version: 1,
            entries: serialized,
            updatedAt: Date.now()
          }
        });
      }, 600);
    }

    function schedulePersistFaviconDataCache() {
      if (!storageArea) {
        return;
      }
      if (faviconDataPersistWriteTimer !== null) {
        return;
      }
      faviconDataPersistWriteTimer = windowObj.setTimeout(() => {
        faviconDataPersistWriteTimer = null;
        const entries = Array.from(faviconDataPersistCache.entries())
          .map(([key, value]) => ({
            key: String(key || ''),
            dataUrl: String(value && value.dataUrl ? value.dataUrl : ''),
            updatedAt: Number(value && value.updatedAt ? value.updatedAt : 0)
          }))
          .filter((item) => item.key && isValidDataUrlIcon(item.dataUrl) && Number.isFinite(item.updatedAt))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, faviconDataPersistMaxEntries);
        const serialized = {};
        entries.forEach((item) => {
          serialized[item.key] = { dataUrl: item.dataUrl, updatedAt: item.updatedAt };
        });
        storageArea.set({
          [faviconDataPersistStorageKey]: {
            version: 1,
            entries: serialized,
            updatedAt: Date.now()
          }
        });
      }, 600);
    }

    function schedulePersistSiteThemeCache() {
      if (!storageArea) {
        return;
      }
      if (siteThemePersistWriteTimer !== null) {
        return;
      }
      siteThemePersistWriteTimer = windowObj.setTimeout(() => {
        siteThemePersistWriteTimer = null;
        const entries = Array.from(siteThemePersistCache.entries())
          .map(([key, value]) => ({
            key: String(key || ''),
            accentRgb: normalizeAccentRgb(value && value.accentRgb),
            source: normalizeThemeSource(value && value.source),
            neutral: Boolean(value && value.neutral),
            confidence: normalizeThemeConfidence(value && value.confidence, value && value.accentRgb),
            updatedAt: Number(value && value.updatedAt ? value.updatedAt : 0)
          }))
          .filter((item) => item.key && item.accentRgb && item.source && Number.isFinite(item.updatedAt))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, siteThemePersistMaxEntries);
        const serialized = {};
        entries.forEach((item) => {
          serialized[item.key] = {
            accentRgb: item.accentRgb,
            source: item.source,
            neutral: item.neutral,
            confidence: item.confidence,
            updatedAt: item.updatedAt
          };
        });
        storageArea.set({
          [siteThemePersistStorageKey]: {
            version: 1,
            entries: serialized,
            updatedAt: Date.now()
          }
        });
      }, 600);
    }

    function persistFaviconVisitDirtyCacheSoon() {
      if (!storageArea) {
        return;
      }
      windowObj.setTimeout(() => {
        const entries = Array.from(faviconVisitDirtyCache.entries())
          .map(([key, updatedAt]) => ({
            key: String(key || ''),
            updatedAt: Number(updatedAt || 0)
          }))
          .filter((item) => item.key && Number.isFinite(item.updatedAt))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, faviconVisitDirtyMaxEntries);
        const serialized = {};
        entries.forEach((item) => {
          serialized[item.key] = item.updatedAt;
        });
        storageArea.set({
          [faviconVisitDirtyStorageKey]: {
            version: 1,
            entries: serialized,
            updatedAt: Date.now()
          }
        });
      }, 0);
    }

    function isHostVisitDirty(hostname) {
      const host = normalizeFaviconHost(hostname);
      if (!host) {
        return false;
      }
      const updatedAt = Number(faviconVisitDirtyCache.get(host) || 0);
      if (!Number.isFinite(updatedAt) || !updatedAt) {
        return false;
      }
      if (Date.now() - updatedAt > faviconVisitDirtyTtlMs) {
        faviconVisitDirtyCache.delete(host);
        persistFaviconVisitDirtyCacheSoon();
        return false;
      }
      return true;
    }

    function clearHostVisitDirty(hostname) {
      const host = normalizeFaviconHost(hostname);
      if (!host || !faviconVisitDirtyCache.has(host)) {
        return;
      }
      faviconVisitDirtyCache.delete(host);
      persistFaviconVisitDirtyCacheSoon();
    }

    function getPersistedEntry(cacheKey) {
      if (!cacheKey) {
        return null;
      }
      const cached = faviconPersistCache.get(cacheKey);
      if (!cached || !cached.url) {
        return null;
      }
      const now = Date.now();
      if (!Number.isFinite(cached.updatedAt) || now - cached.updatedAt > faviconPersistTtlMs) {
        faviconPersistCache.delete(cacheKey);
        schedulePersistFaviconCache();
        return null;
      }
      return {
        url: cached.url,
        updatedAt: cached.updatedAt
      };
    }

    function setPersistedUrl(cacheKey, url) {
      const key = String(cacheKey || '').trim();
      const nextUrl = String(url || '').trim();
      if (!key || !nextUrl || nextUrl.startsWith('data:') || isBlockedLocalFaviconUrl(nextUrl) || isChromeMonogramFaviconUrl(nextUrl)) {
        return;
      }
      faviconPersistCache.set(key, { url: nextUrl, updatedAt: Date.now() });
      if (faviconPersistCache.size > faviconPersistMaxEntries * 2) {
        const compact = Array.from(faviconPersistCache.entries())
          .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
          .slice(0, faviconPersistMaxEntries);
        faviconPersistCache.clear();
        compact.forEach(([k, v]) => faviconPersistCache.set(k, v));
      }
      schedulePersistFaviconCache();
    }

    function getPersistedDataEntry(cacheKey) {
      if (!cacheKey) {
        return null;
      }
      const cached = faviconDataPersistCache.get(cacheKey);
      if (!cached || !isValidDataUrlIcon(cached.dataUrl)) {
        return null;
      }
      const now = Date.now();
      if (!Number.isFinite(cached.updatedAt) || now - cached.updatedAt > faviconPersistTtlMs) {
        faviconDataPersistCache.delete(cacheKey);
        schedulePersistFaviconDataCache();
        return null;
      }
      return {
        dataUrl: cached.dataUrl,
        updatedAt: cached.updatedAt
      };
    }

    function setPersistedData(cacheKey, dataUrl) {
      const key = String(cacheKey || '').trim();
      const nextDataUrl = String(dataUrl || '').trim();
      if (!key || !isValidDataUrlIcon(nextDataUrl)) {
        return;
      }
      faviconDataPersistCache.set(key, { dataUrl: nextDataUrl, updatedAt: Date.now() });
      if (faviconDataPersistCache.size > faviconDataPersistMaxEntries * 2) {
        const compact = Array.from(faviconDataPersistCache.entries())
          .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
          .slice(0, faviconDataPersistMaxEntries);
        faviconDataPersistCache.clear();
        compact.forEach(([k, v]) => faviconDataPersistCache.set(k, v));
      }
      schedulePersistFaviconDataCache();
    }

    function getPersistedThemeEntry(cacheKey) {
      const key = normalizeFaviconHost(cacheKey);
      if (!key) {
        return null;
      }
      const cached = siteThemePersistCache.get(key);
      const accentRgb = cached ? normalizeAccentRgb(cached.accentRgb) : null;
      const source = cached ? normalizeThemeSource(cached.source) : '';
      const confidence = cached ? normalizeThemeConfidence(cached.confidence, accentRgb) : '';
      const neutral = cached
        ? (typeof cached.neutral === 'boolean' ? cached.neutral : confidence === 'neutral')
        : false;
      if (!cached || !accentRgb || !source) {
        return null;
      }
      const now = Date.now();
      if (!Number.isFinite(cached.updatedAt) || now - cached.updatedAt > siteThemePersistTtlMs) {
        siteThemePersistCache.delete(key);
        schedulePersistSiteThemeCache();
        return null;
      }
      return {
        accentRgb,
        source,
        neutral,
        confidence,
        updatedAt: cached.updatedAt
      };
    }

    function setPersistedThemeEntry(cacheKey, entry) {
      const key = normalizeFaviconHost(cacheKey);
      const accentRgb = normalizeAccentRgb(entry && entry.accentRgb);
      const source = normalizeThemeSource(entry && entry.source);
      const confidence = normalizeThemeConfidence(entry && entry.confidence, accentRgb);
      const neutral = typeof (entry && entry.neutral) === 'boolean'
        ? entry.neutral
        : confidence === 'neutral';
      if (!key || !accentRgb || !source) {
        return false;
      }
      const current = siteThemePersistCache.get(key);
      const currentRgb = current ? normalizeAccentRgb(current.accentRgb) : null;
      const currentSource = current ? normalizeThemeSource(current.source) : '';
      const currentConfidence = current ? normalizeThemeConfidence(current.confidence, currentRgb) : '';
      const currentNeutral = current
        ? (typeof current.neutral === 'boolean' ? current.neutral : currentConfidence === 'neutral')
        : false;
      if (
        currentRgb &&
        currentSource === source &&
        currentRgb.join(',') === accentRgb.join(',') &&
        currentNeutral === neutral &&
        currentConfidence === confidence
      ) {
        return false;
      }
      siteThemePersistCache.set(key, {
        accentRgb,
        source,
        neutral,
        confidence,
        updatedAt: Date.now()
      });
      if (siteThemePersistCache.size > siteThemePersistMaxEntries * 2) {
        const compact = Array.from(siteThemePersistCache.entries())
          .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
          .slice(0, siteThemePersistMaxEntries);
        siteThemePersistCache.clear();
        compact.forEach(([k, v]) => siteThemePersistCache.set(k, v));
      }
      schedulePersistSiteThemeCache();
      return true;
    }

    return {
      isFaviconPersistLoaded: () => faviconPersistLoaded,
      isFaviconDataPersistLoaded: () => faviconDataPersistLoaded,
      isSiteThemePersistLoaded: () => siteThemePersistLoaded,
      ensureCachesReady,
      waitForCachesOrTimeout,
      isHostVisitDirty,
      clearHostVisitDirty,
      getPersistedEntry,
      setPersistedUrl,
      getPersistedDataEntry,
      setPersistedData,
      getPersistedThemeEntry,
      setPersistedThemeEntry
    };
  }

  return {
    DEFAULTS,
    createFaviconCache
  };
});
