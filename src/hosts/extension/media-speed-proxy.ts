import {
  mediaSpeedPlaybackRate,
  setMediaPlaybackRate,
} from '../../media-speed/domain/playback-rate';
import {
  type MediaSpeedPendingWrite,
  mediaSpeedConsumeWriteEcho,
  mediaSpeedRateChangeDecision,
} from '../../media-speed/domain/rate-change-policy';
import {
  isMediaSpeedSelection,
  type MediaSpeedSelection,
  mediaSpeedSelectionsEqual,
} from '../../media-speed/domain/types';
import {
  MEDIA_SPEED_PROXY_REPORT_DATASET,
  MEDIA_SPEED_PROXY_REPORT_EVENT,
  MEDIA_SPEED_PROXY_STATE_DATASET,
  MEDIA_SPEED_PROXY_STATE_EVENT,
} from './media-speed-bridge';
import { claimPageRuntime } from './page-runtime-ownership';

// Page adapter around the media discovery and arbitration contracts pinned in
// upstreams.json. Card Master owns settings and UI; the page owns media nodes.

type ProxyState = {
  active: boolean;
  includeAudio: boolean;
  lockSpeed: boolean;
  selection: MediaSpeedSelection;
};

type ProxyReport = {
  videoCount: number;
  audioCount: number;
};

type ProxyRuntime = {
  dispose(): void;
};

type LockRetry = {
  count: number;
  lastAt: number;
  timer: number;
};

const RUNTIME_KEY = '__cardMasterMediaSpeedRuntime__';
const LOCK_RETRY_BASE_MS = 120;
const LOCK_RETRY_MAX_MS = 1_200;
const LOCK_RETRY_WINDOW_MS = 3_000;
const PENDING_WRITE_LIMIT = 4;
const EXTENSION_MEDIA_HOST_IDS = new Set([
  'card-master-content-host',
  'card-master-heavy-host',
  'card-master-library-host',
]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function proxyState(value: unknown): value is ProxyState {
  return (
    record(value) &&
    typeof value.active === 'boolean' &&
    typeof value.includeAudio === 'boolean' &&
    typeof value.lockSpeed === 'boolean' &&
    isMediaSpeedSelection(value.selection)
  );
}

function readProxyState() {
  const serialized =
    document.documentElement?.dataset[MEDIA_SPEED_PROXY_STATE_DATASET];
  if (!serialized) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    return proxyState(value) ? value : null;
  } catch {
    return null;
  }
}

function selectionKey(selection: MediaSpeedSelection) {
  return selection.mode === 'hell' ? 'hell' : `speed:${selection.speed}`;
}

