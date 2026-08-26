(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoTooltip = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  const TOOLTIP_CLASS = '_x_extension_tooltip_2026_unique_';
  const HOST_CLASS = '_x_extension_tooltip_host_2026_unique_';
  const LEGACY_HOST_CLASS = '_x_extension_tooltip_host_2024_unique_';
  const LINE_CLASS = '_x_extension_tooltip_line_2026_unique_';
  const DIVIDER_CLASS = '_x_extension_tooltip_divider_2026_unique_';
  const DEFAULT_VISIBLE_ATTRIBUTE = 'data-visible';
  const DEFAULT_BOUND_ATTRIBUTE = 'data-tooltip-bound';
  const DEFAULT_TEXT_ATTRIBUTE = 'data-tooltip';
  const DIVIDER_MARKER = '────────';

  function getDocument(options) {
    return (options && options.documentObj) || (root && root.document) || null;
  }

  function getWindow(options) {
    return (options && options.windowObj) || (root && root.window) || root || {};
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

  function getDynamicNumber(value, target, fallback) {
    const resolved = typeof value === 'function' ? value(target) : value;
    return getNumber(resolved, fallback);
  }

  function getElementRect(element, fallback) {
    if (element && typeof element.getBoundingClientRect === 'function') {
      return element.getBoundingClientRect();
    }
    return fallback || { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  function createElement(doc, options) {
    const documentObj = doc || getDocument(options);
    const tooltipView = root && root.LumnoTooltipView;
    if (!documentObj || !tooltipView ||
        typeof tooltipView.createTooltipElement !== 'function') {
      return null;
    }
    const config = options || {};
    const element = tooltipView.createTooltipElement({
      className: config.className || '',
      documentObj,
      id: config.id ? String(config.id) : '',
      kind: config.tooltipKind || '',
      positionMode: config.positionMode
    });
    if (typeof config.decorateElement === 'function') {
      config.decorateElement(element);
    }
    return element;
  }

  function renderText(element, text) {
    if (!element) {
      return null;
    }
    const tooltipView = root && root.LumnoTooltipView;
    if (!tooltipView || typeof tooltipView.renderTooltipText !== 'function') {
      return null;
    }
    tooltipView.renderTooltipText(element, String(text || ''));
    return element;
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

  function position(element, target, options) {
    if (!element || !target) {
      return null;
    }
    const config = options || {};
    const windowObj = getWindow(config);
    const positionMode = config.positionMode === 'absolute' ? 'absolute' : 'fixed';
    const placement = config.placement === 'left' || config.placement === 'left-above' || config.placement === 'bottom'
      ? config.placement
      : 'top';
    const margin = getNumber(config.margin, 8);
    const spacing = getDynamicNumber(config.spacing, target, 10);
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

    const targetRect = getElementRect(target);
    const tooltipRect = getElementRect(element);
    let top = 0;
    let left = 0;
    const targetTop = targetRect.top - boundaryRect.top;
    const targetBottom = targetRect.bottom - boundaryRect.top;
    const targetLeft = targetRect.left - boundaryRect.left;
    const targetRight = targetRect.right - boundaryRect.left;

    if (placement === 'left' || placement === 'left-above') {
      top = targetTop + ((targetRect.height - tooltipRect.height) / 2);
      left = targetLeft - tooltipRect.width - spacing;
      if (placement === 'left-above') {
        top = targetTop - tooltipRect.height - spacing;
      }
      if (left < margin) {
        left = targetRight + spacing;
      }
    } else if (placement === 'bottom') {
      top = targetBottom + spacing;
      left = targetLeft + ((targetRect.width - tooltipRect.width) / 2);
      if (top + tooltipRect.height + margin > (boundaryRect.height || viewportHeight)) {
        top = targetTop - tooltipRect.height - spacing;
      }
    } else {
      top = targetTop - tooltipRect.height - spacing;
      left = targetLeft + ((targetRect.width - tooltipRect.width) / 2);
      if (top < margin) {
        top = targetBottom + spacing;
      }
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
    let hideTimer = null;
    let currentTarget = null;
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

    function show(target, text, showOptions) {
      const content = String(text || '');
      if (!target || !content) {
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
      renderText(tooltip, content);
      setAttribute(tooltip, DEFAULT_VISIBLE_ATTRIBUTE, 'false');
      setAttribute(tooltip, 'aria-hidden', 'true');
      const mergedOptions = Object.assign({}, config, showOptions || {});
      position(tooltip, target, mergedOptions);
      requestFrame(() => {
        if (showToken !== token || currentTarget !== target || !isTargetActive(target, documentObj, mergedOptions)) {
          return;
        }
        setAttribute(tooltip, DEFAULT_VISIBLE_ATTRIBUTE, 'true');
        setAttribute(tooltip, 'aria-hidden', 'false');
      });
      return tooltip;
    }

    function hide() {
      if (!element) {
        return null;
      }
      token += 1;
      const hideToken = token;
      currentTarget = null;
      setAttribute(element, DEFAULT_VISIBLE_ATTRIBUTE, 'false');
      setAttribute(element, 'aria-hidden', 'true');
      if (hideTimer) {
        clearTimer(hideTimer);
      }
      hideTimer = setTimer(() => {
        if (hideToken !== token || !element) {
          return;
        }
        setAttribute(element, DEFAULT_VISIBLE_ATTRIBUTE, 'false');
        hideTimer = null;
      }, getNumber(config.hideDelay, 120));
      return element;
    }

    function bind(target, getText, bindOptions) {
      if (!target || typeof target.addEventListener !== 'function') {
        return null;
      }
      const settings = bindOptions || {};
      const boundAttribute = settings.boundAttribute || DEFAULT_BOUND_ATTRIBUTE;
      if (typeof target.getAttribute === 'function' && target.getAttribute(boundAttribute) === 'true') {
        return target;
      }
      addClass(target, HOST_CLASS);
      addClass(target, LEGACY_HOST_CLASS);
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
          target.setAttribute('data-tooltip-native-title', nativeTitle);
          target.removeAttribute('title');
        }
      }
      const resolveText = typeof getText === 'function'
        ? getText
        : () => (typeof target.getAttribute === 'function'
          ? target.getAttribute(settings.attributeName || DEFAULT_TEXT_ATTRIBUTE)
          : '');
      const showBoundTooltip = () => {
        show(target, resolveText(target), settings);
      };
      target.addEventListener('mouseenter', showBoundTooltip);
      target.addEventListener('mouseleave', hide);
      if (settings.showOnFocus !== false) {
        target.addEventListener('focus', showBoundTooltip);
        target.addEventListener('blur', hide);
      }
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
      destroy() {
        token += 1;
        currentTarget = null;
        if (hideTimer) {
          clearTimer(hideTimer);
          hideTimer = null;
        }
        const tooltipView = root && root.LumnoTooltipView;
        if (element && tooltipView &&
            typeof tooltipView.destroyTooltipElement === 'function') {
          tooltipView.destroyTooltipElement(element);
        }
        if (element && element.parentNode) {
          element.parentNode.removeChild(element);
        }
        element = null;
      },
      show,
      hide,
      bind,
      bindAll
    };
  }

  return Object.freeze({
    className: TOOLTIP_CLASS,
    hostClassName: HOST_CLASS,
    lineClassName: LINE_CLASS,
    dividerClassName: DIVIDER_CLASS,
    createElement,
    createController,
    renderText,
    position
  });
});
