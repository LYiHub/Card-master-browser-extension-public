(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabBookmarkDrag = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const DEFAULT_PREVIEW_POINTER_GAP_PX = 10;
  const DEFAULT_PREVIEW_VIEWPORT_EDGE_PX = 8;
  const DEFAULT_GRID_INSERTION_HIT_ZONE_PX = 8;
  const DEFAULT_GRID_COLUMN_GAP_PX = 12;

  function getAttribute(element, name) {
    return element && typeof element.getAttribute === 'function'
      ? element.getAttribute(name)
      : null;
  }

  function hasClass(element, className) {
    return Boolean(
      element &&
      element.classList &&
      typeof element.classList.contains === 'function' &&
      element.classList.contains(className)
    );
  }

  function getRectCenterY(rect) {
    const centerY = Number(rect && rect.centerY);
    if (Number.isFinite(centerY)) {
      return centerY;
    }
    const top = Number(rect && rect.top);
    const height = Number(rect && rect.height);
    return Number.isFinite(top) && Number.isFinite(height)
      ? top + (height / 2)
      : NaN;
  }

  function getLayoutItemIndex(layoutItem) {
    const card = layoutItem && layoutItem.card;
    const bookmarkItem = card && card._xBookmarkItem;
    const attributeIndex = Number(getAttribute(card, 'data-bookmark-index'));
    const fallbackIndex = Number(bookmarkItem && bookmarkItem.index);
    return Number.isFinite(attributeIndex) ? attributeIndex : fallbackIndex;
  }

  function createSession(options) {
    const config = options && typeof options === 'object' ? options : {};
    const event = config.event && typeof config.event === 'object' ? config.event : {};
    const card = config.card || null;
    const bookmarkItem = config.bookmarkItem && typeof config.bookmarkItem === 'object'
      ? config.bookmarkItem
      : null;
    const pageIndex = Number(config.pageIndex);
    const itemIndex = bookmarkItem ? Number(bookmarkItem.index) : NaN;
    const attributeIndex = Number(getAttribute(card, 'data-bookmark-index'));
    const isFolder = typeof config.isFolder === 'boolean'
      ? config.isFolder
      : Boolean(
        (bookmarkItem && bookmarkItem.type === 'folder') ||
        hasClass(card, 'x-nt-bookmark-card--folder') ||
        hasClass(card, 'x-nt-bookmark-cascade-item--folder')
      );

    return {
      pointerId: event.pointerId,
      card,
      bookmarkId: String(config.bookmarkId || ''),
      parentId: String(config.parentId || ''),
      sourceKind: config.sourceKind === 'cascade' ? 'cascade' : 'card',
      isFolder,
      itemTitle: String(
        config.itemTitle ||
        (bookmarkItem && bookmarkItem.title) ||
        (card && card._xTitleText) ||
        ''
      ),
      originalIndex: Number.isFinite(itemIndex)
        ? itemIndex
        : Math.max(0, Number.isFinite(attributeIndex) ? attributeIndex : 0),
      originalAllItems: Array.isArray(config.allItems) ? config.allItems.slice() : [],
      originalPageCardIds: Array.isArray(config.pageCardIds)
        ? config.pageCardIds.slice()
        : [],
      originalPageIndex: Number.isFinite(pageIndex) ? pageIndex : 0,
      startX: Number(event.clientX),
      startY: Number(event.clientY),
      grabOffsetX: 0,
      grabOffsetY: 0,
      baseLeft: 0,
      baseTop: 0,
      translateX: 0,
      translateY: 0,
      pendingPointerX: Number(event.clientX),
      pendingPointerY: Number(event.clientY),
      moveFrameId: 0,
      pageIndex: Number.isFinite(pageIndex) ? pageIndex : 0,
      layoutItems: [],
      dropTarget: null,
      dragPreviewElement: null,
      dragPreviewOffsetX: 0,
      dragPreviewOffsetY: 0,
      pageSwitchTimerId: 0,
      pageSwitchDirection: 0,
      pageSwitchButton: null,
      folderSwitchTimerId: 0,
      folderSwitchTargetId: '',
      folderSwitchElement: null,
      folderSwitchPendingId: '',
      keepCascadeOpenAfterDrop: false,
      isDragging: false,
      hasReordered: false
    };
  }

  function getFolderSwitchTarget(currentFolderId, dropTarget) {
    if (!dropTarget || dropTarget.kind !== 'breadcrumb') {
      return null;
    }
    const folderId = String(dropTarget.folderId || '').trim();
    if (!folderId || folderId === String(currentFolderId || '')) {
      return null;
    }
    return {
      folderId,
      element: dropTarget.element || null
    };
  }

  function shouldKeepCascadeOpenAfterDrop(sourceKind, dropTarget) {
    return Boolean(
      sourceKind === 'cascade' &&
      dropTarget &&
      dropTarget.surface === 'cascade'
    );
  }

  function getVisualElement(state) {
    return state && state.dragPreviewElement
      ? state.dragPreviewElement
      : state && state.card
        ? state.card
        : null;
  }

  function resetPreviewFolderVisual(state, preview, options) {
    if (!state || !state.isFolder || !preview ||
        typeof preview.querySelector !== 'function') {
      return;
    }
    if (preview.classList && typeof preview.classList.remove === 'function') {
      preview.classList.remove(
        'x-nt-bookmark-card--folder-expanded',
        'x-nt-bookmark-card--hover'
      );
    }
    const folderIcon = preview.querySelector(
      '.x-nt-bookmark-icon--figma, .x-nt-bookmark-cascade-icon--folder'
    );
    if (!folderIcon) {
      return;
    }
    const config = options && typeof options === 'object' ? options : {};
    if (typeof config.renderClosedFolderIcon === 'function') {
      config.renderClosedFolderIcon({
        bookmarkId: String(state.bookmarkId || 'folder'),
        folderIcon,
        preview,
        state
      });
    }
    if (typeof folderIcon.setAttribute === 'function') {
      folderIcon.setAttribute('aria-hidden', 'true');
    }
  }

  function createPreview(state, options) {
    const config = options && typeof options === 'object' ? options : {};
    const documentObj = config.documentObj ||
      (typeof document !== 'undefined' ? document : null);
    if (!state || !state.card || !documentObj || !documentObj.body ||
        typeof state.card.cloneNode !== 'function' ||
        typeof state.card.getBoundingClientRect !== 'function') {
      return null;
    }
    const rect = state.card.getBoundingClientRect();
    const preview = state.card.cloneNode(true);
    const isCascadeSource = state.sourceKind === 'cascade';
    const isTopbarCardSource = Boolean(
      !isCascadeSource &&
      getAttribute(state.card, 'data-bookmark-view-mode') === 'top'
    );
    const previewWidth = isCascadeSource
      ? Math.min(rect.width, 196)
      : Math.min(rect.width, 208);
    preview.classList.add(
      isCascadeSource
        ? 'x-nt-bookmark-cascade-drag-preview'
        : 'x-nt-bookmark-card-drag-preview'
    );
    if (isTopbarCardSource) {
      preview.classList.add(
        'x-nt-bookmark-card-drag-preview--topbar'
      );
    }
    [
      'id',
      'data-bookmark-drop-target',
      'data-bookmark-insert-position',
      'data-bookmark-dragging',
      'data-bookmark-dropping',
      'data-bookmark-id',
      'data-bookmark-parent-id',
      'data-bookmark-index',
      'data-bookmark-draggable',
      'data-active',
      'data-bookmark-context-menu-open',
      'data-bookmark-copy-action-visible',
      'data-hover-suppressed',
      'aria-expanded'
    ].forEach((name) => preview.removeAttribute(name));
    if (preview.classList && typeof preview.classList.remove === 'function') {
      preview.classList.remove(
        'x-nt-bookmark-card--hover',
        'x-nt-bookmark-card--folder-expanded'
      );
    }
    preview.setAttribute('aria-hidden', 'true');
    preview.setAttribute('data-bookmark-drag-preview', 'true');
    preview.tabIndex = -1;
    if (typeof preview.querySelectorAll === 'function') {
      preview.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
      preview.querySelectorAll(
        '.x-nt-bookmark-copy-action, .x-nt-bookmark-cascade-copy-trigger'
      ).forEach((element) => {
        if (element && typeof element.remove === 'function') {
          element.remove();
        }
      });
    }
    resetPreviewFolderVisual(state, preview, config);
    preview.style.left = `${rect.left}px`;
    preview.style.top = `${rect.top}px`;
    preview.style.width = `${previewWidth}px`;
    preview.style.height = `${rect.height}px`;
    preview.style.willChange = 'transform';
    documentObj.body.appendChild(preview);
    state.dragPreviewElement = preview;
    state.baseLeft = rect.left;
    state.baseTop = rect.top;
    state.grabOffsetX = Math.min(18, Math.max(0, previewWidth / 2));
    state.grabOffsetY = Math.min(16, Math.max(0, rect.height / 2));
    state.dragPreviewOffsetX = 10;
    state.dragPreviewOffsetY = 8;
    return preview;
  }

  function removePreview(state) {
    if (!state || !state.dragPreviewElement) {
      return;
    }
    const preview = state.dragPreviewElement;
    state.dragPreviewElement = null;
    if (preview.parentNode) {
      preview.parentNode.removeChild(preview);
    }
  }

  function getFloatingPreviewPosition(options) {
    const config = options && typeof options === 'object' ? options : {};
    const pointerX = Number(config.pointerX);
    const pointerY = Number(config.pointerY);
    const previewWidth = Math.max(0, Number(config.previewWidth) || 0);
    const previewHeight = Math.max(0, Number(config.previewHeight) || 0);
    const viewportWidth = Math.max(0, Number(config.viewportWidth) || 0);
    const viewportHeight = Math.max(0, Number(config.viewportHeight) || 0);
    const pointerGapPx = Number.isFinite(Number(config.pointerGapPx))
      ? Math.max(0, Number(config.pointerGapPx))
      : DEFAULT_PREVIEW_POINTER_GAP_PX;
    const viewportEdgePx = Number.isFinite(Number(config.viewportEdgePx))
      ? Math.max(0, Number(config.viewportEdgePx))
      : DEFAULT_PREVIEW_VIEWPORT_EDGE_PX;
    let left = pointerX + pointerGapPx;
    let top = pointerY + pointerGapPx;
    if (left + previewWidth > viewportWidth - viewportEdgePx) {
      left = pointerX - previewWidth - pointerGapPx;
    }
    if (top + previewHeight > viewportHeight - viewportEdgePx) {
      top = pointerY - previewHeight - pointerGapPx;
    }
    left = Math.max(
      viewportEdgePx,
      Math.min(left, viewportWidth - previewWidth - viewportEdgePx)
    );
    top = Math.max(
      viewportEdgePx,
      Math.min(top, viewportHeight - previewHeight - viewportEdgePx)
    );
    return { left, top };
  }

  function updateVisualPosition(state, pointerX, pointerY, options) {
    const visualElement = getVisualElement(state);
    if (!state || !visualElement || !visualElement.style) {
      return null;
    }
    const baseLeft = Number(state.baseLeft) || 0;
    const baseTop = Number(state.baseTop) || 0;
    let nextX = pointerX - state.grabOffsetX - baseLeft +
      (Number(state.dragPreviewOffsetX) || 0);
    let nextY = pointerY - state.grabOffsetY - baseTop +
      (Number(state.dragPreviewOffsetY) || 0);
    if (state.dragPreviewElement === visualElement) {
      const config = options && typeof options === 'object' ? options : {};
      const windowObj = config.windowObj ||
        (typeof window !== 'undefined' ? window : null);
      const position = getFloatingPreviewPosition({
        pointerX,
        pointerY,
        previewWidth: visualElement.offsetWidth || 0,
        previewHeight: visualElement.offsetHeight || 0,
        viewportWidth: windowObj ? windowObj.innerWidth : 0,
        viewportHeight: windowObj ? windowObj.innerHeight : 0,
        pointerGapPx: config.pointerGapPx,
        viewportEdgePx: config.viewportEdgePx
      });
      nextX = position.left - baseLeft;
      nextY = position.top - baseTop;
      state.translateX = nextX;
      state.translateY = nextY;
      visualElement.style.transition = 'none';
      visualElement.style.left = `${position.left}px`;
      visualElement.style.top = `${position.top}px`;
      visualElement.style.transform = 'translate3d(0, 0, 0)';
      return position;
    }
    state.translateX = nextX;
    state.translateY = nextY;
    visualElement.style.transition = 'none';
    visualElement.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
    return { left: baseLeft + nextX, top: baseTop + nextY };
  }

  function isPointInsideElement(element, pointerX, pointerY) {
    if (!element || typeof element.getBoundingClientRect !== 'function' ||
        !Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return pointerX >= rect.left && pointerX <= rect.right &&
      pointerY >= rect.top && pointerY <= rect.bottom;
  }

  function getGridInsertionTarget(options) {
    const config = options && typeof options === 'object' ? options : {};
    const gridElement = config.gridElement || null;
    const pointerX = Number(config.pointerX);
    const pointerY = Number(config.pointerY);
    if (!gridElement || typeof gridElement.getBoundingClientRect !== 'function' ||
        !Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
      return null;
    }
    const layoutItems = Array.isArray(config.layoutItems) ? config.layoutItems : [];
    const isCrossPageDrag = config.isCrossPageDrag === true;
    const pageLastItemIndex = layoutItems.reduce((lastIndex, item) => {
      const itemIndex = getLayoutItemIndex(item);
      return Number.isFinite(itemIndex) ? Math.max(lastIndex, itemIndex) : lastIndex;
    }, -1);
    const gridRect = gridElement.getBoundingClientRect();
    const computedColumnGap = Number.parseFloat(config.columnGap);
    const columnGap = Number.isFinite(computedColumnGap)
      ? Math.max(0, computedColumnGap)
      : DEFAULT_GRID_COLUMN_GAP_PX;
    const hitZonePx = Number.isFinite(Number(config.hitZonePx))
      ? Math.max(0, Number(config.hitZonePx))
      : DEFAULT_GRID_INSERTION_HIT_ZONE_PX;
    const horizontalHitPadding = (columnGap / 2) + hitZonePx;
    if (pointerX < gridRect.left - horizontalHitPadding ||
        pointerX > gridRect.right + horizontalHitPadding ||
        pointerY < gridRect.top ||
        pointerY > gridRect.bottom) {
      return null;
    }
    if (!layoutItems.length) {
      return {
        kind: 'insertion',
        folderId: String(config.folderId || ''),
        index: 0,
        element: gridElement,
        markerElement: gridElement,
        markerPosition: 'before',
        markerOffsetPx: 4,
        markerTopPx: 8,
        markerHeightPx: Math.max(2, gridRect.height - 16),
        surface: 'grid'
      };
    }
    const rowHitItems = layoutItems.filter((item) =>
      item && item.rect &&
      pointerY >= item.rect.top && pointerY <= item.rect.bottom
    );
    if (!rowHitItems.length) {
      return null;
    }
    let nearestItem = rowHitItems[0];
    let nearestDistance = Math.abs(pointerY - getRectCenterY(nearestItem.rect));
    rowHitItems.forEach((item) => {
      const verticalDistance = Math.abs(pointerY - getRectCenterY(item.rect));
      if (verticalDistance < nearestDistance) {
        nearestDistance = verticalDistance;
        nearestItem = item;
      }
    });
    const rowCenterY = getRectCenterY(nearestItem.rect);
    const rowCards = layoutItems
      .filter((item) => {
        const itemCenterY = getRectCenterY(item && item.rect);
        return item && item.rect &&
          Number.isFinite(itemCenterY) &&
          Math.abs(itemCenterY - rowCenterY) <=
            Math.max(8, Math.min(item.rect.height, nearestItem.rect.height) / 2);
      })
      .sort((first, second) => first.rect.left - second.rect.left);
    const boundaries = [];
    const firstItem = rowCards[0];
    const lastItem = rowCards[rowCards.length - 1];
    if (firstItem) {
      boundaries.push({
        x: firstItem.rect.left - (columnGap / 2),
        anchorItem: firstItem,
        markerPosition: 'before'
      });
    }
    for (let itemIndex = 1; itemIndex < rowCards.length; itemIndex += 1) {
      const previousItem = rowCards[itemIndex - 1];
      const nextItem = rowCards[itemIndex];
      boundaries.push({
        x: (previousItem.rect.right + nextItem.rect.left) / 2,
        anchorItem: nextItem,
        markerPosition: 'before'
      });
    }
    if (lastItem) {
      boundaries.push({
        x: lastItem.rect.right + (columnGap / 2),
        anchorItem: lastItem,
        markerPosition: 'after'
      });
    }
    let nearestBoundary = null;
    let nearestBoundaryDistance = Infinity;
    boundaries.forEach((boundary) => {
      const distance = Math.abs(pointerX - boundary.x);
      if (distance < nearestBoundaryDistance) {
        nearestBoundary = boundary;
        nearestBoundaryDistance = distance;
      }
    });
    if (!nearestBoundary || nearestBoundaryDistance > hitZonePx) {
      return null;
    }
    const anchorItem = nearestBoundary.anchorItem;
    const anchorCard = anchorItem && anchorItem.card;
    if (!anchorCard) {
      return null;
    }
    const itemIndex = getLayoutItemIndex(anchorItem);
    if (!Number.isFinite(itemIndex)) {
      return null;
    }
    const markerPosition = nearestBoundary.markerPosition;
    const isPageStartBoundary = markerPosition === 'before' &&
      itemIndex === Number(config.pageStartIndex);
    const isPageEndBoundary = markerPosition === 'after' &&
      itemIndex === pageLastItemIndex;
    if (isCrossPageDrag && isPageEndBoundary) {
      return null;
    }
    return {
      kind: 'insertion',
      folderId: String(config.folderId || ''),
      index: itemIndex + (markerPosition === 'after' ? 1 : 0),
      element: anchorCard,
      markerElement: gridElement,
      markerPosition,
      markerOffsetPx: nearestBoundary.x - gridRect.left,
      markerTopPx: anchorItem.rect.top - gridRect.top + 8,
      markerHeightPx: Math.max(2, anchorItem.rect.height - 16),
      isPageStartBoundary,
      preservePageSlot: isCrossPageDrag,
      surface: 'grid'
    };
  }

  return Object.freeze({
    DEFAULT_GRID_INSERTION_HIT_ZONE_PX,
    DEFAULT_PREVIEW_POINTER_GAP_PX,
    DEFAULT_PREVIEW_VIEWPORT_EDGE_PX,
    createPreview,
    createSession,
    getFolderSwitchTarget,
    getFloatingPreviewPosition,
    getGridInsertionTarget,
    getVisualElement,
    isPointInsideElement,
    removePreview,
    resetPreviewFolderVisual,
    shouldKeepCascadeOpenAfterDrop,
    updateVisualPosition
  });
});
