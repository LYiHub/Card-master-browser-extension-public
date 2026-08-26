(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabBookmarksStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const BOOKMARKS_BAR_TITLES = new Set([
    'bookmarks bar',
    '书签栏',
    '書籤列',
    '書籤欄'
  ]);

  function defaultNormalizeHost(hostname) {
    return String(hostname || '').trim().toLowerCase().replace(/^www\./i, '');
  }

  function getNormalizeHost(options) {
    return options && typeof options.normalizeHost === 'function'
      ? options.normalizeHost
      : defaultNormalizeHost;
  }

  function findBookmarksBarNode(treeNodes) {
    if (!Array.isArray(treeNodes)) {
      return null;
    }
    for (let i = 0; i < treeNodes.length; i += 1) {
      const root = treeNodes[i];
      const rootChildren = Array.isArray(root && root.children) ? root.children : [];
      const directMatch = rootChildren.find((child) => String(child && child.id || '') === '1');
      if (directMatch) {
        return directMatch;
      }
      for (let j = 0; j < rootChildren.length; j += 1) {
        const child = rootChildren[j];
        const title = String(child && child.title || '').toLowerCase();
        if (BOOKMARKS_BAR_TITLES.has(title)) {
          return child;
        }
      }
    }
    return null;
  }

  function findFirstUrlInFolder(node) {
    if (!node) {
      return '';
    }
    const directUrl = node && node.url ? String(node.url) : '';
    if (directUrl) {
      return directUrl;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (let i = 0; i < children.length; i += 1) {
      const nested = findFirstUrlInFolder(children[i]);
      if (nested) {
        return nested;
      }
    }
    return '';
  }

  function collectFolderUrls(node, limit, collected, seen) {
    if (!node || collected.length >= limit) {
      return;
    }
    const nodeUrl = node && node.url ? String(node.url) : '';
    if (nodeUrl && !seen.has(nodeUrl)) {
      seen.add(nodeUrl);
      collected.push(nodeUrl);
      if (collected.length >= limit) {
        return;
      }
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (let i = 0; i < children.length; i += 1) {
      collectFolderUrls(children[i], limit, collected, seen);
      if (collected.length >= limit) {
        break;
      }
    }
  }

  function buildBookmarkNodeMap(nodes) {
    const nodeMap = new Map();
    const walk = (node, parentId, index) => {
      if (!node) {
        return;
      }
      const nodeId = String(node.id || '');
      if (nodeId) {
        node.parentId = node.parentId || parentId || '';
        if (typeof node.index !== 'number') {
          node.index = Number.isFinite(index) ? index : 0;
        }
        nodeMap.set(nodeId, node);
      }
      const children = Array.isArray(node.children) ? node.children : [];
      for (let i = 0; i < children.length; i += 1) {
        walk(children[i], nodeId, i);
      }
    };
    const rootNodes = Array.isArray(nodes) ? nodes : [];
    for (let i = 0; i < rootNodes.length; i += 1) {
      walk(rootNodes[i], '', i);
    }
    return nodeMap;
  }

  function buildBookmarkItemsFromChildren(children, options) {
    const normalizeHost = getNormalizeHost(options);
    const items = Array.isArray(children) ? children : [];
    const results = [];
    // Bookmark cards are identity-based: separate browser nodes may intentionally
    // share a URL and must remain visible after cross-folder moves.
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item) {
        continue;
      }
      const title = String(item.title || '').trim();
      const url = item.url ? String(item.url) : '';
      const itemChildren = Array.isArray(item.children) ? item.children : [];
      if (url) {
        let host = '';
        try {
          host = normalizeHost(new URL(url).hostname);
        } catch (error) {
          host = '';
        }
        results.push({
          id: String(item.id || ''),
          type: 'bookmark',
          parentId: String(item.parentId || ''),
          index: typeof item.index === 'number' ? item.index : index,
          title,
          url,
          host,
          themeUrl: url
        });
        continue;
      }
      const themeUrl = findFirstUrlInFolder(item);
      const previewUrls = [];
      collectFolderUrls(item, 4, previewUrls, new Set());
      let host = '';
      if (themeUrl) {
        try {
          host = normalizeHost(new URL(themeUrl).hostname);
        } catch (error) {
          host = '';
        }
      }
      results.push({
        id: String(item.id || ''),
        type: 'folder',
        parentId: String(item.parentId || ''),
        index: typeof item.index === 'number' ? item.index : index,
        title,
        url: '',
        host,
        childCount: itemChildren.length,
        themeUrl,
        previewUrls
      });
    }
    return results;
  }

  function cacheBookmarkFolderItems(node, folderItemsCache, options) {
    if (!node) {
      return;
    }
    const nodeId = String(node.id || '');
    const children = Array.isArray(node.children) ? node.children : [];
    if (nodeId) {
      folderItemsCache.set(nodeId, buildBookmarkItemsFromChildren(children, options));
    }
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (!child) {
        continue;
      }
      const childChildren = Array.isArray(child.children) ? child.children : [];
      if (childChildren.length > 0) {
        cacheBookmarkFolderItems(child, folderItemsCache, options);
      }
    }
  }

  function buildBookmarkFolderCache(nodes, options) {
    const nodeMap = buildBookmarkNodeMap(nodes);
    const rootNode = findBookmarksBarNode(nodes);
    const folderItemsCache = new Map();
    if (rootNode) {
      cacheBookmarkFolderItems(rootNode, folderItemsCache, options);
    }
    return {
      rootNode,
      rootFolderId: rootNode ? String(rootNode.id || '1') : '1',
      nodeMap,
      folderItemsCache
    };
  }

  function buildBookmarkFolderPath(folderId, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const nodeMap = opts.nodeMap instanceof Map ? opts.nodeMap : new Map();
    const rootId = String(opts.rootId || '1');
    const rootTitle = String(opts.rootTitle || 'Bookmarks');
    const targetId = String(folderId || rootId);
    const path = [{ id: rootId, title: rootTitle }];
    if (targetId === rootId) {
      return path;
    }
    const chain = [];
    let cursor = nodeMap.get(targetId);
    let guard = 0;
    while (cursor && guard < 64) {
      const cursorId = String(cursor.id || '');
      if (!cursorId || cursorId === rootId) {
        break;
      }
      chain.push({
        id: cursorId,
        title: String(cursor.title || '').trim() || rootTitle
      });
      const parentId = String(cursor.parentId || '');
      cursor = parentId ? nodeMap.get(parentId) : null;
      guard += 1;
    }
    chain.reverse().forEach((item) => path.push(item));
    return path;
  }

  function getBookmarkPageItems(items, page, limit) {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }
    const pageLimit = Math.max(0, Number(limit) || 0);
    if (pageLimit <= 0) {
      return [];
    }
    const pageCount = Math.max(1, Math.ceil(items.length / pageLimit));
    const safePage = Math.min(Math.max(0, Number(page) || 0), pageCount - 1);
    const start = safePage * pageLimit;
    return items.slice(start, start + pageLimit);
  }

  function shouldApplyBookmarkCacheHydration(snapshot, current) {
    const snapshotLoadToken = Number(snapshot && snapshot.loadToken);
    const currentLoadToken = Number(current && current.loadToken);
    if (!Number.isFinite(snapshotLoadToken) || !Number.isFinite(currentLoadToken)) {
      return false;
    }
    if (snapshotLoadToken !== currentLoadToken) {
      return false;
    }
    return !(Boolean(current && current.loadedOnce) && current && current.dataDirty === false);
  }

  return Object.freeze({
    BOOKMARKS_BAR_TITLES,
    findBookmarksBarNode,
    findFirstUrlInFolder,
    collectFolderUrls,
    buildBookmarkNodeMap,
    buildBookmarkItemsFromChildren,
    buildBookmarkFolderCache,
    buildBookmarkFolderPath,
    getBookmarkPageItems,
    shouldApplyBookmarkCacheHydration
  });
});
