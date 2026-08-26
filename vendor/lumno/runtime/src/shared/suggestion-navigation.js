(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSuggestionNavigation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const NUMBER_SHORTCUT_HOLD_DURATION_MS = 400;
  const NUMBER_SHORTCUT_TIMEOUT_MS = 2000;
  const numberShortcutStates = new WeakMap();

  function scrollItemIntoView(container, item, options) {
    if (!container || !item || !item.isConnected) {
      return;
    }
    const config = options || {};
    const direction = config.direction === 'down' ? 'down' : 'up';
    const inset = Number.isFinite(Number(config.inset)) ? Number(config.inset) : 8;

    if (config.didWrap) {
      container.scrollTop = direction === 'down'
        ? 0
        : container.scrollHeight;
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < containerRect.top + inset) {
      container.scrollTop -= (containerRect.top + inset) - itemRect.top;
    } else if (itemRect.bottom > containerRect.bottom - inset) {
      container.scrollTop += itemRect.bottom - (containerRect.bottom - inset);
    }
  }

  function getNumberShortcutTimeoutMs(options) {
    const configured = Number(options && options.timeoutMs);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : NUMBER_SHORTCUT_TIMEOUT_MS;
  }

  function getNumberShortcutHoldDurationMs(options) {
    const configured = Number(options && options.holdDurationMs);
    return Number.isFinite(configured) && configured >= 0
      ? configured
      : NUMBER_SHORTCUT_HOLD_DURATION_MS;
  }

  function getPrimaryModifier(options) {
    const configured = String(options && options.primaryModifier || '').toLowerCase();
    if (configured === 'meta' || configured === 'ctrl') {
      return configured;
    }
    const navigatorLike = options && options.navigatorLike
      ? options.navigatorLike
      : (typeof navigator !== 'undefined' ? navigator : null);
    const platform = [
      navigatorLike && navigatorLike.userAgentData
        ? navigatorLike.userAgentData.platform
        : '',
      navigatorLike ? navigatorLike.platform : '',
      navigatorLike ? navigatorLike.userAgent : ''
    ].filter(Boolean).join(' ');
    return /Mac|iPhone|iPad|iPod/i.test(platform) ? 'meta' : 'ctrl';
  }

  function isPrimaryModifierKey(event, primaryModifier) {
    const key = String(event && event.key || '');
    const code = String(event && event.code || '');
    return primaryModifier === 'meta'
      ? key === 'Meta' || code.indexOf('Meta') === 0
      : key === 'Control' || code.indexOf('Control') === 0;
  }

  function hasOnlyPrimaryModifier(event, primaryModifier) {
    if (!event || event.altKey || event.shiftKey) {
      return false;
    }
    return primaryModifier === 'meta'
      ? Boolean(event.metaKey && !event.ctrlKey)
      : Boolean(event.ctrlKey && !event.metaKey);
  }

  function clearStateTimers(state) {
    if (!state) {
      return;
    }
    if (state.holdTimer) {
      clearTimeout(state.holdTimer);
      state.holdTimer = 0;
    }
    if (state.activeTimer) {
      clearTimeout(state.activeTimer);
      state.activeTimer = 0;
    }
  }

  function invokeStateCallback(state, name) {
    const callback = state && state.options && state.options[name];
    if (typeof callback === 'function') {
      callback();
    }
  }

  function removeNumberShortcutAttributes(container) {
    if (!container) {
      return;
    }
    container.removeAttribute('data-number-shortcuts-active');
    container.removeAttribute('data-number-shortcuts-scroll-locked');
  }

  function clearNumberShortcutState(container, options) {
    if (!container) {
      return;
    }
    const config = options || {};
    const state = numberShortcutStates.get(container);
    if (state) {
      clearStateTimers(state);
      if (state.phase === 'armed' && config.notifyHoldEnd !== false) {
        invokeStateCallback(state, 'onHoldEnd');
      }
      numberShortcutStates.delete(container);
    }
    removeNumberShortcutAttributes(container);
  }

  function enterNumberShortcutsActive(container, options, existingState) {
    if (!container) {
      return;
    }
    const state = existingState || {
      phase: 'active',
      primaryModifier: getPrimaryModifier(options),
      options: options || {},
      holdTimer: 0,
      activeTimer: 0
    };
    clearStateTimers(state);
    state.phase = 'active';
    state.options = options || state.options || {};
    container.setAttribute('data-number-shortcuts-scroll-locked', 'true');
    container.setAttribute('data-number-shortcuts-active', 'true');
    state.activeTimer = setTimeout(function() {
      if (numberShortcutStates.get(container) !== state) {
        return;
      }
      numberShortcutStates.delete(container);
      removeNumberShortcutAttributes(container);
    }, getNumberShortcutTimeoutMs(state.options));
    numberShortcutStates.set(container, state);
  }

  function setNumberShortcutsActive(container, active, options) {
    if (!container) {
      return;
    }
    if (active) {
      clearNumberShortcutState(container);
      enterNumberShortcutsActive(container, options);
      return;
    }
    clearNumberShortcutState(container);
  }

  function cancelNumberShortcuts(container) {
    setNumberShortcutsActive(container, false);
  }

  function isNumberShortcutsActive(container) {
    return Boolean(
      container &&
      container.getAttribute('data-number-shortcuts-active') === 'true'
    );
  }

  function consumeNumberShortcutEvent(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function beginNumberShortcutHold(container, options, primaryModifier) {
    const state = {
      phase: 'holding',
      primaryModifier,
      options: options || {},
      holdTimer: 0,
      activeTimer: 0
    };
    state.holdTimer = setTimeout(function() {
      if (numberShortcutStates.get(container) !== state || state.phase !== 'holding') {
        return;
      }
      state.holdTimer = 0;
      state.phase = 'armed';
      container.setAttribute('data-number-shortcuts-scroll-locked', 'true');
      invokeStateCallback(state, 'onHoldStart');
    }, getNumberShortcutHoldDurationMs(options));
    numberShortcutStates.set(container, state);
  }

  function handleNumberShortcutKeyEvent(event, items, container, options) {
    const rows = Array.isArray(items) ? items : [];
    if (!event || !container) {
      return false;
    }
    const eventType = String(event.type || 'keydown');
    const configuredPrimaryModifier = getPrimaryModifier(options);
    let state = numberShortcutStates.get(container);
    const primaryModifier = state ? state.primaryModifier : configuredPrimaryModifier;
    const isPrimaryKey = isPrimaryModifierKey(event, primaryModifier);

    if (eventType === 'keyup') {
      if (!state || !isPrimaryKey) {
        return false;
      }
      if (state.phase === 'holding') {
        clearNumberShortcutState(container, { notifyHoldEnd: false });
        return false;
      }
      if (state.phase !== 'armed') {
        return false;
      }
      if (rows.length === 0) {
        clearNumberShortcutState(container);
        return false;
      }
      invokeStateCallback(state, 'onHoldEnd');
      enterNumberShortcutsActive(container, state.options, state);
      consumeNumberShortcutEvent(event);
      return true;
    }

    if (eventType !== 'keydown') {
      return false;
    }

    if (isPrimaryKey && hasOnlyPrimaryModifier(event, primaryModifier)) {
      if (rows.length === 0) {
        clearNumberShortcutState(container);
        return false;
      }
      if (state && (state.phase === 'holding' || state.phase === 'armed')) {
        return false;
      }
      clearNumberShortcutState(container);
      if (!event.repeat) {
        beginNumberShortcutHold(container, options, primaryModifier);
      }
      return false;
    }

    state = numberShortcutStates.get(container);
    if (state && (state.phase === 'holding' || state.phase === 'armed')) {
      clearNumberShortcutState(container);
      return false;
    }
    if (!state || state.phase !== 'active' || !isNumberShortcutsActive(container)) {
      return false;
    }
    const key = String(event.key || '');
    if (key === 'Escape') {
      cancelNumberShortcuts(container);
      consumeNumberShortcutEvent(event);
      return true;
    }
    const plainNumber = !event.metaKey && !event.ctrlKey &&
      !event.altKey && !event.shiftKey && /^[0-9]$/.test(key);
    if (!plainNumber) {
      cancelNumberShortcuts(container);
      return false;
    }
    const item = rows[Number(key)];
    cancelNumberShortcuts(container);
    consumeNumberShortcutEvent(event);
    if (!event.repeat && item && typeof item.click === 'function') {
      item.click();
    }
    return true;
  }

  function preventNumberShortcutWheel(event, container) {
    if (!event || !container ||
        container.getAttribute('data-number-shortcuts-scroll-locked') !== 'true') {
      return false;
    }
    event.preventDefault();
    return true;
  }

  return {
    scrollItemIntoView,
    handleNumberShortcutKeyEvent,
    setNumberShortcutsActive,
    cancelNumberShortcuts,
    preventNumberShortcutWheel
  };
});
