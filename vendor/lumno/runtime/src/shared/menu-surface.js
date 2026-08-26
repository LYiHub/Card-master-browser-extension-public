(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoMenuSurface = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  const SURFACE_CLASS = '_x_extension_menu_surface_2024_unique_';
  const CONTENT_WIDTH_ATTRIBUTE = 'data-menu-surface-width';
  const MIN_WIDTH_VAR = '--x-extension-menu-surface-min-width';
  const MAX_WIDTH_VAR = '--x-extension-menu-surface-max-width';

  function normalizeCssLength(value) {
    if (value === undefined || value === null || value === '') {
      return '';
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) && value >= 0 ? `${value}px` : '';
    }
    return String(value).trim();
  }

  function getRequestAnimationFrame(options) {
    if (options && typeof options.requestAnimationFrame === 'function') {
      return options.requestAnimationFrame;
    }
    if (root && typeof root.requestAnimationFrame === 'function') {
      return root.requestAnimationFrame.bind(root);
    }
    return (callback) => {
      if (root && typeof root.setTimeout === 'function') {
        root.setTimeout(callback, 0);
        return;
      }
      callback();
    };
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

  function setStyleProperty(element, name, value) {
    if (!element || !element.style || typeof element.style.setProperty !== 'function') {
      return;
    }
    element.style.setProperty(name, value);
  }

  function removeStyleProperty(element, name) {
    if (!element || !element.style || typeof element.style.removeProperty !== 'function') {
      return;
    }
    element.style.removeProperty(name);
  }

  function apply(element, options) {
    if (!element) {
      return null;
    }
    const config = options || {};
    addClass(element, SURFACE_CLASS);
    if (config.width === 'content' || config.menuWidth === 'content' || config.contentWidth) {
      applyContentWidth(element, config);
    }
    return element;
  }

  function applyContentWidth(element, options) {
    if (!element || typeof element.setAttribute !== 'function') {
      return null;
    }
    const config = options || {};
    const minWidth = normalizeCssLength(
      config.minWidth === undefined ? config.menuMinWidth : config.minWidth
    ) || '0';
    const maxWidth = normalizeCssLength(
      config.maxWidth === undefined ? config.menuMaxWidth : config.maxWidth
    ) || 'calc(100vw - 32px)';
    addClass(element, SURFACE_CLASS);
    element.setAttribute(CONTENT_WIDTH_ATTRIBUTE, 'content');
    setStyleProperty(element, MIN_WIDTH_VAR, minWidth);
    setStyleProperty(element, MAX_WIDTH_VAR, maxWidth);
    return element;
  }

  function clearContentWidth(element) {
    if (!element) {
      return null;
    }
    if (typeof element.removeAttribute === 'function') {
      element.removeAttribute(CONTENT_WIDTH_ATTRIBUTE);
    }
    removeStyleProperty(element, MIN_WIDTH_VAR);
    removeStyleProperty(element, MAX_WIDTH_VAR);
    return element;
  }

  function open(element, options) {
    if (!element || typeof element.setAttribute !== 'function') {
      return null;
    }
    addClass(element, SURFACE_CLASS);
    element.setAttribute('data-open', 'false');
    getRequestAnimationFrame(options)(() => {
      element.setAttribute('data-open', 'true');
    });
    return element;
  }

  function close(element) {
    if (!element || typeof element.setAttribute !== 'function') {
      return null;
    }
    element.setAttribute('data-open', 'false');
    return element;
  }

  return Object.freeze({
    className: SURFACE_CLASS,
    contentWidthAttribute: CONTENT_WIDTH_ATTRIBUTE,
    apply,
    applyContentWidth,
    clearContentWidth,
    open,
    close
  });
});
