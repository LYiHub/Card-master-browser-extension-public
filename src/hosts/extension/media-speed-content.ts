import {
  isMediaSpeedSelection,
  isMediaSpeedSettings,
  isMediaSpeedSnapshot,
  type MediaSpeedSelection,
  type MediaSpeedSettings,
  type MediaSpeedSnapshot,
  mediaSpeedHost,
  mediaSpeedSelectionsEqual,
  mediaSpeedSiteLockEnabled,
} from '../../media-speed/domain/types';
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
import {
  MEDIA_SPEED_PROXY_REPORT_DATASET,
  MEDIA_SPEED_PROXY_REPORT_EVENT,
  MEDIA_SPEED_PROXY_STATE_DATASET,
  MEDIA_SPEED_PROXY_STATE_EVENT,
  MEDIA_SPEED_SNAPSHOT_DATASET,
  MEDIA_SPEED_SNAPSHOT_EVENT,
} from './media-speed-bridge';
import { claimPageRuntime } from './page-runtime-ownership';

const EXTENSION_CHANNEL = 'card-master';

type ReadResponse = {
  settings?: MediaSpeedSettings;
  selection?: MediaSpeedSelection;
  snapshot?: MediaSpeedSnapshot;
  error?: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function proxyReport(value: unknown): value is {
  videoCount: number;
  audioCount: number;
} {
  return (
    record(value) &&
    Number.isSafeInteger(value.videoCount) &&
    Number(value.videoCount) >= 0 &&
    Number.isSafeInteger(value.audioCount) &&
    Number(value.audioCount) >= 0
  );
}

function stateEvent(value: unknown): value is {
  channel: typeof EXTENSION_CHANNEL;
  type: 'media-speed-state-changed';
  settings: MediaSpeedSettings;
  selection: MediaSpeedSelection;
  activeOnPage: boolean;
} {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'media-speed-state-changed' &&
    isMediaSpeedSettings(value.settings) &&
    isMediaSpeedSelection(value.selection) &&
    typeof value.activeOnPage === 'boolean'
  );
}

function pageSnapshotEvent(value: unknown): value is {
  channel: typeof EXTENSION_CHANNEL;
  type: 'media-speed-page-snapshot';
  snapshot: MediaSpeedSnapshot;
} {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'media-speed-page-snapshot' &&
    isMediaSpeedSnapshot(value.snapshot)
  );
}

function publishPageSnapshot(value: MediaSpeedSnapshot) {
  const root = document.documentElement;
  if (!root) return;
  root.dataset[MEDIA_SPEED_SNAPSHOT_DATASET] = JSON.stringify(value);
  document.dispatchEvent(
    new CustomEvent(MEDIA_SPEED_SNAPSHOT_EVENT, { detail: value }),
  );
}

