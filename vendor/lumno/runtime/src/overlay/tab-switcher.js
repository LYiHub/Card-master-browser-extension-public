(function() {
  'use strict';

  const HOST_ID = '_x_extension_tab_switcher_host_2026_unique_';
  const PANEL_ID = '_x_extension_tab_switcher_panel_2026_unique_';
  const TAB_SWITCHER_ADVANCE_EVENT = '_x_extension_tab_switcher_advance_command_2026_unique_';
  const THEME_STORAGE_KEY = '_x_extension_theme_mode_2024_unique_';
  const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
  const switcherThemeMediaQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  const switcherThemeStorageArea = (chromeApi && chromeApi.storage && chromeApi.storage.sync)
    ? chromeApi.storage.sync
    : (chromeApi && chromeApi.storage ? chromeApi.storage.local : null);
  const switcherThemeStorageAreaName = switcherThemeStorageArea
    ? (switcherThemeStorageArea === (chromeApi && chromeApi.storage ? chromeApi.storage.sync : null) ? 'sync' : 'local')
    : null;

  function handleExistingSwitcher(context) {
    const existingHost = document.getElementById(HOST_ID);
    if (!existingHost) {
      return false;
    }
    if (context && context.advanceOnExisting === true && typeof existingHost._lumnoTabSwitcherAdvance === 'function') {
      existingHost._lumnoTabSwitcherAdvance();
      return true;
    }
    const cleanup = existingHost._lumnoTabSwitcherCleanup;
    if (typeof cleanup === 'function') {
      cleanup();
    }
    existingHost.remove();
    return true;
  }

  function getMessage(key, fallback) {
    try {
      if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
        return chrome.i18n.getMessage(key) || fallback;
      }
    } catch (error) {
      // Ignore i18n failures in page context.
    }
    return fallback;
  }

  function sanitizeText(value, fallback) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text || fallback || '';
  }

  function getHostLabel(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '');
    } catch (error) {
      return '';
    }
  }

  function updateOpenSwitcherThumbnailFromMessage(request) {
    const host = document.getElementById(HOST_ID);
    if (!host || typeof host._lumnoTabSwitcherUpdateThumbnail !== 'function') {
      return { ok: false, reason: 'tab_switcher_host_missing' };
    }
    return host._lumnoTabSwitcherUpdateThumbnail(request) || { ok: true };
  }

  if (chromeApi &&
      chromeApi.runtime &&
      chromeApi.runtime.onMessage &&
      window._x_extension_tab_switcher_thumbnail_update_listener_2026_unique_ !== true) {
    window._x_extension_tab_switcher_thumbnail_update_listener_2026_unique_ = true;
    chromeApi.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (!request || request.action !== 'updateTabSwitcherThumbnail') {
        return;
      }
      sendResponse(updateOpenSwitcherThumbnailFromMessage(request));
      return true;
    });
  }

  function clampSelectedIndex(index, length) {
    if (length <= 0) {
      return 0;
    }
    const normalized = Number.isFinite(Number(index)) ? Number(index) : 0;
    return ((normalized % length) + length) % length;
  }

  function normalizeAdvanceOffset(value) {
    const offset = Math.trunc(Number(value));
    return Number.isFinite(offset) && offset !== 0 ? offset : 1;
  }

  function normalizeSwitcherThemeMode(mode) {
    const value = String(mode || '').trim().toLowerCase();
    return value === 'dark' || value === 'light' ? value : 'system';
  }

  function parseSwitcherCssColor(color) {
    if (!color || typeof color !== 'string') {
      return null;
    }
    const trimmed = color.trim().toLowerCase();
    if (!trimmed || trimmed === 'transparent') {
      return null;
    }
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        const channels = hex.split('').map((value) => parseInt(value + value, 16));
        return channels.every((value) => Number.isFinite(value)) ? channels : null;
      }
      if (hex.length === 6) {
        const channels = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)]
          .map((value) => parseInt(value, 16));
        return channels.every((value) => Number.isFinite(value)) ? channels : null;
      }
      return null;
    }
    const functionMatch = trimmed.match(/^rgba?\(([\s\S]+)\)$/);
    if (!functionMatch) {
      return null;
    }
    const parts = functionMatch[1]
      .replace(/\//g, ' ')
      .replace(/,/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length < 3) {
      return null;
    }
    const channels = parts.slice(0, 3).map((part) => {
      if (part.endsWith('%')) {
        return Math.round(Number(part.slice(0, -1)) * 2.55);
      }
      return Math.round(Number(part));
    });
    const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
    if (!channels.every((value) => Number.isFinite(value)) ||
        !Number.isFinite(alpha) ||
        alpha <= 0) {
      return null;
    }
    return channels.map((value) => Math.max(0, Math.min(255, value)));
  }

  function getSwitcherLuminance(rgb) {
    const [red, green, blue] = rgb.map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  function getSystemSwitcherTheme() {
    return switcherThemeMediaQuery && switcherThemeMediaQuery.matches ? 'dark' : 'light';
  }

  function themeFromSwitcherColor(color) {
    const rgb = parseSwitcherCssColor(color);
    if (!rgb || rgb.length !== 3) {
      return null;
    }
    return getSwitcherLuminance(rgb) < 0.42 ? 'dark' : 'light';
  }

  function detectSwitcherPageTheme() {
    const docEl = document.documentElement;
    const body = document.body;
    if (!docEl) {
      return null;
    }
    if (docEl.hasAttribute('dark') || (body && body.hasAttribute('dark'))) {
      return 'dark';
    }
    if (docEl.hasAttribute('light') || (body && body.hasAttribute('light'))) {
      return 'light';
    }
    const attrCandidates = [
      docEl.getAttribute('data-theme'),
      docEl.getAttribute('data-color-scheme'),
      docEl.getAttribute('data-color-mode'),
      docEl.getAttribute('data-mode'),
      docEl.getAttribute('data-appearance'),
      docEl.getAttribute('color-scheme'),
      docEl.getAttribute('theme'),
      docEl.getAttribute('data-bs-theme'),
      body ? body.getAttribute('data-theme') : null,
      body ? body.getAttribute('data-color-scheme') : null,
      body ? body.getAttribute('data-color-mode') : null,
      body ? body.getAttribute('data-mode') : null,
      body ? body.getAttribute('data-appearance') : null,
      body ? body.getAttribute('color-scheme') : null,
      body ? body.getAttribute('theme') : null,
      body ? body.getAttribute('data-bs-theme') : null
    ];
    for (let i = 0; i < attrCandidates.length; i += 1) {
      const value = String(attrCandidates[i] || '').toLowerCase();
      if (!value) {
        continue;
      }
      if (value.includes('dark') ||
          value.includes('night') ||
          value === '1' ||
          value === 'true' ||
          value === 'on') {
        return 'dark';
      }
      if (value.includes('light') ||
          value.includes('day') ||
          value === '0' ||
          value === 'false' ||
          value === 'off') {
        return 'light';
      }
    }
    const youtubeDarkRoot = document.querySelector('ytd-app[dark], ytm-app[dark]');
    if (youtubeDarkRoot) {
      return 'dark';
    }
    const classTokens = [
      docEl.className || '',
      body ? body.className || '' : ''
    ];
    for (let i = 0; i < classTokens.length; i += 1) {
      const classText = String(classTokens[i] || '').toLowerCase();
      const tokenList = classText.split(/\s+/);
      if (tokenList.includes('dark')) {
        return 'dark';
      }
      if (tokenList.includes('light')) {
        return 'light';
      }
      if (/(^|[\s_-])(dark|darkmode|dark-theme|theme-dark|night)([\s_-]|$)/.test(classText)) {
        return 'dark';
      }
      if (/(^|[\s_-])(light|lightmode|light-theme|theme-light|day)([\s_-]|$)/.test(classText)) {
        return 'light';
      }
    }
    const bodyStyle = body ? window.getComputedStyle(body) : null;
    const docStyle = window.getComputedStyle(docEl);
    const bgColor = bodyStyle && themeFromSwitcherColor(bodyStyle.backgroundColor)
      ? bodyStyle.backgroundColor
      : docStyle.backgroundColor;
    const backgroundTheme = themeFromSwitcherColor(bgColor);
    if (backgroundTheme) {
      return backgroundTheme;
    }
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      const themeColor = String(themeColorMeta.getAttribute('content') || '').trim();
      const theme = themeFromSwitcherColor(themeColor);
      if (theme) {
        return theme;
      }
    }
    const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (colorSchemeMeta) {
      const metaContent = String(colorSchemeMeta.getAttribute('content') || '').toLowerCase();
      if (metaContent.includes('dark') && !metaContent.includes('light')) {
        return 'dark';
      }
      if (metaContent.includes('light') && !metaContent.includes('dark')) {
        return 'light';
      }
    }
    const schemeValue = (window.getComputedStyle(docEl).colorScheme || '').toLowerCase();
    if (schemeValue.includes('dark') && !schemeValue.includes('light')) {
      return 'dark';
    }
    if (schemeValue.includes('light') && !schemeValue.includes('dark')) {
      return 'light';
    }
    return null;
  }

  function resolveSwitcherTheme(mode) {
    const normalized = normalizeSwitcherThemeMode(mode);
    const pageTheme = detectSwitcherPageTheme();
    if (pageTheme) {
      return pageTheme;
    }
    if (normalized !== 'system') {
      return normalized;
    }
    return getSystemSwitcherTheme();
  }

  function applySwitcherTheme(panel, mode) {
    if (!panel) {
      return;
    }
    const resolved = resolveSwitcherTheme(mode);
    panel.setAttribute('data-theme', resolved);
    panel.style.setProperty('color-scheme', resolved);
  }

  function createSwitcherThemeController(panel) {
    const themeAttrFilter = [
      'class',
      'style',
      'data-theme',
      'data-color-scheme',
      'data-color-mode',
      'data-mode',
      'data-appearance',
      'theme',
      'color-scheme',
      'dark',
      'light',
      'data-bs-theme'
    ];
    let switcherThemeMode = 'system';
    let themeStorageListener = null;
    let themeMediaListener = null;
    let pageThemeObserver = null;
    let pageThemeSyncRaf = null;
    let destroyed = false;
    let started = false;

    function refreshSwitcherTheme() {
      if (!destroyed) {
        applySwitcherTheme(panel, switcherThemeMode);
      }
    }

    function schedulePageThemeSync() {
      if (pageThemeSyncRaf !== null) {
        return;
      }
      pageThemeSyncRaf = requestAnimationFrame(() => {
        pageThemeSyncRaf = null;
        if (destroyed || !panel || !panel.isConnected || switcherThemeMode !== 'system') {
          return;
        }
        refreshSwitcherTheme();
      });
    }

    function stopPageThemeObserver() {
      if (pageThemeSyncRaf !== null) {
        cancelAnimationFrame(pageThemeSyncRaf);
        pageThemeSyncRaf = null;
      }
      if (pageThemeObserver) {
        pageThemeObserver.disconnect();
        pageThemeObserver = null;
      }
    }

    function startPageThemeObserver() {
      if (pageThemeObserver || switcherThemeMode !== 'system' || typeof MutationObserver !== 'function') {
        return;
      }
      pageThemeObserver = new MutationObserver(() => {
        schedulePageThemeSync();
      });
      const docEl = document.documentElement;
      if (docEl) {
        pageThemeObserver.observe(docEl, {
          attributes: true,
          attributeFilter: themeAttrFilter
        });
      }
      const body = document.body;
      if (body) {
        pageThemeObserver.observe(body, {
          attributes: true,
          attributeFilter: themeAttrFilter
        });
      }
      const head = document.head;
      if (head) {
        pageThemeObserver.observe(head, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['name', 'content', 'media']
        });
      }
      schedulePageThemeSync();
    }

    function removeThemeMediaListener() {
      if (!themeMediaListener || !switcherThemeMediaQuery) {
        return;
      }
      if (typeof switcherThemeMediaQuery.removeEventListener === 'function') {
        switcherThemeMediaQuery.removeEventListener('change', themeMediaListener);
      } else if (typeof switcherThemeMediaQuery.removeListener === 'function') {
        switcherThemeMediaQuery.removeListener(themeMediaListener);
      }
      themeMediaListener = null;
    }

    function installThemeMediaListener() {
      if (!switcherThemeMediaQuery || themeMediaListener) {
        return;
      }
      themeMediaListener = () => {
        if (switcherThemeMode === 'system') {
          refreshSwitcherTheme();
        }
      };
      if (typeof switcherThemeMediaQuery.addEventListener === 'function') {
        switcherThemeMediaQuery.addEventListener('change', themeMediaListener);
      } else if (typeof switcherThemeMediaQuery.addListener === 'function') {
        switcherThemeMediaQuery.addListener(themeMediaListener);
      }
    }

    function setSwitcherThemeMode(mode) {
      switcherThemeMode = normalizeSwitcherThemeMode(mode);
      refreshSwitcherTheme();
      if (switcherThemeMode === 'system') {
        startPageThemeObserver();
        installThemeMediaListener();
        return;
      }
      stopPageThemeObserver();
      removeThemeMediaListener();
    }

    function start() {
      if (started) {
        return;
      }
      started = true;
      destroyed = false;
      setSwitcherThemeMode('system');
      if (switcherThemeStorageArea && typeof switcherThemeStorageArea.get === 'function') {
        switcherThemeStorageArea.get([THEME_STORAGE_KEY], (result) => {
          if (!destroyed) {
            setSwitcherThemeMode(result && result[THEME_STORAGE_KEY]);
          }
        });
      }
      if (chromeApi && chromeApi.storage && chromeApi.storage.onChanged) {
        themeStorageListener = (changes, areaName) => {
          if (switcherThemeStorageAreaName && areaName !== switcherThemeStorageAreaName) {
            return;
          }
          if (!changes || !changes[THEME_STORAGE_KEY]) {
            return;
          }
          setSwitcherThemeMode(changes[THEME_STORAGE_KEY].newValue);
        };
        chromeApi.storage.onChanged.addListener(themeStorageListener);
      }
    }

    function destroy() {
      destroyed = true;
      started = false;
      if (themeStorageListener && chromeApi && chromeApi.storage && chromeApi.storage.onChanged) {
        chromeApi.storage.onChanged.removeListener(themeStorageListener);
        themeStorageListener = null;
      }
      removeThemeMediaListener();
      stopPageThemeObserver();
    }

    return {
      start,
      destroy,
      refresh: refreshSwitcherTheme
    };
  }

  function getThumbnailStatus(tab, thumbnail) {
    const status = String(tab && tab.thumbnailStatus ? tab.thumbnailStatus : '').trim().toLowerCase();
    if (status === 'ok' ||
        status === 'pending' ||
        status === 'failed' ||
        status === 'restricted' ||
        status === 'stale') {
      return status;
    }
    return thumbnail && thumbnail.startsWith('data:image/') ? 'ok' : 'missing';
  }

  function normalizeAccentCss(value) {
    if (!Array.isArray(value) || value.length !== 3) {
      return '';
    }
    const rgb = value.map((channel) => Math.round(Number(channel)));
    if (!rgb.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
      return '';
    }
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function formatSwitcherScale(value) {
    const rounded = Math.round(value * 1000) / 1000;
    return String(rounded);
  }

  function getSwitcherVisualViewportScale(win) {
    const visualViewport = win && win.visualViewport ? win.visualViewport : null;
    const scale = visualViewport && Number.isFinite(Number(visualViewport.scale))
      ? Number(visualViewport.scale)
      : 1;
    return scale > 0 ? scale : 1;
  }

  function getSwitcherViewportComfortScale(win) {
    const visualViewport = win && win.visualViewport ? win.visualViewport : null;
    const width = visualViewport && Number.isFinite(Number(visualViewport.width))
      ? Number(visualViewport.width)
      : (win && Number.isFinite(Number(win.innerWidth)) ? Number(win.innerWidth) : 0);
    const height = visualViewport && Number.isFinite(Number(visualViewport.height))
      ? Number(visualViewport.height)
      : (win && Number.isFinite(Number(win.innerHeight)) ? Number(win.innerHeight) : 0);
    if (width >= 1440 && height >= 820) {
      return 1.08;
    }
    if (width >= 1180 && height >= 700) {
      return 1.045;
    }
    return 1;
  }

  function applySwitcherViewportPlacement(panel, win) {
    if (!panel || !panel.style) {
      return;
    }
    const targetWindow = win || window;
    const visualViewport = targetWindow && targetWindow.visualViewport
      ? targetWindow.visualViewport
      : null;
    const viewportWidth = visualViewport && Number.isFinite(Number(visualViewport.width))
      ? Math.max(0, Number(visualViewport.width))
      : Math.max(0, Number(targetWindow && targetWindow.innerWidth) || 0);
    const viewportHeight = visualViewport && Number.isFinite(Number(visualViewport.height))
      ? Math.max(0, Number(visualViewport.height))
      : Math.max(0, Number(targetWindow && targetWindow.innerHeight) || 0);
    const offsetLeft = visualViewport && Number.isFinite(Number(visualViewport.offsetLeft))
      ? Math.max(0, Number(visualViewport.offsetLeft))
      : 0;
    const offsetTop = visualViewport && Number.isFinite(Number(visualViewport.offsetTop))
      ? Math.max(0, Number(visualViewport.offsetTop))
      : 0;
    panel.style.setProperty(
      '--x-tab-switcher-center-left',
      `${Math.round(offsetLeft + (viewportWidth / 2))}px`
    );
    panel.style.setProperty(
      '--x-tab-switcher-center-top',
      `${Math.round(offsetTop + (viewportHeight / 2))}px`
    );
  }

  function applySwitcherZoomCompensation(panel, tabZoomFactor, visualViewportScale) {
    if (!panel) {
      return;
    }
    const zoomRaw = Number(tabZoomFactor);
    const visualScale = Number.isFinite(Number(visualViewportScale)) && Number(visualViewportScale) > 0
      ? Number(visualViewportScale)
      : 1;
    const combinedScale = zoomRaw * visualScale;
    const baseVisibleScale = Number.isFinite(combinedScale) && combinedScale > 0 && combinedScale !== 1
      ? Math.max(0.35, Math.min(4, 1 / combinedScale))
      : 1;
    const viewportComfortScale = getSwitcherViewportComfortScale(window);
    const visibleScale = Math.max(0.35, Math.min(4, baseVisibleScale * viewportComfortScale));
    panel.style.setProperty('--x-tab-switcher-visible-scale', formatSwitcherScale(visibleScale));
  }

  function buildStyles() {
    return `
      :host {
        all: initial;
      }
      #${PANEL_ID},
      #${PANEL_ID} * {
        box-sizing: border-box;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
      }
      #${PANEL_ID} {
        all: unset;
        --x-tab-switcher-accent: #2563eb;
        --x-tab-switcher-card-width: clamp(136px, calc((100vw - 68px) / 5), 204px);
        --x-tab-switcher-gap: 6px;
        --x-tab-switcher-padding-panel: 10px;
        --x-tab-switcher-padding-card: 7px;
        --x-tab-switcher-border-card: 1px;
        --x-tab-switcher-radius-panel: 30px;
        --x-tab-switcher-radius-card: calc(var(--x-tab-switcher-radius-panel) - var(--x-tab-switcher-padding-panel));
        --x-tab-switcher-radius-thumb: calc(var(--x-tab-switcher-radius-card) - var(--x-tab-switcher-padding-card) - var(--x-tab-switcher-border-card));
        --x-tab-switcher-radius-icon: 9px;
        --x-tab-switcher-radius-title-icon: 4px;
        --x-tab-switcher-meta-inline-padding: 3px;
        --x-tab-switcher-visible-scale: 1;
        --x-tab-switcher-motion-card: 180ms cubic-bezier(0.22, 1, 0.36, 1);
        --x-tab-switcher-motion-fade: 150ms ease;
        --x-tab-switcher-motion-cover: 220ms cubic-bezier(0.22, 1, 0.36, 1);
        --x-tab-switcher-thumb-stroke-inset: -0.5px;
        --x-tab-switcher-thumb-stroke-radius-offset: 0.5px;
        --x-tab-switcher-thumb-stroke-color: rgba(15, 23, 42, 0.2);
        --x-tab-switcher-title-icon-size: 16px;
        --x-tab-switcher-title-icon-gap: 5px;
        color-scheme: light;
        position: fixed;
        left: var(--x-tab-switcher-center-left, 50%);
        top: var(--x-tab-switcher-center-top, 50%);
        transform: translate3d(-50%, -50%, 0) scale(var(--x-tab-switcher-visible-scale));
        transform-origin: center center;
        z-index: 2147483647;
        width: fit-content;
        max-width: calc(100vw - 24px);
        color: #172033;
        background:
          radial-gradient(120% 160% at 12% -24%, rgba(255, 255, 255, 0.78) 0%, rgba(255, 255, 255, 0.44) 38%, rgba(241, 245, 249, 0.26) 100%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.48), rgba(226, 232, 240, 0.28));
        border: 1px solid rgba(255, 255, 255, 0.46);
        border-radius: var(--x-tab-switcher-radius-panel);
        box-shadow:
          0 26px 82px rgba(15, 23, 42, 0.22),
          0 5px 18px rgba(15, 23, 42, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.86),
          inset 0 -18px 44px rgba(255, 255, 255, 0.22),
          inset 0 0 0 1px rgba(255, 255, 255, 0.3);
        backdrop-filter: blur(56px) saturate(210%);
        -webkit-backdrop-filter: blur(56px) saturate(210%);
        padding: var(--x-tab-switcher-padding-panel);
        pointer-events: auto;
        opacity: 0;
        transition: opacity 90ms ease;
        will-change: opacity;
      }
      #${PANEL_ID}[data-visible="true"] {
        opacity: 1;
        transform: translate3d(-50%, -50%, 0) scale(var(--x-tab-switcher-visible-scale));
      }
      .x-tab-switcher-list {
        display: grid;
        grid-template-columns: repeat(var(--x-tab-count, 5), var(--x-tab-switcher-card-width));
        gap: var(--x-tab-switcher-gap);
        width: max-content;
        max-width: 100%;
      }
      .x-tab-switcher-card {
        all: unset;
        width: var(--x-tab-switcher-card-width);
        min-width: var(--x-tab-switcher-card-width);
        max-width: var(--x-tab-switcher-card-width);
        display: flex;
        flex-direction: column;
        gap: 7px;
        border-radius: var(--x-tab-switcher-radius-card);
        border: var(--x-tab-switcher-border-card) solid transparent;
        outline: 0;
        background: transparent;
        padding: var(--x-tab-switcher-padding-card);
        color: #172033;
        cursor: pointer;
        box-shadow: none;
        transition: border-color 140ms ease, background 140ms ease, box-shadow var(--x-tab-switcher-motion-card);
      }
      .x-tab-switcher-card[data-active="true"] {
        transform: none;
        border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 32%, rgba(15, 23, 42, 0.08));
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 16%, rgba(255, 255, 255, 0.88)),
            color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 8%, rgba(255, 255, 255, 0.78))
          );
        box-shadow:
          0 0 16px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 7%, transparent),
          0 4px 10px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 3%, transparent),
          inset 0 1px 0 rgba(255, 255, 255, 0.84),
          inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 12%, rgba(255, 255, 255, 0.72));
      }
      .x-tab-switcher-card:focus-visible {
        border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 42%, rgba(15, 23, 42, 0.1));
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.84),
          inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 14%, rgba(255, 255, 255, 0.72));
      }
      .x-tab-switcher-thumb {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        border-radius: var(--x-tab-switcher-radius-thumb);
        background: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 14%, rgba(248, 250, 252, 0.94));
      }
      .x-tab-switcher-thumb::after {
        content: "";
        position: absolute;
        inset: var(--x-tab-switcher-thumb-stroke-inset);
        z-index: 2;
        border-radius: calc(var(--x-tab-switcher-radius-thumb) + var(--x-tab-switcher-thumb-stroke-radius-offset));
        box-sizing: border-box;
        border: 1px solid var(--x-tab-switcher-thumb-stroke-color);
        box-shadow: none;
        pointer-events: none;
      }
      .x-tab-switcher-thumb img[data-kind="thumbnail"] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
        object-position: top center;
        opacity: 1;
        transition: opacity var(--x-tab-switcher-motion-cover);
        will-change: opacity;
      }
      .x-tab-switcher-thumb img[data-kind="thumbnail"][data-entering="true"] {
        opacity: 0;
      }
      .x-tab-switcher-thumb img[data-kind="thumbnail"][data-exiting="true"] {
        opacity: 0;
      }
      .x-tab-switcher-thumb img[data-broken="true"] {
        display: none;
      }
      .x-tab-switcher-fallback {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .x-tab-switcher-favicon {
        width: 38px;
        height: 38px;
        border-radius: var(--x-tab-switcher-radius-icon);
        transition: opacity var(--x-tab-switcher-motion-fade), transform var(--x-tab-switcher-motion-card);
      }
      .x-tab-switcher-favicon[data-broken="true"],
      .x-tab-switcher-thumb-favicon[data-broken="true"] {
        visibility: hidden;
      }
      .x-tab-switcher-card[data-active="true"] .x-tab-switcher-fallback .x-tab-switcher-favicon {
        opacity: 0;
        transform: scale(0.88);
      }
      .x-tab-switcher-thumb-favicon {
        position: absolute;
        z-index: 3;
        left: 8px;
        bottom: 8px;
        width: 24px;
        height: 24px;
        object-fit: cover;
        opacity: 0;
        transform: translate3d(-2px, 4px, 0) scale(0.92);
        pointer-events: none;
        transition: opacity var(--x-tab-switcher-motion-fade), transform var(--x-tab-switcher-motion-card);
        will-change: opacity, transform;
      }
      .x-tab-switcher-card[data-active="true"] .x-tab-switcher-thumb-favicon {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }
      .x-tab-switcher-meta {
        min-width: 0;
        display: grid;
        gap: 3px;
        padding: 0 var(--x-tab-switcher-meta-inline-padding);
      }
      .x-tab-switcher-name-row {
        min-width: 0;
        display: grid;
        grid-template-columns: var(--x-tab-switcher-title-icon-size) minmax(0, 1fr);
        align-items: center;
        gap: var(--x-tab-switcher-title-icon-gap);
        transition: grid-template-columns var(--x-tab-switcher-motion-card), gap var(--x-tab-switcher-motion-card);
      }
      .x-tab-switcher-title-favicon {
        width: var(--x-tab-switcher-title-icon-size);
        height: var(--x-tab-switcher-title-icon-size);
        min-width: 0;
        border-radius: var(--x-tab-switcher-radius-title-icon);
        object-fit: cover;
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
        filter: blur(0);
        transition: width var(--x-tab-switcher-motion-card), opacity var(--x-tab-switcher-motion-fade), transform var(--x-tab-switcher-motion-card), filter var(--x-tab-switcher-motion-card);
        will-change: width, opacity, transform, filter;
      }
      .x-tab-switcher-card[data-active="true"] .x-tab-switcher-name-row {
        grid-template-columns: 0 minmax(0, 1fr);
        gap: 0;
      }
      .x-tab-switcher-card[data-active="true"] .x-tab-switcher-title-favicon {
        width: 0;
        opacity: 0;
        transform: translate3d(-2px, 0, 0) scale(0.88);
        filter: blur(1px);
      }
      .x-tab-switcher-name {
        min-width: 0;
        display: block;
        color: #172033;
        font-size: 11.5px;
        font-weight: 500;
        line-height: 1.16;
        letter-spacing: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .x-tab-switcher-host {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: rgba(23, 32, 51, 0.58);
        font-size: 11px;
        font-weight: 560;
        line-height: 1.18;
      }
      @supports (corner-shape: superellipse(1.25)) {
        #${PANEL_ID},
        .x-tab-switcher-card,
        .x-tab-switcher-thumb,
        .x-tab-switcher-thumb::after,
        .x-tab-switcher-favicon,
        .x-tab-switcher-title-favicon {
          corner-shape: superellipse(1.25);
        }
      }
      @media (max-width: 860px) {
        #${PANEL_ID} {
          --x-tab-switcher-card-width: calc((100vw - 32px) / 5);
          --x-tab-switcher-gap: 3px;
          --x-tab-switcher-padding-panel: 5px;
          --x-tab-switcher-padding-card: 5px;
          --x-tab-switcher-radius-panel: 24px;
          --x-tab-switcher-radius-icon: 9px;
          --x-tab-switcher-radius-title-icon: 4px;
          --x-tab-switcher-meta-inline-padding: 2px;
          --x-tab-switcher-title-icon-size: 13px;
          --x-tab-switcher-title-icon-gap: 4px;
          top: 50%;
          max-width: calc(100vw - 10px);
          padding: var(--x-tab-switcher-padding-panel);
        }
        .x-tab-switcher-card {
          gap: 4px;
          padding: var(--x-tab-switcher-padding-card);
        }
        .x-tab-switcher-meta {
          gap: 0;
        }
        .x-tab-switcher-thumb-favicon {
          left: 4px;
          bottom: 4px;
          width: 18px;
          height: 18px;
        }
        .x-tab-switcher-name {
          font-size: 10.5px;
          line-height: 1.14;
        }
        .x-tab-switcher-host {
          display: none;
        }
      }
      #${PANEL_ID}[data-theme="dark"] {
        --x-tab-switcher-thumb-stroke-color: rgba(255, 255, 255, 0.24);
        color-scheme: dark;
        color: #f8fafc;
        background:
          radial-gradient(120% 150% at 12% -22%, rgba(71, 85, 105, 0.4) 0%, rgba(30, 41, 59, 0.5) 40%, rgba(8, 13, 24, 0.44) 100%),
          linear-gradient(135deg, rgba(30, 41, 59, 0.54), rgba(8, 13, 24, 0.46));
        border-color: rgba(255, 255, 255, 0.12);
        box-shadow:
          0 26px 82px rgba(0, 0, 0, 0.38),
          0 5px 18px rgba(0, 0, 0, 0.18),
          inset 0 1px 0 rgba(255, 255, 255, 0.16),
          inset 0 -18px 42px rgba(255, 255, 255, 0.04),
          inset 0 0 0 1px rgba(255, 255, 255, 0.05);
      }
      #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-card {
        color: #f8fafc;
        background: transparent;
        box-shadow: none;
      }
      #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-card[data-active="true"] {
        border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 34%, rgba(255, 255, 255, 0.12));
        background:
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 18%, rgba(30, 41, 59, 0.72)),
            color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 10%, rgba(8, 13, 24, 0.72))
          );
        box-shadow:
          0 0 18px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 10%, transparent),
          0 4px 10px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 5%, transparent),
          inset 0 1px 0 rgba(255, 255, 255, 0.13),
          inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 12%, rgba(255, 255, 255, 0.08));
      }
      #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-card:focus-visible {
        border-color: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 42%, rgba(255, 255, 255, 0.16));
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.13),
          inset 0 0 0 1px color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 12%, rgba(255, 255, 255, 0.08));
      }
      #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-name {
        color: #f8fafc;
      }
      #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-host {
        color: rgba(248, 250, 252, 0.58);
      }
      #${PANEL_ID}[data-theme="dark"] .x-tab-switcher-thumb {
        background: color-mix(in srgb, var(--x-tab-switcher-card-accent, var(--x-tab-switcher-accent)) 18%, rgba(15, 23, 42, 0.92));
      }
      @media (prefers-reduced-motion: reduce) {
        .x-tab-switcher-thumb img[data-kind="thumbnail"] {
          transition: none;
        }
      }
    `;
  }

  window._x_extension_toggleTabSwitcher_2026_unique_ = function(rawContext) {
    const context = rawContext && typeof rawContext === 'object' ? rawContext : {};
    if (handleExistingSwitcher(context)) {
      return { ok: true, reason: 'already-open' };
    }
    const tabs = Array.isArray(context.tabs)
      ? context.tabs.filter((tab) => tab && typeof tab.id === 'number').slice(0, 5)
      : [];
    if (!tabs.length) {
      return { ok: false, reason: 'empty' };
    }
    const tabSwitcherReactViewApi = window.LumnoOverlayTabSwitcherView;
    if (!tabSwitcherReactViewApi ||
        typeof tabSwitcherReactViewApi.createTabSwitcherView !== 'function') {
      return { ok: false, reason: 'react-view-unavailable' };
    }

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = [
      'all: initial !important',
      'position: fixed !important',
      'inset: 0 !important',
      'z-index: 2147483647 !important',
      'pointer-events: none !important',
      'contain: layout style paint !important'
    ].join(';');
    const shadow = typeof host.attachShadow === 'function' ? host.attachShadow({ mode: 'closed' }) : host;
    const style = document.createElement('style');
    style.textContent = buildStyles();
    shadow.appendChild(style);

    let selectedIndex = clampSelectedIndex(context.selectedIndex, tabs.length);
    let tabSwitcherReactView = tabSwitcherReactViewApi.createTabSwitcherView({
      document,
      root: shadow,
      panelId: PANEL_ID,
      tabs,
      selectedIndex,
      ariaLabel: getMessage('tab_switcher_title', 'Recent tabs'),
      sanitizeText,
      getHostLabel,
      getMessage,
      normalizeAccentCss,
      getThumbnailStatus,
      onSelect(index) {
        selectedIndex = index;
        renderSelection();
      },
      onActivate(index, event) {
        if (!event || event.isTrusted !== true) {
          return;
        }
        stopHandledKeyEvent(event);
        selectedIndex = index;
        switchToSelected();
      }
    });
    const panel = tabSwitcherReactView.panel;
    if (!panel) {
      host.remove();
      return { ok: false, reason: 'react-view-unavailable' };
    }
    applySwitcherViewportPlacement(panel, window);
    applySwitcherZoomCompensation(panel, context.tabZoomFactor, getSwitcherVisualViewportScale(window));

    function syncSwitcherZoomCompensation() {
      applySwitcherViewportPlacement(panel, window);
      applySwitcherZoomCompensation(panel, context.tabZoomFactor, getSwitcherVisualViewportScale(window));
    }

    const switcherThemeController = createSwitcherThemeController(panel);
    switcherThemeController.start();

    let didRequestSwitch = false;
    let suppressInitialShortcutAdvanceUntilQKeyup = context.suppressInitialShortcutAdvance === true;

    function renderSelection() {
      tabSwitcherReactView.updateSelection(selectedIndex);
    }

    function close() {
      const cleanup = host._lumnoTabSwitcherCleanup;
      if (typeof cleanup === 'function') {
        cleanup();
      }
      host.remove();
    }

    function switchToSelected() {
      if (didRequestSwitch) {
        return;
      }
      const selected = tabs[selectedIndex];
      if (!selected || typeof selected.id !== 'number') {
        close();
        return;
      }
      didRequestSwitch = true;
      chrome.runtime.sendMessage({
        action: 'switchToTab',
        tabId: selected.id,
        windowId: typeof selected.windowId === 'number' ? selected.windowId : null
      }, () => {
        close();
      });
    }

    function selectByOffset(offset) {
      selectedIndex = clampSelectedIndex(selectedIndex + offset, tabs.length);
      renderSelection();
    }

    function shouldSuppressInitialShortcutAdvance() {
      return suppressInitialShortcutAdvanceUntilQKeyup;
    }

    function advanceSelectionFromShortcut(offset) {
      suppressInitialShortcutAdvanceUntilQKeyup = false;
      selectByOffset(offset);
      return true;
    }

    host._lumnoTabSwitcherAdvance = function(offset) {
      return advanceSelectionFromShortcut(normalizeAdvanceOffset(offset));
    };

    function handleExternalAdvance(event) {
      if (didRequestSwitch) {
        return;
      }
      const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
      advanceSelectionFromShortcut(normalizeAdvanceOffset(detail.offset));
    }

    function stopHandledKeyEvent(event) {
      if (!event) {
        return;
      }
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      event.stopPropagation();
    }

    function handleKeydown(event) {
      if (!event || event.isTrusted !== true) {
        return;
      }
      const keyText = String(event.key || '').toLowerCase();
      if (event.key === 'Tab') {
        stopHandledKeyEvent(event);
        selectByOffset(event.shiftKey ? -1 : 1);
        return;
      }
      if (keyText === 'q') {
        stopHandledKeyEvent(event);
        if (shouldSuppressInitialShortcutAdvance() && event.altKey) {
          return;
        }
        suppressInitialShortcutAdvanceUntilQKeyup = false;
        selectByOffset(1);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        stopHandledKeyEvent(event);
        selectByOffset(1);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        stopHandledKeyEvent(event);
        selectByOffset(-1);
        return;
      }
      if (event.key === 'Enter') {
        stopHandledKeyEvent(event);
        switchToSelected();
        return;
      }
      if (event.key === 'Escape') {
        stopHandledKeyEvent(event);
        close();
      }
    }

    function handleKeyup(event) {
      if (!event || event.isTrusted !== true) {
        return;
      }
      const keyText = String(event.key || '').toLowerCase();
      if (keyText === 'q') {
        suppressInitialShortcutAdvanceUntilQKeyup = false;
        stopHandledKeyEvent(event);
        if (!event.altKey) {
          switchToSelected();
        }
        return;
      }
      if (event.key === 'Alt') {
        suppressInitialShortcutAdvanceUntilQKeyup = false;
        stopHandledKeyEvent(event);
        switchToSelected();
      }
    }

    function handlePointerDown(event) {
      const path = event && typeof event.composedPath === 'function' ? event.composedPath() : [];
      if (!path.includes(host) && !panel.contains(event.target)) {
        close();
      }
    }

    host._lumnoTabSwitcherUpdateThumbnail = function(update) {
      return tabSwitcherReactView.updateThumbnail(update);
    };
    document.documentElement.appendChild(host);

    const switcherVisualViewport = window.visualViewport && typeof window.visualViewport.addEventListener === 'function'
      ? window.visualViewport
      : null;
    host._lumnoTabSwitcherCleanup = function() {
      window.removeEventListener('keydown', handleKeydown, true);
      window.removeEventListener('keyup', handleKeyup, true);
      if (switcherVisualViewport && typeof switcherVisualViewport.removeEventListener === 'function') {
        switcherVisualViewport.removeEventListener('resize', syncSwitcherZoomCompensation);
        switcherVisualViewport.removeEventListener('scroll', syncSwitcherZoomCompensation);
      }
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener(TAB_SWITCHER_ADVANCE_EVENT, handleExternalAdvance, true);
      switcherThemeController.destroy();
      if (tabSwitcherReactView) {
        tabSwitcherReactView.destroy();
        tabSwitcherReactView = null;
      }
      delete host._lumnoTabSwitcherUpdateThumbnail;
    };
    window.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('keyup', handleKeyup, true);
    if (switcherVisualViewport) {
      switcherVisualViewport.addEventListener('resize', syncSwitcherZoomCompensation, { passive: true });
      switcherVisualViewport.addEventListener('scroll', syncSwitcherZoomCompensation, { passive: true });
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener(TAB_SWITCHER_ADVANCE_EVENT, handleExternalAdvance, true);

    renderSelection();
    return { ok: true };
  };
})();
