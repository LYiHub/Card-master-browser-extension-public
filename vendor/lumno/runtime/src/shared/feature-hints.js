(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoFeatureHints = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  const NAVIGATION_DISPOSITION = root && root.LumnoNavigationDisposition
    ? root.LumnoNavigationDisposition
    : {};
  const FEATURE_HINTS = Object.freeze({
    NEWTAB_WALLPAPER: Object.freeze({
      id: 'newtab-wallpaper',
      introducedIn: '0.9.9',
      surface: 'newtab',
      placement: 'bottom-right wallpaper control',
      className: 'x-lumno-feature-hint--newtab-wallpaper',
      arrowSide: 'right',
      arrowAlign: 'center',
      widthMode: 'content',
      dismissStorage: 'sync',
      rememberOnFirstShow: true,
      roundedArrowTip: true,
      badgeIcon: 'ri-asterisk',
      badgeKey: 'newtab_wallpaper_feature_hint_badge',
      badgeFallback: 'New',
      textKey: 'newtab_wallpaper_feature_hint_text',
      textFallback: 'New Tab now supports changing wallpaper!',
      closeLabelKey: 'newtab_wallpaper_feature_hint_close',
      closeLabelFallback: 'Dismiss wallpaper tip'
    }),
    NEWTAB_AI_QUICK_JUMP: Object.freeze({
      id: 'newtab-ai-quick-jump',
      introducedIn: '0.9.9',
      surface: 'newtab',
      placement: 'below search input',
      className: 'x-lumno-feature-hint--newtab-ai-quick-jump',
      arrowSide: 'top',
      arrowAlign: 'center',
      widthMode: 'container',
      alignMode: 'auto',
      dismissStorage: 'sync',
      rememberOnFirstShow: true,
      roundedArrowTip: true,
      badgeIcon: 'ri-asterisk',
      badgeKey: 'newtab_ai_quick_jump_feature_hint_badge',
      badgeFallback: 'New',
      textKey: 'newtab_ai_quick_jump_feature_hint_text',
      textFallback: 'Jump to popular AI sites with your prompt in one click. Try typing "gemini" and pressing Tab.',
      linkKey: 'newtab_ai_quick_jump_feature_hint_link',
      linkFallback: 'Support list',
      closeLabelKey: 'newtab_ai_quick_jump_feature_hint_close',
      closeLabelFallback: 'Dismiss AI quick jump tip'
    }),
    NEWTAB_TAB_SWITCHER: Object.freeze({
      id: 'newtab-tab-switcher',
      introducedIn: '0.9.13',
      surface: 'newtab',
      placement: 'newtab settings icon',
      className: 'x-lumno-feature-hint--newtab-tab-switcher',
      arrowSide: 'top',
      arrowAlign: 'end',
      widthMode: 'fixed',
      alignMode: 'auto',
      dismissStorage: 'sync',
      rememberOnFirstShow: true,
      roundedArrowTip: true,
      badgeIcon: 'ri-asterisk',
      badgeKey: 'newtab_tab_switcher_feature_hint_badge',
      badgeFallback: 'New',
      textKey: 'newtab_tab_switcher_feature_hint_text',
      textFallback: 'Press {shortcut} to open the tab switcher and jump through recent tabs without reaching for the mouse.',
      closeLabelKey: 'newtab_tab_switcher_feature_hint_close',
      closeLabelFallback: 'Dismiss tab switcher tip'
    })
  });

  const FEATURE_HINT_ARROW_SIDES = Object.freeze({
    top: true,
    right: true,
    bottom: true,
    left: true
  });

  const FEATURE_HINT_ARROW_ALIGNS = Object.freeze({
    start: true,
    center: true,
    end: true
  });

  const FEATURE_HINT_DISMISS_STORAGE_TYPES = Object.freeze({
    none: true,
    session: true,
    local: true,
    sync: true
  });

  const FEATURE_HINT_WIDTH_MODES = Object.freeze({
    fixed: true,
    container: true,
    content: true
  });

  const FEATURE_HINT_ALIGN_MODES = Object.freeze({
    center: true,
    start: true,
    auto: true
  });

  const FEATURE_HINT_SESSION_DISMISS_PREFIX = '_x_lumno_feature_hint_session_dismissed_2026_';
  const FEATURE_HINT_LOCAL_DISMISS_PREFIX = '_x_lumno_feature_hint_local_dismissed_2026_';
  const FEATURE_HINT_SYNC_DISMISS_PREFIX = '_x_lumno_feature_hint_sync_dismissed_2026_';

  const FEATURE_HINTS_BY_ID = Object.freeze(Object.keys(FEATURE_HINTS).reduce((map, key) => {
    const hint = FEATURE_HINTS[key];
    map[hint.id] = hint;
    return map;
  }, {}));

  function getMessage(t, key, fallback) {
    return typeof t === 'function' ? t(key, fallback) : (fallback || '');
  }

  function formatShortcutText(text, shortcut, navigatorLike) {
    const shortcutDisplay = root && root.LumnoShortcutDisplay
      ? root.LumnoShortcutDisplay
      : null;
    if (!shortcutDisplay || typeof shortcutDisplay.formatShortcutTemplate !== 'function') {
      return String(text || '').replace(/\{shortcut\}/g, shortcut);
    }
    return shortcutDisplay.formatShortcutTemplate(text, shortcut, {
      navigatorLike
    });
  }

  function getDefaultRiSvg(id, sizeClass) {
    const size = sizeClass || 'ri-size-16';
    return '<i class="ri-icon ' + size + ' ' + id + '" aria-hidden="true"></i>';
  }

  function getDomIdPart(id) {
    return String(id || 'feature-hint').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'feature_hint';
  }

  function normalizeFeatureHintValue(value, allowedValues, fallback) {
    const normalized = String(value || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(allowedValues, normalized) ? normalized : fallback;
  }

  function normalizeArrowSide(value) {
    return normalizeFeatureHintValue(value, FEATURE_HINT_ARROW_SIDES, 'bottom');
  }

  function normalizeArrowAlign(value) {
    return normalizeFeatureHintValue(value, FEATURE_HINT_ARROW_ALIGNS, 'center');
  }

  function normalizeDismissStorage(value) {
    return normalizeFeatureHintValue(value, FEATURE_HINT_DISMISS_STORAGE_TYPES, 'none');
  }

  function normalizeWidthMode(value) {
    return normalizeFeatureHintValue(value, FEATURE_HINT_WIDTH_MODES, 'fixed');
  }

  function normalizeAlignMode(value) {
    return normalizeFeatureHintValue(value, FEATURE_HINT_ALIGN_MODES, 'center');
  }

  function getFeatureHintStorageId(definition) {
    const hint = getFeatureHint(definition);
    const idPart = getDomIdPart(hint ? hint.id : '');
    const versionPart = getDomIdPart(hint && hint.introducedIn ? hint.introducedIn : 'unversioned');
    return `${idPart}_${versionPart}`;
  }

  function getFeatureHintDismissKey(definition, storageType) {
    const normalizedStorageType = normalizeDismissStorage(storageType);
    const prefix = normalizedStorageType === 'sync'
      ? FEATURE_HINT_SYNC_DISMISS_PREFIX
      : (normalizedStorageType === 'local'
        ? FEATURE_HINT_LOCAL_DISMISS_PREFIX
        : FEATURE_HINT_SESSION_DISMISS_PREFIX);
    return prefix + getFeatureHintStorageId(definition);
  }

  function getFeatureHintSessionDismissKey(definition) {
    return getFeatureHintDismissKey(definition, 'session');
  }

  function getFeatureHintLocalDismissKey(definition) {
    return getFeatureHintDismissKey(definition, 'local');
  }

  function getFeatureHintSyncDismissKey(definition) {
    return getFeatureHintDismissKey(definition, 'sync');
  }

  function getLegacyLocalDismissKeyForSyncKey(key) {
    const rawKey = String(key || '');
    if (!rawKey.startsWith(FEATURE_HINT_SYNC_DISMISS_PREFIX)) {
      return '';
    }
    return FEATURE_HINT_LOCAL_DISMISS_PREFIX + rawKey.slice(FEATURE_HINT_SYNC_DISMISS_PREFIX.length);
  }

  function getDismissStorageArea(chromeApi, storageType) {
    if (!chromeApi || !chromeApi.storage) {
      return null;
    }
    if (storageType === 'sync') {
      return chromeApi.storage.sync || chromeApi.storage.local || null;
    }
    if (storageType === 'local') {
      return chromeApi.storage.local || null;
    }
    if (storageType === 'session') {
      return chromeApi.storage.session || null;
    }
    return null;
  }

  function getStoredDismissedFromArea(chromeApi, storageArea, key) {
    if (!storageArea || typeof storageArea.get !== 'function') {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      try {
        storageArea.get([key], (result) => {
          const runtimeError = chromeApi && chromeApi.runtime
            ? chromeApi.runtime.lastError
            : null;
          resolve(!runtimeError && Boolean(result && result[key]));
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  function getStoredDismissed(chromeApi, key, storageType) {
    const storageArea = getDismissStorageArea(chromeApi, storageType);
    return getStoredDismissedFromArea(chromeApi, storageArea, key).then((isDismissed) => {
      if (isDismissed || storageType !== 'sync') {
        return isDismissed;
      }
      const localArea = chromeApi && chromeApi.storage ? chromeApi.storage.local : null;
      const legacyLocalKey = getLegacyLocalDismissKeyForSyncKey(key);
      if (!localArea || !legacyLocalKey) {
        return false;
      }
      return getStoredDismissedFromArea(chromeApi, localArea, legacyLocalKey).then((legacyDismissed) => {
        if (legacyDismissed) {
          setStoredDismissed(chromeApi, key, storageType);
        }
        return legacyDismissed;
      });
    });
  }

  function setStoredDismissed(chromeApi, key, storageType) {
    const storageArea = getDismissStorageArea(chromeApi, storageType);
    if (!storageArea || typeof storageArea.set !== 'function') {
      return;
    }
    try {
      storageArea.set({ [key]: true }, () => {});
    } catch (e) {
      // Storage errors should not block the visible in-page dismissal.
    }
  }

  function getFeatureHint(definition) {
    if (!definition) {
      return null;
    }
    if (typeof definition === 'string') {
      return FEATURE_HINTS_BY_ID[definition] || FEATURE_HINTS[definition] || null;
    }
    return definition;
  }

  function createFeatureHint(options) {
    const config = options || {};
    const documentObj = config.documentObj || (typeof document !== 'undefined' ? document : null);
    const definition = getFeatureHint(config.definition || config.id || config.hint);
    const featureHintView = root && root.LumnoFeatureHintView;
    if (!definition || !documentObj || !featureHintView ||
        typeof featureHintView.createFeatureHintView !== 'function') {
      return null;
    }
    const t = typeof config.t === 'function' ? config.t : null;
    const getRiSvg = typeof config.getRiSvg === 'function' ? config.getRiSvg : getDefaultRiSvg;
    const idPart = getDomIdPart(definition.id);
    const arrowSide = normalizeArrowSide(config.arrowSide || definition.arrowSide);
    const arrowAlign = normalizeArrowAlign(config.arrowAlign || definition.arrowAlign);
    const dismissStorage = normalizeDismissStorage(config.dismissStorage || definition.dismissStorage);
    const widthMode = normalizeWidthMode(config.widthMode || definition.widthMode);
    const alignMode = normalizeAlignMode(config.alignMode || definition.alignMode);
    const chromeApi = config.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
    const dismissKey = config.dismissKey ||
      (dismissStorage === 'sync'
        ? (config.syncDismissKey || getFeatureHintSyncDismissKey(definition))
        : (dismissStorage === 'local'
          ? (config.localDismissKey || getFeatureHintLocalDismissKey(definition))
          : (config.sessionDismissKey || getFeatureHintSessionDismissKey(definition))));
    const windowObj = config.windowObj || (documentObj && documentObj.defaultView) ||
      (typeof window !== 'undefined' ? window : null);
    const rememberOnFirstShow = typeof config.rememberOnFirstShow === 'boolean'
      ? config.rememberOnFirstShow
      : Boolean(definition.rememberOnFirstShow);
    const roundedArrowTip = typeof config.roundedArrowTip === 'boolean'
      ? config.roundedArrowTip
      : Boolean(definition.roundedArrowTip);
    const configuredActions = Array.isArray(config.actions)
      ? config.actions
      : (Array.isArray(definition.actions) ? definition.actions : []);
    const actions = configuredActions.reduce((items, action, index) => {
      const id = String(action && (action.id || action.actionId) || '').trim();
      if (!id || items.some((item) => item.id === id)) {
        return items;
      }
      items.push({
        id,
        iconHtml: action && action.icon
          ? getRiSvg(String(action.icon), 'ri-size-12')
          : '',
        labelKey: String(action && action.labelKey || '').trim(),
        labelFallback: String(action && action.labelFallback || '').trim(),
        onClick: action && typeof action.onClick === 'function'
          ? action.onClick
          : null,
        variant: action && action.variant === 'primary'
          ? 'primary'
          : 'secondary',
        order: index
      });
      return items;
    }, []);
    const hasLink = Boolean(
      config.onLinkClick ||
      config.linkUrl ||
      definition.linkKey ||
      definition.linkFallback
    );
    let dismissed = Boolean(config.initiallyDismissed);
    let requestedVisible = config.initiallyVisible !== false;
    let dismissStateLoaded = dismissStorage === 'none';
    let firstShowRemembered = false;
    let destroyed = false;
    let readySettled = false;
    let resolveReady = null;
    const ready = new Promise((resolve) => {
      resolveReady = resolve;
    });
    const badgeIconText = String(definition.badgeIconText || '').trim();
    const activateLink = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof config.onLinkClick === 'function') {
        config.onLinkClick(event, definition);
        return;
      }
      const linkUrl = typeof config.getLinkUrl === 'function'
        ? config.getLinkUrl(definition)
        : (config.linkUrl || definition.linkUrl || '');
      const targetWindow = config.windowObj || (typeof window !== 'undefined' ? window : null);
      if (!linkUrl || !targetWindow) {
        return;
      }
      if (config.linkTarget === '_blank' && typeof targetWindow.open === 'function') {
        targetWindow.open(linkUrl, '_blank', 'noopener');
        return;
      }
      if (targetWindow.location && typeof targetWindow.location.assign === 'function') {
        targetWindow.location.assign(linkUrl);
      }
    };
    let controller = null;
    const viewController = featureHintView.createFeatureHintView({
      documentObj,
      model: {
        actions: actions.map((action) => ({
          iconHtml: action.iconHtml,
          id: action.id,
          variant: action.variant
        })),
        alignMode,
        arrowAlign,
        arrowSide,
        badgeIconHtml: definition.badgeIcon
          ? getRiSvg(definition.badgeIcon, 'ri-size-10')
          : '',
        badgeIconImageSrc: String(
          config.badgeIconImageSrc || definition.badgeIconImageSrc || ''
        ),
        badgeIconText,
        badgeWordmarkDarkImageSrc: String(
          config.badgeWordmarkDarkImageSrc ||
          definition.badgeWordmarkDarkImageSrc ||
          ''
        ),
        badgeWordmarkImageSrc: String(
          config.badgeWordmarkImageSrc || definition.badgeWordmarkImageSrc || ''
        ),
        className: definition.className || '',
        dismissStorage,
        elementId: config.elementId || `_x_lumno_feature_hint_${idPart}_2026_unique_`,
        hasLink,
        hintId: definition.id,
        inlineActions: Boolean(config.inlineActions || definition.inlineActions),
        placement: definition.placement || '',
        roundedArrowTip,
        surface: definition.surface || '',
        textId: config.textId || `_x_lumno_feature_hint_${idPart}_text_2026_unique_`,
        version: definition.introducedIn || '',
        widthMode
      },
      labels: {
        actions: {},
        badge: '',
        close: '',
        connector: '',
        link: '',
        text: '',
        trailing: ''
      },
      onDismiss() {
        if (controller) {
          controller.dismiss();
        }
      },
      onActionClick(actionId, event) {
        const action = actions.find((item) => item.id === actionId);
        if (action && action.onClick) {
          action.onClick(event, definition, action);
        }
        if (typeof config.onActionClick === 'function') {
          config.onActionClick(actionId, event, definition);
        }
      },
      onLinkClick: activateLink
    });
    if (!viewController) {
      return null;
    }
    const element = viewController.element;
    const arrowTip = viewController.arrowTip;
    const text = viewController.text;
    const badge = viewController.badge;
    const linkButton = viewController.linkButton;
    const actionButtons = Array.isArray(viewController.actionButtons)
      ? viewController.actionButtons
      : [];
    const closeButton = viewController.closeButton;
    element.setAttribute('data-dismissed', dismissed ? 'true' : 'false');

    let alignUpdateFrame = 0;

    function getCssNumber(style, property) {
      const value = Number.parseFloat(style && style.getPropertyValue(property));
      return Number.isFinite(value) ? value : 0;
    }

    function updateContentAlignment() {
      alignUpdateFrame = 0;
      if (alignMode !== 'auto' || !windowObj || typeof windowObj.getComputedStyle !== 'function') {
        return;
      }
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      const elementStyle = windowObj.getComputedStyle(element);
      const textStyle = windowObj.getComputedStyle(text);
      const contentHeight = rect.height -
        getCssNumber(elementStyle, 'padding-top') -
        getCssNumber(elementStyle, 'padding-bottom') -
        getCssNumber(elementStyle, 'border-top-width') -
        getCssNumber(elementStyle, 'border-bottom-width');
      const contentWidth = rect.width -
        getCssNumber(elementStyle, 'padding-left') -
        getCssNumber(elementStyle, 'padding-right') -
        getCssNumber(elementStyle, 'border-left-width') -
        getCssNumber(elementStyle, 'border-right-width');
      const textRect = text.getBoundingClientRect();
      const badgeRect = badge.getBoundingClientRect();
      const linkRect = hasLink && linkButton
        ? linkButton.getBoundingClientRect()
        : { height: 0 };
      const actionHeight = actionButtons.reduce((height, actionButton) => {
        const actionRect = actionButton && typeof actionButton.getBoundingClientRect === 'function'
          ? actionButton.getBoundingClientRect()
          : { height: 0 };
        return Math.max(height, actionRect.height || 0);
      }, 0);
      const lineHeight = getCssNumber(textStyle, 'line-height') ||
        ((getCssNumber(textStyle, 'font-size') || 12) * 1.45);
      const isEngagementNotice = element.classList &&
        element.classList.contains('x-lumno-feature-hint--engagement-notice');
      const inlineSentence = isEngagementNotice && typeof element.querySelector === 'function'
        ? element.querySelector('.x-lumno-feature-hint__sentence')
        : null;
      if (inlineSentence && inlineSentence.children) {
        const sentenceItems = Array.from(inlineSentence.children);
        const sentenceWidth = sentenceItems.reduce((width, item) => {
          if (!item || typeof item.getBoundingClientRect !== 'function') {
            return width;
          }
          const itemRect = item.getBoundingClientRect();
          const itemStyle = windowObj.getComputedStyle(item);
          const currentInlineMargin =
            getCssNumber(itemStyle, 'margin-left') +
            getCssNumber(itemStyle, 'margin-right');
          const reservedHoverMargin =
            getCssNumber(itemStyle, '--x-lumno-engagement-action-hover-margin') * 2;
          return width + itemRect.width +
            Math.max(currentInlineMargin, reservedHoverMargin);
        }, 0);
        const inlineGap = getCssNumber(elementStyle, 'column-gap') ||
          getCssNumber(elementStyle, 'gap');
        const requiredInlineWidth = badgeRect.width + inlineGap + sentenceWidth;
        element.setAttribute(
          'data-multiline',
          requiredInlineWidth > contentWidth + 1 ? 'true' : 'false'
        );
        return;
      }
      const maxChildHeight = Math.max(
        textRect.height,
        badgeRect.height,
        linkRect.height,
        actionHeight
      );
      const textWrapped = textRect.height > lineHeight * 1.35;
      const rowWrapped = contentHeight > maxChildHeight + 6;
      element.setAttribute('data-multiline', (textWrapped || rowWrapped) ? 'true' : 'false');
    }

    function scheduleContentAlignmentUpdate() {
      if (alignMode !== 'auto') {
        return;
      }
      if (!windowObj || typeof windowObj.requestAnimationFrame !== 'function') {
        updateContentAlignment();
        return;
      }
      if (alignUpdateFrame) {
        return;
      }
      alignUpdateFrame = windowObj.requestAnimationFrame(updateContentAlignment);
    }

    let alignResizeObserver = null;
    if (alignMode === 'auto' && windowObj && typeof windowObj.ResizeObserver === 'function') {
      alignResizeObserver = new windowObj.ResizeObserver(scheduleContentAlignmentUpdate);
      alignResizeObserver.observe(element);
      alignResizeObserver.observe(text);
      if (hasLink) {
        alignResizeObserver.observe(linkButton);
      }
      actionButtons.forEach((actionButton) => {
        alignResizeObserver.observe(actionButton);
      });
    }

    function setElementInert(inert) {
      try {
        if ('inert' in element) {
          element.inert = Boolean(inert);
        }
      } catch (e) {
        // Some DOM test doubles expose readonly properties; inert is only a progressive enhancement.
      }
    }

    function blurFocusedChildIfNeeded() {
      const activeElement = documentObj && documentObj.activeElement ? documentObj.activeElement : null;
      if (!activeElement || typeof activeElement.blur !== 'function') {
        return;
      }
      if (activeElement === element ||
          (typeof element.contains === 'function' && element.contains(activeElement))) {
        activeElement.blur();
      }
    }

    function disconnectAlignmentObserver() {
      if (!alignResizeObserver || typeof alignResizeObserver.disconnect !== 'function') {
        return;
      }
      alignResizeObserver.disconnect();
      alignResizeObserver = null;
    }

    function syncVisibility() {
      const nextVisible = Boolean(requestedVisible) && !dismissed && dismissStateLoaded;
      element.setAttribute('data-visible', nextVisible ? 'true' : 'false');
      element.setAttribute('aria-hidden', nextVisible ? 'false' : 'true');
      setElementInert(!nextVisible);
      if (nextVisible) {
        if (rememberOnFirstShow && !firstShowRemembered && dismissStorage !== 'none') {
          firstShowRemembered = true;
          setStoredDismissed(chromeApi, dismissKey, dismissStorage);
        }
        scheduleContentAlignmentUpdate();
      } else {
        blurFocusedChildIfNeeded();
        if (dismissed) {
          disconnectAlignmentObserver();
        }
      }
    }

    function settleReady() {
      if (readySettled) {
        return;
      }
      readySettled = true;
      if (resolveReady) {
        resolveReady(element.getAttribute('data-visible') === 'true');
      }
    }

    controller = {
      definition,
      element,
      textId: text.id,
      destroy() {
        if (destroyed) {
          return;
        }
        destroyed = true;
        settleReady();
        disconnectAlignmentObserver();
        if (alignUpdateFrame && windowObj && typeof windowObj.cancelAnimationFrame === 'function') {
          windowObj.cancelAnimationFrame(alignUpdateFrame);
          alignUpdateFrame = 0;
        }
        viewController.destroy();
      },
      dismiss() {
        if (destroyed || dismissed) {
          return;
        }
        dismissed = true;
        element.setAttribute('data-dismissed', 'true');
        if (dismissStorage !== 'none') {
          setStoredDismissed(chromeApi, dismissKey, dismissStorage);
        }
        syncVisibility();
        if (typeof config.onDismiss === 'function') {
          config.onDismiss(definition);
        }
      },
      isDismissed() {
        return dismissed;
      },
      isVisible() {
        return element.getAttribute('data-visible') === 'true';
      },
      ready,
      setVisible(visible) {
        if (destroyed) {
          return;
        }
        requestedVisible = Boolean(visible);
        syncVisibility();
      },
      updateLanguage() {
        if (destroyed) {
          return;
        }
        const badgeLabel = getMessage(t, definition.badgeKey, definition.badgeFallback);
        const rawTextLabel = getMessage(t, definition.textKey, definition.textFallback);
        const navigatorLike = config.navigatorLike ||
          (windowObj && windowObj.navigator) ||
          (root && root.navigator) ||
          null;
        const textLabel = formatShortcutText(rawTextLabel, 'Alt+Q', navigatorLike);
        const closeLabel = getMessage(t, definition.closeLabelKey, definition.closeLabelFallback);
        const connectorKey = config.connectorKey || definition.connectorKey || '';
        const connectorFallback =
          config.connectorFallback || definition.connectorFallback || '';
        const connectorLabel = connectorKey || connectorFallback
          ? getMessage(t, connectorKey, connectorFallback)
          : '';
        const trailingKey = config.trailingKey || definition.trailingKey || '';
        const trailingFallback =
          config.trailingFallback || definition.trailingFallback || '';
        const trailingLabel = trailingKey || trailingFallback
          ? getMessage(t, trailingKey, trailingFallback)
          : '';
        let linkLabel = '';
        const actionLabels = {};
        if (hasLink) {
          linkLabel = getMessage(t, config.linkKey || definition.linkKey, config.linkFallback || definition.linkFallback);
        }
        actions.forEach((action) => {
          actionLabels[action.id] = getMessage(
            t,
            action.labelKey,
            action.labelFallback
          );
        });
        viewController.updateLabels({
          actions: actionLabels,
          badge: badgeLabel,
          close: closeLabel,
          connector: connectorLabel,
          link: linkLabel,
          text: textLabel,
          trailing: trailingLabel
        });
        scheduleContentAlignmentUpdate();
      }
    };

    controller.updateLanguage();
    syncVisibility();
    if (dismissStorage !== 'none') {
      getStoredDismissed(chromeApi, dismissKey, dismissStorage).then((isDismissed) => {
        if (destroyed) {
          return;
        }
        dismissStateLoaded = true;
        if (isDismissed && !dismissed) {
          dismissed = true;
          element.setAttribute('data-dismissed', 'true');
        }
        syncVisibility();
        settleReady();
      });
    } else {
      settleReady();
    }
    return controller;
  }

  return Object.freeze({
    FEATURE_HINTS,
    getFeatureHint,
    normalizeArrowSide,
    normalizeArrowAlign,
    normalizeDismissStorage,
    normalizeWidthMode,
    normalizeAlignMode,
    getFeatureHintSessionDismissKey,
    getFeatureHintLocalDismissKey,
    getFeatureHintSyncDismissKey,
    listFeatureHints() {
      return Object.keys(FEATURE_HINTS).map((key) => FEATURE_HINTS[key]);
    },
    createFeatureHint
  });
});
