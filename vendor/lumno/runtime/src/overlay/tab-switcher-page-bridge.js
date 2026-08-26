(function() {
  if (window._x_extension_tab_switcher_page_bridge_2026_unique_) {
    return;
  }
  window._x_extension_tab_switcher_page_bridge_2026_unique_ = true;

  const TAB_SWITCHER_HOST_ID = '_x_extension_tab_switcher_host_2026_unique_';
  const TAB_SWITCHER_ADVANCE_EVENT = '_x_extension_tab_switcher_advance_command_2026_unique_';
  const TAB_SWITCHER_EXTENSION_PAGE_PORT_NAME = 'lumno-tab-switcher-extension-page';
  const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
  let extensionPagePort = null;
  let extensionPagePortReconnectTimer = null;
  let extensionPagePortClosed = false;
  let extensionPageTabId = null;

  function normalizeTabSwitcherAdvanceOffset(value) {
    const offset = Math.trunc(Number(value));
    return Number.isFinite(offset) && offset !== 0 ? offset : 1;
  }

  function createTabSwitcherAdvanceEvent(offset) {
    const detail = { offset: normalizeTabSwitcherAdvanceOffset(offset) };
    if (typeof CustomEvent === 'function') {
      return new CustomEvent(TAB_SWITCHER_ADVANCE_EVENT, { detail });
    }
    const event = document.createEvent('CustomEvent');
    event.initCustomEvent(TAB_SWITCHER_ADVANCE_EVENT, false, false, detail);
    return event;
  }

  function advanceOpenTabSwitcherFromCommand(request) {
    const host = document.getElementById(TAB_SWITCHER_HOST_ID);
    if (!host) {
      return { ok: false };
    }
    if (typeof host._lumnoTabSwitcherAdvance === 'function') {
      const didAdvance = host._lumnoTabSwitcherAdvance(request && request.offset);
      return {
        ok: true,
        advanced: didAdvance === true,
        suppressed: didAdvance === false
      };
    }
    document.dispatchEvent(createTabSwitcherAdvanceEvent(request && request.offset));
    return { ok: true, advanced: true };
  }

  function openTabSwitcherFromCommand(request) {
    const toggle = window._x_extension_toggleTabSwitcher_2026_unique_;
    if (typeof toggle !== 'function') {
      return { ok: false, reason: 'tab_switcher_missing' };
    }
    const context = request && request.context && typeof request.context === 'object'
      ? request.context
      : {};
    const result = toggle(context);
    return result && typeof result === 'object'
      ? result
      : { ok: true };
  }

  function setTabSwitcherCaptureVisibility(hidden) {
    const host = document.getElementById(TAB_SWITCHER_HOST_ID);
    if (!host) {
      return { ok: true, reason: 'tab_switcher_host_missing' };
    }
    const markerKey = 'lumnoCaptureVisibilityHidden';
    const valueKey = 'lumnoCapturePreviousVisibility';
    const priorityKey = 'lumnoCapturePreviousVisibilityPriority';
    const hadValueKey = 'lumnoCaptureHadVisibility';
    if (hidden) {
      if (host.dataset[markerKey] !== 'true') {
        const previousValue = host.style.getPropertyValue('visibility');
        host.dataset[markerKey] = 'true';
        host.dataset[valueKey] = previousValue || '';
        host.dataset[priorityKey] = host.style.getPropertyPriority('visibility') || '';
        host.dataset[hadValueKey] = previousValue ? 'true' : 'false';
      }
      host.style.setProperty('visibility', 'hidden', 'important');
      return { ok: true };
    }
    if (host.dataset[markerKey] === 'true') {
      if (host.dataset[hadValueKey] === 'true') {
        host.style.setProperty(
          'visibility',
          host.dataset[valueKey] || '',
          host.dataset[priorityKey] || ''
        );
      } else {
        host.style.removeProperty('visibility');
      }
      delete host.dataset[markerKey];
      delete host.dataset[valueKey];
      delete host.dataset[priorityKey];
      delete host.dataset[hadValueKey];
    }
    return { ok: true };
  }

  function getOpenTabSwitcherState() {
    const host = document.getElementById(TAB_SWITCHER_HOST_ID);
    return {
      ok: true,
      open: Boolean(host)
    };
  }

  function updateOpenTabSwitcherThumbnail(request) {
    const host = document.getElementById(TAB_SWITCHER_HOST_ID);
    if (!host || typeof host._lumnoTabSwitcherUpdateThumbnail !== 'function') {
      return { ok: false, reason: 'tab_switcher_host_missing' };
    }
    return host._lumnoTabSwitcherUpdateThumbnail(request) || { ok: true };
  }

  function handleTabSwitcherCommandMessage(request) {
    if (!request || typeof request !== 'object') {
      return null;
    }
    if (request.action === 'advanceOpenTabSwitcherFromCommand') {
      return advanceOpenTabSwitcherFromCommand(request);
    }
    if (request.action === 'openTabSwitcherFromCommand') {
      return openTabSwitcherFromCommand(request);
    }
    if (request.action === 'setTabSwitcherCaptureVisibility') {
      return setTabSwitcherCaptureVisibility(request.hidden);
    }
    if (request.action === 'getOpenTabSwitcherState') {
      return getOpenTabSwitcherState();
    }
    if (request.action === 'updateTabSwitcherThumbnail') {
      return updateOpenTabSwitcherThumbnail(request);
    }
    return null;
  }

  function isOwnExtensionPage() {
    if (!chromeApi || !chromeApi.runtime || !chromeApi.runtime.id) {
      return false;
    }
    try {
      const parsed = new URL(window.location.href);
      return parsed.protocol === 'chrome-extension:' && parsed.hostname === chromeApi.runtime.id;
    } catch (error) {
      return false;
    }
  }

  function postExtensionPagePortMessage(message) {
    if (!extensionPagePort || !message) {
      return;
    }
    try {
      extensionPagePort.postMessage(message);
    } catch (error) {
      // The disconnect listener will reconnect if the page is still alive.
    }
  }

  function registerTabSwitcherExtensionPage(tab) {
    const tabId = tab && typeof tab.id === 'number' ? tab.id : null;
    extensionPageTabId = tabId;
    postExtensionPagePortMessage({
      action: 'registerTabSwitcherExtensionPage',
      tabId,
      url: window.location && window.location.href ? window.location.href : '',
      title: document && document.title ? document.title : ''
    });
  }

  function respondToExtensionPageRequest(request, response) {
    if (!request || typeof request.requestId !== 'number') {
      return;
    }
    postExtensionPagePortMessage({
      action: 'tabSwitcherExtensionPageResponse',
      requestId: request.requestId,
      tabId: extensionPageTabId,
      ok: Boolean(response && response.ok),
      reason: response && response.reason ? String(response.reason) : '',
      advanced: response && typeof response.advanced === 'boolean' ? response.advanced : null,
      open: response && typeof response.open === 'boolean' ? response.open : null,
      suppressed: Boolean(response && response.suppressed)
    });
  }

  function scheduleExtensionPagePortReconnect() {
    if (extensionPagePortClosed || extensionPagePortReconnectTimer) {
      return;
    }
    extensionPagePortReconnectTimer = window.setTimeout(() => {
      extensionPagePortReconnectTimer = null;
      connectExtensionPagePort();
    }, 1000);
  }

  function connectExtensionPagePort() {
    if (!isOwnExtensionPage() ||
        !chromeApi.runtime ||
        typeof chromeApi.runtime.connect !== 'function') {
      return;
    }
    if (extensionPagePort) {
      return;
    }
    try {
      extensionPagePort = chromeApi.runtime.connect({ name: TAB_SWITCHER_EXTENSION_PAGE_PORT_NAME });
    } catch (error) {
      return;
    }
    extensionPagePort.onMessage.addListener((request) => {
      const response = handleTabSwitcherCommandMessage(request);
      if (response) {
        respondToExtensionPageRequest(request, response);
      }
    });
    extensionPagePort.onDisconnect.addListener(() => {
      extensionPagePort = null;
      scheduleExtensionPagePortReconnect();
    });
    if (chromeApi.tabs && typeof chromeApi.tabs.getCurrent === 'function') {
      chromeApi.tabs.getCurrent((tab) => {
        registerTabSwitcherExtensionPage(tab);
      });
    } else {
      registerTabSwitcherExtensionPage(null);
    }
  }

  if (chromeApi && chromeApi.runtime && chromeApi.runtime.onMessage) {
    chromeApi.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      const response = handleTabSwitcherCommandMessage(request);
      if (!response) {
        return;
      }
      sendResponse(response);
    });
  }

  window.addEventListener('pagehide', () => {
    extensionPagePortClosed = true;
    if (extensionPagePortReconnectTimer) {
      window.clearTimeout(extensionPagePortReconnectTimer);
      extensionPagePortReconnectTimer = null;
    }
  }, true);

  connectExtensionPagePort();
})();
