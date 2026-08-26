(function(root) {
  if (root.LumnoToast &&
      typeof root.LumnoToast.createToastController === 'function' &&
      typeof root.LumnoToast.createToastStyleGate === 'function') {
    return;
  }

  const TOAST_BOOTSTRAP_STYLES = Object.freeze({
    opacity: '0',
    'pointer-events': 'none',
    transform: 'translateX(-50%) translateY(-10px)',
    transition: 'none'
  });

  function createToastStyleGate(toastElement, options) {
    if (!toastElement || !toastElement.style) {
      return Object.freeze({
        destroy() {},
        isReady() { return false; },
        markReady() {}
      });
    }
    const config = options || {};
    const win = config.windowObj || root.window || root;
    const stylesheetElement = config.stylesheetElement || null;
    const requestFrame = win && typeof win.requestAnimationFrame === 'function'
      ? win.requestAnimationFrame.bind(win)
      : (callback) => win.setTimeout(callback, 16);
    const cancelFrame = win && typeof win.cancelAnimationFrame === 'function'
      ? win.cancelAnimationFrame.bind(win)
      : (frameId) => win.clearTimeout(frameId);
    let ready = false;
    let destroyed = false;
    let frameA = null;
    let frameB = null;
    let listeningForLoad = false;

    Object.keys(TOAST_BOOTSTRAP_STYLES).forEach((property) => {
      toastElement.style.setProperty(
        property,
        TOAST_BOOTSTRAP_STYLES[property]
      );
    });

    function stopListeningForLoad() {
      if (!listeningForLoad || !stylesheetElement ||
          typeof stylesheetElement.removeEventListener !== 'function') {
        return;
      }
      stylesheetElement.removeEventListener('load', markReady);
      listeningForLoad = false;
    }

    function releaseBootstrapStyles() {
      frameB = null;
      if (destroyed) {
        return;
      }
      Object.keys(TOAST_BOOTSTRAP_STYLES).forEach((property) => {
        toastElement.style.removeProperty(property);
      });
    }

    function markReady() {
      if (destroyed || ready) {
        return;
      }
      ready = true;
      stopListeningForLoad();
      frameA = requestFrame(() => {
        frameA = null;
        if (destroyed) {
          return;
        }
        frameB = requestFrame(releaseBootstrapStyles);
      });
    }

    if (stylesheetElement && typeof stylesheetElement.addEventListener === 'function') {
      stylesheetElement.addEventListener('load', markReady);
      listeningForLoad = true;
    }
    try {
      if (stylesheetElement && stylesheetElement.sheet) {
        markReady();
      }
    } catch (error) {
      // Keep the bootstrap styles until the stylesheet emits its load event.
    }

    return Object.freeze({
      destroy() {
        if (destroyed) {
          return;
        }
        destroyed = true;
        stopListeningForLoad();
        if (frameA !== null) {
          cancelFrame(frameA);
          frameA = null;
        }
        if (frameB !== null) {
          cancelFrame(frameB);
          frameB = null;
        }
      },
      isReady() {
        return ready;
      },
      markReady
    });
  }

  function createToastController(toastElement, options) {
    if (!toastElement) {
      return Object.freeze({
        show() {},
        hide() {},
        destroy() {}
      });
    }
    const config = options || {};
    const win = config.windowObj || root.window || root;
    const defaultDuration = Number.isFinite(Number(config.duration))
      ? Math.max(0, Number(config.duration))
      : 2200;
    let timer = 0;
    let destroyed = false;

    function hide() {
      if (timer && win && typeof win.clearTimeout === 'function') {
        win.clearTimeout(timer);
      }
      timer = 0;
      if (!destroyed) {
        toastElement.setAttribute('data-show', 'false');
      }
    }

    function show(message, showOptions) {
      const text = String(message || '');
      if (destroyed || !text) {
        return;
      }
      const nextOptions = showOptions || {};
      hide();
      toastElement.textContent = text;
      if (nextOptions.error && toastElement.style) {
        toastElement.style.setProperty(
          'background',
          config.errorBackground || 'rgba(153, 27, 27, 0.92)'
        );
      } else if (toastElement.style) {
        toastElement.style.removeProperty('background');
      }
      toastElement.setAttribute('data-show', 'true');
      const duration = Number.isFinite(Number(nextOptions.duration))
        ? Math.max(0, Number(nextOptions.duration))
        : defaultDuration;
      if (duration > 0 && win && typeof win.setTimeout === 'function') {
        timer = win.setTimeout(() => {
          timer = 0;
          if (!destroyed) {
            toastElement.setAttribute('data-show', 'false');
          }
        }, duration);
      }
    }

    return Object.freeze({
      show,
      hide,
      destroy() {
        if (destroyed) {
          return;
        }
        hide();
        destroyed = true;
      }
    });
  }

  root.LumnoToast = Object.freeze({
    implementation: 'dom',
    createToastController,
    createToastStyleGate
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
