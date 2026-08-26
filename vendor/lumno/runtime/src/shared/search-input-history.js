(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchInputHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const STORAGE_KEY = '_x_extension_search_input_history_2026_unique_';
  const DEFAULT_MAX_ENTRIES = 50;
  const MAX_ENTRY_LENGTH = 4096;

  function normalizeEntry(value) {
    return String(value || '').trim().slice(0, MAX_ENTRY_LENGTH);
  }

  function normalizeEntries(value, maxEntries) {
    const limit = Number.isFinite(Number(maxEntries))
      ? Math.max(1, Math.round(Number(maxEntries)))
      : DEFAULT_MAX_ENTRIES;
    const unique = [];
    (Array.isArray(value) ? value : []).forEach((item) => {
      const entry = normalizeEntry(item);
      if (!entry) {
        return;
      }
      const existingIndex = unique.indexOf(entry);
      if (existingIndex >= 0) {
        unique.splice(existingIndex, 1);
      }
      unique.push(entry);
    });
    return unique.slice(-limit);
  }

  function getShortcutDirection(event) {
    if (!event ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey) {
      return '';
    }
    const code = String(event.code || '');
    const key = String(event.key || '');
    if (code === 'ArrowUp' || key === 'ArrowUp') {
      return 'previous';
    }
    if (code === 'ArrowDown' || key === 'ArrowDown') {
      return 'next';
    }
    return '';
  }

  function createSearchInputHistoryController(options) {
    const config = options && typeof options === 'object' ? options : {};
    const storageArea = config.storageArea || null;
    const storageChanges = config.storageChanges || null;
    const storageAreaName = config.storageAreaName || 'local';
    const storageKey = config.storageKey || STORAGE_KEY;
    const maxEntries = Number.isFinite(Number(config.maxEntries))
      ? Math.max(1, Math.round(Number(config.maxEntries)))
      : DEFAULT_MAX_ENTRIES;
    let entries = [];
    let cursor = 0;
    let draft = '';
    let hydrated = false;
    let destroyed = false;
    let loadPromise = null;
    let pendingRecords = [];
    let storageChangeListener = null;

    function resetNavigation() {
      cursor = entries.length;
      draft = '';
    }

    function replaceEntries(value) {
      entries = normalizeEntries(value, maxEntries);
      resetNavigation();
      return entries.slice();
    }

    function applyRecord(value) {
      const entry = normalizeEntry(value);
      if (!entry) {
        return '';
      }
      const next = entries.filter((item) => item !== entry);
      next.push(entry);
      entries = next.slice(-maxEntries);
      resetNavigation();
      return entry;
    }

    function persist() {
      if (!storageArea || typeof storageArea.set !== 'function' || destroyed) {
        return;
      }
      try {
        storageArea.set({ [storageKey]: entries.slice() });
      } catch (_error) {
        // Input history is best-effort and must never block search.
      }
    }

    function readStorage() {
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
          const maybePromise = storageArea.get([storageKey], finish);
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(finish).catch(() => finish({}));
          }
        } catch (_error) {
          finish({});
        }
      });
    }

    function load() {
      if (loadPromise) {
        return loadPromise;
      }
      loadPromise = readStorage().then((result) => {
        if (destroyed) {
          return entries.slice();
        }
        const queued = pendingRecords.slice();
        pendingRecords = [];
        replaceEntries(result ? result[storageKey] : []);
        queued.forEach(applyRecord);
        hydrated = true;
        if (queued.length > 0) {
          persist();
        }
        return entries.slice();
      });
      return loadPromise;
    }

    function record(value) {
      const entry = normalizeEntry(value);
      if (!entry) {
        return false;
      }
      if (!hydrated) {
        pendingRecords.push(entry);
      }
      applyRecord(entry);
      if (hydrated) {
        persist();
      } else {
        load();
      }
      return true;
    }

    function move(direction, currentValue) {
      if (entries.length === 0) {
        return { handled: false, value: String(currentValue || '') };
      }
      if (direction === 'previous') {
        if (cursor >= entries.length) {
          cursor = entries.length;
          draft = String(currentValue || '');
        }
        cursor = Math.max(0, cursor - 1);
        return { handled: true, value: entries[cursor] };
      }
      if (direction === 'next') {
        if (cursor >= entries.length) {
          return { handled: false, value: String(currentValue || '') };
        }
        if (cursor < entries.length - 1) {
          cursor += 1;
          return { handled: true, value: entries[cursor] };
        }
        cursor = entries.length;
        return { handled: true, value: draft };
      }
      return { handled: false, value: String(currentValue || '') };
    }

    function handleStorageChange(changes, areaName) {
      if (destroyed ||
          areaName !== storageAreaName ||
          !changes ||
          !Object.prototype.hasOwnProperty.call(changes, storageKey)) {
        return;
      }
      const change = changes[storageKey];
      replaceEntries(change ? change.newValue : []);
      hydrated = true;
    }

    if (storageChanges &&
        typeof storageChanges.addListener === 'function' &&
        typeof storageChanges.removeListener === 'function') {
      storageChangeListener = handleStorageChange;
      storageChanges.addListener(storageChangeListener);
    }

    load();

    return Object.freeze({
      destroy() {
        destroyed = true;
        if (storageChangeListener) {
          storageChanges.removeListener(storageChangeListener);
          storageChangeListener = null;
        }
      },
      getEntries() {
        return entries.slice();
      },
      load,
      move,
      record,
      resetNavigation
    });
  }

  return Object.freeze({
    STORAGE_KEY,
    DEFAULT_MAX_ENTRIES,
    createSearchInputHistoryController,
    getShortcutDirection,
    normalizeEntries
  });
});