function mountMediaSpeedProxy(): ProxyRuntime {
  let state: ProxyState = {
    active: false,
    includeAudio: false,
    lockSpeed: false,
    selection: { mode: 'standard', speed: 1 },
  };
  let disposed = false;
  let tracking = false;
  let reportQueued = false;
  let publishedVideoCount = -1;
  let publishedAudioCount = -1;
  const media = new Set<HTMLMediaElement>();
  const roots = new Set<Document | ShadowRoot>();
  const pendingRoots = new Set<WeakRef<ShadowRoot>>();
  const observers = new Map<Document | ShadowRoot, MutationObserver>();
  const pendingWrites = new WeakMap<
    HTMLMediaElement,
    MediaSpeedPendingWrite[]
  >();
  const writeGenerations = new WeakMap<HTMLMediaElement, number>();
  const appliedKeys = new WeakMap<HTMLMediaElement, string>();
  const lockRetries = new Map<HTMLMediaElement, LockRetry>();
  const originalAttachShadow = Element.prototype.attachShadow;
  const eligibleFor = (element: HTMLMediaElement, candidate: ProxyState) => {
    if (element instanceof HTMLAudioElement) return candidate.includeAudio;
    return element instanceof HTMLVideoElement;
  };
  const eligible = (element: HTMLMediaElement) => eligibleFor(element, state);
  const hasMediaSource = (element: HTMLMediaElement) =>
    element.readyState > 0 ||
    Boolean(
      element.currentSrc ||
        element.getAttribute('src') ||
        element.querySelector('source[src]') ||
        element.srcObject,
    );

  const targetRate = () =>
    mediaSpeedPlaybackRate(state.active, state.selection);

  const applicationKey = (element: HTMLMediaElement) =>
    `${element.currentSrc || element.getAttribute('src') || ''}|${selectionKey(state.selection)}`;

  const clearLockRetry = (element: HTMLMediaElement) => {
    const retry = lockRetries.get(element);
    if (retry) window.clearTimeout(retry.timer);
    lockRetries.delete(element);
  };

  const clearLockRetries = () => {
    for (const [element] of lockRetries) clearLockRetry(element);
  };

  const queueWrite = (element: HTMLMediaElement, rate: number) => {
    const generation = (writeGenerations.get(element) ?? 0) + 1;
    writeGenerations.set(element, generation);
    const pending = [
      ...(pendingWrites.get(element) ?? []),
      { generation, rate },
    ].slice(-PENDING_WRITE_LIMIT);
    pendingWrites.set(element, pending);
  };

  const consumeWriteEcho = (element: HTMLMediaElement) => {
    const result = mediaSpeedConsumeWriteEcho(
      pendingWrites.get(element) ?? [],
      element.playbackRate,
    );
    if (result.pending.length > 0) pendingWrites.set(element, result.pending);
    else pendingWrites.delete(element);
    return result.ownChange;
  };

  const applyElement = (
    element: HTMLMediaElement,
    { force = false }: { force?: boolean } = {},
  ) => {
    if (!state.active || !element.isConnected || !eligible(element)) return;
    const key = applicationKey(element);
    if (!force && appliedKeys.get(element) === key) return;
    const rate = targetRate();
    if (Math.abs(element.playbackRate - rate) > 0.001) {
      try {
        queueWrite(element, rate);
        setMediaPlaybackRate(element, rate);
      } catch {
        pendingWrites.delete(element);
        return;
      }
    }
    appliedKeys.set(element, key);
  };

  const restoreElement = (element: HTMLMediaElement) => {
    appliedKeys.delete(element);
    clearLockRetry(element);
    if (!element.isConnected || Math.abs(element.playbackRate - 1) <= 0.001) {
      return;
    }
    try {
      queueWrite(element, 1);
      setMediaPlaybackRate(element, 1);
    } catch {
      pendingWrites.delete(element);
    }
  };

  const untrack = (element: HTMLMediaElement) => {
    media.delete(element);
    clearLockRetry(element);
    pendingWrites.delete(element);
    element.removeEventListener('play', handlePlay);
    element.removeEventListener('playing', handlePlaying);
    element.removeEventListener('ratechange', handleRateChange);
    element.removeEventListener('seeking', handleMediaBoundary);
    element.removeEventListener('seeked', handleMediaBoundary);
    element.removeEventListener('loadstart', handleMediaBoundary);
    element.removeEventListener('loadedmetadata', handleLoadedMetadata);
  };

  const currentMediaCounts = () => {
    for (const element of media) {
      if (!element.isConnected) untrack(element);
    }
    let videoCount = 0;
    let audioCount = 0;
    for (const element of media) {
      if (!eligible(element) || !hasMediaSource(element)) continue;
      if (element instanceof HTMLVideoElement) videoCount += 1;
      else if (element instanceof HTMLAudioElement) audioCount += 1;
    }
    return { videoCount, audioCount };
  };

  function publishReport() {
    if (reportQueued || disposed) return;
    reportQueued = true;
    queueMicrotask(() => {
      reportQueued = false;
      if (disposed) return;
      const root = document.documentElement;
      if (!root) return;
      const counts = currentMediaCounts();
      if (
        counts.videoCount === publishedVideoCount &&
        counts.audioCount === publishedAudioCount
      ) {
        return;
      }
      publishedVideoCount = counts.videoCount;
      publishedAudioCount = counts.audioCount;
      const report: ProxyReport = counts;
      root.dataset[MEDIA_SPEED_PROXY_REPORT_DATASET] = JSON.stringify(report);
      document.dispatchEvent(new Event(MEDIA_SPEED_PROXY_REPORT_EVENT));
    });
  }

  const scheduleLockedRestore = (
    element: HTMLMediaElement,
    retryCount: number,
    now: number,
  ) => {
    clearLockRetry(element);
    const count = retryCount + 1;
    const delay = Math.min(
      LOCK_RETRY_BASE_MS * 2 ** Math.max(0, count - 1),
      LOCK_RETRY_MAX_MS,
    );
    const timer = window.setTimeout(() => {
      const retry = lockRetries.get(element);
      if (!retry || retry.timer !== timer) return;
      retry.timer = 0;
      if (state.active && state.lockSpeed) {
        applyElement(element, { force: true });
      }
    }, delay);
    lockRetries.set(element, { count, lastAt: now, timer });
  };

  function handleRateChange(event: Event) {
    const element = event.currentTarget;
    if (!(element instanceof HTMLMediaElement)) return;
    const now = performance.now();
    const ownChange = consumeWriteEcho(element);
    const previousRetry = lockRetries.get(element);
    const retryCount =
      previousRetry && now - previousRetry.lastAt <= LOCK_RETRY_WINDOW_MS
        ? previousRetry.count
        : 0;
    const decision = mediaSpeedRateChangeDecision({
      active: state.active,
      eligible: eligible(element),
      ownChange,
      readyState: element.readyState,
      currentRate: element.playbackRate,
      targetRate: targetRate(),
      lockSpeed: state.lockSpeed,
      retryCount,
    });

    if (decision === 'restore') {
      scheduleLockedRestore(element, retryCount, now);
      return;
    }
    if (decision === 'surrender' || decision === 'release') {
      clearLockRetry(element);
    }
  }

  function handlePlay(event: Event) {
    const element = event.currentTarget;
    if (!(element instanceof HTMLMediaElement)) return;
    applyElement(element);
    publishReport();
  }

  function handlePlaying(event: Event) {
    const element = event.currentTarget;
    if (!(element instanceof HTMLMediaElement)) return;
    applyElement(element);
    publishReport();
  }

  function handleMediaBoundary(event: Event) {
    const element = event.currentTarget;
    if (!(element instanceof HTMLMediaElement)) return;
    pendingWrites.delete(element);
  }

  function handleLoadedMetadata(event: Event) {
    const element = event.currentTarget;
    if (!(element instanceof HTMLMediaElement)) return;
    handleMediaBoundary(event);
    appliedKeys.delete(element);
    clearLockRetry(element);
    applyElement(element);
    publishReport();
  }

  const track = (element: HTMLMediaElement) => {
    if (media.has(element)) return;
    media.add(element);
    element.addEventListener('play', handlePlay);
    element.addEventListener('playing', handlePlaying);
    element.addEventListener('ratechange', handleRateChange);
    element.addEventListener('seeking', handleMediaBoundary);
    element.addEventListener('seeked', handleMediaBoundary);
    element.addEventListener('loadstart', handleMediaBoundary);
    element.addEventListener('loadedmetadata', handleLoadedMetadata);
    applyElement(element);
  };

  const scanNode = (node: Node) => {
    if (node instanceof HTMLMediaElement) track(node);
    if (!(node instanceof Element || node instanceof DocumentFragment)) return;
    for (const element of node.querySelectorAll<HTMLMediaElement>(
      'video, audio',
    )) {
      track(element);
    }
  };

  // Video Speed Controller scans existing media separately from later mutations.
  const scanRoot = (root: Document | ShadowRoot) => {
    for (const element of root.querySelectorAll<HTMLMediaElement>(
      'video, audio',
    )) {
      track(element);
    }
  };

  const observeRoot = (root: Document | ShadowRoot) => {
    if (!tracking || observers.has(root)) return;
    if (
      root instanceof ShadowRoot &&
      EXTENSION_MEDIA_HOST_IDS.has(root.host.id)
    ) {
      return;
    }
    roots.add(root);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) scanNode(node);
      }
      publishReport();
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
    });
    observers.set(root, observer);
    scanRoot(root);
    publishReport();
  };

  const applyAll = () => {
    for (const element of media) applyElement(element, { force: true });
    publishReport();
  };

  const handleState = () => {
    const next = readProxyState();
    if (!next) return;
    const previous = state;
    const shouldApply =
      next.active &&
      (!state.active ||
        next.includeAudio !== state.includeAudio ||
        !mediaSpeedSelectionsEqual(next.selection, state.selection));
    const shouldResetRetries =
      !next.active ||
      next.lockSpeed !== state.lockSpeed ||
      !mediaSpeedSelectionsEqual(next.selection, state.selection);
    if (previous.active && !next.active) {
      for (const element of media) {
        if (eligibleFor(element, previous)) restoreElement(element);
      }
    } else if (previous.includeAudio && !next.includeAudio) {
      for (const element of media) {
        if (element instanceof HTMLAudioElement) restoreElement(element);
      }
    }
    state = next;
    if (!next.active) {
      stopTracking();
      return;
    }
    startTracking();
    if (shouldResetRetries) {
      clearLockRetries();
    }
    if (shouldApply) applyAll();
    else publishReport();
  };

  function startTracking() {
    if (disposed || tracking) return;
    tracking = true;
    observeRoot(document);
    for (const reference of pendingRoots) {
      const root = reference.deref();
      if (root) observeRoot(root);
    }
    pendingRoots.clear();
  }

  function stopTracking() {
    if (!tracking) {
      publishReport();
      return;
    }
    tracking = false;
    clearLockRetries();
    for (const observer of observers.values()) observer.disconnect();
    observers.clear();
    for (const root of roots) {
      if (root instanceof ShadowRoot && root.host.isConnected) {
        pendingRoots.add(new WeakRef(root));
      }
    }
    roots.clear();
    for (const element of media) untrack(element);
    media.clear();
    publishReport();
  }

  const patchedAttachShadow: typeof Element.prototype.attachShadow =
    function mediaSpeedAttachShadow(this: Element, init: ShadowRootInit) {
      const root = originalAttachShadow.call(this, init);
      if (!EXTENSION_MEDIA_HOST_IDS.has(root.host.id)) {
        if (tracking) observeRoot(root);
        else pendingRoots.add(new WeakRef(root));
      }
      return root;
    };
  Element.prototype.attachShadow = patchedAttachShadow;

  document.addEventListener(MEDIA_SPEED_PROXY_STATE_EVENT, handleState);
  handleState();

  return {
    dispose() {
      if (disposed) return;
      stopTracking();
      disposed = true;
      document.removeEventListener(MEDIA_SPEED_PROXY_STATE_EVENT, handleState);
      if (Element.prototype.attachShadow === patchedAttachShadow) {
        Element.prototype.attachShadow = originalAttachShadow;
      }
      roots.clear();
      pendingRoots.clear();
    },
  };
}

const pageWindow = window as typeof window & {
  [RUNTIME_KEY]?: ProxyRuntime;
};
pageWindow[RUNTIME_KEY]?.dispose();
const proxyRuntime = mountMediaSpeedProxy();
let releaseOwnership = () => {};
const ownedRuntime: ProxyRuntime = {
  dispose() {
    releaseOwnership();
    proxyRuntime.dispose();
  },
};
releaseOwnership = claimPageRuntime(
  'media-speed-proxy',
  ownedRuntime.dispose,
).release;
pageWindow[RUNTIME_KEY] = ownedRuntime;
