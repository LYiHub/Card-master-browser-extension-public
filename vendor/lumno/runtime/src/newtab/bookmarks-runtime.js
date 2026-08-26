(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabBookmarksRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const BOOKMARK_EVENT_NAMES = Object.freeze([
    'onCreated',
    'onRemoved',
    'onChanged',
    'onMoved',
    'onChildrenReordered',
    'onImportEnded'
  ]);
  const CONTROLLED_MUTATION_EVENT_NAMES = new Set([
    'onCreated',
    'onRemoved',
    'onChanged',
    'onMoved',
    'onChildrenReordered'
  ]);
  const HISTORY_INVALIDATING_EVENT_NAMES = new Set([
    'onCreated',
    'onRemoved',
    'onMoved',
    'onChildrenReordered',
    'onImportEnded'
  ]);
  const CASCADE_REFRESH_EVENT_NAMES = new Set([
    'onChanged',
    'onMoved',
    'onChildrenReordered'
  ]);

  function getDefaultBookmarksStore() {
    return typeof globalThis !== 'undefined'
      ? globalThis.LumnoNewtabBookmarksStore
      : null;
  }

  function getDefaultChromeApi() {
    return typeof chrome !== 'undefined' ? chrome : null;
  }

  function createBookmarksRuntime(options) {
    const config = options && typeof options === 'object' ? options : {};
    const chromeApi = config.chromeApi || getDefaultChromeApi();
    const bookmarksApi = chromeApi && chromeApi.bookmarks ? chromeApi.bookmarks : null;
    const store = config.store || getDefaultBookmarksStore() || {};
    const normalizeHost = typeof config.normalizeHost === 'function'
      ? config.normalizeHost
      : undefined;
    const fallbackRootId = String(config.fallbackRootId || '1');
    const listeners = new Set();
    const eventBindings = [];
    let nodeMap = new Map();
    let folderItemsCache = new Map();
    let rootFolderId = fallbackRootId;
    let ready = false;
    let dirty = true;
    let loadingPromise = null;
    let cacheGeneration = 0;
    let controlledMutationDepth = 0;
    let controlledMutationEventDirty = false;

    function getLastError() {
      return chromeApi && chromeApi.runtime ? chromeApi.runtime.lastError : null;
    }

    function getErrorMessage(fallback) {
      const lastError = getLastError();
      return String((lastError && lastError.message) || fallback);
    }

    function getSnapshot() {
      return Object.freeze({
        rootFolderId,
        ready,
        dirty,
        nodeMap,
        folderItemsCache
      });
    }

    function invalidate() {
      cacheGeneration += 1;
      ready = false;
      dirty = true;
      nodeMap = new Map();
      folderItemsCache = new Map();
      loadingPromise = null;
      return getSnapshot();
    }

    function rebuild(nodes) {
      if (typeof store.buildBookmarkFolderCache !== 'function') {
        return false;
      }
      const cache = store.buildBookmarkFolderCache(nodes, { normalizeHost });
      const rootNode = cache && cache.rootNode ? cache.rootNode : null;
      if (!rootNode) {
        ready = false;
        return false;
      }
      nodeMap = cache.nodeMap instanceof Map ? cache.nodeMap : new Map();
      folderItemsCache = cache.folderItemsCache instanceof Map
        ? cache.folderItemsCache
        : new Map();
      rootFolderId = String(cache.rootFolderId || rootNode.id || fallbackRootId);
      ready = true;
      dirty = false;
      return true;
    }

    function ensureReady(forceReload) {
      if (!bookmarksApi || typeof bookmarksApi.getTree !== 'function') {
        return Promise.resolve(false);
      }
      if (forceReload) {
        invalidate();
      }
      if (ready && !dirty) {
        return Promise.resolve(true);
      }
      if (loadingPromise) {
        return loadingPromise;
      }
      const requestGeneration = cacheGeneration;
      let requestPromise = null;
      requestPromise = new Promise((resolve) => {
        bookmarksApi.getTree((nodes) => {
          const isCurrentRequest = requestGeneration === cacheGeneration;
          let loaded = false;
          if (isCurrentRequest &&
              !getLastError() &&
              Array.isArray(nodes) &&
              nodes.length > 0) {
            loaded = rebuild(nodes);
          }
          if (isCurrentRequest && !loaded) {
            nodeMap = new Map();
            folderItemsCache = new Map();
            ready = false;
          }
          if (loadingPromise === requestPromise) {
            loadingPromise = null;
          }
          resolve(isCurrentRequest && loaded);
        });
      });
      loadingPromise = requestPromise;
      return requestPromise;
    }

    function getRootFolderId() {
      return rootFolderId;
    }

    function getNode(id) {
      const nodeId = String(id || '');
      return nodeId ? (nodeMap.get(nodeId) || null) : null;
    }

    function getNodeMap() {
      return nodeMap;
    }

    function getFolderItems(folderId) {
      const id = String(folderId || '');
      const items = id ? folderItemsCache.get(id) : null;
      return Array.isArray(items) ? items : [];
    }

    function getFolderPath(folderId, rootTitle) {
      if (typeof store.buildBookmarkFolderPath !== 'function') {
        return [{
          id: rootFolderId,
          title: String(rootTitle || 'Bookmarks')
        }];
      }
      return store.buildBookmarkFolderPath(folderId, {
        nodeMap,
        rootId: rootFolderId,
        rootTitle: String(rootTitle || 'Bookmarks')
      });
    }

    async function readFolder(folderId, options) {
      const readOptions = options && typeof options === 'object' ? options : {};
      const loaded = await ensureReady(Boolean(readOptions.force));
      const rootTitle = String(readOptions.rootTitle || 'Bookmarks');
      if (!loaded) {
        return Object.freeze({
          ready: false,
          rootFolderId,
          folderId: rootFolderId,
          path: [{ id: rootFolderId, title: rootTitle }],
          items: []
        });
      }
      const requestedId = String(folderId || rootFolderId);
      const targetNode = getNode(requestedId) || getNode(rootFolderId);
      const resolvedFolderId = String((targetNode && targetNode.id) || rootFolderId);
      const items = getFolderItems(resolvedFolderId);
      const parsedLimit = Number.parseInt(readOptions.limit, 10);
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 0;
      return Object.freeze({
        ready: true,
        rootFolderId,
        folderId: resolvedFolderId,
        path: getFolderPath(resolvedFolderId, rootTitle),
        items: limit > 0 ? items.slice(0, limit) : items.slice()
      });
    }

    function move(bookmarkId, destination) {
      return new Promise((resolve, reject) => {
        const id = String(bookmarkId || '');
        if (!bookmarksApi || typeof bookmarksApi.move !== 'function' || !id || !destination) {
          reject(new Error('Chrome bookmarks.move is unavailable.'));
          return;
        }
        const moveDestination = {
          parentId: String(destination.parentId || '')
        };
        if (Number.isFinite(Number(destination.index))) {
          moveDestination.index = Math.max(0, Math.round(Number(destination.index)));
        }
        bookmarksApi.move(id, moveDestination, (node) => {
          if (getLastError()) {
            reject(new Error(getErrorMessage('Failed to move bookmark.')));
            return;
          }
          resolve(node);
        });
      });
    }

    function update(bookmarkId, changes) {
      return new Promise((resolve, reject) => {
        const id = String(bookmarkId || '');
        const rawChanges = changes && typeof changes === 'object' ? changes : {};
        const updateChanges = {};
        if (Object.prototype.hasOwnProperty.call(rawChanges, 'title')) {
          updateChanges.title = String(rawChanges.title || '');
        }
        if (Object.prototype.hasOwnProperty.call(rawChanges, 'url')) {
          updateChanges.url = String(rawChanges.url || '');
        }
        if (!bookmarksApi || typeof bookmarksApi.update !== 'function' || !id ||
            Object.keys(updateChanges).length === 0) {
          reject(new Error('Chrome bookmarks.update is unavailable.'));
          return;
        }
        bookmarksApi.update(id, updateChanges, (node) => {
          if (getLastError()) {
            reject(new Error(getErrorMessage('Failed to update bookmark.')));
            return;
          }
          resolve(node);
        });
      });
    }

    function remove(bookmarkId, options) {
      return new Promise((resolve, reject) => {
        const id = String(bookmarkId || '');
        const removeOptions = options && typeof options === 'object' ? options : {};
        const removeMethod = removeOptions.recursive
          ? bookmarksApi && bookmarksApi.removeTree
          : bookmarksApi && bookmarksApi.remove;
        if (!bookmarksApi || typeof removeMethod !== 'function' || !id) {
          reject(new Error('Chrome bookmark removal is unavailable.'));
          return;
        }
        removeMethod.call(bookmarksApi, id, () => {
          if (getLastError()) {
            reject(new Error(getErrorMessage('Failed to delete bookmark.')));
            return;
          }
          resolve(true);
        });
      });
    }

    function create(details) {
      return new Promise((resolve, reject) => {
        if (!bookmarksApi || typeof bookmarksApi.create !== 'function') {
          reject(new Error('Chrome bookmarks.create is unavailable.'));
          return;
        }
        bookmarksApi.create(details, (node) => {
          if (getLastError()) {
            reject(new Error(getErrorMessage('Failed to restore bookmark.')));
            return;
          }
          resolve(node);
        });
      });
    }

    async function restore(snapshot, options) {
      const restoreOptions = options && typeof options === 'object' ? options : {};
      const parentId = String(restoreOptions.parentId || '');
      if (!snapshot || !parentId) {
        throw new Error('Bookmark restore snapshot is incomplete.');
      }
      const details = {
        parentId,
        index: Math.max(0, Math.round(Number(restoreOptions.index) || 0)),
        title: String(snapshot.title || '')
      };
      if (snapshot.url) {
        details.url = String(snapshot.url);
      }
      const createdNode = await create(details);
      const createdId = String((createdNode && createdNode.id) || '');
      if (!createdId) {
        throw new Error('Chrome did not return the restored bookmark id.');
      }
      if (!snapshot.url && Array.isArray(snapshot.children)) {
        for (let childIndex = 0; childIndex < snapshot.children.length; childIndex += 1) {
          await restore(snapshot.children[childIndex], {
            parentId: createdId,
            index: childIndex
          });
        }
      }
      return createdNode;
    }

    function runControlledMutation(task) {
      if (typeof task !== 'function') {
        return Promise.reject(new TypeError('A bookmark mutation task is required.'));
      }
      if (controlledMutationDepth === 0) {
        controlledMutationEventDirty = false;
      }
      controlledMutationDepth += 1;
      return Promise.resolve()
        .then(task)
        .finally(() => {
          controlledMutationDepth = Math.max(0, controlledMutationDepth - 1);
          if (controlledMutationDepth === 0) {
            controlledMutationEventDirty = false;
          }
        });
    }

    function notifyChange(eventName, args) {
      const isControlled = controlledMutationDepth > 0 &&
        CONTROLLED_MUTATION_EVENT_NAMES.has(eventName);
      if (isControlled && controlledMutationEventDirty) {
        return;
      }
      if (isControlled) {
        controlledMutationEventDirty = true;
      }
      invalidate();
      const change = Object.freeze({
        eventName,
        args: Array.isArray(args) ? args : [],
        isControlled,
        invalidatesHistory: HISTORY_INVALIDATING_EVENT_NAMES.has(eventName),
        shouldRefreshCascade: CASCADE_REFRESH_EVENT_NAMES.has(eventName)
      });
      listeners.forEach((listener) => {
        try {
          listener(change);
        } catch (error) {
          console.warn('[Lumno] Bookmark change listener failed', error);
        }
      });
    }

    function bindEvents() {
      if (!bookmarksApi || eventBindings.length > 0) {
        return;
      }
      BOOKMARK_EVENT_NAMES.forEach((eventName) => {
        const eventTarget = bookmarksApi[eventName];
        if (!eventTarget || typeof eventTarget.addListener !== 'function') {
          return;
        }
        const handler = (...args) => {
          notifyChange(eventName, args);
        };
        eventTarget.addListener(handler);
        eventBindings.push({ eventTarget, handler });
      });
    }

    function unbindEvents() {
      eventBindings.splice(0).forEach(({ eventTarget, handler }) => {
        if (eventTarget && typeof eventTarget.removeListener === 'function') {
          eventTarget.removeListener(handler);
        }
      });
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return function noop() {};
      }
      listeners.add(listener);
      bindEvents();
      let active = true;
      return function unsubscribe() {
        if (!active) {
          return;
        }
        active = false;
        listeners.delete(listener);
        if (listeners.size === 0) {
          unbindEvents();
        }
      };
    }

    function destroy() {
      listeners.clear();
      unbindEvents();
      invalidate();
    }

    return Object.freeze({
      ensureReady,
      readFolder,
      getSnapshot,
      getRootFolderId,
      getNode,
      getNodeMap,
      getFolderItems,
      getFolderPath,
      invalidate,
      move,
      update,
      remove,
      create,
      restore,
      runControlledMutation,
      subscribe,
      destroy
    });
  }

  return Object.freeze({
    BOOKMARK_EVENT_NAMES,
    createBookmarksRuntime
  });
});
