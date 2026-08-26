(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabBookmarkCascadeMenu = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const BOOKMARK_CASCADE_MENU_MIN_WIDTH_PX = 210;
  const BOOKMARK_CASCADE_MENU_MAX_WIDTH_PX = 260;
  const BOOKMARK_CASCADE_SUBMENU_GAP_PX = -8;
  const BOOKMARK_CASCADE_HOVER_DELAY_MS = 220;
  const BOOKMARK_CASCADE_CLOSE_DELAY_MS = 360;
  const BOOKMARK_CASCADE_SAFE_RECHECK_MS = 80;
  const BOOKMARK_CASCADE_SAFE_MAX_MS = 1200;
  const BOOKMARK_CASCADE_SAFE_EDGE_ZONE_PX = 90;
  const BOOKMARK_CASCADE_DRAG_OPEN_DELAY_MS = 420;
  const BOOKMARK_CASCADE_FOLDER_DROP_MIN_RATIO = 0.38;
  const BOOKMARK_CASCADE_FOLDER_DROP_MAX_RATIO = 0.62;
  const BOOKMARK_CASCADE_REORDER_ANIMATION_MS = 180;
  const BOOKMARK_CASCADE_REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

  function noop() {}

  function getOption(options, key, fallback) {
    if (options && Object.prototype.hasOwnProperty.call(options, key)) {
      return options[key];
    }
    return fallback;
  }

  function getFunction(options, key, fallback) {
    const value = getOption(options, key, fallback || noop);
    return typeof value === 'function' ? value : (fallback || noop);
  }

  function normalizeBookmarkCascadeDebugMode(value) {
    return value === true;
  }

  function createBookmarkCascadeMenuRuntime(options) {
    const config = options || {};
    const documentObj = getOption(config, 'documentObj', typeof document !== 'undefined' ? document : null);
    const windowObj = getOption(config, 'windowObj', typeof window !== 'undefined' ? window : null);
    const storageArea = getOption(config, 'storageArea', null);
    const debugStorageKey = String(getOption(config, 'debugStorageKey', '') || '');
    const positionUtils = getOption(config, 'positionUtils', {});
    const menuSurface = getOption(config, 'menuSurface', null);
    const view = getOption(config, 'view', null);
    const t = getFunction(config, 't', function(_key, fallback) {
      return fallback || '';
    });
    const sanitizeDisplayText = getFunction(config, 'sanitizeDisplayText', function(value) {
      return String(value || '');
    });
    const getHostFromUrl = getFunction(config, 'getHostFromUrl', function() {
      return '';
    });
    const getSiteDisplayName = getFunction(config, 'getSiteDisplayName', function(_host, title) {
      return title || '';
    });
    const getUrlDisplay = getFunction(config, 'getUrlDisplay', function(url) {
      return url || '';
    });
    const getRiSvg = getFunction(config, 'getRiSvg', function() {
      return '';
    });
    const getFigmaFolderSvg = getFunction(config, 'getFigmaFolderSvg', function() {
      return '';
    });
    const initFolderPathMorph = getFunction(config, 'initFolderPathMorph');
    const playFolderPathMorph = getFunction(config, 'playFolderPathMorph');
    const attachFaviconWithFallbacks = getFunction(config, 'attachFaviconWithFallbacks');
    const isLocalNetworkHost = getFunction(config, 'isLocalNetworkHost', function() {
      return false;
    });
    const getChromeFaviconUrl = getFunction(config, 'getChromeFaviconUrl', function() {
      return '';
    });
    const getBrowserPageFaviconUrl = getFunction(config, 'getBrowserPageFaviconUrl', function() {
      return '';
    });
    const ensureReady = getFunction(config, 'ensureReady', function() {
      return Promise.resolve(false);
    });
    const getItems = getFunction(config, 'getItems', function() {
      return [];
    });
    const navigateToUrl = getFunction(config, 'navigateToUrl');
    const openUrl = getFunction(config, 'openUrl', function(url) {
      navigateToUrl(url);
    });
    const bindCursorTooltip = getFunction(config, 'bindCursorTooltip');
    const hideCursorTooltip = getFunction(config, 'hideCursorTooltip');
    const showTopActionTooltip = getFunction(config, 'showTopActionTooltip');
    const hideTopActionTooltip = getFunction(config, 'hideTopActionTooltip');
    const copyTooltipController = getOption(config, 'copyTooltipController', null);
    const copyUrl = getFunction(config, 'copyUrl', function() {
      return Promise.resolve(false);
    });
    const shouldSuppressHover = getFunction(config, 'shouldSuppressHover', function() {
      return false;
    });
    const onItemPointerDown = getFunction(config, 'onItemPointerDown');
    const onItemContextMenu = getFunction(config, 'onItemContextMenu');
    const shouldKeepOpenForExternalNode = getFunction(config, 'shouldKeepOpenForExternalNode', function() {
      return false;
    });
    const getViewportTopPadding = getFunction(config, 'getViewportTopPadding', function() {
      return 8;
    });

    let bookmarkCascadeMenu = null;
    let bookmarkCascadeAnchor = null;
    let bookmarkCascadeLevels = [];
    let bookmarkCascadePointer = null;
    let bookmarkCascadePreviousPointer = null;
    let bookmarkCascadeHoverIntentTimer = 0;
    let bookmarkCascadeHoverIntentTask = null;
    let bookmarkCascadeCloseTimer = 0;
    let bookmarkCascadeCloseTask = null;
    let bookmarkCascadeKeyboardLevelIndex = 0;
    let bookmarkCascadeDebugEnabled = false;
    let bookmarkCascadeDebugControl = null;
    let bookmarkCascadeDebugButton = null;
    let bookmarkCascadeDebugSvg = null;
    let bookmarkCascadeDebugPolygon = null;
    let bookmarkCascadeDebugLabel = null;
    let bookmarkCascadeDebugOverlayView = null;
    let bookmarkCascadeDebugControlView = null;
    let bookmarkCascadeDebugLabelFrame = 0;
    let bookmarkCascadeDragMode = false;
    let bookmarkCascadeRefreshInProgress = false;
    let bookmarkCascadeDragTargetButton = null;
    let bookmarkCascadeDragInsertionElement = null;
    const bookmarkCascadeItemActions = new WeakMap();

    function setBookmarkCascadeDragMode(enabled) {
      bookmarkCascadeDragMode = enabled === true;
      if (bookmarkCascadeMenu) {
        if (bookmarkCascadeDragMode) {
          bookmarkCascadeMenu.setAttribute('data-drag-mode', 'true');
        } else {
          bookmarkCascadeMenu.removeAttribute('data-drag-mode');
        }
      }
      if (!bookmarkCascadeDragMode) {
        clearBookmarkCascadeDragTarget();
        cancelBookmarkCascadeHoverIntent();
        cancelBookmarkCascadeDelayedClose();
      }
      return bookmarkCascadeDragMode;
    }

    function getNow() {
      return windowObj && windowObj.performance && typeof windowObj.performance.now === 'function'
        ? windowObj.performance.now()
        : Date.now();
    }

    function requestFrame(callback) {
      if (windowObj && typeof windowObj.requestAnimationFrame === 'function') {
        return windowObj.requestAnimationFrame(callback);
      }
      if (windowObj && typeof windowObj.setTimeout === 'function') {
        return windowObj.setTimeout(callback, 16);
      }
      return 0;
    }

    function cancelFrame(frameId) {
      if (!frameId) {
        return;
      }
      if (windowObj && typeof windowObj.cancelAnimationFrame === 'function') {
        windowObj.cancelAnimationFrame(frameId);
        return;
      }
      if (windowObj && typeof windowObj.clearTimeout === 'function') {
        windowObj.clearTimeout(frameId);
      }
    }

    function setTimer(callback, delay) {
      return windowObj && typeof windowObj.setTimeout === 'function'
        ? windowObj.setTimeout(callback, delay)
        : 0;
    }

    function clearTimer(timerId) {
      if (timerId && windowObj && typeof windowObj.clearTimeout === 'function') {
        windowObj.clearTimeout(timerId);
      }
    }

    function getBookmarkCascadePointFromEvent(event) {
      if (!event) {
        return null;
      }
      const x = Number(event.clientX);
      const y = Number(event.clientY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }
      return { x, y };
    }

    function updateBookmarkCascadePointer(event) {
      const point = getBookmarkCascadePointFromEvent(event);
      if (!point) {
        return bookmarkCascadePointer;
      }
      if (!bookmarkCascadePointer ||
          bookmarkCascadePointer.x !== point.x ||
          bookmarkCascadePointer.y !== point.y) {
        bookmarkCascadePreviousPointer = bookmarkCascadePointer;
        bookmarkCascadePointer = point;
      }
      return bookmarkCascadePointer;
    }

    function isBookmarkCascadeHoverSuppressed(target, event) {
      return shouldSuppressHover(target, event) === true;
    }

    function isPointInsideRect(point, rect) {
      return Boolean(
        point &&
        rect &&
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom
      );
    }

    function getBookmarkCascadeLevelEntry(levelIndex) {
      const safeLevelIndex = Math.max(0, Number.parseInt(levelIndex, 10) || 0);
      return bookmarkCascadeLevels.find((entry) => entry && entry.levelIndex === safeLevelIndex) || null;
    }

    function getBookmarkCascadeLevelEntryByElement(levelElement) {
      if (!levelElement) {
        return null;
      }
      return bookmarkCascadeLevels.find((entry) => entry && entry.levelElement === levelElement) || null;
    }

    function getBookmarkCascadeSubmenuSide(entry, childRect) {
      if (!entry) {
        return 'right';
      }
      if (entry.placement && entry.placement.side) {
        return entry.placement.side === 'left' ? 'left' : 'right';
      }
      const attrSide = entry.levelElement ? entry.levelElement.getAttribute('data-side') : '';
      if (attrSide === 'left' || attrSide === 'right') {
        return attrSide;
      }
      const parentEntry = getBookmarkCascadeLevelEntry(entry.levelIndex - 1);
      const parentRect = parentEntry ? getBookmarkCascadeElementRect(parentEntry.levelElement) : null;
      if (parentRect && childRect && childRect.left < parentRect.left) {
        return 'left';
      }
      return 'right';
    }

    function buildBookmarkCascadeSafeTriangleForLevel(levelIndex, pointer) {
      if (typeof positionUtils.buildCascadeSafeTriangle !== 'function') {
        return null;
      }
      const parentEntry = getBookmarkCascadeLevelEntry(levelIndex);
      const childEntry = getBookmarkCascadeLevelEntry(Number(levelIndex) + 1);
      if (!parentEntry || !parentEntry.activeButton || !childEntry || !childEntry.levelElement) {
        return null;
      }
      const childRect = getBookmarkCascadeElementRect(childEntry.levelElement);
      if (!childRect) {
        return null;
      }
      return positionUtils.buildCascadeSafeTriangle({
        pointer,
        submenuRect: childRect,
        side: getBookmarkCascadeSubmenuSide(childEntry, childRect)
      });
    }

    function isBookmarkCascadePointNearSubmenuEdge(point, parentRect, side) {
      if (!point || !parentRect || parentRect.width <= 0) {
        return false;
      }
      const edgeZone = Math.min(
        BOOKMARK_CASCADE_SAFE_EDGE_ZONE_PX,
        Math.max(56, parentRect.width * 0.43)
      );
      return side === 'left'
        ? point.x <= parentRect.left + edgeZone
        : point.x >= parentRect.right - edgeZone;
    }

    function shouldProtectBookmarkCascadeLevel(levelIndex, point) {
      if (typeof positionUtils.isPointInsideCascadeSafeTriangle !== 'function') {
        return false;
      }
      const currentPoint = point || bookmarkCascadePointer;
      if (!currentPoint) {
        return false;
      }
      const parentEntry = getBookmarkCascadeLevelEntry(levelIndex);
      const childEntry = getBookmarkCascadeLevelEntry(Number(levelIndex) + 1);
      if (!parentEntry || !parentEntry.activeButton || !childEntry || !childEntry.levelElement) {
        return false;
      }
      const childRect = getBookmarkCascadeElementRect(childEntry.levelElement);
      if (isPointInsideRect(currentPoint, childRect)) {
        return true;
      }
      const submenuSide = getBookmarkCascadeSubmenuSide(childEntry, childRect);
      const parentRect = getBookmarkCascadeElementRect(parentEntry.levelElement);
      if (!isBookmarkCascadePointNearSubmenuEdge(currentPoint, parentRect, submenuSide)) {
        return false;
      }
      const triangle = buildBookmarkCascadeSafeTriangleForLevel(
        levelIndex,
        bookmarkCascadePreviousPointer || bookmarkCascadePointer
      );
      return positionUtils.isPointInsideCascadeSafeTriangle(currentPoint, triangle);
    }

    function ensureBookmarkCascadeDebugElements() {
      if (!bookmarkCascadeMenu || !bookmarkCascadeDebugEnabled || !documentObj) {
        return;
      }
      if (bookmarkCascadeDebugSvg && bookmarkCascadeDebugSvg.parentNode === bookmarkCascadeMenu &&
          bookmarkCascadeDebugLabel && bookmarkCascadeDebugLabel.parentNode === bookmarkCascadeMenu) {
        return;
      }
      bookmarkCascadeDebugOverlayView =
        view.createDebugOverlay(bookmarkCascadeMenu);
      bookmarkCascadeDebugSvg = bookmarkCascadeDebugOverlayView.svg;
      bookmarkCascadeDebugPolygon = bookmarkCascadeDebugOverlayView.polygon;
      bookmarkCascadeDebugLabel = bookmarkCascadeDebugOverlayView.label;
    }

    function hideBookmarkCascadeDebugTriangle() {
      if (bookmarkCascadeDebugPolygon) {
        bookmarkCascadeDebugPolygon.setAttribute('data-visible', 'false');
        bookmarkCascadeDebugPolygon.removeAttribute('points');
      }
    }

    function updateBookmarkCascadeDebugTriangle() {
      if (!bookmarkCascadeDebugEnabled || !bookmarkCascadeMenu) {
        hideBookmarkCascadeDebugTriangle();
        return;
      }
      ensureBookmarkCascadeDebugElements();
      if (!bookmarkCascadeDebugPolygon) {
        return;
      }
      let triangle = null;
      for (let index = bookmarkCascadeLevels.length - 2; index >= 0; index -= 1) {
        triangle = buildBookmarkCascadeSafeTriangleForLevel(
          bookmarkCascadeLevels[index].levelIndex,
          bookmarkCascadePointer || bookmarkCascadePreviousPointer
        );
        if (triangle) {
          break;
        }
      }
      if (!triangle) {
        hideBookmarkCascadeDebugTriangle();
        return;
      }
      bookmarkCascadeDebugPolygon.setAttribute(
        'points',
        triangle.map((point) => `${point.x},${point.y}`).join(' ')
      );
      bookmarkCascadeDebugPolygon.setAttribute('data-visible', 'true');
    }

    function getBookmarkCascadeDelayDebugTask() {
      return bookmarkCascadeHoverIntentTask || bookmarkCascadeCloseTask;
    }

    function getBookmarkCascadeDelayLabelRect(task) {
      if (!task) {
        return null;
      }
      if (task.type === 'close') {
        const deepestEntry = bookmarkCascadeLevels[bookmarkCascadeLevels.length - 1];
        return deepestEntry ? getBookmarkCascadeElementRect(deepestEntry.levelElement) : null;
      }
      const childEntry = getBookmarkCascadeLevelEntry(Number(task.levelIndex) + 1);
      if (childEntry && childEntry.levelElement) {
        return getBookmarkCascadeElementRect(childEntry.levelElement);
      }
      return getBookmarkCascadeElementRect(task.triggerElement);
    }

    function getBookmarkCascadeDelayLabelSide(task, rect) {
      if (!task || task.type === 'close') {
        return 'right';
      }
      const childEntry = getBookmarkCascadeLevelEntry(Number(task.levelIndex) + 1);
      return childEntry ? getBookmarkCascadeSubmenuSide(childEntry, rect) : 'right';
    }

    function getBookmarkCascadeViewport() {
      const docElement = documentObj ? (documentObj.documentElement || {}) : {};
      return {
        width: (windowObj && windowObj.innerWidth) || docElement.clientWidth || 0,
        height: (windowObj && windowObj.innerHeight) || docElement.clientHeight || 0
      };
    }

    function positionBookmarkCascadeDelayDebugLabel(task) {
      if (!bookmarkCascadeDebugLabel) {
        return;
      }
      const rect = getBookmarkCascadeDelayLabelRect(task);
      if (!rect) {
        bookmarkCascadeDebugLabel.setAttribute('data-visible', 'false');
        return;
      }
      const viewport = getBookmarkCascadeViewport();
      const labelRect = bookmarkCascadeDebugLabel.getBoundingClientRect();
      const labelWidth = Math.max(58, labelRect.width || 58);
      const labelHeight = Math.max(24, labelRect.height || 24);
      const spacing = 8;
      const side = getBookmarkCascadeDelayLabelSide(task, rect);
      let left = side === 'left'
        ? rect.left - labelWidth - spacing
        : rect.right + spacing;
      if (left + labelWidth > viewport.width - 8) {
        left = rect.left - labelWidth - spacing;
      }
      if (left < 8) {
        left = Math.min(Math.max(8, rect.right + spacing), viewport.width - labelWidth - 8);
      }
      const top = Math.max(8, Math.min(rect.top + 8, viewport.height - labelHeight - 8));
      bookmarkCascadeDebugLabel.style.setProperty('left', `${Math.round(left)}px`);
      bookmarkCascadeDebugLabel.style.setProperty('top', `${Math.round(top)}px`);
    }

    function updateBookmarkCascadeDelayDebugLabel() {
      bookmarkCascadeDebugLabelFrame = 0;
      if (!bookmarkCascadeDebugEnabled || !bookmarkCascadeMenu) {
        if (bookmarkCascadeDebugLabel) {
          bookmarkCascadeDebugLabel.setAttribute('data-visible', 'false');
        }
        return;
      }
      ensureBookmarkCascadeDebugElements();
      if (!bookmarkCascadeDebugLabel) {
        return;
      }
      const task = getBookmarkCascadeDelayDebugTask();
      if (!task || !Number.isFinite(task.deadline)) {
        bookmarkCascadeDebugLabel.setAttribute('data-visible', 'false');
        return;
      }
      const remaining = Math.max(0, Math.ceil(task.deadline - getNow()));
      bookmarkCascadeDebugLabel.textContent = `${task.label} ${remaining}ms`;
      bookmarkCascadeDebugLabel.setAttribute('data-visible', 'true');
      positionBookmarkCascadeDelayDebugLabel(task);
      if (remaining > 0) {
        bookmarkCascadeDebugLabelFrame = requestFrame(updateBookmarkCascadeDelayDebugLabel);
      }
    }

    function scheduleBookmarkCascadeDelayDebugLabel() {
      if (bookmarkCascadeDebugLabelFrame) {
        return;
      }
      bookmarkCascadeDebugLabelFrame = requestFrame(updateBookmarkCascadeDelayDebugLabel);
    }

    function cancelBookmarkCascadeHoverIntent() {
      if (bookmarkCascadeHoverIntentTimer) {
        clearTimer(bookmarkCascadeHoverIntentTimer);
        bookmarkCascadeHoverIntentTimer = 0;
      }
      if (bookmarkCascadeHoverIntentTask && bookmarkCascadeHoverIntentTask.triggerElement) {
        setBookmarkCascadeItemHoverSuppressed(bookmarkCascadeHoverIntentTask.triggerElement, false);
      }
      bookmarkCascadeHoverIntentTask = null;
      scheduleBookmarkCascadeDelayDebugLabel();
    }

    function cancelBookmarkCascadeHoverIntentFor(triggerElement) {
      if (bookmarkCascadeHoverIntentTask &&
          bookmarkCascadeHoverIntentTask.triggerElement === triggerElement) {
        cancelBookmarkCascadeHoverIntent();
      }
    }

    function runBookmarkCascadeHoverIntentTask() {
      const task = bookmarkCascadeHoverIntentTask;
      bookmarkCascadeHoverIntentTimer = 0;
      if (!task || !bookmarkCascadeMenu || !task.triggerElement || !task.triggerElement.isConnected) {
        cancelBookmarkCascadeHoverIntent();
        return;
      }
      if (!task.allowWhenSuppressed && isBookmarkCascadeHoverSuppressed(task.triggerElement, null)) {
        cancelBookmarkCascadeHoverIntent();
        setBookmarkCascadeItemHoverSuppressed(task.triggerElement, true);
        return;
      }
      const point = bookmarkCascadePointer;
      const triggerRect = getBookmarkCascadeElementRect(task.triggerElement);
      const triggerHovered = typeof task.triggerElement.matches === 'function' &&
        task.triggerElement.matches(':hover');
      const pointInsideTrigger = point && triggerRect && isPointInsideRect(point, triggerRect);
      const now = getNow();
      const safeRemaining = Number.isFinite(task.safeUntil) ? task.safeUntil - now : 0;
      if (shouldProtectBookmarkCascadeLevel(task.levelIndex, point) && safeRemaining > 0) {
        const recheckDelay = Math.max(16, Math.min(BOOKMARK_CASCADE_SAFE_RECHECK_MS, safeRemaining));
        task.label = task.safeLabel || task.activationLabel || task.label;
        task.deadline = task.safeUntil;
        bookmarkCascadeHoverIntentTimer = setTimer(
          runBookmarkCascadeHoverIntentTask,
          recheckDelay
        );
        scheduleBookmarkCascadeDelayDebugLabel();
        return;
      }
      if (point && triggerRect && !pointInsideTrigger && !triggerHovered) {
        cancelBookmarkCascadeHoverIntent();
        return;
      }
      const run = task.run;
      cancelBookmarkCascadeHoverIntent();
      run();
    }

    function scheduleBookmarkCascadeHoverIntent(task, event) {
      if (!task || typeof task.run !== 'function') {
        return;
      }
      if (!task.allowWhenSuppressed && isBookmarkCascadeHoverSuppressed(task.triggerElement, event)) {
        cancelBookmarkCascadeHoverIntent();
        setBookmarkCascadeItemHoverSuppressed(task.triggerElement, true);
        return;
      }
      const pointerType = event && typeof event.pointerType === 'string' ? event.pointerType : '';
      if (pointerType === 'touch') {
        cancelBookmarkCascadeHoverIntent();
        task.run();
        return;
      }
      updateBookmarkCascadePointer(event);
      cancelBookmarkCascadeHoverIntent();
      const delayMs = BOOKMARK_CASCADE_HOVER_DELAY_MS;
      const scheduledAt = getNow();
      const activationLabel = task.label || t('newtab_bookmark_cascade_debug_switch_label', 'Switch');
      bookmarkCascadeHoverIntentTask = {
        ...task,
        type: 'hover',
        activationLabel,
        label: activationLabel,
        safeLabel: t('newtab_bookmark_cascade_debug_safe_label', 'Safe'),
        deadline: scheduledAt + delayMs,
        safeUntil: scheduledAt + BOOKMARK_CASCADE_SAFE_MAX_MS
      };
      bookmarkCascadeHoverIntentTimer = setTimer(runBookmarkCascadeHoverIntentTask, delayMs);
      scheduleBookmarkCascadeDelayDebugLabel();
    }

    function cancelBookmarkCascadeDelayedClose() {
      if (bookmarkCascadeCloseTimer) {
        clearTimer(bookmarkCascadeCloseTimer);
        bookmarkCascadeCloseTimer = 0;
      }
      bookmarkCascadeCloseTask = null;
      scheduleBookmarkCascadeDelayDebugLabel();
    }

    function scheduleBookmarkCascadeDelayedClose() {
      if (!bookmarkCascadeMenu || bookmarkCascadeDragMode || bookmarkCascadeCloseTimer) {
        return;
      }
      bookmarkCascadeCloseTask = {
        type: 'close',
        label: t('newtab_bookmark_cascade_debug_close_label', 'Close'),
        deadline: getNow() + BOOKMARK_CASCADE_CLOSE_DELAY_MS
      };
      bookmarkCascadeCloseTimer = setTimer(() => {
        bookmarkCascadeCloseTimer = 0;
        bookmarkCascadeCloseTask = null;
        close();
      }, BOOKMARK_CASCADE_CLOSE_DELAY_MS);
      scheduleBookmarkCascadeDelayDebugLabel();
    }

    function isBookmarkCascadePointInsideInteractiveArea(point) {
      if (!point || !bookmarkCascadeMenu) {
        return false;
      }
      const anchorRect = getBookmarkCascadeElementRect(bookmarkCascadeAnchor, {
        ignoreElementTranslate: true
      });
      if (isPointInsideRect(point, anchorRect)) {
        return true;
      }
      const rootEntry = getBookmarkCascadeLevelEntry(0);
      const rootRect = rootEntry ? getBookmarkCascadeElementRect(rootEntry.levelElement) : null;
      if (bookmarkCascadeDragMode && anchorRect && rootRect) {
        const bridgePadding = 10;
        const bridgeRect = {
          left: Math.min(anchorRect.left, rootRect.left) - bridgePadding,
          right: Math.max(anchorRect.right, rootRect.right) + bridgePadding,
          top: Math.min(anchorRect.top, rootRect.top) - bridgePadding,
          bottom: Math.max(anchorRect.bottom, rootRect.bottom) + bridgePadding
        };
        if (isPointInsideRect(point, bridgeRect)) {
          return true;
        }
      }
      for (let index = 0; index < bookmarkCascadeLevels.length; index += 1) {
        const entry = bookmarkCascadeLevels[index];
        if (entry && isPointInsideRect(point, getBookmarkCascadeElementRect(entry.levelElement))) {
          return true;
        }
        if (entry && shouldProtectBookmarkCascadeLevel(entry.levelIndex, point)) {
          return true;
        }
      }
      return false;
    }

    function handleBookmarkCascadeDocumentPointerMove(event) {
      if (!bookmarkCascadeMenu) {
        return;
      }
      const point = updateBookmarkCascadePointer(event);
      updateBookmarkCascadeDebugTriangle();
      if (isBookmarkCascadePointInsideInteractiveArea(point)) {
        cancelBookmarkCascadeDelayedClose();
        return;
      }
      scheduleBookmarkCascadeDelayedClose();
    }

    function updateBookmarkCascadeDebugButton() {
      if (!bookmarkCascadeDebugButton) {
        return;
      }
      const active = bookmarkCascadeDebugEnabled ? 'true' : 'false';
      bookmarkCascadeDebugButton.setAttribute('aria-pressed', active);
      bookmarkCascadeDebugButton.setAttribute('data-active', active);
      bookmarkCascadeDebugButton.setAttribute(
        'aria-label',
        bookmarkCascadeDebugEnabled
          ? t('newtab_bookmark_cascade_debug_disable', 'Hide bookmark menu safe triangle')
          : t('newtab_bookmark_cascade_debug_enable', 'Show bookmark menu safe triangle')
      );
    }

    function setBookmarkCascadeDebugEnabled(enabled, setOptions) {
      const next = normalizeBookmarkCascadeDebugMode(enabled);
      const changed = bookmarkCascadeDebugEnabled !== next;
      bookmarkCascadeDebugEnabled = next;
      updateBookmarkCascadeDebugButton();
      if (storageArea && debugStorageKey && (!setOptions || setOptions.persist !== false)) {
        storageArea.set({ [debugStorageKey]: next });
      }
      if (!next) {
        hideBookmarkCascadeDebugTriangle();
        if (bookmarkCascadeDebugLabel) {
          bookmarkCascadeDebugLabel.setAttribute('data-visible', 'false');
        }
        return;
      }
      if (changed) {
        ensureBookmarkCascadeDebugElements();
      }
      updateBookmarkCascadeDebugTriangle();
      scheduleBookmarkCascadeDelayDebugLabel();
    }

    function createBookmarkCascadeDebugControls() {
      if (bookmarkCascadeDebugControl || !documentObj) {
        return bookmarkCascadeDebugControl;
      }
      bookmarkCascadeDebugControlView =
        view.createDebugControl(documentObj);
      bookmarkCascadeDebugControl = bookmarkCascadeDebugControlView.element;
      bookmarkCascadeDebugButton = bookmarkCascadeDebugControlView.button;
      bookmarkCascadeDebugButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideTopActionTooltip();
        setBookmarkCascadeDebugEnabled(!bookmarkCascadeDebugEnabled);
      });
      const showDebugTooltip = () => {
        showTopActionTooltip(
          bookmarkCascadeDebugButton,
          bookmarkCascadeDebugEnabled
            ? t('newtab_bookmark_cascade_debug_disable', 'Hide bookmark menu safe triangle')
            : t('newtab_bookmark_cascade_debug_enable', 'Show bookmark menu safe triangle'),
          { placement: 'top' }
        );
      };
      bookmarkCascadeDebugButton.addEventListener('mouseenter', showDebugTooltip);
      bookmarkCascadeDebugButton.addEventListener('mouseleave', hideTopActionTooltip);
      bookmarkCascadeDebugButton.addEventListener('focus', showDebugTooltip);
      bookmarkCascadeDebugButton.addEventListener('blur', hideTopActionTooltip);
      bookmarkCascadeDebugControl.appendChild(bookmarkCascadeDebugButton);
      updateBookmarkCascadeDebugButton();
      return bookmarkCascadeDebugControl;
    }

    function close(closeOptions) {
      const optionsForClose = closeOptions || {};
      cancelBookmarkCascadeHoverIntent();
      cancelBookmarkCascadeDelayedClose();
      hideCursorTooltip();
      hideTopActionTooltip();
      if (copyTooltipController && typeof copyTooltipController.hide === 'function') {
        copyTooltipController.hide();
      }
      bookmarkCascadeKeyboardLevelIndex = 0;
      if (bookmarkCascadeDebugLabelFrame) {
        cancelFrame(bookmarkCascadeDebugLabelFrame);
        bookmarkCascadeDebugLabelFrame = 0;
      }
      const anchorToRestore = bookmarkCascadeAnchor;
      clearBookmarkCascadeDragTarget();
      bookmarkCascadeDragMode = false;
      if (anchorToRestore) {
        anchorToRestore.setAttribute('aria-expanded', 'false');
        if (typeof anchorToRestore._xSetBookmarkMenuVisualActive === 'function') {
          anchorToRestore._xSetBookmarkMenuVisualActive(false);
        }
      }
      bookmarkCascadeAnchor = null;
      bookmarkCascadeLevels = [];
      if (bookmarkCascadeDebugOverlayView) {
        bookmarkCascadeDebugOverlayView.destroy();
        bookmarkCascadeDebugOverlayView = null;
      }
      if (bookmarkCascadeMenu && bookmarkCascadeMenu.parentNode) {
        bookmarkCascadeMenu.parentNode.removeChild(bookmarkCascadeMenu);
      }
      bookmarkCascadeMenu = null;
      bookmarkCascadeDebugSvg = null;
      bookmarkCascadeDebugPolygon = null;
      bookmarkCascadeDebugLabel = null;
      bookmarkCascadePointer = null;
      bookmarkCascadePreviousPointer = null;
      if (optionsForClose.restoreFocus && anchorToRestore && typeof anchorToRestore.focus === 'function') {
        try {
          anchorToRestore.focus({ preventScroll: true });
        } catch (error) {
          anchorToRestore.focus();
        }
      }
    }

    function getBookmarkCascadeElementRect(element, rectOptions) {
      if (!element || typeof element.getBoundingClientRect !== 'function') {
        return null;
      }
      const rect = element.getBoundingClientRect();
      const width = element.offsetWidth || rect.width || 0;
      const height = element.offsetHeight || rect.height || 0;
      const normalizeMeasuredRect = (sourceRect) => ({
        left: sourceRect.left,
        right: sourceRect.left + width,
        top: sourceRect.top,
        bottom: sourceRect.top + height,
        width,
        height
      });
      if (rectOptions &&
          rectOptions.ignoreElementTranslate &&
          typeof positionUtils.getTranslateNeutralRect === 'function') {
        const style = (windowObj && typeof windowObj.getComputedStyle === 'function')
          ? windowObj.getComputedStyle(element)
          : null;
        return normalizeMeasuredRect(positionUtils.getTranslateNeutralRect(
          rect,
          style && style.transform
        ));
      }
      return normalizeMeasuredRect(rect);
    }

    function applyBookmarkCascadeLevelSurface(levelElement) {
      if (!levelElement) {
        return;
      }
      if (menuSurface && typeof menuSurface.applyContentWidth === 'function') {
        menuSurface.applyContentWidth(levelElement, {
          minWidth: BOOKMARK_CASCADE_MENU_MIN_WIDTH_PX,
          maxWidth: BOOKMARK_CASCADE_MENU_MAX_WIDTH_PX
        });
        return;
      }
      levelElement.classList.add('_x_extension_menu_surface_2024_unique_');
      levelElement.setAttribute('data-menu-surface-width', 'content');
      levelElement.style.setProperty('--x-extension-menu-surface-min-width', `${BOOKMARK_CASCADE_MENU_MIN_WIDTH_PX}px`);
      levelElement.style.setProperty('--x-extension-menu-surface-max-width', `${BOOKMARK_CASCADE_MENU_MAX_WIDTH_PX}px`);
    }

    function lockBookmarkCascadeLevelWidth(levelElement) {
      if (!levelElement || !levelElement.style || typeof levelElement.style.setProperty !== 'function') {
        return 0;
      }
      const rect = typeof levelElement.getBoundingClientRect === 'function'
        ? levelElement.getBoundingClientRect()
        : null;
      const measuredWidth = Number(levelElement.offsetWidth) || Number(rect && rect.width) || 0;
      if (!Number.isFinite(measuredWidth) || measuredWidth <= 0) {
        return 0;
      }
      const lockedWidth = Math.ceil(measuredWidth);
      levelElement.style.setProperty('width', `${lockedWidth}px`);
      return lockedWidth;
    }

    function openBookmarkCascadeLevelSurface(levelElement) {
      if (!levelElement) {
        return;
      }
      if (bookmarkCascadeRefreshInProgress) {
        levelElement.setAttribute('data-open', 'true');
        return;
      }
      if (menuSurface && typeof menuSurface.open === 'function') {
        menuSurface.open(levelElement, { requestAnimationFrame: requestFrame });
        return;
      }
      levelElement.setAttribute('data-open', 'true');
    }

    function applyBookmarkCascadePlacement(levelElement, placement) {
      if (!levelElement || !placement) {
        return;
      }
      levelElement.style.setProperty('left', `${Math.round(placement.left)}px`);
      levelElement.style.setProperty('top', `${Math.round(placement.top)}px`);
      if (placement.side) {
        levelElement.setAttribute('data-side', placement.side);
      }
      if (placement.horizontal) {
        levelElement.setAttribute('data-horizontal', placement.horizontal);
      }
      if (placement.vertical) {
        levelElement.setAttribute('data-vertical', placement.vertical);
      }
    }

    function positionBookmarkCascadeLevel(entry) {
      if (!entry || !entry.levelElement || !bookmarkCascadeMenu) {
        return;
      }
      const levelRect = getBookmarkCascadeElementRect(entry.levelElement);
      if (!levelRect) {
        return;
      }
      const viewport = getBookmarkCascadeViewport();
      const viewportTopPadding = Math.max(8, Number(getViewportTopPadding()) || 8);
      if (entry.levelIndex <= 0) {
        const anchorRect = getBookmarkCascadeElementRect(bookmarkCascadeAnchor, {
          ignoreElementTranslate: true
        });
        if (!anchorRect || typeof positionUtils.placeRootCascadeMenu !== 'function') {
          return;
        }
        const placement = positionUtils.placeRootCascadeMenu({
          anchorRect,
          menuRect: levelRect,
          viewport,
          spacing: 8,
          viewportPadding: 8,
          viewportTopPadding
        });
        entry.placement = placement;
        applyBookmarkCascadePlacement(entry.levelElement, placement);
        return;
      }
      const parentLevelRect = getBookmarkCascadeElementRect(entry.parentLevelElement);
      const triggerRect = getBookmarkCascadeElementRect(entry.triggerElement);
      if (!parentLevelRect || !triggerRect || typeof positionUtils.placeCascadeSubmenu !== 'function') {
        return;
      }
      const placement = positionUtils.placeCascadeSubmenu({
        parentLevelRect,
        triggerRect,
        menuRect: levelRect,
        viewport,
        spacing: BOOKMARK_CASCADE_SUBMENU_GAP_PX,
        viewportPadding: 8,
        viewportTopPadding
      });
      entry.placement = placement;
      applyBookmarkCascadePlacement(entry.levelElement, placement);
    }

    function positionBookmarkCascadeLevels() {
      if (!bookmarkCascadeMenu || bookmarkCascadeLevels.length === 0) {
        return;
      }
      bookmarkCascadeLevels.forEach((entry) => {
        positionBookmarkCascadeLevel(entry);
      });
      updateBookmarkCascadeDebugTriangle();
    }

    function getBookmarkCascadeItems(folderId) {
      const id = String(folderId || '');
      const items = id ? getItems(id) : [];
      return Array.isArray(items) ? items : [];
    }

    function clearBookmarkCascadeLevelsFrom(levelIndex) {
      if (!bookmarkCascadeMenu) {
        return;
      }
      const safeLevelIndex = Math.max(0, Number.parseInt(levelIndex, 10) || 0);
      bookmarkCascadeLevels = bookmarkCascadeLevels.filter((entry) => {
        const shouldRemove = entry && Number(entry.levelIndex) >= safeLevelIndex;
        if (shouldRemove && entry.triggerElement &&
            entry.triggerElement.getAttribute('aria-haspopup') === 'menu') {
          entry.triggerElement.setAttribute('aria-expanded', 'false');
        }
        if (shouldRemove && entry.levelElement && entry.levelElement.parentNode) {
          if (entry.viewController && typeof entry.viewController.destroy === 'function') {
            entry.viewController.destroy();
          }
          entry.levelElement.parentNode.removeChild(entry.levelElement);
        }
        return !shouldRemove;
      });
      if (bookmarkCascadeKeyboardLevelIndex >= safeLevelIndex) {
        bookmarkCascadeKeyboardLevelIndex = Math.max(0, safeLevelIndex - 1);
      }
      if (bookmarkCascadeHoverIntentTask &&
          Number(bookmarkCascadeHoverIntentTask.levelIndex) >= safeLevelIndex) {
        cancelBookmarkCascadeHoverIntent();
      }
      updateBookmarkCascadeDebugTriangle();
      scheduleBookmarkCascadeDelayDebugLabel();
    }

    function getBookmarkCascadeLevelItems(levelElement) {
      if (!levelElement || typeof levelElement.querySelectorAll !== 'function') {
        return [];
      }
      return Array.from(levelElement.querySelectorAll('.x-nt-bookmark-cascade-item'));
    }

    function getBookmarkCascadeRowAnimationKey(entry, button) {
      if (!entry || !button || typeof button.getAttribute !== 'function') {
        return '';
      }
      const folderId = String(entry.folderId || '');
      const bookmarkId = String(button.getAttribute('data-bookmark-id') || '');
      return folderId && bookmarkId ? `${folderId}::${bookmarkId}` : '';
    }

    function getBookmarkCascadeRowRectMap() {
      const rects = new Map();
      bookmarkCascadeLevels.forEach((entry) => {
        getBookmarkCascadeLevelItems(entry && entry.levelElement).forEach((button) => {
          const key = getBookmarkCascadeRowAnimationKey(entry, button);
          const row = typeof button.closest === 'function'
            ? button.closest('.x-nt-bookmark-cascade-row')
            : null;
          const rect = getBookmarkCascadeElementRect(row || button);
          if (key && rect) {
            rects.set(key, rect);
          }
        });
      });
      return rects;
    }

    function clearBookmarkCascadeRowLayoutAnimation(row) {
      if (!row || !row.style) {
        return;
      }
      if (row._xBookmarkCascadeLayoutAnimationTimer) {
        clearTimer(row._xBookmarkCascadeLayoutAnimationTimer);
        row._xBookmarkCascadeLayoutAnimationTimer = 0;
      }
      row.style.removeProperty('transition');
      row.style.removeProperty('transform');
      row.style.removeProperty('will-change');
    }

    function playBookmarkCascadeRowLayoutAnimation(beforeRects, animationOptions) {
      if (!(beforeRects instanceof Map) || !bookmarkCascadeMenu) {
        return false;
      }
      const optionsForAnimation = animationOptions && typeof animationOptions === 'object'
        ? animationOptions
        : {};
      const draggedBookmarkId = String(optionsForAnimation.draggedBookmarkId || '');
      const draggedRect = optionsForAnimation.draggedRect || null;
      const shifts = [];
      bookmarkCascadeLevels.forEach((entry) => {
        getBookmarkCascadeLevelItems(entry && entry.levelElement).forEach((button) => {
          const bookmarkId = String(button.getAttribute('data-bookmark-id') || '');
          const key = getBookmarkCascadeRowAnimationKey(entry, button);
          const row = typeof button.closest === 'function'
            ? button.closest('.x-nt-bookmark-cascade-row')
            : null;
          const before = bookmarkId && bookmarkId === draggedBookmarkId && draggedRect
            ? draggedRect
            : beforeRects.get(key);
          const after = getBookmarkCascadeElementRect(row || button);
          if (!row || !before || !after) {
            return;
          }
          const dx = Number(before.left) - Number(after.left);
          const dy = Number(before.top) - Number(after.top);
          if (!Number.isFinite(dx) || !Number.isFinite(dy) ||
              (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)) {
            return;
          }
          clearBookmarkCascadeRowLayoutAnimation(row);
          shifts.push({ row, dx, dy });
        });
      });
      if (shifts.length === 0) {
        return false;
      }
      shifts.forEach(({ row, dx, dy }) => {
        row.style.setProperty('transition', 'none');
        row.style.setProperty('transform', `translate3d(${dx}px, ${dy}px, 0)`);
        row.style.setProperty('will-change', 'transform');
      });
      void bookmarkCascadeMenu.offsetHeight;
      requestFrame(() => {
        shifts.forEach(({ row }) => {
          if (!row.isConnected) {
            return;
          }
          row.style.setProperty(
            'transition',
            `transform ${BOOKMARK_CASCADE_REORDER_ANIMATION_MS}ms ${BOOKMARK_CASCADE_REORDER_EASING}`
          );
          row.style.setProperty('transform', 'translate3d(0, 0, 0)');
          row._xBookmarkCascadeLayoutAnimationTimer = setTimer(() => {
            row._xBookmarkCascadeLayoutAnimationTimer = 0;
            clearBookmarkCascadeRowLayoutAnimation(row);
          }, BOOKMARK_CASCADE_REORDER_ANIMATION_MS + 80);
        });
      });
      return true;
    }

    function getBookmarkCascadeActiveItem(levelElement) {
      if (!levelElement || typeof levelElement.querySelector !== 'function') {
        return null;
      }
      return levelElement.querySelector('.x-nt-bookmark-cascade-item[data-active="true"]');
    }

    function setBookmarkCascadeItemHoverSuppressed(itemButton, suppressed) {
      if (!itemButton || typeof itemButton.setAttribute !== 'function') {
        return;
      }
      if (suppressed) {
        itemButton.setAttribute('data-hover-suppressed', 'true');
        return;
      }
      if (typeof itemButton.removeAttribute === 'function') {
        itemButton.removeAttribute('data-hover-suppressed');
      } else {
        itemButton.setAttribute('data-hover-suppressed', 'false');
      }
    }

    function clearBookmarkDragClickSuppression(itemButton) {
      if (!itemButton) {
        return;
      }
      if (itemButton._xBookmarkSuppressClickTimer) {
        windowObj.clearTimeout(itemButton._xBookmarkSuppressClickTimer);
        itemButton._xBookmarkSuppressClickTimer = 0;
      }
      itemButton._xBookmarkSuppressClick = false;
    }

    function consumeBookmarkDragClickSuppression(itemButton) {
      if (!itemButton || !itemButton._xBookmarkSuppressClick) {
        return false;
      }
      clearBookmarkDragClickSuppression(itemButton);
      return true;
    }

    function clearBookmarkCascadeLevelHoverSuppression(levelElement) {
      getBookmarkCascadeLevelItems(levelElement).forEach((button) => {
        setBookmarkCascadeItemHoverSuppressed(button, false);
      });
    }

    function focusBookmarkCascadeItem(itemButton) {
      if (!itemButton || typeof itemButton.focus !== 'function') {
        return;
      }
      try {
        itemButton.focus({ preventScroll: true });
      } catch (error) {
        itemButton.focus();
      }
    }

    function setBookmarkCascadeLevelActiveItem(levelElement, activeButton, options) {
      if (!levelElement) {
        return;
      }
      getBookmarkCascadeLevelItems(levelElement).forEach((button) => {
        const active = button === activeButton;
        setBookmarkCascadeItemHoverSuppressed(button, false);
        button.setAttribute('data-active', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
        const icon = button.querySelector('.x-nt-bookmark-cascade-icon--folder');
        if (icon) {
          playFolderPathMorph(icon, active);
        }
        if (!active && button.getAttribute('aria-haspopup') === 'menu') {
          button.setAttribute('aria-expanded', 'false');
        }
      });
      const entry = getBookmarkCascadeLevelEntryByElement(levelElement);
      if (entry) {
        entry.activeButton = activeButton || null;
        if (activeButton && options && options.focus) {
          bookmarkCascadeKeyboardLevelIndex = entry.levelIndex;
        }
      }
      updateBookmarkCascadeDebugTriangle();
      if (activeButton && options && options.focus) {
        focusBookmarkCascadeItem(activeButton);
      }
    }

    function clearBookmarkCascadePointerActiveItem(levelElement, nextButton, event) {
      const entry = getBookmarkCascadeLevelEntryByElement(levelElement);
      const activeButton = entry ? entry.activeButton : null;
      if (!entry || !activeButton || activeButton === nextButton) {
        return;
      }
      const point = updateBookmarkCascadePointer(event);
      if (shouldProtectBookmarkCascadeLevel(entry.levelIndex, point)) {
        setBookmarkCascadeItemHoverSuppressed(nextButton, Boolean(nextButton));
        return;
      }
      clearBookmarkCascadeLevelHoverSuppression(levelElement);
      clearBookmarkCascadeLevelsFrom(entry.levelIndex + 1);
      activeButton.setAttribute('data-active', 'false');
      activeButton.tabIndex = -1;
      if (activeButton.getAttribute('aria-haspopup') === 'menu') {
        activeButton.setAttribute('aria-expanded', 'false');
      }
      const icon = activeButton.querySelector('.x-nt-bookmark-cascade-icon--folder');
      if (icon) {
        playFolderPathMorph(icon, false);
      }
      entry.activeButton = null;
      updateBookmarkCascadeDebugTriangle();
    }

    function selectFirstBookmarkCascadeItemInLevel(levelIndex, options) {
      const entry = getBookmarkCascadeLevelEntry(levelIndex);
      const firstItem = entry ? getBookmarkCascadeLevelItems(entry.levelElement)[0] : null;
      if (!entry || !firstItem) {
        return false;
      }
      setBookmarkCascadeLevelActiveItem(entry.levelElement, firstItem, options);
      return true;
    }

    function getBookmarkCascadeKeyboardEntry() {
      const activeElement = documentObj ? documentObj.activeElement : null;
      if (bookmarkCascadeMenu && activeElement && bookmarkCascadeMenu.contains(activeElement)) {
        for (let index = bookmarkCascadeLevels.length - 1; index >= 0; index -= 1) {
          const entry = bookmarkCascadeLevels[index];
          if (entry && entry.levelElement && entry.levelElement.contains(activeElement)) {
            return entry;
          }
        }
      }
      return getBookmarkCascadeLevelEntry(bookmarkCascadeKeyboardLevelIndex) ||
        bookmarkCascadeLevels[bookmarkCascadeLevels.length - 1] ||
        null;
    }

    function moveBookmarkCascadeKeyboardSelection(direction) {
      const entry = getBookmarkCascadeKeyboardEntry();
      const items = entry ? getBookmarkCascadeLevelItems(entry.levelElement) : [];
      if (!entry || items.length === 0) {
        return false;
      }
      const currentItem = entry.activeButton && items.includes(entry.activeButton)
        ? entry.activeButton
        : getBookmarkCascadeActiveItem(entry.levelElement);
      const currentIndex = currentItem ? items.indexOf(currentItem) : -1;
      const offset = direction < 0 ? -1 : 1;
      const nextIndex = currentIndex < 0
        ? (offset > 0 ? 0 : items.length - 1)
        : (currentIndex + offset + items.length) % items.length;
      const nextItem = items[nextIndex];
      setBookmarkCascadeLevelActiveItem(entry.levelElement, nextItem, { focus: true });
      clearBookmarkCascadeLevelsFrom(entry.levelIndex + 1);
      return true;
    }

    function enterBookmarkCascadeKeyboardSubmenu() {
      const entry = getBookmarkCascadeKeyboardEntry();
      if (!entry) {
        return false;
      }
      const activeItem = entry.activeButton ||
        getBookmarkCascadeActiveItem(entry.levelElement) ||
        getBookmarkCascadeLevelItems(entry.levelElement)[0];
      const action = activeItem ? bookmarkCascadeItemActions.get(activeItem) : null;
      if (!action || !action.isFolder || typeof action.openNestedLevel !== 'function') {
        return false;
      }
      action.openNestedLevel({ focusChild: true });
      return true;
    }

    function leaveBookmarkCascadeKeyboardSubmenu() {
      const entry = getBookmarkCascadeKeyboardEntry();
      if (!entry || entry.levelIndex <= 0) {
        return false;
      }
      const parentEntry = getBookmarkCascadeLevelEntry(entry.levelIndex - 1);
      const parentItem = entry.triggerElement || (parentEntry && parentEntry.activeButton);
      clearBookmarkCascadeLevelsFrom(entry.levelIndex);
      if (parentEntry && parentItem) {
        setBookmarkCascadeLevelActiveItem(parentEntry.levelElement, parentItem, { focus: true });
        if (parentItem.getAttribute('aria-haspopup') === 'menu') {
          parentItem.setAttribute('aria-expanded', 'false');
        }
      }
      return true;
    }

    function isBookmarkCascadeKeyboardTarget(target) {
      if (!target) {
        return true;
      }
      if (bookmarkCascadeMenu && bookmarkCascadeMenu.contains(target)) {
        return true;
      }
      if (bookmarkCascadeAnchor &&
          (target === bookmarkCascadeAnchor ||
            (typeof bookmarkCascadeAnchor.contains === 'function' && bookmarkCascadeAnchor.contains(target)))) {
        return true;
      }
      return documentObj && (target === documentObj.body || target === documentObj.documentElement);
    }

    function handleBookmarkCascadeKeyboardNavigation(event) {
      if (!event || !bookmarkCascadeMenu || !isBookmarkCascadeKeyboardTarget(event.target)) {
        return false;
      }
      let handled = false;
      if (event.key === 'ArrowDown') {
        handled = moveBookmarkCascadeKeyboardSelection(1);
      } else if (event.key === 'ArrowUp') {
        handled = moveBookmarkCascadeKeyboardSelection(-1);
      } else if (event.key === 'ArrowRight') {
        handled = enterBookmarkCascadeKeyboardSubmenu();
      } else if (event.key === 'ArrowLeft') {
        handled = leaveBookmarkCascadeKeyboardSubmenu();
      }
      if (!handled) {
        return false;
      }
      event.preventDefault();
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      return true;
    }

    function getBrowserFaviconCandidateForBookmark(url, host) {
      const pageUrl = String(url || '').trim();
      if (!pageUrl) {
        return '';
      }
      if (!/^https?:\/\//i.test(pageUrl)) {
        return /^[a-z][a-z0-9+.-]*:/i.test(pageUrl)
          ? getChromeFaviconUrl(pageUrl)
          : '';
      }
      return host && isLocalNetworkHost(host)
        ? getChromeFaviconUrl(pageUrl)
        : '';
    }

    function getPrimaryFaviconCandidateForBookmark(url) {
      return getBrowserPageFaviconUrl(url);
    }

    function shouldOpenUrlInBackground(event) {
      return Boolean(event && (event.metaKey || event.ctrlKey || Number(event.button) === 1));
    }

    function openBookmarkCascadeUrl(url, event) {
      openUrl(url, {
        openInBackgroundTab: shouldOpenUrlInBackground(event)
      });
    }


    function createBookmarkCascadeCopyTrigger(itemRow, item, activateLeafItem, copyButton) {
      if (!itemRow || !item || !item.url || !copyButton) {
        return null;
      }
      const copyLabel = t('bookmarks_copy_url', 'Copy link');
      const showCopyTooltip = () => {
        cancelBookmarkCascadeHoverIntent();
        hideCursorTooltip();
        activateLeafItem();
        if (copyTooltipController && typeof copyTooltipController.show === 'function') {
          copyTooltipController.show(copyButton, copyLabel, {
            placement: 'top',
            maxWidth: 200,
            spacing: 8
          });
        }
      };
      const hideCopyTooltip = () => {
        if (copyTooltipController && typeof copyTooltipController.hide === 'function') {
          copyTooltipController.hide();
        }
      };

      copyButton.addEventListener('pointerenter', showCopyTooltip);
      copyButton.addEventListener('pointerleave', hideCopyTooltip);
      copyButton.addEventListener('focus', showCopyTooltip);
      copyButton.addEventListener('blur', hideCopyTooltip);
      copyButton.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
      copyButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideCursorTooltip();
        hideCopyTooltip();
        Promise.resolve().then(() => copyUrl(item.url)).catch(noop);
      });
      if (copyButton.parentNode !== itemRow) {
        itemRow.appendChild(copyButton);
      }
      return copyButton;
    }

    function renderBookmarkCascadeMenuLevel(folderId, levelIndex, triggerElement, parentLevelElement, folderTitle) {
      if (!bookmarkCascadeMenu || !documentObj) {
        return;
      }
      const safeLevelIndex = Math.max(0, Number.parseInt(levelIndex, 10) || 0);
      clearBookmarkCascadeLevelsFrom(safeLevelIndex);
      const items = getBookmarkCascadeItems(folderId).filter((item) => {
        return Boolean(item && (item.url || item.type === 'folder'));
      });
      const viewController = view.createLevel({
          documentObj,
          levelIndex: safeLevelIndex,
          folderId,
          folderTitle,
          items,
          sanitizeDisplayText,
          getFigmaFolderSvg,
          getRiSvg,
          getUrlDisplay,
          copyLabel: t('bookmarks_copy_url', 'Copy link'),
          emptyLabel: t('bookmarks_empty_folder', 'No content'),
          siteIconAlt: t('site_icon_alt', '站点')
        });
      const levelElement = viewController.element;
      applyBookmarkCascadeLevelSurface(levelElement);
      levelElement.setAttribute('data-level', String(safeLevelIndex));
      levelElement.setAttribute('role', 'menu');
      const contentElement = viewController.content;

      items.forEach((item, index) => {
        if (!item || (!item.url && item.type !== 'folder')) {
          return;
        }
        const isFolder = item.type === 'folder';
        const titleText = item.title || (item.url ? getUrlDisplay(item.url) : t('bookmarks_heading', 'Bookmarks'));
        const itemView = viewController.items[index];
        const itemRow = itemView.row;
        const itemButton = itemView.button;
        itemButton.addEventListener('dragstart', (event) => {
          event.preventDefault();
        });
        itemButton.addEventListener('pointerdown', (event) => {
          clearBookmarkDragClickSuppression(itemButton);
          onItemPointerDown({
            event,
            item,
            element: itemButton,
            parentFolderId: String(item.parentId || folderId || '')
          });
        });
        itemButton.addEventListener('contextmenu', (event) => {
          onItemContextMenu({
            event,
            item,
            element: itemButton,
            sourceKind: 'cascade',
            parentFolderId: String(item.parentId || folderId || '')
          });
        });

        const icon = itemView.icon;
        if (icon) {
          if (isFolder) {
            initFolderPathMorph(icon);
          } else {
            const themeUrl = item.themeUrl || item.url || '';
            const host = item.host || getHostFromUrl(themeUrl) || '';
            const siteName = getSiteDisplayName(host, item.title);
            icon.alt = siteName || t('site_icon_alt', '站点');
            attachFaviconWithFallbacks(icon, item.url, host, {
              primaryUrl: getPrimaryFaviconCandidateForBookmark(item.url),
              browserUrl: getBrowserFaviconCandidateForBookmark(item.url, host)
            });
          }
        }

        const openNestedLevel = (openOptions) => {
          if (!isFolder) {
            return;
          }
          const existingChildEntry = getBookmarkCascadeLevelEntry(safeLevelIndex + 1);
          if (existingChildEntry &&
              String(existingChildEntry.folderId || '') === String(item.id || '')) {
            if (itemButton.getAttribute('data-active') !== 'true') {
              setBookmarkCascadeLevelActiveItem(levelElement, itemButton);
              itemButton.setAttribute('aria-expanded', 'true');
            }
            if (openOptions && openOptions.focusChild) {
              selectFirstBookmarkCascadeItemInLevel(existingChildEntry.levelIndex, { focus: true });
            }
            updateBookmarkCascadeDebugTriangle();
            return;
          }
          setBookmarkCascadeLevelActiveItem(levelElement, itemButton);
          itemButton.setAttribute('aria-expanded', 'true');
          const childEntry = renderBookmarkCascadeMenuLevel(item.id, safeLevelIndex + 1, itemButton, levelElement, item.title);
          if (openOptions && openOptions.focusChild && childEntry) {
            selectFirstBookmarkCascadeItemInLevel(childEntry.levelIndex, { focus: true });
          }
        };

        const activateLeafItem = () => {
          setBookmarkCascadeLevelActiveItem(levelElement, itemButton);
          clearBookmarkCascadeLevelsFrom(safeLevelIndex + 1);
        };

        const navigateLeafItem = (event) => {
          cancelBookmarkCascadeHoverIntent();
          hideCursorTooltip();
          if (!shouldOpenUrlInBackground(event)) {
            close();
          }
          openBookmarkCascadeUrl(item.url, event);
        };

        bookmarkCascadeItemActions.set(itemButton, {
          item,
          isFolder,
          openNestedLevel,
          activateLeafItem,
          navigateLeafItem
        });

        if (isFolder) {
          itemRow.classList.add('x-nt-bookmark-cascade-row--folder');
          itemButton.classList.add('x-nt-bookmark-cascade-item--folder');
          itemButton.setAttribute('aria-haspopup', 'menu');
          itemButton.setAttribute('aria-expanded', 'false');
          itemButton.addEventListener('pointerenter', (event) => {
            clearBookmarkCascadePointerActiveItem(levelElement, itemButton, event);
            scheduleBookmarkCascadeHoverIntent({
              levelIndex: safeLevelIndex,
              triggerElement: itemButton,
              label: t('newtab_bookmark_cascade_debug_open_label', 'Open'),
              run: openNestedLevel
            }, event);
          });
          itemButton.addEventListener('pointerleave', (event) => {
            cancelBookmarkCascadeHoverIntentFor(itemButton);
            setBookmarkCascadeItemHoverSuppressed(itemButton, false);
            clearBookmarkCascadePointerActiveItem(levelElement, null, event);
          });
          itemButton.addEventListener('focus', () => {
            cancelBookmarkCascadeHoverIntent();
            setBookmarkCascadeLevelActiveItem(levelElement, itemButton);
            clearBookmarkCascadeLevelsFrom(safeLevelIndex + 1);
          });
          itemButton.addEventListener('click', (event) => {
            if (consumeBookmarkDragClickSuppression(itemButton)) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            cancelBookmarkCascadeHoverIntent();
            openNestedLevel();
          });
          itemButton.addEventListener('keydown', (event) => {
            if (!event) {
              return;
            }
            if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              cancelBookmarkCascadeHoverIntent();
              openNestedLevel();
            }
          });
        } else {
          createBookmarkCascadeCopyTrigger(
            itemRow,
            item,
            activateLeafItem,
            itemView.copyButton
          );
          bindCursorTooltip(itemButton, () => titleText, {
            maxWidth: 460,
            shouldShow: (_target, event) => shouldOpenUrlInBackground(event)
          });
          itemButton.addEventListener('pointerenter', (event) => {
            clearBookmarkCascadePointerActiveItem(levelElement, itemButton, event);
            scheduleBookmarkCascadeHoverIntent({
              levelIndex: safeLevelIndex,
              triggerElement: itemButton,
              label: t('newtab_bookmark_cascade_debug_switch_label', 'Switch'),
              run: activateLeafItem
            }, event);
          });
          itemButton.addEventListener('pointerleave', (event) => {
            if (event && event.relatedTarget &&
                typeof itemRow.contains === 'function' &&
                itemRow.contains(event.relatedTarget)) {
              return;
            }
            cancelBookmarkCascadeHoverIntentFor(itemButton);
            setBookmarkCascadeItemHoverSuppressed(itemButton, false);
            clearBookmarkCascadePointerActiveItem(levelElement, null, event);
          });
          itemButton.addEventListener('focus', () => {
            cancelBookmarkCascadeHoverIntent();
            activateLeafItem();
          });
          itemButton.addEventListener('click', (event) => {
            if (consumeBookmarkDragClickSuppression(itemButton)) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            navigateLeafItem(event);
          });
          itemButton.addEventListener('auxclick', (event) => {
            if (!event || Number(event.button) !== 1) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            navigateLeafItem(event);
          });
          itemButton.addEventListener('keydown', (event) => {
            if (!event || (event.key !== 'Enter' && event.key !== ' ')) {
              return;
            }
            event.preventDefault();
            navigateLeafItem(event);
          });
        }
        if (itemRow.parentNode !== contentElement) {
          contentElement.appendChild(itemRow);
        }
      });

      bookmarkCascadeMenu.appendChild(levelElement);
      lockBookmarkCascadeLevelWidth(levelElement);
      const entry = {
        folderId: String(folderId || ''),
        folderTitle: String(folderTitle || ''),
        levelIndex: safeLevelIndex,
        levelElement,
        triggerElement: safeLevelIndex > 0 ? triggerElement : bookmarkCascadeAnchor,
        parentLevelElement: safeLevelIndex > 0 ? parentLevelElement : null,
        viewController
      };
      bookmarkCascadeLevels.push(entry);
      positionBookmarkCascadeLevel(entry);
      openBookmarkCascadeLevelSurface(levelElement);
      updateBookmarkCascadeDebugTriangle();
      scheduleBookmarkCascadeDelayDebugLabel();
      return entry;
    }

    function open(item, anchorElement, openOptions) {
      const optionsForOpen = openOptions && typeof openOptions === 'object' ? openOptions : {};
      const dragMode = optionsForOpen.dragMode === true;
      const folderId = String(item && item.id || '').trim();
      if (!folderId || !anchorElement || !documentObj || !documentObj.body) {
        return;
      }
      if (isBookmarkCascadeMenuOpenFor(folderId, anchorElement, dragMode)) {
        cancelBookmarkCascadeHoverIntent();
        cancelBookmarkCascadeDelayedClose();
        positionBookmarkCascadeLevels();
        return;
      }
      if (!dragMode && isBookmarkCascadeHoverSuppressed(anchorElement, null)) {
        if (typeof anchorElement._xSetBookmarkMenuVisualActive === 'function') {
          anchorElement._xSetBookmarkMenuVisualActive(false);
        }
        return;
      }
      Promise.resolve(ensureReady(false)).then((ready) => {
        if (typeof optionsForOpen.shouldOpen === 'function' && !optionsForOpen.shouldOpen()) {
          return;
        }
        if (!dragMode && isBookmarkCascadeHoverSuppressed(anchorElement, null)) {
          if (typeof anchorElement._xSetBookmarkMenuVisualActive === 'function') {
            anchorElement._xSetBookmarkMenuVisualActive(false);
          }
          return;
        }
        if (!ready || !anchorElement.isConnected) {
          if (typeof anchorElement._xSetBookmarkMenuVisualActive === 'function') {
            anchorElement._xSetBookmarkMenuVisualActive(false);
          }
          return;
        }
        if (isBookmarkCascadeMenuOpenFor(folderId, anchorElement, dragMode)) {
          cancelBookmarkCascadeHoverIntent();
          cancelBookmarkCascadeDelayedClose();
          positionBookmarkCascadeLevels();
          return;
        }
        close();
        bookmarkCascadeAnchor = anchorElement;
        bookmarkCascadeAnchor.setAttribute('aria-expanded', 'true');
        if (typeof bookmarkCascadeAnchor._xSetBookmarkMenuVisualActive === 'function') {
          bookmarkCascadeAnchor._xSetBookmarkMenuVisualActive(true);
        }
        bookmarkCascadeMenu = view.createMenu(documentObj);
        bookmarkCascadeMenu.setAttribute('role', 'menu');
        setBookmarkCascadeDragMode(dragMode);
        documentObj.body.appendChild(bookmarkCascadeMenu);
        ensureBookmarkCascadeDebugElements();
        bookmarkCascadeKeyboardLevelIndex = 0;
        renderBookmarkCascadeMenuLevel(folderId, 0, anchorElement, null, item.title);
        if (!dragMode) {
          selectFirstBookmarkCascadeItemInLevel(0, { focus: true });
        }
      });
    }

    function getBookmarkCascadeRootFolderId() {
      const rootEntry = getBookmarkCascadeLevelEntry(0);
      return rootEntry ? String(rootEntry.folderId || '') : '';
    }

    function isBookmarkCascadeMenuOpenFor(folderId, anchorElement, dragMode) {
      return Boolean(
        bookmarkCascadeMenu &&
        bookmarkCascadeAnchor === anchorElement &&
        getBookmarkCascadeRootFolderId() === folderId &&
        bookmarkCascadeDragMode === dragMode
      );
    }

    function rebindBookmarkCascadeAnchor(anchorElement, rebindOptions) {
      if (!bookmarkCascadeMenu || !anchorElement || !anchorElement.isConnected) {
        return false;
      }
      const rootFolderId = getBookmarkCascadeRootFolderId();
      const anchorFolderId = String(anchorElement.getAttribute('data-bookmark-id') || '');
      if (!rootFolderId || anchorFolderId !== rootFolderId) {
        return false;
      }
      const visualOptions = {
        instant: !rebindOptions || rebindOptions.instant !== false
      };
      const previousAnchor = bookmarkCascadeAnchor;
      if (previousAnchor && previousAnchor !== anchorElement) {
        previousAnchor.setAttribute('aria-expanded', 'false');
        if (typeof previousAnchor._xSetBookmarkMenuVisualActive === 'function') {
          previousAnchor._xSetBookmarkMenuVisualActive(false, visualOptions);
        }
      }
      bookmarkCascadeAnchor = anchorElement;
      bookmarkCascadeAnchor.setAttribute('aria-expanded', 'true');
      if (typeof bookmarkCascadeAnchor._xSetBookmarkMenuVisualActive === 'function') {
        bookmarkCascadeAnchor._xSetBookmarkMenuVisualActive(true, visualOptions);
      }
      const rootEntry = getBookmarkCascadeLevelEntry(0);
      if (rootEntry) {
        rootEntry.triggerElement = bookmarkCascadeAnchor;
      }
      positionBookmarkCascadeLevels();
      return true;
    }

    function refreshBookmarkCascadeMenu(refreshOptions) {
      if (!bookmarkCascadeMenu || !bookmarkCascadeAnchor || bookmarkCascadeLevels.length === 0) {
        return Promise.resolve(false);
      }
      const menuAtRefreshStart = bookmarkCascadeMenu;
      const rowRectsBeforeRefresh = getBookmarkCascadeRowRectMap();
      const openPath = bookmarkCascadeLevels.map((entry) => ({
        folderId: String((entry && entry.folderId) || ''),
        folderTitle: String((entry && entry.folderTitle) || '')
      }));
      // The caller invalidates the shared runtime before refreshing. Reuse the
      // in-flight reload so the cascade and card surface cannot cancel each other.
      return Promise.resolve(ensureReady(false)).then((ready) => {
        const anchorAtRefresh = bookmarkCascadeAnchor;
        if (!ready ||
            bookmarkCascadeMenu !== menuAtRefreshStart ||
            !anchorAtRefresh ||
            !anchorAtRefresh.isConnected ||
            !openPath[0] ||
            !openPath[0].folderId) {
          return false;
        }
        cancelBookmarkCascadeHoverIntent();
        cancelBookmarkCascadeDelayedClose();
        clearBookmarkCascadeDragTarget();
        bookmarkCascadeRefreshInProgress = true;
        bookmarkCascadeMenu.setAttribute('data-refreshing', 'true');
        try {
          clearBookmarkCascadeLevelsFrom(0);
          anchorAtRefresh.setAttribute('aria-expanded', 'true');
          const rootEntry = renderBookmarkCascadeMenuLevel(
            openPath[0].folderId,
            0,
            anchorAtRefresh,
            null,
            openPath[0].folderTitle
          );
          if (!rootEntry) {
            return false;
          }
          for (let pathIndex = 1; pathIndex < openPath.length; pathIndex += 1) {
            const parentEntry = getBookmarkCascadeLevelEntry(pathIndex - 1);
            const pathItem = openPath[pathIndex];
            const triggerElement = parentEntry
              ? getBookmarkCascadeLevelItems(parentEntry.levelElement).find((button) =>
                String(button.getAttribute('data-bookmark-id') || '') === pathItem.folderId
              )
              : null;
            const action = triggerElement ? bookmarkCascadeItemActions.get(triggerElement) : null;
            if (!action || !action.isFolder) {
              break;
            }
            action.openNestedLevel();
          }
          positionBookmarkCascadeLevels();
          playBookmarkCascadeRowLayoutAnimation(rowRectsBeforeRefresh, refreshOptions);
          return true;
        } finally {
          bookmarkCascadeRefreshInProgress = false;
          requestFrame(() => {
            if (bookmarkCascadeMenu === menuAtRefreshStart) {
              bookmarkCascadeMenu.removeAttribute('data-refreshing');
            }
          });
        }
      });
    }

    function getBookmarkCascadeDragDropTargetAtPoint(point) {
      if (!point || !bookmarkCascadeMenu) {
        return null;
      }
      for (let levelIndex = bookmarkCascadeLevels.length - 1; levelIndex >= 0; levelIndex -= 1) {
        const entry = bookmarkCascadeLevels[levelIndex];
        const buttons = entry ? getBookmarkCascadeLevelItems(entry.levelElement) : [];
        const rows = buttons.map((button) => {
          const row = typeof button.closest === 'function'
            ? button.closest('.x-nt-bookmark-cascade-row')
            : null;
          return {
            button,
            row,
            rect: getBookmarkCascadeElementRect(row || button)
          };
        });
        for (let itemIndex = 0; itemIndex < buttons.length; itemIndex += 1) {
          const rowEntry = rows[itemIndex];
          const button = rowEntry.button;
          const row = rowEntry.row;
          const rect = rowEntry.rect;
          if (!rect) {
            continue;
          }
          const previousRect = itemIndex > 0 ? rows[itemIndex - 1].rect : null;
          const nextRect = itemIndex < rows.length - 1 ? rows[itemIndex + 1].rect : null;
          const hitRect = {
            left: rect.left,
            right: rect.right,
            top: previousRect ? (previousRect.bottom + rect.top) / 2 : rect.top,
            bottom: nextRect ? (rect.bottom + nextRect.top) / 2 : rect.bottom
          };
          if (!isPointInsideRect(point, hitRect)) {
            continue;
          }
          const itemIndexValue = Number(button.getAttribute('data-bookmark-index'));
          if (!Number.isFinite(itemIndexValue)) {
            return null;
          }
          const relativeY = rect.height > 0
            ? Math.max(0, Math.min(1, (point.y - rect.top) / rect.height))
            : 0.5;
          const isFolder = button.getAttribute('data-type') === 'folder';
          if (isFolder &&
              relativeY >= BOOKMARK_CASCADE_FOLDER_DROP_MIN_RATIO &&
              relativeY <= BOOKMARK_CASCADE_FOLDER_DROP_MAX_RATIO) {
            return {
              button,
              entry,
              kind: 'cascade',
              folderId: button.getAttribute('data-bookmark-drop-folder-id') || '',
              title: button.getAttribute('data-bookmark-drop-folder-title') || '',
              element: button
            };
          }
          const markerPosition = isFolder
            ? (relativeY < BOOKMARK_CASCADE_FOLDER_DROP_MIN_RATIO ? 'before' : 'after')
            : (relativeY < 0.5 ? 'before' : 'after');
          return {
            button,
            entry,
            kind: 'insertion',
            folderId: String(entry.folderId || ''),
            index: itemIndexValue + (markerPosition === 'after' ? 1 : 0),
            element: row || button,
            markerElement: row || button,
            markerPosition
          };
        }
      }
      return null;
    }

    function clearBookmarkCascadeDragTarget() {
      if (bookmarkCascadeDragTargetButton) {
        bookmarkCascadeDragTargetButton.removeAttribute('data-bookmark-drop-target');
      }
      if (bookmarkCascadeDragInsertionElement) {
        bookmarkCascadeDragInsertionElement.removeAttribute('data-bookmark-insert-position');
      }
      bookmarkCascadeDragTargetButton = null;
      bookmarkCascadeDragInsertionElement = null;
    }

    function updateBookmarkCascadeDragPointer(pointInput) {
      if (!bookmarkCascadeMenu || !bookmarkCascadeDragMode) {
        return null;
      }
      const point = getBookmarkCascadePointFromEvent(pointInput);
      if (!point) {
        return null;
      }
      updateBookmarkCascadePointer(pointInput);
      updateBookmarkCascadeDebugTriangle();
      const match = getBookmarkCascadeDragDropTargetAtPoint(point);
      if (!match) {
        clearBookmarkCascadeDragTarget();
        const isInsideInteractiveArea = isBookmarkCascadePointInsideInteractiveArea(point);
        if (isInsideInteractiveArea) {
          cancelBookmarkCascadeDelayedClose();
        } else {
          scheduleBookmarkCascadeDelayedClose();
        }
        return isInsideInteractiveArea
          ? { kind: 'blocked', surface: 'cascade' }
          : null;
      }
      cancelBookmarkCascadeDelayedClose();
      const nextTargetButton = match.kind === 'cascade' ? match.button : null;
      const nextInsertionElement = match.kind === 'insertion' ? match.markerElement : null;
      const nextInsertionPosition = match.kind === 'insertion' ? match.markerPosition : '';
      const targetChanged = bookmarkCascadeDragTargetButton !== nextTargetButton ||
        bookmarkCascadeDragInsertionElement !== nextInsertionElement ||
        (nextInsertionElement &&
          nextInsertionElement.getAttribute('data-bookmark-insert-position') !== nextInsertionPosition);
      if (targetChanged) {
        clearBookmarkCascadeDragTarget();
        bookmarkCascadeDragTargetButton = nextTargetButton;
        bookmarkCascadeDragInsertionElement = nextInsertionElement;
        if (bookmarkCascadeDragTargetButton) {
          bookmarkCascadeDragTargetButton.setAttribute('data-bookmark-drop-target', 'true');
        }
        if (bookmarkCascadeDragInsertionElement) {
          bookmarkCascadeDragInsertionElement.setAttribute(
            'data-bookmark-insert-position',
            nextInsertionPosition
          );
        }
        const action = match.kind === 'cascade'
          ? bookmarkCascadeItemActions.get(match.button)
          : null;
        if (action && action.isFolder) {
          scheduleBookmarkCascadeHoverIntent({
            levelIndex: match.entry.levelIndex,
            triggerElement: match.button,
            label: t('newtab_bookmark_cascade_debug_open_label', 'Open'),
            allowWhenSuppressed: true,
            run: action.openNestedLevel
          }, {
            clientX: point.x,
            clientY: point.y,
            pointerType: 'mouse'
          });
          if (bookmarkCascadeHoverIntentTask) {
            bookmarkCascadeHoverIntentTask.deadline = getNow() + BOOKMARK_CASCADE_DRAG_OPEN_DELAY_MS;
            clearTimer(bookmarkCascadeHoverIntentTimer);
            bookmarkCascadeHoverIntentTimer = setTimer(
              runBookmarkCascadeHoverIntentTask,
              BOOKMARK_CASCADE_DRAG_OPEN_DELAY_MS
            );
          }
        } else {
          cancelBookmarkCascadeHoverIntent();
        }
      }
      return {
        folderId: match.folderId,
        title: match.title || '',
        index: match.index,
        element: match.element,
        markerElement: match.markerElement || null,
        markerPosition: match.markerPosition || '',
        kind: match.kind,
        surface: 'cascade'
      };
    }

    function handleDocumentPointerDown(event) {
      if (!bookmarkCascadeMenu) {
        return;
      }
      const target = event && event.target ? event.target : null;
      if (bookmarkCascadeMenu.contains(target) ||
          (bookmarkCascadeAnchor && (target === bookmarkCascadeAnchor || bookmarkCascadeAnchor.contains(target))) ||
          shouldKeepOpenForExternalNode(target)) {
        return;
      }
      close();
    }

    function handleDocumentKeyDown(event) {
      if (!event || !bookmarkCascadeMenu) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close({ restoreFocus: true });
        return;
      }
      handleBookmarkCascadeKeyboardNavigation(event);
    }

    if (documentObj && typeof documentObj.addEventListener === 'function') {
      documentObj.addEventListener('pointerdown', handleDocumentPointerDown, true);
      documentObj.addEventListener('pointermove', handleBookmarkCascadeDocumentPointerMove, true);
      documentObj.addEventListener('keydown', handleDocumentKeyDown, true);
    }

    return Object.freeze({
      close,
      createDebugControls: createBookmarkCascadeDebugControls,
      getDebugButton: () => bookmarkCascadeDebugButton,
      getDebugControl: () => bookmarkCascadeDebugControl,
      getRootFolderId: getBookmarkCascadeRootFolderId,
      isOpen: () => Boolean(bookmarkCascadeMenu),
      isDragMode: () => bookmarkCascadeDragMode,
      open,
      positionLevels: positionBookmarkCascadeLevels,
      rebindAnchor: rebindBookmarkCascadeAnchor,
      clearDragTarget: clearBookmarkCascadeDragTarget,
      refresh: refreshBookmarkCascadeMenu,
      setDebugEnabled: setBookmarkCascadeDebugEnabled,
      setDragMode: setBookmarkCascadeDragMode,
      updateDragPointer: updateBookmarkCascadeDragPointer
    });
  }

  return Object.freeze({
    createBookmarkCascadeMenuRuntime
  });
});
