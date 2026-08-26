(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabBookmarkMoveHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function normalizeLocation(location) {
    if (!location || !location.parentId) {
      return null;
    }
    return {
      parentId: String(location.parentId),
      index: Math.max(0, Math.round(Number(location.index) || 0))
    };
  }

  function isFolderInsideBookmark(nodeMap, bookmarkId, targetFolderId) {
    if (!(nodeMap instanceof Map)) {
      return false;
    }
    const sourceId = String(bookmarkId || '');
    let cursorId = String(targetFolderId || '');
    let guard = 0;
    while (cursorId && guard < 128) {
      if (cursorId === sourceId) {
        return true;
      }
      const node = nodeMap.get(cursorId);
      cursorId = node && node.parentId ? String(node.parentId) : '';
      guard += 1;
    }
    return false;
  }

  function canMoveBookmarkToFolder(options) {
    const config = options && typeof options === 'object' ? options : {};
    const bookmarkId = String(config.bookmarkId || '');
    const sourceParentId = String(config.sourceParentId || '');
    const targetFolderId = String(config.targetFolderId || '');
    if (!bookmarkId || !sourceParentId || !targetFolderId) {
      return false;
    }
    if (bookmarkId === targetFolderId || sourceParentId === targetFolderId) {
      return false;
    }
    return !isFolderInsideBookmark(config.nodeMap, bookmarkId, targetFolderId);
  }

  function normalizeMoveDestinationIndex(options) {
    const config = options && typeof options === 'object' ? options : {};
    const sourceParentId = String(config.sourceParentId || '');
    const targetParentId = String(config.targetParentId || '');
    const sourceIndex = Math.max(0, Math.round(Number(config.sourceIndex) || 0));
    let targetIndex = Math.max(0, Math.round(Number(config.targetIndex) || 0));
    if (sourceParentId && sourceParentId === targetParentId && sourceIndex < targetIndex) {
      targetIndex -= 1;
    }
    return targetIndex;
  }

  function getMoveApiDestinationIndex(options) {
    const config = options && typeof options === 'object' ? options : {};
    const sourceParentId = String(config.sourceParentId || '');
    const targetParentId = String(config.targetParentId || '');
    const sourceIndex = Math.max(0, Math.round(Number(config.sourceIndex) || 0));
    let targetIndex = Math.max(0, Math.round(Number(config.targetIndex) || 0));
    if (sourceParentId && sourceParentId === targetParentId && sourceIndex < targetIndex) {
      targetIndex += 1;
    }
    return targetIndex;
  }

  function canMoveBookmarkToLocation(options) {
    const config = options && typeof options === 'object' ? options : {};
    const bookmarkId = String(config.bookmarkId || '');
    const sourceParentId = String(config.sourceParentId || '');
    const targetParentId = String(config.targetParentId || '');
    const sourceIndex = Math.max(0, Math.round(Number(config.sourceIndex) || 0));
    if (!bookmarkId || !sourceParentId || !targetParentId ||
        bookmarkId === targetParentId ||
        isFolderInsideBookmark(config.nodeMap, bookmarkId, targetParentId)) {
      return false;
    }
    const destinationIndex = normalizeMoveDestinationIndex({
      sourceParentId,
      sourceIndex,
      targetParentId,
      targetIndex: config.targetIndex
    });
    return sourceParentId !== targetParentId || destinationIndex !== sourceIndex;
  }

  function createMoveRecord(options) {
    const config = options && typeof options === 'object' ? options : {};
    const bookmarkId = String(config.bookmarkId || '');
    const from = normalizeLocation(config.from);
    const to = normalizeLocation(config.to);
    if (!bookmarkId || !from || !to) {
      return null;
    }
    return Object.freeze({
      bookmarkId,
      title: String(config.title || ''),
      from: Object.freeze(from),
      to: Object.freeze(to)
    });
  }

  function cloneBookmarkSnapshot(node) {
    if (!node || typeof node !== 'object') {
      return null;
    }
    const title = String(node.title || '');
    const url = node.url ? String(node.url) : '';
    const children = Array.isArray(node.children)
      ? node.children.map(cloneBookmarkSnapshot).filter(Boolean)
      : [];
    return Object.freeze({
      title,
      url,
      children: Object.freeze(children)
    });
  }

  function createDeleteRecord(options) {
    const config = options && typeof options === 'object' ? options : {};
    const bookmarkId = String(config.bookmarkId || '');
    const parentId = String(config.parentId || '');
    const index = Math.max(0, Math.round(Number(config.index) || 0));
    const snapshot = cloneBookmarkSnapshot(config.snapshot);
    if (!bookmarkId || !parentId || !snapshot) {
      return null;
    }
    return Object.freeze({
      kind: 'delete',
      bookmarkId,
      title: String(config.title || snapshot.title || ''),
      parentId,
      index,
      snapshot,
      runtime: {
        currentBookmarkId: ''
      }
    });
  }

  function normalizeHistoryRecord(record) {
    if (record && record.kind === 'delete') {
      return createDeleteRecord(record);
    }
    return createMoveRecord(record);
  }

  function createBookmarkMoveHistory(options) {
    const config = options && typeof options === 'object' ? options : {};
    const maxEntries = Math.max(1, Math.round(Number(config.maxEntries) || 30));
    const undoStack = [];
    const redoStack = [];

    function push(record) {
      const normalized = normalizeHistoryRecord(record);
      if (!normalized) {
        return false;
      }
      undoStack.push(normalized);
      if (undoStack.length > maxEntries) {
        undoStack.splice(0, undoStack.length - maxEntries);
      }
      redoStack.length = 0;
      return true;
    }

    function peekUndo() {
      return undoStack[undoStack.length - 1] || null;
    }

    function peekRedo() {
      return redoStack[redoStack.length - 1] || null;
    }

    function commitUndo() {
      const record = undoStack.pop() || null;
      if (record) {
        redoStack.push(record);
      }
      return record;
    }

    function commitRedo() {
      const record = redoStack.pop() || null;
      if (record) {
        undoStack.push(record);
      }
      return record;
    }

    function clear() {
      undoStack.length = 0;
      redoStack.length = 0;
    }

    return Object.freeze({
      push,
      peekUndo,
      peekRedo,
      commitUndo,
      commitRedo,
      clear,
      canUndo: () => undoStack.length > 0,
      canRedo: () => redoStack.length > 0
    });
  }

  return Object.freeze({
    canMoveBookmarkToLocation,
    canMoveBookmarkToFolder,
    cloneBookmarkSnapshot,
    createDeleteRecord,
    createBookmarkMoveHistory,
    createMoveRecord,
    getMoveApiDestinationIndex,
    isFolderInsideBookmark,
    normalizeMoveDestinationIndex,
    normalizeLocation
  });
});
