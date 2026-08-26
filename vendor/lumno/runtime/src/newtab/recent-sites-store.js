(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabRecentSitesStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const DEFAULT_PINNED_KEY = '_x_extension_newtab_pinned_recent_sites_2026_unique_';
  const DEFAULT_HIDDEN_KEY = '_x_extension_newtab_hidden_recent_sites_2026_unique_';
  const DEFAULT_MAX_PINNED = 3;
  const DEFAULT_MAX_HIDDEN = 60;

  function normalizeRecentCount(value) {
    const parsed = Number.parseInt(value, 10);
    if (parsed === 0 || parsed === 4 || parsed === 8) {
      return parsed;
    }
    return 4;
  }

  function defaultNormalizeHost(hostname) {
    return String(hostname || '').trim().toLowerCase().replace(/^www\./i, '');
  }

  function getNormalizeHost(options) {
    return options && typeof options.normalizeHost === 'function'
      ? options.normalizeHost
      : defaultNormalizeHost;
  }

  function getCanonicalPageUrl(url, options) {
    if (options && typeof options.getCanonicalPageUrlForFavicon === 'function') {
      return options.getCanonicalPageUrlForFavicon(url) || String(url || '');
    }
    return String(url || '');
  }

  function getHostFromUrl(url, options) {
    const normalizeHost = getNormalizeHost(options);
    try {
      return normalizeHost(new URL(getCanonicalPageUrl(url, options)).hostname);
    } catch (error) {
      return '';
    }
  }

  function sanitizeDisplayText(text, options) {
    if (options && typeof options.sanitizeDisplayText === 'function') {
      return options.sanitizeDisplayText(text);
    }
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function getSiteDisplayName(host, title, options) {
    if (options && typeof options.getSiteDisplayName === 'function') {
      return options.getSiteDisplayName(host, title);
    }
    return host || title || '';
  }

  function shouldExcludeUrl(url, options) {
    return Boolean(
      options &&
      typeof options.shouldExcludeUrl === 'function' &&
      options.shouldExcludeUrl(url)
    );
  }

  function getRecentSiteUrlKey(item) {
    if (!item || !item.url) {
      return '';
    }
    return String(item.url).trim();
  }

  function getRecentSiteHostKey(item, options) {
    if (!item) {
      return '';
    }
    const normalizeHost = getNormalizeHost(options);
    const rawHost = item.host || getHostFromUrl(item.url || '', options);
    return normalizeHost(rawHost || '');
  }

  function normalizeRecentSiteItem(item, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const ignoreBlacklist = opts.ignoreBlacklist === true;
    if (!item || !item.url) {
      return null;
    }
    const url = String(item.url).trim();
    if (!url || (!ignoreBlacklist && shouldExcludeUrl(url, opts))) {
      return null;
    }
    const host = getRecentSiteHostKey(item, opts);
    const title = sanitizeDisplayText(item.title || item.siteName || host || url, opts);
    const siteName = sanitizeDisplayText(
      item.siteName || getSiteDisplayName(host, title, opts) || host || title || url,
      opts
    );
    return {
      title,
      url,
      host,
      siteName,
      lastVisitTime: Number(item.lastVisitTime) || 0,
      visitCount: Number(item.visitCount) || 0,
      pinnedAt: Number(item.pinnedAt) || 0
    };
  }

  function isSameRecentSite(a, b, options) {
    const aUrlKey = getRecentSiteUrlKey(a);
    const bUrlKey = getRecentSiteUrlKey(b);
    if (aUrlKey && bUrlKey && aUrlKey === bUrlKey) {
      return true;
    }
    const aHostKey = getRecentSiteHostKey(a, options);
    const bHostKey = getRecentSiteHostKey(b, options);
    return Boolean(aHostKey && bHostKey && aHostKey === bHostKey);
  }

  function normalizePinnedRecentSites(items, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const maxPinned = Number.isFinite(Number(opts.maxPinned))
      ? Math.max(0, Number(opts.maxPinned))
      : DEFAULT_MAX_PINNED;
    if (!Array.isArray(items) || maxPinned <= 0) {
      return [];
    }
    const normalized = [];
    for (let i = 0; i < items.length; i += 1) {
      const nextItem = normalizeRecentSiteItem(items[i], {
        ...opts,
        ignoreBlacklist: true
      });
      if (!nextItem) {
        continue;
      }
      const duplicated = normalized.some((existingItem) =>
        isSameRecentSite(existingItem, nextItem, opts)
      );
      if (duplicated) {
        continue;
      }
      normalized.push(nextItem);
      if (normalized.length >= maxPinned) {
        break;
      }
    }
    return normalized;
  }

  function normalizeHiddenRecentSiteEntry(item) {
    if (!item) {
      return null;
    }
    const url = typeof item === 'string'
      ? String(item).trim()
      : String(item.url || '').trim();
    if (!url) {
      return null;
    }
    const lastVisitTime = typeof item === 'string'
      ? 0
      : Math.max(0, Number(item.lastVisitTime) || 0);
    return {
      url,
      lastVisitTime,
      hiddenAt: Math.max(0, Number(item.hiddenAt) || Date.now())
    };
  }

  function normalizeHiddenRecentSites(items, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const maxHidden = Number.isFinite(Number(opts.maxHidden))
      ? Math.max(0, Number(opts.maxHidden))
      : DEFAULT_MAX_HIDDEN;
    if (!Array.isArray(items) || maxHidden <= 0) {
      return [];
    }
    const normalized = [];
    for (let i = 0; i < items.length; i += 1) {
      const entry = normalizeHiddenRecentSiteEntry(items[i]);
      if (!entry) {
        continue;
      }
      const duplicatedIndex = normalized.findIndex((existingItem) => existingItem.url === entry.url);
      if (duplicatedIndex >= 0) {
        normalized[duplicatedIndex] = entry.lastVisitTime >= normalized[duplicatedIndex].lastVisitTime
          ? entry
          : normalized[duplicatedIndex];
        continue;
      }
      normalized.push(entry);
      if (normalized.length >= maxHidden) {
        break;
      }
    }
    return normalized;
  }

  function isRecentSiteHidden(item, hiddenSites) {
    const key = getRecentSiteUrlKey(item);
    if (!key || !Array.isArray(hiddenSites)) {
      return false;
    }
    const entry = hiddenSites.find((candidate) => candidate && candidate.url === key);
    if (!entry) {
      return false;
    }
    const lastVisitTime = Math.max(0, Number(item && item.lastVisitTime) || 0);
    return lastVisitTime <= entry.lastVisitTime;
  }

  function storageGet(storage, key) {
    return new Promise((resolve) => {
      if (!storage || typeof storage.get !== 'function') {
        resolve({});
        return;
      }
      storage.get([key], (result) => {
        resolve(result || {});
      });
    });
  }

  function storageSet(storage, value) {
    return new Promise((resolve) => {
      if (!storage || typeof storage.set !== 'function') {
        resolve();
        return;
      }
      storage.set(value, () => resolve());
    });
  }

  function loadPinnedRecentSites(storage, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = opts.key || DEFAULT_PINNED_KEY;
    return storageGet(storage, key).then((result) =>
      normalizePinnedRecentSites(result && result[key], opts)
    );
  }

  function savePinnedRecentSites(storage, items, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = opts.key || DEFAULT_PINNED_KEY;
    const normalized = normalizePinnedRecentSites(items, opts);
    return storageSet(storage, { [key]: normalized }).then(() => normalized);
  }

  function loadHiddenRecentSites(storage, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = opts.key || DEFAULT_HIDDEN_KEY;
    return storageGet(storage, key).then((result) =>
      normalizeHiddenRecentSites(result && result[key], opts)
    );
  }

  function saveHiddenRecentSites(storage, items, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = opts.key || DEFAULT_HIDDEN_KEY;
    const normalized = normalizeHiddenRecentSites(items, opts);
    return storageSet(storage, { [key]: normalized }).then(() => normalized);
  }

  function normalizeSourceItem(item, source, options) {
    if (!item) {
      return null;
    }
    if (source === 'tabs') {
      if (item.incognito === true) {
        return null;
      }
      const url = item.url ? String(item.url) : '';
      if (!url) {
        return null;
      }
      const host = getHostFromUrl(url, options);
      return normalizeRecentSiteItem({
        title: item.title || host,
        url,
        host,
        lastVisitTime: Number(item.lastAccessed) || 0
      }, options);
    }
    const url = item.url ? String(item.url) : '';
    if (!url) {
      return null;
    }
    const host = getHostFromUrl(url, options);
    return normalizeRecentSiteItem({
      title: item.title || host,
      url,
      host,
      lastVisitTime: Number(item.lastVisitTime) || 0,
      visitCount: Number(item.visitCount) || 0
    }, options);
  }

  function appendSourceItems(target, seenHosts, items, source, limit, options) {
    const list = Array.isArray(items) ? items : [];
    for (let i = 0; i < list.length; i += 1) {
      if (target.length >= limit) {
        break;
      }
      const normalized = normalizeSourceItem(list[i], source, options);
      if (!normalized || !normalized.host || seenHosts.has(normalized.host)) {
        continue;
      }
      seenHosts.add(normalized.host);
      target.push(normalized);
    }
  }

  function shouldPrioritizeTabUrl(url, options) {
    return Boolean(
      options &&
      typeof options.shouldPrioritizeTabUrl === 'function' &&
      options.shouldPrioritizeTabUrl(url)
    );
  }

  function mergeRecentSitesWithPinned(items, pinned, hidden, limit, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const maxItems = Math.max(0, Number(limit) || 0);
    if (maxItems <= 0) {
      return [];
    }
    const merged = [];
    const hiddenSites = normalizeHiddenRecentSites(hidden, opts);
    const appendUnique = (item, isPinned) => {
      const normalized = normalizeRecentSiteItem(item, {
        ...opts,
        ignoreBlacklist: Boolean(isPinned)
      });
      if (!normalized || isRecentSiteHidden(normalized, hiddenSites)) {
        return;
      }
      const duplicated = merged.some((existingItem) =>
        isSameRecentSite(existingItem, normalized, opts)
      );
      if (duplicated) {
        return;
      }
      normalized._xPinned = Boolean(isPinned);
      merged.push(normalized);
    };
    normalizePinnedRecentSites(pinned, opts).forEach((item) => appendUnique(item, true));
    (Array.isArray(items) ? items : []).forEach((item) => appendUnique(item, false));
    return merged.slice(0, maxItems);
  }

  function mergeRecentSiteSources(input) {
    const options = input && typeof input === 'object' ? input : {};
    const limit = Math.max(0, Number(options.limit) || 0);
    if (limit <= 0) {
      return [];
    }
    const candidateLimit = Math.max(limit, Number(options.candidateLimit) || limit);
    const mode = options.mode === 'most' ? 'most' : 'latest';
    const results = [];
    const seenHosts = new Set();
    const tabCandidates = (Array.isArray(options.tabs) ? options.tabs : [])
      .slice()
      .sort((a, b) => (Number(b && b.lastAccessed) || 0) - (Number(a && a.lastAccessed) || 0));
    const priorityTabCandidates = tabCandidates.filter((item) =>
      shouldPrioritizeTabUrl(item && item.url, options)
    );
    appendSourceItems(results, seenHosts, priorityTabCandidates, 'tabs', candidateLimit, options);
    if (mode === 'most') {
      appendSourceItems(results, seenHosts, options.topSites, 'topSites', candidateLimit, options);
      if (results.length === 0) {
        appendSourceItems(results, seenHosts, options.historyItems, 'history', candidateLimit, options);
        appendSourceItems(results, seenHosts, options.topSites, 'topSites', candidateLimit, options);
      }
    } else {
      appendSourceItems(results, seenHosts, options.historyItems, 'history', candidateLimit, options);
      appendSourceItems(results, seenHosts, options.topSites, 'topSites', candidateLimit, options);
    }
    appendSourceItems(results, seenHosts, tabCandidates, 'tabs', candidateLimit, options);
    return mergeRecentSitesWithPinned(
      results,
      options.pinned,
      options.hidden,
      limit,
      options
    );
  }

  return Object.freeze({
    DEFAULT_PINNED_KEY,
    DEFAULT_HIDDEN_KEY,
    DEFAULT_MAX_PINNED,
    DEFAULT_MAX_HIDDEN,
    normalizeRecentCount,
    normalizeRecentSiteItem,
    normalizePinnedRecentSites,
    normalizeHiddenRecentSiteEntry,
    normalizeHiddenRecentSites,
    loadPinnedRecentSites,
    savePinnedRecentSites,
    loadHiddenRecentSites,
    saveHiddenRecentSites,
    getRecentSiteUrlKey,
    getRecentSiteHostKey,
    isSameRecentSite,
    isRecentSiteHidden,
    mergeRecentSitesWithPinned,
    mergeRecentSiteSources
  });
});
