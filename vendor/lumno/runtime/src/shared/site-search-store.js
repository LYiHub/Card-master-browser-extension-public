(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSiteSearchStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const STORAGE_KEYS = Object.freeze({
    custom: '_x_extension_site_search_custom_2024_unique_',
    disabled: '_x_extension_site_search_disabled_2024_unique_'
  });

  function getRuntimeUrl(chromeApi, path) {
    return chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getURL === 'function'
      ? chromeApi.runtime.getURL(path)
      : path;
  }

  function getStorageValues(storageArea, keys) {
    return new Promise((resolve) => {
      if (!storageArea || typeof storageArea.get !== 'function') {
        resolve({});
        return;
      }
      let settled = false;
      const finish = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result || {});
      };
      try {
        const maybePromise = storageArea.get(keys, finish);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finish).catch(() => finish({}));
        }
      } catch (error) {
        finish({});
      }
    });
  }

  function normalizeDisabledKeys(items) {
    return Array.isArray(items)
      ? items.map((item) => String(item || '').toLowerCase()).filter(Boolean)
      : [];
  }

  function mergeProviders(baseItems, customItems, mergeCustomProviders) {
    if (typeof mergeCustomProviders === 'function') {
      return mergeCustomProviders(baseItems, customItems);
    }
    const merged = [];
    const seen = new Set();
    const baseMap = new Map((baseItems || []).map((item) => [
      String(item && item.key ? item.key : '').toLowerCase(),
      item
    ]));
    (customItems || []).forEach((item) => {
      if (item && item.disabled) {
        return;
      }
      const key = String(item && item.key ? item.key : '').toLowerCase();
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push({
        ...item,
        action: String(item.action || (baseMap.get(key) && baseMap.get(key).action) || '').trim(),
        submitStrategy: String(item.submitStrategy || (baseMap.get(key) && baseMap.get(key).submitStrategy) || '').trim(),
        _xIsCustom: true
      });
    });
    (baseItems || []).forEach((item) => {
      const key = String(item && item.key ? item.key : '').toLowerCase();
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push(item);
    });
    return merged;
  }

  function mergeStoredProviders(baseItems, customItems, disabledKeys, mergeCustomProviders) {
    const disabled = normalizeDisabledKeys(disabledKeys);
    const filteredBase = (baseItems || []).filter((item) => {
      const key = String(item && item.key ? item.key : '').toLowerCase();
      return key && !disabled.includes(key);
    });
    return mergeProviders(filteredBase, customItems, mergeCustomProviders);
  }

  function loadSiteSearchProviders(options) {
    const settings = options && typeof options === 'object' ? options : {};
    const chromeApi = settings.chromeApi;
    const storageArea = settings.storageArea || null;
    const storageKeys = settings.storageKeys || STORAGE_KEYS;
    const defaultProviders = Array.isArray(settings.defaultProviders) ? settings.defaultProviders : [];
    const mergeCustomProviders = settings.mergeCustomProviders;
    const getResourceUrl = typeof settings.getResourceUrl === 'function'
      ? settings.getResourceUrl
      : (path) => getRuntimeUrl(chromeApi, path);
    const getValues = typeof settings.getStorageValues === 'function'
      ? settings.getStorageValues
      : (keys) => getStorageValues(storageArea, keys);

    const loadLocalProviders = fetch(getResourceUrl('assets/data/site-search.json'))
      .then((response) => response.json())
      .then((data) => (data && Array.isArray(data.items) ? data.items : []))
      .catch(() => []);

    const loadCustomProviders = getValues([storageKeys.custom])
      .then((result) => (Array.isArray(result[storageKeys.custom]) ? result[storageKeys.custom] : []));

    const loadDisabledKeys = getValues([storageKeys.disabled])
      .then((result) => normalizeDisabledKeys(result[storageKeys.disabled]));

    const loadFallback = () => Promise.all([loadLocalProviders, loadCustomProviders, loadDisabledKeys])
      .then(([localItems, customItems, disabledKeys]) => {
        const baseItems = localItems.length > 0 ? localItems : defaultProviders;
        return mergeStoredProviders(baseItems, customItems, disabledKeys, mergeCustomProviders);
      });

    return new Promise((resolve) => {
      if (!chromeApi || !chromeApi.runtime || typeof chromeApi.runtime.sendMessage !== 'function') {
        loadFallback().then(resolve);
        return;
      }
      try {
        chromeApi.runtime.sendMessage({ action: 'getSiteSearchProviders' }, (response) => {
          const items = response && Array.isArray(response.items) ? response.items : [];
          if (items.length > 0) {
            resolve(items);
            return;
          }
          loadFallback().then(resolve);
        });
      } catch (error) {
        loadFallback().then(resolve);
      }
    });
  }

  return Object.freeze({
    STORAGE_KEYS,
    getStorageValues,
    normalizeDisabledKeys,
    mergeProviders,
    mergeStoredProviders,
    loadSiteSearchProviders
  });
});
