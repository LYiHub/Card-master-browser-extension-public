(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoEngagementNotice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  const ENGAGEMENT_NOTICE_STORAGE_KEY = '_x_lumno_engagement_notice_state_2026_unique_';
  const ENGAGEMENT_NOTICE_ID = 'engagement-notice';
  const ENGAGEMENT_NOTICE_VERSION = '1';
  const ENGAGEMENT_NOTICE_ENABLED = true;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const RETRY_COOLDOWN_MS = 14 * DAY_MS;
  const MAX_EXPOSURES = 2;
  const REVIEW_URL = 'https://chromewebstore.google.com/detail/lumno-%E8%81%9A%E7%84%A6%E6%90%9C%E7%B4%A2%E6%96%B0%E6%A0%87%E7%AD%BE%E9%A1%B5/nggfkkbmogmadfoikakkfegkoilfcfao/reviews?utm_source=item-share-cb';
  const COMMUNITY_LINKS = root && root.LumnoCommunityLinks
    ? root.LumnoCommunityLinks
    : {};
  const DISCORD_URL = COMMUNITY_LINKS.FALLBACK_LINKS
    ? COMMUNITY_LINKS.FALLBACK_LINKS.discord
    : '';
  const WECHAT_QR_URL = COMMUNITY_LINKS.FALLBACK_LINKS
    ? COMMUNITY_LINKS.FALLBACK_LINKS.wechatQr
    : '';

  const SURFACE_THRESHOLDS = Object.freeze({
    newtab: Object.freeze({
      activeDays: 4,
      ageMs: 7 * DAY_MS,
      meaningfulUses: 5,
      opens: 8
    }),
    overlay: Object.freeze({
      activeDays: 4,
      ageMs: 7 * DAY_MS,
      meaningfulUses: 0,
      opens: 10
    })
  });

  function getDayKey(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function normalizeDays(value) {
    const items = Array.isArray(value) ? value : [];
    return items
      .map((item) => String(item || '').trim())
      .filter((item, index, list) => (
        /^\d{4}-\d{2}-\d{2}$/.test(item) &&
        list.indexOf(item) === index
      ))
      .slice(-32);
  }

  function normalizeSurfaceState(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      activeDays: normalizeDays(source.activeDays),
      firstSeenAt: Math.max(0, Number(source.firstSeenAt) || 0),
      meaningfulUses: Math.max(0, Math.floor(Number(source.meaningfulUses) || 0)),
      opens: Math.max(0, Math.floor(Number(source.opens) || 0))
    };
  }

  function normalizeEngagementState(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      completedAt: Math.max(0, Number(source.completedAt) || 0),
      exposureCount: Math.max(0, Math.floor(Number(source.exposureCount) || 0)),
      lastShownAt: Math.max(0, Number(source.lastShownAt) || 0),
      newtab: normalizeSurfaceState(source.newtab),
      overlay: normalizeSurfaceState(source.overlay)
    };
  }

  function recordSurfaceOpenInState(value, surface, timestamp) {
    const state = normalizeEngagementState(value);
    const surfaceName = surface === 'overlay' ? 'overlay' : 'newtab';
    const now = Math.max(1, Number(timestamp) || Date.now());
    const surfaceState = state[surfaceName];
    surfaceState.firstSeenAt = surfaceState.firstSeenAt || now;
    surfaceState.opens += 1;
    const dayKey = getDayKey(now);
    if (!surfaceState.activeDays.includes(dayKey)) {
      surfaceState.activeDays.push(dayKey);
      surfaceState.activeDays = surfaceState.activeDays.slice(-32);
    }
    return state;
  }

  function recordMeaningfulUseInState(value, surface, timestamp) {
    const state = recordSurfaceOpenInState(value, surface, timestamp);
    const surfaceName = surface === 'overlay' ? 'overlay' : 'newtab';
    state[surfaceName].opens = Math.max(0, state[surfaceName].opens - 1);
    state[surfaceName].meaningfulUses += 1;
    return state;
  }

  function shouldShowEngagementNotice(value, surface, timestamp) {
    const state = normalizeEngagementState(value);
    const surfaceName = surface === 'overlay' ? 'overlay' : 'newtab';
    const threshold = SURFACE_THRESHOLDS[surfaceName];
    const surfaceState = state[surfaceName];
    const now = Math.max(1, Number(timestamp) || Date.now());
    if (state.completedAt || state.exposureCount >= MAX_EXPOSURES) {
      return false;
    }
    if (state.lastShownAt && now - state.lastShownAt < RETRY_COOLDOWN_MS) {
      return false;
    }
    if (!surfaceState.firstSeenAt ||
        now - surfaceState.firstSeenAt < threshold.ageMs) {
      return false;
    }
    return surfaceState.opens >= threshold.opens &&
      surfaceState.meaningfulUses >= threshold.meaningfulUses &&
      surfaceState.activeDays.length >= threshold.activeDays;
  }

  function getLocalStorageArea(chromeApi) {
    const storage = chromeApi && chromeApi.storage ? chromeApi.storage : null;
    return storage && (storage.local || storage.sync)
      ? (storage.local || storage.sync)
      : null;
  }

  function getStoredEngagementState(chromeApi) {
    const area = getLocalStorageArea(chromeApi);
    return new Promise((resolve) => {
      if (!area || typeof area.get !== 'function') {
        resolve(normalizeEngagementState(null));
        return;
      }
      try {
        area.get([ENGAGEMENT_NOTICE_STORAGE_KEY], (result) => {
          const runtimeError = chromeApi && chromeApi.runtime
            ? chromeApi.runtime.lastError
            : null;
          resolve(normalizeEngagementState(
            runtimeError ? null : result && result[ENGAGEMENT_NOTICE_STORAGE_KEY]
          ));
        });
      } catch (error) {
        resolve(normalizeEngagementState(null));
      }
    });
  }

  function setStoredEngagementState(chromeApi, value) {
    const area = getLocalStorageArea(chromeApi);
    const state = normalizeEngagementState(value);
    if (!area || typeof area.set !== 'function') {
      return Promise.resolve(state);
    }
    return new Promise((resolve) => {
      try {
        area.set({ [ENGAGEMENT_NOTICE_STORAGE_KEY]: state }, () => resolve(state));
      } catch (error) {
        resolve(state);
      }
    });
  }

  function getCommunityUrl(locale) {
    const links = typeof COMMUNITY_LINKS.getLinks === 'function'
      ? COMMUNITY_LINKS.getLinks()
      : null;
    if (typeof COMMUNITY_LINKS.getCommunityUrl === 'function') {
      return COMMUNITY_LINKS.getCommunityUrl(links, locale);
    }
    return links && links.wechatQr ? links.wechatQr : WECHAT_QR_URL;
  }

  function getCommunityChannel(locale) {
    const links = typeof COMMUNITY_LINKS.getLinks === 'function'
      ? COMMUNITY_LINKS.getLinks()
      : null;
    if (typeof COMMUNITY_LINKS.getCommunityChannel === 'function') {
      return COMMUNITY_LINKS.getCommunityChannel(links, locale);
    }
    return /^zh(?:[-_]|$)/i.test(String(locale || '')) ? 'wechat' : 'discord';
  }

  function loadCommunityUrl(options) {
    const settings = options && typeof options === 'object' ? options : {};
    if (typeof COMMUNITY_LINKS.load !== 'function') {
      return Promise.resolve(getCommunityUrl(settings.locale));
    }
    return COMMUNITY_LINKS.load(settings)
      .then((links) => {
        if (typeof COMMUNITY_LINKS.getCommunityUrl === 'function') {
          return COMMUNITY_LINKS.getCommunityUrl(links, settings.locale);
        }
        return links && links.wechatQr
          ? links.wechatQr
          : getCommunityUrl(settings.locale);
      })
      .catch(() => getCommunityUrl(settings.locale));
  }

  function getExtensionAssetUrl(chromeApi, path, fallback) {
    const runtime = chromeApi && chromeApi.runtime ? chromeApi.runtime : null;
    if (runtime && typeof runtime.getURL === 'function') {
      try {
        return runtime.getURL(path);
      } catch (error) {
        // Relative fallbacks keep standalone previews and tests usable.
      }
    }
    return fallback;
  }

  function createEngagementNoticeDefinition(surface) {
    const surfaceName = surface === 'overlay' ? 'overlay' : 'newtab';
    return Object.freeze({
      id: ENGAGEMENT_NOTICE_ID,
      introducedIn: ENGAGEMENT_NOTICE_VERSION,
      surface: surfaceName,
      placement: surfaceName === 'overlay' ? 'above search input' : 'below search input',
      className: [
        'x-lumno-feature-hint--update-notice',
        `x-lumno-feature-hint--update-notice-${surfaceName}`,
        'x-lumno-feature-hint--engagement-notice'
      ].join(' '),
      arrowSide: surfaceName === 'overlay' ? 'bottom' : 'top',
      arrowAlign: 'center',
      widthMode: 'container',
      alignMode: 'auto',
      dismissStorage: 'sync',
      rememberOnFirstShow: false,
      inlineActions: true,
      badgeKey: 'engagement_notice_badge',
      badgeFallback: 'Lumno',
      textKey: 'engagement_notice_text',
      textFallback: 'Like Lumno? Why not',
      connectorKey: 'engagement_notice_connector',
      connectorFallback: 'or',
      trailingKey: 'engagement_notice_trailing',
      trailingFallback: 'and say hi.',
      closeLabelKey: 'engagement_notice_close',
      closeLabelFallback: 'Dismiss rating and community prompt'
    });
  }

  function createEngagementNotice(options) {
    const config = options && typeof options === 'object' ? options : {};
    if (!ENGAGEMENT_NOTICE_ENABLED && config.forceEnabledForTesting !== true) {
      return null;
    }
    const documentObj = config.documentObj || (typeof document !== 'undefined' ? document : null);
    const featureHints = config.featureHints || (root && root.LumnoFeatureHints) || {};
    const chromeApi = config.chromeApi || (root && root.chrome) || null;
    const surface = config.surface === 'overlay' ? 'overlay' : 'newtab';
    if (!documentObj || !featureHints || typeof featureHints.createFeatureHint !== 'function') {
      return null;
    }

    const definition = createEngagementNoticeDefinition(surface);
    const now = typeof config.now === 'function' ? config.now : () => Date.now();
    const windowObj = config.windowObj ||
      documentObj.defaultView ||
      (typeof window !== 'undefined' ? window : null);
    const delayMs = Number.isFinite(Number(config.delayMs))
      ? Math.max(0, Number(config.delayMs))
      : (surface === 'overlay' ? 1200 : 1800);
    const communityChannel = getCommunityChannel(config.locale);
    let state = normalizeEngagementState(null);
    let destroyed = false;
    let suppressed = false;
    let meaningfulUseRecorded = false;
    let stateLoaded = false;
    let showTimer = 0;
    let hintController = null;

    function clearShowTimer() {
      if (!showTimer || !windowObj || typeof windowObj.clearTimeout !== 'function') {
        showTimer = 0;
        return;
      }
      windowObj.clearTimeout(showTimer);
      showTimer = 0;
    }

    function canShowNow() {
      if (destroyed || suppressed) {
        return false;
      }
      return typeof config.canShow === 'function'
        ? config.canShow() !== false
        : true;
    }

    function markCompleted() {
      state.completedAt = Math.max(1, Number(now()) || Date.now());
      return setStoredEngagementState(chromeApi, state);
    }

    function finishAction(actionId, event) {
      if (hintController) {
        hintController.dismiss();
      }
      markCompleted();
      if (actionId === 'review' && typeof config.onReview === 'function') {
        config.onReview(event);
      }
      if (actionId === 'community' && typeof config.onCommunity === 'function') {
        config.onCommunity(event);
      }
      if (typeof config.onAction === 'function') {
        config.onAction(actionId, event);
      }
    }

    hintController = featureHints.createFeatureHint({
      documentObj,
      definition,
      chromeApi,
      t: config.t,
      getRiSvg: config.getRiSvg,
      badgeIconImageSrc: getExtensionAssetUrl(
        chromeApi,
        'assets/images/lumno.png',
        '../../assets/images/lumno.png'
      ),
      badgeWordmarkImageSrc: getExtensionAssetUrl(
        chromeApi,
        'assets/images/lumno-wordmark-mask.svg',
        '../../assets/images/lumno-wordmark-mask.svg'
      ),
      badgeWordmarkDarkImageSrc: getExtensionAssetUrl(
        chromeApi,
        'assets/images/lumno-wordmark-mask.svg',
        '../../assets/images/lumno-wordmark-mask.svg'
      ),
      initiallyVisible: false,
      actions: [
        {
          id: 'review',
          icon: 'ri-external-link-line',
          labelKey: 'engagement_notice_review',
          labelFallback: 'leave 5 stars',
          variant: 'primary',
          onClick(event) {
            finishAction('review', event);
          }
        },
        {
          id: 'community',
          icon: communityChannel === 'wechat'
            ? 'ri-wechat-fill'
            : 'ri-discord-fill',
          labelKey: 'engagement_notice_community',
          labelFallback: communityChannel === 'wechat'
            ? 'join WeChat group'
            : 'join Discord',
          variant: 'secondary',
          onClick(event) {
            finishAction('community', event);
          }
        }
      ],
      onDismiss() {
        markCompleted();
        if (typeof config.onDismiss === 'function') {
          config.onDismiss();
        }
      }
    });
    if (!hintController) {
      return null;
    }
    hintController.element.setAttribute('data-engagement-surface', surface);

    function exposeIfEligible() {
      showTimer = 0;
      if (!shouldShowEngagementNotice(state, surface, now()) || !canShowNow()) {
        return;
      }
      state.exposureCount += 1;
      state.lastShownAt = Math.max(1, Number(now()) || Date.now());
      setStoredEngagementState(chromeApi, state);
      hintController.setVisible(true);
    }

    function scheduleExposure() {
      clearShowTimer();
      if (!shouldShowEngagementNotice(state, surface, now()) || !canShowNow()) {
        return;
      }
      if (!windowObj || typeof windowObj.setTimeout !== 'function') {
        exposeIfEligible();
        return;
      }
      showTimer = windowObj.setTimeout(exposeIfEligible, delayMs);
    }

    getStoredEngagementState(chromeApi)
      .then((storedState) => {
        if (destroyed) {
          return null;
        }
        state = recordSurfaceOpenInState(storedState, surface, now());
        stateLoaded = true;
        if (meaningfulUseRecorded) {
          state = recordMeaningfulUseInState(state, surface, now());
        }
        return setStoredEngagementState(chromeApi, state);
      })
      .then(() => {
        if (destroyed) {
          return null;
        }
        return Promise.resolve(config.exposureGate).catch(() => null);
      })
      .then(() => {
        if (!destroyed) {
          scheduleExposure();
        }
      });

    return Object.freeze(Object.assign({}, hintController, {
      destroy() {
        destroyed = true;
        clearShowTimer();
        hintController.destroy();
      },
      getState() {
        return normalizeEngagementState(state);
      },
      recordMeaningfulUse() {
        if (destroyed || meaningfulUseRecorded) {
          return;
        }
        meaningfulUseRecorded = true;
        suppressed = true;
        clearShowTimer();
        hintController.setVisible(false);
        if (!stateLoaded) {
          return;
        }
        state = recordMeaningfulUseInState(state, surface, now());
        setStoredEngagementState(chromeApi, state);
      },
      suppressForSession() {
        suppressed = true;
        clearShowTimer();
        hintController.setVisible(false);
      }
    }));
  }

  return Object.freeze({
    DAY_MS,
    DISCORD_URL,
    ENGAGEMENT_NOTICE_ENABLED,
    ENGAGEMENT_NOTICE_ID,
    ENGAGEMENT_NOTICE_STORAGE_KEY,
    ENGAGEMENT_NOTICE_VERSION,
    MAX_EXPOSURES,
    RETRY_COOLDOWN_MS,
    REVIEW_URL,
    SURFACE_THRESHOLDS,
    WECHAT_QR_URL,
    createEngagementNotice,
    createEngagementNoticeDefinition,
    getCommunityChannel,
    getCommunityUrl,
    loadCommunityUrl,
    getDayKey,
    getStoredEngagementState,
    normalizeEngagementState,
    recordMeaningfulUseInState,
    recordSurfaceOpenInState,
    setStoredEngagementState,
    shouldShowEngagementNotice
  });
});
