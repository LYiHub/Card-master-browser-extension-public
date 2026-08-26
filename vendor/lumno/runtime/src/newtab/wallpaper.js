(function() {
  const WALLPAPER_ADAPTIVE_TONE = globalThis.LumnoNewtabWallpaperAdaptiveTone || {};
  const WALLPAPER_EFFECTS = globalThis.LumnoNewtabWallpaperEffects || {};
  const WALLPAPER_LOCAL_STORE = globalThis.LumnoNewtabWallpaperLocalStore || {};
  const SETTINGS = globalThis.LumnoSettings || {};
  const DEFAULT_STORAGE_KEYS = {
    wallpaper: '_x_extension_newtab_wallpaper_2026_unique_',
    localWallpaper: '_x_extension_newtab_local_wallpaper_2026_unique_',
    overlay: '_x_extension_newtab_wallpaper_overlay_2026_unique_',
    effect: '_x_extension_newtab_wallpaper_effect_2026_unique_',
    topContentMode: SETTINGS.NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY ||
      '_x_extension_newtab_wordmark_visible_2026_unique_',
    favicon: '_x_extension_newtab_favicon_2026_unique_'
  };
  const PRELOAD_STORAGE_KEY = '_x_extension_newtab_wallpaper_preload_2026_unique_';
  const PRELOAD_STORAGE_VERSION = 3;
  const WALLPAPER_EFFECT_MODE_STORAGE_VERSION = 4;
  const FALLBACK_WALLPAPER_EFFECT_PREFS = {
    version: 3,
    type: 'none',
    strength: 50,
    size: 50,
    spacing: 50
  };

  function normalizeSingleWallpaperEffectPrefs(value) {
    if (typeof WALLPAPER_EFFECTS.normalizePrefs === 'function') {
      return WALLPAPER_EFFECTS.normalizePrefs(value);
    }
    const source = value && typeof value === 'object' ? value : {};
    const type = ['none', 'grain', 'halftone', 'ascii'].includes(source.type)
      ? source.type
      : FALLBACK_WALLPAPER_EFFECT_PREFS.type;
    const normalizePercent = (raw, fallback) => {
      const number = Number(raw);
      return Number.isFinite(number)
        ? Math.max(0, Math.min(100, Math.round(number)))
        : fallback;
    };
    const rawSize = Number.isFinite(Number(source.size)) ? source.size : source.density;
    return {
      version: FALLBACK_WALLPAPER_EFFECT_PREFS.version,
      type,
      strength: normalizePercent(source.strength, FALLBACK_WALLPAPER_EFFECT_PREFS.strength),
      size: normalizePercent(rawSize, FALLBACK_WALLPAPER_EFFECT_PREFS.size),
      spacing: normalizePercent(source.spacing, FALLBACK_WALLPAPER_EFFECT_PREFS.spacing)
    };
  }

  function normalizeWallpaperEffectStoragePrefs(value) {
    const source = value && typeof value === 'object' ? value : null;
    const hasModePrefs = Boolean(source &&
      ((source.light && typeof source.light === 'object') ||
        (source.dark && typeof source.dark === 'object')));
    const shared = normalizeSingleWallpaperEffectPrefs(value);
    const lightSource = hasModePrefs ? (source.light || source.dark) : shared;
    const darkSource = hasModePrefs ? (source.dark || source.light) : shared;
    return {
      version: WALLPAPER_EFFECT_MODE_STORAGE_VERSION,
      light: normalizeSingleWallpaperEffectPrefs(lightSource),
      dark: normalizeSingleWallpaperEffectPrefs(darkSource)
    };
  }

  function createWallpaperRuntime(options) {
    options = options || {};
    const documentObj = options.documentObj || document;
    const windowObj = options.windowObj || window;
    const document = documentObj;
    const window = windowObj;
    const chrome = options.chromeObj || globalThis.chrome || {};
    const extensionRoutes = options.extensionRoutes || globalThis.LumnoExtensionRoutes || {};
    const storageArea = options.storageArea || null;
    const localWallpaperStorageArea = options.localWallpaperStorageArea || null;
    const wallpaperView = options.view || globalThis.LumnoNewtabWallpaperView || null;
    const storageKeys = Object.assign({}, DEFAULT_STORAGE_KEYS, options.storageKeys || {});
    const NEWTAB_WALLPAPER_STORAGE_KEY = storageKeys.wallpaper;
    const NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY = storageKeys.localWallpaper;
    const NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY = storageKeys.overlay;
    const NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY = storageKeys.effect;
    const NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY = storageKeys.topContentMode;
    const NEWTAB_FAVICON_STORAGE_KEY = storageKeys.favicon;
    const t = typeof options.t === 'function'
      ? options.t
      : function(_key, fallback) { return fallback || ''; };
    const formatMessage = typeof options.formatMessage === 'function'
      ? options.formatMessage
      : function(_key, fallback, params) {
        let text = fallback || '';
        Object.keys(params || {}).forEach((token) => {
          text = text.replace(new RegExp('\\{' + token + '\\}', 'g'), params[token]);
        });
        return text;
      };
    const getThemeMode = typeof options.getThemeMode === 'function'
      ? options.getThemeMode
      : function() { return 'system'; };
    const getEffectiveThemeMode = typeof options.getEffectiveThemeMode === 'function'
      ? options.getEffectiveThemeMode
      : getThemeMode;
    const getThemeScope = typeof options.getThemeScope === 'function'
      ? options.getThemeScope
      : function() { return 'global'; };
    const setThemeMode = typeof options.setThemeMode === 'function'
      ? options.setThemeMode
      : function() {};
    const setThemeScope = typeof options.setThemeScope === 'function'
      ? options.setThemeScope
      : function() {};
    const BroadcastChannelCtor = typeof options.BroadcastChannel === 'function'
      ? options.BroadcastChannel
      : (window && typeof window.BroadcastChannel === 'function'
        ? window.BroadcastChannel
        : (typeof globalThis.BroadcastChannel === 'function' ? globalThis.BroadcastChannel : null));
    const searchWidthConfig = Object.assign({
      min: 720,
      max: 1040,
      fallback: 920,
      snapPoints: [720, 920, 1040],
      snapThreshold: 14
    }, options.searchWidthConfig || {});
    const getSearchWidth = typeof options.getSearchWidth === 'function'
      ? options.getSearchWidth
      : function() { return searchWidthConfig.fallback; };
    const setSearchWidth = typeof options.setSearchWidth === 'function'
      ? options.setSearchWidth
      : function() {};
    const getRiSvg = typeof options.getRiSvg === 'function'
      ? options.getRiSvg
      : function(id, sizeClass) {
        const size = sizeClass || 'ri-size-16';
        return '<i class="ri-icon ' + size + ' ' + id + '" aria-hidden="true"></i>';
      };
    const showToast = typeof options.showToast === 'function' ? options.showToast : function() {};
    const showTopActionTooltip = typeof options.showTopActionTooltip === 'function'
      ? options.showTopActionTooltip
      : function() {};
    const hideTopActionTooltip = typeof options.hideTopActionTooltip === 'function'
      ? options.hideTopActionTooltip
      : function() {};
    const applyWordmarkThemeAppearance = typeof options.applyWordmarkThemeAppearance === 'function'
      ? options.applyWordmarkThemeAppearance
      : function() {};
    const hasTopContentModeGetter = typeof options.getTopContentMode === 'function';
    const getTopContentMode = hasTopContentModeGetter
      ? options.getTopContentMode
      : function() { return 'brand'; };
    const setTopContentMode = typeof options.setTopContentMode === 'function'
      ? options.setTopContentMode
      : function() {};
    const getAdaptiveToneTargets = typeof options.getAdaptiveToneTargets === 'function'
      ? options.getAdaptiveToneTargets
      : function() { return []; };
    const localWallpaperStore = typeof WALLPAPER_LOCAL_STORE.createWallpaperLocalStore === 'function'
      ? WALLPAPER_LOCAL_STORE.createWallpaperLocalStore({
        documentObj,
        windowObj
      })
      : null;

    const NEWTAB_WALLPAPER_DEFAULT_DIRECTORY = 'vendor/lumno/wallpapers';
    const NEWTAB_WALLPAPER_EXTENSION_DIRECTORY = 'vendor/lumno/wallpapers';
    const NEWTAB_WALLPAPER_THUMBNAIL_SUFFIX = '-thumb.webp';
    const NEWTAB_WALLPAPER_DEFAULT_ID = 'monet-coastal-white';
    const NEWTAB_CUSTOM_WALLPAPER_ID = WALLPAPER_LOCAL_STORE.CUSTOM_WALLPAPER_ID || 'custom-upload';
    const NEWTAB_CUSTOM_WALLPAPER_ID_PREFIX = WALLPAPER_LOCAL_STORE.CUSTOM_WALLPAPER_ID_PREFIX || 'custom-wallpaper-';
    const NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE = '__lumno_local_wallpaper_disabled__';
    const NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION = 2;
    const NEWTAB_WALLPAPER_MODE_LIGHT = 'light';
    const NEWTAB_WALLPAPER_MODE_DARK = 'dark';
    const NEWTAB_WALLPAPER_MODES = [NEWTAB_WALLPAPER_MODE_LIGHT, NEWTAB_WALLPAPER_MODE_DARK];
    const NEWTAB_WALLPAPER_OPTIONS = [
      {
        id: 'dark-linocut-topographic',
        nameKey: 'newtab_wallpaper_name_dark_linocut_topographic',
        fallbackName: 'Night topography',
        file: 'lumno-newtab-dark-linocut-topographic.webp'
      },
      {
        id: 'dark-monet-lily-nocturne',
        nameKey: 'newtab_wallpaper_name_dark_monet_lily_nocturne',
        fallbackName: 'Lily nocturne',
        file: 'lumno-newtab-dark-monet-lily-nocturne.webp'
      },
      {
        id: 'dark-shanshui-moonlit',
        nameKey: 'newtab_wallpaper_name_dark_shanshui_moonlit',
        fallbackName: 'Moonlit shanshui',
        file: 'lumno-newtab-dark-shanshui-moonlit.webp'
      },
      {
        id: 'monet-coastal-white',
        nameKey: 'newtab_wallpaper_name_monet_coastal_white',
        fallbackName: 'Monet coast',
        file: 'lumno-newtab-monet-coastal-white.webp'
      },
      {
        id: 'white-3d-observatory',
        nameKey: 'newtab_wallpaper_name_white_3d_observatory',
        fallbackName: 'Misty observatory',
        file: 'lumno-newtab-white-3d-observatory.webp'
      },
      {
        id: 'white-shanshui',
        nameKey: 'newtab_wallpaper_name_white_shanshui',
        fallbackName: 'Clear shanshui',
        file: 'lumno-newtab-white-shanshui.webp'
      }
    ];
    const NEWTAB_WALLPAPER_OVERLAY_STORAGE_VERSION = 2;
    const NEWTAB_WALLPAPER_OVERLAY_DEFAULTS = { light: 50, dark: 50 };
    const NEWTAB_WALLPAPER_OVERLAY_SNAP_POINTS = [0, 50, 100];
    const NEWTAB_WALLPAPER_OVERLAY_SNAP_THRESHOLD = 4;
    const NEWTAB_WALLPAPER_OVERLAY_STOPS = {
      light: { top: 54, mid: 20, bottom: 38 },
      dark: { top: 44, mid: 20, bottom: 50 }
    };
    const NEWTAB_WALLPAPER_EFFECT_DEFAULTS = WALLPAPER_EFFECTS.DEFAULT_PREFS || {
      version: 3,
      type: 'none',
      strength: 50,
      size: 50,
      spacing: 50
    };
    const NEWTAB_WALLPAPER_EFFECT_TYPES = [
      { type: 'none', labelKey: 'newtab_wallpaper_effect_none', fallback: 'Off' },
      { type: 'grain', labelKey: 'newtab_wallpaper_effect_grain', fallback: 'Grain' },
      { type: 'halftone', labelKey: 'newtab_wallpaper_effect_halftone', fallback: 'Halftone' },
      { type: 'ascii', labelKey: 'newtab_wallpaper_effect_ascii', fallback: 'ASCII' }
    ];
    const NEWTAB_FAVICON_DEFAULT_ID = 'default';
    const NEWTAB_FAVICON_OPTIONS = [
      {
        id: 'default',
        nameKey: 'newtab_favicon_name_default',
        fallbackName: 'Default',
        file: 'assets/images/lumno.png',
        type: 'image/png'
      },
      {
        id: 'alternate',
        nameKey: 'newtab_favicon_name_alternate',
        fallbackName: 'Alternate',
        file: 'assets/images/lumno-newtab-favicon.svg',
        preview: 'inlineSvg',
        themeAwareSvg: true,
        type: 'image/svg+xml',
        sizes: 'any'
      }
    ];
    const NEWTAB_FAVICON_THEME_QUERY = '(prefers-color-scheme: dark)';
    const NEWTAB_FAVICON_THEME_BROADCAST_CHANNEL = 'lumno:newtab-favicon-theme';
    const NEWTAB_FAVICON_THEME_REFRESH_ACTION = 'lumno:newtab-favicon-theme-refresh';
    const NEWTAB_FAVICON_PRELOAD_STORAGE_KEY = '_x_extension_newtab_favicon_preload_2026_unique_';
    const NEWTAB_FAVICON_SVG_SHADOW_PATH = 'M14.1832 28.5107C14.7736 26.0503 17.4872 24.8712 19.8045 25.8872L29.0688 29.9483C23.1024 42.5571 20.9583 59.1892 34.0764 74.4517C35.5367 76.1508 37.0158 77.6786 38.5039 79.0511C15.0742 61.6944 10.3754 44.3784 14.1832 28.5107ZM50.1563 62.6667C55.3534 57.1072 64.2555 57.3891 69.0898 63.2669L69.4706 63.7295C65.5069 61.937 61.0203 61.3468 56.5866 62.1747L49.3526 63.5259L50.1563 62.6667Z';
    const NEWTAB_FAVICON_SVG_MAIN_PATH = 'M34.0761 74.4516C15.8955 53.2991 27.0297 29.5157 37.0262 17.4579C38.6314 15.5217 41.5522 15.6368 43.1924 17.5435L54.2217 30.3654C58.8053 35.6938 59.7099 43.2656 56.5107 49.524L49.3531 63.5257L56.8412 62.1274C64.6007 60.6784 72.5332 63.5719 77.5374 69.6765L83.762 77.2699C85.0646 78.859 85.0813 81.1684 83.4746 82.4491C74.4334 89.6554 52.1633 95.4955 34.0761 74.4516Z';
    const NEWTAB_FAVICON_THEMES = {
      light: {
        color: '#000000',
        shadowOpacity: '0.2',
        mainOpacity: '0.5'
      },
      dark: {
        color: '#f1f3f4',
        shadowOpacity: '0.34',
        mainOpacity: '0.72'
      }
    };
    const WALLPAPER_PANEL_RESIZE_DURATION_MS = 260;
    const WALLPAPER_PANEL_RESIZE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const WALLPAPER_VISUAL_TRANSITION_MS = 220;
    const WALLPAPER_VISUAL_REFRESH_DELAY_MS = 80;
    const WALLPAPER_IMAGE_READY_CACHE_LIMIT = 8;

    let initialWallpaperApplied = false;
    let hasWallpaperBootstrapStarted = false;
    let hasStoredWallpaperStateLoaded = false;
    let hasNewtabFaviconBootstrapStarted = false;
    let resolveInitialWallpaperReady = null;
    const initialWallpaperReadyPromise = new Promise((resolve) => {
      resolveInitialWallpaperReady = resolve;
    });
    let initialNewtabFaviconReadyPromise = null;
    let initialWallpaperOverlayReadyPromise = null;
    let initialWallpaperEffectReadyPromise = null;
    let hasStoredWallpaperEffectLoaded = false;
    let wallpaperControl = null;
    let wallpaperViewController = null;
    let wallpaperReactPanelBound = false;
    let wallpaperButton = null;
    let wallpaperPanel = null;
    let wallpaperPanelHeader = null;
    let wallpaperPanelTitle = null;
    let wallpaperEnabledToggle = null;
    let topContentTitle = null;
    let topContentTabs = null;
    let topContentTabsIndicator = null;
    let topContentBrandTab = null;
    let topContentTimeTab = null;
    let topContentOffTab = null;
    let wallpaperAppearanceTitle = null;
    let wallpaperAppearanceInfoButton = null;
    let wallpaperAppearanceScopeTabs = null;
    let wallpaperAppearanceOptions = null;
    let wallpaperSearchWidthControl = null;
    let wallpaperSearchWidthLabel = null;
    let wallpaperSearchWidthValue = null;
    let wallpaperSearchWidthSlider = null;
    let wallpaperAppearanceMoreSettingsLink = null;
    let wallpaperAppearanceMoreSettingsText = null;
    let wallpaperSearchWidthSaveTimer = null;
    let wallpaperOverlayLabel = null;
    let wallpaperOverlaySlider = null;
    let wallpaperEffectLabel = null;
    let wallpaperEffectOptions = null;
    let wallpaperEffectTabsIndicator = null;
    let wallpaperEffectStrengthControl = null;
    let wallpaperEffectStrengthLabel = null;
    let wallpaperEffectSlider = null;
    let wallpaperEffectSizeControl = null;
    let wallpaperEffectSizeLabel = null;
    let wallpaperEffectSizeSlider = null;
    let wallpaperEffectSpacingControl = null;
    let wallpaperEffectSpacingLabel = null;
    let wallpaperEffectSpacingSlider = null;
    let newtabFaviconTitle = null;
    let newtabFaviconOptions = null;
    let newtabFaviconThemeQueryList = null;
    let newtabFaviconThemeChangeHandler = null;
    let hasNewtabFaviconLifecycleListeners = false;
    let newtabFaviconLifecycleRefreshHandler = null;
    let newtabFaviconThemeBroadcastChannel = null;
    let hasNewtabFaviconThemeBroadcastListener = false;
    let wallpaperSliderValueBubble = null;
    let wallpaperSliderValueHideTimer = null;
    let wallpaperSliderValueTarget = null;
    let wallpaperSliderValueDragTarget = null;
    let wallpaperOverlaySaveTimer = null;
    let wallpaperEffectSaveTimer = null;
    let wallpaperPanelResizeTimer = null;
    let wallpaperPanelResizeCleanup = null;
    let wallpaperTabsIndicatorRefreshFrame = 0;
    let wallpaperModeTabsIndicatorRefreshFrame = 0;
    let wallpaperEffectTabsIndicatorRefreshFrame = 0;
    let topContentTabsIndicatorRefreshFrame = 0;
    let wallpaperActiveSlider = null;
    let wallpaperAppearanceAnimationTimers = [];
    let wallpaperAppearanceModeLabelsHeld = false;
    let customWallpapers = [];
    let customWallpaperUploadTile = null;
    let customWallpaperInput = null;
    let customWallpaperImporting = false;
    let wallpaperStorageChangeSeq = 0;
    let wallpaperVisualSeq = 0;
    let wallpaperVisualRefreshTimer = 0;
    let appliedWallpaperVisualUrl = '';
    let appliedWallpaperVisualActive = false;
    const wallpaperImageReadyCache = new Map();
    const customWallpaperObjectUrls = new Map();

    function ensureWallpaperSliderValueBubble() {
      if (wallpaperSliderValueBubble && wallpaperSliderValueBubble.isConnected) {
        return wallpaperSliderValueBubble;
      }
      wallpaperSliderValueBubble = document.createElement('div');
      wallpaperSliderValueBubble.id = '_x_extension_newtab_slider_value_bubble_2026_unique_';
      wallpaperSliderValueBubble.className = 'x-lumno-feature-hint x-nt-slider-value-bubble';
      wallpaperSliderValueBubble.setAttribute('data-visible', 'false');
      wallpaperSliderValueBubble.setAttribute('data-arrow-side', 'bottom');
      wallpaperSliderValueBubble.setAttribute('data-arrow-align', 'center');
      wallpaperSliderValueBubble.setAttribute('aria-hidden', 'true');
      const host = document.body || document.documentElement;
      if (host) {
        host.appendChild(wallpaperSliderValueBubble);
      }
      return wallpaperSliderValueBubble;
    }

    function isElementHovered(element) {
      if (!element || typeof element.matches !== 'function') {
        return false;
      }
      try {
        return element.matches(':hover');
      } catch (e) {
        return false;
      }
    }

    function isElementFocusVisible(element) {
      if (!element || typeof element.matches !== 'function') {
        return false;
      }
      try {
        return element.matches(':focus-visible');
      } catch (e) {
        return false;
      }
    }

    function formatWallpaperSliderValue(slider) {
      if (!slider) {
        return '';
      }
      const value = Number(slider.value);
      if (!Number.isFinite(value)) {
        return String(slider.value || '');
      }
      const suffix = slider.getAttribute('data-value-suffix') || '';
      return `${Math.round(value)}${suffix}`;
    }

    function getWallpaperSliderPercent(slider) {
      const min = Number(slider && slider.min);
      const max = Number(slider && slider.max);
      const value = Number(slider && slider.value);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(value)) {
        return 0;
      }
      return clampNumber((value - min) / (max - min), 0, 1);
    }

    function shouldShowWallpaperSliderValue(slider) {
      return Boolean(slider && slider.isConnected && !slider.disabled &&
        (wallpaperSliderValueDragTarget === slider ||
          (document.activeElement === slider && isElementFocusVisible(slider)) ||
          isElementHovered(slider)));
    }

    function positionWallpaperSliderValueBubble(slider) {
      const bubble = ensureWallpaperSliderValueBubble();
      if (!bubble || !slider) {
        return;
      }
      bubble.textContent = formatWallpaperSliderValue(slider);
      const sliderRect = slider.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const viewportWidth = Math.max(0, window.innerWidth || 0);
      const thumbSize = 16;
      const percent = getWallpaperSliderPercent(slider);
      const centerX = sliderRect.left + (thumbSize / 2) + Math.max(0, sliderRect.width - thumbSize) * percent;
      const spacing = 12;
      let arrowSide = 'bottom';
      let top = sliderRect.top - bubbleRect.height - spacing;
      if (top < 8) {
        arrowSide = 'top';
        top = sliderRect.bottom + spacing;
      }
      const maxLeft = viewportWidth > 0 ? viewportWidth - bubbleRect.width - 8 : centerX;
      const left = clampNumber(centerX - (bubbleRect.width / 2), 8, Math.max(8, maxLeft));
      bubble.setAttribute('data-arrow-side', arrowSide);
      bubble.setAttribute('data-arrow-align', 'center');
      bubble.style.setProperty('top', `${Math.round(top)}px`);
      bubble.style.setProperty('left', `${Math.round(left)}px`);
    }

    function syncWallpaperSliderValueBubble(slider) {
      if (wallpaperSliderValueTarget !== slider) {
        return;
      }
      if (!shouldShowWallpaperSliderValue(slider)) {
        hideWallpaperSliderValueBubble(slider, { force: true });
        return;
      }
      positionWallpaperSliderValueBubble(slider);
      if (wallpaperSliderValueBubble) {
        wallpaperSliderValueBubble.setAttribute('data-visible', 'true');
      }
    }

    function showWallpaperSliderValueBubble(slider) {
      if (!slider || slider.disabled) {
        return;
      }
      wallpaperSliderValueTarget = slider;
      if (wallpaperSliderValueHideTimer !== null) {
        window.clearTimeout(wallpaperSliderValueHideTimer);
        wallpaperSliderValueHideTimer = null;
      }
      positionWallpaperSliderValueBubble(slider);
      window.requestAnimationFrame(() => {
        if (wallpaperSliderValueTarget !== slider || !shouldShowWallpaperSliderValue(slider)) {
          return;
        }
        if (wallpaperSliderValueBubble) {
          wallpaperSliderValueBubble.setAttribute('data-visible', 'true');
        }
      });
    }

    function hideWallpaperSliderValueBubble(slider, options) {
      const force = Boolean(options && options.force);
      const target = slider || wallpaperSliderValueTarget;
      if (!target && !wallpaperSliderValueBubble) {
        return;
      }
      if (!force && target && wallpaperSliderValueDragTarget === target) {
        return;
      }
      if (!force && target && shouldShowWallpaperSliderValue(target)) {
        return;
      }
      wallpaperSliderValueTarget = null;
      if (wallpaperSliderValueBubble) {
        wallpaperSliderValueBubble.setAttribute('data-visible', 'false');
      }
      if (wallpaperSliderValueHideTimer !== null) {
        window.clearTimeout(wallpaperSliderValueHideTimer);
      }
      wallpaperSliderValueHideTimer = window.setTimeout(() => {
        wallpaperSliderValueHideTimer = null;
      }, 180);
    }

    function finishWallpaperSliderValueDrag() {
      const slider = wallpaperSliderValueDragTarget;
      wallpaperSliderValueDragTarget = null;
      window.removeEventListener('pointerup', finishWallpaperSliderValueDrag, true);
      window.removeEventListener('pointercancel', finishWallpaperSliderValueDrag, true);
      if (slider && shouldShowWallpaperSliderValue(slider)) {
        showWallpaperSliderValueBubble(slider);
        return;
      }
      hideWallpaperSliderValueBubble(slider, { force: true });
    }

    function blurWallpaperPanelActiveElement() {
      const activeElement = document.activeElement;
      if (!activeElement || !wallpaperPanel || !wallpaperPanel.contains(activeElement)) {
        return;
      }
      if (typeof activeElement.blur !== 'function') {
        return;
      }
      activeElement.blur();
    }

    function cancelWallpaperPanelActiveControls() {
      finishWallpaperSliderValueDrag();
      wallpaperActiveSlider = null;
      blurWallpaperPanelActiveElement();
    }

    function bindWallpaperSliderValueBubble(slider) {
      if (!slider) {
        return;
      }
      slider.addEventListener('mouseenter', () => {
        showWallpaperSliderValueBubble(slider);
      });
      slider.addEventListener('mousemove', () => {
        syncWallpaperSliderValueBubble(slider);
      });
      slider.addEventListener('mouseleave', () => {
        hideWallpaperSliderValueBubble(slider);
      });
      slider.addEventListener('focus', () => {
        showWallpaperSliderValueBubble(slider);
      });
      slider.addEventListener('blur', () => {
        hideWallpaperSliderValueBubble(slider, { force: true });
      });
      slider.addEventListener('pointerdown', () => {
        if (slider.disabled) {
          return;
        }
        wallpaperSliderValueDragTarget = slider;
        showWallpaperSliderValueBubble(slider);
        window.addEventListener('pointerup', finishWallpaperSliderValueDrag, true);
        window.addEventListener('pointercancel', finishWallpaperSliderValueDrag, true);
      });
      slider.addEventListener('input', () => {
        showWallpaperSliderValueBubble(slider);
      });
      slider.addEventListener('change', () => {
        syncWallpaperSliderValueBubble(slider);
      });
    }

    function setWallpaperActiveSlider(slider) {
      wallpaperActiveSlider = slider || null;
    }

    function clearWallpaperActiveSlider(slider) {
      if (!slider || wallpaperActiveSlider === slider) {
        wallpaperActiveSlider = null;
      }
    }

    let currentWallpaperOverlayOpacity = {
      light: NEWTAB_WALLPAPER_OVERLAY_DEFAULTS.light,
      dark: NEWTAB_WALLPAPER_OVERLAY_DEFAULTS.dark
    };
    let currentWallpaperEffectPrefsByMode = normalizeWallpaperEffectStoragePrefs(
      NEWTAB_WALLPAPER_EFFECT_DEFAULTS
    );
    let currentAppliedWallpaperEffectPrefs = Object.assign({}, NEWTAB_WALLPAPER_EFFECT_DEFAULTS);
    let wallpaperBuiltInGrid = null;
    let wallpaperLocalGrid = null;
    let wallpaperBody = null;
    let wallpaperModeSyncTitle = null;
    let wallpaperModeSyncToggle = null;
    let wallpaperModeTabs = null;
    let wallpaperModeTabsIndicator = null;
    let wallpaperLightModeTab = null;
    let wallpaperDarkModeTab = null;
    let wallpaperModeHint = null;
    let wallpaperTabs = null;
    let wallpaperTabsIndicator = null;
    let wallpaperBuiltInTab = null;
    let wallpaperLocalTab = null;
    let activeWallpaperTab = 'built-in';
    let activeWallpaperMode = NEWTAB_WALLPAPER_MODE_LIGHT;
    let wallpaperPanelRendered = false;
    let currentWallpaperPrefs = null;
    let currentLocalWallpaperOverrides = null;
    let currentWallpaperId = '';
    let lastActiveWallpaperId = '';
    let lastActiveWallpaperIdsByMode = {
      light: '',
      dark: ''
    };
    let currentTopContentMode = normalizeNewtabTopContentMode(getTopContentMode());
    let currentNewtabFaviconId = NEWTAB_FAVICON_DEFAULT_ID;

    function normalizeWallpaperMode(mode) {
      return mode === NEWTAB_WALLPAPER_MODE_DARK
        ? NEWTAB_WALLPAPER_MODE_DARK
        : NEWTAB_WALLPAPER_MODE_LIGHT;
    }

    function getDefaultWallpaperPrefs() {
      return {
        version: NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
        sameForModes: true,
        light: NEWTAB_WALLPAPER_DEFAULT_ID,
        dark: NEWTAB_WALLPAPER_DEFAULT_ID
      };
    }

    function getDefaultLocalWallpaperOverrides() {
      return {
        light: null,
        dark: null
      };
    }

    currentWallpaperPrefs = getDefaultWallpaperPrefs();
    currentLocalWallpaperOverrides = getDefaultLocalWallpaperOverrides();

    function cloneWallpaperPrefs(prefs) {
      const source = prefs && typeof prefs === 'object' ? prefs : getDefaultWallpaperPrefs();
      const lightId = normalizeNewtabWallpaperId(source.light) || '';
      const darkId = normalizeNewtabWallpaperId(source.dark) || lightId;
      const sameForModes = source.sameForModes !== false;
      return {
        version: NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
        sameForModes,
        light: lightId,
        dark: sameForModes ? lightId : darkId
      };
    }

    function cloneLocalWallpaperOverrides(overrides) {
      const source = overrides && typeof overrides === 'object' ? overrides : getDefaultLocalWallpaperOverrides();
      return {
        light: source.light || null,
        dark: source.dark || null
      };
    }

    function isCustomWallpaperId(id) {
      if (localWallpaperStore) {
        return localWallpaperStore.isCustomWallpaperId(id);
      }
      return String(id || '').startsWith(NEWTAB_CUSTOM_WALLPAPER_ID_PREFIX);
    }

    function getCustomWallpaperById(id) {
      const normalizedId = String(id || '').trim();
      if (!normalizedId) {
        return null;
      }
      return customWallpapers.find((item) => item && item.id === normalizedId) || null;
    }

    function getWallpaperById(id) {
      const normalizedId = String(id || '').trim();
      if (!normalizedId) {
        return null;
      }
      if (isCustomWallpaperId(normalizedId)) {
        return getCustomWallpaperById(normalizedId);
      }
      return NEWTAB_WALLPAPER_OPTIONS.find((item) => item && item.id === normalizedId) || null;
    }

    function getWallpaperTileContainers() {
      return [wallpaperBuiltInGrid, wallpaperLocalGrid].filter(Boolean);
    }

    function getWallpaperRestoreId() {
      const mode = getWallpaperEditMode();
      return normalizeNewtabWallpaperId(lastActiveWallpaperIdsByMode[mode]) ||
        normalizeNewtabWallpaperId(lastActiveWallpaperId) ||
        NEWTAB_WALLPAPER_DEFAULT_ID;
    }

    function normalizeNewtabTopContentMode(value) {
      if (typeof SETTINGS.normalizeNewtabTopContentMode === 'function') {
        return SETTINGS.normalizeNewtabTopContentMode(value);
      }
      if (value === 'time') {
        return 'time';
      }
      return value === 'off' || value === false ? 'off' : 'brand';
    }

    function getNewtabFaviconById(id) {
      const normalizedId = String(id || '').trim();
      return NEWTAB_FAVICON_OPTIONS.find((item) => item && item.id === normalizedId) || null;
    }

    function normalizeNewtabFaviconId(value) {
      const raw = value && typeof value === 'object' && value.id
        ? value.id
        : value;
      const id = String(raw || '').trim();
      return getNewtabFaviconById(id) ? id : NEWTAB_FAVICON_DEFAULT_ID;
    }

    function getNewtabFaviconDisplayName(item) {
      if (!item) {
        return '';
      }
      return t(item.nameKey, item.fallbackName || item.id || '');
    }

    function getNewtabFaviconUrl(item) {
      return item && item.file ? getRuntimeAssetUrl(item.file) : '';
    }

    function getNewtabFaviconThemeQueryList() {
      if (!window || typeof window.matchMedia !== 'function') {
        return null;
      }
      try {
        return window.matchMedia(NEWTAB_FAVICON_THEME_QUERY);
      } catch (_error) {
        return null;
      }
    }

    function getNewtabFaviconBrowserTheme() {
      const queryList = getNewtabFaviconThemeQueryList();
      return queryList && queryList.matches ? 'dark' : 'light';
    }

    function buildNewtabFaviconSvgDataUrl(themeName) {
      const theme = NEWTAB_FAVICON_THEMES[themeName] || NEWTAB_FAVICON_THEMES.light;
      const svg = [
        '<svg width="104" height="104" viewBox="0 0 104 104" fill="none" xmlns="http://www.w3.org/2000/svg">',
        `<path opacity="${theme.shadowOpacity}" d="${NEWTAB_FAVICON_SVG_SHADOW_PATH}" fill="${theme.color}"/>`,
        `<path d="${NEWTAB_FAVICON_SVG_MAIN_PATH}" fill="${theme.color}" fill-opacity="${theme.mainOpacity}"/>`,
        '</svg>'
      ].join('');
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    function getNewtabFaviconHref(item) {
      if (item && item.themeAwareSvg) {
        return buildNewtabFaviconSvgDataUrl(getNewtabFaviconBrowserTheme());
      }
      return getNewtabFaviconUrl(item);
    }

    function cacheNewtabFaviconPreloadId(id) {
      const normalizedId = normalizeNewtabFaviconId(id);
      try {
        if (window && window.localStorage) {
          window.localStorage.setItem(NEWTAB_FAVICON_PRELOAD_STORAGE_KEY, normalizedId);
        }
      } catch (_error) {
        // The main runtime still applies the favicon even when localStorage is unavailable.
      }
    }

    function clearNewtabFaviconThemeListener() {
      if (!newtabFaviconThemeQueryList || !newtabFaviconThemeChangeHandler) {
        newtabFaviconThemeQueryList = null;
        newtabFaviconThemeChangeHandler = null;
        return;
      }
      if (typeof newtabFaviconThemeQueryList.removeEventListener === 'function') {
        newtabFaviconThemeQueryList.removeEventListener('change', newtabFaviconThemeChangeHandler);
      } else if (typeof newtabFaviconThemeQueryList.removeListener === 'function') {
        newtabFaviconThemeQueryList.removeListener(newtabFaviconThemeChangeHandler);
      }
      newtabFaviconThemeQueryList = null;
      newtabFaviconThemeChangeHandler = null;
    }

    function applyNewtabFaviconLinkAttributes(link, item) {
      const themeName = item && item.themeAwareSvg ? getNewtabFaviconBrowserTheme() : '';
      link.setAttribute('rel', 'icon');
      link.setAttribute('type', item.type || 'image/png');
      link.setAttribute('href', getNewtabFaviconHref(item));
      if (item.sizes) {
        link.setAttribute('sizes', item.sizes);
      } else {
        link.removeAttribute('sizes');
      }
      link.setAttribute('data-newtab-favicon-id', item.id);
      if (themeName) {
        link.setAttribute('data-lumno-newtab-favicon-theme', themeName);
      } else {
        link.removeAttribute('data-lumno-newtab-favicon-theme');
      }
    }

    function refreshNewtabFaviconLink() {
      const item = getNewtabFaviconById(currentNewtabFaviconId) ||
        getNewtabFaviconById(NEWTAB_FAVICON_DEFAULT_ID);
      const link = getNewtabFaviconLink();
      if (link && item) {
        applyNewtabFaviconLinkAttributes(link, item);
      }
    }

    function refreshNewtabFaviconLinkIfThemeAware() {
      const item = getNewtabFaviconById(currentNewtabFaviconId);
      if (item && item.themeAwareSvg) {
        refreshNewtabFaviconLink();
      }
    }

    function getNewtabFaviconThemeBroadcastChannel() {
      if (newtabFaviconThemeBroadcastChannel) {
        return newtabFaviconThemeBroadcastChannel;
      }
      if (typeof BroadcastChannelCtor !== 'function') {
        return null;
      }
      try {
        newtabFaviconThemeBroadcastChannel = new BroadcastChannelCtor(NEWTAB_FAVICON_THEME_BROADCAST_CHANNEL);
      } catch (_error) {
        newtabFaviconThemeBroadcastChannel = null;
      }
      return newtabFaviconThemeBroadcastChannel;
    }

    function bindNewtabFaviconThemeBroadcastListener() {
      if (hasNewtabFaviconThemeBroadcastListener) {
        return;
      }
      hasNewtabFaviconThemeBroadcastListener = true;
      const channel = getNewtabFaviconThemeBroadcastChannel();
      if (!channel) {
        return;
      }
      const handleMessage = (event) => {
        const data = event && event.data ? event.data : null;
        if (!data || data.action !== NEWTAB_FAVICON_THEME_REFRESH_ACTION) {
          return;
        }
        refreshNewtabFaviconLinkIfThemeAware();
      };
      if (typeof channel.addEventListener === 'function') {
        channel.addEventListener('message', handleMessage);
      } else {
        channel.onmessage = handleMessage;
      }
    }

    function broadcastNewtabFaviconThemeRefresh() {
      const channel = getNewtabFaviconThemeBroadcastChannel();
      if (!channel || typeof channel.postMessage !== 'function') {
        return;
      }
      try {
        channel.postMessage({
          action: NEWTAB_FAVICON_THEME_REFRESH_ACTION,
          at: Date.now()
        });
      } catch (_error) {
        // BroadcastChannel can be unavailable in constrained extension contexts.
      }
    }

    function bindNewtabFaviconLifecycleRefreshListeners() {
      if (hasNewtabFaviconLifecycleListeners) {
        return;
      }
      hasNewtabFaviconLifecycleListeners = true;
      newtabFaviconLifecycleRefreshHandler = () => {
        refreshNewtabFaviconLinkIfThemeAware();
      };
      if (window && typeof window.addEventListener === 'function') {
        window.addEventListener('focus', newtabFaviconLifecycleRefreshHandler, { passive: true });
        window.addEventListener('pageshow', newtabFaviconLifecycleRefreshHandler, { passive: true });
      }
      if (document && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', newtabFaviconLifecycleRefreshHandler, { passive: true });
      }
    }

    function bindNewtabFaviconThemeListener(item) {
      clearNewtabFaviconThemeListener();
      if (!item || !item.themeAwareSvg) {
        return;
      }
      bindNewtabFaviconLifecycleRefreshListeners();
      bindNewtabFaviconThemeBroadcastListener();
      const queryList = getNewtabFaviconThemeQueryList();
      if (!queryList) {
        return;
      }
      newtabFaviconThemeQueryList = queryList;
      newtabFaviconThemeChangeHandler = () => {
        refreshNewtabFaviconLinkIfThemeAware();
        broadcastNewtabFaviconThemeRefresh();
      };
      if (typeof queryList.addEventListener === 'function') {
        queryList.addEventListener('change', newtabFaviconThemeChangeHandler);
      } else if (typeof queryList.addListener === 'function') {
        queryList.addListener(newtabFaviconThemeChangeHandler);
      }
    }

    function normalizeNewtabWallpaperId(value) {
      const raw = value && typeof value === 'object' && value.id
        ? value.id
        : value;
      const id = String(raw || '').trim();
      if (id === NEWTAB_CUSTOM_WALLPAPER_ID) {
        const firstCustomWallpaper = customWallpapers[0];
        return firstCustomWallpaper ? firstCustomWallpaper.id : '';
      }
      if (getWallpaperById(id)) {
        return id;
      }
      const matchedByPath = NEWTAB_WALLPAPER_OPTIONS.find((item) => {
        const localPath = getWallpaperLocalPath(item);
        const runtimePath = getWallpaperRuntimePath(item);
        const legacyFile = getWallpaperLegacyFile(item);
        return id === localPath ||
          id === runtimePath ||
          id.endsWith(`/${item.file}`) ||
          (legacyFile && id.endsWith(`/${legacyFile}`));
      });
      return matchedByPath ? matchedByPath.id : '';
    }

    function getWallpaperLegacyFile(item) {
      const file = item && item.file ? item.file : '';
      return file.endsWith('.webp') ? file.replace(/\.webp$/, '.png') : '';
    }

    function getWallpaperThumbnailFile(item) {
      const file = item && item.file ? item.file : '';
      return file ? file.replace(/\.[^.]+$/, NEWTAB_WALLPAPER_THUMBNAIL_SUFFIX) : '';
    }

    function getWallpaperLocalPath(item) {
      if (!item || !item.file) {
        return '';
      }
      return `${NEWTAB_WALLPAPER_DEFAULT_DIRECTORY}/${item.file}`;
    }

    function getWallpaperRuntimePath(item, options) {
      if (item && isCustomWallpaperId(item.id)) {
        return '';
      }
      if (!item || !item.file) {
        return '';
      }
      const file = options && options.thumbnail ? getWallpaperThumbnailFile(item) : item.file;
      return file ? `${NEWTAB_WALLPAPER_EXTENSION_DIRECTORY}/${file}` : '';
    }

    function revokeCustomWallpaperObjectUrl(id) {
      const cached = customWallpaperObjectUrls.get(id);
      if (!cached) {
        return;
      }
      URL.revokeObjectURL(cached.url);
      wallpaperImageReadyCache.delete(cached.url);
      customWallpaperObjectUrls.delete(id);
    }

    function revokeUnusedCustomWallpaperObjectUrls(records) {
      const activeIds = new Set(
        records.map((item) => item && item.id).filter(Boolean)
      );
      Array.from(customWallpaperObjectUrls.keys()).forEach((id) => {
        if (!activeIds.has(id)) {
          revokeCustomWallpaperObjectUrl(id);
        }
      });
    }

    function revokeAllCustomWallpaperObjectUrls() {
      Array.from(customWallpaperObjectUrls.keys()).forEach(revokeCustomWallpaperObjectUrl);
    }

    function prepareCustomWallpaperObjectUrl(item) {
      if (!item || !isCustomWallpaperId(item.id)) {
        return Promise.resolve();
      }
      const source = String(item.imageDataUrl || '').trim();
      const cached = customWallpaperObjectUrls.get(item.id);
      if (cached && cached.source === source) {
        return Promise.resolve();
      }
      revokeCustomWallpaperObjectUrl(item.id);
      if (!source) {
        return Promise.resolve();
      }
      return fetch(source)
        .then((response) => response.blob())
        .then((blob) => {
          customWallpaperObjectUrls.set(item.id, {
            source,
            url: URL.createObjectURL(blob)
          });
        })
        .catch((error) => {
          console.warn('[Card Master][new-tab-wallpaper] local-blob-url-failed', {
            wallpaperId: item.id,
            error: error instanceof Error ? error.message : String(error)
          });
        });
    }

    function getWallpaperImageUrl(item) {
      if (item && isCustomWallpaperId(item.id)) {
        const cached = customWallpaperObjectUrls.get(item.id);
        if (cached) {
          return cached.url;
        }
        const source = String(item.imageDataUrl || '').trim();
        return source && !source.startsWith('data:') ? source : '';
      }
      const runtimePath = getWallpaperRuntimePath(item);
      if (!runtimePath) {
        return '';
      }
      if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
        return chrome.runtime.getURL(runtimePath);
      }
      return `../../${runtimePath}`;
    }

    window.addEventListener('pagehide', revokeAllCustomWallpaperObjectUrls, {
      once: true
    });

    function getWallpaperThumbnailUrl(item) {
      if (item && isCustomWallpaperId(item.id)) {
        return item.thumbnailDataUrl || item.imageDataUrl || '';
      }
      const runtimePath = getWallpaperRuntimePath(item, { thumbnail: true });
      if (!runtimePath) {
        return getWallpaperImageUrl(item);
      }
      if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
        return chrome.runtime.getURL(runtimePath);
      }
      return `../../${runtimePath}`;
    }

    function getWallpaperDisplayName(item) {
      if (!item) {
        return '';
      }
      if (item.nameKey) {
        return t(item.nameKey, item.fallbackName || item.id || '');
      }
      const storedName = String(item.name || '').trim();
      if (!storedName) {
        return t('newtab_wallpaper_custom_name', 'Local wallpaper');
      }
      return storedName;
    }

    // Used by overlay math; adaptive image sampling lives in wallpaper-adaptive-tone.js.
    function clampNumber(value, min, max) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return min;
      }
      return Math.min(max, Math.max(min, number));
    }

    function getViewportSize() {
      const docEl = document.documentElement;
      return {
        width: Math.max(1, window.innerWidth || (docEl ? docEl.clientWidth : 0) || 1),
        height: Math.max(1, window.innerHeight || (docEl ? docEl.clientHeight : 0) || 1)
      };
    }

    function getWallpaperOverlayAlphaAtViewportY(viewportY) {
      const mode = getResolvedWallpaperOverlayMode();
      const stops = NEWTAB_WALLPAPER_OVERLAY_STOPS[mode] || NEWTAB_WALLPAPER_OVERLAY_STOPS.light;
      const opacity = getWallpaperOverlayOpacityForCurrentMode();
      const topAlpha = getWallpaperOverlayStopPercent(stops.top, opacity) / 100;
      const midAlpha = getWallpaperOverlayStopPercent(stops.mid, opacity) / 100;
      const bottomAlpha = getWallpaperOverlayStopPercent(stops.bottom, opacity) / 100;
      const viewport = getViewportSize();
      const position = clampNumber(viewportY / viewport.height, 0, 1);
      if (position <= 0.42) {
        return topAlpha + ((midAlpha - topAlpha) * (position / 0.42));
      }
      return midAlpha + ((bottomAlpha - midAlpha) * ((position - 0.42) / 0.58));
    }

    function getWallpaperAdaptiveToneTargets() {
      const externalTargets = typeof getAdaptiveToneTargets === 'function'
        ? getAdaptiveToneTargets()
        : [];
      const targets = Array.isArray(externalTargets) ? externalTargets.slice() : [];
      targets.push({
        element: wallpaperButton,
        sampleElement: wallpaperButton,
        minWidth: 54,
        minHeight: 54,
        iconButton: true
      });
      return targets;
    }

    let wallpaperEffects = null;
    const wallpaperAdaptiveTone = typeof WALLPAPER_ADAPTIVE_TONE.createWallpaperAdaptiveTone === 'function'
      ? WALLPAPER_ADAPTIVE_TONE.createWallpaperAdaptiveTone({
        documentObj,
        windowObj,
        getTargets: getWallpaperAdaptiveToneTargets,
        getCurrentWallpaper: () => getWallpaperById(currentWallpaperId),
        getWallpaperImageUrl,
        getOverlayAlphaAtViewportY: getWallpaperOverlayAlphaAtViewportY,
        getOverlayLuminance: () => getResolvedWallpaperOverlayMode() === 'dark' ? 0 : 1,
        getEffectLuminanceAtViewport: (viewportX, viewportY, baseLuminance) => {
          return wallpaperEffects && typeof wallpaperEffects.getLuminanceAtViewport === 'function'
            ? wallpaperEffects.getLuminanceAtViewport(viewportX, viewportY, baseLuminance)
            : null;
        },
        applyWordmarkThemeAppearance
      })
      : null;
    wallpaperEffects = typeof WALLPAPER_EFFECTS.createWallpaperEffects === 'function'
      ? WALLPAPER_EFFECTS.createWallpaperEffects({
        documentObj,
        windowObj,
        getCurrentWallpaper: () => getWallpaperById(currentWallpaperId),
        getWallpaperImageUrl,
        onRender: scheduleWallpaperAdaptiveToneUpdate
      })
      : null;

    function scheduleWallpaperAdaptiveToneUpdate() {
      if (wallpaperAdaptiveTone) {
        wallpaperAdaptiveTone.schedule();
      }
    }

    function refreshWallpaperAdaptiveSampler() {
      if (wallpaperAdaptiveTone) {
        wallpaperAdaptiveTone.refresh();
      }
    }

    function refreshWallpaperEffects() {
      if (wallpaperEffects) {
        wallpaperEffects.refresh();
      }
    }

    function getRuntimeAssetUrl(path) {
      const value = String(path || '').trim();
      if (!value) {
        return '';
      }
      if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
        return chrome.runtime.getURL(value);
      }
      return `../../${value}`;
    }

    function getCssUrlValue(url) {
      const safe = String(url || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '')
        .replace(/\r/g, '');
      return safe ? `url("${safe}")` : 'none';
    }

    function cacheWallpaperImageReady(url, promise) {
      if (!url || !promise) {
        return;
      }
      if (wallpaperImageReadyCache.has(url)) {
        wallpaperImageReadyCache.delete(url);
      }
      wallpaperImageReadyCache.set(url, promise);
      while (wallpaperImageReadyCache.size > WALLPAPER_IMAGE_READY_CACHE_LIMIT) {
        const firstKey = wallpaperImageReadyCache.keys().next().value;
        wallpaperImageReadyCache.delete(firstKey);
      }
    }

    function waitForWallpaperImageReady(url) {
      const imageUrl = String(url || '').trim();
      if (!imageUrl) {
        return Promise.resolve(false);
      }
      const cached = wallpaperImageReadyCache.get(imageUrl);
      if (cached) {
        return cached;
      }
      const promise = new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = imageUrl;
      });
      cacheWallpaperImageReady(imageUrl, promise);
      return promise;
    }

    function createWallpaperTransitionLayer() {
      if (!document.body || shouldReduceMotion()) {
        return null;
      }
      const computedStyle = window.getComputedStyle(document.body);
      const layer = document.createElement('div');
      layer.className = 'x-nt-wallpaper-transition-layer';
      layer.style.backgroundColor = computedStyle.backgroundColor;
      layer.style.backgroundImage = computedStyle.backgroundImage;
      layer.style.backgroundSize = computedStyle.backgroundSize;
      layer.style.backgroundPosition = computedStyle.backgroundPosition;
      layer.style.backgroundRepeat = computedStyle.backgroundRepeat;
      layer.style.backgroundAttachment = 'fixed';
      document.body.insertBefore(layer, document.body.firstChild);
      return layer;
    }

    function releaseWallpaperTransitionLayer(layer) {
      if (!layer || !layer.parentNode) {
        return;
      }
      window.requestAnimationFrame(() => {
        layer.setAttribute('data-exit', 'true');
        window.setTimeout(() => {
          if (layer.parentNode) {
            layer.parentNode.removeChild(layer);
          }
        }, WALLPAPER_VISUAL_TRANSITION_MS + 80);
      });
    }

    function applyWallpaperVisualState(wallpaper) {
      const target = document.documentElement;
      const imageUrl = wallpaper ? getWallpaperImageUrl(wallpaper) : '';
      const active = Boolean(imageUrl);
      appliedWallpaperVisualUrl = imageUrl;
      appliedWallpaperVisualActive = active;
      if (target) {
        target.style.setProperty('--x-nt-wallpaper-image', imageUrl ? getCssUrlValue(imageUrl) : 'none');
        target.style.setProperty('--x-nt-wallpaper-size', 'cover');
        target.style.setProperty('--x-nt-wallpaper-position', 'center center');
        target.setAttribute('data-wallpaper-active', active ? 'true' : 'false');
      }
      if (document.body) {
        document.body.setAttribute('data-wallpaper-active', active ? 'true' : 'false');
      }
      return imageUrl;
    }

    function runWallpaperVisualRefresh(seq) {
      if (seq !== wallpaperVisualSeq) {
        return;
      }
      refreshWallpaperAdaptiveSampler();
      refreshWallpaperEffects();
    }

    function scheduleWallpaperVisualRefresh(seq) {
      if (wallpaperVisualRefreshTimer) {
        window.clearTimeout(wallpaperVisualRefreshTimer);
        wallpaperVisualRefreshTimer = 0;
      }
      wallpaperVisualRefreshTimer = window.setTimeout(() => {
        wallpaperVisualRefreshTimer = 0;
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            runWallpaperVisualRefresh(seq);
          });
        });
      }, WALLPAPER_VISUAL_REFRESH_DELAY_MS);
    }

    function getRawWallpaperId(value) {
      return value && typeof value === 'object' && value.id ? value.id : value;
    }

    function hasStorageValue(result, key) {
      return Boolean(result && Object.prototype.hasOwnProperty.call(result, key));
    }

    function readStorageValue(area, key) {
      return new Promise((resolve) => {
        if (!area || !key || typeof area.get !== 'function') {
          resolve({ hasValue: false, value: undefined });
          return;
        }
        area.get([key], (result) => {
          resolve({
            hasValue: hasStorageValue(result, key),
            value: result ? result[key] : undefined
          });
        });
      });
    }

    function writeStorageValue(area, key, value, onError) {
      if (!area || !key || typeof area.set !== 'function') {
        return;
      }
      area.set({ [key]: value }, () => {
        if (chrome.runtime && chrome.runtime.lastError && typeof onError === 'function') {
          onError();
        }
      });
    }

    function writeSyncedWallpaperValue(value, options) {
      writeStorageValue(storageArea, NEWTAB_WALLPAPER_STORAGE_KEY, value, () => {
        if (options && options.showError) {
          showToast(t('newtab_wallpaper_save_error', 'Failed to save wallpaper'), true);
        }
      });
    }

    function writeLocalWallpaperValue(value, options) {
      writeStorageValue(localWallpaperStorageArea, NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY, value, () => {
        if (options && options.showError) {
          showToast(t('newtab_wallpaper_save_error', 'Failed to save wallpaper'), true);
        }
      });
    }

    function getWallpaperStorageModeValue(value, mode, fallback) {
      if (!value || typeof value !== 'object') {
        return fallback;
      }
      const normalizedMode = normalizeWallpaperMode(mode);
      if (Object.prototype.hasOwnProperty.call(value, normalizedMode)) {
        return value[normalizedMode];
      }
      if (normalizedMode === NEWTAB_WALLPAPER_MODE_DARK &&
          Object.prototype.hasOwnProperty.call(value, NEWTAB_WALLPAPER_MODE_LIGHT)) {
        return value[NEWTAB_WALLPAPER_MODE_LIGHT];
      }
      if (Object.prototype.hasOwnProperty.call(value, 'id')) {
        return value.id;
      }
      return fallback;
    }

    function getWallpaperStorageRawIds(value) {
      if (!value || typeof value !== 'object') {
        return [String(getRawWallpaperId(value) || '').trim()].filter(Boolean);
      }
      return NEWTAB_WALLPAPER_MODES
        .map((mode) => String(getRawWallpaperId(getWallpaperStorageModeValue(value, mode, '')) || '').trim())
        .filter(Boolean);
    }

    function shouldWaitForCustomWallpapers(value) {
      return getWallpaperStorageRawIds(value).some((id) => {
        return id === NEWTAB_CUSTOM_WALLPAPER_ID || isCustomWallpaperId(id);
      });
    }

    function getComparableSyncedWallpaperStorageValue(value) {
      if (!value || typeof value !== 'object') {
        return String(getRawWallpaperId(value) || '');
      }
      return JSON.stringify({
        version: Number(value.version) || 0,
        sameForModes: value.sameForModes !== false,
        light: String(getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_LIGHT, '') || ''),
        dark: String(getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_DARK, '') || '')
      });
    }

    function buildSyncedWallpaperStorageValue(prefs) {
      const normalized = cloneWallpaperPrefs(prefs);
      if (normalized.sameForModes && normalized.light === normalized.dark) {
        return normalized.light;
      }
      return {
        version: NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
        sameForModes: normalized.sameForModes,
        light: normalized.light,
        dark: normalized.dark
      };
    }

    function getComparableLocalWallpaperStorageValue(value) {
      if (!value || typeof value !== 'object') {
        return String(getRawWallpaperId(value) || '');
      }
      return JSON.stringify({
        version: Number(value.version) || 0,
        light: String(getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_LIGHT, '') || ''),
        dark: String(getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_DARK, '') || '')
      });
    }

    function buildLocalWallpaperStorageValue(overrides, sameForModes) {
      const normalized = cloneLocalWallpaperOverrides(overrides);
      if (sameForModes && (normalized.light || null) === (normalized.dark || null)) {
        return normalized.light || '';
      }
      if (!normalized.light && !normalized.dark) {
        return '';
      }
      return {
        version: NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
        light: normalized.light || '',
        dark: normalized.dark || ''
      };
    }

    function resolveSyncedWallpaperModeValue(raw, hasRaw) {
      const value = hasRaw ? raw : NEWTAB_WALLPAPER_DEFAULT_ID;
      if (shouldWaitForCustomWallpapers(value)) {
        const nextCustomId = normalizeNewtabWallpaperId(value);
        if (nextCustomId && isCustomWallpaperId(nextCustomId)) {
          return {
            id: NEWTAB_WALLPAPER_DEFAULT_ID,
            localMigrationId: nextCustomId,
            sanitized: true
          };
        }
        return {
          id: NEWTAB_WALLPAPER_DEFAULT_ID,
          localMigrationId: '',
          sanitized: true
        };
      }
      const nextId = normalizeNewtabWallpaperId(value);
      return {
        id: nextId,
        localMigrationId: '',
        sanitized: !hasRaw || (value && value !== nextId)
      };
    }

    function resolveSyncedWallpaperValue(value, hasValue) {
      const isObjectValue = Boolean(value && typeof value === 'object');
      const sameForModes = isObjectValue ? value.sameForModes !== false : true;
      const rawLight = isObjectValue
        ? getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_LIGHT, hasValue ? value : NEWTAB_WALLPAPER_DEFAULT_ID)
        : (hasValue ? value : NEWTAB_WALLPAPER_DEFAULT_ID);
      const lightResolution = resolveSyncedWallpaperModeValue(rawLight, hasValue || isObjectValue);
      const rawDark = sameForModes
        ? rawLight
        : getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_DARK, rawLight);
      const darkResolution = sameForModes
        ? lightResolution
        : resolveSyncedWallpaperModeValue(rawDark, true);
      const prefs = {
        version: NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION,
        sameForModes,
        light: lightResolution.id,
        dark: sameForModes ? lightResolution.id : darkResolution.id
      };
      const localMigrations = getDefaultLocalWallpaperOverrides();
      if (lightResolution.localMigrationId) {
        localMigrations.light = lightResolution.localMigrationId;
      }
      if (sameForModes) {
        localMigrations.dark = localMigrations.light;
      } else if (darkResolution.localMigrationId) {
        localMigrations.dark = darkResolution.localMigrationId;
      }
      const sanitizedValue = buildSyncedWallpaperStorageValue(prefs);
      const shouldSanitize = !hasValue ||
        lightResolution.sanitized ||
        (!sameForModes && darkResolution.sanitized) ||
        (isObjectValue && (
          Number(value.version) !== NEWTAB_WALLPAPER_PREFS_STORAGE_VERSION ||
          getComparableSyncedWallpaperStorageValue(value) !== getComparableSyncedWallpaperStorageValue(sanitizedValue)
        ));
      return {
        prefs,
        sanitizedValue: shouldSanitize ? sanitizedValue : null,
        localMigrations
      };
    }

    function resolveLocalWallpaperModeValue(raw, hasRaw) {
      if (!hasRaw) {
        return { override: null, shouldClear: false };
      }
      const rawId = String(getRawWallpaperId(raw) || '').trim();
      if (!rawId) {
        return { override: null, shouldClear: false };
      }
      if (rawId === NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE) {
        return { override: NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE, shouldClear: false };
      }
      const nextId = normalizeNewtabWallpaperId(raw);
      if (nextId && isCustomWallpaperId(nextId)) {
        return { override: nextId, shouldClear: false };
      }
      return { override: null, shouldClear: true };
    }

    function resolveLocalWallpaperOverride(value, hasValue) {
      const overrides = getDefaultLocalWallpaperOverrides();
      if (!hasValue) {
        return { overrides, shouldClear: false };
      }
      if (!value || typeof value !== 'object') {
        const resolution = resolveLocalWallpaperModeValue(value, true);
        overrides.light = resolution.override;
        overrides.dark = resolution.override;
        return {
          overrides,
          shouldClear: resolution.shouldClear
        };
      }
      const lightResolution = resolveLocalWallpaperModeValue(
        getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_LIGHT, ''),
        true
      );
      const darkResolution = resolveLocalWallpaperModeValue(
        getWallpaperStorageModeValue(value, NEWTAB_WALLPAPER_MODE_DARK, ''),
        true
      );
      overrides.light = lightResolution.override;
      overrides.dark = darkResolution.override;
      const normalizedValue = buildLocalWallpaperStorageValue(overrides, false);
      return {
        overrides,
        shouldClear: lightResolution.shouldClear ||
        darkResolution.shouldClear ||
          getComparableLocalWallpaperStorageValue(value) !== getComparableLocalWallpaperStorageValue(normalizedValue)
      };
    }

    function getWallpaperLocalOverrideForMode(mode) {
      const normalizedMode = normalizeWallpaperMode(mode);
      const overrides = currentLocalWallpaperOverrides || getDefaultLocalWallpaperOverrides();
      return overrides[normalizedMode] || null;
    }

    function getSyncedWallpaperIdForMode(mode) {
      const normalizedMode = normalizeWallpaperMode(mode);
      const prefs = currentWallpaperPrefs || getDefaultWallpaperPrefs();
      const id = prefs.sameForModes ? prefs.light : prefs[normalizedMode];
      return normalizeNewtabWallpaperId(id) || '';
    }

    function getEffectiveWallpaperIdForMode(mode) {
      const override = getWallpaperLocalOverrideForMode(mode);
      if (override === NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE) {
        return '';
      }
      if (override && isCustomWallpaperId(override)) {
        return normalizeNewtabWallpaperId(override) || override;
      }
      return getSyncedWallpaperIdForMode(mode);
    }

    function getResolvedWallpaperMode() {
      return document.body && document.body.getAttribute('data-theme') === 'dark'
        ? NEWTAB_WALLPAPER_MODE_DARK
        : NEWTAB_WALLPAPER_MODE_LIGHT;
    }

    function getWallpaperEditMode() {
      if (currentWallpaperPrefs && currentWallpaperPrefs.sameForModes) {
        return getResolvedWallpaperMode();
      }
      return normalizeWallpaperMode(activeWallpaperMode);
    }

    function getWallpaperSelectionIdForUi() {
      return getEffectiveWallpaperIdForMode(getWallpaperEditMode());
    }

    function hasAnyWallpaperEnabled() {
      return NEWTAB_WALLPAPER_MODES.some((mode) => Boolean(getEffectiveWallpaperIdForMode(mode)));
    }

    function getWallpaperSourceTabForId(id) {
      return isCustomWallpaperId(id) ? 'local' : 'built-in';
    }

    function getWallpaperModeLabel(mode) {
      const normalizedMode = normalizeWallpaperMode(mode);
      return normalizedMode === NEWTAB_WALLPAPER_MODE_DARK
        ? t('settings_theme_dark', 'Dark')
        : t('settings_theme_light', 'Light');
    }

    function getWallpaperModePreferenceOrder() {
      const modes = [];
      const addMode = (mode) => {
        const normalizedMode = normalizeWallpaperMode(mode);
        if (!modes.includes(normalizedMode)) {
          modes.push(normalizedMode);
        }
      };
      addMode(getResolvedWallpaperMode());
      addMode(getWallpaperEditMode());
      NEWTAB_WALLPAPER_MODES.forEach(addMode);
      return modes;
    }

    function getFirstEnabledWallpaperIdForModes(modes) {
      for (let i = 0; i < modes.length; i += 1) {
        const id = getEffectiveWallpaperIdForMode(modes[i]);
        if (id) {
          return id;
        }
      }
      return '';
    }

    function getCopyableWallpaperLocalOverrideForId(modes, id) {
      const normalizedId = normalizeNewtabWallpaperId(id);
      if (!normalizedId || !isCustomWallpaperId(normalizedId)) {
        return null;
      }
      for (let i = 0; i < modes.length; i += 1) {
        const override = getWallpaperLocalOverrideForMode(modes[i]);
        if (override &&
            override !== NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE &&
            isCustomWallpaperId(override) &&
            normalizeNewtabWallpaperId(override) === normalizedId) {
          return override;
        }
      }
      return null;
    }

    function setWallpaperPrefs(nextPrefs, nextOverrides) {
      currentWallpaperPrefs = cloneWallpaperPrefs(nextPrefs);
      currentLocalWallpaperOverrides = cloneLocalWallpaperOverrides(nextOverrides);
      if (currentWallpaperPrefs.sameForModes) {
        activeWallpaperMode = getResolvedWallpaperMode();
      } else {
        activeWallpaperMode = normalizeWallpaperMode(activeWallpaperMode);
      }
    }

    function getWritableWallpaperPrefs() {
      return cloneWallpaperPrefs(currentWallpaperPrefs);
    }

    function getWritableLocalWallpaperOverrides() {
      return cloneLocalWallpaperOverrides(currentLocalWallpaperOverrides);
    }

    function applyLocalWallpaperMigrations(overrides, migrations) {
      const nextOverrides = cloneLocalWallpaperOverrides(overrides);
      let changed = false;
      NEWTAB_WALLPAPER_MODES.forEach((mode) => {
        const migrationId = migrations && migrations[mode] ? migrations[mode] : '';
        if (!migrationId) {
          return;
        }
        nextOverrides[mode] = migrationId;
        changed = true;
      });
      return { overrides: nextOverrides, changed };
    }

    function writeCurrentWallpaperPrefs(options) {
      const config = options || {};
      writeSyncedWallpaperValue(buildSyncedWallpaperStorageValue(currentWallpaperPrefs), config);
      writeLocalWallpaperValue(
        buildLocalWallpaperStorageValue(currentLocalWallpaperOverrides, currentWallpaperPrefs.sameForModes),
        config
      );
    }

    function getWallpaperPreloadEntryForMode(mode) {
      const wallpaper = getWallpaperById(getEffectiveWallpaperIdForMode(mode));
      const path = wallpaper && !isCustomWallpaperId(wallpaper.id)
        ? getWallpaperRuntimePath(wallpaper)
        : '';
      return path ? { id: wallpaper.id, path } : null;
    }

    function writeWallpaperPreloadCache() {
      try {
        if (!window.localStorage) {
          return;
        }
        const wallpapers = {
          light: getWallpaperPreloadEntryForMode(NEWTAB_WALLPAPER_MODE_LIGHT),
          dark: getWallpaperPreloadEntryForMode(NEWTAB_WALLPAPER_MODE_DARK)
        };
        window.localStorage.setItem(PRELOAD_STORAGE_KEY, JSON.stringify({
          version: PRELOAD_STORAGE_VERSION,
          mode: getResolvedWallpaperMode(),
          themeMode: getEffectiveThemeMode(),
          wallpapers,
          updatedAt: Date.now()
        }));
      } catch (e) {
        // localStorage may be unavailable in constrained contexts; storage is only a fast-path cache.
      }
    }

    function normalizeCustomWallpaperRecord(record) {
      return localWallpaperStore ? localWallpaperStore.normalizeRecord(record) : null;
    }

    function readCustomWallpaperRecords() {
      return localWallpaperStore ? localWallpaperStore.readAll() : Promise.resolve([]);
    }

    function writeCustomWallpaperRecord(record) {
      return localWallpaperStore
        ? localWallpaperStore.write(record)
        : Promise.reject(new Error('Local wallpaper store is not available.'));
    }

    function deleteCustomWallpaperRecord(record) {
      return localWallpaperStore
        ? localWallpaperStore.remove(record)
        : Promise.reject(new Error('Local wallpaper store is not available.'));
    }

    function buildCustomWallpaperRecordFromFile(file) {
      return localWallpaperStore
        ? localWallpaperStore.buildRecordFromFile(file)
        : Promise.reject(new Error('Local wallpaper store is not available.'));
    }

    function normalizeWallpaperOverlayOpacity(value, fallback) {
      const fallbackValue = Number.isFinite(Number(fallback)) ? Number(fallback) : 50;
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) {
        return Math.max(0, Math.min(100, Math.round(fallbackValue)));
      }
      return Math.max(0, Math.min(100, parsed));
    }

    function snapWallpaperOverlaySliderValue(value) {
      const normalized = normalizeWallpaperOverlayOpacity(value, 50);
      const target = NEWTAB_WALLPAPER_OVERLAY_SNAP_POINTS.find((point) => {
        const threshold = point === 100 ? 0 : NEWTAB_WALLPAPER_OVERLAY_SNAP_THRESHOLD;
        return Math.abs(normalized - point) <= threshold;
      });
      return typeof target === 'number' ? target : normalized;
    }

    function legacyWallpaperOverlayOpacityToSliderValue(value, fallback) {
      return normalizeWallpaperOverlayOpacity(
        Math.round(normalizeWallpaperOverlayOpacity(value, 100) / 2),
        fallback
      );
    }

    function normalizeWallpaperOverlayPrefs(value) {
      if (value && typeof value === 'object') {
        if (value.version !== NEWTAB_WALLPAPER_OVERLAY_STORAGE_VERSION) {
          return {
            version: NEWTAB_WALLPAPER_OVERLAY_STORAGE_VERSION,
            light: legacyWallpaperOverlayOpacityToSliderValue(value.light, NEWTAB_WALLPAPER_OVERLAY_DEFAULTS.light),
            dark: legacyWallpaperOverlayOpacityToSliderValue(value.dark, NEWTAB_WALLPAPER_OVERLAY_DEFAULTS.dark)
          };
        }
        return {
          version: NEWTAB_WALLPAPER_OVERLAY_STORAGE_VERSION,
          light: normalizeWallpaperOverlayOpacity(value.light, NEWTAB_WALLPAPER_OVERLAY_DEFAULTS.light),
          dark: normalizeWallpaperOverlayOpacity(value.dark, NEWTAB_WALLPAPER_OVERLAY_DEFAULTS.dark)
        };
      }
      const shared = typeof value === 'undefined' || value === null
        ? NEWTAB_WALLPAPER_OVERLAY_DEFAULTS.light
        : legacyWallpaperOverlayOpacityToSliderValue(value, NEWTAB_WALLPAPER_OVERLAY_DEFAULTS.light);
      return {
        version: NEWTAB_WALLPAPER_OVERLAY_STORAGE_VERSION,
        light: shared,
        dark: shared
      };
    }

    function getResolvedWallpaperOverlayMode() {
      return document.body && document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function getWallpaperOverlayOpacityForCurrentMode() {
      const mode = getResolvedWallpaperOverlayMode();
      return normalizeWallpaperOverlayOpacity(
        currentWallpaperOverlayOpacity[mode],
        NEWTAB_WALLPAPER_OVERLAY_DEFAULTS[mode]
      );
    }

    function getWallpaperOverlayStopPercent(base, value) {
      const basePercent = clampNumber(Number(base) || 0, 0, 100);
      const sliderValue = normalizeWallpaperOverlayOpacity(value, 50);
      if (sliderValue <= 50) {
        return basePercent * Math.pow(sliderValue / 50, 1.08);
      }
      const progress = (sliderValue - 50) / 50;
      return basePercent + ((100 - basePercent) * Math.pow(progress, 1.08));
    }

    function formatOverlayCssPercent(base, opacity) {
      const value = getWallpaperOverlayStopPercent(base, opacity);
      return `${Number(value.toFixed(1))}%`;
    }

    function applyWallpaperOverlayOpacity(value) {
      currentWallpaperOverlayOpacity = normalizeWallpaperOverlayPrefs(value);
      const target = document.documentElement;
      if (target) {
        ['light', 'dark'].forEach((mode) => {
          const stops = NEWTAB_WALLPAPER_OVERLAY_STOPS[mode];
          const opacity = currentWallpaperOverlayOpacity[mode];
          target.style.setProperty(`--x-nt-wallpaper-overlay-${mode}-top`, formatOverlayCssPercent(stops.top, opacity));
          target.style.setProperty(`--x-nt-wallpaper-overlay-${mode}-mid`, formatOverlayCssPercent(stops.mid, opacity));
          target.style.setProperty(`--x-nt-wallpaper-overlay-${mode}-bottom`, formatOverlayCssPercent(stops.bottom, opacity));
        });
      }
      updateWallpaperOverlayControlUi();
      scheduleWallpaperAdaptiveToneUpdate();
    }

    function updateWallpaperSliderElement(slider, config) {
      if (!slider) {
        return;
      }
      const value = Number(config.value);
      const normalizedValue = Number.isFinite(value) ? value : 0;
      slider.value = String(normalizedValue);
      slider.style.setProperty('--x-nt-overlay-slider-percent', `${normalizedValue}%`);
      slider.setAttribute('aria-valuenow', String(normalizedValue));
      slider.setAttribute('aria-valuetext', `${normalizedValue}%`);
      if (typeof config.enabled === 'boolean') {
        slider.disabled = !config.enabled;
        if (slider.parentElement) {
          slider.parentElement.setAttribute('data-disabled', config.enabled ? 'false' : 'true');
        }
      }
      if (config.labelKey) {
        slider.setAttribute('aria-label', t(config.labelKey, config.fallback));
      }
      syncWallpaperSliderValueBubble(slider);
    }

    function updateWallpaperOverlayControlUi() {
      const value = getWallpaperOverlayOpacityForCurrentMode();
      updateWallpaperSliderElement(wallpaperOverlaySlider, {
        value,
        labelKey: 'newtab_wallpaper_overlay_opacity',
        fallback: 'Mask effect'
      });
      if (wallpaperOverlayLabel) {
        wallpaperOverlayLabel.textContent = t('newtab_wallpaper_overlay_opacity', 'Mask effect');
      }
    }

    function persistWallpaperOverlayOpacity(mode, value) {
      const nextMode = mode === 'dark' ? 'dark' : 'light';
      const nextValue = normalizeWallpaperOverlayOpacity(value, currentWallpaperOverlayOpacity[nextMode]);
      const nextPrefs = {
        version: NEWTAB_WALLPAPER_OVERLAY_STORAGE_VERSION,
        light: currentWallpaperOverlayOpacity.light,
        dark: currentWallpaperOverlayOpacity.dark,
        [nextMode]: nextValue
      };
      applyWallpaperOverlayOpacity(nextPrefs);
      if (!storageArea) {
        return;
      }
      if (wallpaperOverlaySaveTimer !== null) {
        clearTimeout(wallpaperOverlaySaveTimer);
      }
      wallpaperOverlaySaveTimer = setTimeout(() => {
        wallpaperOverlaySaveTimer = null;
        storageArea.set({ [NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY]: nextPrefs });
      }, 120);
    }

    function bootstrapInitialWallpaperOverlay() {
      if (initialWallpaperOverlayReadyPromise) {
        return initialWallpaperOverlayReadyPromise;
      }
      initialWallpaperOverlayReadyPromise = new Promise((resolve) => {
        if (!storageArea) {
          applyWallpaperOverlayOpacity({
            version: NEWTAB_WALLPAPER_OVERLAY_STORAGE_VERSION,
            light: NEWTAB_WALLPAPER_OVERLAY_DEFAULTS.light,
            dark: NEWTAB_WALLPAPER_OVERLAY_DEFAULTS.dark
          });
          resolve();
          return;
        }
        storageArea.get([NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY], (result) => {
          const raw = result ? result[NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY] : null;
          const prefs = normalizeWallpaperOverlayPrefs(raw);
          applyWallpaperOverlayOpacity(prefs);
          if (raw && JSON.stringify(raw) !== JSON.stringify(prefs)) {
            storageArea.set({ [NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY]: prefs });
          }
          resolve();
        });
      });
      return initialWallpaperOverlayReadyPromise;
    }

    function normalizeWallpaperEffectPrefs(value) {
      return normalizeSingleWallpaperEffectPrefs(value);
    }

    function getWallpaperEffectPrefsForMode(mode) {
      const normalizedMode = normalizeWallpaperMode(mode);
      return normalizeWallpaperEffectPrefs(
        currentWallpaperEffectPrefsByMode &&
          currentWallpaperEffectPrefsByMode[normalizedMode]
      );
    }

    function getWallpaperEffectEditMode() {
      return currentWallpaperPrefs && currentWallpaperPrefs.sameForModes === false
        ? getWallpaperEditMode()
        : getResolvedWallpaperMode();
    }

    function getWallpaperEffectPrefsForEditMode() {
      return getWallpaperEffectPrefsForMode(getWallpaperEffectEditMode());
    }

    function cloneWallpaperEffectStoragePrefs(value) {
      return normalizeWallpaperEffectStoragePrefs(value);
    }

    function setWallpaperEffectPrefsForModes(nextPrefsByMode) {
      currentWallpaperEffectPrefsByMode = cloneWallpaperEffectStoragePrefs(nextPrefsByMode);
    }

    function getWallpaperEffectStorageValue() {
      return cloneWallpaperEffectStoragePrefs(currentWallpaperEffectPrefsByMode);
    }

    function setSharedWallpaperEffectPrefs(value) {
      const shared = normalizeWallpaperEffectPrefs(value);
      setWallpaperEffectPrefsForModes({
        version: WALLPAPER_EFFECT_MODE_STORAGE_VERSION,
        light: shared,
        dark: shared
      });
    }

    function synchronizeWallpaperEffectPrefsWithWallpaperModes(sourceMode) {
      if (!hasStoredWallpaperEffectLoaded ||
          !hasStoredWallpaperStateLoaded ||
          !currentWallpaperPrefs ||
          currentWallpaperPrefs.sameForModes === false) {
        return false;
      }
      const mode = normalizeWallpaperMode(sourceMode || getResolvedWallpaperMode());
      const before = JSON.stringify(getWallpaperEffectStorageValue());
      setSharedWallpaperEffectPrefs(getWallpaperEffectPrefsForMode(mode));
      return before !== JSON.stringify(getWallpaperEffectStorageValue());
    }

    function doesWallpaperEffectSupportSize(type) {
      return type === 'halftone' || type === 'ascii';
    }

    function doesWallpaperEffectSupportSpacing(type) {
      return type === 'halftone' || type === 'ascii';
    }

    function getWallpaperEffectLabel(type) {
      const item = NEWTAB_WALLPAPER_EFFECT_TYPES.find((effect) => effect.type === type) ||
        NEWTAB_WALLPAPER_EFFECT_TYPES[0];
      return t(item.labelKey, item.fallback);
    }

    function updateWallpaperEffectTabsIndicator() {
      if (!wallpaperEffectOptions || !wallpaperEffectTabsIndicator) {
        return;
      }
      const activeButton = wallpaperEffectOptions.querySelector('button[data-wallpaper-effect-type][data-active="true"]');
      if (!activeButton) {
        wallpaperEffectTabsIndicator.style.width = '0px';
        return;
      }
      const containerRect = wallpaperEffectOptions.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      if (containerRect.width <= 0 || buttonRect.width <= 0) {
        return;
      }
      const scaleX = wallpaperEffectOptions.offsetWidth > 0
        ? containerRect.width / wallpaperEffectOptions.offsetWidth
        : 1;
      const normalizedScaleX = scaleX > 0 ? scaleX : 1;
      const inset = 2;
      const borderLeft = Number.parseFloat(window.getComputedStyle(wallpaperEffectOptions).borderLeftWidth) || 0;
      const offset = Math.round(((buttonRect.left - containerRect.left) / normalizedScaleX) - inset - borderLeft);
      wallpaperEffectTabsIndicator.style.width = `${Math.round(buttonRect.width / normalizedScaleX)}px`;
      wallpaperEffectTabsIndicator.style.transform = `translateX(${offset}px)`;
    }

    function scheduleWallpaperEffectTabsIndicatorRefresh() {
      if (wallpaperEffectTabsIndicatorRefreshFrame) {
        return;
      }
      wallpaperEffectTabsIndicatorRefreshFrame = requestAnimationFrame(() => {
        wallpaperEffectTabsIndicatorRefreshFrame = requestAnimationFrame(() => {
          wallpaperEffectTabsIndicatorRefreshFrame = 0;
          updateWallpaperEffectTabsIndicator();
        });
      });
    }

    function updateWallpaperTabsIndicatorFor(tabs, indicator, selector) {
      if (!tabs || !indicator) {
        return;
      }
      const activeButton = tabs.querySelector(selector);
      if (!activeButton) {
        indicator.style.width = '0px';
        return;
      }
      const containerRect = tabs.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      if (containerRect.width <= 0 || buttonRect.width <= 0) {
        return;
      }
      const scaleX = tabs.offsetWidth > 0
        ? containerRect.width / tabs.offsetWidth
        : 1;
      const normalizedScaleX = scaleX > 0 ? scaleX : 1;
      const inset = 2;
      const borderLeft = Number.parseFloat(window.getComputedStyle(tabs).borderLeftWidth) || 0;
      const offset = Math.round(((buttonRect.left - containerRect.left) / normalizedScaleX) - inset - borderLeft);
      indicator.style.width = `${Math.round(buttonRect.width / normalizedScaleX)}px`;
      indicator.style.transform = `translateX(${offset}px)`;
    }

    function updateWallpaperTabsIndicator() {
      updateWallpaperTabsIndicatorFor(
        wallpaperTabs,
        wallpaperTabsIndicator,
        'button[data-wallpaper-tab][data-active="true"]'
      );
    }

    function updateWallpaperModeTabsIndicator() {
      updateWallpaperTabsIndicatorFor(
        wallpaperModeTabs,
        wallpaperModeTabsIndicator,
        'button[data-wallpaper-mode][data-active="true"]'
      );
    }

    function updateTopContentTabsIndicator() {
      updateWallpaperTabsIndicatorFor(
        topContentTabs,
        topContentTabsIndicator,
        'button[data-newtab-top-content][data-active="true"]'
      );
    }

    function scheduleWallpaperTabsIndicatorRefresh() {
      if (wallpaperTabsIndicatorRefreshFrame) {
        return;
      }
      wallpaperTabsIndicatorRefreshFrame = requestAnimationFrame(() => {
        wallpaperTabsIndicatorRefreshFrame = requestAnimationFrame(() => {
          wallpaperTabsIndicatorRefreshFrame = 0;
          updateWallpaperTabsIndicator();
        });
      });
    }

    function scheduleWallpaperModeTabsIndicatorRefresh() {
      if (wallpaperModeTabsIndicatorRefreshFrame) {
        return;
      }
      wallpaperModeTabsIndicatorRefreshFrame = requestAnimationFrame(() => {
        wallpaperModeTabsIndicatorRefreshFrame = requestAnimationFrame(() => {
          wallpaperModeTabsIndicatorRefreshFrame = 0;
          updateWallpaperModeTabsIndicator();
        });
      });
    }

    function scheduleTopContentTabsIndicatorRefresh() {
      if (topContentTabsIndicatorRefreshFrame) {
        return;
      }
      topContentTabsIndicatorRefreshFrame = requestAnimationFrame(() => {
        topContentTabsIndicatorRefreshFrame = requestAnimationFrame(() => {
          topContentTabsIndicatorRefreshFrame = 0;
          updateTopContentTabsIndicator();
        });
      });
    }

    function updateWallpaperPanelTabIndicators() {
      updateWallpaperModeTabsIndicator();
      updateWallpaperTabsIndicator();
      updateWallpaperEffectTabsIndicator();
      updateTopContentTabsIndicator();
    }

    function scheduleWallpaperPanelTabIndicatorsRefresh() {
      scheduleWallpaperModeTabsIndicatorRefresh();
      scheduleWallpaperTabsIndicatorRefresh();
      scheduleWallpaperEffectTabsIndicatorRefresh();
      scheduleTopContentTabsIndicatorRefresh();
    }

    function scheduleWallpaperPanelOpenTabIndicatorsRefresh() {
      scheduleWallpaperPanelTabIndicatorsRefresh();
      window.setTimeout(() => {
        if (isWallpaperPanelOpen()) {
          updateWallpaperPanelTabIndicators();
        }
      }, 240);
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
        document.fonts.ready.then(() => {
          if (isWallpaperPanelOpen()) {
            scheduleWallpaperPanelTabIndicatorsRefresh();
          }
        }).catch(() => {});
      }
    }

    function cleanupWallpaperPanelResize() {
      if (wallpaperPanelResizeTimer !== null) {
        window.clearTimeout(wallpaperPanelResizeTimer);
        wallpaperPanelResizeTimer = null;
      }
      if (typeof wallpaperPanelResizeCleanup === 'function') {
        wallpaperPanelResizeCleanup();
        wallpaperPanelResizeCleanup = null;
      }
    }

    function measureWallpaperPanelOpenHeight() {
      if (!wallpaperPanel) {
        return 0;
      }
      const previousHeight = wallpaperPanel.style.height;
      const previousTransition = wallpaperPanel.style.transition;
      wallpaperPanel.style.transition = 'none';
      wallpaperPanel.style.height = 'auto';
      const height = wallpaperPanel.getBoundingClientRect().height;
      wallpaperPanel.style.height = previousHeight;
      wallpaperPanel.style.transition = previousTransition;
      return height;
    }

    function animateWallpaperPanelResize(mutate) {
      if (typeof mutate !== 'function') {
        return;
      }
      const canAnimate = wallpaperPanel &&
        isWallpaperPanelOpen() &&
        !shouldReduceMotion();
      if (!canAnimate) {
        mutate();
        scheduleWallpaperPanelTabIndicatorsRefresh();
        return;
      }

      cleanupWallpaperPanelResize();
      const startHeight = wallpaperPanel.getBoundingClientRect().height;
      const previousHeight = wallpaperPanel.style.height;
      const previousOverflow = wallpaperPanel.style.overflow;
      const previousTransition = wallpaperPanel.style.transition;
      const previousWillChange = wallpaperPanel.style.willChange;

      wallpaperPanel.style.height = `${startHeight}px`;
      wallpaperPanel.style.overflow = 'hidden';
      wallpaperPanel.style.willChange = 'height, transform, opacity, filter';
      mutate();
      const endHeight = measureWallpaperPanelOpenHeight();

      const restorePanel = () => {
        wallpaperPanel.style.height = previousHeight;
        wallpaperPanel.style.overflow = previousOverflow;
        wallpaperPanel.style.transition = previousTransition;
        wallpaperPanel.style.willChange = previousWillChange;
        wallpaperPanel.removeEventListener('transitionend', handleTransitionEnd);
        if (wallpaperPanelResizeTimer !== null) {
          window.clearTimeout(wallpaperPanelResizeTimer);
          wallpaperPanelResizeTimer = null;
        }
        wallpaperPanelResizeCleanup = null;
        scheduleWallpaperPanelTabIndicatorsRefresh();
      };
      function handleTransitionEnd(event) {
        if (event && event.target === wallpaperPanel && event.propertyName === 'height') {
          restorePanel();
        }
      }

      if (Math.abs(endHeight - startHeight) < 1) {
        restorePanel();
        return;
      }

      wallpaperPanelResizeCleanup = restorePanel;
      wallpaperPanel.style.height = `${startHeight}px`;
      wallpaperPanel.style.transition = `height ${WALLPAPER_PANEL_RESIZE_DURATION_MS}ms ${WALLPAPER_PANEL_RESIZE_EASING}`;
      void wallpaperPanel.offsetHeight;
      wallpaperPanel.addEventListener('transitionend', handleTransitionEnd);
      requestAnimationFrame(() => {
        if (!wallpaperPanelResizeCleanup) {
          return;
        }
        wallpaperPanel.style.height = `${endHeight}px`;
      });
      wallpaperPanelResizeTimer = window.setTimeout(restorePanel, WALLPAPER_PANEL_RESIZE_DURATION_MS + 80);
    }

    function updateWallpaperTabSelectionUi(tab) {
      const nextTab = tab === 'local' ? 'local' : 'built-in';
      if (wallpaperBody) {
        wallpaperBody.setAttribute('data-active-tab', nextTab);
      }
      [
        { tab: 'built-in', button: wallpaperBuiltInTab, panel: wallpaperBuiltInGrid },
        { tab: 'local', button: wallpaperLocalTab, panel: wallpaperLocalGrid }
      ].forEach((item) => {
        const selected = item.tab === nextTab;
        if (item.button) {
          item.button.setAttribute('data-active', selected ? 'true' : 'false');
          item.button.setAttribute('aria-selected', selected ? 'true' : 'false');
          item.button.tabIndex = selected ? 0 : -1;
        }
        if (item.panel) {
          item.panel.setAttribute('aria-hidden', selected ? 'false' : 'true');
        }
      });
    }

    function setWallpaperElementVisible(element, visible) {
      if (!element) {
        return false;
      }
      const nextVisible = visible ? 'true' : 'false';
      const changed = element.getAttribute('data-visible') !== nextVisible;
      element.setAttribute('data-visible', nextVisible);
      element.setAttribute('aria-hidden', visible ? 'false' : 'true');
      if (changed && visible) {
        playWallpaperEnterMotion(element, 'enter');
      }
      return changed;
    }

    function updateWallpaperModeTabsUi() {
      const activeMode = normalizeWallpaperMode(activeWallpaperMode);
      [
        { mode: NEWTAB_WALLPAPER_MODE_LIGHT, button: wallpaperLightModeTab },
        { mode: NEWTAB_WALLPAPER_MODE_DARK, button: wallpaperDarkModeTab }
      ].forEach((item) => {
        const selected = item.mode === activeMode;
        if (!item.button) {
          return;
        }
        item.button.setAttribute('data-active', selected ? 'true' : 'false');
        item.button.setAttribute('aria-selected', selected ? 'true' : 'false');
        item.button.tabIndex = selected ? 0 : -1;
      });
      scheduleWallpaperModeTabsIndicatorRefresh();
    }

    function updateWallpaperModeHintText() {
      if (!wallpaperModeHint) {
        return;
      }
      const mode = normalizeWallpaperMode(activeWallpaperMode);
      const key = mode === NEWTAB_WALLPAPER_MODE_DARK
        ? 'newtab_wallpaper_mode_hint_dark'
        : 'newtab_wallpaper_mode_hint_light';
      const fallback = mode === NEWTAB_WALLPAPER_MODE_DARK
        ? 'Dark mode wallpaper'
        : 'Light mode wallpaper';
      wallpaperModeHint.textContent = t(key, fallback);
    }

    function updateWallpaperModeControlsUi(options) {
      const animate = !options || options.animate !== false;
      const showSplitControls = Boolean(currentWallpaperPrefs && currentWallpaperPrefs.sameForModes === false);
      const apply = () => {
        if (wallpaperModeSyncToggle) {
          const checked = !showSplitControls;
          wallpaperModeSyncToggle.checked = checked;
          wallpaperModeSyncToggle.setAttribute('aria-checked', checked ? 'true' : 'false');
          wallpaperModeSyncToggle.setAttribute(
            'aria-label',
            t('newtab_wallpaper_mode_sync_toggle_label', 'Use the same wallpaper for light and dark mode')
          );
        }
        if (wallpaperModeSyncTitle) {
          wallpaperModeSyncTitle.textContent = t('newtab_wallpaper_mode_sync_title', 'Match light and dark mode');
        }
        if (wallpaperModeTabs) {
          wallpaperModeTabs.setAttribute('aria-label', t('newtab_wallpaper_mode_tabs_label', 'Wallpaper color mode'));
          wallpaperModeTabs.querySelectorAll('.x-nt-wallpaper-mode-tab').forEach((button) => {
            const mode = normalizeWallpaperMode(button.getAttribute('data-wallpaper-mode'));
            button.textContent = mode === NEWTAB_WALLPAPER_MODE_DARK
              ? t('newtab_wallpaper_dark_mode_tab', 'Dark')
              : t('newtab_wallpaper_light_mode_tab', 'Light');
            button.setAttribute('aria-label', formatMessage(
              'newtab_wallpaper_mode_select_label',
              'Edit {mode} wallpaper',
              { mode: getWallpaperModeLabel(mode) }
            ));
          });
        }
        updateWallpaperModeHintText();
        const changed = [
          setWallpaperElementVisible(wallpaperModeTabs, showSplitControls),
          setWallpaperElementVisible(wallpaperModeHint, showSplitControls)
        ].some(Boolean);
        updateWallpaperModeTabsUi();
        if (changed) {
          scheduleWallpaperPanelTabIndicatorsRefresh();
        }
      };
      const modeTabsVisible = Boolean(wallpaperModeTabs &&
        wallpaperModeTabs.getAttribute('data-visible') === 'true');
      const modeHintVisible = Boolean(wallpaperModeHint &&
        wallpaperModeHint.getAttribute('data-visible') === 'true');
      const shouldResize = modeTabsVisible !== showSplitControls ||
        modeHintVisible !== showSplitControls;
      if (animate && shouldResize) {
        animateWallpaperPanelResize(apply);
        return;
      }
      apply();
    }

    function setWallpaperActiveTab(tab) {
      const nextTab = tab === 'local' ? 'local' : 'built-in';
      const isSameTab = activeWallpaperTab === nextTab &&
        wallpaperBody &&
        wallpaperBody.getAttribute('data-active-tab') === nextTab;
      if (isSameTab) {
        updateWallpaperTabSelectionUi(nextTab);
        scheduleWallpaperTabsIndicatorRefresh();
        return;
      }
      animateWallpaperPanelResize(() => {
        const previousTab = activeWallpaperTab;
        activeWallpaperTab = nextTab;
        updateWallpaperTabSelectionUi(nextTab);
        playWallpaperEnterMotion(
          getWallpaperGridForTab(nextTab),
          previousTab === 'local' && nextTab === 'built-in' ? 'enter-prev' : 'enter-next'
        );
      });
      scheduleWallpaperTabsIndicatorRefresh();
    }

    function syncWallpaperSourceTabToEditMode() {
      const selectedId = getWallpaperSelectionIdForUi();
      setWallpaperActiveTab(getWallpaperSourceTabForId(selectedId));
    }

    function setWallpaperActiveMode(mode) {
      const nextMode = normalizeWallpaperMode(mode);
      if (activeWallpaperMode === nextMode &&
          wallpaperModeTabs &&
          wallpaperModeTabs.querySelector(`button[data-wallpaper-mode="${nextMode}"][data-active="true"]`)) {
        updateWallpaperModeControlsUi({ animate: false });
        updateWallpaperSelectionUi();
        updateWallpaperEffectControlUi();
        return;
      }
      animateWallpaperPanelResize(() => {
        activeWallpaperMode = nextMode;
        updateWallpaperModeControlsUi({ animate: false });
        updateWallpaperSelectionUi();
        updateWallpaperEffectControlUi();
        syncWallpaperSourceTabToEditMode();
        playWallpaperEnterMotion(getWallpaperGridForTab(activeWallpaperTab), 'enter');
      });
      scheduleWallpaperPanelTabIndicatorsRefresh();
    }

    function setWallpaperBodyVisible(visible) {
      if (!wallpaperBody) {
        return;
      }
      const nextVisible = visible ? 'true' : 'false';
      if (wallpaperBody.getAttribute('data-visible') === nextVisible) {
        wallpaperBody.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (visible) {
          scheduleWallpaperPanelTabIndicatorsRefresh();
        }
        return;
      }
      animateWallpaperPanelResize(() => {
        wallpaperBody.setAttribute('data-visible', nextVisible);
        wallpaperBody.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (visible) {
          playWallpaperEnterMotion(wallpaperBody, 'enter');
        }
      });
      if (visible) {
        scheduleWallpaperTabsIndicatorRefresh();
        scheduleWallpaperEffectTabsIndicatorRefresh();
      }
    }

    function setWallpaperEffectSliderControlVisible(control, visible) {
      if (!control) {
        return false;
      }
      const nextVisible = visible ? 'true' : 'false';
      const changed = control.getAttribute('data-visible') !== nextVisible;
      control.setAttribute('data-visible', nextVisible);
      control.setAttribute('aria-hidden', visible ? 'false' : 'true');
      if (changed && visible) {
        playWallpaperEnterMotion(control, 'enter');
      }
      return changed;
    }

    function applyWallpaperEffectForResolvedMode() {
      currentAppliedWallpaperEffectPrefs = getWallpaperEffectPrefsForMode(getResolvedWallpaperMode());
      if (document.body) {
        document.body.setAttribute('data-wallpaper-effect', currentAppliedWallpaperEffectPrefs.type);
      }
      if (wallpaperEffects) {
        wallpaperEffects.apply(currentAppliedWallpaperEffectPrefs);
      }
      updateWallpaperEffectControlUi();
    }

    function applyWallpaperEffectPrefs(value) {
      setWallpaperEffectPrefsForModes(normalizeWallpaperEffectStoragePrefs(value));
      synchronizeWallpaperEffectPrefsWithWallpaperModes();
      applyWallpaperEffectForResolvedMode();
    }

    function getWallpaperEffectControlVisibility(prefs) {
      return {
        strength: prefs.type !== 'none',
        size: doesWallpaperEffectSupportSize(prefs.type),
        spacing: doesWallpaperEffectSupportSpacing(prefs.type)
      };
    }

    function isWallpaperEffectControlVisibilityChanged(control, visible) {
      return Boolean(control &&
        control.getAttribute('data-visible') !== (visible ? 'true' : 'false'));
    }

    function updateWallpaperEffectControlsVisibility(visibility) {
      const changed = [
        [wallpaperEffectStrengthControl, visibility.strength],
        [wallpaperEffectSizeControl, visibility.size],
        [wallpaperEffectSpacingControl, visibility.spacing]
      ].some((item) => isWallpaperEffectControlVisibilityChanged(item[0], item[1]));
      const applyVisibility = () => {
        setWallpaperEffectSliderControlVisible(wallpaperEffectStrengthControl, visibility.strength);
        setWallpaperEffectSliderControlVisible(wallpaperEffectSizeControl, visibility.size);
        setWallpaperEffectSliderControlVisible(wallpaperEffectSpacingControl, visibility.spacing);
      };
      if (changed) {
        animateWallpaperPanelResize(applyVisibility);
        return;
      }
      applyVisibility();
    }

    function updateWallpaperEffectOptionsUi(prefs) {
      if (wallpaperEffectOptions) {
        wallpaperEffectOptions.querySelectorAll('.x-nt-effect-option').forEach((button) => {
          const selected = button.getAttribute('data-wallpaper-effect-type') === prefs.type;
          button.setAttribute('data-selected', selected ? 'true' : 'false');
          button.setAttribute('data-active', selected ? 'true' : 'false');
          button.setAttribute('aria-pressed', selected ? 'true' : 'false');
          const type = button.getAttribute('data-wallpaper-effect-type') || 'none';
          button.textContent = getWallpaperEffectLabel(type);
          button.setAttribute(
            'aria-label',
            formatMessage('newtab_wallpaper_effect_select_label', 'Use {effect} wallpaper filter', {
              effect: getWallpaperEffectLabel(type)
            })
          );
        });
        wallpaperEffectOptions.setAttribute('aria-label', t('newtab_wallpaper_effect_title', 'Wallpaper filter'));
        scheduleWallpaperEffectTabsIndicatorRefresh();
      }
    }

    function updateWallpaperEffectSlidersUi(prefs, visibility) {
      updateWallpaperSliderElement(wallpaperEffectSlider, {
        value: prefs.strength,
        enabled: visibility.strength,
        labelKey: 'newtab_wallpaper_effect_strength',
        fallback: 'Sampling strength'
      });
      updateWallpaperSliderElement(wallpaperEffectSizeSlider, {
        value: prefs.size,
        enabled: visibility.size,
        labelKey: 'newtab_wallpaper_effect_size',
        fallback: 'Size'
      });
      updateWallpaperSliderElement(wallpaperEffectSpacingSlider, {
        value: prefs.spacing,
        enabled: visibility.spacing,
        labelKey: 'newtab_wallpaper_effect_spacing',
        fallback: 'Spacing'
      });
    }

    function updateWallpaperEffectTextUi() {
      if (wallpaperEffectLabel) {
        wallpaperEffectLabel.textContent = t('newtab_wallpaper_effect_title', 'Wallpaper filter');
      }
      if (wallpaperEffectStrengthLabel) {
        wallpaperEffectStrengthLabel.textContent = t('newtab_wallpaper_effect_strength', 'Sampling strength');
      }
      if (wallpaperEffectSizeLabel) {
        wallpaperEffectSizeLabel.textContent = t('newtab_wallpaper_effect_size', 'Size');
      }
      if (wallpaperEffectSpacingLabel) {
        wallpaperEffectSpacingLabel.textContent = t('newtab_wallpaper_effect_spacing', 'Spacing');
      }
    }

    function updateWallpaperEffectControlUi() {
      const prefs = getWallpaperEffectPrefsForEditMode();
      const visibility = getWallpaperEffectControlVisibility(prefs);
      updateWallpaperEffectControlsVisibility(visibility);
      updateWallpaperEffectOptionsUi(prefs);
      updateWallpaperEffectSlidersUi(prefs, visibility);
      updateWallpaperEffectTextUi();
    }

    function persistWallpaperEffectPrefs(partial) {
      const editMode = getWallpaperEffectEditMode();
      const nextPrefs = normalizeWallpaperEffectPrefs(Object.assign(
        {},
        getWallpaperEffectPrefsForMode(editMode),
        partial || {}
      ));
      const nextPrefsByMode = getWallpaperEffectStorageValue();
      const targetModes = currentWallpaperPrefs && currentWallpaperPrefs.sameForModes === false
        ? [editMode]
        : NEWTAB_WALLPAPER_MODES;
      targetModes.forEach((mode) => {
        nextPrefsByMode[mode] = nextPrefs;
      });
      setWallpaperEffectPrefsForModes(nextPrefsByMode);
      applyWallpaperEffectForResolvedMode();
      if (!storageArea) {
        return;
      }
      if (wallpaperEffectSaveTimer !== null) {
        clearTimeout(wallpaperEffectSaveTimer);
      }
      wallpaperEffectSaveTimer = setTimeout(() => {
        wallpaperEffectSaveTimer = null;
        storageArea.set({
          [NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]: getWallpaperEffectStorageValue()
        });
      }, 120);
    }

    function bootstrapInitialWallpaperEffect() {
      if (initialWallpaperEffectReadyPromise) {
        return initialWallpaperEffectReadyPromise;
      }
      if (!storageArea) {
        initialWallpaperEffectReadyPromise = Promise.resolve().then(() => {
          hasStoredWallpaperEffectLoaded = true;
          applyWallpaperEffectPrefs(NEWTAB_WALLPAPER_EFFECT_DEFAULTS);
        });
        return initialWallpaperEffectReadyPromise;
      }
      initialWallpaperEffectReadyPromise = new Promise((resolve) => {
        storageArea.get([NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY], (result) => {
          const raw = result ? result[NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY] : null;
          const prefs = normalizeWallpaperEffectStoragePrefs(raw);
          hasStoredWallpaperEffectLoaded = true;
          applyWallpaperEffectPrefs(prefs);
          const storedPrefs = getWallpaperEffectStorageValue();
          if (raw && JSON.stringify(raw) !== JSON.stringify(storedPrefs)) {
            storageArea.set({ [NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]: storedPrefs });
          }
          resolve();
        });
      });
      return initialWallpaperEffectReadyPromise;
    }

    function finalizeInitialWallpaper() {
      if (initialWallpaperApplied) {
        return;
      }
      initialWallpaperApplied = true;
      if (typeof resolveInitialWallpaperReady === 'function') {
        resolveInitialWallpaperReady();
      }
    }

    function updateWallpaperSelectionUi() {
      const wallpaperEnabled = hasAnyWallpaperEnabled();
      const selectedWallpaperId = getWallpaperSelectionIdForUi();
      if (wallpaperButton) {
        const isActive = Boolean(currentWallpaperId);
        wallpaperButton.setAttribute('data-active', isActive ? 'true' : 'false');
        wallpaperButton.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      }
      if (wallpaperEnabledToggle) {
        wallpaperEnabledToggle.checked = wallpaperEnabled;
        wallpaperEnabledToggle.setAttribute('aria-checked', wallpaperEnabled ? 'true' : 'false');
        wallpaperEnabledToggle.setAttribute('aria-label', t('newtab_wallpaper_toggle_label', 'Toggle wallpaper'));
      }
      setWallpaperBodyVisible(wallpaperEnabled);
      const tileContainers = getWallpaperTileContainers();
      if (tileContainers.length === 0) {
        return;
      }
      tileContainers.forEach((container) => {
        container.querySelectorAll('.x-nt-wallpaper-tile').forEach((tile) => {
          const selected = tile.getAttribute('data-wallpaper-id') === selectedWallpaperId;
          tile.setAttribute('data-selected', selected ? 'true' : 'false');
          tile.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
      });
    }

    function updateTopContentModeUi() {
      if (hasTopContentModeGetter) {
        currentTopContentMode = normalizeNewtabTopContentMode(getTopContentMode());
      }
      [topContentBrandTab, topContentTimeTab, topContentOffTab].forEach((button) => {
        if (!button) {
          return;
        }
        const active = button.getAttribute('data-newtab-top-content') === currentTopContentMode;
        button.setAttribute('data-active', active ? 'true' : 'false');
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      scheduleTopContentTabsIndicatorRefresh();
    }

    function applyTopContentMode(value) {
      currentTopContentMode = normalizeNewtabTopContentMode(value);
      setTopContentMode(currentTopContentMode);
      updateTopContentModeUi();
    }

    function persistTopContentMode(value) {
      const nextValue = normalizeNewtabTopContentMode(value);
      applyTopContentMode(nextValue);
      if (!storageArea || !NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY) {
        return;
      }
      storageArea.set({ [NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]: nextValue });
    }

    function getNewtabFaviconOptionButtons() {
      if (!newtabFaviconOptions) {
        return [];
      }
      return Array.from(newtabFaviconOptions.children || []).filter((child) => {
        return child && String(child.className || '').split(/\s+/).includes('x-nt-favicon-option');
      });
    }

    function getNewtabFaviconLink() {
      const head = document.head || document.getElementsByTagName && document.getElementsByTagName('head')[0];
      if (!head) {
        return null;
      }
      const children = Array.from(head.children || []);
      let link = children.find((child) => child &&
        String(child.tagName || '').toUpperCase() === 'LINK' &&
        child.getAttribute &&
        child.getAttribute('data-lumno-newtab-favicon') === 'true');
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('data-lumno-newtab-favicon', 'true');
        head.appendChild(link);
      }
      return link;
    }

    function updateNewtabFaviconSelectionUi() {
      const currentItem = getNewtabFaviconById(currentNewtabFaviconId) ||
        getNewtabFaviconById(NEWTAB_FAVICON_DEFAULT_ID);
      if (newtabFaviconTitle) {
        newtabFaviconTitle.textContent = t('newtab_favicon_title', 'New Tab favicon');
      }
      if (newtabFaviconOptions) {
        newtabFaviconOptions.setAttribute('aria-label', t('newtab_favicon_title', 'New Tab favicon'));
      }
      getNewtabFaviconOptionButtons().forEach((button) => {
        const item = getNewtabFaviconById(button.getAttribute('data-newtab-favicon-id'));
        if (!item) {
          return;
        }
        const selected = currentItem && item.id === currentItem.id;
        const name = getNewtabFaviconDisplayName(item);
        button.setAttribute('data-selected', selected ? 'true' : 'false');
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        button.setAttribute('aria-label', formatMessage('newtab_favicon_select_label', 'Select {name} favicon', {
          name
        }));
      });
    }

    function applyNewtabFavicon(value) {
      const nextId = normalizeNewtabFaviconId(value);
      const item = getNewtabFaviconById(nextId) || getNewtabFaviconById(NEWTAB_FAVICON_DEFAULT_ID);
      currentNewtabFaviconId = item ? item.id : NEWTAB_FAVICON_DEFAULT_ID;
      cacheNewtabFaviconPreloadId(currentNewtabFaviconId);
      bindNewtabFaviconThemeListener(item);
      const link = getNewtabFaviconLink();
      if (link && item) {
        applyNewtabFaviconLinkAttributes(link, item);
      }
      updateNewtabFaviconSelectionUi();
    }

    function persistNewtabFavicon(value) {
      const nextId = normalizeNewtabFaviconId(value);
      applyNewtabFavicon(nextId);
      writeStorageValue(storageArea, NEWTAB_FAVICON_STORAGE_KEY, nextId, () => {
        showToast(t('newtab_favicon_save_error', 'Failed to save favicon'), true);
      });
    }

    function bootstrapInitialNewtabFavicon() {
      if (hasNewtabFaviconBootstrapStarted) {
        return initialNewtabFaviconReadyPromise || Promise.resolve();
      }
      hasNewtabFaviconBootstrapStarted = true;
      initialNewtabFaviconReadyPromise = readStorageValue(storageArea, NEWTAB_FAVICON_STORAGE_KEY).then((storedValue) => {
        const nextId = normalizeNewtabFaviconId(storedValue.value);
        applyNewtabFavicon(nextId);
        if (storedValue.hasValue && storedValue.value !== nextId) {
          writeStorageValue(storageArea, NEWTAB_FAVICON_STORAGE_KEY, nextId);
        }
      });
      return initialNewtabFaviconReadyPromise;
    }

    function getWallpaperAppearanceOptionButtons() {
      if (!wallpaperAppearanceOptions) {
        return [];
      }
      return Array.from(wallpaperAppearanceOptions.querySelectorAll('.x-nt-appearance-option'));
    }

    function getWallpaperAppearanceOptionMotionElement(button) {
      if (!button || typeof button.querySelector !== 'function') {
        return button;
      }
      return button.querySelector('.x-nt-appearance-option-content') || button;
    }

    function updateWallpaperAppearanceScopeTabsUi(scope) {
      if (wallpaperAppearanceScopeTabs) {
        const activeScope = scope === 'home' ? 'home' : 'global';
        wallpaperAppearanceScopeTabs.querySelectorAll('.x-nt-appearance-scope-tab').forEach((button) => {
          const selected = button.getAttribute('data-theme-scope') === activeScope;
          button.setAttribute('data-selected', selected ? 'true' : 'false');
          button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
      }
      updateWallpaperSearchWidthControlUi();
    }

    function getSearchWidthMin() {
      return Number.isFinite(Number(searchWidthConfig.min)) ? Number(searchWidthConfig.min) : 720;
    }

    function getSearchWidthMax() {
      const min = getSearchWidthMin();
      const max = Number.isFinite(Number(searchWidthConfig.max)) ? Number(searchWidthConfig.max) : 1040;
      return Math.max(min + 1, max);
    }

    function normalizeSearchWidthValue(value) {
      const min = getSearchWidthMin();
      const max = getSearchWidthMax();
      const fallback = Number.isFinite(Number(searchWidthConfig.fallback))
        ? Number(searchWidthConfig.fallback)
        : 920;
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return Math.min(max, Math.max(min, Math.round(fallback)));
      }
      return Math.min(max, Math.max(min, Math.round(number)));
    }

    function getSearchWidthSnapPoints() {
      const points = Array.isArray(searchWidthConfig.snapPoints)
        ? searchWidthConfig.snapPoints
        : [720, 920, 1040];
      return points.map(normalizeSearchWidthValue)
        .filter((value, index, array) => array.indexOf(value) === index)
        .sort((a, b) => a - b);
    }

    function getSearchWidthPercent(value) {
      const min = getSearchWidthMin();
      const max = getSearchWidthMax();
      return ((normalizeSearchWidthValue(value) - min) / (max - min)) * 100;
    }

    function snapSearchWidthValue(value, threshold) {
      const width = normalizeSearchWidthValue(value);
      const snapThreshold = Number.isFinite(Number(threshold))
        ? Number(threshold)
        : Number(searchWidthConfig.snapThreshold || 14);
      const matched = getSearchWidthSnapPoints().find((point) => Math.abs(point - width) <= snapThreshold);
      return Number.isFinite(matched) ? matched : width;
    }

    function formatSearchWidthValue(value) {
      return `${normalizeSearchWidthValue(value)} px`;
    }

    function updateSearchWidthSliderElement(width) {
      if (!wallpaperSearchWidthSlider) {
        return;
      }
      const value = normalizeSearchWidthValue(width);
      wallpaperSearchWidthSlider.min = String(getSearchWidthMin());
      wallpaperSearchWidthSlider.max = String(getSearchWidthMax());
      wallpaperSearchWidthSlider.value = String(value);
      wallpaperSearchWidthSlider.style.setProperty('--x-nt-overlay-slider-percent', `${getSearchWidthPercent(value)}%`);
      wallpaperSearchWidthSlider.setAttribute('aria-valuenow', String(value));
      wallpaperSearchWidthSlider.setAttribute('aria-valuetext', formatSearchWidthValue(value));
      if (wallpaperSearchWidthValue) {
        wallpaperSearchWidthValue.textContent = formatSearchWidthValue(value);
      }
    }

    function setSearchWidthControlVisible(visible) {
      if (!wallpaperSearchWidthControl) {
        return;
      }
      const nextVisible = visible ? 'true' : 'false';
      if (wallpaperSearchWidthControl.getAttribute('data-visible') === nextVisible) {
        wallpaperSearchWidthControl.setAttribute('aria-hidden', visible ? 'false' : 'true');
        return;
      }
      animateWallpaperPanelResize(() => {
        wallpaperSearchWidthControl.setAttribute('data-visible', nextVisible);
        wallpaperSearchWidthControl.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (visible) {
          playWallpaperEnterMotion(wallpaperSearchWidthControl, 'enter');
        }
      });
    }

    function updateWallpaperSearchWidthControlUi() {
      if (!wallpaperSearchWidthControl) {
        return;
      }
      if (wallpaperSearchWidthLabel) {
        wallpaperSearchWidthLabel.textContent = t('newtab_search_width_title', 'Search box width');
      }
      if (wallpaperSearchWidthSlider) {
        wallpaperSearchWidthSlider.setAttribute(
          'aria-label',
          t('newtab_search_width_aria', 'Adjust New Tab search box width')
        );
      }
      if (wallpaperSearchWidthControl) {
        wallpaperSearchWidthControl.querySelectorAll('[data-search-width-tick]').forEach((tick) => {
          const key = tick.getAttribute('data-search-width-tick');
          if (key === 'standard') {
            tick.textContent = t('newtab_search_width_standard', 'Standard');
          } else if (key === 'wide') {
            tick.textContent = t('newtab_search_width_wide', 'Wide');
          } else if (key === 'max') {
            tick.textContent = t('newtab_search_width_max', 'Max');
          }
        });
      }
      updateSearchWidthSliderElement(getSearchWidth());
      setSearchWidthControlVisible(true);
    }

    function persistSearchWidthFromSlider(value, options) {
      const final = Boolean(options && options.final);
      const threshold = final
        ? Number(searchWidthConfig.snapThreshold || 14) * 1.35
        : Number(searchWidthConfig.snapThreshold || 14);
      const width = snapSearchWidthValue(value, threshold);
      if (wallpaperSearchWidthSlider && wallpaperSearchWidthSlider.value !== String(width)) {
        wallpaperSearchWidthSlider.value = String(width);
      }
      setSearchWidth(width, { persist: false });
      updateSearchWidthSliderElement(width);
      if (wallpaperSearchWidthSaveTimer !== null) {
        window.clearTimeout(wallpaperSearchWidthSaveTimer);
        wallpaperSearchWidthSaveTimer = null;
      }
      const persist = () => {
        wallpaperSearchWidthSaveTimer = null;
        setSearchWidth(width, { persist: true });
      };
      if (final) {
        persist();
        return;
      }
      wallpaperSearchWidthSaveTimer = window.setTimeout(persist, 140);
    }

    function updateWallpaperAppearanceSelectionUi() {
      updateWallpaperAppearanceScopeTabsUi(getThemeScope());
      if (wallpaperAppearanceOptions) {
        getWallpaperAppearanceOptionButtons().forEach((button) => {
          const selected = button.getAttribute('data-theme-mode') === getThemeMode();
          button.setAttribute('data-selected', selected ? 'true' : 'false');
          button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
      }
      updateWallpaperSearchWidthControlUi();
    }

    function updateCustomWallpaperUploadTile() {
      if (!customWallpaperUploadTile) {
        return;
      }
      const loading = customWallpaperImporting ? 'true' : 'false';
      customWallpaperUploadTile.setAttribute('data-loading', loading);
      customWallpaperUploadTile.setAttribute('aria-busy', loading);
      customWallpaperUploadTile.setAttribute('aria-disabled', loading);
      customWallpaperUploadTile.setAttribute('aria-label', t('newtab_wallpaper_add_local', 'Add local wallpaper'));
      if (customWallpaperImporting) {
        hideCustomWallpaperTooltip();
      }
    }

    function bindWallpaperTileActivation(tile, onActivate, shouldIgnoreEvent) {
      const activate = (event) => {
        if (typeof shouldIgnoreEvent === 'function' && shouldIgnoreEvent(event)) {
          return;
        }
        onActivate(event);
      };
      tile.addEventListener('click', activate);
      tile.addEventListener('keydown', (event) => {
        if (!event || (event.key !== 'Enter' && event.key !== ' ')) {
          return;
        }
        if (typeof shouldIgnoreEvent === 'function' && shouldIgnoreEvent(event)) {
          return;
        }
        event.preventDefault();
        onActivate(event);
      });
    }

    function isWallpaperDeleteButtonEvent(event) {
      return Boolean(
        event &&
        event.target &&
        event.target.closest &&
        event.target.closest('.x-nt-wallpaper-delete-button')
      );
    }

    function renderCustomWallpaperTiles() {
      if (!wallpaperLocalGrid || !customWallpaperUploadTile) {
        return;
      }
      animateWallpaperPanelResize(() => {
        const tiles = wallpaperViewController.renderCustomWallpapers(
          customWallpapers.map((item) => ({
            id: item.id,
            thumbnailUrl: getWallpaperThumbnailUrl(item)
          }))
        );
        tiles.forEach((tile) => {
          const wallpaperId = tile.getAttribute('data-wallpaper-id');
          bindWallpaperTileActivation(
            tile,
            () => {
              persistNewtabWallpaper(wallpaperId);
            },
            isWallpaperDeleteButtonEvent
          );
          const deleteButton = tile.querySelector('.x-nt-wallpaper-delete-button');
          if (deleteButton) {
            deleteButton.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              deleteCustomWallpaper(wallpaperId);
            });
          }
        });
      });
      updateWallpaperLanguageStrings();
      updateWallpaperSelectionUi();
    }

    function loadCustomWallpapers() {
      return readCustomWallpaperRecords()
        .then((records) => Promise.all(
          records.map(prepareCustomWallpaperObjectUrl)
        ).then(() => records))
        .then((records) => {
          revokeUnusedCustomWallpaperObjectUrls(records);
          customWallpapers = records;
          updateCustomWallpaperUploadTile();
          renderCustomWallpaperTiles();
          return records;
        })
        .catch(() => {
          revokeUnusedCustomWallpaperObjectUrls([]);
          customWallpapers = [];
          updateCustomWallpaperUploadTile();
          renderCustomWallpaperTiles();
          return [];
        });
    }

    function rememberActiveWallpaperId(mode, id) {
      const nextId = normalizeNewtabWallpaperId(id);
      if (!nextId) {
        return;
      }
      const normalizedMode = normalizeWallpaperMode(mode);
      lastActiveWallpaperId = nextId;
      lastActiveWallpaperIdsByMode[normalizedMode] = nextId;
      if (currentWallpaperPrefs && currentWallpaperPrefs.sameForModes) {
        NEWTAB_WALLPAPER_MODES.forEach((item) => {
          lastActiveWallpaperIdsByMode[item] = nextId;
        });
      }
    }

    function applyNewtabWallpaper(value, options) {
      const config = options || {};
      const mode = normalizeWallpaperMode(config.mode || getResolvedWallpaperMode());
      const rawId = String(getRawWallpaperId(value) || '').trim();
      const shouldUseFallback = Boolean(
        rawId && rawId !== NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE
      );
      const nextId = normalizeNewtabWallpaperId(value);
      const requestedWallpaper = getWallpaperById(nextId);
      const wallpaper = requestedWallpaper ||
        (shouldUseFallback ? getWallpaperById(NEWTAB_WALLPAPER_DEFAULT_ID) : null);
      const imageUrl = wallpaper ? getWallpaperImageUrl(wallpaper) : '';
      const isInitialWallpaperApply = !initialWallpaperApplied;
      const visualSeq = ++wallpaperVisualSeq;
      const applyReadyWallpaper = (ready) => {
        if (visualSeq !== wallpaperVisualSeq) {
          return;
        }
        const nextWallpaper = ready
          ? wallpaper
          : (shouldUseFallback ? getWallpaperById(NEWTAB_WALLPAPER_DEFAULT_ID) : null);
        const nextImageUrl = nextWallpaper ? getWallpaperImageUrl(nextWallpaper) : '';
        const nextActive = Boolean(nextImageUrl);
        const shouldAnimateVisualChange = initialWallpaperApplied &&
          (nextImageUrl !== appliedWallpaperVisualUrl ||
            nextActive !== appliedWallpaperVisualActive);
        currentWallpaperId = nextWallpaper ? nextWallpaper.id : '';
        if (currentWallpaperId) {
          rememberActiveWallpaperId(mode, currentWallpaperId);
        }
        writeWallpaperPreloadCache();
        updateWallpaperSelectionUi();
        const transitionLayer = shouldAnimateVisualChange ? createWallpaperTransitionLayer() : null;
        applyWallpaperVisualState(nextWallpaper);
        releaseWallpaperTransitionLayer(transitionLayer);
        if (isInitialWallpaperApply) {
          refreshWallpaperAdaptiveSampler();
        }
        scheduleWallpaperVisualRefresh(visualSeq);
        finalizeInitialWallpaper();
      };
      waitForWallpaperImageReady(imageUrl).then(applyReadyWallpaper);
    }

    function applyResolvedNewtabWallpaper(options) {
      const mode = getResolvedWallpaperMode();
      applyNewtabWallpaper(getEffectiveWallpaperIdForMode(mode), Object.assign({}, options || {}, { mode }));
    }

    function applyStoredWallpaperState(syncedValue, localValue) {
      const syncedResolution = resolveSyncedWallpaperValue(syncedValue.value, syncedValue.hasValue);
      const localResolution = resolveLocalWallpaperOverride(localValue.value, localValue.hasValue);
      const migrated = applyLocalWallpaperMigrations(
        localResolution.overrides,
        syncedResolution.localMigrations
      );
      setWallpaperPrefs(syncedResolution.prefs, migrated.overrides);
      hasStoredWallpaperStateLoaded = true;
      activeWallpaperMode = currentWallpaperPrefs.sameForModes
        ? getResolvedWallpaperMode()
        : normalizeWallpaperMode(activeWallpaperMode);
      const didSyncWallpaperEffects = synchronizeWallpaperEffectPrefsWithWallpaperModes();
      applyWallpaperEffectForResolvedMode();
      applyResolvedNewtabWallpaper();
      syncWallpaperSourceTabToEditMode();
      updateWallpaperModeControlsUi({ animate: false });
      updateWallpaperSelectionUi();
      if (syncedResolution.sanitizedValue !== null) {
        writeSyncedWallpaperValue(syncedResolution.sanitizedValue);
      }
      if (localResolution.shouldClear || migrated.changed) {
        writeLocalWallpaperValue(buildLocalWallpaperStorageValue(
          currentLocalWallpaperOverrides,
          currentWallpaperPrefs.sameForModes
        ));
      }
      if (didSyncWallpaperEffects && storageArea) {
        storageArea.set({
          [NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]: getWallpaperEffectStorageValue()
        });
      }
    }

    function loadStoredWallpaperState() {
      return Promise.all([
        readStorageValue(storageArea, NEWTAB_WALLPAPER_STORAGE_KEY),
        readStorageValue(localWallpaperStorageArea, NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY)
      ]).then((results) => {
        applyStoredWallpaperState(results[0], results[1]);
      });
    }

    function bootstrapInitialWallpaper() {
      if (hasWallpaperBootstrapStarted) {
        return initialWallpaperReadyPromise;
      }
      hasWallpaperBootstrapStarted = true;
      const customWallpapersPromise = loadCustomWallpapers();
      customWallpapersPromise.then(() => {
        return loadStoredWallpaperState();
      });
      return initialWallpaperReadyPromise;
    }

    function normalizeWallpaperRestoreId(mode) {
      const normalizedMode = normalizeWallpaperMode(mode);
      return normalizeNewtabWallpaperId(lastActiveWallpaperIdsByMode[normalizedMode]) ||
        normalizeNewtabWallpaperId(lastActiveWallpaperId) ||
        NEWTAB_WALLPAPER_DEFAULT_ID;
    }

    function persistWallpaperEnabled(enabled) {
      const prefs = getWritableWallpaperPrefs();
      const overrides = getWritableLocalWallpaperOverrides();
      if (enabled) {
        NEWTAB_WALLPAPER_MODES.forEach((mode) => {
          if (getEffectiveWallpaperIdForMode(mode)) {
            return;
          }
          overrides[mode] = null;
          prefs[mode] = normalizeWallpaperRestoreId(mode);
        });
        if (prefs.sameForModes) {
          const sharedId = prefs.light || prefs.dark || normalizeWallpaperRestoreId(getResolvedWallpaperMode());
          prefs.light = sharedId;
          prefs.dark = sharedId;
          overrides.dark = overrides.light;
        }
        setWallpaperPrefs(prefs, overrides);
        applyResolvedNewtabWallpaper();
        syncWallpaperSourceTabToEditMode();
        updateWallpaperModeControlsUi();
        updateWallpaperSelectionUi();
        writeCurrentWallpaperPrefs({ showError: true });
        return;
      }
      NEWTAB_WALLPAPER_MODES.forEach((mode) => {
        const activeId = getEffectiveWallpaperIdForMode(mode);
        if (activeId) {
          rememberActiveWallpaperId(mode, activeId);
        }
        if (activeId && isCustomWallpaperId(activeId)) {
          overrides[mode] = NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE;
          return;
        }
        overrides[mode] = null;
        prefs[mode] = '';
      });
      if (prefs.sameForModes) {
        prefs.dark = prefs.light;
        overrides.dark = overrides.light;
      }
      setWallpaperPrefs(prefs, overrides);
      applyResolvedNewtabWallpaper();
      syncWallpaperSourceTabToEditMode();
      updateWallpaperModeControlsUi();
      updateWallpaperSelectionUi();
      writeCurrentWallpaperPrefs({ showError: true });
    }

    function persistWallpaperModeConsistency(sameForModes) {
      const nextSameForModes = sameForModes !== false;
      const prefs = getWritableWallpaperPrefs();
      const overrides = getWritableLocalWallpaperOverrides();
      if (prefs.sameForModes === nextSameForModes) {
        updateWallpaperModeControlsUi();
        return;
      }
      if (!nextSameForModes) {
        const sharedEffectPrefs = getWallpaperEffectPrefsForEditMode();
        const modeOrder = getWallpaperModePreferenceOrder();
        const sharedId = hasAnyWallpaperEnabled()
          ? getFirstEnabledWallpaperIdForModes(modeOrder)
          : '';
        const sharedOverride = getCopyableWallpaperLocalOverrideForId(modeOrder, sharedId);
        prefs.sameForModes = false;
        prefs.light = sharedOverride
          ? (prefs.light || NEWTAB_WALLPAPER_DEFAULT_ID)
          : sharedId;
        prefs.dark = prefs.light;
        if (sharedOverride) {
          overrides.light = sharedOverride;
          overrides.dark = sharedOverride;
        } else {
          overrides.light = null;
          overrides.dark = null;
        }
        activeWallpaperMode = getResolvedWallpaperMode();
        setSharedWallpaperEffectPrefs(sharedEffectPrefs);
      } else {
        const sharedMode = getWallpaperEditMode();
        const sharedEffectPrefs = getWallpaperEffectPrefsForMode(sharedMode);
        const sharedId = getEffectiveWallpaperIdForMode(sharedMode);
        const sharedOverride = getWallpaperLocalOverrideForMode(sharedMode);
        prefs.sameForModes = true;
        prefs.light = sharedOverride && isCustomWallpaperId(sharedOverride)
          ? (prefs[sharedMode] || NEWTAB_WALLPAPER_DEFAULT_ID)
          : sharedId;
        prefs.dark = prefs.light;
        overrides.light = sharedOverride || null;
        overrides.dark = overrides.light;
        activeWallpaperMode = getResolvedWallpaperMode();
        setSharedWallpaperEffectPrefs(sharedEffectPrefs);
      }
      setWallpaperPrefs(prefs, overrides);
      applyWallpaperEffectForResolvedMode();
      applyResolvedNewtabWallpaper();
      syncWallpaperSourceTabToEditMode();
      updateWallpaperModeControlsUi();
      updateWallpaperSelectionUi();
      writeCurrentWallpaperPrefs({ showError: true });
      if (storageArea) {
        storageArea.set({
          [NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]: getWallpaperEffectStorageValue()
        });
      }
    }

    function persistNewtabWallpaper(id) {
      const nextId = normalizeNewtabWallpaperId(id);
      const prefs = getWritableWallpaperPrefs();
      const overrides = getWritableLocalWallpaperOverrides();
      const targetModes = prefs.sameForModes
        ? NEWTAB_WALLPAPER_MODES.slice()
        : [getWallpaperEditMode()];
      targetModes.forEach((mode) => {
        if (nextId && isCustomWallpaperId(nextId)) {
          overrides[mode] = nextId;
          rememberActiveWallpaperId(mode, nextId);
          return;
        }
        overrides[mode] = null;
        prefs[mode] = nextId;
        if (nextId) {
          rememberActiveWallpaperId(mode, nextId);
        }
      });
      if (prefs.sameForModes) {
        prefs.dark = prefs.light;
        overrides.dark = overrides.light;
      }
      setWallpaperPrefs(prefs, overrides);
      applyResolvedNewtabWallpaper();
      updateWallpaperSelectionUi();
      updateWallpaperModeControlsUi({ animate: false });
      if (nextId && isCustomWallpaperId(nextId)) {
        writeLocalWallpaperValue(
          buildLocalWallpaperStorageValue(currentLocalWallpaperOverrides, currentWallpaperPrefs.sameForModes),
          { showError: true }
        );
        return;
      }
      writeCurrentWallpaperPrefs({ showError: true });
    }

    function canShowCustomWallpaperTooltip(target) {
      return Boolean(target &&
        target.isConnected &&
        !customWallpaperImporting &&
        target.getAttribute('data-loading') !== 'true');
    }

    function showCustomWallpaperTooltip(target) {
      if (!canShowCustomWallpaperTooltip(target)) {
        hideCustomWallpaperTooltip();
        return;
      }
      showTopActionTooltip(target, t('newtab_wallpaper_add_local', 'Add local wallpaper'));
    }

    function hideCustomWallpaperTooltip() {
      hideTopActionTooltip();
    }

    function openCustomWallpaperPicker() {
      if (customWallpaperInput && !customWallpaperImporting) {
        hideCustomWallpaperTooltip();
        customWallpaperInput.click();
      }
    }

    function bindCustomWallpaperUploadTile(tile) {
      if (!tile) {
        return;
      }
      tile.addEventListener('click', openCustomWallpaperPicker);
      tile.addEventListener('keydown', (event) => {
        if (!event || (event.key !== 'Enter' && event.key !== ' ')) {
          return;
        }
        event.preventDefault();
        openCustomWallpaperPicker();
      });
      tile.addEventListener('mouseenter', () => {
        showCustomWallpaperTooltip(tile);
      });
      tile.addEventListener('mouseleave', hideCustomWallpaperTooltip);
      tile.addEventListener('focusin', () => {
        showCustomWallpaperTooltip(tile);
      });
      tile.addEventListener('focusout', (event) => {
        const nextTarget = event && event.relatedTarget ? event.relatedTarget : null;
        if (!nextTarget || !tile.contains(nextTarget)) {
          hideCustomWallpaperTooltip();
        }
      });
    }

    function importCustomWallpaperFile(file) {
      if (!file || customWallpaperImporting) {
        return;
      }
      customWallpaperImporting = true;
      updateCustomWallpaperUploadTile();
      buildCustomWallpaperRecordFromFile(file).then((record) => {
        return writeCustomWallpaperRecord(record).then(() => record);
      }).then((record) => {
        const nextWallpaper = normalizeCustomWallpaperRecord(record);
        if (!nextWallpaper) {
          throw new Error('Invalid wallpaper record.');
        }
        return prepareCustomWallpaperObjectUrl(nextWallpaper).then(() => nextWallpaper);
      }).then((nextWallpaper) => {
        customWallpapers = customWallpapers.concat(nextWallpaper);
        persistNewtabWallpaper(nextWallpaper.id);
        renderCustomWallpaperTiles();
        showToast(t('newtab_wallpaper_import_done', 'Wallpaper imported'), false);
      }).catch(() => {
        showToast(t('newtab_wallpaper_import_error', 'Failed to import wallpaper'), true);
      }).finally(() => {
        customWallpaperImporting = false;
        if (customWallpaperInput) {
          customWallpaperInput.value = '';
        }
        updateCustomWallpaperUploadTile();
      });
    }

    function deleteCustomWallpaper(id) {
      const targetWallpaper = getCustomWallpaperById(id);
      if (!targetWallpaper || customWallpaperImporting) {
        return;
      }
      hideTopActionTooltip();
      deleteCustomWallpaperRecord(targetWallpaper).then(() => {
        revokeCustomWallpaperObjectUrl(targetWallpaper.id);
        customWallpapers = customWallpapers.filter((item) => item && item.id !== targetWallpaper.id);
        renderCustomWallpaperTiles();
        const overrides = getWritableLocalWallpaperOverrides();
        let changed = false;
        NEWTAB_WALLPAPER_MODES.forEach((mode) => {
          if (overrides[mode] !== targetWallpaper.id) {
            return;
          }
          overrides[mode] = NEWTAB_LOCAL_WALLPAPER_DISABLED_VALUE;
          changed = true;
        });
        if (changed) {
          setWallpaperPrefs(currentWallpaperPrefs, overrides);
          applyResolvedNewtabWallpaper();
          updateWallpaperSelectionUi();
          writeLocalWallpaperValue(buildLocalWallpaperStorageValue(
            currentLocalWallpaperOverrides,
            currentWallpaperPrefs.sameForModes
          ), { showError: true });
        } else {
          updateWallpaperSelectionUi();
        }
        showToast(t('newtab_wallpaper_delete_done', 'Deleted'), false);
      }).catch(() => {
        showToast(t('newtab_wallpaper_delete_error', 'Failed to delete wallpaper'), true);
      });
    }

    function isWallpaperPanelOpen() {
      return Boolean(wallpaperPanel && wallpaperPanel.getAttribute('data-open') === 'true');
    }

    function setWallpaperPanelOpenState(open) {
      if (!document.body) {
        return;
      }
      if (open) {
        document.body.setAttribute('data-wallpaper-panel-open', 'true');
        return;
      }
      document.body.removeAttribute('data-wallpaper-panel-open');
    }

    function getWallpaperAppearanceModeLabel(mode) {
      if (mode === 'light') {
        return t('settings_theme_light', 'Light');
      }
      if (mode === 'dark') {
        return t('settings_theme_dark', 'Dark');
      }
      if (getThemeScope() === 'home') {
        return t('newtab_theme_follow_global', 'Follow "Global"');
      }
      return t('settings_theme_system', 'Auto');
    }

    function updateWallpaperAppearanceModeLabels() {
      if (wallpaperAppearanceModeLabelsHeld) {
        return;
      }
      if (!wallpaperAppearanceOptions) {
        return;
      }
      getWallpaperAppearanceOptionButtons().forEach((button) => {
        const mode = button.getAttribute('data-theme-mode') || 'system';
        const modeLabel = getWallpaperAppearanceModeLabel(mode);
        button.setAttribute('aria-label', formatMessage('mode_switch_title', '{name}: switch to {mode} mode', {
          name: 'Lumno',
          mode: modeLabel
        }));
        const label = button.querySelector('.x-nt-appearance-label');
        if (label) {
          label.textContent = modeLabel;
        }
      });
    }

    function clearWallpaperAppearanceScopeAnimation(options) {
      wallpaperAppearanceAnimationTimers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      wallpaperAppearanceAnimationTimers = [];
      if (!options || options.releaseLabels !== false) {
        wallpaperAppearanceModeLabelsHeld = false;
      }
      getWallpaperAppearanceOptionButtons().forEach((button) => {
        const motionElement = getWallpaperAppearanceOptionMotionElement(button);
        if (!motionElement) {
          return;
        }
        motionElement.style.removeProperty('transition');
        motionElement.style.removeProperty('transform');
        motionElement.style.removeProperty('opacity');
        motionElement.style.removeProperty('filter');
        motionElement.style.removeProperty('will-change');
      });
      if (wallpaperAppearanceOptions) {
        wallpaperAppearanceOptions.removeAttribute('data-scope-animating');
      }
    }

    function shouldReduceMotion() {
      return Boolean(window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function playWallpaperEnterMotion(element, state) {
      if (!element) {
        return;
      }
      const nextState = state || 'enter';
      if (shouldReduceMotion()) {
        element.removeAttribute('data-motion');
        return;
      }
      element.setAttribute('data-motion', nextState);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (element.getAttribute('data-motion') === nextState) {
            element.removeAttribute('data-motion');
          }
        });
      });
    }

    function getWallpaperGridForTab(tab) {
      return tab === 'local' ? wallpaperLocalGrid : wallpaperBuiltInGrid;
    }

    function getAppearanceScopeDirection(scope) {
      return scope === 'home' ? 1 : -1;
    }

    function getAppearanceOptionDelay(index, count, direction) {
      const visualIndex = direction > 0 ? (count - 1 - index) : index;
      return Math.max(0, visualIndex * 20);
    }

    function animateWallpaperAppearanceScopeChange(previousScope, nextScope) {
      const targetScope = nextScope === 'home' ? 'home' : 'global';
      const sourceScope = previousScope === 'home' ? 'home' : 'global';
      const buttons = getWallpaperAppearanceOptionButtons();
      clearWallpaperAppearanceScopeAnimation();
      if (!buttons.length || sourceScope === targetScope || shouldReduceMotion()) {
        setThemeScope(targetScope);
        updateWallpaperAppearanceSelectionUi();
        updateWallpaperAppearanceModeLabels();
        return;
      }
      const direction = getAppearanceScopeDirection(targetScope);
      const offsetPx = 24;
      const durationMs = 220;
      const fadeBlurDurationMs = 140;
      const handoffOverlapMs = 70;
      const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
      wallpaperAppearanceModeLabelsHeld = true;
      if (wallpaperAppearanceOptions) {
        wallpaperAppearanceOptions.setAttribute('data-scope-animating', 'true');
      }
      updateWallpaperAppearanceScopeTabsUi(targetScope);

      let maxOutDelay = 0;
      buttons.forEach((button, index) => {
        const motionElement = getWallpaperAppearanceOptionMotionElement(button);
        if (!motionElement) {
          return;
        }
        const delay = getAppearanceOptionDelay(index, buttons.length, direction);
        maxOutDelay = Math.max(maxOutDelay, delay);
        motionElement.style.setProperty('will-change', 'transform, opacity, filter');
        motionElement.style.setProperty(
          'transition',
          `transform ${durationMs}ms ${easing} ${delay}ms, opacity ${fadeBlurDurationMs}ms ${easing} ${delay}ms, filter ${fadeBlurDurationMs}ms ${easing} ${delay}ms`
        );
        motionElement.style.setProperty('opacity', '0');
        motionElement.style.setProperty('filter', 'blur(3px)');
        motionElement.style.setProperty('transform', `translate3d(${direction * -offsetPx}px, 0, 0)`);
      });

      const handoffDelayMs = Math.max(0, durationMs + maxOutDelay - handoffOverlapMs);
      const handoffTimer = window.setTimeout(() => {
        wallpaperAppearanceAnimationTimers = wallpaperAppearanceAnimationTimers.filter((timerId) => timerId !== handoffTimer);
        setThemeScope(targetScope);
        wallpaperAppearanceModeLabelsHeld = false;
        updateWallpaperAppearanceSelectionUi();
        updateWallpaperAppearanceModeLabels();
        buttons.forEach((button) => {
          const motionElement = getWallpaperAppearanceOptionMotionElement(button);
          if (!motionElement) {
            return;
          }
          motionElement.style.setProperty('transition', 'none');
          motionElement.style.setProperty('opacity', '0');
          motionElement.style.setProperty('filter', 'blur(3px)');
          motionElement.style.setProperty('transform', `translate3d(${direction * offsetPx}px, 0, 0)`);
        });
        if (wallpaperAppearanceOptions) {
          void wallpaperAppearanceOptions.offsetHeight;
        }
        let maxInDelay = 0;
        buttons.forEach((button, index) => {
          const motionElement = getWallpaperAppearanceOptionMotionElement(button);
          if (!motionElement) {
            return;
          }
          const delay = getAppearanceOptionDelay(index, buttons.length, direction);
          maxInDelay = Math.max(maxInDelay, delay);
          motionElement.style.setProperty(
            'transition',
            `transform ${durationMs}ms ${easing} ${delay}ms, opacity ${fadeBlurDurationMs}ms ${easing} ${delay}ms, filter ${fadeBlurDurationMs}ms ${easing} ${delay}ms`
          );
          motionElement.style.setProperty('opacity', '1');
          motionElement.style.setProperty('filter', 'blur(0px)');
          motionElement.style.setProperty('transform', 'translate3d(0, 0, 0)');
        });
        const cleanupTimer = window.setTimeout(() => {
          wallpaperAppearanceAnimationTimers = wallpaperAppearanceAnimationTimers.filter((timerId) => timerId !== cleanupTimer);
          clearWallpaperAppearanceScopeAnimation();
          updateWallpaperAppearanceSelectionUi();
          updateWallpaperAppearanceModeLabels();
        }, durationMs + maxInDelay + 24);
        wallpaperAppearanceAnimationTimers.push(cleanupTimer);
      }, handoffDelayMs);
      wallpaperAppearanceAnimationTimers.push(handoffTimer);
    }

    function getWallpaperButtonLabel() {
      return t('settings_tab_appearance', 'Appearance');
    }

    function updateWallpaperButtonLanguageStrings() {
      if (wallpaperButton) {
        const label = getWallpaperButtonLabel();
        wallpaperButton.setAttribute('aria-label', label);
        wallpaperButton.removeAttribute('title');
      }
    }

    function updateWallpaperAppearanceLanguageStrings() {
      if (wallpaperAppearanceTitle) {
        wallpaperAppearanceTitle.textContent = t('settings_tab_appearance', 'Appearance');
      }
      if (wallpaperAppearanceMoreSettingsLink) {
        const label = t('newtab_more_settings', 'More settings');
        wallpaperAppearanceMoreSettingsLink.setAttribute('aria-label', label);
        wallpaperAppearanceMoreSettingsLink.setAttribute('href', buildAppearanceSettingsUrl());
        if (wallpaperAppearanceMoreSettingsText) {
          wallpaperAppearanceMoreSettingsText.textContent = label;
        }
      }
      if (wallpaperAppearanceInfoButton) {
        wallpaperAppearanceInfoButton.setAttribute(
          'aria-label',
          t('newtab_theme_scope_help_label', 'Theme scope info')
        );
      }
      if (wallpaperAppearanceScopeTabs) {
        wallpaperAppearanceScopeTabs.setAttribute('aria-label', t('newtab_theme_scope_label', 'Theme scope'));
        wallpaperAppearanceScopeTabs.querySelectorAll('.x-nt-appearance-scope-tab').forEach((button) => {
          const scope = button.getAttribute('data-theme-scope') === 'home' ? 'home' : 'global';
          const label = scope === 'home'
            ? t('newtab_theme_scope_home', 'New Tab')
            : t('newtab_theme_scope_global', 'Global');
          button.textContent = label;
          button.setAttribute('aria-label', formatMessage(
            'newtab_theme_scope_select_label',
            'Apply theme changes to {scope}',
            { scope: label }
          ));
        });
      }
    }

    function updateWallpaperSectionLanguageStrings() {
      if (wallpaperPanelTitle) {
        const title = t('newtab_wallpaper_title', 'Wallpaper');
        wallpaperPanelTitle.textContent = title;
        if (wallpaperPanel) {
          wallpaperPanel.setAttribute('aria-label', t('settings_tab_appearance', 'Appearance'));
        }
      }
      if (wallpaperTabs) {
        wallpaperTabs.setAttribute('aria-label', t('newtab_wallpaper_title', 'Wallpaper'));
      }
      if (wallpaperBuiltInTab) {
        const label = t('newtab_wallpaper_builtin_section', 'Built-in');
        wallpaperBuiltInTab.textContent = label;
        wallpaperBuiltInTab.setAttribute('aria-label', label);
      }
      if (wallpaperBuiltInGrid) {
        wallpaperBuiltInGrid.setAttribute('aria-label', t('newtab_wallpaper_builtin_section', 'Built-in'));
      }
      if (wallpaperLocalTab) {
        const label = t('newtab_wallpaper_local_section', 'Local');
        wallpaperLocalTab.textContent = label;
        wallpaperLocalTab.setAttribute('aria-label', label);
      }
      if (wallpaperLocalGrid) {
        wallpaperLocalGrid.setAttribute('aria-label', t('newtab_wallpaper_local_section', 'Local'));
      }
      if (topContentTitle) {
        topContentTitle.textContent = t('settings_newtab_wordmark_title', 'Content above the search bar');
      }
      if (topContentTabs) {
        topContentTabs.setAttribute('aria-label', t('settings_newtab_wordmark_title', 'Content above the search bar'));
      }
      if (topContentBrandTab) {
        const label = t('newtab_top_content_brand', 'Brand');
        topContentBrandTab.textContent = label;
        topContentBrandTab.setAttribute('aria-label', label);
      }
      if (topContentTimeTab) {
        const label = t('newtab_top_content_time', 'Time');
        topContentTimeTab.textContent = label;
        topContentTimeTab.setAttribute('aria-label', label);
      }
      if (topContentOffTab) {
        const label = t('newtab_top_content_off', 'Hide');
        topContentOffTab.textContent = label;
        topContentOffTab.setAttribute('aria-label', label);
      }
      scheduleTopContentTabsIndicatorRefresh();
      updateWallpaperModeControlsUi({ animate: false });
    }

    function updateWallpaperScaleLanguageStrings() {
      if (wallpaperPanel) {
        wallpaperPanel.querySelectorAll('[data-overlay-tick="transparent"]').forEach((tick) => {
          tick.textContent = t('newtab_wallpaper_overlay_transparent_tick', 'Transparent');
        });
        wallpaperPanel.querySelectorAll('[data-overlay-tick="default"]').forEach((tick) => {
          tick.textContent = t('newtab_wallpaper_overlay_default_tick', 'Default');
        });
        wallpaperPanel.querySelectorAll('[data-overlay-tick="cover"]').forEach((tick) => {
          tick.textContent = t('newtab_wallpaper_overlay_cover_tick', 'Cover');
        });
      }
    }

    function updateWallpaperTileLanguageStrings() {
      const tileContainers = getWallpaperTileContainers();
      if (tileContainers.length === 0) {
        return;
      }
      tileContainers.forEach((container) => {
        container.querySelectorAll('.x-nt-wallpaper-delete-button').forEach((button) => {
          button.setAttribute('aria-label', t('newtab_wallpaper_delete_local', 'Delete imported wallpaper'));
        });
        container.querySelectorAll('.x-nt-wallpaper-tile').forEach((tile) => {
          const wallpaperId = tile.getAttribute('data-wallpaper-id');
          const item = getWallpaperById(wallpaperId);
          if (!item) {
            return;
          }
          tile.setAttribute('aria-label', formatMessage('newtab_wallpaper_select_label', 'Select {name}', {
            name: getWallpaperDisplayName(item)
          }));
        });
      });
    }

    function updateWallpaperLanguageStrings() {
      updateWallpaperButtonLanguageStrings();
      updateWallpaperAppearanceLanguageStrings();
      updateWallpaperOverlayControlUi();
      updateWallpaperEffectControlUi();
      updateCustomWallpaperUploadTile();
      updateWallpaperSectionLanguageStrings();
      updateTopContentModeUi();
      updateNewtabFaviconSelectionUi();
      updateWallpaperAppearanceModeLabels();
      updateWallpaperScaleLanguageStrings();
      updateWallpaperTileLanguageStrings();
    }

    function buildAppearanceSettingsUrl() {
      if (extensionRoutes && typeof extensionRoutes.buildOptionsUrl === 'function') {
        return extensionRoutes.buildOptionsUrl(chrome, 'appearance');
      }
      if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
        return `${chrome.runtime.getURL('src/options/options.html')}#appearance`;
      }
      try {
        return new URL('../options/options.html#appearance', window.location.href).toString();
      } catch (e) {
        return '../options/options.html#appearance';
      }
    }

    function createReactWallpaperViewModel() {
      const searchWidthTicks = [];
      const min = getSearchWidthMin();
      if (min < 720) {
        searchWidthTicks.push({
          searchKey: 'min',
          align: 'start',
          label: '',
          percent: getSearchWidthPercent(min)
        });
      }
      [
        { searchKey: 'standard', value: 720, label: 'Standard' },
        { searchKey: 'wide', value: 920, label: 'Wide' },
        { searchKey: 'max', value: 1040, label: 'Max', align: 'end' }
      ].forEach((tick) => {
        searchWidthTicks.push({
          searchKey: tick.searchKey,
          align: tick.align,
          label: tick.label,
          percent: getSearchWidthPercent(tick.value)
        });
      });
      const faviconInlineSvg = [
        '<svg viewBox="0 0 104 104" fill="none" xmlns="http://www.w3.org/2000/svg">',
        `<path opacity="var(--x-nt-favicon-shadow-opacity, 0.2)" d="${NEWTAB_FAVICON_SVG_SHADOW_PATH}" fill="currentColor"/>`,
        `<path d="${NEWTAB_FAVICON_SVG_MAIN_PATH}" fill="currentColor" fill-opacity="var(--x-nt-favicon-main-opacity, 0.5)"/>`,
        '</svg>'
      ].join('');
      return {
        activeTab: activeWallpaperTab,
        appearanceOptions: [
          { mode: 'system', imageUrl: getRuntimeAssetUrl('assets/images/system.svg') },
          { mode: 'light', imageUrl: getRuntimeAssetUrl('assets/images/light.svg') },
          { mode: 'dark', imageUrl: getRuntimeAssetUrl('assets/images/dark.svg') }
        ],
        effectTypes: NEWTAB_WALLPAPER_EFFECT_TYPES,
        favicons: NEWTAB_FAVICON_OPTIONS.map((item) => ({
          id: item.id,
          inlineSvg: item.preview === 'inlineSvg' ? faviconInlineSvg : '',
          previewUrl: item.preview === 'inlineSvg' ? '' : getNewtabFaviconUrl(item)
        })),
        icons: {
          add: getRiSvg('ri-add-large-line', 'ri-size-18'),
          arrow: getRiSvg('ri-arrow-right-s-line', 'ri-size-14'),
          check: getRiSvg('ri-check-line', 'ri-size-16'),
          delete: getRiSvg('ri-subtract-line', 'ri-size-14'),
          help: getRiSvg('ri-question-line', 'ri-size-14'),
          wallpaper: getRiSvg('ri-t-shirt-2-line', 'ri-size-20')
        },
        moreSettingsUrl: buildAppearanceSettingsUrl(),
        topContentOptions: [
          { value: 'brand', label: t('newtab_top_content_brand', 'Brand') },
          { value: 'time', label: t('newtab_top_content_time', 'Time') },
          { value: 'off', label: t('newtab_top_content_off', 'Hide') }
        ],
        searchWidth: {
          min: getSearchWidthMin(),
          max: getSearchWidthMax(),
          ticks: searchWidthTicks
        },
        wallpapers: NEWTAB_WALLPAPER_OPTIONS.map((item) => ({
          id: item.id,
          path: getWallpaperLocalPath(item),
          thumbnailUrl: getWallpaperThumbnailUrl(item)
        }))
      };
    }

    function assignReactWallpaperViewRefs() {
      if (!wallpaperViewController) {
        return null;
      }
      const refs = wallpaperViewController.getRefs();
      wallpaperPanelHeader = refs.panelHeader;
      wallpaperPanelTitle = refs.panelTitle;
      wallpaperEnabledToggle = refs.enabledToggle;
      topContentTitle = refs.topContentTitle;
      topContentTabs = refs.topContentTabs;
      topContentTabsIndicator = refs.topContentTabsIndicator;
      topContentBrandTab = refs.topContentBrandTab;
      topContentTimeTab = refs.topContentTimeTab;
      topContentOffTab = refs.topContentOffTab;
      wallpaperAppearanceTitle = refs.appearanceTitle;
      wallpaperAppearanceInfoButton = refs.appearanceInfoButton;
      wallpaperAppearanceScopeTabs = refs.appearanceScopeTabs;
      wallpaperAppearanceOptions = refs.appearanceOptions;
      wallpaperSearchWidthControl = refs.searchWidthControl;
      wallpaperSearchWidthLabel = refs.searchWidthLabel;
      wallpaperSearchWidthValue = refs.searchWidthValue;
      wallpaperSearchWidthSlider = refs.searchWidthSlider;
      wallpaperAppearanceMoreSettingsLink = refs.moreSettingsLink;
      wallpaperAppearanceMoreSettingsText = refs.moreSettingsText;
      wallpaperOverlayLabel = refs.overlayLabel;
      wallpaperOverlaySlider = refs.overlaySlider;
      wallpaperEffectLabel = refs.effectLabel;
      wallpaperEffectOptions = refs.effectOptions;
      wallpaperEffectTabsIndicator = refs.effectTabsIndicator;
      wallpaperEffectStrengthControl = refs.effectStrengthControl;
      wallpaperEffectStrengthLabel = refs.effectStrengthLabel;
      wallpaperEffectSlider = refs.effectStrengthSlider;
      wallpaperEffectSizeControl = refs.effectSizeControl;
      wallpaperEffectSizeLabel = refs.effectSizeLabel;
      wallpaperEffectSizeSlider = refs.effectSizeSlider;
      wallpaperEffectSpacingControl = refs.effectSpacingControl;
      wallpaperEffectSpacingLabel = refs.effectSpacingLabel;
      wallpaperEffectSpacingSlider = refs.effectSpacingSlider;
      newtabFaviconTitle = refs.faviconTitle;
      newtabFaviconOptions = refs.faviconOptions;
      customWallpaperUploadTile = refs.uploadTile;
      customWallpaperInput = refs.customInput;
      wallpaperBody = refs.body;
      wallpaperBuiltInGrid = refs.builtInGrid;
      wallpaperLocalGrid = refs.localGrid;
      wallpaperModeSyncTitle = refs.modeSyncTitle;
      wallpaperModeSyncToggle = refs.modeSyncToggle;
      wallpaperModeTabs = refs.modeTabs;
      wallpaperModeTabsIndicator = refs.modeTabsIndicator;
      wallpaperLightModeTab = refs.lightModeTab;
      wallpaperDarkModeTab = refs.darkModeTab;
      wallpaperModeHint = refs.modeHint;
      wallpaperTabs = refs.tabs;
      wallpaperTabsIndicator = refs.tabsIndicator;
      wallpaperBuiltInTab = refs.builtInTab;
      wallpaperLocalTab = refs.localTab;
      return refs;
    }

    function bindReactWallpaperSlider(slider, getFallbackValue, persist) {
      if (!slider) {
        return;
      }
      slider.addEventListener('pointerdown', () => {
        setWallpaperActiveSlider(slider);
      });
      slider.addEventListener('pointerup', () => {
        clearWallpaperActiveSlider(slider);
      });
      slider.addEventListener('pointercancel', () => {
        clearWallpaperActiveSlider(slider);
      });
      slider.addEventListener('blur', () => {
        clearWallpaperActiveSlider(slider);
      });
      slider.addEventListener('input', () => {
        const fallbackValue = typeof getFallbackValue === 'function'
          ? getFallbackValue()
          : Number(slider.value);
        const value = wallpaperActiveSlider === slider
          ? snapWallpaperOverlaySliderValue(slider.value)
          : normalizeWallpaperOverlayOpacity(slider.value, fallbackValue);
        if (String(value) !== slider.value) {
          slider.value = String(value);
        }
        persist(value);
      });
      bindWallpaperSliderValueBubble(slider);
    }

    function bindReactWallpaperPanel() {
      if (wallpaperReactPanelBound || !wallpaperPanel) {
        return;
      }
      wallpaperReactPanelBound = true;
      wallpaperPanel.addEventListener('scroll', () => {
        hideWallpaperSliderValueBubble(null, { force: true });
      }, { passive: true });
      const showAppearanceHelp = () => {
        showTopActionTooltip(
          wallpaperAppearanceInfoButton,
          t(
            'newtab_theme_scope_help',
            '"Global" sets the default theme. "New Tab" overrides only the new tab page; choose "Follow Global" there to inherit the global setting.'
          )
        );
      };
      wallpaperAppearanceInfoButton.addEventListener('mouseenter', showAppearanceHelp);
      wallpaperAppearanceInfoButton.addEventListener('mouseleave', hideTopActionTooltip);
      wallpaperAppearanceInfoButton.addEventListener('focus', showAppearanceHelp);
      wallpaperAppearanceInfoButton.addEventListener('blur', hideTopActionTooltip);
      wallpaperAppearanceScopeTabs.querySelectorAll('[data-theme-scope]').forEach((button) => {
        button.addEventListener('click', () => {
          animateWallpaperAppearanceScopeChange(
            getThemeScope(),
            button.getAttribute('data-theme-scope')
          );
        });
      });
      wallpaperAppearanceOptions.querySelectorAll('[data-theme-mode]').forEach((button) => {
        button.addEventListener('click', () => {
          setThemeMode(button.getAttribute('data-theme-mode'));
        });
      });
      wallpaperAppearanceMoreSettingsLink.addEventListener('click', () => {
        wallpaperAppearanceMoreSettingsLink.setAttribute('href', buildAppearanceSettingsUrl());
      });
      wallpaperSearchWidthSlider.addEventListener('input', () => {
        persistSearchWidthFromSlider(wallpaperSearchWidthSlider.value, { final: false });
      });
      wallpaperSearchWidthSlider.addEventListener('change', () => {
        persistSearchWidthFromSlider(wallpaperSearchWidthSlider.value, { final: true });
      });
      bindWallpaperSliderValueBubble(wallpaperSearchWidthSlider);
      wallpaperEnabledToggle.addEventListener('change', () => {
        persistWallpaperEnabled(wallpaperEnabledToggle.checked);
      });
      customWallpaperInput.addEventListener('change', (event) => {
        const file = event && event.target && event.target.files
          ? event.target.files[0]
          : null;
        importCustomWallpaperFile(file);
      });
      wallpaperModeSyncToggle.addEventListener('change', () => {
        persistWallpaperModeConsistency(wallpaperModeSyncToggle.checked);
      });
      wallpaperLightModeTab.addEventListener('click', () => {
        setWallpaperActiveMode(NEWTAB_WALLPAPER_MODE_LIGHT);
      });
      wallpaperDarkModeTab.addEventListener('click', () => {
        setWallpaperActiveMode(NEWTAB_WALLPAPER_MODE_DARK);
      });
      wallpaperBuiltInTab.addEventListener('click', () => {
        setWallpaperActiveTab('built-in');
      });
      wallpaperLocalTab.addEventListener('click', () => {
        setWallpaperActiveTab('local');
      });
      bindCustomWallpaperUploadTile(customWallpaperUploadTile);
      wallpaperBuiltInGrid.querySelectorAll('[data-wallpaper-id]').forEach((tile) => {
        tile.addEventListener('click', () => {
          persistNewtabWallpaper(tile.getAttribute('data-wallpaper-id'));
        });
      });
      wallpaperEffectOptions.querySelectorAll('[data-wallpaper-effect-type]').forEach((button) => {
        button.addEventListener('click', () => {
          persistWallpaperEffectPrefs({
            type: button.getAttribute('data-wallpaper-effect-type')
          });
        });
      });
      bindReactWallpaperSlider(
        wallpaperOverlaySlider,
        getWallpaperOverlayOpacityForCurrentMode,
        (value) => persistWallpaperOverlayOpacity(getResolvedWallpaperOverlayMode(), value)
      );
      [
        {
          key: 'strength',
          slider: wallpaperEffectSlider
        },
        {
          key: 'size',
          slider: wallpaperEffectSizeSlider
        },
        {
          key: 'spacing',
          slider: wallpaperEffectSpacingSlider
        }
      ].forEach((entry) => {
        bindReactWallpaperSlider(
          entry.slider,
          () => getWallpaperEffectPrefsForEditMode()[entry.key],
          (value) => persistWallpaperEffectPrefs({ [entry.key]: value })
        );
      });
      newtabFaviconOptions.querySelectorAll('[data-newtab-favicon-id]').forEach((tile) => {
        tile.addEventListener('click', () => {
          persistNewtabFavicon(tile.getAttribute('data-newtab-favicon-id'));
        });
      });
      topContentTabs.querySelectorAll('[data-newtab-top-content]').forEach((button) => {
        button.addEventListener('click', () => {
          persistTopContentMode(button.getAttribute('data-newtab-top-content'));
        });
      });
    }

    function renderWallpaperPanel() {
      if (!wallpaperPanel || wallpaperPanelRendered) {
        return;
      }
      wallpaperPanelRendered = true;
      assignReactWallpaperViewRefs();
      bindReactWallpaperPanel();
      renderCustomWallpaperTiles();
      updateWallpaperLanguageStrings();
      syncWallpaperSourceTabToEditMode();
      updateCustomWallpaperUploadTile();
      updateWallpaperSelectionUi();
      updateWallpaperModeControlsUi({ animate: false });
      updateWallpaperAppearanceSelectionUi();
      updateNewtabFaviconSelectionUi();
    }

    function openWallpaperPanel() {
      if (!wallpaperPanel || !wallpaperButton) {
        return;
      }
      renderWallpaperPanel();
      wallpaperPanel.setAttribute('data-open', 'true');
      wallpaperButton.setAttribute('data-open', 'true');
      wallpaperButton.setAttribute('aria-expanded', 'true');
      if (wallpaperControl) {
        wallpaperControl.setAttribute('data-panel-open', 'true');
      }
      setWallpaperPanelOpenState(true);
      scheduleWallpaperPanelOpenTabIndicatorsRefresh();
    }

    function closeWallpaperPanel(options) {
      if (!wallpaperPanel || !wallpaperButton) {
        return;
      }
      cancelWallpaperPanelActiveControls();
      hideWallpaperSliderValueBubble(null, { force: true });
      wallpaperPanel.setAttribute('data-open', 'false');
      wallpaperButton.setAttribute('data-open', 'false');
      wallpaperButton.setAttribute('aria-expanded', 'false');
      if (wallpaperControl) {
        wallpaperControl.setAttribute('data-panel-open', 'false');
      }
      setWallpaperPanelOpenState(false);
      if (options && options.restoreFocus) {
        try {
          wallpaperButton.focus({ preventScroll: true });
        } catch (e) {
          wallpaperButton.focus();
        }
      }
    }

    function toggleWallpaperPanel() {
      if (isWallpaperPanelOpen()) {
        closeWallpaperPanel();
        return;
      }
      openWallpaperPanel();
    }

    function createWallpaperControls() {
      wallpaperViewController = wallpaperView.createController({
        documentObj,
        model: createReactWallpaperViewModel()
      });
      wallpaperControl = wallpaperViewController.control;
      wallpaperButton = wallpaperViewController.button;
      wallpaperPanel = wallpaperViewController.panel;
      wallpaperButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        hideTopActionTooltip();
        toggleWallpaperPanel();
      });
      const showWallpaperButtonTooltip = () => {
        if (isWallpaperPanelOpen()) {
          hideTopActionTooltip();
          return;
        }
        showTopActionTooltip(wallpaperButton, getWallpaperButtonLabel(), {
          placement: 'top'
        });
      };
      wallpaperButton.addEventListener('mouseenter', showWallpaperButtonTooltip);
      wallpaperButton.addEventListener('mouseleave', hideTopActionTooltip);
      wallpaperButton.addEventListener('focus', showWallpaperButtonTooltip);
      wallpaperButton.addEventListener('blur', hideTopActionTooltip);
      window.addEventListener('resize', scheduleWallpaperPanelTabIndicatorsRefresh, { passive: true });
      window.addEventListener('resize', () => {
        hideWallpaperSliderValueBubble(null, { force: true });
      }, { passive: true });
      updateWallpaperLanguageStrings();
      updateWallpaperSelectionUi();
    }

    function handleThemeModeChange() {
      if (!hasStoredWallpaperStateLoaded) {
        return;
      }
      if (currentWallpaperPrefs && (currentWallpaperPrefs.sameForModes || !isWallpaperPanelOpen())) {
        activeWallpaperMode = getResolvedWallpaperMode();
      }
      applyResolvedNewtabWallpaper();
      updateWallpaperOverlayControlUi();
      applyWallpaperEffectForResolvedMode();
      updateWallpaperModeControlsUi({ animate: false });
      syncWallpaperSourceTabToEditMode();
      updateWallpaperSelectionUi();
      scheduleWallpaperPanelTabIndicatorsRefresh();
    }

    function handleStorageChange(changes) {
      if (!changes) {
        return false;
      }
      let handled = false;
      if (changes[NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY]) {
        applyWallpaperOverlayOpacity(changes[NEWTAB_WALLPAPER_OVERLAY_STORAGE_KEY].newValue);
        handled = true;
      }
      const wallpaperStorageChanged = Boolean(
        (NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY && changes[NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY]) ||
        changes[NEWTAB_WALLPAPER_STORAGE_KEY]
      );
      if (wallpaperStorageChanged) {
        const changedValues = [
          changes[NEWTAB_WALLPAPER_STORAGE_KEY] && changes[NEWTAB_WALLPAPER_STORAGE_KEY].newValue,
          NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY &&
            changes[NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY] &&
            changes[NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY].newValue
        ];
        const shouldRefreshCustomWallpapers = changedValues.some((raw) => {
          return shouldWaitForCustomWallpapers(raw) &&
            getWallpaperStorageRawIds(raw).some((id) => !getWallpaperById(id));
        });
        const applyStoredWallpaper = () => {
          loadStoredWallpaperState();
        };
        wallpaperStorageChangeSeq += 1;
        if (shouldRefreshCustomWallpapers) {
          const changeSeq = wallpaperStorageChangeSeq;
          loadCustomWallpapers().then(() => {
            if (changeSeq === wallpaperStorageChangeSeq) {
              applyStoredWallpaper();
            }
          });
        } else {
          applyStoredWallpaper();
        }
        handled = true;
      }
      if (changes[NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]) {
        const raw = changes[NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY].newValue;
        applyWallpaperEffectPrefs(raw);
        const storedPrefs = getWallpaperEffectStorageValue();
        if (storageArea && raw && JSON.stringify(raw) !== JSON.stringify(storedPrefs)) {
          storageArea.set({ [NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]: storedPrefs });
        }
        handled = true;
      }
      if (NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY && changes[NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]) {
        const raw = changes[NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY].newValue;
        const nextValue = normalizeNewtabTopContentMode(raw);
        applyTopContentMode(nextValue);
        if (storageArea && raw !== nextValue) {
          storageArea.set({ [NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]: nextValue });
        }
        handled = true;
      }
      if (NEWTAB_FAVICON_STORAGE_KEY && changes[NEWTAB_FAVICON_STORAGE_KEY]) {
        const raw = changes[NEWTAB_FAVICON_STORAGE_KEY].newValue;
        const nextId = normalizeNewtabFaviconId(raw);
        applyNewtabFavicon(nextId);
        if (storageArea && raw !== nextId) {
          writeStorageValue(storageArea, NEWTAB_FAVICON_STORAGE_KEY, nextId);
        }
        handled = true;
      }
      return handled;
    }

    function getControlElement() {
      return wallpaperControl;
    }

    function containsTarget(target) {
      return Boolean(wallpaperControl && target &&
        (target === wallpaperControl || wallpaperControl.contains(target)));
    }

    return {
      storageKeys,
      createControls: createWallpaperControls,
      getControlElement,
      containsTarget,
      isPanelOpen: isWallpaperPanelOpen,
      closePanel: closeWallpaperPanel,
      updateLanguageStrings: updateWallpaperLanguageStrings,
      updateAppearanceSelectionUi: updateWallpaperAppearanceSelectionUi,
      updateSearchWidthUi: updateWallpaperSearchWidthControlUi,
      updateTopContentModeUi,
      refreshCustomWallpapers: loadCustomWallpapers,
      bootstrapInitialWallpaper,
      bootstrapInitialWallpaperOverlay,
      bootstrapInitialWallpaperEffect,
      bootstrapInitialNewtabFavicon,
      handleStorageChange,
      handleThemeModeChange,
      scheduleAdaptiveToneUpdate: scheduleWallpaperAdaptiveToneUpdate
    };
  }

  globalThis.LumnoNewtabWallpaper = {
    STORAGE_KEYS: DEFAULT_STORAGE_KEYS,
    WALLPAPER_EFFECT_MODE_STORAGE_VERSION,
    normalizeWallpaperEffectStoragePrefs,
    createWallpaperRuntime
  };
})();
