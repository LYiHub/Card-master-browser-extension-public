(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const THEME_STORAGE_KEY = '_x_extension_theme_mode_2024_unique_';
  const NEWTAB_THEME_MODE_STORAGE_KEY = '_x_extension_newtab_theme_mode_2026_unique_';
  const NEWTAB_THEME_SCOPE_STORAGE_KEY = '_x_extension_newtab_theme_scope_2026_unique_';
  const NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY = '_x_extension_newtab_shortcuts_visible_2026_unique_';
  const NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY = '_x_extension_newtab_shortcut_add_visible_2026_unique_';
  const NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY = '_x_extension_newtab_shortcut_dock_magnification_enabled_2026_unique_';
  const BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY = '_x_extension_bookmark_folder_icons_visible_2026_unique_';
  const UPDATE_NOTICE_ENABLED_STORAGE_KEY = '_x_extension_update_notice_enabled_2026_unique_';
  const FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY = '_x_extension_favicon_enhanced_fetch_enabled_2026_unique_';
  const OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY = '_x_extension_overlay_open_tabs_default_visible_2026_unique_';
  const OVERLAY_ENTER_ANIMATION_STORAGE_KEY = '_x_extension_overlay_enter_animation_2026_unique_';
  const SELECTION_QUICK_ACTIONS_ENABLED_STORAGE_KEY = '_x_extension_selection_quick_actions_enabled_2026_unique_';
  const SELECTION_QUICK_ACTIONS_PROVIDER_STORAGE_KEY = '_x_extension_selection_quick_actions_provider_2026_unique_';
  const SELECTION_QUICK_ACTIONS_GROUP_ENABLED_STORAGE_KEY = '_x_extension_selection_quick_actions_group_enabled_2026_unique_';
  // Device-specific appearance. Never import these values from Chrome Sync.
  const BOOKMARK_TOPBAR_LOCAL_STORAGE_KEYS = Object.freeze([
    '_x_extension_bookmark_topbar_surface_mode_2026_unique_',
    '_x_extension_bookmark_topbar_surface_color_light_2026_unique_',
    '_x_extension_bookmark_topbar_surface_color_dark_2026_unique_',
    '_x_extension_bookmark_topbar_surface_color_2026_unique_'
  ]);
  // User-controlled preferences that are safe to store in chrome.storage.sync.
  // Keep generated caches, device state, and custom wallpaper media out of this list.
  const CHROME_SYNC_STORAGE_KEYS = Object.freeze([
    '_x_extension_theme_mode_2024_unique_',
    '_x_extension_language_2024_unique_',
    '_x_extension_recent_mode_2024_unique_',
    '_x_extension_recent_count_2024_unique_',
    '_x_extension_newtab_width_mode_2026_unique_',
    '_x_extension_newtab_search_width_2026_unique_',
    '_x_extension_newtab_theme_mode_2026_unique_',
    '_x_extension_newtab_theme_scope_2026_unique_',
    '_x_extension_newtab_zen_mode_2026_unique_',
    '_x_extension_newtab_wallpaper_2026_unique_',
    '_x_extension_newtab_wallpaper_overlay_2026_unique_',
    '_x_extension_newtab_wallpaper_effect_2026_unique_',
    '_x_extension_newtab_favicon_2026_unique_',
    '_x_extension_overlay_size_mode_2026_unique_',
    '_x_extension_overlay_enter_animation_2026_unique_',
    '_x_extension_bookmark_count_2024_unique_',
    '_x_extension_bookmark_columns_2024_unique_',
    '_x_extension_bookmark_view_mode_2026_unique_',
    '_x_extension_bookmark_folder_icons_visible_2026_unique_',
    '_x_extension_newtab_pinned_recent_sites_2026_unique_',
    '_x_extension_newtab_hidden_recent_sites_2026_unique_',
    '_x_extension_newtab_shortcuts_2026_unique_',
    '_x_extension_newtab_shortcuts_visible_2026_unique_',
    '_x_extension_newtab_shortcut_add_visible_2026_unique_',
    '_x_extension_newtab_shortcut_dock_magnification_enabled_2026_unique_',
    '_x_extension_update_notice_enabled_2026_unique_',
    '_x_extension_auto_pip_enabled_2026_unique_',
    '_x_extension_tab_switcher_enabled_2026_unique_',
    '_x_extension_document_pip_enabled_2026_unique_',
    '_x_extension_pinned_tab_recovery_enabled_2026_unique_',
    '_x_extension_selection_quick_actions_enabled_2026_unique_',
    '_x_extension_selection_quick_actions_provider_2026_unique_',
    '_x_extension_selection_quick_actions_group_enabled_2026_unique_',
    '_x_extension_overlay_tab_priority_2024_unique_',
    '_x_extension_newtab_wordmark_visible_2026_unique_',
    '_x_extension_restricted_action_2024_unique_',
    '_x_extension_search_result_priority_2026_unique_',
    '_x_extension_search_result_source_types_2026_unique_',
    '_x_extension_overlay_open_tabs_default_visible_2026_unique_',
    '_x_extension_fallback_hotkey_2024_unique_',
    '_x_extension_site_search_custom_2024_unique_',
    '_x_extension_site_search_disabled_2024_unique_',
    '_x_extension_search_blacklist_2026_unique_',
    '_x_extension_favicon_request_blacklist_2026_unique_',
    '_x_extension_favicon_enhanced_fetch_enabled_2026_unique_',
    '_x_extension_default_search_engine_2024_unique_'
  ]);
  const SELECTION_QUICK_ACTIONS_PROVIDER_KEYS = Object.freeze([
    'gpt',
    'gm',
    'dbai',
    'qw',
    'yb',
    'mx',
    'ds',
    'kimi'
  ]);
  // Keep the original key value so existing installations migrate from boolean to mode in place.
  const NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY = '_x_extension_newtab_wordmark_visible_2026_unique_';
  const NEWTAB_TOP_CONTENT_BRAND = 'brand';
  const NEWTAB_TOP_CONTENT_TIME = 'time';
  const NEWTAB_TOP_CONTENT_OFF = 'off';

  function normalizeLocale(locale) {
    const raw = String(locale || '').trim();
    if (!raw) {
      return 'en';
    }
    const lower = raw.toLowerCase();
    if (lower.startsWith('zh')) {
      if (lower.includes('tw') || lower.includes('hk') || lower.includes('mo') || lower.includes('hant')) {
        return 'zh_TW';
      }
      return 'zh_CN';
    }
    if (lower === 'ja' || lower.startsWith('ja-') || lower.startsWith('ja_')) {
      return 'ja';
    }
    return 'en';
  }

  function localeToHtmlLang(locale) {
    const normalized = normalizeLocale(locale);
    if (normalized === 'zh_CN') {
      return 'zh-CN';
    }
    if (normalized === 'zh_TW') {
      return 'zh-TW';
    }
    if (normalized === 'ja') {
      return 'ja';
    }
    return 'en';
  }

  function normalizeNewtabWidthMode(value) {
    return value === 'standard' ? 'standard' : 'wide';
  }

  function normalizeNewtabSearchWidth(value, options) {
    const config = options || {};
    const allowNull = Boolean(config.allowNull);
    const min = Number.isFinite(Number(config.min)) ? Number(config.min) : 720;
    const max = Number.isFinite(Number(config.max)) ? Number(config.max) : 1040;
    const fallback = Number.isFinite(Number(config.fallback)) ? Number(config.fallback) : 920;
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return allowNull ? null : fallback;
    }
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function normalizeNewtabTopContentMode(value) {
    if (value === NEWTAB_TOP_CONTENT_TIME) {
      return NEWTAB_TOP_CONTENT_TIME;
    }
    if (value === NEWTAB_TOP_CONTENT_OFF || value === false) {
      return NEWTAB_TOP_CONTENT_OFF;
    }
    return NEWTAB_TOP_CONTENT_BRAND;
  }

  function normalizeNewtabWordmarkVisible(value) {
    return normalizeNewtabTopContentMode(value) !== NEWTAB_TOP_CONTENT_OFF;
  }

  function normalizeNewtabShortcutsVisible(value) {
    return value !== false;
  }

  function normalizeNewtabShortcutAddVisible(value) {
    return value !== false;
  }

  function normalizeNewtabShortcutDockMagnificationEnabled(value) {
    return value !== false;
  }

  function normalizeBookmarkFolderIconsVisible(value) {
    return value !== false;
  }

  function normalizeUpdateNoticeEnabled(value) {
    return value !== false;
  }

  function normalizeFaviconEnhancedFetchEnabled(value) {
    return value !== false;
  }

  function normalizeOverlayOpenTabsDefaultVisible(value) {
    return value !== false;
  }

  function normalizeOverlaySizeMode(value) {
    if (value === 'compact' || value === 'large') {
      return value;
    }
    return 'standard';
  }

  function normalizeOverlayEnterAnimation(value) {
    return value === 'fade' ? 'fade' : 'elastic';
  }

  function normalizeOverlayTabPriorityMode(value) {
    if (value === 'switchTabFirst') {
      return true;
    }
    if (value === 'newtabFirst') {
      return false;
    }
    if (value === false) {
      return false;
    }
    return true;
  }

  function normalizeSearchResultPriority(value) {
    return value === 'search' ? 'search' : 'autocomplete';
  }

  const SEARCH_RESULT_SOURCE_TYPES = Object.freeze(['topSite', 'bookmark', 'history']);

  function normalizeSearchResultSourceType(value) {
    const raw = String(value || '').trim();
    if (raw === 'topSite' || raw === 'topSites' || raw === 'frequent' || raw === 'common') {
      return 'topSite';
    }
    if (raw === 'bookmark' || raw === 'bookmarks') {
      return 'bookmark';
    }
    if (raw === 'history') {
      return 'history';
    }
    return '';
  }

  function normalizeSearchResultSourceTypes(value) {
    const rawItems = Array.isArray(value)
      ? value
      : (typeof value === 'string' ? value.split(/[\s,]+/) : []);
    const selected = [];
    rawItems.forEach((item) => {
      const type = normalizeSearchResultSourceType(item);
      if (!type || selected.includes(type)) {
        return;
      }
      selected.push(type);
    });
    return selected.length > 0 ? selected : SEARCH_RESULT_SOURCE_TYPES.slice();
  }

  function normalizeTabRankScoreDebugMode(value) {
    return value === true;
  }

  function normalizeTabSwitcherEnabled(value) {
    return value !== false;
  }

  function normalizeSelectionQuickActionsEnabled(value) {
    return value === true;
  }

  function normalizeSelectionQuickActionsProvider(value) {
    const key = String(value || '').trim().toLowerCase();
    return SELECTION_QUICK_ACTIONS_PROVIDER_KEYS.includes(key) ? key : 'gpt';
  }

  function normalizeSelectionQuickActionsGroupEnabled(value) {
    return value === true;
  }

  function normalizeThemePreference(value) {
    if (value === 'dark') {
      return 'dark';
    }
    if (value === 'light') {
      return 'light';
    }
    return '';
  }

  function normalizeThemeMode(value) {
    if (value === 'dark' || value === 'light') {
      return value;
    }
    return 'system';
  }

  function createGlobalThemeModeStorageUpdate(mode) {
    return {
      [THEME_STORAGE_KEY]: normalizeThemeMode(mode)
    };
  }

  function createProviderStorageRuntime(chromeApi) {
    const storage = chromeApi && chromeApi.storage ? chromeApi.storage : null;
    const syncArea = storage && storage.sync ? storage.sync : null;
    const localArea = storage && storage.local ? storage.local : syncArea;
    const activeAreaName = syncArea ? 'sync' : (localArea ? 'local' : '');
    const modeReady = Promise.resolve(activeAreaName);

    function getActiveArea() {
      return syncArea || localArea;
    }

    function invoke(method, args) {
      const values = Array.from(args || []);
      const callback = typeof values[values.length - 1] === 'function' ? values.pop() : null;
      return modeReady.then(() => new Promise((resolve, reject) => {
        const area = getActiveArea();
        if (!area || typeof area[method] !== 'function') {
          if (callback) callback(method === 'get' ? {} : undefined);
          resolve(method === 'get' ? {} : undefined);
          return;
        }
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          if (callback) callback(result);
          resolve(result);
        };
        try {
          const maybePromise = area[method](...values, finish);
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(finish).catch(reject);
          }
        } catch (error) {
          reject(error);
        }
      }));
    }

    const area = Object.freeze({
      get(...args) { return invoke('get', args); },
      set(...args) { return invoke('set', args); },
      remove(...args) { return invoke('remove', args); },
      clear(...args) { return invoke('clear', args); }
    });

    return Object.freeze({
      area,
      name: activeAreaName,
      ready: modeReady,
      getActiveAreaName() { return activeAreaName; },
      isActiveAreaName(areaName) { return String(areaName || '') === activeAreaName; }
    });
  }

  return Object.freeze({
    THEME_STORAGE_KEY,
    NEWTAB_THEME_MODE_STORAGE_KEY,
    NEWTAB_THEME_SCOPE_STORAGE_KEY,
    NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
    NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
    NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
    BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
    UPDATE_NOTICE_ENABLED_STORAGE_KEY,
    FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
    OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY,
    OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
    SELECTION_QUICK_ACTIONS_ENABLED_STORAGE_KEY,
    SELECTION_QUICK_ACTIONS_PROVIDER_STORAGE_KEY,
    SELECTION_QUICK_ACTIONS_GROUP_ENABLED_STORAGE_KEY,
    BOOKMARK_TOPBAR_LOCAL_STORAGE_KEYS,
    CHROME_SYNC_STORAGE_KEYS,
    SELECTION_QUICK_ACTIONS_PROVIDER_KEYS,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    NEWTAB_TOP_CONTENT_BRAND,
    NEWTAB_TOP_CONTENT_TIME,
    NEWTAB_TOP_CONTENT_OFF,
    normalizeLocale,
    localeToHtmlLang,
    normalizeNewtabWidthMode,
    normalizeNewtabSearchWidth,
    normalizeNewtabTopContentMode,
    normalizeNewtabWordmarkVisible,
    normalizeNewtabShortcutsVisible,
    normalizeNewtabShortcutAddVisible,
    normalizeNewtabShortcutDockMagnificationEnabled,
    normalizeBookmarkFolderIconsVisible,
    normalizeUpdateNoticeEnabled,
    normalizeFaviconEnhancedFetchEnabled,
    normalizeOverlayOpenTabsDefaultVisible,
    normalizeOverlaySizeMode,
    normalizeOverlayEnterAnimation,
    normalizeOverlayTabPriorityMode,
    normalizeSearchResultPriority,
    normalizeSearchResultSourceTypes,
    normalizeTabRankScoreDebugMode,
    normalizeTabSwitcherEnabled,
    normalizeSelectionQuickActionsEnabled,
    normalizeSelectionQuickActionsProvider,
    normalizeSelectionQuickActionsGroupEnabled,
    normalizeThemePreference,
    normalizeThemeMode,
    createGlobalThemeModeStorageUpdate,
    createProviderStorageRuntime
  });
});
