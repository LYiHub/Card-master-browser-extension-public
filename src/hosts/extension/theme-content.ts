import {
  isPageThemeSettings,
  nextPageThemeAutomationChange,
  type PageThemeSettings,
  resolvePageTheme,
} from '../../page-theme/domain/types';
import {
  type ExtensionApi,
  extensionApiOrNull,
  sendExtensionRequest,
} from './api';
import { extensionContentHostUrl } from './content-host-url';
import {
  installExtensionContextBoundary,
  onExtensionContextInvalidated,
  registerExtensionListener,
  reportExtensionFailure,
} from './diagnostics';
import { observePageLocation } from './page-location';
import { claimPageRuntime } from './page-runtime-ownership';
import {
  PAGE_THEME_SNAPSHOT_EVENT,
  PAGE_THEME_TRANSITION_DURATION_MS,
  PAGE_THEME_TRANSITION_REQUEST_EVENT,
  publishPageThemeSnapshot,
  readPageThemeSnapshot,
} from './page-theme-protocol';
import { EXTENSION_CHANNEL, extensionPageThemeEvent } from './protocol';

type SettingsResponse = {
  settings?: PageThemeSettings;
  error?: string;
};

type PageThemeRuntime = typeof import('./theme-runtime');

function mountPageThemeLoader(api: ExtensionApi) {
  const removeContextBoundary = installExtensionContextBoundary();
  const colorScheme = matchMedia('(prefers-color-scheme: dark)');
  let latestSettings: PageThemeSettings | null = null;
  let runtime: PageThemeRuntime | null = null;
  let runtimeLoad: Promise<PageThemeRuntime> | null = null;
  let pendingApply: PageThemeSettings | null = null;
  let transitionDeadline = 0;
  let automationTimer = 0;
  let applyQueued = false;
  let disposed = false;
  let releaseOwnership = () => {};
  let releaseLocationObserver = () => {};
  let removeContextInvalidation = () => {};
  let removeMessageListener = () => {};

  const loadRuntime = async () => {
    if (runtime) return runtime;
    runtimeLoad ??= import(
      /* @vite-ignore */ api.runtime.getURL('theme-runtime.js')
    ).finally(() => {
      runtimeLoad = null;
    });
    runtime = await runtimeLoad;
    return runtime;
  };

  const consumePendingTransition = () => {
    const remaining = transitionDeadline - performance.now();
    transitionDeadline = 0;
    return Math.max(0, remaining);
  };

  const prepareTransition = () => {
    transitionDeadline = Math.max(
      transitionDeadline,
      performance.now() + PAGE_THEME_TRANSITION_DURATION_MS,
    );
    void loadRuntime()
      .then(() => undefined)
      .catch((error) =>
        reportExtensionFailure(
          'page-theme-loader',
          'transition-prepare-failed',
          error,
        ),
      );
  };

  const scheduleAutomation = (settings: PageThemeSettings) => {
    window.clearTimeout(automationTimer);
    automationTimer = 0;
    const nextChange = nextPageThemeAutomationChange(settings);
    if (nextChange === null) return;
    automationTimer = window.setTimeout(
      reapplyAutomation,
      Math.max(0, nextChange - Date.now() + 25),
    );
  };

  const apply = async (settings: PageThemeSettings) => {
    if (disposed) return;
    const previousRevision = latestSettings?.revision ?? -1;
    if (settings.revision < previousRevision) return;

    latestSettings = settings;
    scheduleAutomation(settings);
    const resolved = resolvePageTheme(
      settings,
      location.href,
      colorScheme.matches,
    );
    if (!runtime && !resolved.activeOnPage) {
      transitionDeadline = 0;
      publishPageThemeSnapshot({
        revision: settings.revision,
        status: 'ready',
        enabled: settings.enabled,
        activeOnPage: false,
        inactiveReason: resolved.inactiveReason,
        currentHost: resolved.host,
        engine: resolved.theme.engine,
        darkThemeDetected: false,
      });
      return;
    }

    const loadedRuntime = await loadRuntime();
    if (disposed || latestSettings.revision !== settings.revision) {
      return;
    }
    loadedRuntime.applyPageThemeSettings(settings, consumePendingTransition());
  };

  const scheduleApply = (settings: PageThemeSettings) => {
    const newestRevision = Math.max(
      latestSettings?.revision ?? -1,
      pendingApply?.revision ?? -1,
    );
    if (settings.revision < newestRevision) return;
    latestSettings = settings;
    pendingApply = settings;
    if (applyQueued) return;

    applyQueued = true;
    queueMicrotask(() => {
      applyQueued = false;
      const scheduled = pendingApply;
      pendingApply = null;
      if (!scheduled || disposed) return;
      void apply(scheduled).catch((error) =>
        reportExtensionFailure(
          'page-theme-loader',
          'settings-apply-failed',
          error,
          { revision: scheduled.revision },
        ),
      );
    });
  };

  const readSettings = async () => {
    const response = await sendExtensionRequest<SettingsResponse>(api, {
      channel: EXTENSION_CHANNEL,
      type: 'page-theme-read',
    });
    if (response.error) throw new Error(response.error);
    if (!isPageThemeSettings(response.settings)) {
      throw new Error('扩展返回了无效的暗夜降临设置。');
    }
    scheduleApply(response.settings);
  };

  const handleMessage = (message: unknown) => {
    if (!extensionPageThemeEvent(message)) return;
    scheduleApply(message.settings);
  };
  function reapply() {
    if (latestSettings) scheduleApply(latestSettings);
  }
  function reapplyAutomation() {
    if (!latestSettings) return;
    prepareTransition();
    scheduleApply(latestSettings);
  }
  const reapplySystemAutomation = () => {
    if (latestSettings?.automation.mode === 'system') reapplyAutomation();
  };
  const reapplyVisiblePage = () => {
    if (document.visibilityState !== 'hidden') reapply();
  };
  const reportSnapshot = () => {
    if (window.top !== window) return;
    const snapshot = readPageThemeSnapshot(document);
    if (!snapshot || snapshot.status === 'starting') return;
    void sendExtensionRequest(api, {
      channel: EXTENSION_CHANNEL,
      type: 'page-theme-page-report',
      snapshot,
    }).catch((error) =>
      reportExtensionFailure(
        'page-theme-loader',
        'snapshot-report-failed',
        error,
        { revision: snapshot.revision, status: snapshot.status },
      ),
    );
  };

  function dispose() {
    if (disposed) return;
    disposed = true;
    releaseOwnership();
    releaseLocationObserver();
    removeContextInvalidation();
    removeMessageListener();
    document.removeEventListener(
      PAGE_THEME_TRANSITION_REQUEST_EVENT,
      prepareTransition,
    );
    document.removeEventListener(PAGE_THEME_SNAPSHOT_EVENT, reportSnapshot);
    document.removeEventListener('visibilitychange', reapplyVisiblePage);
    window.removeEventListener('pageshow', reapply);
    colorScheme.removeEventListener('change', reapplySystemAutomation);
    pendingApply = null;
    transitionDeadline = 0;
    window.clearTimeout(automationTimer);
    runtime?.disposePageThemeRuntime();
    runtime = null;
    removeContextBoundary();
  }

  releaseOwnership = claimPageRuntime('page-theme-loader', dispose).release;
  removeMessageListener = registerExtensionListener(
    api.runtime.onMessage,
    handleMessage,
  );
  removeContextInvalidation = onExtensionContextInvalidated(dispose);
  document.addEventListener(
    PAGE_THEME_TRANSITION_REQUEST_EVENT,
    prepareTransition,
  );
  document.addEventListener(PAGE_THEME_SNAPSHOT_EVENT, reportSnapshot);
  document.addEventListener('visibilitychange', reapplyVisiblePage);
  window.addEventListener('pageshow', reapply);
  releaseLocationObserver = observePageLocation(window, reapply);
  colorScheme.addEventListener('change', reapplySystemAutomation);
  void readSettings().catch((error) =>
    reportExtensionFailure('page-theme-loader', 'settings-read-failed', error),
  );
}

const api = extensionApiOrNull();
if (api && extensionContentHostUrl(window.location.href)) {
  mountPageThemeLoader(api);
}