function mountMediaSpeedContent(api: ExtensionApi) {
  const removeContextBoundary = installExtensionContextBoundary();
  let currentSettings: MediaSpeedSettings | null = null;
  let currentSelection: MediaSpeedSelection | null = null;
  let currentActiveOnPage = false;
  let latestRevision = -1;
  let videoCount = -1;
  let audioCount = -1;
  let disposed = false;
  let navigationRetryTimer = 0;
  let releaseOwnership = () => {};
  let removeContextInvalidation = () => {};
  let removeMessageListener = () => {};
  const navigation = (
    window as typeof window & {
      navigation?: {
        addEventListener(type: string, listener: EventListener): void;
        removeEventListener(type: string, listener: EventListener): void;
      };
    }
  ).navigation;
  const publishLocalSnapshot = () => {
    if (
      window.top !== window ||
      !currentSettings ||
      !currentSelection ||
      disposed
    ) {
      return;
    }
    const localSnapshot: MediaSpeedSnapshot = {
      revision: currentSettings.revision,
      status: 'ready',
      enabled: currentSettings.enabled,
      activeOnPage: currentActiveOnPage,
      currentHost: mediaSpeedHost(location.href),
      lockSpeed: mediaSpeedSiteLockEnabled(currentSettings, location.href),
      mediaCount: Math.max(0, videoCount) + Math.max(0, audioCount),
      videoCount: Math.max(0, videoCount),
      audioCount: Math.max(0, audioCount),
      selection: currentSelection,
      showWheel: currentSettings.showWheel,
      wheelItems: currentSettings.wheelItems,
    };
    publishPageSnapshot(localSnapshot);
  };

  const publishProxyState = () => {
    if (!currentSettings || !currentSelection || disposed) return;
    const root = document.documentElement;
    if (!root) return;
    const proxyState = {
      active: currentActiveOnPage,
      includeAudio: currentSettings.includeAudio,
      lockSpeed: mediaSpeedSiteLockEnabled(currentSettings, location.href),
      selection: currentSelection,
    };
    root.dataset[MEDIA_SPEED_PROXY_STATE_DATASET] = JSON.stringify(proxyState);
    document.dispatchEvent(new Event(MEDIA_SPEED_PROXY_STATE_EVENT));
  };

  const reportMediaState = (
    reportedVideoCount: number,
    reportedAudioCount: number,
  ) => {
    if (
      (reportedVideoCount === videoCount &&
        reportedAudioCount === audioCount) ||
      disposed
    ) {
      return;
    }
    videoCount = reportedVideoCount;
    audioCount = reportedAudioCount;
    publishLocalSnapshot();
    const requestStartedAt = performance.now();
    void sendExtensionRequest<{ snapshot?: MediaSpeedSnapshot }>(api, {
      channel: EXTENSION_CHANNEL,
      type: 'media-speed-frame-report',
      videoCount,
      audioCount,
    }).catch((error) =>
      reportExtensionFailure(
        'media-speed-content',
        'frame-report-failed',
        error,
        {
          videoCount,
          audioCount,
          requestDurationMs:
            Math.round((performance.now() - requestStartedAt) * 10) / 10,
        },
      ),
    );
  };

  const applyResponse = (response: ReadResponse) => {
    if (response.error) throw new Error(response.error);
    if (
      !isMediaSpeedSettings(response.settings) ||
      !isMediaSpeedSelection(response.selection) ||
      !isMediaSpeedSnapshot(response.snapshot) ||
      response.settings.revision !== response.snapshot.revision ||
      !mediaSpeedSelectionsEqual(
        response.selection,
        response.snapshot.selection,
      )
    ) {
      throw new Error('扩展返回了无效的媒体倍速状态。');
    }
    if (!acceptRevision(response.settings.revision)) return;
    currentSettings = response.settings;
    currentSelection = response.selection;
    currentActiveOnPage = response.snapshot.activeOnPage;
    publishProxyState();
    if (window.top === window) publishPageSnapshot(response.snapshot);
    else publishLocalSnapshot();
  };

  const handleProxyReport = () => {
    const serialized =
      document.documentElement?.dataset[MEDIA_SPEED_PROXY_REPORT_DATASET];
    if (!serialized) return;
    try {
      const value: unknown = JSON.parse(serialized);
      if (!proxyReport(value)) return;
      reportMediaState(Number(value.videoCount), Number(value.audioCount));
    } catch {
      // Ignore incomplete reports while the page is navigating.
    }
  };

  const forceNavigationReport = () => {
    if (disposed) return;
    videoCount = -1;
    audioCount = -1;
    const root = document.documentElement;
    if (root) delete root.dataset[MEDIA_SPEED_PROXY_REPORT_DATASET];
    publishProxyState();
    reportMediaState(0, 0);
    window.clearTimeout(navigationRetryTimer);
    navigationRetryTimer = window.setTimeout(() => {
      if (disposed) return;
      videoCount = -1;
      audioCount = -1;
      publishProxyState();
      handleProxyReport();
    }, 400);
  };
  const scheduleNavigationReport = () => {
    if (disposed) return;
    window.clearTimeout(navigationRetryTimer);
    navigationRetryTimer = window.setTimeout(forceNavigationReport, 100);
  };
  const handlePageHide = () => reportMediaState(0, 0);

  const acceptRevision = (revision: number) => {
    if (revision < latestRevision) return false;
    latestRevision = revision;
    return true;
  };

  const handleMessage = (message: unknown) => {
    if (stateEvent(message)) {
      if (!acceptRevision(message.settings.revision)) return;
      currentSettings = message.settings;
      currentSelection = message.selection;
      currentActiveOnPage = message.activeOnPage;
      publishProxyState();
      publishLocalSnapshot();
      return;
    }
    if (window.top === window && pageSnapshotEvent(message)) {
      if (!acceptRevision(message.snapshot.revision)) return;
      publishPageSnapshot(message.snapshot);
    }
  };

  const read = async () => {
    const response = await sendExtensionRequest<ReadResponse>(api, {
      channel: EXTENSION_CHANNEL,
      type: 'media-speed-read',
    });
    applyResponse(response);
  };

  document.addEventListener(MEDIA_SPEED_PROXY_REPORT_EVENT, handleProxyReport);
  window.addEventListener('pageshow', scheduleNavigationReport);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('popstate', scheduleNavigationReport);
  window.addEventListener('hashchange', scheduleNavigationReport);
  document.addEventListener('yt-navigate-finish', scheduleNavigationReport);
  document.addEventListener('yt-page-data-updated', scheduleNavigationReport);
  navigation?.addEventListener('currententrychange', scheduleNavigationReport);
  navigation?.addEventListener('navigatesuccess', scheduleNavigationReport);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    releaseOwnership();
    removeContextInvalidation();
    removeMessageListener();
    window.clearTimeout(navigationRetryTimer);
    document.removeEventListener(
      MEDIA_SPEED_PROXY_REPORT_EVENT,
      handleProxyReport,
    );
    window.removeEventListener('pageshow', scheduleNavigationReport);
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener('popstate', scheduleNavigationReport);
    window.removeEventListener('hashchange', scheduleNavigationReport);
    document.removeEventListener(
      'yt-navigate-finish',
      scheduleNavigationReport,
    );
    document.removeEventListener(
      'yt-page-data-updated',
      scheduleNavigationReport,
    );
    navigation?.removeEventListener(
      'currententrychange',
      scheduleNavigationReport,
    );
    navigation?.removeEventListener(
      'navigatesuccess',
      scheduleNavigationReport,
    );
    removeContextBoundary();
  };

  releaseOwnership = claimPageRuntime('media-speed-content', dispose).release;
  removeMessageListener = registerExtensionListener(
    api.runtime.onMessage,
    handleMessage,
  );
  removeContextInvalidation = onExtensionContextInvalidated(dispose);
  void read().catch((error) =>
    reportExtensionFailure(
      'media-speed-content',
      'settings-read-failed',
      error,
    ),
  );

  return dispose;
}

const api = extensionApiOrNull();
if (api && extensionContentHostUrl(window.location.href)) {
  mountMediaSpeedContent(api);
}
