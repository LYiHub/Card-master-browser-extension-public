(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoUpdateNotice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  const UPDATE_NOTICE_STORAGE_KEY = '_x_lumno_update_notice_2026_unique_';
  const SETTINGS = root && root.LumnoSettings ? root.LumnoSettings : {};
  const UPDATE_NOTICE_ENABLED_STORAGE_KEY = SETTINGS.UPDATE_NOTICE_ENABLED_STORAGE_KEY ||
    '_x_extension_update_notice_enabled_2026_unique_';
  const UPDATE_NOTICE_ID = 'update-notice';
  const RELEASE_DETAILS_URL = 'https://lumno.kubai.design/release/';
  const GITHUB_RELEASE_API_URL = 'https://api.github.com/repos/kubai087/lumno-extension/releases/tags/';
  const GITHUB_RELEASE_PAGE_URL = 'https://github.com/kubai087/lumno-extension/releases/tag/';

  function normalizeVersionTag(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    return /^v/i.test(raw) ? `v${raw.slice(1)}` : `v${raw}`;
  }

  function formatVersionLabel(value) {
    return normalizeVersionTag(value).replace(/^v/i, '');
  }

  function getReleaseTagCandidates(value) {
    const raw = String(value || '').trim();
    const normalized = normalizeVersionTag(raw);
    const bare = formatVersionLabel(raw);
    return [raw, normalized, bare].filter((candidate, index, list) => (
      candidate && list.indexOf(candidate) === index
    ));
  }

  function sanitizeText(value) {
    return String(value || '')
      .replace(/[\u0000-\u001F\u007F-\u009F\uFEFF\uFFF9-\uFFFD]|\p{Co}/gu, '')
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function decodeHtmlEntities(value) {
    return String(value || '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function stripHtmlTags(value) {
    return decodeHtmlEntities(String(value || '').replace(/<[^>]*>/g, ' '));
  }

  function extractReleaseTitleFromHtml(html) {
    const source = String(html || '');
    const titleMatch = source.match(/<title>\s*Release\s+([\s\S]*?)\s+·\s+[^<]*?GitHub\s*<\/title>/i);
    if (titleMatch) {
      return sanitizeText(stripHtmlTags(titleMatch[1]));
    }
    const ogTitleMatch = source.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']Release\s+([^"']+?)\s+·\s+[^"']*["'][^>]*>/i);
    if (ogTitleMatch) {
      return sanitizeText(stripHtmlTags(ogTitleMatch[1]));
    }
    const h1Match = source.match(/<h1\b[^>]*class=["'][^"']*\bd-inline\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
    return h1Match ? sanitizeText(stripHtmlTags(h1Match[1])) : '';
  }

  function getCurrentVersionTag(chromeApi) {
    const api = chromeApi || (root && root.chrome) || null;
    const version = api && api.runtime && typeof api.runtime.getManifest === 'function'
      ? String((api.runtime.getManifest() || {}).version || '').trim()
      : '';
    return normalizeVersionTag(version);
  }

  function formatTemplate(template, params) {
    let text = String(template || '');
    Object.keys(params || {}).forEach((key) => {
      text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), params[key]);
    });
    return text;
  }

  function stripBadgeButterfly(value) {
    return String(value || '').replace(/^(?:\s*🦋\s*)+/u, '').trim();
  }

  function buildReleaseDetailsUrl(versionTag, options) {
    const params = new URLSearchParams();
    params.set('entry', 'ext');
    const reason = options && typeof options.reason === 'string'
      ? String(options.reason).trim().toLowerCase()
      : '';
    if (reason) {
      params.set('reason', reason);
    }
    const normalizedVersion = normalizeVersionTag(versionTag);
    if (normalizedVersion) {
      params.set('version', normalizedVersion);
    }
    return `${RELEASE_DETAILS_URL}?${params.toString()}`;
  }

  function normalizeUpdateNoticePayload(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const version = normalizeVersionTag(source.version);
    if (!version) {
      return null;
    }
    const reason = String(source.reason || 'update').trim().toLowerCase() || 'update';
    const releaseUrl = String(source.releaseUrl || '').trim() || buildReleaseDetailsUrl(version, { reason });
    return {
      version,
      previousVersion: normalizeVersionTag(source.previousVersion),
      title: sanitizeText(source.title || source.releaseTitle || ''),
      releaseUrl,
      reason,
      updatedAt: Number(source.updatedAt) || 0
    };
  }

  function shouldShowUpdateNotice(payload, currentVersion) {
    const notice = normalizeUpdateNoticePayload(payload);
    const currentVersionTag = normalizeVersionTag(currentVersion);
    return Boolean(
      notice &&
      currentVersionTag &&
      notice.version === currentVersionTag &&
      notice.reason === 'update'
    );
  }

  function normalizeUpdateNoticeEnabled(value) {
    return typeof SETTINGS.normalizeUpdateNoticeEnabled === 'function'
      ? SETTINGS.normalizeUpdateNoticeEnabled(value)
      : value !== false;
  }

  function getStorageRuntime(chromeApi) {
    const api = chromeApi || (root && root.chrome) || null;
    const storage = api && api.storage ? api.storage : null;
    const area = storage && storage.sync
      ? storage.sync
      : (storage && storage.local ? storage.local : null);
    return {
      area,
      name: area && storage && area === storage.sync ? 'sync' : (area ? 'local' : '')
    };
  }

  function getDomIdPart(id) {
    return String(id || 'update-notice')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '') || 'update_notice';
  }

  function createUpdateNoticeDefinition(versionTag, options) {
    const surface = options && options.surface === 'overlay'
      ? 'overlay'
      : (options && options.surface === 'newtab' ? 'newtab' : 'shared');
    const className = surface === 'shared'
      ? 'x-lumno-feature-hint--update-notice'
      : `x-lumno-feature-hint--update-notice x-lumno-feature-hint--update-notice-${surface}`;
    return Object.freeze({
      id: UPDATE_NOTICE_ID,
      introducedIn: normalizeVersionTag(versionTag),
      surface,
      placement: surface === 'overlay' ? 'above search input' : 'below search input',
      className,
      arrowSide: surface === 'overlay' ? 'bottom' : 'top',
      arrowAlign: 'center',
      widthMode: 'container',
      alignMode: 'auto',
      dismissStorage: 'sync',
      rememberOnFirstShow: false,
      badgeIconText: '🦋',
      badgeKey: 'update_notice_badge',
      badgeFallback: '已更新至 {version}',
      textKey: 'update_notice_text',
      textFallback: '查看本次更新',
      linkKey: 'update_notice_link',
      linkFallback: '更新日志',
      closeLabelKey: 'update_notice_close',
      closeLabelFallback: '关闭更新提示'
    });
  }

  function getUpdateNoticeDismissKey(featureHints, versionTag) {
    const definition = createUpdateNoticeDefinition(versionTag);
    if (featureHints && typeof featureHints.getFeatureHintSyncDismissKey === 'function') {
      return featureHints.getFeatureHintSyncDismissKey(definition);
    }
    const idPart = getDomIdPart(definition.id);
    const versionPart = getDomIdPart(definition.introducedIn || 'unversioned');
    return `_x_lumno_feature_hint_sync_dismissed_2026_${idPart}_${versionPart}`;
  }

  function getStoredUpdateNotice(chromeApi) {
    const storageRuntime = getStorageRuntime(chromeApi);
    return new Promise((resolve) => {
      if (!storageRuntime.area || typeof storageRuntime.area.get !== 'function') {
        resolve(null);
        return;
      }
      try {
        storageRuntime.area.get([UPDATE_NOTICE_STORAGE_KEY], (result) => {
          const api = chromeApi || (root && root.chrome) || null;
          const runtimeError = api && api.runtime ? api.runtime.lastError : null;
          resolve(runtimeError ? null : normalizeUpdateNoticePayload(result && result[UPDATE_NOTICE_STORAGE_KEY]));
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function getStoredUpdateNoticeEnabled(chromeApi) {
    const storageRuntime = getStorageRuntime(chromeApi);
    return new Promise((resolve) => {
      if (!storageRuntime.area || typeof storageRuntime.area.get !== 'function') {
        resolve(normalizeUpdateNoticeEnabled(undefined));
        return;
      }
      try {
        storageRuntime.area.get([UPDATE_NOTICE_ENABLED_STORAGE_KEY], (result) => {
          const api = chromeApi || (root && root.chrome) || null;
          const runtimeError = api && api.runtime ? api.runtime.lastError : null;
          resolve(runtimeError
            ? normalizeUpdateNoticeEnabled(undefined)
            : normalizeUpdateNoticeEnabled(result && result[UPDATE_NOTICE_ENABLED_STORAGE_KEY]));
        });
      } catch (e) {
        resolve(normalizeUpdateNoticeEnabled(undefined));
      }
    });
  }

  function setStoredUpdateNotice(chromeApi, payload, callback) {
    const storageRuntime = getStorageRuntime(chromeApi);
    const notice = normalizeUpdateNoticePayload(payload);
    if (!notice || !storageRuntime.area || typeof storageRuntime.area.set !== 'function') {
      if (typeof callback === 'function') {
        callback(false);
      }
      return;
    }
    try {
      storageRuntime.area.set({ [UPDATE_NOTICE_STORAGE_KEY]: notice }, () => {
        const api = chromeApi || (root && root.chrome) || null;
        callback && callback(!(api && api.runtime && api.runtime.lastError));
      });
    } catch (e) {
      if (typeof callback === 'function') {
        callback(false);
      }
    }
  }

  function fetchReleaseTitle(versionTag, options) {
    const fetchImpl = options && typeof options.fetchImpl === 'function'
      ? options.fetchImpl
      : (typeof fetch === 'function' ? fetch : null);
    const normalizedVersion = normalizeVersionTag(versionTag);
    if (!fetchImpl || !normalizedVersion) {
      return Promise.resolve('');
    }
    const candidates = getReleaseTagCandidates(versionTag);
    const headers = {
      Accept: 'application/vnd.github+json'
    };
    function tryApiCandidate(index) {
      const candidate = candidates[index];
      if (!candidate) {
        return Promise.resolve('');
      }
      return fetchImpl(`${GITHUB_RELEASE_API_URL}${encodeURIComponent(candidate)}`, { headers })
        .then((response) => {
          if (!response || !response.ok || typeof response.json !== 'function') {
            return '';
          }
          return response.json();
        })
        .then((release) => {
          const title = sanitizeText(
            release && (release.name || release.title || release.tag_name)
              ? (release.name || release.title || release.tag_name)
              : ''
          );
          return title || tryApiCandidate(index + 1);
        })
        .catch(() => tryApiCandidate(index + 1));
    }
    function tryPageCandidate(index) {
      const candidate = candidates[index];
      if (!candidate) {
        return Promise.resolve('');
      }
      return fetchImpl(`${GITHUB_RELEASE_PAGE_URL}${encodeURIComponent(candidate)}`)
        .then((response) => {
          if (!response || !response.ok || typeof response.text !== 'function') {
            return '';
          }
          return response.text();
        })
        .then((html) => extractReleaseTitleFromHtml(html) || tryPageCandidate(index + 1))
        .catch(() => tryPageCandidate(index + 1));
    }
    return tryApiCandidate(0).then((title) => title || tryPageCandidate(0));
  }

  function publishUpdateNotice(options, callback) {
    const settings = options && typeof options === 'object' ? options : {};
    const chromeApi = settings.chromeApi || (root && root.chrome) || null;
    const version = normalizeVersionTag(settings.version || getCurrentVersionTag(chromeApi));
    if (!version) {
      if (typeof callback === 'function') {
        callback(false);
      }
      return Promise.resolve(false);
    }
    const reason = String(settings.reason || 'update').trim().toLowerCase() || 'update';
    const basePayload = normalizeUpdateNoticePayload({
      version,
      previousVersion: settings.previousVersion,
      title: settings.title,
      releaseUrl: settings.releaseUrl || buildReleaseDetailsUrl(version, { reason }),
      reason,
      updatedAt: Date.now()
    });
    const titlePromise = basePayload.title
      ? Promise.resolve(basePayload.title)
      : fetchReleaseTitle(version, settings);
    return titlePromise.then((title) => {
      setStoredUpdateNotice(chromeApi, Object.assign({}, basePayload, {
        title: sanitizeText(title || basePayload.title || '')
      }), callback);
      return true;
    }).catch(() => {
      setStoredUpdateNotice(chromeApi, basePayload, callback);
      return true;
    });
  }

  function createUpdateNotice(options) {
    const config = options && typeof options === 'object' ? options : {};
    const documentObj = config.documentObj || (typeof document !== 'undefined' ? document : null);
    const featureHints = config.featureHints || (root && root.LumnoFeatureHints) || {};
    const chromeApi = config.chromeApi || (root && root.chrome) || null;
    const currentVersion = normalizeVersionTag(config.version || getCurrentVersionTag(chromeApi));
    if (!documentObj || !currentVersion || !featureHints || typeof featureHints.createFeatureHint !== 'function') {
      return null;
    }

    const storageRuntime = getStorageRuntime(chromeApi);
    const surface = config.surface === 'overlay'
      ? 'overlay'
      : (config.surface === 'newtab' ? 'newtab' : 'shared');
    const definition = createUpdateNoticeDefinition(currentVersion, { surface });
    const dismissKey = getUpdateNoticeDismissKey(featureHints, currentVersion);
    const baseT = typeof config.t === 'function'
      ? config.t
      : function(_key, fallback) { return fallback || ''; };
    const displayVersion = formatVersionLabel(currentVersion);
    let notice = shouldShowUpdateNotice(config.initialNotice, currentVersion)
      ? normalizeUpdateNoticePayload(config.initialNotice)
      : null;
    let updateNoticeEnabled = normalizeUpdateNoticeEnabled(config.updateNoticeEnabled);
    let destroyed = false;
    let titleRefreshPromise = null;
    let sessionSlotClaimed = false;
    let readyPromise = null;

    function translate(key, fallback) {
      if (key === 'update_notice_badge') {
        return stripBadgeButterfly(
          formatTemplate(baseT(key, fallback || '已更新至 {version}'), { version: displayVersion })
        );
      }
      if (key === 'update_notice_text') {
        if (notice && notice.title) {
          return notice.title;
        }
        return formatTemplate(baseT('update_notice_text_fallback', fallback || '查看本次更新'), {
          version: displayVersion
        });
      }
      if (key === 'update_notice_link') {
        return baseT(key, fallback || '更新日志');
      }
      if (key === 'update_notice_close') {
        return baseT(key, fallback || '关闭更新提示');
      }
      return baseT(key, fallback);
    }

    function getActiveNotice() {
      return notice || normalizeUpdateNoticePayload({
        version: currentVersion,
        reason: 'update',
        releaseUrl: buildReleaseDetailsUrl(currentVersion, { reason: 'update' })
      });
    }

    function openDetails(event) {
      const activeNotice = getActiveNotice();
      if (typeof config.onDetailsClick === 'function') {
        config.onDetailsClick(activeNotice, event);
        return;
      }
      const url = activeNotice && activeNotice.releaseUrl ? activeNotice.releaseUrl : '';
      const windowObj = config.windowObj || (typeof window !== 'undefined' ? window : null);
      if (url && windowObj && typeof windowObj.open === 'function') {
        windowObj.open(url, '_blank', 'noopener');
      }
    }

    const hintController = featureHints.createFeatureHint({
      documentObj,
      definition,
      chromeApi,
      dismissKey,
      t: translate,
      getRiSvg: config.getRiSvg,
      initiallyVisible: false,
      onLinkClick: openDetails,
      onDismiss() {
        if (typeof config.onDismiss === 'function') {
          config.onDismiss();
        }
      }
    });
    if (!hintController) {
      return null;
    }

    function isVisible() {
      return typeof hintController.isVisible === 'function'
        ? hintController.isVisible()
        : hintController.element.getAttribute('data-visible') === 'true';
    }

    function claimSessionSlotIfVisible() {
      if (destroyed || sessionSlotClaimed || !isVisible()) {
        return;
      }
      sessionSlotClaimed = true;
      if (typeof config.onSessionSlotClaimed === 'function') {
        config.onSessionSlotClaimed();
      }
    }

    function syncNoticeVisibility() {
      hintController.updateLanguage();
      hintController.setVisible(Boolean(updateNoticeEnabled && notice));
      claimSessionSlotIfVisible();
      if (updateNoticeEnabled) {
        refreshMissingTitle();
      }
    }

    function applyNoticePayload(payload) {
      if (destroyed) {
        return;
      }
      notice = shouldShowUpdateNotice(payload, currentVersion)
        ? normalizeUpdateNoticePayload(payload)
        : null;
      syncNoticeVisibility();
    }

    function refreshMissingTitle() {
      if (destroyed || !notice || notice.title || titleRefreshPromise) {
        return;
      }
      titleRefreshPromise = fetchReleaseTitle(notice.version, config)
        .then((title) => {
          titleRefreshPromise = null;
          const sanitizedTitle = sanitizeText(title || '');
          if (destroyed || !sanitizedTitle || !notice || notice.title) {
            return;
          }
          const nextNotice = normalizeUpdateNoticePayload(Object.assign({}, notice, {
            title: sanitizedTitle
          }));
          if (!nextNotice) {
            return;
          }
          notice = nextNotice;
          hintController.updateLanguage();
          setStoredUpdateNotice(chromeApi, nextNotice);
        })
        .catch(() => {
          titleRefreshPromise = null;
        });
    }

    const storedNoticeReadyPromise = Promise.all([
      getStoredUpdateNotice(chromeApi),
      getStoredUpdateNoticeEnabled(chromeApi)
    ]).then(([payload, enabled]) => {
      updateNoticeEnabled = enabled;
      applyNoticePayload(payload);
    });
    readyPromise = Promise.all([
      storedNoticeReadyPromise,
      hintController.ready || Promise.resolve(false)
    ]).then(() => {
      claimSessionSlotIfVisible();
      return sessionSlotClaimed;
    });

    function handleStorageChanged(changes, areaName) {
      if (destroyed || (storageRuntime.name && areaName && areaName !== storageRuntime.name)) {
        return;
      }
      if (changes && changes[UPDATE_NOTICE_ENABLED_STORAGE_KEY]) {
        updateNoticeEnabled = normalizeUpdateNoticeEnabled(
          changes[UPDATE_NOTICE_ENABLED_STORAGE_KEY].newValue
        );
        syncNoticeVisibility();
      }
      if (changes && changes[UPDATE_NOTICE_STORAGE_KEY]) {
        applyNoticePayload(changes[UPDATE_NOTICE_STORAGE_KEY].newValue);
      }
      if (changes && changes[dismissKey] && changes[dismissKey].newValue && !hintController.isDismissed()) {
        hintController.dismiss();
      }
    }

    if (chromeApi &&
        chromeApi.storage &&
        chromeApi.storage.onChanged &&
        typeof chromeApi.storage.onChanged.addListener === 'function') {
      chromeApi.storage.onChanged.addListener(handleStorageChanged);
    }

    return Object.freeze(Object.assign({}, hintController, {
      applyNoticePayload,
      destroy() {
        destroyed = true;
        if (typeof hintController.destroy === 'function') {
          hintController.destroy();
        }
        if (chromeApi &&
            chromeApi.storage &&
            chromeApi.storage.onChanged &&
            typeof chromeApi.storage.onChanged.removeListener === 'function') {
          chromeApi.storage.onChanged.removeListener(handleStorageChanged);
        }
      },
      getNotice() {
        return notice;
      },
      hasSessionSlot() {
        return sessionSlotClaimed;
      },
      isVisible,
      ready: readyPromise,
      getDetailsUrl() {
        const activeNotice = getActiveNotice();
        return activeNotice ? activeNotice.releaseUrl : '';
      }
    }));
  }

  return Object.freeze({
    UPDATE_NOTICE_STORAGE_KEY,
    UPDATE_NOTICE_ENABLED_STORAGE_KEY,
    RELEASE_DETAILS_URL,
    GITHUB_RELEASE_API_URL,
    GITHUB_RELEASE_PAGE_URL,
    normalizeVersionTag,
    formatVersionLabel,
    getReleaseTagCandidates,
    extractReleaseTitleFromHtml,
    getCurrentVersionTag,
    buildReleaseDetailsUrl,
    normalizeUpdateNoticePayload,
    shouldShowUpdateNotice,
    normalizeUpdateNoticeEnabled,
    createUpdateNoticeDefinition,
    getUpdateNoticeDismissKey,
    getStoredUpdateNotice,
    getStoredUpdateNoticeEnabled,
    setStoredUpdateNotice,
    fetchReleaseTitle,
    publishUpdateNotice,
    createUpdateNotice
  });
});
