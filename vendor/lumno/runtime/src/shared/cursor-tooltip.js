(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoCursorTooltip = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  const HOST_CLASS = '_x_extension_cursor_tooltip_host_2026_unique_';
  const TAG_CLASS = '_x_extension_cursor_tooltip_tag_2026_unique_';
  const TAG_KEY_CLASS = '_x_extension_cursor_tooltip_tag_key_2026_unique_';
  const TAG_LABEL_CLASS = '_x_extension_cursor_tooltip_tag_label_2026_unique_';
  const WINDOWS_LOGO_CLASS = '_x_extension_cursor_tooltip_windows_logo_2026_unique_';
  const WINDOWS_LOGO_PANE_CLASS = '_x_extension_cursor_tooltip_windows_logo_pane_2026_unique_';
  const DEFAULT_VISIBLE_ATTRIBUTE = 'data-visible';
  const DEFAULT_BOUND_ATTRIBUTE = 'data-cursor-tooltip-bound';
  const DEFAULT_TEXT_ATTRIBUTE = 'data-cursor-tooltip';

  function getBaseTooltip() {
    return (root && root.LumnoTooltip) || {};
  }

  function getDocument(options) {
    return (options && options.documentObj) || (root && root.document) || null;
  }

  function getWindow(options) {
    return (options && options.windowObj) || (root && root.window) || root || {};
  }

  function getNavigator(options) {
    const windowObj = getWindow(options);
    return (windowObj && windowObj.navigator) || (root && root.navigator) || {};
  }

  function isMacPlatform(options) {
    const navigatorObj = getNavigator(options);
    const source = `${navigatorObj.platform || ''} ${navigatorObj.userAgent || ''}`.toLowerCase();
    return /mac|iphone|ipad|ipod/.test(source);
  }

  function getCursorTooltipTagKeyText(options) {
    const config = options || {};
    if (typeof config.getTagKeyText === 'function') {
      return String(config.getTagKeyText(config) || '').trim();
    }
    if (config.tagKeyText !== undefined && config.tagKeyText !== null) {
      return String(config.tagKeyText || '').trim();
    }
    return isMacPlatform(config) ? '⌘' : 'win';
  }

  function getRequestAnimationFrame(windowObj) {
    if (windowObj && typeof windowObj.requestAnimationFrame === 'function') {
      return windowObj.requestAnimationFrame.bind(windowObj);
    }
    return (callback) => {
      if (root && typeof root.setTimeout === 'function') {
        root.setTimeout(callback, 0);
        return;
      }
      callback();
    };
  }

  function getSetTimeout(windowObj) {
    if (windowObj && typeof windowObj.setTimeout === 'function') {
      return windowObj.setTimeout.bind(windowObj);
    }
    if (root && typeof root.setTimeout === 'function') {
      return root.setTimeout.bind(root);
    }
    return (callback) => {
      callback();
      return 0;
    };
  }

  function getClearTimeout(windowObj) {
    if (windowObj && typeof windowObj.clearTimeout === 'function') {
      return windowObj.clearTimeout.bind(windowObj);
    }
    if (root && typeof root.clearTimeout === 'function') {
      return root.clearTimeout.bind(root);
    }
    return () => {};
  }

  function addClass(element, className) {
    if (!element || !className) {
      return;
    }
    if (element.classList && typeof element.classList.add === 'function') {
      element.classList.add(className);
      return;
    }
    const current = String(element.className || '');
    const parts = current.split(/\s+/).filter(Boolean);
    if (!parts.includes(className)) {
      parts.push(className);
      element.className = parts.join(' ');
    }
  }

  function setAttribute(element, name, value) {
    if (element && typeof element.setAttribute === 'function') {
      element.setAttribute(name, String(value));
    }
  }

  function setStyleProperty(element, name, value) {
    if (element && element.style && typeof element.style.setProperty === 'function') {
      element.style.setProperty(name, value);
    }
  }

  function normalizeCssLength(value) {
    if (value === undefined || value === null || value === '') {
      return '';
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) && value >= 0 ? `${value}px` : '';
    }
    return String(value).trim();
  }

  function getNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getElementRect(element, fallback) {
    if (element && typeof element.getBoundingClientRect === 'function') {
      return element.getBoundingClientRect();
    }
    return fallback || { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  function getPointFromInput(input, target) {
    const source = input || {};
    const x = Number(source.clientX !== undefined ? source.clientX : source.x);
    const y = Number(source.clientY !== undefined ? source.clientY : source.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { clientX: x, clientY: y };
    }
    const rect = getElementRect(target);
    return {
      clientX: rect.left + ((rect.width || 0) / 2),
      clientY: rect.bottom || (rect.top + (rect.height || 0))
    };
  }

  function getExplicitPointFromInput(input) {
    const source = input || {};
    const x = Number(source.clientX !== undefined ? source.clientX : source.x);
    const y = Number(source.clientY !== undefined ? source.clientY : source.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { clientX: x, clientY: y };
    }
    return null;
  }

  function isPointInsideElement(point, element) {
    if (!point || !element) {
      return false;
    }
    const rect = getElementRect(element);
    return point.clientX >= rect.left &&
      point.clientX <= rect.right &&
      point.clientY >= rect.top &&
      point.clientY <= rect.bottom;
  }

  function isSamePoint(point, referencePoint) {
    if (!point || !referencePoint) {
      return false;
    }
    return Math.abs(point.clientX - referencePoint.clientX) <= 1 &&
      Math.abs(point.clientY - referencePoint.clientY) <= 1;
  }

  function isTargetActive(target, doc, options) {
    const config = options || {};
    if (config.checkActive === false) {
      return true;
    }
    if (!target) {
      return false;
    }
    if (target.isConnected === false) {
      return false;
    }
    if (doc && doc.activeElement === target) {
      return true;
    }
    if (typeof target.matches === 'function') {
      try {
        return target.matches(':hover');
      } catch (error) {
        return true;
      }
    }
    return true;
  }

  function shouldShowTarget(target, options) {
    const config = options || {};
    if (typeof config.shouldShow !== 'function') {
      return true;
    }
    try {
      return config.shouldShow(target, config.inputEvent || null) !== false;
    } catch (error) {
      return false;
    }
  }

  function isElementTextTruncated(element, options) {
    if (!element) {
      return false;
    }
    const config = options || {};
    const checkHorizontal = config.horizontal !== false;
    const checkVertical = config.vertical === true;
    const clientWidth = Number(element.clientWidth);
    const scrollWidth = Number(element.scrollWidth);
    const clientHeight = Number(element.clientHeight);
    const scrollHeight = Number(element.scrollHeight);
    const hasHorizontalOverflow = checkHorizontal &&
      Number.isFinite(clientWidth) &&
      Number.isFinite(scrollWidth) &&
      clientWidth > 0 &&
      scrollWidth > clientWidth;
    const hasVerticalOverflow = checkVertical &&
      Number.isFinite(clientHeight) &&
      Number.isFinite(scrollHeight) &&
      clientHeight > 0 &&
      scrollHeight > clientHeight;
    return hasHorizontalOverflow || hasVerticalOverflow;
  }

  function createElement(doc, options, tooltipKind) {
    const baseTooltip = getBaseTooltip();
    const decorateElement = typeof options.decorateElement === 'function'
      ? options.decorateElement
      : null;
    const kind = tooltipKind || 'cursor';
    if (typeof baseTooltip.createElement === 'function') {
      return baseTooltip.createElement(doc, Object.assign({}, options, {
        tooltipKind: kind,
        decorateElement: (element) => {
          if (decorateElement) {
            decorateElement(element);
          }
        }
      }));
    }
    return null;
  }

  function renderText(element, text) {
    const baseTooltip = getBaseTooltip();
    if (typeof baseTooltip.renderText === 'function') {
      return baseTooltip.renderText(element, text);
    }
    if (element) {
      element.textContent = String(text || '');
    }
    return element;
  }

  function renderContent(element, text, options) {
    return renderText(element, text);
  }

  function clearElement(element) {
    renderText(element, '');
  }

  function isWindowsLogoKeyText(text) {
    return String(text || '').trim().toLowerCase() === 'win';
  }

  function getCursorTooltipTagText(target, pointInput, options) {
    const config = options || {};
    if (typeof config.getTagText === 'function') {
      return String(config.getTagText(pointInput || {}, target) || '').trim();
    }
    return String(config.tagText || '').trim();
  }

  function positionAtPoint(element, point, options) {
    if (!element || !point) {
      return null;
    }
    const config = options || {};
    const windowObj = getWindow(config);
    const positionMode = config.positionMode === 'absolute' ? 'absolute' : 'fixed';
    const margin = getNumber(config.margin, 8);
    const offsetX = getNumber(config.offsetX, 14);
    const offsetY = getNumber(config.offsetY, 16);
    const viewportWidth = getNumber(windowObj.innerWidth, 1024);
    const viewportHeight = getNumber(windowObj.innerHeight, 768);
    const boundaryElement = config.boundaryElement || null;
    const boundaryRect = positionMode === 'absolute'
      ? getElementRect(boundaryElement, { top: 0, left: 0, right: viewportWidth, bottom: viewportHeight, width: viewportWidth, height: viewportHeight })
      : { top: 0, left: 0, right: viewportWidth, bottom: viewportHeight, width: viewportWidth, height: viewportHeight };
    const availableWidth = Math.max(180, Math.floor((boundaryRect.width || viewportWidth) - (margin * 2)));
    const configuredMaxWidth = config.maxWidth === undefined ? 420 : config.maxWidth;
    const resolvedMaxWidth = typeof configuredMaxWidth === 'number'
      ? `${Math.min(configuredMaxWidth, availableWidth)}px`
      : (normalizeCssLength(configuredMaxWidth) || `${availableWidth}px`);
    setStyleProperty(element, 'max-width', resolvedMaxWidth);
    setStyleProperty(element, 'width', 'max-content');
    setAttribute(element, 'data-tooltip-position', positionMode);

    const tooltipRect = getElementRect(element);
    const pointerLeft = getNumber(point.clientX !== undefined ? point.clientX : point.x, 0) - boundaryRect.left;
    const pointerTop = getNumber(point.clientY !== undefined ? point.clientY : point.y, 0) - boundaryRect.top;
    let left = pointerLeft + offsetX;
    let top = pointerTop + offsetY;
    if (left + tooltipRect.width + margin > (boundaryRect.width || viewportWidth)) {
      left = pointerLeft - tooltipRect.width - offsetX;
    }
    if (top + tooltipRect.height + margin > (boundaryRect.height || viewportHeight)) {
      top = pointerTop - tooltipRect.height - offsetY;
    }

    const maxTop = Math.max(margin, (boundaryRect.height || viewportHeight) - tooltipRect.height - margin);
    const maxLeft = Math.max(margin, (boundaryRect.width || viewportWidth) - tooltipRect.width - margin);
    top = Math.max(margin, Math.min(top, maxTop));
    left = Math.max(margin, Math.min(left, maxLeft));
    setStyleProperty(element, 'top', `${Math.round(top)}px`);
    setStyleProperty(element, 'left', `${Math.round(left)}px`);
    return Object.freeze({ top: Math.round(top), left: Math.round(left) });
  }

  function createController(options) {
    const config = options || {};
    const documentObj = getDocument(config);
    const windowObj = getWindow(config);
    const requestFrame = getRequestAnimationFrame(windowObj);
    const setTimer = getSetTimeout(windowObj);
    const clearTimer = getClearTimeout(windowObj);
    let element = null;
    let tagElement = null;
    let hideTimer = null;
    let currentTarget = null;
    let lastPoint = null;
    let activeBinding = null;
    let modifierListenersAttached = false;
    let token = 0;

    function ensureElement() {
      if (element) {
        return element;
      }
      element = createElement(documentObj, config);
      const appendTo = config.appendTo || (documentObj && documentObj.body);
      if (appendTo && typeof appendTo.appendChild === 'function' && element) {
        appendTo.appendChild(element);
      }
      return element;
    }

    function ensureTagElement() {
      if (tagElement) {
        return tagElement;
      }
      const tagOptions = Object.assign({}, config, {
        id: config.id ? `${config.id}_tag` : '',
        className: [config.className, TAG_CLASS].filter(Boolean).join(' ')
      });
      tagElement = createElement(documentObj, tagOptions, 'cursor-tag');
      if (tagElement) {
        setAttribute(tagElement, 'data-cursor-tooltip-tag', 'true');
      }
      const appendTo = config.appendTo || (documentObj && documentObj.body);
      if (appendTo && typeof appendTo.appendChild === 'function' && tagElement) {
        appendTo.appendChild(tagElement);
      }
      return tagElement;
    }

    function hideCursorTooltipTag() {
      if (element) {
        setAttribute(element, 'data-cursor-tooltip-tag-visible', 'false');
      }
      if (!tagElement) {
        return null;
      }
      setAttribute(tagElement, DEFAULT_VISIBLE_ATTRIBUTE, 'false');
      setAttribute(tagElement, 'aria-hidden', 'true');
      return tagElement;
    }

    function renderCursorTooltipTag(tagText, renderOptions) {
      const text = String(tagText || '').trim();
      if (element) {
        setAttribute(element, 'data-cursor-tooltip-tag-visible', text ? 'true' : 'false');
      }
      if (!text) {
        hideCursorTooltipTag();
        return null;
      }
      const tag = ensureTagElement();
      if (!tag) {
        return null;
      }
      const keyText = getCursorTooltipTagKeyText(Object.assign({}, config, renderOptions || {}));
      const drawWindowsLogo = isWindowsLogoKeyText(keyText);
      const tooltipView = root && root.LumnoTooltipView;
      if (!tooltipView || typeof tooltipView.renderCursorTag !== 'function') {
        return null;
      }
      tooltipView.renderCursorTag(tag, {
        keyText,
        label: text,
        windowsLogo: drawWindowsLogo
      });
      setAttribute(tag, 'aria-label', `${keyText} ${text}`.trim());
      setAttribute(tag, DEFAULT_VISIBLE_ATTRIBUTE, 'false');
      setAttribute(tag, 'aria-hidden', 'true');
      return tag;
    }

    function setCursorTooltipTagVisible(visible) {
      if (!tagElement) {
        return;
      }
      const nextVisible = visible ? 'true' : 'false';
      setAttribute(tagElement, DEFAULT_VISIBLE_ATTRIBUTE, nextVisible);
      setAttribute(tagElement, 'aria-hidden', visible ? 'false' : 'true');
    }

    function positionCursorTooltipTag(tag, tooltipPosition, options) {
      if (!tag || !tooltipPosition) {
        return null;
      }
      const positionOptions = options || {};
      const positionMode = positionOptions.positionMode === 'absolute' ? 'absolute' : 'fixed';
      const margin = getNumber(positionOptions.margin, 8);
      const gap = getNumber(positionOptions.tagGap, 6);
      const viewportWidth = getNumber(windowObj.innerWidth, 1024);
      const viewportHeight = getNumber(windowObj.innerHeight, 768);
      const boundaryElement = positionOptions.boundaryElement || null;
      const boundaryRect = positionMode === 'absolute'
        ? getElementRect(boundaryElement, { top: 0, left: 0, right: viewportWidth, bottom: viewportHeight, width: viewportWidth, height: viewportHeight })
        : { top: 0, left: 0, right: viewportWidth, bottom: viewportHeight, width: viewportWidth, height: viewportHeight };
      const availableWidth = Math.max(120, Math.floor((boundaryRect.width || viewportWidth) - (margin * 2)));
      const configuredMaxWidth = positionOptions.tagMaxWidth === undefined ? 220 : positionOptions.tagMaxWidth;
      const resolvedMaxWidth = typeof configuredMaxWidth === 'number'
        ? `${Math.min(configuredMaxWidth, availableWidth)}px`
        : (normalizeCssLength(configuredMaxWidth) || `${availableWidth}px`);
      setStyleProperty(tag, 'max-width', resolvedMaxWidth);
      setStyleProperty(tag, 'width', 'max-content');
      setAttribute(tag, 'data-tooltip-position', positionMode);

      const tagRect = getElementRect(tag);
      const maxLeft = Math.max(margin, (boundaryRect.width || viewportWidth) - tagRect.width - margin);
      const maxTop = Math.max(margin, (boundaryRect.height || viewportHeight) - tagRect.height - margin);
      const left = Math.max(margin, Math.min(tooltipPosition.left, maxLeft));
      const top = Math.max(margin, Math.min(tooltipPosition.top - tagRect.height - gap, maxTop));
      setStyleProperty(tag, 'left', `${Math.round(left)}px`);
      setStyleProperty(tag, 'top', `${Math.round(top)}px`);
      return Object.freeze({ top: Math.round(top), left: Math.round(left) });
    }

    function setActiveBinding(target, resolveText, settings, pointInput) {
      activeBinding = {
        target,
        resolveText,
        settings: settings || {},
        lastPoint: getPointFromInput(pointInput, target)
      };
    }

    function clearActiveBinding(target) {
      if (!target || (activeBinding && activeBinding.target === target)) {
        activeBinding = null;
      }
    }

    function getNodeParent(node) {
      return (node && (node.parentElement || node.parentNode)) || null;
    }

    function isNodeContainedBy(container, node) {
      if (!container || !node) {
        return false;
      }
      if (container === node) {
        return true;
      }
      if (typeof container.contains === 'function') {
        try {
          return container.contains(node);
        } catch (error) {
          return false;
        }
      }
      let current = node;
      while (current) {
        if (current === container) {
          return true;
        }
        current = getNodeParent(current);
      }
      return false;
    }

    function getBoundHandoffTarget(node, boundAttribute, rootNode) {
      let current = node;
      while (current && current !== rootNode) {
        if (
          typeof current.getAttribute === 'function' &&
          current.getAttribute(boundAttribute) === 'true'
        ) {
          return current;
        }
        current = getNodeParent(current);
      }
      return null;
    }

    function shouldDeferBoundTooltipHide(event, target, settings, boundAttribute) {
      if (!settings || settings.deferHideVisibility !== true || !event) {
        return false;
      }
      const relatedTarget = event.relatedTarget || null;
      if (!relatedTarget || relatedTarget === target) {
        return false;
      }
      const handoffRoot = settings.handoffRoot || settings.handoffElement || getNodeParent(target);
      if (!handoffRoot || !isNodeContainedBy(handoffRoot, relatedTarget)) {
        return false;
      }
      const relatedBoundTarget = getBoundHandoffTarget(relatedTarget, boundAttribute, handoffRoot);
      return Boolean(relatedBoundTarget && relatedBoundTarget !== target);
    }

    function shouldIgnoreStaleEnter(event, target, settings) {
      if (
        !settings ||
        settings.preserveVisibleOnTargetSwitch !== true ||
        !currentTarget ||
        currentTarget === target
      ) {
        return false;
      }
      const point = getExplicitPointFromInput(event);
      const staleEnter = isSamePoint(point, lastPoint) || isPointInsideElement(point, currentTarget);
      if (staleEnter && hideTimer) {
        clearTimer(hideTimer);
        hideTimer = null;
        token += 1;
      }
      return staleEnter;
    }

    function getModifierRefreshInput(event, binding) {
      const source = event || {};
      const point = (binding && binding.lastPoint) || lastPoint || getPointFromInput(null, binding && binding.target);
      return {
        type: source.type || 'modifierchange',
        key: source.key || '',
        clientX: point.clientX,
        clientY: point.clientY,
        metaKey: Boolean(source.metaKey),
        ctrlKey: Boolean(source.ctrlKey),
        altKey: Boolean(source.altKey),
        shiftKey: Boolean(source.shiftKey)
      };
    }

    function isModifierRefreshEvent(event) {
      if (!event) {
        return false;
      }
      const key = String(event.key || '');
      return Boolean(
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        key === 'Meta' ||
        key === 'Control' ||
        key === 'Alt' ||
        key === 'Shift'
      );
    }

    function hideWithOptions(hideOptions) {
      const preserveActiveBinding = Boolean(hideOptions && hideOptions.preserveActiveBinding);
      const deferVisibility = Boolean(hideOptions && hideOptions.deferVisibility);
      if (!preserveActiveBinding) {
        activeBinding = null;
      }
      if (!element) {
        hideCursorTooltipTag();
        return null;
      }
      token += 1;
      const hideToken = token;
      hideCursorTooltipTag();
      if (hideTimer) {
        clearTimer(hideTimer);
      }
      if (deferVisibility) {
        hideTimer = setTimer(() => {
          if (hideToken !== token || !element) {
            return;
          }
          currentTarget = null;
          setAttribute(element, DEFAULT_VISIBLE_ATTRIBUTE, 'false');
          setAttribute(element, 'aria-hidden', 'true');
          hideTimer = null;
        }, getNumber(config.hideDelay, 120));
        return element;
      }
      currentTarget = null;
      setAttribute(element, DEFAULT_VISIBLE_ATTRIBUTE, 'false');
      setAttribute(element, 'aria-hidden', 'true');
      hideTimer = setTimer(() => {
        if (hideToken !== token || !element) {
          return;
        }
        setAttribute(element, DEFAULT_VISIBLE_ATTRIBUTE, 'false');
        hideTimer = null;
      }, getNumber(config.hideDelay, 120));
      return element;
    }

    function refreshActiveBinding(event) {
      const binding = activeBinding;
      if (!binding || !binding.target) {
        return null;
      }
      const input = getModifierRefreshInput(event, binding);
      const eventOptions = Object.assign({}, binding.settings, {
        inputEvent: input
      });
      if (!shouldShowTarget(binding.target, eventOptions)) {
        return hideWithOptions({ preserveActiveBinding: true });
      }
      return show(binding.target, binding.resolveText(binding.target), input, eventOptions);
    }

    function handleModifierRefreshEvent(event) {
      if (!isModifierRefreshEvent(event)) {
        return;
      }
      refreshActiveBinding(event);
    }

    function handleModifierBlur() {
      refreshActiveBinding({
        type: 'blur',
        key: '',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false
      });
    }

    function attachModifierListeners() {
      if (modifierListenersAttached) {
        return;
      }
      const listenerTarget = windowObj && typeof windowObj.addEventListener === 'function'
        ? windowObj
        : (documentObj && typeof documentObj.addEventListener === 'function' ? documentObj : null);
      if (!listenerTarget) {
        return;
      }
      modifierListenersAttached = true;
      listenerTarget.addEventListener('keydown', handleModifierRefreshEvent, true);
      listenerTarget.addEventListener('keyup', handleModifierRefreshEvent, true);
      listenerTarget.addEventListener('blur', handleModifierBlur, true);
    }

    function show(target, text, pointInput, showOptions) {
      const content = String(text || '');
      const mergedOptions = Object.assign({}, config, showOptions || {}, {
        inputEvent: pointInput || null
      });
      if (!target || !content || !shouldShowTarget(target, mergedOptions)) {
        return null;
      }
      const tooltip = ensureElement();
      if (!tooltip) {
        return null;
      }
      if (hideTimer) {
        clearTimer(hideTimer);
        hideTimer = null;
      }
      token += 1;
      const showToken = token;
      currentTarget = target;
      lastPoint = getPointFromInput(pointInput, target);
      renderContent(tooltip, content, mergedOptions);
      const tag = renderCursorTooltipTag(getCursorTooltipTagText(target, pointInput, mergedOptions), mergedOptions);
      const preserveVisible = Boolean(
        mergedOptions.preserveVisibleOnTargetSwitch &&
        typeof tooltip.getAttribute === 'function' &&
        tooltip.getAttribute(DEFAULT_VISIBLE_ATTRIBUTE) === 'true'
      );
      if (!preserveVisible) {
        setAttribute(tooltip, DEFAULT_VISIBLE_ATTRIBUTE, 'false');
        setAttribute(tooltip, 'aria-hidden', 'true');
      } else {
        setAttribute(tooltip, DEFAULT_VISIBLE_ATTRIBUTE, 'true');
        setAttribute(tooltip, 'aria-hidden', 'false');
      }
      const tooltipPosition = positionAtPoint(tooltip, lastPoint, mergedOptions);
      positionCursorTooltipTag(tag, tooltipPosition, mergedOptions);
      requestFrame(() => {
        if (showToken !== token || currentTarget !== target || !isTargetActive(target, documentObj, mergedOptions)) {
          return;
        }
        setAttribute(tooltip, DEFAULT_VISIBLE_ATTRIBUTE, 'true');
        setAttribute(tooltip, 'aria-hidden', 'false');
        if (tag) {
          setCursorTooltipTagVisible(true);
        }
      });
      return tooltip;
    }

    function move(pointInput, moveOptions) {
      if (!element || !currentTarget) {
        return null;
      }
      lastPoint = getPointFromInput(pointInput, currentTarget);
      const mergedOptions = Object.assign({}, config, moveOptions || {}, {
        inputEvent: pointInput || null
      });
      if (!shouldShowTarget(currentTarget, mergedOptions)) {
        hide();
        return element;
      }
      const tag = renderCursorTooltipTag(getCursorTooltipTagText(currentTarget, pointInput, mergedOptions), mergedOptions);
      const tooltipPosition = positionAtPoint(element, lastPoint, mergedOptions);
      positionCursorTooltipTag(tag, tooltipPosition, mergedOptions);
      if (tag) {
        setCursorTooltipTagVisible(true);
      }
      return element;
    }

    function hide(hideOptions) {
      return hideWithOptions(hideOptions);
    }

    function bind(target, getText, bindOptions) {
      if (!target || typeof target.addEventListener !== 'function') {
        return null;
      }
      attachModifierListeners();
      const settings = bindOptions || {};
      const boundAttribute = settings.boundAttribute || DEFAULT_BOUND_ATTRIBUTE;
      if (typeof target.getAttribute === 'function' && target.getAttribute(boundAttribute) === 'true') {
        return target;
      }
      addClass(target, HOST_CLASS);
      if (typeof target.setAttribute === 'function') {
        target.setAttribute(boundAttribute, 'true');
      }
      if (
        settings.suppressNativeTitle !== false &&
        typeof target.getAttribute === 'function' &&
        typeof target.removeAttribute === 'function'
      ) {
        const nativeTitle = target.getAttribute('title');
        if (nativeTitle) {
          target.setAttribute('data-cursor-tooltip-native-title', nativeTitle);
          target.removeAttribute('title');
        }
      }
      const resolveText = typeof getText === 'function'
        ? getText
        : () => (typeof target.getAttribute === 'function'
          ? target.getAttribute(settings.attributeName || DEFAULT_TEXT_ATTRIBUTE)
          : '');
      const getEventOptions = (event) => Object.assign({}, settings, {
        inputEvent: event || null
      });
      const showBoundTooltip = (event) => {
        if (shouldIgnoreStaleEnter(event, target, settings)) {
          return;
        }
        setActiveBinding(target, resolveText, settings, event);
        const eventOptions = getEventOptions(event);
        if (!shouldShowTarget(target, eventOptions)) {
          hideWithOptions({ preserveActiveBinding: true });
          return;
        }
        show(target, resolveText(target), event, eventOptions);
      };
      const moveBoundTooltip = (event) => {
        const eventOptions = getEventOptions(event);
        if (currentTarget && currentTarget !== target) {
          return;
        }
        setActiveBinding(target, resolveText, settings, event);
        if (!shouldShowTarget(target, eventOptions)) {
          hideWithOptions({ preserveActiveBinding: true });
          return;
        }
        if (!currentTarget) {
          show(target, resolveText(target), event, eventOptions);
          return;
        }
        move(event, eventOptions);
      };
      const showFocusTooltip = () => {
        setActiveBinding(target, resolveText, settings, null);
        const eventOptions = getEventOptions(null);
        if (!shouldShowTarget(target, eventOptions)) {
          hideWithOptions({ preserveActiveBinding: true });
          return;
        }
        show(target, resolveText(target), getPointFromInput(null, target), eventOptions);
      };
      const hideBoundTooltip = (event) => {
        if (currentTarget && currentTarget !== target) {
          clearActiveBinding(target);
          return;
        }
        clearActiveBinding(target);
        hide({
          deferVisibility: shouldDeferBoundTooltipHide(event, target, settings, boundAttribute)
        });
      };
      target.addEventListener('pointerenter', showBoundTooltip, true);
      target.addEventListener('pointermove', moveBoundTooltip);
      target.addEventListener('pointerleave', hideBoundTooltip);
      target.addEventListener('pointercancel', hideBoundTooltip);
      target.addEventListener('focus', showFocusTooltip);
      target.addEventListener('blur', hideBoundTooltip);
      return target;
    }

    function bindAll(rootNode, bindOptions) {
      const scope = rootNode || documentObj;
      if (!scope || typeof scope.querySelectorAll !== 'function') {
        return [];
      }
      const settings = bindOptions || {};
      const selector = settings.selector || `[${settings.attributeName || DEFAULT_TEXT_ATTRIBUTE}]`;
      return Array.from(scope.querySelectorAll(selector))
        .map((node) => bind(node, null, settings))
        .filter(Boolean);
    }

    return {
      get element() {
        return ensureElement();
      },
      get tagElement() {
        return ensureTagElement();
      },
      destroy() {
        token += 1;
        currentTarget = null;
        activeBinding = null;
        if (hideTimer) {
          clearTimer(hideTimer);
          hideTimer = null;
        }
        const tooltipView = root && root.LumnoTooltipView;
        [element, tagElement].forEach((target) => {
          if (target && tooltipView &&
              typeof tooltipView.destroyTooltipElement === 'function') {
            tooltipView.destroyTooltipElement(target);
          }
          if (target && target.parentNode) {
            target.parentNode.removeChild(target);
          }
        });
        element = null;
        tagElement = null;
      },
      show,
      move,
      hide,
      refresh: refreshActiveBinding,
      bind,
      bindAll
    };
  }

  return Object.freeze({
    hostClassName: HOST_CLASS,
    tagClassName: TAG_CLASS,
    tagKeyClassName: TAG_KEY_CLASS,
    tagLabelClassName: TAG_LABEL_CLASS,
    windowsLogoClassName: WINDOWS_LOGO_CLASS,
    createController,
    isElementTextTruncated,
    positionAtPoint
  });
});
