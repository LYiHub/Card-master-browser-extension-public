(function(root) {
  const SEARCH_INPUT_MODE_RUNTIME_VERSION = '2026-08-02-scope-chip-v29';
  if (root.LumnoSearchInputMode &&
      root.LumnoSearchInputMode.runtimeVersion === SEARCH_INPUT_MODE_RUNTIME_VERSION &&
      typeof root.LumnoSearchInputMode.createInputModeController === 'function') {
    return;
  }

  const INPUT_FONT_STACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const DEFAULT_ACCENT_RGB = [59, 130, 246];
  const DEFAULT_PREFIX_GAP = 8;
  const DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION = 700;
  const DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION = 2200;
  const DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET = 24;
  const DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT = 44;
  const DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT = 16;
  const DEFAULT_PREFIX_ICON_POP_DURATION = 180;
  const DEFAULT_PREFIX_ICON_POP_EASING = 'linear';
  const DEFAULT_PREFIX_ICON_EXIT_DURATION = 100;
  const DEFAULT_PREFIX_ICON_EXIT_EASING = 'cubic-bezier(0.4, 0, 1, 1)';
  const DEFAULT_PREFIX_RESIZE_DURATION = 140;
  const DEFAULT_PREFIX_RESIZE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const DEFAULT_PREFIX_ITEM_GAP_PX = 6;
  const DEFAULT_PREFIX_ENTER_DURATION = 180;
  const DEFAULT_PREFIX_ENTER_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const DEFAULT_PREFIX_TRANSITION = 'background-color 140ms ease, color 140ms ease';
  const MIN_PREFIX_TEXT_CONTRAST = 4.5;
  const MODE_MENU_LINE_ICON_PATHS = Object.freeze({
    bookmark: ['M18 7v14l-6-4l-6 4V7a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4'],
    browser: ['M4 8h16M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm4-2v4'],
    history: ['M12 8v4l2 2', 'M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5'],
    star: ['m12 17.75l-6.172 3.245l1.179-6.873l-5-4.867l6.9-1l3.086-6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z']
  });
  const MODE_MENU_PINYIN_FALLBACKS = Object.freeze({
    书: 'shu',
    信: 'xin',
    元: 'yuan',
    众: 'zhong',
    包: 'bao',
    千: 'qian',
    历: 'li',
    号: 'hao',
    天: 'tian',
    常: 'chang',
    已: 'yi',
    开: 'kai',
    微: 'wei',
    打: 'da',
    搜: 'sou',
    掘: 'jue',
    标: 'biao',
    淘: 'tao',
    猫: 'mao',
    用: 'yong',
    百: 'bai',
    知: 'zhi',
    签: 'qian',
    索: 'suo',
    维: 'wei',
    翻: 'fan',
    豆: 'dou',
    金: 'jin',
    问: 'wen',
    页: 'ye',
    度: 'du',
    乎: 'hu',
    瓣: 'ban',
    公: 'gong',
    基: 'ji',
    科: 'ke',
    史: 'shi'
  });

  function getModeMenuLineIconPaths(iconName) {
    return Object.prototype.hasOwnProperty.call(
      MODE_MENU_LINE_ICON_PATHS,
      iconName
    ) ? MODE_MENU_LINE_ICON_PATHS[iconName] : null;
  }

  function noopTranslate(element) {
    return element;
  }

  function getDocument(options) {
    return options.document || root.document;
  }

  function getWindow(options) {
    return options.windowObj || root.window || root;
  }

  function priorityFor(useImportantStyles) {
    return useImportantStyles ? 'important' : '';
  }

  function declaration(property, value, useImportantStyles) {
    return `      ${property}: ${value}${useImportantStyles ? ' !important' : ''};`;
  }

  function cssText(pairs, useImportantStyles) {
    return `\n${pairs.map((pair) => declaration(pair[0], pair[1], useImportantStyles)).join('\n')}\n    `;
  }

  function setStyle(element, property, value, useImportantStyles) {
    if (!element || !element.style) {
      return;
    }
    element.style.setProperty(property, value, priorityFor(useImportantStyles));
  }

  function removeStyle(element, property) {
    if (!element || !element.style) {
      return;
    }
    if (typeof element.style.removeProperty === 'function') {
      element.style.removeProperty(property);
      return;
    }
    if (typeof element.style.setProperty === 'function') {
      element.style.setProperty(property, '');
    }
  }

  function isElementVisible(element) {
    if (!element) {
      return false;
    }
    if (typeof element.getAttribute === 'function') {
      const visibleState = element.getAttribute('data-visible');
      if (visibleState === 'true') {
        return true;
      }
      if (visibleState === 'false') {
        return false;
      }
    }
    return Boolean(
      element.style &&
      element.style.getPropertyValue('display') !== 'none'
    );
  }

  function defaultRgbToCss(rgb) {
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function defaultParseCssColor(color) {
    if (!color || typeof color !== 'string') {
      return null;
    }
    const trimmed = color.trim().toLowerCase();
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        return [r, g, b].every((value) => Number.isFinite(value)) ? [r, g, b] : null;
      }
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return [r, g, b].every((value) => Number.isFinite(value)) ? [r, g, b] : null;
      }
      return null;
    }
    const rgbMatch = trimmed.match(/^rgb\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)$/);
    if (!rgbMatch) {
      return null;
    }
    const rgb = [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
    return rgb.every((value) => Number.isFinite(value)) ? rgb : null;
  }

  function mixRgb(source, target, targetWeight) {
    const weight = Math.min(1, Math.max(0, Number(targetWeight) || 0));
    return [0, 1, 2].map((index) => {
      const sourceValue = Number(source && source[index]);
      const targetValue = Number(target && target[index]);
      const from = Number.isFinite(sourceValue) ? sourceValue : DEFAULT_ACCENT_RGB[index];
      const to = Number.isFinite(targetValue) ? targetValue : from;
      return Math.round(from + ((to - from) * weight));
    });
  }

  function getRelativeLuminance(rgb) {
    const channels = [0, 1, 2].map((index) => {
      const value = Math.min(255, Math.max(0, Number(rgb && rgb[index]) || 0)) / 255;
      return value <= 0.03928
        ? value / 12.92
        : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
  }

  function getContrastRatio(firstRgb, secondRgb) {
    const firstLuminance = getRelativeLuminance(firstRgb);
    const secondLuminance = getRelativeLuminance(secondRgb);
    return (Math.max(firstLuminance, secondLuminance) + 0.05) /
      (Math.min(firstLuminance, secondLuminance) + 0.05);
  }

  function getReadableTextColor(backgroundRgb) {
    const darkText = [17, 24, 39];
    const lightText = [248, 250, 252];
    const darkContrast = getContrastRatio(darkText, backgroundRgb);
    const lightContrast = getContrastRatio(lightText, backgroundRgb);
    return darkContrast >= lightContrast ? '#111827' : '#F8FAFC';
  }

  function getAccessibleThemeColorRgb(accentRgb, backgroundRgb, minimumContrast) {
    const darkTarget = [15, 23, 42];
    const lightTarget = [248, 250, 252];
    const requiredContrast = Number(minimumContrast) || MIN_PREFIX_TEXT_CONTRAST;
    if (getContrastRatio(accentRgb, backgroundRgb) >= requiredContrast) {
      return accentRgb.slice();
    }
    const target = getContrastRatio(darkTarget, backgroundRgb) >=
      getContrastRatio(lightTarget, backgroundRgb)
      ? darkTarget
      : lightTarget;
    let lowerWeight = 0;
    let upperWeight = 1;
    let readableColor = target.slice();
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const weight = (lowerWeight + upperWeight) / 2;
      const candidate = mixRgb(accentRgb, target, weight);
      if (getContrastRatio(candidate, backgroundRgb) >= requiredContrast) {
        readableColor = candidate;
        upperWeight = weight;
      } else {
        lowerWeight = weight;
      }
    }
    return readableColor;
  }

  function getAccessibleThemeTextRgb(accentRgb, backgroundRgb) {
    return getAccessibleThemeColorRgb(
      accentRgb,
      backgroundRgb,
      MIN_PREFIX_TEXT_CONTRAST
    );
  }

  function getAccessibleThemeFocusRingRgb(accentRgb, backgroundRgb) {
    return getAccessibleThemeColorRgb(accentRgb, backgroundRgb, 3);
  }

  function createInputModeController(parts, options) {
    const config = options || {};
    const doc = getDocument(config);
    const win = getWindow(config);
    if (!doc || !parts || !parts.container || !parts.input) {
      throw new Error('createInputModeController requires input parts');
    }

    const input = parts.input;
    const container = parts.container;
    const surface = config.surface === 'overlay' ? 'overlay' : 'newtab';
    const useImportantStyles = Boolean(config.useImportantStyles);
    const applyNoTranslate = typeof config.applyNoTranslate === 'function'
      ? config.applyNoTranslate
      : noopTranslate;
    const setInputStyle = typeof config.setInputStyle === 'function'
      ? config.setInputStyle
      : (target, property, value) => setStyle(target, property, value, useImportantStyles);
    const formatMessage = typeof config.formatMessage === 'function'
      ? config.formatMessage
      : (key, fallback, values) => String(fallback || '').replace(/\{([^}]+)\}/g, (match, token) => {
        return values && Object.prototype.hasOwnProperty.call(values, token)
          ? String(values[token])
          : match;
      });
    const getThemeForMode = typeof config.getThemeForMode === 'function'
      ? config.getThemeForMode
      : (theme) => theme || config.defaultTheme || {};
    const getSiteSearchPrefixText = typeof config.getSiteSearchPrefixText === 'function'
      ? config.getSiteSearchPrefixText
      : (provider) => provider && (provider.name || provider.key) ? (provider.name || provider.key) : '';
    const getSiteSearchDisplayName = typeof config.getSiteSearchDisplayName === 'function'
      ? config.getSiteSearchDisplayName
      : getSiteSearchPrefixText;
    const getProviderIcon = typeof config.getProviderIcon === 'function'
      ? config.getProviderIcon
      : () => '';
    const getProviderThemeHost = typeof config.getProviderThemeHost === 'function'
      ? config.getProviderThemeHost
      : () => '';
    const getThemeForProvider = typeof config.getThemeForProvider === 'function'
      ? config.getThemeForProvider
      : null;
    const isAiSiteSearchProvider = typeof config.isAiSiteSearchProvider === 'function'
      ? config.isAiSiteSearchProvider
      : () => false;
    const attachFaviconData = typeof config.attachFaviconData === 'function'
      ? config.attachFaviconData
      : null;
    const attachProviderIcon = typeof config.attachProviderIcon === 'function'
      ? config.attachProviderIcon
      : null;
    const preferDirectProviderIcons = config.preferDirectProviderIcons === true;
    const isDarkMode = typeof config.isDarkMode === 'function'
      ? config.isDarkMode
      : () => false;
    const parseCssColor = typeof config.parseCssColor === 'function'
      ? config.parseCssColor
      : defaultParseCssColor;
    const rgbToCss = typeof config.rgbToCss === 'function'
      ? config.rgbToCss
      : defaultRgbToCss;
    const defaultTheme = config.defaultTheme || {};
    const menuSurface = root.LumnoMenuSurface || (
      typeof globalThis !== 'undefined' ? globalThis.LumnoMenuSurface : null
    ) || {};
    const menuSurfaceClass = menuSurface.className || '_x_extension_menu_surface_2024_unique_';
    const cursorTooltipApi = root.LumnoCursorTooltip || (
      typeof globalThis !== 'undefined' ? globalThis.LumnoCursorTooltip : null
    ) || {};
    const shortcutDisplayApi = root.LumnoShortcutDisplay || (
      typeof globalThis !== 'undefined' ? globalThis.LumnoShortcutDisplay : null
    ) || {};
    const defaultAccentColor = Array.isArray(config.defaultAccentColor)
      ? config.defaultAccentColor
      : DEFAULT_ACCENT_RGB;
    const prefixGap = Number.isFinite(Number(config.prefixGap))
      ? Number(config.prefixGap)
      : DEFAULT_PREFIX_GAP;
    const rightReserveBase = Number.isFinite(Number(config.rightReserveBase))
      ? Number(config.rightReserveBase)
      : (surface === 'overlay' ? 92 : 64);
    const rightAnchorOffset = Number.isFinite(Number(config.rightAnchorOffset))
      ? Number(config.rightAnchorOffset)
      : (surface === 'overlay' ? 86 : 52);
    const configuredBaseInputPaddingLeft = Number.isFinite(Number(config.baseInputPaddingLeft))
      ? Number(config.baseInputPaddingLeft)
      : null;
    const prefixTransition = config.prefixTransition || DEFAULT_PREFIX_TRANSITION;
    const defaultPlaceholder = Object.prototype.hasOwnProperty.call(config, 'defaultPlaceholder')
      ? config.defaultPlaceholder
      : input.placeholder;
    const getDefaultPlaceholder = typeof config.getDefaultPlaceholder === 'function'
      ? config.getDefaultPlaceholder
      : () => defaultPlaceholder;
    const defaultCaretColor = Object.prototype.hasOwnProperty.call(config, 'defaultCaretColor')
      ? config.defaultCaretColor
      : (input.style.caretColor || 'var(--x-ext-input-caret, #7DB7FF)');
    const prefixId = config.prefixId || (surface === 'overlay'
      ? '_x_extension_site_search_prefix_2024_unique_'
      : '_x_extension_newtab_site_search_prefix_2024_unique_');
    const tabHintId = config.tabHintId || (surface === 'overlay'
      ? '_x_extension_site_search_tab_hint_2026_unique_'
      : '_x_extension_newtab_site_search_tab_hint_2026_unique_');
    const vars = surface === 'overlay'
      ? {
        tagBg: 'var(--x-ov-tag-bg, #F3F4F6)',
        tagText: 'var(--x-ov-tag-text, #6B7280)',
        panelBorder: 'var(--x-ov-border, rgba(0, 0, 0, 0.08))',
        panelBg: 'var(--x-ov-mode-menu-bg, #FFFFFF)',
        panelText: 'var(--x-ov-text, #111827)',
        panelShadow: 'var(--x-ov-shadow, 0 16px 40px rgba(15, 23, 42, 0.13))',
        panelRadius: 'var(--x-ov-panel-radius, 28px)',
        panelGap: '14px'
      }
      : {
        tagBg: 'var(--x-nt-tag-bg, #F3F4F6)',
        tagText: 'var(--x-nt-tag-text, #6B7280)',
        panelBorder: 'var(--x-nt-panel-border, rgba(0, 0, 0, 0.08))',
        panelBg: 'var(--x-nt-mode-menu-bg, #FFFFFF)',
        panelText: 'var(--x-nt-text, #111827)',
        panelShadow: 'var(--x-nt-panel-shadow-focus, 0 16px 40px rgba(15, 23, 42, 0.13))',
        panelRadius: 'var(--x-nt-search-shell-radius, 32px)',
        panelGap: '18px'
      };

    let baseInputPaddingLeft = null;
    let inputModePrefixAnimation = null;
    let inputModePrefixAnimationFrame = null;
    let inputModePrefixAnimationTimer = 0;
    let inputModePrefixAnimationRevision = 0;
    let inputModePrefixContentRevision = 0;
    let inputModePrefixCurrentAnimation = null;
    let inputModePrefixIconAnimation = null;
    let inputModePrefixIconAnimationElement = null;
    let inputModePrefixIconGhost = null;
    let inputModePrefixOutgoingIconAnimation = null;
    let inputModePrefixPendingText = '';
    let layoutResizeObserver = null;
    let modeMenuOpen = false;
    let modeMenuPending = false;
    let modeMenuRequestId = 0;
    let modeMenuRevealFrame = 0;
    let modeMenuRevealFrameKind = '';
    let modeMenuResultTransitionActive = false;
    let modeMenuFilterQuery = '';
    let renderedModeMenuEntries = [];
    let renderedModeMenuGroups = [];
    let modeMenuEmptyState = null;
    let modeMenuDoubleTabPending = false;
    let modeMenuDoubleTabTimer = 0;
    let modeTagRemovalConfirmationPending = false;
    let modeTagRemovalConfirmationTimer = 0;
    let modeMenuKeyboardNavigationActive = false;
    let destroyed = false;

    function getModeMenuPlaceholder() {
      return formatMessage(
        'search_scope_panel_placeholder',
        'Search specific site content...'
      );
    }

    function getModeActivePlaceholder() {
      return formatMessage(
        'search_scope_active_placeholder',
        'Search within this scope; press Tab again to open the scope panel...'
      );
    }

    function hasVisibleModePrefix() {
      return siteSearchPrefix.style.getPropertyValue('display') !== 'none';
    }

    function syncInputPlaceholder() {
      if (modeMenuOpen && !modeMenu.hidden) {
        input.placeholder = getModeMenuPlaceholder();
        return;
      }
      input.placeholder = hasVisibleModePrefix()
        ? getModeActivePlaceholder()
        : getDefaultPlaceholder();
    }

    function getModeMenuPinyinApi() {
      return root.pinyinPro || (
        typeof globalThis !== 'undefined' ? globalThis.pinyinPro : null
      );
    }
    function ensureModeMenuPinyinRuntime() {
      const existingApi = getModeMenuPinyinApi();
      if (existingApi && typeof existingApi.pinyin === 'function') {
        return null;
      }
      if (typeof config.loadPinyinRuntime === 'function') {
        return Promise.resolve(config.loadPinyinRuntime()).catch(() => null);
      }
      const chromeApi = root.chrome || (
        typeof globalThis !== 'undefined' ? globalThis.chrome : null
      );
      if (!chromeApi || !chromeApi.runtime ||
          typeof chromeApi.runtime.getURL !== 'function') {
        return null;
      }
      try {
        return import(chromeApi.runtime.getURL('assets/vendor/pinyin-pro.js'))
          .then(() => getModeMenuPinyinApi())
          .catch(() => null);
      } catch (error) {
        return null;
      }
    }
    const modeMenuPinyinRuntimeReady = ensureModeMenuPinyinRuntime();
    const providedModeMenuCursorTooltipController =
      config.modeMenuCursorTooltipController || config.modeMenuTooltipController || null;
    const modeMenuCursorTooltipController = providedModeMenuCursorTooltipController || (
      typeof cursorTooltipApi.createController === 'function'
        ? cursorTooltipApi.createController({
          documentObj: doc,
          windowObj: win,
          appendTo: doc && doc.body,
          id: `${prefixId}-label-cursor-tooltip`,
          maxWidth: 320,
          offsetX: 14,
          offsetY: 16
        })
        : null
    );
    const ownsModeMenuCursorTooltipController = Boolean(
      modeMenuCursorTooltipController && !providedModeMenuCursorTooltipController
    );

    const createSvgElement = (tagName) => typeof doc.createElementNS === 'function'
      ? doc.createElementNS('http://www.w3.org/2000/svg', tagName)
      : doc.createElement(tagName);
    const siteSearchPrefix = applyNoTranslate(parts.modePrefix);
    const siteSearchPrefixGlyph = parts.modePrefixGlyph || doc.createElement('i');
    const siteSearchPrefixLineIcon = createSvgElement('svg');
    const siteSearchPrefixIcon = parts.modePrefixIcon;
    const siteSearchPrefixIconFrame = parts.modePrefixIconFrame || doc.createElement('span');
    const siteSearchPrefixText = applyNoTranslate(parts.modePrefixText);
    const siteSearchPrefixCurrent = applyNoTranslate(
      parts.modePrefixCurrent || doc.createElement('span')
    );
    const siteSearchPrefixCurrentText = applyNoTranslate(
      typeof siteSearchPrefixCurrent.querySelector === 'function'
        ? siteSearchPrefixCurrent.querySelector('[data-search-input-mode-current-text]') ||
          doc.createElement('span')
        : doc.createElement('span')
    );
    const siteSearchPrefixChevron = parts.modePrefixChevron || doc.createElement('i');
    const modeMenuWasProvided = Boolean(parts.modeMenu);
    const modeMenu = applyNoTranslate(parts.modeMenu || doc.createElement('div'));
    const siteSearchTabHint = applyNoTranslate(parts.modeTabHint);
    const siteSearchTabHintKey = applyNoTranslate(parts.modeTabHintKey);
    const siteSearchTabHintText = applyNoTranslate(parts.modeTabHintText);
    if (!siteSearchPrefix || !siteSearchPrefixIcon || !siteSearchPrefixText ||
        !siteSearchTabHint || !siteSearchTabHintKey || !siteSearchTabHintText) {
      throw new Error('createInputModeController requires React input mode parts');
    }
    siteSearchPrefix.id = prefixId;
    siteSearchPrefix.className = 'x-lumno-search-input-mode__prefix';
    siteSearchPrefix.setAttribute('type', 'button');
    siteSearchPrefix.setAttribute('aria-haspopup', 'menu');
    siteSearchPrefix.setAttribute('aria-expanded', 'false');
    siteSearchPrefix.setAttribute('aria-controls', `${prefixId}-menu`);
    siteSearchPrefix.setAttribute('data-menu-open', 'false');
    siteSearchPrefix.setAttribute('data-current-visible', 'false');
    siteSearchPrefix.setAttribute('data-current-measuring', 'false');
    siteSearchPrefixIconFrame.className = 'x-lumno-search-input-mode__prefix-icon-frame';
    siteSearchPrefixIconFrame.setAttribute('data-search-input-mode-prefix-icon-frame', '');
    if (!siteSearchPrefixIconFrame.parentNode) {
      if (siteSearchPrefixIcon.parentNode) {
        const iconParent = siteSearchPrefixIcon.parentNode;
        if (typeof iconParent.insertBefore === 'function') {
          iconParent.insertBefore(siteSearchPrefixIconFrame, siteSearchPrefixIcon);
        } else {
          if (typeof iconParent.removeChild === 'function') {
            iconParent.removeChild(siteSearchPrefixIcon);
          }
          iconParent.appendChild(siteSearchPrefixIconFrame);
        }
      } else if (typeof siteSearchPrefix.insertBefore === 'function') {
        siteSearchPrefix.insertBefore(siteSearchPrefixIconFrame, siteSearchPrefixText);
      } else {
        siteSearchPrefix.appendChild(siteSearchPrefixIconFrame);
      }
    }
    if (siteSearchPrefixIcon.parentNode !== siteSearchPrefixIconFrame) {
      siteSearchPrefixIconFrame.appendChild(siteSearchPrefixIcon);
    }
    if (!siteSearchPrefixGlyph.parentNode) {
      if (typeof siteSearchPrefix.insertBefore === 'function') {
        siteSearchPrefix.insertBefore(siteSearchPrefixGlyph, siteSearchPrefixText);
      } else {
        siteSearchPrefix.appendChild(siteSearchPrefixGlyph);
      }
    }
    siteSearchPrefixLineIcon.setAttribute('aria-hidden', 'true');
    siteSearchPrefixLineIcon.setAttribute('class', 'x-lumno-search-input-mode__prefix-line-icon');
    siteSearchPrefixLineIcon.setAttribute('data-search-input-mode-line-icon', '');
    siteSearchPrefixLineIcon.style.cssText = cssText([
      ['display', 'none'],
      ['width', '16px'],
      ['height', '16px'],
      ['flex', '0 0 16px']
    ], useImportantStyles);
    if (!siteSearchPrefixLineIcon.parentNode) {
      if (typeof siteSearchPrefix.insertBefore === 'function') {
        siteSearchPrefix.insertBefore(siteSearchPrefixLineIcon, siteSearchPrefixText);
      } else {
        siteSearchPrefix.appendChild(siteSearchPrefixLineIcon);
      }
    }
    if (!siteSearchPrefixChevron.parentNode) {
      siteSearchPrefix.appendChild(siteSearchPrefixChevron);
    }
    if (!siteSearchPrefixCurrent.parentNode) {
      if (typeof siteSearchPrefix.insertBefore === 'function') {
        siteSearchPrefix.insertBefore(siteSearchPrefixCurrent, siteSearchPrefixChevron);
      } else {
        siteSearchPrefix.appendChild(siteSearchPrefixCurrent);
      }
    }
    if (!siteSearchPrefixCurrentText.parentNode) {
      siteSearchPrefixCurrent.appendChild(siteSearchPrefixCurrentText);
    }
    if (siteSearchPrefixCurrentText.style &&
        typeof siteSearchPrefixCurrentText.style.setProperty === 'function') {
      siteSearchPrefixCurrentText.style.setProperty('display', 'inline-block');
    }
    siteSearchPrefixCurrent.setAttribute('aria-hidden', 'true');
    siteSearchPrefixCurrent.setAttribute('data-search-input-mode-current', '');
    siteSearchPrefixCurrentText.setAttribute('data-search-input-mode-current-text', '');
    siteSearchPrefixGlyph.setAttribute('aria-hidden', 'true');
    siteSearchPrefixChevron.setAttribute('aria-hidden', 'true');
    siteSearchPrefixChevron.className = 'ri-icon ri-size-16 ri-arrow-down-s-line';
    siteSearchPrefix.style.cssText = cssText([
      ['all', 'unset'],
      ['position', 'absolute'],
      ['top', '50%'],
      ['transform', 'translateY(-50%)'],
      ['transform-origin', 'left center'],
      ['left', '50px'],
      ['display', 'none'],
      ['align-items', 'center'],
      ['justify-content', 'flex-start'],
      ['gap', `${DEFAULT_PREFIX_ITEM_GAP_PX}px`],
      ['max-width', 'min(220px, 48%)'],
      ['min-width', '0'],
      ['box-sizing', 'border-box'],
      ['height', '32px'],
      ['padding', '0 6px'],
      ['white-space', 'nowrap'],
      ['overflow', 'hidden'],
      ['text-overflow', 'ellipsis'],
      ['font-size', '13px'],
      ['font-family', INPUT_FONT_STACK],
      ['font-weight', '700'],
      ['line-height', '1'],
      ['letter-spacing', '0'],
      ['color', '#F8FAFC'],
      ['background', '#3B82F6'],
      ['border', 'none'],
      ['border-radius', '10px'],
      ['box-shadow', 'none'],
      ['opacity', '1'],
      ['transition', prefixTransition],
      ['will-change', 'auto'],
      ['cursor', 'pointer'],
      ['pointer-events', 'auto'],
      ['z-index', '1'],
      ['user-select', 'none']
    ], useImportantStyles);
    setStyle(siteSearchPrefix, 'justify-content', 'flex-start', useImportantStyles);
    setStyle(siteSearchPrefix, 'height', '32px', useImportantStyles);
    setStyle(siteSearchPrefix, 'padding', '0 6px', useImportantStyles);
    modeMenu.id = `${prefixId}-menu`;
    modeMenu.className = `x-lumno-search-input-mode__menu ${menuSurfaceClass}`;
    if (typeof menuSurface.apply === 'function') {
      menuSurface.apply(modeMenu);
    }
    modeMenu.setAttribute('data-surface', surface);
    modeMenu.setAttribute('data-filtered', 'false');
    modeMenu.setAttribute('data-search-active', 'false');
    modeMenu.setAttribute('role', 'menu');
    modeMenu.setAttribute('aria-labelledby', prefixId);
    modeMenu.tabIndex = -1;
    modeMenu.hidden = true;
    const modeMenuEdgeOffset = surface === 'newtab' ? '-6px' : '-1px';
    const modeMenuStyles = [
      ['position', 'absolute'],
      ['left', modeMenuEdgeOffset],
      ['right', modeMenuEdgeOffset],
      ['top', `calc(100% + ${vars.panelGap})`],
      ['width', 'auto'],
      ['height', 'min(360px, 62vh, var(--x-lumno-search-mode-menu-viewport-max-height, 360px))'],
      ['max-height', 'min(360px, 62vh, var(--x-lumno-search-mode-menu-viewport-max-height, 360px))'],
      ['overflow', 'hidden'],
      ['padding', '0'],
      ['border', `1px solid ${vars.panelBorder}`],
      ['border-radius', vars.panelRadius],
      ['background', vars.panelBg],
      ['box-shadow', vars.panelShadow],
      ['box-sizing', 'border-box'],
      ['font-family', INPUT_FONT_STACK],
      ['font-size', '13px'],
      ['color', vars.panelText],
      ['z-index', '40'],
      ['--x-lumno-search-mode-menu-lift', '0px'],
      ['--x-lumno-search-mode-menu-result-offset', '0px'],
      ['--x-extension-menu-surface-closed-transform', 'translateY(calc(var(--x-lumno-search-mode-menu-result-offset, 0px) + var(--x-lumno-search-mode-menu-lift, 0px) - 6px)) scale(0.96, 0.86)'],
      ['--x-extension-menu-surface-open-transform', 'translateY(calc(var(--x-lumno-search-mode-menu-result-offset, 0px) + var(--x-lumno-search-mode-menu-lift, 0px))) scale(1, 1)'],
      ['overscroll-behavior', 'contain']
    ];
    modeMenu.style.cssText = '';
    modeMenuStyles.forEach((pair) => {
      setStyle(modeMenu, pair[0], pair[1], useImportantStyles);
    });
    if (!modeMenu.parentNode) {
      container.appendChild(modeMenu);
    }
    let modeMenuContent = typeof modeMenu.querySelector === 'function'
      ? modeMenu.querySelector('[data-search-input-mode-menu-content]')
      : null;
    let modeMenuFooter = typeof modeMenu.querySelector === 'function'
      ? modeMenu.querySelector('[data-search-input-mode-menu-footer]')
      : null;
    if (!modeMenuContent || !modeMenuFooter) {
      while (modeMenu.firstChild) {
        modeMenu.removeChild(modeMenu.firstChild);
      }
      modeMenuContent = applyNoTranslate(doc.createElement('div'));
      modeMenuContent.className = 'x-lumno-search-input-mode__menu-content';
      modeMenuContent.setAttribute('data-search-input-mode-menu-content', '');
      modeMenuContent.setAttribute('role', 'presentation');
      modeMenuFooter = applyNoTranslate(doc.createElement('div'));
      modeMenuFooter.className = 'x-lumno-search-input-mode__menu-footer';
      modeMenuFooter.setAttribute('data-search-input-mode-menu-footer', '');
      modeMenuFooter.setAttribute('role', 'presentation');
      modeMenuFooter.setAttribute('aria-hidden', 'true');
      modeMenu.appendChild(modeMenuContent);
      modeMenu.appendChild(modeMenuFooter);
    }
    let modeMenuFooterKey = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-key]')
      : null;
    let modeMenuFooterText = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-text]')
      : null;
    let modeMenuFooterFilterText = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-filter-text]')
      : null;
    let modeMenuFooterActions = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-actions]')
      : null;
    let modeMenuFooterNavigationHint = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-navigation-hint]')
      : null;
    let modeMenuFooterSelectHint = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-select-hint]')
      : null;
    let modeMenuFooterNavigationKey = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-navigation-key]')
      : null;
    let modeMenuFooterNavigationText = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-navigation-text]')
      : null;
    let modeMenuFooterSelectKey = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-select-key]')
      : null;
    let modeMenuFooterSelectText = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-select-text]')
      : null;
    let modeMenuFooterShortcutHint = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-shortcut-hint]')
      : null;
    let modeMenuFooterInputHint = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-input-hint]')
      : null;
    let modeMenuFooterInputKey = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-input-key]')
      : null;
    let modeMenuFooterInputText = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('[data-search-input-mode-menu-footer-input-text]')
      : null;
    if (!modeMenuFooterKey || !modeMenuFooterText || !modeMenuFooterFilterText ||
        !modeMenuFooterActions || !modeMenuFooterNavigationHint ||
        !modeMenuFooterSelectHint ||
        !modeMenuFooterNavigationKey || !modeMenuFooterNavigationText ||
        !modeMenuFooterSelectKey || !modeMenuFooterSelectText ||
        !modeMenuFooterShortcutHint || !modeMenuFooterInputHint ||
        !modeMenuFooterInputKey || !modeMenuFooterInputText) {
      while (modeMenuFooter.firstChild) {
        modeMenuFooter.removeChild(modeMenuFooter.firstChild);
      }
      modeMenuFooterFilterText = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterFilterText.className =
        'x-lumno-search-input-mode__menu-footer-filter-text';
      modeMenuFooterFilterText.setAttribute(
        'data-search-input-mode-menu-footer-filter-text',
        ''
      );
      modeMenuFooterActions = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterActions.className =
        'x-lumno-search-input-mode__menu-footer-actions';
      modeMenuFooterActions.setAttribute(
        'data-search-input-mode-menu-footer-actions',
        ''
      );
      modeMenuFooterNavigationHint = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterNavigationHint.className =
        'x-lumno-search-input-mode__menu-footer-hint x-lumno-search-input-mode__menu-footer-hint--navigation';
      modeMenuFooterNavigationHint.setAttribute(
        'data-search-input-mode-menu-footer-navigation-hint',
        ''
      );
      modeMenuFooterNavigationKey = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterNavigationKey.className =
        'x-lumno-search-input-mode__menu-footer-key x-lumno-search-input-mode__menu-footer-key--arrows';
      modeMenuFooterNavigationKey.setAttribute(
        'data-search-input-mode-menu-footer-navigation-key',
        ''
      );
      modeMenuFooterNavigationText = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterNavigationText.className =
        'x-lumno-search-input-mode__menu-footer-text';
      modeMenuFooterNavigationText.setAttribute(
        'data-search-input-mode-menu-footer-navigation-text',
        ''
      );
      modeMenuFooterSelectHint = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterSelectHint.className =
        'x-lumno-search-input-mode__menu-footer-hint x-lumno-search-input-mode__menu-footer-hint--select';
      modeMenuFooterSelectHint.setAttribute(
        'data-search-input-mode-menu-footer-select-hint',
        ''
      );
      modeMenuFooterSelectKey = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterSelectKey.className =
        'x-lumno-search-input-mode__menu-footer-key';
      modeMenuFooterSelectKey.setAttribute(
        'data-search-input-mode-menu-footer-select-key',
        ''
      );
      modeMenuFooterSelectText = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterSelectText.className =
        'x-lumno-search-input-mode__menu-footer-text';
      modeMenuFooterSelectText.setAttribute(
        'data-search-input-mode-menu-footer-select-text',
        ''
      );
      modeMenuFooterInputHint = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterInputHint.className =
        'x-lumno-search-input-mode__menu-footer-hint x-lumno-search-input-mode__menu-footer-hint--input';
      modeMenuFooterInputHint.setAttribute(
        'data-search-input-mode-menu-footer-input-hint',
        ''
      );
      modeMenuFooterInputKey = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterInputKey.className =
        'x-lumno-search-input-mode__menu-footer-key';
      modeMenuFooterInputKey.setAttribute(
        'data-search-input-mode-menu-footer-input-key',
        ''
      );
      modeMenuFooterInputText = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterInputText.className =
        'x-lumno-search-input-mode__menu-footer-text';
      modeMenuFooterInputText.setAttribute(
        'data-search-input-mode-menu-footer-input-text',
        ''
      );
      modeMenuFooterShortcutHint = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterShortcutHint.className =
        'x-lumno-search-input-mode__menu-footer-hint x-lumno-search-input-mode__menu-footer-hint--shortcut';
      modeMenuFooterShortcutHint.setAttribute(
        'data-search-input-mode-menu-footer-shortcut-hint',
        ''
      );
      modeMenuFooterKey = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterKey.className = 'x-lumno-search-input-mode__menu-footer-key';
      modeMenuFooterKey.setAttribute(
        'data-search-input-mode-menu-footer-key',
        ''
      );
      modeMenuFooterText = applyNoTranslate(doc.createElement('span'));
      modeMenuFooterText.className = 'x-lumno-search-input-mode__menu-footer-text';
      modeMenuFooterText.setAttribute(
        'data-search-input-mode-menu-footer-text',
        ''
      );
      modeMenuFooter.appendChild(modeMenuFooterFilterText);
      modeMenuFooterNavigationHint.appendChild(modeMenuFooterNavigationKey);
      modeMenuFooterNavigationHint.appendChild(modeMenuFooterNavigationText);
      modeMenuFooterSelectHint.appendChild(modeMenuFooterSelectKey);
      modeMenuFooterSelectHint.appendChild(modeMenuFooterSelectText);
      modeMenuFooterInputHint.appendChild(modeMenuFooterInputKey);
      modeMenuFooterInputHint.appendChild(modeMenuFooterInputText);
      modeMenuFooterShortcutHint.appendChild(modeMenuFooterKey);
      modeMenuFooterShortcutHint.appendChild(modeMenuFooterText);
      modeMenuFooterActions.appendChild(modeMenuFooterNavigationHint);
      modeMenuFooterActions.appendChild(modeMenuFooterSelectHint);
      modeMenuFooterActions.appendChild(modeMenuFooterInputHint);
      modeMenuFooterActions.appendChild(modeMenuFooterShortcutHint);
      modeMenuFooter.appendChild(modeMenuFooterActions);
    }
    const legacyModeMenuFooterDivider = typeof modeMenuFooter.querySelector === 'function'
      ? modeMenuFooter.querySelector('.x-lumno-search-input-mode__menu-footer-divider')
      : null;
    if (legacyModeMenuFooterDivider) {
      legacyModeMenuFooterDivider.remove();
    }
    modeMenuFooter.appendChild(modeMenuFooterFilterText);
    modeMenuFooterNavigationHint.appendChild(modeMenuFooterNavigationKey);
    modeMenuFooterNavigationHint.appendChild(modeMenuFooterNavigationText);
    modeMenuFooterSelectHint.appendChild(modeMenuFooterSelectKey);
    modeMenuFooterSelectHint.appendChild(modeMenuFooterSelectText);
    modeMenuFooterInputHint.appendChild(modeMenuFooterInputKey);
    modeMenuFooterInputHint.appendChild(modeMenuFooterInputText);
    modeMenuFooterShortcutHint.appendChild(modeMenuFooterKey);
    modeMenuFooterShortcutHint.appendChild(modeMenuFooterText);
    modeMenuFooterActions.appendChild(modeMenuFooterNavigationHint);
    modeMenuFooterActions.appendChild(modeMenuFooterSelectHint);
    modeMenuFooterActions.appendChild(modeMenuFooterInputHint);
    modeMenuFooterActions.appendChild(modeMenuFooterShortcutHint);
    modeMenuFooter.appendChild(modeMenuFooterActions);
    function renderModeMenuFilterQuery(query) {
      const queryToken = '\uF8FFLUMNO_MODE_MENU_QUERY\uF8FF';
      const localizedQuery = formatMessage(
        'search_scope_menu_filter_query',
        'Search: {query}',
        { query: queryToken }
      );
      const queryIndex = localizedQuery.indexOf(queryToken);
      if (queryIndex < 0) {
        modeMenuFooterFilterText.textContent = formatMessage(
          'search_scope_menu_filter_query',
          'Search: {query}',
          { query }
        );
        return;
      }
      while (modeMenuFooterFilterText.firstChild) {
        modeMenuFooterFilterText.removeChild(modeMenuFooterFilterText.firstChild);
      }
      if (queryIndex > 0) {
        modeMenuFooterFilterText.appendChild(
          doc.createTextNode(localizedQuery.slice(0, queryIndex))
        );
      }
      const queryMark = doc.createElement('mark');
      queryMark.className = 'x-lumno-search-input-mode__menu-match';
      queryMark.textContent = query;
      modeMenuFooterFilterText.appendChild(queryMark);
      const queryEnd = queryIndex + queryToken.length;
      if (queryEnd < localizedQuery.length) {
        modeMenuFooterFilterText.appendChild(
          doc.createTextNode(localizedQuery.slice(queryEnd))
        );
      }
    }
    function refreshModeMenuFilterText() {
      if (modeMenuFilterQuery) {
        renderModeMenuFilterQuery(modeMenuFilterQuery);
      } else {
        modeMenuFooterFilterText.textContent = formatMessage(
          'search_scope_menu_filter_hint',
          'Type to filter'
        );
      }
    }
    function refreshModeMenuLanguage() {
      modeMenuFooterNavigationKey.textContent = '\u2190\u2191\u2193\u2192';
      modeMenuFooterNavigationText.textContent = formatMessage(
        'search_scope_menu_navigation_hint',
        'Move'
      );
      modeMenuFooterSelectKey.textContent = 'Enter';
      modeMenuFooterSelectText.textContent = formatMessage(
        'search_scope_menu_select_hint',
        'Switch'
      );
      modeMenuFooterInputKey.textContent = 'Tab';
      modeMenuFooterInputText.textContent = formatMessage(
        'search_scope_menu_input_focus_hint',
        'Focus'
      );
      modeMenuFooterKey.textContent =
        typeof shortcutDisplayApi.formatShortcutReference === 'function'
          ? shortcutDisplayApi.formatShortcutReference('Tab Tab', {
            navigatorLike: config.navigatorLike || (win && win.navigator)
          })
          : 'Tab Tab';
      modeMenuFooterText.textContent = formatMessage(
        'search_scope_menu_shortcut_hint',
        'Open panel'
      );
      refreshModeMenuFilterText();
      syncInputPlaceholder();
    }
    refreshModeMenuLanguage();
    siteSearchTabHint.id = tabHintId;
    siteSearchTabHint.className = 'x-lumno-search-input-mode__tab-hint';
    siteSearchTabHint.setAttribute('aria-hidden', 'true');
    siteSearchTabHintKey.textContent = '';
    siteSearchTabHintText.textContent = '';
    siteSearchTabHint.style.cssText = cssText([
      ['all', 'unset'],
      ['position', 'absolute'],
      ['right', `${rightAnchorOffset}px`],
      ['top', '50%'],
      ['transform', 'translateY(-50%)'],
      ['display', 'none'],
      ['align-items', 'center'],
      ['justify-content', 'center'],
      ['gap', '7px'],
      ['max-width', 'min(300px, 52%)'],
      ['min-width', '0'],
      ['height', '28px'],
      ['padding', '0'],
      ['border', 'none'],
      ['background', 'transparent'],
      ['color', vars.tagText],
      ['box-sizing', 'border-box'],
      ['font-size', '13px'],
      ['font-family', INPUT_FONT_STACK],
      ['font-weight', '700'],
      ['line-height', '18px'],
      ['letter-spacing', '0'],
      ['white-space', 'nowrap'],
      ['pointer-events', 'none'],
      ['user-select', 'none'],
      ['z-index', '1']
    ], useImportantStyles);
    function shouldReduceInputModeMotion() {
      return Boolean(
        win &&
        typeof win.matchMedia === 'function' &&
        win.matchMedia('(prefers-reduced-motion: reduce)').matches
      );
    }

    function getBuiltInSurfaceColor() {
      return surface === 'overlay'
        ? 'var(--x-ov-text, #111827)'
        : 'var(--x-nt-text, #111827)';
    }

    function getInputModePrefixVisual(theme, visualOptions) {
      const lineIconName = visualOptions && visualOptions.menuIconName
        ? String(visualOptions.menuIconName).trim()
        : '';
      if (getModeMenuLineIconPaths(lineIconName)) {
        const surfaceColor = getBuiltInSurfaceColor();
        const isDark = Boolean(isDarkMode());
        return {
          accentColor: surfaceColor,
          background: `color-mix(in srgb, ${surfaceColor} ${isDark ? 14 : 9}%, transparent)`,
          border: 'none',
          shadow: 'none',
          color: surfaceColor,
          caretColor: surfaceColor
        };
      }
      const resolvedTheme = theme ? getThemeForMode(theme) : defaultTheme;
      const accentRgb = (resolvedTheme && (resolvedTheme.accentRgb || parseCssColor(resolvedTheme.accent))) ||
        defaultAccentColor;
      const isDark = Boolean(isDarkMode());
      const backgroundOpacity = isDark ? 0.14 : 0.075;
      const backgroundRgb = mixRgb(
        accentRgb,
        isDark ? [17, 24, 39] : [255, 255, 255],
        1 - backgroundOpacity
      );
      const themeTextRgb = getAccessibleThemeTextRgb(accentRgb, backgroundRgb);
      const themeTextColor = rgbToCss(themeTextRgb);
      return {
        accentColor: themeTextColor,
        background: `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, ${backgroundOpacity})`,
        border: 'none',
        shadow: 'none',
        color: themeTextColor,
        caretColor: resolvedTheme && resolvedTheme.placeholderText
          ? resolvedTheme.placeholderText
          : rgbToCss(accentRgb)
      };
    }

    function applyInputModePrefixVisual(theme, visualOptions) {
      const visual = getInputModePrefixVisual(theme, visualOptions);
      setStyle(container, '--x-lumno-search-mode-accent', visual.accentColor, useImportantStyles);
      setStyle(container, '--x-lumno-search-mode-selected-bg', visual.background, useImportantStyles);
      setStyle(siteSearchPrefix, 'background', visual.background, useImportantStyles);
      setStyle(siteSearchPrefix, 'border', visual.border, useImportantStyles);
      setStyle(siteSearchPrefix, 'box-shadow', visual.shadow, useImportantStyles);
      setStyle(siteSearchPrefix, 'color', visual.color, useImportantStyles);
      setStyle(siteSearchPrefix, '--x-lumno-search-mode-accent', visual.accentColor, useImportantStyles);
      setStyle(siteSearchPrefixLineIcon, 'color', visual.accentColor, useImportantStyles);
      setStyle(siteSearchPrefixChevron, 'color', visual.accentColor, useImportantStyles);
      setStyle(siteSearchPrefixCurrent, 'color', visual.accentColor, useImportantStyles);
      return visual;
    }

    function updateInputRightPadding() {
      if (!input) {
        return;
      }
      let totalReserve = rightReserveBase;
      const badgeElement = getModeBadgeElement();
      if (isElementVisible(badgeElement)) {
        const badgeWidth = Math.ceil(badgeElement.getBoundingClientRect().width || 0);
        totalReserve = Math.max(totalReserve, rightAnchorOffset + badgeWidth + 12);
      }
      if (isElementVisible(siteSearchTabHint)) {
        const hintWidth = Math.ceil(siteSearchTabHint.getBoundingClientRect().width || 0);
        totalReserve = Math.max(totalReserve, rightAnchorOffset + hintWidth + 12);
      }
      setInputStyle(input, 'padding-right', `${totalReserve}px`);
    }

    function getModeBadgeElement() {
      return typeof config.getModeBadgeElement === 'function'
        ? config.getModeBadgeElement()
        : config.modeBadgeElement;
    }

    function getBaseInputPaddingLeft() {
      if (baseInputPaddingLeft === null) {
        const computed = parseFloat(win.getComputedStyle(input).paddingLeft);
        baseInputPaddingLeft = Number.isFinite(computed) && computed > 0
          ? computed
          : (configuredBaseInputPaddingLeft || 50);
      }
      return baseInputPaddingLeft;
    }

    function updatePrefixLayout() {
      const basePadding = getBaseInputPaddingLeft();
      setStyle(siteSearchPrefix, 'left', `${basePadding}px`, useImportantStyles);
      if (!isElementVisible(siteSearchPrefix)) {
        setInputStyle(input, 'padding-left', `${basePadding}px`);
        return;
      }
      const prefixWidth = Math.ceil(siteSearchPrefix.offsetWidth || siteSearchPrefix.getBoundingClientRect().width || 0);
      const paddedLeft = Math.max(basePadding + prefixWidth + prefixGap, basePadding);
      setInputStyle(input, 'padding-left', `${paddedLeft}px`);
    }

    function updateModeMenuFooterAlignment() {
      if (modeMenu.hidden || !modeMenuFooter || !modeMenuContent) {
        return;
      }
      const firstIcon = modeMenuContent.querySelector(
        '.x-lumno-search-input-mode__menu-icon'
      );
      if (!firstIcon || Number(firstIcon.offsetWidth) <= 0) {
        return;
      }
      const menuRect = modeMenu.getBoundingClientRect();
      const iconRect = firstIcon.getBoundingClientRect();
      const footerRect = modeMenuFooter.getBoundingClientRect();
      const menuLayoutWidth = Number(modeMenu.offsetWidth) || menuRect.width;
      const scaleX = menuLayoutWidth > 0 ? menuRect.width / menuLayoutWidth : 1;
      if (!Number.isFinite(scaleX) || scaleX <= 0) {
        return;
      }
      const inlineStart = Math.max(0, (iconRect.left - footerRect.left) / scaleX);
      setStyle(
        modeMenuFooter,
        '--x-lumno-search-mode-footer-inline-start',
        `${Math.round(inlineStart * 100) / 100}px`,
        useImportantStyles
      );
    }

    function updateLayout() {
      if (destroyed) {
        return;
      }
      updateInputRightPadding();
      updatePrefixLayout();
      updateModeMenuFooterAlignment();
      if (modeMenuOpen && !modeMenu.hidden) {
        notifyModeMenuLayoutChange();
      }
    }

    function setInputModePrefixIdentity(prefixText, contentOptions) {
      siteSearchPrefix.setAttribute(
        'data-mode-id',
        contentOptions && contentOptions.modeId ? String(contentOptions.modeId) : ''
      );
      siteSearchPrefix.setAttribute('aria-label', formatMessage(
        'search_scope_switcher_label',
        '搜索范围：{scope}。选择即可切换',
        { scope: prefixText }
      ));
    }

    function cancelInputModePrefixIconAnimation() {
      const incomingAnimation = inputModePrefixIconAnimation;
      const incomingElement = inputModePrefixIconAnimationElement;
      const outgoingAnimation = inputModePrefixOutgoingIconAnimation;
      const outgoingIcon = inputModePrefixIconGhost;
      inputModePrefixIconAnimation = null;
      inputModePrefixIconAnimationElement = null;
      inputModePrefixIconGhost = null;
      inputModePrefixOutgoingIconAnimation = null;
      if (incomingAnimation && typeof incomingAnimation.cancel === 'function') {
        incomingAnimation.cancel();
      }
      if (outgoingAnimation && typeof outgoingAnimation.cancel === 'function') {
        outgoingAnimation.cancel();
      }
      if (incomingElement) {
        setStyle(incomingElement, 'opacity', '1', useImportantStyles);
        setStyle(incomingElement, 'filter', 'none', useImportantStyles);
        setStyle(incomingElement, 'transform', 'none', useImportantStyles);
        setStyle(incomingElement, 'will-change', 'auto', useImportantStyles);
      }
      if (outgoingIcon && outgoingIcon.parentNode) {
        outgoingIcon.parentNode.removeChild(outgoingIcon);
      }
    }

    function createInputModePrefixIconGhost(animateIcon) {
      if (!animateIcon || shouldReduceInputModeMotion()) {
        return null;
      }
      const activeIcon = [
        siteSearchPrefixLineIcon,
        siteSearchPrefixIconFrame,
        siteSearchPrefixGlyph
      ].find((element) => isElementVisible(element));
      if (!activeIcon || typeof activeIcon.cloneNode !== 'function') {
        return null;
      }
      const ghost = activeIcon.cloneNode(true);
      const prefixRect = siteSearchPrefix.getBoundingClientRect();
      const iconRect = activeIcon.getBoundingClientRect();
      const iconWidth = Number(iconRect.width) || Number(activeIcon.offsetWidth) || 16;
      const iconHeight = Number(iconRect.height) || Number(activeIcon.offsetHeight) || 16;
      const iconLeft = Number(iconRect.left) - Number(prefixRect.left);
      const iconTop = Number(iconRect.top) - Number(prefixRect.top);
      ghost.removeAttribute('id');
      ghost.removeAttribute('data-search-input-mode-line-icon');
      ghost.removeAttribute('data-search-input-mode-prefix-glyph');
      ghost.removeAttribute('data-search-input-mode-prefix-icon');
      ghost.removeAttribute('data-search-input-mode-prefix-icon-frame');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.setAttribute('data-search-input-mode-icon-ghost', '');
      setStyle(ghost, 'position', 'absolute', useImportantStyles);
      setStyle(ghost, 'left', `${Number.isFinite(iconLeft) ? iconLeft : 0}px`, useImportantStyles);
      setStyle(ghost, 'top', `${Number.isFinite(iconTop) ? iconTop : 0}px`, useImportantStyles);
      setStyle(ghost, 'width', `${iconWidth}px`, useImportantStyles);
      setStyle(ghost, 'height', `${iconHeight}px`, useImportantStyles);
      setStyle(ghost, 'display', 'inline-flex', useImportantStyles);
      setStyle(ghost, 'align-items', 'center', useImportantStyles);
      setStyle(ghost, 'justify-content', 'center', useImportantStyles);
      setStyle(ghost, 'pointer-events', 'none', useImportantStyles);
      setStyle(ghost, 'opacity', '1', useImportantStyles);
      setStyle(ghost, 'filter', 'none', useImportantStyles);
      setStyle(ghost, 'transform', 'none', useImportantStyles);
      setStyle(ghost, 'transform-origin', 'center', useImportantStyles);
      setStyle(ghost, 'will-change', 'opacity, transform', useImportantStyles);
      setStyle(ghost, 'z-index', '2', useImportantStyles);
      siteSearchPrefix.appendChild(ghost);
      return ghost;
    }

    function playInputModePrefixIconSwap(animateIcon, outgoingIcon) {
      const activeIcon = [
        siteSearchPrefixLineIcon,
        siteSearchPrefixIconFrame,
        siteSearchPrefixGlyph
      ].find((element) => isElementVisible(element));
      if (!activeIcon) {
        if (outgoingIcon && outgoingIcon.parentNode) {
          outgoingIcon.parentNode.removeChild(outgoingIcon);
        }
        return;
      }
      setStyle(activeIcon, 'opacity', '1', useImportantStyles);
      setStyle(activeIcon, 'filter', 'none', useImportantStyles);
      setStyle(activeIcon, 'transform', 'none', useImportantStyles);
      setStyle(activeIcon, 'transform-origin', 'center', useImportantStyles);
      setStyle(activeIcon, 'will-change', 'auto', useImportantStyles);
      if (!animateIcon || shouldReduceInputModeMotion() ||
          typeof activeIcon.animate !== 'function') {
        if (outgoingIcon && outgoingIcon.parentNode) {
          outgoingIcon.parentNode.removeChild(outgoingIcon);
        }
        return;
      }
      activeIcon.style.setProperty('opacity', '1');
      activeIcon.style.setProperty('filter', 'none');
      activeIcon.style.setProperty('transform', 'none');
      const animation = activeIcon.animate([
        {
          opacity: 0.45,
          offset: 0,
          transform: 'scale(0.84)'
        },
        {
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          opacity: 1,
          offset: 0.62,
          transform: 'scale(1.05)'
        },
        {
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          opacity: 1,
          offset: 0.84,
          transform: 'scale(0.99)'
        },
        { opacity: 1, offset: 1, transform: 'scale(1)' }
      ], {
        duration: DEFAULT_PREFIX_ICON_POP_DURATION,
        easing: DEFAULT_PREFIX_ICON_POP_EASING
      });
      inputModePrefixIconAnimation = animation;
      inputModePrefixIconAnimationElement = activeIcon;
      setStyle(activeIcon, 'will-change', 'opacity, transform', useImportantStyles);
      animation.onfinish = () => {
        if (inputModePrefixIconAnimation !== animation) {
          return;
        }
        inputModePrefixIconAnimation = null;
        inputModePrefixIconAnimationElement = null;
        setStyle(activeIcon, 'opacity', '1', useImportantStyles);
        setStyle(activeIcon, 'filter', 'none', useImportantStyles);
        setStyle(activeIcon, 'transform', 'none', useImportantStyles);
        setStyle(activeIcon, 'will-change', 'auto', useImportantStyles);
      };
      animation.oncancel = () => {
        if (inputModePrefixIconAnimation === animation) {
          inputModePrefixIconAnimation = null;
          inputModePrefixIconAnimationElement = null;
        }
      };
      if (!outgoingIcon || typeof outgoingIcon.animate !== 'function') {
        if (outgoingIcon && outgoingIcon.parentNode) {
          outgoingIcon.parentNode.removeChild(outgoingIcon);
        }
        return;
      }
      outgoingIcon.style.setProperty('opacity', '1');
      outgoingIcon.style.setProperty('transform', 'none');
      const outgoingAnimation = outgoingIcon.animate([
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.84)' }
      ], {
        duration: DEFAULT_PREFIX_ICON_EXIT_DURATION,
        easing: DEFAULT_PREFIX_ICON_EXIT_EASING
      });
      inputModePrefixIconGhost = outgoingIcon;
      inputModePrefixOutgoingIconAnimation = outgoingAnimation;
      const removeOutgoingIcon = () => {
        if (inputModePrefixOutgoingIconAnimation === outgoingAnimation) {
          inputModePrefixOutgoingIconAnimation = null;
        }
        if (inputModePrefixIconGhost === outgoingIcon) {
          inputModePrefixIconGhost = null;
        }
        if (outgoingIcon.parentNode) {
          outgoingIcon.parentNode.removeChild(outgoingIcon);
        }
      };
      outgoingAnimation.onfinish = removeOutgoingIcon;
      outgoingAnimation.oncancel = removeOutgoingIcon;
    }

    function measureInputModePrefixWidthForText(prefixText) {
      const previousText = String(siteSearchPrefixText.textContent || '');
      siteSearchPrefixText.textContent = String(prefixText || '');
      const width = Number(siteSearchPrefix.getBoundingClientRect().width) || 0;
      siteSearchPrefixText.textContent = previousText;
      return width;
    }

    function setInputModePrefixContent(prefixText, contentOptions) {
      const preserveIconAnimation = Boolean(
        contentOptions && contentOptions.preserveIconAnimation
      );
      const animateIcon = Boolean(contentOptions && contentOptions.animateIcon);
      const animateOutgoingIcon = Boolean(
        contentOptions && contentOptions.animateOutgoingIcon
      );
      let outgoingIcon = null;
      if (!preserveIconAnimation) {
        cancelInputModePrefixIconAnimation();
        outgoingIcon = createInputModePrefixIconGhost(animateOutgoingIcon);
      }
      const contentRevision = ++inputModePrefixContentRevision;
      const iconUrl = contentOptions && contentOptions.iconUrl ? String(contentOptions.iconUrl || '').trim() : '';
      const iconClass = contentOptions && contentOptions.iconClass
        ? String(contentOptions.iconClass).trim()
        : (contentOptions && contentOptions.isAi ? 'ri-search-ai-line' : 'ri-search-line');
      const lineIconName = contentOptions && contentOptions.menuIconName
        ? String(contentOptions.menuIconName).trim()
        : '';
      const hasBuiltInLineIcon = renderModeLineIconSvg(
        siteSearchPrefixLineIcon,
        lineIconName,
        '2'
      );
      if (hasBuiltInLineIcon) {
        setStyle(siteSearchPrefixLineIcon, 'display', 'inline-flex', useImportantStyles);
        setStyle(siteSearchPrefixGlyph, 'display', 'none', useImportantStyles);
        setStyle(siteSearchPrefixIconFrame, 'display', 'none', useImportantStyles);
        setStyle(siteSearchPrefixIcon, 'display', 'none', useImportantStyles);
        siteSearchPrefixIcon.removeAttribute('src');
      } else {
        setStyle(siteSearchPrefixLineIcon, 'display', 'none', useImportantStyles);
        siteSearchPrefixGlyph.className = `ri-icon ri-size-16 ${iconClass}`;
        setStyle(siteSearchPrefixGlyph, 'display', 'inline-flex', useImportantStyles);
        setStyle(siteSearchPrefixGlyph, 'flex', '0 0 auto', useImportantStyles);
      }
      if (!hasBuiltInLineIcon && iconUrl) {
        const icon = siteSearchPrefixIcon;
        siteSearchPrefixIconFrame.style.cssText = cssText([
          ['all', 'unset'],
          ['position', 'relative'],
          ['width', '20px'],
          ['height', '20px'],
          ['border-radius', '6px'],
          ['clip-path', 'inset(0 round 6px)'],
          ['overflow', 'hidden'],
          ['isolation', 'isolate'],
          ['flex', '0 0 20px'],
          ['display', 'inline-flex']
        ], useImportantStyles);
        icon.alt = '';
        icon.decoding = 'async';
        icon.referrerPolicy = 'no-referrer';
        icon.style.cssText = cssText([
          ['all', 'unset'],
          ['width', '20px'],
          ['height', '20px'],
          ['border-radius', '6px'],
          ['clip-path', 'inset(0 round 6px)'],
          ['overflow', 'hidden'],
          ['object-fit', 'contain'],
          ['flex', '0 0 auto'],
          ['display', 'block']
        ], useImportantStyles);
        setStyle(siteSearchPrefixGlyph, 'display', 'none', useImportantStyles);
        const removeUnavailableIcon = () => {
          if (contentRevision !== inputModePrefixContentRevision) {
            return;
          }
          removeProviderIconRuntimeFallbacks(siteSearchPrefix);
          setStyle(siteSearchPrefixIconFrame, 'display', 'none', useImportantStyles);
          setStyle(icon, 'display', 'none', useImportantStyles);
          icon.removeAttribute('src');
          setStyle(siteSearchPrefixGlyph, 'display', 'inline-flex', useImportantStyles);
          updatePrefixLayout();
        };
        const iconHost = contentOptions && contentOptions.iconHost ? String(contentOptions.iconHost || '').trim() : '';
        let handledByProviderIconRuntime = false;
        if (attachProviderIcon && !preferDirectProviderIcons) {
          try {
            handledByProviderIconRuntime = attachProviderIcon(icon, {
              iconHost,
              iconUrl,
              onIconUnavailable: removeUnavailableIcon,
              prefixText,
              provider: contentOptions && contentOptions.provider ? contentOptions.provider : null
            }) === true;
          } catch (e) {
            handledByProviderIconRuntime = false;
          }
        }
        if (!handledByProviderIconRuntime) {
          icon.addEventListener('error', removeUnavailableIcon, { once: true });
          icon.src = iconUrl;
          if (attachFaviconData && !iconUrl.startsWith('data:')) {
            attachFaviconData(icon, iconUrl, iconHost);
          }
        }
      } else if (!hasBuiltInLineIcon) {
        setStyle(siteSearchPrefixIconFrame, 'display', 'none', useImportantStyles);
        setStyle(siteSearchPrefixIcon, 'display', 'none', useImportantStyles);
        siteSearchPrefixIcon.removeAttribute('src');
      }
      setStyle(siteSearchPrefixIcon, 'transition', 'none', useImportantStyles);
      setStyle(siteSearchPrefixIconFrame, 'transition', 'none', useImportantStyles);
      setStyle(siteSearchPrefixGlyph, 'transition', 'none', useImportantStyles);
      setStyle(siteSearchPrefixLineIcon, 'transition', 'none', useImportantStyles);
      const text = siteSearchPrefixText;
      text.textContent = prefixText;
      text.style.cssText = cssText([
        ['all', 'unset'],
        ['display', 'block'],
        ['flex', '0 1 auto'],
        ['min-width', '0'],
        ['overflow', 'hidden'],
        ['text-overflow', 'ellipsis'],
        ['white-space', 'nowrap'],
        ['line-height', '18px']
      ], useImportantStyles);
      siteSearchPrefixCurrentText.textContent = formatMessage(
        'search_scope_current',
        '当前'
      );
      const currentLabelVisible = siteSearchPrefix.getAttribute(
        'data-current-visible'
      ) === 'true';
      siteSearchPrefixCurrent.style.cssText = cssText([
        ['all', 'unset'],
        ['display', currentLabelVisible ? 'inline-flex' : 'none'],
        ['align-items', 'center'],
        ['font-size', '13px'],
        ['font-weight', '600'],
        ['line-height', '18px'],
        ['letter-spacing', '0.04em'],
        ['white-space', 'nowrap'],
        ['overflow', 'hidden'],
        ['flex', '0 0 auto']
      ], useImportantStyles);
      setInputModePrefixIdentity(prefixText, contentOptions);
      setStyle(siteSearchPrefixChevron, 'display', 'inline-flex', useImportantStyles);
      setStyle(siteSearchPrefixChevron, 'flex', '0 0 auto', useImportantStyles);
      if (!preserveIconAnimation) {
        playInputModePrefixIconSwap(animateIcon, outgoingIcon);
      }
    }

    function getInputModePrefixRenderedWidth() {
      if (!isElementVisible(siteSearchPrefix) ||
          typeof siteSearchPrefix.getBoundingClientRect !== 'function') {
        return 0;
      }
      return Math.max(
        0,
        Number(siteSearchPrefix.getBoundingClientRect().width) || 0
      );
    }

    function getInputModePrefixCurrentVisualState() {
      if (!isElementVisible(siteSearchPrefix) ||
          typeof siteSearchPrefixCurrent.getBoundingClientRect !== 'function') {
        return { marginLeft: 0, width: 0 };
      }
      const width = Math.max(
        0,
        Number(siteSearchPrefixCurrent.getBoundingClientRect().width) || 0
      );
      const computedStyle = win && typeof win.getComputedStyle === 'function'
        ? win.getComputedStyle(siteSearchPrefixCurrent)
        : null;
      const marginLeft = computedStyle
        ? Number.parseFloat(computedStyle.marginLeft) || 0
        : 0;
      return { marginLeft, width };
    }

    function clearInputModePrefixCurrentAnimatedStyles() {
      if (siteSearchPrefixCurrent && siteSearchPrefixCurrent.style &&
          typeof siteSearchPrefixCurrent.style.removeProperty === 'function') {
        siteSearchPrefixCurrent.style.removeProperty('width');
        siteSearchPrefixCurrent.style.removeProperty('margin-left');
      }
      setStyle(siteSearchPrefixCurrent, 'will-change', 'auto', useImportantStyles);
    }

    function cancelInputModePrefixCurrentAnimation() {
      const animation = inputModePrefixCurrentAnimation;
      inputModePrefixCurrentAnimation = null;
      if (animation && typeof animation.cancel === 'function') {
        animation.cancel();
      }
      clearInputModePrefixCurrentAnimatedStyles();
    }

    function playInputModePrefixCurrentResizeAnimation(fromState, toState) {
      cancelInputModePrefixCurrentAnimation();
      const animationRevision = inputModePrefixAnimationRevision;
      const startWidth = Math.max(0, Number(fromState && fromState.width) || 0);
      const endWidth = Math.max(0, Number(toState && toState.width) || 0);
      const startMarginLeft = Number(fromState && fromState.marginLeft) || 0;
      const endMarginLeft = Number(toState && toState.marginLeft) || 0;
      const shouldHideOnFinish = endWidth < 0.5;
      setInputModePrefixCurrentVisible(true);
      siteSearchPrefixCurrent.style.setProperty('width', `${endWidth}px`);
      siteSearchPrefixCurrent.style.setProperty('margin-left', `${endMarginLeft}px`);
      if (shouldReduceInputModeMotion() ||
          typeof siteSearchPrefixCurrent.animate !== 'function' ||
          (Math.abs(startWidth - endWidth) < 0.5 &&
            Math.abs(startMarginLeft - endMarginLeft) < 0.5)) {
        if (shouldHideOnFinish) {
          setInputModePrefixCurrentVisible(false);
        }
        clearInputModePrefixCurrentAnimatedStyles();
        updatePrefixLayout();
        return;
      }
      const animation = siteSearchPrefixCurrent.animate([
        {
          marginLeft: `${startMarginLeft}px`,
          width: `${startWidth}px`
        },
        {
          marginLeft: `${endMarginLeft}px`,
          width: `${endWidth}px`
        }
      ], {
        duration: DEFAULT_PREFIX_RESIZE_DURATION,
        easing: DEFAULT_PREFIX_RESIZE_EASING
      });
      inputModePrefixCurrentAnimation = animation;
      setStyle(siteSearchPrefixCurrent, 'will-change', 'width', useImportantStyles);
      const finish = () => {
        if (inputModePrefixCurrentAnimation !== animation ||
            animationRevision !== inputModePrefixAnimationRevision) {
          return;
        }
        inputModePrefixCurrentAnimation = null;
        if (shouldHideOnFinish) {
          setInputModePrefixCurrentVisible(false);
        }
        clearInputModePrefixCurrentAnimatedStyles();
        updatePrefixLayout();
      };
      animation.onfinish = finish;
      animation.oncancel = () => {
        if (inputModePrefixCurrentAnimation === animation) {
          inputModePrefixCurrentAnimation = null;
        }
      };
    }

    function cancelInputModePrefixAnimation(cancelOptions) {
      inputModePrefixAnimationRevision += 1;
      if (!cancelOptions || cancelOptions.preservePendingText !== true) {
        inputModePrefixPendingText = '';
      }
      cancelInputModePrefixCurrentAnimation();
      if (inputModePrefixAnimation) {
        const animation = inputModePrefixAnimation;
        inputModePrefixAnimation = null;
        if (typeof animation.cancel === 'function') {
          animation.cancel();
        }
      }
      if (inputModePrefixAnimationFrame !== null && win && typeof win.cancelAnimationFrame === 'function') {
        win.cancelAnimationFrame(inputModePrefixAnimationFrame);
        inputModePrefixAnimationFrame = null;
      }
      if (inputModePrefixAnimationTimer && win && typeof win.clearTimeout === 'function') {
        win.clearTimeout(inputModePrefixAnimationTimer);
        inputModePrefixAnimationTimer = 0;
      }
      if (siteSearchPrefix && siteSearchPrefix.style) {
        if (typeof siteSearchPrefix.style.removeProperty === 'function') {
          siteSearchPrefix.style.removeProperty('width');
        } else {
          siteSearchPrefix.style.width = '';
        }
      }
    }

    function restoreInputModePrefixAnimatedState() {
      if (siteSearchPrefix && siteSearchPrefix.style) {
        if (typeof siteSearchPrefix.style.removeProperty === 'function') {
          siteSearchPrefix.style.removeProperty('width');
        } else {
          siteSearchPrefix.style.width = '';
        }
      }
      setStyle(siteSearchPrefix, 'opacity', '1', useImportantStyles);
      setStyle(siteSearchPrefix, 'transform', 'translateY(-50%) translateX(0) scaleX(1)', useImportantStyles);
      setStyle(siteSearchPrefix, 'transition', prefixTransition, useImportantStyles);
      setStyle(siteSearchPrefix, 'will-change', 'auto', useImportantStyles);
    }

    function setInputModePrefixRestState(restOptions) {
      cancelInputModePrefixAnimation();
      const transitionEnabled = !restOptions || restOptions.transition !== false;
      setStyle(siteSearchPrefix, 'opacity', '1', useImportantStyles);
      setStyle(siteSearchPrefix, 'transform', 'translateY(-50%) translateX(0) scaleX(1)', useImportantStyles);
      setStyle(siteSearchPrefix, 'transition', transitionEnabled ? prefixTransition : 'none', useImportantStyles);
      setStyle(siteSearchPrefix, 'will-change', 'auto', useImportantStyles);
    }

    function playInputModePrefixEnterAnimation() {
      cancelInputModePrefixAnimation();
      const animationRevision = inputModePrefixAnimationRevision;
      siteSearchPrefix.style.setProperty('opacity', '1');
      siteSearchPrefix.style.setProperty(
        'transform',
        'translateY(-50%) translateX(0) scaleX(1)'
      );
      setStyle(siteSearchPrefix, 'transition', prefixTransition, useImportantStyles);
      if (shouldReduceInputModeMotion() || typeof siteSearchPrefix.animate !== 'function') {
        setStyle(siteSearchPrefix, 'will-change', 'auto', useImportantStyles);
        return;
      }
      const animation = siteSearchPrefix.animate([
        {
          opacity: 0.4,
          transform: 'translateY(-50%) translateX(-4px) scaleX(0.92)'
        },
        {
          opacity: 1,
          transform: 'translateY(-50%) translateX(0) scaleX(1)'
        }
      ], {
        duration: DEFAULT_PREFIX_ENTER_DURATION,
        easing: DEFAULT_PREFIX_ENTER_EASING
      });
      inputModePrefixAnimation = animation;
      setStyle(siteSearchPrefix, 'will-change', 'opacity, transform', useImportantStyles);
      animation.onfinish = () => {
        if (inputModePrefixAnimation !== animation ||
            animationRevision !== inputModePrefixAnimationRevision) {
          return;
        }
        inputModePrefixAnimation = null;
        restoreInputModePrefixAnimatedState();
      };
      animation.oncancel = () => {
        if (inputModePrefixAnimation === animation) {
          inputModePrefixAnimation = null;
        }
      };
    }

    function playInputModePrefixResizeAnimation(fromWidth, toWidth, resizeOptions) {
      const options = resizeOptions || {};
      const onStart = typeof options.onStart === 'function'
        ? options.onStart
        : null;
      const onFinish = typeof options.onFinish === 'function'
        ? options.onFinish
        : null;
      cancelInputModePrefixAnimation({
        preservePendingText: options.preservePendingText === true
      });
      const animationRevision = inputModePrefixAnimationRevision;
      const startWidth = Math.max(0, Number(fromWidth) || 0);
      const endWidth = Math.max(0, Number(toWidth) || 0);
      if (onStart) {
        onStart(animationRevision);
      }
      if (shouldReduceInputModeMotion() || startWidth <= 0 || endWidth <= 0 ||
          Math.abs(startWidth - endWidth) < 1) {
        if (onFinish) {
          onFinish(animationRevision);
        }
        if (animationRevision === inputModePrefixAnimationRevision) {
          restoreInputModePrefixAnimatedState();
        }
        return;
      }
      const keyframes = [
        { width: `${startWidth}px` },
        { width: `${endWidth}px` }
      ];
      setStyle(siteSearchPrefix, 'will-change', 'width', useImportantStyles);
      if (typeof siteSearchPrefix.animate === 'function') {
        const animation = siteSearchPrefix.animate(keyframes, {
          duration: DEFAULT_PREFIX_RESIZE_DURATION,
          easing: DEFAULT_PREFIX_RESIZE_EASING
        });
        inputModePrefixAnimation = animation;
        animation.onfinish = () => {
          if (inputModePrefixAnimation !== animation) {
            return;
          }
          inputModePrefixAnimation = null;
          setStyle(siteSearchPrefix, 'width', `${endWidth}px`, useImportantStyles);
          if (onFinish) {
            onFinish(animationRevision);
          }
          if (animationRevision !== inputModePrefixAnimationRevision) {
            return;
          }
          restoreInputModePrefixAnimatedState();
        };
        animation.oncancel = () => {
          if (inputModePrefixAnimation === animation) {
            inputModePrefixAnimation = null;
          }
        };
        return;
      }
      setStyle(siteSearchPrefix, 'transition', prefixTransition, useImportantStyles);
      setStyle(siteSearchPrefix, 'width', `${startWidth}px`, useImportantStyles);
      inputModePrefixAnimationFrame = win.requestAnimationFrame(() => {
        inputModePrefixAnimationFrame = null;
        setStyle(
          siteSearchPrefix,
          'transition',
          `width ${DEFAULT_PREFIX_RESIZE_DURATION}ms ${DEFAULT_PREFIX_RESIZE_EASING}, ${prefixTransition}`,
          useImportantStyles
        );
        setStyle(siteSearchPrefix, 'width', `${endWidth}px`, useImportantStyles);
        inputModePrefixAnimationTimer = win.setTimeout(() => {
          inputModePrefixAnimationTimer = 0;
          if (animationRevision !== inputModePrefixAnimationRevision) {
            return;
          }
          if (onFinish) {
            onFinish(animationRevision);
          }
          if (animationRevision !== inputModePrefixAnimationRevision) {
            return;
          }
          restoreInputModePrefixAnimatedState();
        }, DEFAULT_PREFIX_RESIZE_DURATION + 10);
      });
    }

    function setInputModePrefixCurrentVisible(visible) {
      const nextVisible = Boolean(visible);
      siteSearchPrefix.setAttribute(
        'data-current-visible',
        nextVisible ? 'true' : 'false'
      );
      const measuring = siteSearchPrefix.getAttribute(
        'data-current-measuring'
      ) === 'true';
      setStyle(
        siteSearchPrefixCurrent,
        'display',
        nextVisible || measuring ? 'inline-flex' : 'none',
        useImportantStyles
      );
    }

    function setInputModePrefixCurrentMeasuring(measuring) {
      const nextMeasuring = Boolean(measuring);
      siteSearchPrefix.setAttribute(
        'data-current-measuring',
        nextMeasuring ? 'true' : 'false'
      );
      const visible = siteSearchPrefix.getAttribute(
        'data-current-visible'
      ) === 'true';
      setStyle(
        siteSearchPrefixCurrent,
        'display',
        nextMeasuring || visible ? 'inline-flex' : 'none',
        useImportantStyles
      );
    }

    function settleInputModePrefixMenuVisualState() {
      const currentVisible = Boolean(modeMenuOpen && !modeMenu.hidden);
      setInputModePrefixCurrentMeasuring(false);
      setInputModePrefixCurrentVisible(currentVisible);
      clearInputModePrefixCurrentAnimatedStyles();
    }

    function setInputModePrefixMenuOpen(open) {
      const nextOpen = Boolean(open);
      const wasOpen = siteSearchPrefix.getAttribute('data-menu-open') === 'true';
      if (wasOpen === nextOpen) {
        if (!nextOpen) {
          setInputModePrefixCurrentVisible(false);
        }
        return;
      }
      const shouldAnimate = isElementVisible(siteSearchPrefix);
      const previousCurrentState = shouldAnimate
        ? getInputModePrefixCurrentVisualState()
        : { marginLeft: 0, width: 0 };
      if (shouldAnimate) {
        cancelInputModePrefixAnimation();
      }
      siteSearchPrefix.setAttribute('data-menu-open', nextOpen ? 'true' : 'false');
      setInputModePrefixCurrentMeasuring(nextOpen);
      const nextCurrentState = nextOpen
        ? getInputModePrefixCurrentVisualState()
        : {
          marginLeft: -DEFAULT_PREFIX_ITEM_GAP_PX,
          width: 0
        };
      setInputModePrefixCurrentMeasuring(false);
      if (shouldAnimate) {
        if (nextOpen && previousCurrentState.width < 0.5) {
          previousCurrentState.marginLeft = -DEFAULT_PREFIX_ITEM_GAP_PX;
        }
        playInputModePrefixCurrentResizeAnimation(
          previousCurrentState,
          nextCurrentState
        );
      } else if (nextOpen) {
        setInputModePrefixCurrentVisible(true);
        updatePrefixLayout();
      } else {
        setInputModePrefixCurrentVisible(false);
        updatePrefixLayout();
      }
    }

    function resetModeTagRemovalConfirmation() {
      const wasPending = modeTagRemovalConfirmationPending;
      if (modeTagRemovalConfirmationTimer && win &&
          typeof win.clearTimeout === 'function') {
        win.clearTimeout(modeTagRemovalConfirmationTimer);
      }
      modeTagRemovalConfirmationTimer = 0;
      modeTagRemovalConfirmationPending = false;
      if (wasPending &&
          typeof config.onModeTagRemovalConfirmationReset === 'function') {
        config.onModeTagRemovalConfirmationReset();
      }
      return wasPending;
    }

    function resetModeMenuDoubleTab() {
      const wasPending = modeMenuDoubleTabPending;
      if (modeMenuDoubleTabTimer && win &&
          typeof win.clearTimeout === 'function') {
        win.clearTimeout(modeMenuDoubleTabTimer);
      }
      modeMenuDoubleTabTimer = 0;
      modeMenuDoubleTabPending = false;
      return wasPending;
    }

    function shouldOpenModeMenuOnDoubleTab(event) {
      if (destroyed || !event || event.key !== 'Tab' || event.defaultPrevented) {
        return false;
      }
      const hasModifier = Boolean(
        event.shiftKey || event.metaKey || event.ctrlKey || event.altKey
      );
      const hasInput = String(input.value || '') !== '';
      const hasModeTag = Boolean(
        String(siteSearchPrefix.getAttribute('data-mode-id') || '')
      );
      if (hasModifier || hasInput || hasModeTag || modeMenuOpen || modeMenuPending) {
        resetModeMenuDoubleTab();
        return false;
      }
      if (event.repeat) {
        if (modeMenuDoubleTabPending && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        return false;
      }
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (modeMenuDoubleTabPending) {
        resetModeMenuDoubleTab();
        return true;
      }
      modeMenuDoubleTabPending = true;
      const configuredDuration = Number(config.modeMenuDoubleTabDuration);
      const duration = Number.isFinite(configuredDuration)
        ? Math.max(0, configuredDuration)
        : DEFAULT_MODE_MENU_DOUBLE_TAB_DURATION;
      if (win && typeof win.setTimeout === 'function' && duration > 0) {
        modeMenuDoubleTabTimer = win.setTimeout(() => {
          modeMenuDoubleTabTimer = 0;
          resetModeMenuDoubleTab();
        }, duration);
      }
      return false;
    }

    function shouldCompleteModeMenuDoubleTab(event) {
      if (destroyed || !modeMenuDoubleTabPending || !event ||
          event.key !== 'Tab' || event.defaultPrevented) {
        return false;
      }
      const hasModifier = Boolean(
        event.shiftKey || event.metaKey || event.ctrlKey || event.altKey
      );
      const hasInput = String(input.value || '') !== '';
      if (hasModifier || hasInput || modeMenuOpen || modeMenuPending) {
        resetModeMenuDoubleTab();
        return false;
      }
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (event.repeat) {
        return false;
      }
      resetModeMenuDoubleTab();
      return true;
    }

    function shouldContainModeMenuTab(event) {
      if (destroyed || !event || event.key !== 'Tab' || event.defaultPrevented ||
          (!modeMenuOpen && !modeMenuPending)) {
        return false;
      }
      const hasModifier = Boolean(
        event.shiftKey || event.metaKey || event.ctrlKey || event.altKey
      );
      if (hasModifier) {
        return false;
      }
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      resetModeMenuDoubleTab();
      return true;
    }

    function shouldOpenModeMenuForActiveModeOnTab(event) {
      if (destroyed || !event || event.key !== 'Tab' || event.defaultPrevented) {
        return false;
      }
      const hasModifier = Boolean(
        event.shiftKey || event.metaKey || event.ctrlKey || event.altKey
      );
      const hasModeTag = Boolean(
        String(siteSearchPrefix.getAttribute('data-mode-id') || '')
      );
      if (hasModifier || event.repeat ||
          modeMenuOpen || modeMenuPending) {
        resetModeMenuDoubleTab();
        return false;
      }
      if (!hasModeTag) {
        return false;
      }
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      resetModeMenuDoubleTab();
      return true;
    }

    function shouldRemoveModeTagOnBackspace(event) {
      if (destroyed || String(input.value || '') !== '') {
        resetModeTagRemovalConfirmation();
        return false;
      }
      if (!modeMenuOpen || modeMenu.hidden) {
        resetModeTagRemovalConfirmation();
        return true;
      }
      if (event && event.repeat) {
        return false;
      }
      if (modeTagRemovalConfirmationPending) {
        resetModeTagRemovalConfirmation();
        return true;
      }
      modeTagRemovalConfirmationPending = true;
      const configuredDuration = Number(
        config.modeTagRemovalConfirmationDuration
      );
      const duration = Number.isFinite(configuredDuration)
        ? Math.max(0, configuredDuration)
        : DEFAULT_MODE_TAG_REMOVAL_CONFIRMATION_DURATION;
      if (win && typeof win.setTimeout === 'function' && duration > 0) {
        modeTagRemovalConfirmationTimer = win.setTimeout(() => {
          modeTagRemovalConfirmationTimer = 0;
          resetModeTagRemovalConfirmation();
        }, duration);
      }
      if (typeof config.onModeTagRemovalConfirmation === 'function') {
        config.onModeTagRemovalConfirmation({ duration });
      }
      return false;
    }

    function setPrefixText(prefixText, theme, prefixOptions) {
      const nextOptions = prefixOptions || {};
      const nextPrefixText = String(prefixText || '');
      const shouldAnimate = Boolean(nextOptions.animate);
      const nextModeId = nextOptions.modeId ? String(nextOptions.modeId) : '';
      const previousModeId = String(siteSearchPrefix.getAttribute('data-mode-id') || '');
      const previousPrefixText = String(siteSearchPrefixText.textContent || '');
      if (previousModeId !== nextModeId || previousPrefixText !== nextPrefixText) {
        if (!nextOptions.preserveModeMenuDoubleTab) {
          resetModeMenuDoubleTab();
        }
        resetModeTagRemovalConfirmation();
      }
      const isSameMode = previousModeId === nextModeId;
      const isRepeatedMode = Boolean(previousModeId && isSameMode);
      const shouldAnimateResize = Boolean(
        shouldAnimate &&
        previousModeId &&
        !isSameMode &&
        isElementVisible(siteSearchPrefix)
      );
      const hasActivePrefixAnimation = Boolean(
        inputModePrefixAnimation ||
        inputModePrefixCurrentAnimation ||
        inputModePrefixAnimationFrame !== null ||
        inputModePrefixAnimationTimer
      );
      const shouldWaitForPendingText = Boolean(
        !shouldAnimate &&
        isSameMode &&
        hasActivePrefixAnimation &&
        inputModePrefixPendingText === nextPrefixText
      );
      const previousWidth = shouldAnimateResize
        ? getInputModePrefixRenderedWidth()
        : 0;
      if (shouldAnimateResize) {
        cancelInputModePrefixAnimation();
        settleInputModePrefixMenuVisualState();
      }
      const shouldPreserveAnimation = !shouldAnimate && isSameMode && Boolean(
        hasActivePrefixAnimation
      );
      if (shouldAnimateResize) {
        setStyle(siteSearchPrefix, 'transition', prefixTransition, useImportantStyles);
      } else if (!shouldAnimate && !shouldPreserveAnimation) {
        setStyle(siteSearchPrefix, 'transition', 'none', useImportantStyles);
      }
      setInputModePrefixIdentity(nextPrefixText, nextOptions);
      const visual = applyInputModePrefixVisual(theme, nextOptions);
      setStyle(siteSearchPrefix, 'display', 'inline-flex', useImportantStyles);
      if (shouldWaitForPendingText) {
        syncInputPlaceholder();
        setInputStyle(input, 'caret-color', visual.caretColor);
        updatePrefixLayout();
        return;
      }
      const contentOptions = {
        ...nextOptions,
        animateIcon: shouldAnimate && !isRepeatedMode,
        animateOutgoingIcon: shouldAnimateResize,
        preserveIconAnimation: !shouldAnimate && isSameMode
      };
      if (shouldAnimateResize) {
        const targetWidth = measureInputModePrefixWidthForText(nextPrefixText);
        if (targetWidth > previousWidth + 0.5) {
          inputModePrefixPendingText = nextPrefixText;
          syncInputPlaceholder();
          setInputStyle(input, 'caret-color', visual.caretColor);
          updatePrefixLayout();
          playInputModePrefixResizeAnimation(previousWidth, targetWidth, {
            preservePendingText: true,
            onFinish: () => {
              if (inputModePrefixPendingText !== nextPrefixText) {
                return;
              }
              inputModePrefixPendingText = '';
              setInputModePrefixContent(nextPrefixText, contentOptions);
              updatePrefixLayout();
            }
          });
          return;
        }
      }
      setInputModePrefixContent(nextPrefixText, contentOptions);
      const nextWidth = shouldAnimateResize
        ? Number(siteSearchPrefix.getBoundingClientRect().width) || 0
        : 0;
      if (!shouldAnimate && !shouldPreserveAnimation) {
        setInputModePrefixRestState({ transition: false });
      }
      syncInputPlaceholder();
      setInputStyle(input, 'caret-color', visual.caretColor);
      updatePrefixLayout();
      if (shouldAnimate && !isRepeatedMode) {
        if (shouldAnimateResize) {
          playInputModePrefixResizeAnimation(previousWidth, nextWidth);
        } else {
          playInputModePrefixEnterAnimation();
        }
      }
    }

    function setProviderPrefix(provider, theme, providerOptions) {
      const isAi = isAiSiteSearchProvider(provider);
      const nextOptions = {
        ...(providerOptions || {}),
        iconUrl: getProviderIcon(provider),
        iconHost: getProviderThemeHost(provider),
        iconClass: isAi ? 'ri-search-ai-line' : 'ri-global-line',
        modeId: `provider:${provider && (provider.key || provider.name) ? (provider.key || provider.name) : ''}`,
        provider,
        isAi
      };
      setPrefixText(getSiteSearchPrefixText(provider), theme, nextOptions);
    }

    function clearProviderPrefix() {
      resetModeMenuDoubleTab();
      resetModeTagRemovalConfirmation();
      cancelInputModePrefixIconAnimation();
      inputModePrefixContentRevision += 1;
      siteSearchPrefixText.textContent = '';
      siteSearchPrefix.removeAttribute('data-mode-id');
      siteSearchPrefix.removeAttribute('aria-label');
      setStyle(siteSearchPrefixIcon, 'display', 'none', useImportantStyles);
      setStyle(siteSearchPrefixIconFrame, 'display', 'none', useImportantStyles);
      siteSearchPrefixIcon.removeAttribute('src');
      setStyle(siteSearchPrefixGlyph, 'display', 'none', useImportantStyles);
      setStyle(siteSearchPrefixLineIcon, 'display', 'none', useImportantStyles);
      setStyle(siteSearchPrefixChevron, 'display', 'none', useImportantStyles);
      setInputModePrefixRestState({ transition: false });
      setStyle(siteSearchPrefix, 'display', 'none', useImportantStyles);
      closeModeMenu(false);
      input.placeholder = getDefaultPlaceholder();
      setInputStyle(input, 'caret-color', defaultCaretColor);
      updatePrefixLayout();
    }

    function removeProviderIconRuntimeFallbacks(parent) {
      if (!parent || typeof parent.querySelectorAll !== 'function') {
        return;
      }
      parent.querySelectorAll(
        '._x_extension_favicon_fallback_2024_unique_, ' +
        '._x_extension_overlay_favicon_fallback_2026_unique_, ' +
        '.x-nt-favicon-fallback, ' +
        '.x-ov-suggestion-favicon-fallback'
      ).forEach((node) => node.remove());
    }

    function renderTabHint(provider) {
      const site = getSiteSearchDisplayName(provider);
      const explicitLabel = provider && provider.tabHintLabel
        ? String(provider.tabHintLabel).trim()
        : '';
      const label = explicitLabel ||
        formatMessage('site_search_tab_hint', '使用 {site} 搜索', { site });
      const keyLabel = siteSearchTabHintKey;
      keyLabel.textContent = 'Tab';
      keyLabel.style.cssText = cssText([
        ['all', 'unset'],
        ['display', 'inline-flex'],
        ['align-items', 'center'],
        ['justify-content', 'center'],
        ['min-width', '32px'],
        ['height', '22px'],
        ['padding', '0 6px'],
        ['border-radius', '7px'],
        ['border', `1px solid ${vars.panelBorder}`],
        ['background', vars.tagBg],
        ['color', vars.tagText],
        ['box-sizing', 'border-box'],
        ['font-size', '11px'],
        ['font-family', 'inherit'],
        ['font-weight', '700'],
        ['line-height', '14px'],
        ['letter-spacing', '0'],
        ['white-space', 'nowrap'],
        ['flex', '0 0 auto']
      ], useImportantStyles);
      const textLabel = siteSearchTabHintText;
      textLabel.textContent = label;
      textLabel.style.cssText = cssText([
        ['all', 'unset'],
        ['display', 'inline-block'],
        ['min-width', '0'],
        ['max-width', '220px'],
        ['overflow', 'hidden'],
        ['text-overflow', 'ellipsis'],
        ['white-space', 'nowrap'],
        ['color', vars.tagText],
        ['font-size', '13px'],
        ['font-family', 'inherit'],
        ['font-weight', '400'],
        ['line-height', '18px'],
        ['letter-spacing', '0'],
        ['flex', '1 1 auto']
      ], useImportantStyles);
      if (provider) {
        siteSearchTabHint.setAttribute('title', label);
      } else {
        siteSearchTabHint.removeAttribute('title');
      }
    }

    function setTabHintVisible(visible, provider) {
      if (!visible) {
        setStyle(siteSearchTabHint, 'display', 'none', useImportantStyles);
        siteSearchTabHint.removeAttribute('title');
        updateInputRightPadding();
        return;
      }
      if (typeof config.isTabHintSuppressed === 'function' && config.isTabHintSuppressed()) {
        return;
      }
      renderTabHint(provider);
      setStyle(siteSearchTabHint, 'display', 'inline-flex', useImportantStyles);
      updateInputRightPadding();
    }

    function clearModeMenuContents() {
      if (modeMenuCursorTooltipController &&
          typeof modeMenuCursorTooltipController.hide === 'function') {
        modeMenuCursorTooltipController.hide();
      }
      while (modeMenuContent.firstChild) {
        modeMenuContent.removeChild(modeMenuContent.firstChild);
      }
    }

    function applyModeMenuIconTheme(wrap, menuItem, theme) {
      if (!wrap) {
        return;
      }
      const resolvedTheme = theme ? getThemeForMode(theme) : defaultTheme;
      const resolvedAccentRgb = resolvedTheme && (
        resolvedTheme.accentRgb || parseCssColor(resolvedTheme.accent)
      ) || defaultAccentColor;
      const accentRgb = mixRgb(resolvedAccentRgb, resolvedAccentRgb, 0);
      const darkMode = Boolean(isDarkMode());
      const panelRgb = darkMode ? [20, 20, 20] : [255, 255, 255];
      const selectedBackgroundOpacity = darkMode ? 0.2 : 0.14;
      const selectedBackgroundRgb = mixRgb(
        accentRgb,
        panelRgb,
        1 - selectedBackgroundOpacity
      );
      const focusRingRgb = getAccessibleThemeFocusRingRgb(
        accentRgb,
        selectedBackgroundRgb
      );
      setStyle(
        wrap,
        '--x-lumno-search-mode-icon-color',
        rgbToCss(focusRingRgb),
        useImportantStyles
      );
      if (menuItem) {
        setStyle(
          menuItem,
          '--x-lumno-search-mode-selected-bg',
          `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, ${selectedBackgroundOpacity})`,
          useImportantStyles
        );
        setStyle(
          menuItem,
          '--x-lumno-search-mode-item-focus-ring',
          rgbToCss(focusRingRgb),
          useImportantStyles
        );
      }
    }

    function applyModeMenuBuiltInIconTheme(wrap, menuItem) {
      const surfaceColor = getBuiltInSurfaceColor();
      const darkMode = Boolean(isDarkMode());
      const selectedBackground = `color-mix(in srgb, ${surfaceColor} ${darkMode ? 16 : 11}%, transparent)`;
      setStyle(
        wrap,
        '--x-lumno-search-mode-icon-color',
        surfaceColor,
        useImportantStyles
      );
      if (menuItem) {
        setStyle(
          menuItem,
          '--x-lumno-search-mode-selected-bg',
          selectedBackground,
          useImportantStyles
        );
        setStyle(
          menuItem,
          '--x-lumno-search-mode-item-focus-ring',
          surfaceColor,
          useImportantStyles
        );
      }
    }

    function renderModeLineIconSvg(svg, lineIconName, strokeWidth) {
      const lineIconPaths = getModeMenuLineIconPaths(lineIconName);
      if (!svg || !lineIconPaths) {
        return false;
      }
      while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
      }
      svg.setAttribute('data-icon-name', lineIconName);
      svg.setAttribute('fill', 'none');
      svg.setAttribute('focusable', 'false');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('stroke-width', strokeWidth || '1.65');
      svg.setAttribute('viewBox', '0 0 24 24');
      lineIconPaths.forEach((pathData) => {
        const path = createSvgElement('path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);
      });
      return true;
    }

    function createModeMenuGlyph(item) {
      const lineIconName = item.menuIconName ? String(item.menuIconName).trim() : '';
      const svg = createSvgElement('svg');
      if (renderModeLineIconSvg(svg, lineIconName, '1.65')) {
        svg.classList.add('x-lumno-search-input-mode__menu-line-icon');
        return svg;
      }
      const glyph = doc.createElement('i');
      glyph.className = `ri-icon ri-size-24 ${item.iconClass || (item.isAi ? 'ri-search-ai-line' : 'ri-search-line')}`;
      return glyph;
    }

    function setModeMenuGlyphHidden(glyph, hidden) {
      if (hidden) {
        glyph.setAttribute('hidden', '');
        return;
      }
      glyph.removeAttribute('hidden');
    }

    function createModeMenuIcon(item, menuItem) {
      const lineIconName = item.menuIconName ? String(item.menuIconName).trim() : '';
      const isBuiltInLineIcon = Boolean(getModeMenuLineIconPaths(lineIconName));
      const wrap = doc.createElement('span');
      wrap.className = 'x-lumno-search-input-mode__menu-icon';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.setAttribute('data-icon-state', 'fallback');
      if (isBuiltInLineIcon) {
        wrap.setAttribute('data-icon-kind', 'builtin');
      }
      const faviconMask = doc.createElement('span');
      faviconMask.className = 'x-lumno-search-input-mode__menu-favicon-mask';
      const glyph = createModeMenuGlyph(item);
      faviconMask.appendChild(glyph);
      wrap.appendChild(faviconMask);
      if (isBuiltInLineIcon) {
        applyModeMenuBuiltInIconTheme(wrap, menuItem);
      } else {
        applyModeMenuIconTheme(wrap, menuItem, item.theme || defaultTheme);
      }
      if (item.provider && getThemeForProvider) {
        Promise.resolve(getThemeForProvider(item.provider)).then((theme) => {
          if (!destroyed && wrap.isConnected && theme) {
            applyModeMenuIconTheme(wrap, menuItem, theme);
          }
        }).catch(() => {});
      }
      const iconUrl = item.iconUrl ? String(item.iconUrl).trim() : '';
      if (iconUrl) {
        const image = doc.createElement('img');
        image.alt = '';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        const showFallback = () => {
          wrap.setAttribute('data-icon-state', 'fallback');
          removeProviderIconRuntimeFallbacks(wrap);
          image.remove();
          setModeMenuGlyphHidden(glyph, false);
        };
        image.addEventListener('load', () => {
          wrap.setAttribute('data-icon-state', 'resolved');
          removeProviderIconRuntimeFallbacks(wrap);
          setModeMenuGlyphHidden(glyph, true);
        }, { once: true });
        faviconMask.appendChild(image);
        const provider = item.provider || null;
        const iconHost = provider ? String(getProviderThemeHost(provider) || '').trim() : '';
        let handledByProviderIconRuntime = false;
        if (attachProviderIcon && provider && !preferDirectProviderIcons) {
          try {
            handledByProviderIconRuntime = attachProviderIcon(image, {
              iconHost,
              iconUrl,
              onIconUnavailable: showFallback,
              prefixText: String(item.label || ''),
              provider
            }) === true;
          } catch (e) {
            handledByProviderIconRuntime = false;
          }
        }
        if (!handledByProviderIconRuntime) {
          image.addEventListener('error', showFallback, { once: true });
          image.src = iconUrl;
          if (attachFaviconData && !iconUrl.startsWith('data:')) {
            attachFaviconData(image, iconUrl, iconHost);
          }
        }
      }
      return wrap;
    }

    function normalizeModeMenuSearchText(value) {
      return Array.from(
        String(value || '').normalize('NFKD').toLowerCase()
      ).filter((character) => !/[\u0300-\u036f]/.test(character))
        .filter((character) => /[a-z0-9\u3400-\u9fff]/.test(character))
        .join('');
    }

    function appendModeMenuSearchSequence(sequence, characterMap, value, range) {
      const normalized = normalizeModeMenuSearchText(value);
      Array.from(normalized).forEach((character) => {
        sequence.push(character);
        characterMap.push(range);
      });
    }

    function getModeMenuPinyinSyllable(character) {
      if (!/[\u3400-\u9fff]/.test(character)) {
        return normalizeModeMenuSearchText(character);
      }
      const pinyinApi = getModeMenuPinyinApi();
      if (!pinyinApi || typeof pinyinApi.pinyin !== 'function') {
        return MODE_MENU_PINYIN_FALLBACKS[character] || '';
      }
      try {
        const result = pinyinApi.pinyin(character, {
          toneType: 'none',
          type: 'array',
          nonZh: 'removed',
          v: false
        });
        return normalizeModeMenuSearchText(
          Array.isArray(result) ? result.join('') : result
        ) || MODE_MENU_PINYIN_FALLBACKS[character] || '';
      } catch (error) {
        return MODE_MENU_PINYIN_FALLBACKS[character] || '';
      }
    }

    function buildModeMenuSearchIndex(item) {
      const labelText = String(item && item.label ? item.label : '');
      const labelSequence = [];
      const labelMap = [];
      const pinyinSequence = [];
      const pinyinMap = [];
      const initialSequence = [];
      const initialMap = [];
      let sourceOffset = 0;
      Array.from(labelText).forEach((character) => {
        const start = sourceOffset;
        sourceOffset += character.length;
        const range = Object.freeze({ start, end: sourceOffset });
        appendModeMenuSearchSequence(
          labelSequence,
          labelMap,
          character,
          range
        );
        const syllable = getModeMenuPinyinSyllable(character);
        appendModeMenuSearchSequence(
          pinyinSequence,
          pinyinMap,
          syllable,
          range
        );
        if (syllable) {
          appendModeMenuSearchSequence(
            initialSequence,
            initialMap,
            syllable.charAt(0),
            range
          );
        }
      });
      const provider = item && item.provider ? item.provider : null;
      const searchTerms = []
        .concat(Array.isArray(item && item.searchTerms) ? item.searchTerms : [])
        .concat(provider ? [provider.key, provider.name] : [])
        .concat(provider && Array.isArray(provider.aliases) ? provider.aliases : [])
        .map(normalizeModeMenuSearchText)
        .filter(Boolean);
      return Object.freeze({
        label: labelSequence.join(''),
        labelMap,
        pinyin: pinyinSequence.join(''),
        pinyinMap,
        initials: initialSequence.join(''),
        initialMap,
        searchTerms
      });
    }

    function getModeMenuSearchRange(sequence, characterMap, query) {
      const startIndex = sequence.indexOf(query);
      if (startIndex < 0 || !characterMap[startIndex]) {
        return null;
      }
      const lastRange = characterMap[startIndex + query.length - 1];
      if (!lastRange) {
        return null;
      }
      return {
        start: characterMap[startIndex].start,
        end: lastRange.end
      };
    }

    function getModeMenuItemMatch(entry, normalizedQuery) {
      if (!normalizedQuery) {
        return { matched: true, ranges: [] };
      }
      const index = entry.searchIndex;
      const directRange = getModeMenuSearchRange(
        index.label,
        index.labelMap,
        normalizedQuery
      );
      if (directRange) {
        return { matched: true, ranges: [directRange] };
      }
      const pinyinRange = getModeMenuSearchRange(
        index.pinyin,
        index.pinyinMap,
        normalizedQuery
      );
      if (pinyinRange) {
        return { matched: true, ranges: [pinyinRange] };
      }
      const initialsRange = normalizedQuery.length >= 2
        ? getModeMenuSearchRange(
          index.initials,
          index.initialMap,
          normalizedQuery
        )
        : null;
      if (initialsRange) {
        return { matched: true, ranges: [initialsRange] };
      }
      const matchedSearchTerm = index.searchTerms.some((term) => (
        term.includes(normalizedQuery)
      ));
      if (matchedSearchTerm) {
        return {
          matched: true,
          ranges: entry.labelText ? [{ start: 0, end: entry.labelText.length }] : []
        };
      }
      return { matched: false, ranges: [] };
    }

    function renderModeMenuLabelMatch(label, labelText, ranges) {
      while (label.firstChild) {
        label.removeChild(label.firstChild);
      }
      const normalizedRanges = (Array.isArray(ranges) ? ranges : [])
        .map((range) => ({
          start: Math.max(0, Number(range && range.start) || 0),
          end: Math.min(labelText.length, Number(range && range.end) || 0)
        }))
        .filter((range) => range.end > range.start)
        .sort((left, right) => left.start - right.start);
      if (normalizedRanges.length === 0) {
        label.textContent = labelText;
        return;
      }
      let offset = 0;
      normalizedRanges.forEach((range) => {
        if (range.start > offset) {
          label.appendChild(doc.createTextNode(labelText.slice(offset, range.start)));
        }
        const mark = doc.createElement('mark');
        mark.className = 'x-lumno-search-input-mode__menu-match';
        mark.textContent = labelText.slice(range.start, range.end);
        label.appendChild(mark);
        offset = range.end;
      });
      if (offset < labelText.length) {
        label.appendChild(doc.createTextNode(labelText.slice(offset)));
      }
    }

    function createModeMenuLabel(labelText) {
      const text = String(labelText || '');
      const label = doc.createElement('span');
      label.className = 'x-lumno-search-input-mode__menu-label';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = text;
      return label;
    }

    function bindModeMenuLabelTooltip(button, label, labelText) {
      if (!modeMenuCursorTooltipController ||
          typeof modeMenuCursorTooltipController.bind !== 'function') {
        return;
      }
      const updateTruncatedState = () => {
        const isTruncated = typeof cursorTooltipApi.isElementTextTruncated === 'function'
          ? cursorTooltipApi.isElementTextTruncated(label)
          : Number(label.clientWidth) > 0 &&
            Number(label.scrollWidth) > Number(label.clientWidth);
        button.setAttribute('data-label-truncated', isTruncated ? 'true' : 'false');
        return isTruncated;
      };
      modeMenuCursorTooltipController.bind(button, () => String(labelText || ''), {
        maxWidth: 320,
        shouldShow: updateTruncatedState,
        deferHideVisibility: true,
        preserveVisibleOnTargetSwitch: true,
        handoffRoot: modeMenu
      });
    }

    function getAllModeMenuButtons() {
      return Array.from(modeMenu.querySelectorAll('[role="menuitemradio"]'));
    }

    function getModeMenuButtons() {
      return getAllModeMenuButtons().filter((button) => !button.hidden);
    }

    function getModeMenuActiveElement() {
      const rootNode = typeof modeMenu.getRootNode === 'function'
        ? modeMenu.getRootNode()
        : doc;
      return rootNode && rootNode.activeElement
        ? rootNode.activeElement
        : doc.activeElement;
    }

    function setModeMenuSearchActive(active) {
      modeMenu.setAttribute('data-search-active', active ? 'true' : 'false');
    }

    function focusModeMenuSearch() {
      if (destroyed || !modeMenuOpen || modeMenu.hidden) {
        return false;
      }
      getModeMenuButtons().forEach((button) => {
        button.tabIndex = -1;
      });
      setModeMenuSearchActive(true);
      modeMenu.focus({ preventScroll: true });
      return true;
    }

    function focusModeInput() {
      if (destroyed || !input || typeof input.focus !== 'function') {
        return false;
      }
      modeMenuKeyboardNavigationActive = false;
      setModeMenuSearchActive(false);
      input.focus({ preventScroll: true });
      return true;
    }

    function shouldHandleModeMenuKeyEvent(event) {
      if (destroyed || !modeMenuOpen || modeMenu.hidden) {
        return false;
      }
      const activeElement = getModeMenuActiveElement();
      const eventTarget = event && event.target;
      return Boolean(
        activeElement === modeMenu || modeMenu.contains(activeElement) ||
        eventTarget === modeMenu || modeMenu.contains(eventTarget)
      );
    }

    function scrollModeMenuButtonIntoView(button, scrollOptions) {
      if (!button || !modeMenuContent ||
          typeof button.getBoundingClientRect !== 'function' ||
          typeof modeMenuContent.getBoundingClientRect !== 'function') {
        return;
      }
      const buttonRect = button.getBoundingClientRect();
      const contentRect = modeMenuContent.getBoundingClientRect();
      const topBoundary = contentRect.top + DEFAULT_MODE_MENU_SCROLL_TOP_CONTEXT;
      const bottomBoundary = contentRect.bottom -
        DEFAULT_MODE_MENU_SCROLL_BOTTOM_CONTEXT;
      let scrollDelta = 0;
      if (buttonRect.top < topBoundary) {
        scrollDelta = buttonRect.top - topBoundary;
      } else if (buttonRect.bottom > bottomBoundary) {
        scrollDelta = buttonRect.bottom - bottomBoundary;
      }
      if (scrollDelta === 0) {
        return;
      }
      const targetScrollTop = Math.max(
        0,
        (Number(modeMenuContent.scrollTop) || 0) + scrollDelta
      );
      const prefersReducedMotion = typeof win.matchMedia === 'function' &&
        win.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const shouldSmoothScroll = scrollOptions &&
        scrollOptions.smooth === true &&
        !prefersReducedMotion;
      if (shouldSmoothScroll && typeof modeMenuContent.scrollTo === 'function') {
        modeMenuContent.scrollTo({
          behavior: 'smooth',
          top: targetScrollTop
        });
      } else {
        modeMenuContent.scrollTop = targetScrollTop;
      }
    }

    function focusModeMenuButton(index, focusOptions) {
      const buttons = getModeMenuButtons();
      if (buttons.length === 0) {
        return false;
      }
      const normalizedIndex = ((index % buttons.length) + buttons.length) % buttons.length;
      buttons.forEach((button, buttonIndex) => {
        button.tabIndex = buttonIndex === normalizedIndex ? 0 : -1;
      });
      buttons[normalizedIndex].focus({ preventScroll: true });
      scrollModeMenuButtonIntoView(buttons[normalizedIndex], {
        smooth: Boolean(focusOptions && focusOptions.smoothScroll)
      });
      return true;
    }

    function focusFirstModeMenuFilterResult() {
      const hasFilterQuery = Boolean(
        normalizeModeMenuSearchText(modeMenuFilterQuery)
      );
      if (hasFilterQuery && focusModeMenuButton(0)) {
        modeMenuKeyboardNavigationActive = true;
        setModeMenuSearchActive(true);
        return true;
      }
      modeMenuKeyboardNavigationActive = false;
      return focusModeMenuSearch();
    }

    function getModeMenuButtonLayout(button, index) {
      const rect = button && typeof button.getBoundingClientRect === 'function'
        ? button.getBoundingClientRect()
        : null;
      const left = Number(rect && rect.left) || 0;
      const top = Number(rect && rect.top) || 0;
      const width = Number(rect && rect.width) || 0;
      const height = Number(rect && rect.height) || 0;
      return {
        bottom: Number(rect && rect.bottom) || top + height,
        centerX: left + (width / 2),
        centerY: top + (height / 2),
        height,
        index,
        left,
        right: Number(rect && rect.right) || left + width,
        top,
        width
      };
    }

    function getModeMenuButtonRows(buttons) {
      const layouts = buttons.map(getModeMenuButtonLayout);
      const hasMeasuredLayout = layouts.some((layout) => (
        layout.width > 0 && layout.height > 0
      ));
      if (!hasMeasuredLayout) {
        return null;
      }
      const rows = [];
      layouts.forEach((layout) => {
        let row = rows.find((candidate) => {
          const tolerance = Math.max(
            2,
            Math.min(candidate.averageHeight, layout.height) * 0.4
          );
          return Math.abs(candidate.centerY - layout.centerY) <= tolerance;
        });
        if (!row) {
          row = {
            averageHeight: layout.height,
            centerY: layout.centerY,
            items: []
          };
          rows.push(row);
        }
        row.items.push(layout);
        const itemCount = row.items.length;
        row.centerY = row.items.reduce((total, item) => total + item.centerY, 0) /
          itemCount;
        row.averageHeight = row.items.reduce((total, item) => total + item.height, 0) /
          itemCount;
      });
      rows.sort((left, right) => left.centerY - right.centerY);
      rows.forEach((row) => {
        row.items.sort((left, right) => left.centerX - right.centerX);
      });
      return rows;
    }

    function getModeMenuDirectionalIndex(buttons, currentIndex, key) {
      if (buttons.length === 0) {
        return -1;
      }
      const movesForward = key === 'ArrowDown' || key === 'ArrowRight';
      if (currentIndex < 0) {
        return movesForward ? 0 : buttons.length - 1;
      }
      const rows = getModeMenuButtonRows(buttons);
      if (!rows) {
        return ((currentIndex + (movesForward ? 1 : -1)) % buttons.length +
          buttons.length) % buttons.length;
      }
      const currentRowIndex = rows.findIndex((row) => (
        row.items.some((item) => item.index === currentIndex)
      ));
      if (currentRowIndex < 0) {
        return currentIndex;
      }
      const currentRow = rows[currentRowIndex];
      const currentItemIndex = currentRow.items.findIndex((item) => (
        item.index === currentIndex
      ));
      const currentItem = currentRow.items[currentItemIndex];
      if (!currentItem) {
        return currentIndex;
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const horizontalOffset = key === 'ArrowRight' ? 1 : -1;
        const target = currentRow.items[currentItemIndex + horizontalOffset];
        return target ? target.index : currentIndex;
      }
      const verticalOffset = key === 'ArrowDown' ? 1 : -1;
      const targetRow = rows[currentRowIndex + verticalOffset];
      if (!targetRow) {
        return currentIndex;
      }
      return targetRow.items.reduce((closest, candidate) => {
        if (!closest) {
          return candidate;
        }
        const candidateDistance = Math.abs(candidate.centerX - currentItem.centerX);
        const closestDistance = Math.abs(closest.centerX - currentItem.centerX);
        return candidateDistance < closestDistance ? candidate : closest;
      }, null).index;
    }

    function syncModeMenuSelection(modeId) {
      const selectedModeId = String(modeId || '');
      let matched = false;
      getAllModeMenuButtons().forEach((button) => {
        const isSelected = Boolean(
          selectedModeId && String(button.dataset.modeId || '') === selectedModeId
        );
        button.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        matched = matched || isSelected;
      });
      return matched;
    }

    function selectModeMenuItem(item, selectionOptions) {
      const selectOptions = selectionOptions || {};
      const keepMenuFocus = selectOptions.keepMenuFocus === true;
      let result = null;
      if (typeof config.onModeMenuSelect === 'function') {
        result = config.onModeMenuSelect(item);
      }
      const syncSelectedMode = () => {
        if (!destroyed && modeMenuOpen && !modeMenu.hidden) {
          const selectedModeId = item && item.id ? String(item.id) : '';
          if (!syncModeMenuSelection(selectedModeId)) {
            refreshModeMenu(selectedModeId);
          }
          if (keepMenuFocus) {
            const buttons = getModeMenuButtons();
            const selectedIndex = buttons.findIndex((button) => (
              String(button.dataset.modeId || '') === selectedModeId
            ));
            if (selectedIndex >= 0) {
              focusModeMenuButton(selectedIndex);
            }
          } else {
            focusModeInput();
          }
        }
      };
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).then(syncSelectedMode, syncSelectedMode);
        return;
      }
      syncSelectedMode();
    }

    function renderModeMenu(items) {
      clearModeMenuContents();
      renderedModeMenuEntries = [];
      renderedModeMenuGroups = [];
      modeMenuEmptyState = null;
      const normalizedItems = Array.isArray(items)
        ? items.filter((item) => item && item.id && item.label)
        : [];
      let previousGroup = '';
      normalizedItems.forEach((item) => {
        const group = item.group ? String(item.group) : '';
        if (group && group !== previousGroup) {
          const groupLabel = doc.createElement('div');
          groupLabel.className = 'x-lumno-search-input-mode__menu-group';
          groupLabel.setAttribute('aria-hidden', 'true');
          groupLabel.setAttribute('role', 'presentation');
          groupLabel.textContent = group;
          modeMenuContent.appendChild(groupLabel);
          renderedModeMenuGroups.push({
            element: groupLabel,
            group,
            visibleCount: 0
          });
          previousGroup = group;
        }
        const button = doc.createElement('button');
        button.className = 'x-lumno-search-input-mode__menu-item';
        button.type = 'button';
        button.tabIndex = -1;
        button.setAttribute('role', 'menuitemradio');
        button.setAttribute('aria-checked', item.active ? 'true' : 'false');
        button.setAttribute('aria-label', String(item.label));
        button.setAttribute('data-label-truncated', 'false');
        button.dataset.modeId = String(item.id);
        button.appendChild(createModeMenuIcon(item, button));
        const label = createModeMenuLabel(item.label);
        button.appendChild(label);
        bindModeMenuLabelTooltip(button, label, item.label);
        const check = doc.createElement('i');
        check.className = 'x-lumno-search-input-mode__menu-check ri-icon ri-size-16 ri-check-line';
        check.setAttribute('aria-hidden', 'true');
        button.appendChild(check);
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          modeMenuKeyboardNavigationActive = false;
          selectModeMenuItem(item);
        });
        modeMenuContent.appendChild(button);
        renderedModeMenuEntries.push({
          button,
          group,
          item,
          label,
          labelText: String(item.label),
          searchIndex: buildModeMenuSearchIndex(item)
        });
      });
      modeMenuEmptyState = applyNoTranslate(doc.createElement('div'));
      modeMenuEmptyState.className = 'x-lumno-search-input-mode__menu-empty';
      modeMenuEmptyState.setAttribute('data-i18n', 'overlay_empty_result');
      modeMenuEmptyState.setAttribute('role', 'status');
      modeMenuEmptyState.textContent = formatMessage(
        'overlay_empty_result',
        'No matching results'
      );
      modeMenuEmptyState.hidden = true;
      modeMenuContent.appendChild(modeMenuEmptyState);
      applyModeMenuFilter(modeMenuFilterQuery, { preserveScroll: true });
      return normalizedItems;
    }

    function applyModeMenuFilter(query, filterOptions) {
      modeMenuFilterQuery = String(query || '');
      refreshModeMenuFilterText();
      const normalizedQuery = normalizeModeMenuSearchText(modeMenuFilterQuery);
      modeMenu.setAttribute('data-filtered', normalizedQuery ? 'true' : 'false');
      renderedModeMenuGroups.forEach((group) => {
        group.visibleCount = 0;
      });
      let visibleCount = 0;
      renderedModeMenuEntries.forEach((entry) => {
        const match = getModeMenuItemMatch(entry, normalizedQuery);
        entry.button.hidden = !match.matched;
        entry.button.tabIndex = -1;
        renderModeMenuLabelMatch(
          entry.label,
          entry.labelText,
          match.ranges
        );
        if (!match.matched) {
          return;
        }
        visibleCount += 1;
        const groupRecord = renderedModeMenuGroups.find((group) => (
          group.group === entry.group
        ));
        if (groupRecord) {
          groupRecord.visibleCount += 1;
        }
      });
      renderedModeMenuGroups.forEach((group) => {
        group.element.hidden = group.visibleCount === 0;
      });
      if (modeMenuEmptyState) {
        modeMenuEmptyState.hidden = visibleCount > 0;
      }
      if (!filterOptions || filterOptions.preserveScroll !== true) {
        modeMenuContent.scrollTop = 0;
      }
      updateModeMenuFooterAlignment();
      notifyModeMenuLayoutChange();
      return visibleCount;
    }

    function syncModeMenuQueryLift() {
      const hasQuery = Boolean(String(input.value || '').trim());
      modeMenu.setAttribute('data-has-query', hasQuery ? 'true' : 'false');
      setStyle(
        modeMenu,
        '--x-lumno-search-mode-menu-lift',
        hasQuery ? '-8px' : '0px',
        useImportantStyles
      );
    }

    function handleModeInput(event) {
      resetModeMenuDoubleTab();
      resetModeTagRemovalConfirmation();
      syncModeMenuQueryLift(event);
    }

    function handleModeInputKeydown(event) {
      if (event && event.key !== 'Tab') {
        resetModeMenuDoubleTab();
      }
      if (event && event.key !== 'Backspace' &&
          !event.metaKey && !event.ctrlKey && !event.altKey) {
        resetModeTagRemovalConfirmation();
      }
    }

    function handleModeInputBlur() {
      resetModeMenuDoubleTab();
    }

    function handleModeInputFocus() {
      setModeMenuSearchActive(false);
    }

    function setModeMenuResultOffset(offset) {
      const numericOffset = Number(offset);
      const nextOffset = Number.isFinite(numericOffset)
        ? Math.max(0, numericOffset)
        : 0;
      setStyle(
        modeMenu,
        '--x-lumno-search-mode-menu-result-offset',
        `${nextOffset}px`,
        useImportantStyles
      );
    }

    function fitModeMenuWithinViewport(options) {
      const fitOptions = options || {};
      const viewportMaxHeightProperty =
        '--x-lumno-search-mode-menu-viewport-max-height';
      if (destroyed || modeMenu.hidden || !modeMenuOpen) {
        modeMenu.style.removeProperty(viewportMaxHeightProperty);
        return null;
      }
      const containerRect = container.getBoundingClientRect();
      const containerLayoutHeight = Math.max(
        0,
        Number(container.offsetHeight) || Number(containerRect.height) || 0
      );
      const renderedContainerHeight = Math.max(
        0,
        Number(containerRect.height) || containerLayoutHeight
      );
      const scaleY = containerLayoutHeight > 0
        ? renderedContainerHeight / containerLayoutHeight
        : 1;
      if (!Number.isFinite(scaleY) || scaleY <= 0) {
        return null;
      }
      const visualViewport = win && win.visualViewport;
      const configuredViewportBottom = Number(fitOptions.viewportBottom);
      const viewportBottom = Number.isFinite(configuredViewportBottom)
        ? configuredViewportBottom
        : (visualViewport && Number.isFinite(Number(visualViewport.height))
          ? Math.max(0, Number(visualViewport.offsetTop) || 0) +
            Math.max(0, Number(visualViewport.height) || 0)
          : Math.max(
            0,
            Number(win && win.innerHeight) ||
              Number(doc && doc.documentElement && doc.documentElement.clientHeight) ||
              0
          ));
      const configuredBottomInset = Number(fitOptions.bottomInset);
      const bottomInset = Number.isFinite(configuredBottomInset)
        ? Math.max(0, configuredBottomInset)
        : DEFAULT_MODE_MENU_VIEWPORT_BOTTOM_INSET;
      const menuGap = Math.max(
        0,
        (Number(modeMenu.offsetTop) || containerLayoutHeight) -
          containerLayoutHeight
      );
      const availableLayoutHeight = Math.max(
        0,
        ((viewportBottom - bottomInset - Number(containerRect.bottom || 0)) /
          scaleY) - menuGap
      );
      setStyle(
        modeMenu,
        viewportMaxHeightProperty,
        `${Math.floor(availableLayoutHeight)}px`,
        useImportantStyles
      );
      const menuLayoutHeight = Math.max(
        0,
        Number(modeMenu.offsetHeight) ||
          (Number(modeMenu.getBoundingClientRect().height) || 0) / scaleY
      );
      return Math.max(
        0,
        Math.floor(availableLayoutHeight - menuLayoutHeight)
      );
    }

    function notifyModeMenuLayoutChange() {
      if (typeof config.onModeMenuLayoutChange === 'function') {
        config.onModeMenuLayoutChange({
          menuElement: modeMenu,
          open: Boolean(modeMenuOpen && !modeMenu.hidden)
        });
      }
    }

    function requestModeMenuFrame(callback) {
      if (win && typeof win.requestAnimationFrame === 'function') {
        return win.requestAnimationFrame(callback);
      }
      if (win && typeof win.setTimeout === 'function') {
        return win.setTimeout(callback, 0);
      }
      callback();
      return 0;
    }

    function cancelModeMenuRevealFrame() {
      if (!modeMenuRevealFrame || !win) {
        modeMenuRevealFrame = 0;
        modeMenuRevealFrameKind = '';
        return;
      }
      if (modeMenuRevealFrameKind === 'animation' &&
          typeof win.cancelAnimationFrame === 'function') {
        win.cancelAnimationFrame(modeMenuRevealFrame);
      } else if (modeMenuRevealFrameKind === 'timeout' &&
          typeof win.clearTimeout === 'function') {
        win.clearTimeout(modeMenuRevealFrame);
      }
      modeMenuRevealFrame = 0;
      modeMenuRevealFrameKind = '';
    }

    function requestModeMenuRevealFrame(callback) {
      cancelModeMenuRevealFrame();
      let completedSynchronously = false;
      const frame = requestModeMenuFrame(() => {
        completedSynchronously = true;
        modeMenuRevealFrame = 0;
        modeMenuRevealFrameKind = '';
        callback();
      });
      if (!completedSynchronously) {
        modeMenuRevealFrame = frame;
        modeMenuRevealFrameKind = win &&
          typeof win.requestAnimationFrame === 'function'
          ? 'animation'
          : 'timeout';
      }
      return frame;
    }

    function isModeMenuVisible() {
      return Boolean(!destroyed && modeMenuOpen && !modeMenu.hidden);
    }

    function clearModeMenuResultTransitionStyles() {
      modeMenuResultTransitionActive = false;
      modeMenu.removeAttribute('data-results-layout-transition');
      removeStyle(modeMenu, 'transition');
      removeStyle(modeMenu, 'will-change');
    }

    function beginModeMenuResultTransition(transition) {
      if (!isModeMenuVisible()) {
        return false;
      }
      cancelModeMenuRevealFrame();
      clearModeMenuResultTransitionStyles();
      modeMenuResultTransitionActive = true;
      modeMenu.setAttribute('data-results-layout-transition', 'true');
      modeMenu.style.setProperty('transition', 'none', 'important');
      modeMenu.style.setProperty('will-change', 'transform', 'important');
      setModeMenuResultOffset(transition && transition.fromOffset);
      return true;
    }

    function targetModeMenuResultTransition(transition) {
      if (!modeMenuResultTransitionActive || !isModeMenuVisible()) {
        return false;
      }
      const duration = Math.max(0, Number(transition && transition.duration) || 0);
      const easing = String(
        (transition && transition.easing) || 'cubic-bezier(0.22, 1, 0.36, 1)'
      );
      modeMenu.style.setProperty(
        'transition',
        `opacity 170ms ease, transform ${duration}ms ${easing}`,
        'important'
      );
      setModeMenuResultOffset(transition && transition.toOffset);
      if (modeMenu.getAttribute('data-open') !== 'true') {
        modeMenu.setAttribute('data-open', 'true');
      }
      return true;
    }

    function finishModeMenuResultTransition() {
      const wasActive = modeMenuResultTransitionActive;
      clearModeMenuResultTransitionStyles();
      if (wasActive && isModeMenuVisible() &&
          modeMenu.getAttribute('data-open') !== 'true') {
        revealModeMenuSurface();
      }
      return wasActive;
    }

    function revealModeMenuSurface() {
      const guardedFrame = (callback) => requestModeMenuRevealFrame(() => {
        if (modeMenuOpen && !modeMenu.hidden) {
          callback();
        }
      });
      if (typeof menuSurface.open === 'function') {
        menuSurface.open(modeMenu, { requestAnimationFrame: guardedFrame });
        return;
      }
      modeMenu.setAttribute('data-open', 'false');
      guardedFrame(() => modeMenu.setAttribute('data-open', 'true'));
    }

    function concealModeMenuSurface() {
      if (typeof menuSurface.close === 'function') {
        menuSurface.close(modeMenu);
        return;
      }
      modeMenu.setAttribute('data-open', 'false');
    }

    function openModeMenu(focusTarget) {
      if (destroyed || typeof config.getModeMenuItems !== 'function') {
        return false;
      }
      refreshModeMenuLanguage();
      resetModeMenuDoubleTab();
      resetModeTagRemovalConfirmation();
      const requestId = ++modeMenuRequestId;
      modeMenuPending = true;
      const finishOpen = (items) => {
        if (destroyed || requestId !== modeMenuRequestId) {
          return false;
        }
        modeMenuPending = false;
        modeMenuFilterQuery = '';
        const normalizedItems = renderModeMenu(items);
        if (normalizedItems.length === 0) {
          return false;
        }
        modeMenuOpen = true;
        modeMenuKeyboardNavigationActive = false;
        syncModeMenuQueryLift();
        modeMenu.hidden = false;
        syncInputPlaceholder();
        updateModeMenuFooterAlignment();
        revealModeMenuSurface();
        container.setAttribute('data-mode-menu-open', 'true');
        siteSearchPrefix.setAttribute('aria-expanded', 'true');
        setStyle(siteSearchPrefix, 'z-index', '41', useImportantStyles);
        setInputModePrefixMenuOpen(true);
        notifyModeMenuLayoutChange();
        const activeIndex = normalizedItems.findIndex((item) => item.active);
        const targetIndex = focusTarget === 'last'
          ? normalizedItems.length - 1
          : (activeIndex >= 0 ? activeIndex : 0);
        if (focusTarget === 'input') {
          focusModeInput();
        } else if (focusTarget === 'none') {
          focusModeMenuSearch();
        } else {
          focusModeMenuButton(targetIndex);
        }
        return true;
      };
      const items = config.getModeMenuItems();
      if ((items && typeof items.then === 'function') ||
          (modeMenuPinyinRuntimeReady &&
            typeof modeMenuPinyinRuntimeReady.then === 'function')) {
        modeMenu.setAttribute('aria-busy', 'true');
        return Promise.all([
          Promise.resolve(items),
          Promise.resolve(modeMenuPinyinRuntimeReady)
        ]).then(([resolvedItems]) => {
          if (requestId !== modeMenuRequestId) {
            return false;
          }
          modeMenu.removeAttribute('aria-busy');
          return finishOpen(resolvedItems);
        }, () => {
          if (requestId === modeMenuRequestId) {
            modeMenuPending = false;
            modeMenu.removeAttribute('aria-busy');
          }
          return false;
        });
      }
      return finishOpen(items);
    }

    function refreshModeMenu(preferredModeId) {
      if (destroyed || !modeMenuOpen || modeMenu.hidden ||
          typeof config.getModeMenuItems !== 'function') {
        return false;
      }
      const focusRoot = typeof modeMenu.getRootNode === 'function'
        ? modeMenu.getRootNode()
        : doc;
      const activeElement = focusRoot && focusRoot.activeElement
        ? focusRoot.activeElement
        : doc.activeElement;
      const focusedButton = activeElement &&
        typeof activeElement.getAttribute === 'function' &&
        activeElement.getAttribute('role') === 'menuitemradio'
        ? activeElement
        : null;
      const focusedModeId = preferredModeId
        ? String(preferredModeId)
        : (focusedButton ? String(focusedButton.dataset.modeId || '') : '');
      const requestId = ++modeMenuRequestId;
      modeMenuPending = true;
      const finishRefresh = (items) => {
        if (destroyed || requestId !== modeMenuRequestId || !modeMenuOpen || modeMenu.hidden) {
          return false;
        }
        modeMenuPending = false;
        modeMenu.removeAttribute('aria-busy');
        const normalizedItems = renderModeMenu(items);
        syncModeMenuQueryLift();
        if (normalizedItems.length === 0) {
          closeModeMenu(false);
          return false;
        }
        updateModeMenuFooterAlignment();
        notifyModeMenuLayoutChange();
        if (focusedModeId) {
          const buttons = getModeMenuButtons();
          const nextFocusedIndex = buttons.findIndex((button) => (
            String(button.dataset.modeId || '') === focusedModeId
          ));
          if (nextFocusedIndex >= 0) {
            focusModeMenuButton(nextFocusedIndex);
          }
        }
        return true;
      };
      const items = config.getModeMenuItems();
      if (items && typeof items.then === 'function') {
        modeMenu.setAttribute('aria-busy', 'true');
        return items.then(finishRefresh, () => {
          if (requestId === modeMenuRequestId) {
            modeMenuPending = false;
            modeMenu.removeAttribute('aria-busy');
          }
          return false;
        });
      }
      return finishRefresh(items);
    }

    function closeModeMenu(restoreFocus) {
      if (!modeMenuOpen && !modeMenuPending && modeMenu.hidden) {
        return false;
      }
      modeMenuRequestId += 1;
      modeMenuPending = false;
      resetModeMenuDoubleTab();
      resetModeTagRemovalConfirmation();
      modeMenu.removeAttribute('aria-busy');
      cancelModeMenuRevealFrame();
      clearModeMenuResultTransitionStyles();
      if (modeMenuCursorTooltipController &&
          typeof modeMenuCursorTooltipController.hide === 'function') {
        modeMenuCursorTooltipController.hide();
      }
      modeMenuOpen = false;
      modeMenuKeyboardNavigationActive = false;
      modeMenuFilterQuery = '';
      setModeMenuSearchActive(false);
      concealModeMenuSurface();
      modeMenu.hidden = true;
      syncInputPlaceholder();
      container.removeAttribute('data-mode-menu-open');
      siteSearchPrefix.setAttribute('aria-expanded', 'false');
      setStyle(siteSearchPrefix, 'z-index', '1', useImportantStyles);
      setInputModePrefixMenuOpen(false);
      notifyModeMenuLayoutChange();
      if (restoreFocus && typeof siteSearchPrefix.focus === 'function') {
        siteSearchPrefix.focus({ preventScroll: true });
      }
      return true;
    }

    function handlePrefixClick(event) {
      event.preventDefault();
      event.stopPropagation();
      if (modeMenuOpen || modeMenuPending) {
        closeModeMenu(true);
      } else {
        openModeMenu('none');
      }
    }

    function handlePrefixKeydown(event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openModeMenu(event.key === 'ArrowUp' ? 'last' : 'active');
      } else if (event.key === 'Escape' && modeMenuOpen) {
        event.preventDefault();
        closeModeMenu(true);
      }
    }

    function stopModeMenuKeyEvent(event) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      } else {
        event.stopPropagation();
      }
    }

    function handleMenuKeydown(event) {
      const buttons = getModeMenuButtons();
      const currentIndex = buttons.indexOf(getModeMenuActiveElement());
      if (event.key === 'Escape') {
        stopModeMenuKeyEvent(event);
        if (modeMenuFilterQuery) {
          applyModeMenuFilter('');
          focusModeMenuSearch();
        } else {
          closeModeMenu(true);
        }
        return true;
      } else if (event.key === 'Backspace' && !event.metaKey &&
          !event.ctrlKey && !event.altKey) {
        stopModeMenuKeyEvent(event);
        const queryCharacters = Array.from(modeMenuFilterQuery);
        queryCharacters.pop();
        applyModeMenuFilter(queryCharacters.join(''));
        focusFirstModeMenuFilterResult();
        return true;
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight' ||
          event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        stopModeMenuKeyEvent(event);
        modeMenuKeyboardNavigationActive = true;
        const nextIndex = getModeMenuDirectionalIndex(
          buttons,
          currentIndex,
          event.key
        );
        focusModeMenuButton(nextIndex, { smoothScroll: true });
        return true;
      } else if (event.key === 'Home' || event.key === 'End') {
        stopModeMenuKeyEvent(event);
        modeMenuKeyboardNavigationActive = true;
        focusModeMenuButton(event.key === 'Home' ? 0 : buttons.length - 1);
        return true;
      } else if ((event.key === 'Enter' || event.key === ' ') && currentIndex >= 0) {
        stopModeMenuKeyEvent(event);
        const entry = renderedModeMenuEntries.find((candidate) => (
          candidate.button === buttons[currentIndex]
        ));
        if (entry) {
          selectModeMenuItem(entry.item, {
            keepMenuFocus: modeMenuKeyboardNavigationActive
          });
        }
        return true;
      } else if (event.key === 'Tab') {
        stopModeMenuKeyEvent(event);
        focusModeInput();
        return true;
      } else if (!event.isComposing && !event.repeat &&
          !event.metaKey && !event.ctrlKey && !event.altKey &&
          typeof event.key === 'string' && event.key.length === 1 &&
          /[a-z0-9\u3400-\u9fff\s]/i.test(event.key)) {
        stopModeMenuKeyEvent(event);
        applyModeMenuFilter(modeMenuFilterQuery + event.key);
        focusFirstModeMenuFilterResult();
        return true;
      }
      return false;
    }

    function handleModeMenuKeyEvent(event) {
      if (!shouldHandleModeMenuKeyEvent(event)) {
        return false;
      }
      return handleMenuKeydown(event);
    }

    function handleModeMenuPointerDown(event) {
      if (!modeMenuOpen || modeMenu.hidden) {
        return;
      }
      modeMenuKeyboardNavigationActive = false;
      setModeMenuSearchActive(true);
      const target = event && event.target;
      const button = target && typeof target.closest === 'function'
        ? target.closest('[role="menuitemradio"]')
        : null;
      if (button) {
        return;
      }
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      focusModeMenuSearch();
    }

    function handleDocumentPointerDown(event) {
      const eventPath = event && typeof event.composedPath === 'function'
        ? event.composedPath()
        : [];
      const isInsideModeContainer = container.contains(event.target) ||
        eventPath.includes(container) ||
        eventPath.includes(modeMenu) ||
        eventPath.includes(siteSearchPrefix);
      if (!modeMenuOpen || isInsideModeContainer) {
        return;
      }
      closeModeMenu(false);
    }

    siteSearchPrefix.addEventListener('click', handlePrefixClick);
    siteSearchPrefix.addEventListener('keydown', handlePrefixKeydown);
    input.addEventListener('input', handleModeInput);
    input.addEventListener('keydown', handleModeInputKeydown);
    input.addEventListener('blur', handleModeInputBlur);
    input.addEventListener('focus', handleModeInputFocus);
    modeMenu.addEventListener('keydown', handleMenuKeydown);
    modeMenu.addEventListener('pointerdown', handleModeMenuPointerDown);
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('pointerdown', handleDocumentPointerDown, true);
    }

    function onResize() {
      updateLayout();
    }

    if (win && typeof win.ResizeObserver === 'function') {
      layoutResizeObserver = new win.ResizeObserver(updateLayout);
      layoutResizeObserver.observe(siteSearchPrefix);
      layoutResizeObserver.observe(siteSearchTabHint);
      layoutResizeObserver.observe(modeMenuContent);
      const badgeElement = getModeBadgeElement();
      if (badgeElement) {
        layoutResizeObserver.observe(badgeElement);
      }
    }

    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('resize', onResize);
    }

    function destroy() {
      destroyed = true;
      modeMenuRequestId += 1;
      modeMenuPending = false;
      cancelModeMenuRevealFrame();
      clearModeMenuResultTransitionStyles();
      resetModeMenuDoubleTab();
      resetModeTagRemovalConfirmation();
      cancelInputModePrefixAnimation();
      cancelInputModePrefixIconAnimation();
      if (win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('resize', onResize);
      }
      if (layoutResizeObserver) {
        layoutResizeObserver.disconnect();
        layoutResizeObserver = null;
      }
      if (typeof siteSearchPrefix.removeEventListener === 'function') {
        siteSearchPrefix.removeEventListener('click', handlePrefixClick);
        siteSearchPrefix.removeEventListener('keydown', handlePrefixKeydown);
      }
      if (typeof modeMenu.removeEventListener === 'function') {
        modeMenu.removeEventListener('keydown', handleMenuKeydown);
        modeMenu.removeEventListener('pointerdown', handleModeMenuPointerDown);
      }
      if (typeof input.removeEventListener === 'function') {
        input.removeEventListener('input', handleModeInput);
        input.removeEventListener('keydown', handleModeInputKeydown);
        input.removeEventListener('blur', handleModeInputBlur);
        input.removeEventListener('focus', handleModeInputFocus);
      }
      if (doc && typeof doc.removeEventListener === 'function') {
        doc.removeEventListener('pointerdown', handleDocumentPointerDown, true);
      }
      clearProviderPrefix();
      setTabHintVisible(false);
      if (ownsModeMenuCursorTooltipController &&
          typeof modeMenuCursorTooltipController.destroy === 'function') {
        modeMenuCursorTooltipController.destroy();
      } else if (modeMenuCursorTooltipController &&
          typeof modeMenuCursorTooltipController.hide === 'function') {
        modeMenuCursorTooltipController.hide();
      }
      if (!modeMenuWasProvided) {
        modeMenu.remove();
      }
    }

    return Object.freeze({
      prefixElement: siteSearchPrefix,
      tabHintElement: siteSearchTabHint,
      setProviderPrefix,
      setPrefixText,
      clearProviderPrefix,
      beginModeMenuResultTransition,
      closeModeMenu,
      fitModeMenuWithinViewport,
      finishModeMenuResultTransition,
      isModeMenuVisible,
      menuElement: modeMenu,
      getModeMenuFilterQuery: () => modeMenuFilterQuery,
      openModeMenu,
      refreshModeMenuLanguage,
      refreshModeMenu,
      resetModeMenuDoubleTab,
      resetModeTagRemovalConfirmation,
      setModeMenuResultOffset,
      targetModeMenuResultTransition,
      setTabHintVisible,
      shouldCompleteModeMenuDoubleTab,
      shouldContainModeMenuTab,
      handleModeMenuKeyEvent,
      shouldHandleModeMenuKeyEvent,
      shouldOpenModeMenuForActiveModeOnTab,
      shouldOpenModeMenuOnDoubleTab,
      shouldRemoveModeTagOnBackspace,
      updateLayout,
      destroy
    });
  }

  root.LumnoSearchInputMode = Object.freeze({
    runtimeVersion: SEARCH_INPUT_MODE_RUNTIME_VERSION,
    createInputModeController
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
