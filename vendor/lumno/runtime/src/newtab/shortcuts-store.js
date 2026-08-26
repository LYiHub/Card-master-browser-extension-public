(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabShortcutsStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const DEFAULT_SHORTCUTS_KEY = '_x_extension_newtab_shortcuts_2026_unique_';
  const DEFAULT_MAX_SHORTCUTS = 20;
  const DEFAULT_SHORTCUTS = Object.freeze([]);

  function defaultNormalizeHost(hostname) {
    return String(hostname || '').trim().toLowerCase().replace(/^www\./i, '');
  }

  function getNormalizeHost(options) {
    return options && typeof options.normalizeHost === 'function'
      ? options.normalizeHost
      : defaultNormalizeHost;
  }

  function sanitizeDisplayText(text, options) {
    const value = options && typeof options.sanitizeDisplayText === 'function'
      ? options.sanitizeDisplayText(text)
      : text;
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function getMaxShortcuts(options) {
    const raw = Number(options && options.maxShortcuts);
    return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : DEFAULT_MAX_SHORTCUTS;
  }

  function stableHashCode(text) {
    const value = String(text || '');
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function normalizeShortcutUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }
      if (!parsed.hostname) {
        return '';
      }
      return parsed.toString();
    } catch (error) {
      return '';
    }
  }

  function createShortcutId(url, options) {
    const now = Number.isFinite(Number(options && options.now))
      ? Math.max(0, Math.floor(Number(options.now)))
      : Date.now();
    return `shortcut-${now}-${stableHashCode(url)}`;
  }

  function normalizeShortcutItem(item, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const source = item && typeof item === 'object' ? item : {};
    const url = normalizeShortcutUrl(source.url);
    if (!url) {
      return null;
    }
    const normalizeHost = getNormalizeHost(opts);
    let host = '';
    try {
      host = normalizeHost(new URL(url).hostname);
    } catch (error) {
      host = '';
    }
    const rawTitle = sanitizeDisplayText(source.title || source.name || '', opts);
    const title = rawTitle || host || url;
    const now = Number.isFinite(Number(opts.now))
      ? Math.max(0, Math.floor(Number(opts.now)))
      : Date.now();
    const createdAt = Math.max(0, Number(source.createdAt) || now);
    const updatedAt = Math.max(createdAt, Math.max(0, Number(source.updatedAt) || now));
    const id = sanitizeDisplayText(source.id || '', opts) || createShortcutId(url, opts);
    return {
      id,
      title,
      url,
      host,
      createdAt,
      updatedAt
    };
  }

  function createShortcutRecord(input, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const now = Number.isFinite(Number(opts.now))
      ? Math.max(0, Math.floor(Number(opts.now)))
      : Date.now();
    return normalizeShortcutItem({
      ...(input || {}),
      createdAt: now,
      updatedAt: now
    }, {
      ...opts,
      now
    });
  }

  function normalizeShortcuts(items, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const maxShortcuts = getMaxShortcuts(opts);
    if (!Array.isArray(items) || maxShortcuts <= 0) {
      return [];
    }
    const normalized = [];
    const seenUrls = new Set();
    for (let i = 0; i < items.length; i += 1) {
      const item = normalizeShortcutItem(items[i], opts);
      if (!item || seenUrls.has(item.url)) {
        continue;
      }
      seenUrls.add(item.url);
      normalized.push(item);
      if (normalized.length >= maxShortcuts) {
        break;
      }
    }
    return normalized;
  }

  function getDefaultShortcuts(options) {
    const opts = options && typeof options === 'object' ? options : {};
    return normalizeShortcuts(DEFAULT_SHORTCUTS, opts);
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

  function loadShortcuts(storage, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = opts.key || DEFAULT_SHORTCUTS_KEY;
    return storageGet(storage, key).then((result) => {
      const hasStoredValue = Boolean(
        result &&
        Object.prototype.hasOwnProperty.call(result, key) &&
        typeof result[key] !== 'undefined'
      );
      return hasStoredValue
        ? normalizeShortcuts(result[key], opts)
        : getDefaultShortcuts(opts);
    });
  }

  function saveShortcuts(storage, items, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = opts.key || DEFAULT_SHORTCUTS_KEY;
    const normalized = normalizeShortcuts(items, opts);
    return storageSet(storage, { [key]: normalized }).then(() => normalized);
  }

  function saveShortcut(storage, input, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = opts.key || DEFAULT_SHORTCUTS_KEY;
    return loadShortcuts(storage, opts).then((items) => {
      const nextShortcut = createShortcutRecord(input, opts);
      if (!nextShortcut) {
        return items;
      }
      const withoutDuplicate = items.filter((item) => item && item.url !== nextShortcut.url);
      const maxShortcuts = getMaxShortcuts(opts);
      const nextItems = withoutDuplicate.concat(nextShortcut);
      const savedItems = maxShortcuts > 0 && nextItems.length <= maxShortcuts
        ? nextItems
        : items;
      return storageSet(storage, { [key]: savedItems }).then(() => savedItems);
    });
  }

  return {
    DEFAULT_SHORTCUTS_KEY,
    DEFAULT_MAX_SHORTCUTS,
    DEFAULT_SHORTCUTS,
    normalizeShortcutUrl,
    normalizeShortcutItem,
    createShortcutRecord,
    normalizeShortcuts,
    getDefaultShortcuts,
    loadShortcuts,
    saveShortcuts,
    saveShortcut
  };
});
