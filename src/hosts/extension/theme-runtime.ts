import darkSitesText from '../../../vendor/darkreader/src/config/dark-sites.config?raw';
import detectorHintsText from '../../../vendor/darkreader/src/config/detector-hints.config?raw';
import dynamicThemeFixesText from '../../../vendor/darkreader/src/config/dynamic-theme-fixes.config?raw';
import inversionFixesText from '../../../vendor/darkreader/src/config/inversion-fixes.config?raw';
import type {
  DetectorHint,
  DynamicThemeFix,
  Theme,
} from '../../../vendor/darkreader/src/definitions';
import {
  cssFilterStyleSheetTemplate,
  getCSSFilterValue,
} from '../../../vendor/darkreader/src/generators/css-filter';
import { getDetectorHintsFor } from '../../../vendor/darkreader/src/generators/detector-hints';
import { getDynamicThemeFixesFor } from '../../../vendor/darkreader/src/generators/dynamic-theme';
import { indexSitesFixesConfig } from '../../../vendor/darkreader/src/generators/utils/parse';
import {
  runDarkThemeDetector,
  stopDarkThemeDetector,
} from '../../../vendor/darkreader/src/inject/detector';
import {
  createOrUpdateDynamicTheme,
  removeDynamicTheme,
} from '../../../vendor/darkreader/src/inject/dynamic-theme/index';
import { isURLInList } from '../../../vendor/darkreader/src/utils/url';
import {
  type PageThemeTransitionTiming,
  pageThemeTransitionMode,
  pageThemeTransitionTiming,
} from '../../page-theme/domain/transition';
import {
  isPageThemeSettings,
  type PageThemeEngine,
  type PageThemeSettings,
  type PageThemeSnapshot,
  resolvePageTheme,
} from '../../page-theme/domain/types';
import { extensionApiOrNull, sendExtensionRequest } from './api';
import { publishPageThemeSnapshot } from './page-theme-protocol';
import {
  type PageThemeVisualReadiness,
  waitForDynamicPageThemeVisualReady,
} from './page-theme-readiness';
import { EXTENSION_CHANNEL } from './protocol';

type FetchResponse = {
  data?: string;
  error?: string;
};

type ViewTransitionHandle = {
  finished: Promise<unknown>;
  skipTransition?: () => void;
};

type TransitionDocument = Document & {
  startViewTransition?: (
    update: () => void | Promise<void>,
  ) => ViewTransitionHandle;
};

const api = extensionApiOrNull();
const dynamicFixesIndex = indexSitesFixesConfig(dynamicThemeFixesText);
const detectorIndex = indexSitesFixesConfig(detectorHintsText);
const inversionFixesIndex = indexSitesFixesConfig(inversionFixesText);
const knownDarkSites = darkSitesText
  .split(/\r?\n/)
  .map((entry) => entry.trim())
  .filter((entry) => entry && !entry.startsWith('#'));
const filterStyleId = 'card-master-page-theme-filter';
const viewTransitionStyleId = 'card-master-page-theme-view-transition';
const overlayHostId = 'card-master-page-theme-transition-overlay';
const OVERLAY_COVER_WATCHDOG_MS = 2_000;
const VISUAL_FRAME_TIMEOUT_MS = 120;
const extensionSurfaceIds = [
  'card-master-heavy-host',
  'card-master-library-host',
] as const;
let activeEngine: PageThemeEngine | null = null;
let visualTransitionSequence = 0;
let transitionLeadTimer = 0;
let transitionSwapTimer = 0;
let transitionEndTimer = 0;
let activeOverlayHost: HTMLElement | null = null;
let activeViewTransition: ViewTransitionHandle | null = null;
let activeReadinessController: AbortController | null = null;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function systemDark() {
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

function removeFilterTheme() {
  document.getElementById(filterStyleId)?.remove();
}

function cancelThemeReadiness() {
  activeReadinessController?.abort();
  activeReadinessController = null;
}

function clearVisualTransition({ skipView = false } = {}) {
  window.clearTimeout(transitionLeadTimer);
  window.clearTimeout(transitionSwapTimer);
  window.clearTimeout(transitionEndTimer);
  transitionLeadTimer = 0;
  transitionSwapTimer = 0;
  transitionEndTimer = 0;
  (activeOverlayHost ?? document.getElementById(overlayHostId))?.remove();
  activeOverlayHost = null;
  const viewTransition = activeViewTransition;
  activeViewTransition = null;
  if (skipView) viewTransition?.skipTransition?.();
  document.getElementById(viewTransitionStyleId)?.remove();
}

function viewTransitionCss(durationMs: number) {
  return `
::view-transition-old(root) {
  animation: card-master-theme-fade-out ${durationMs}ms cubic-bezier(0.4, 0, 1, 1) both !important;
  mix-blend-mode: normal;
}

::view-transition-new(root) {
  animation: card-master-theme-fade-in ${durationMs}ms cubic-bezier(0, 0, 0.2, 1) both !important;
  mix-blend-mode: normal;
}

@keyframes card-master-theme-fade-out {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

@keyframes card-master-theme-fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
`.trim();
}

function installViewTransitionStyle(durationMs: number) {
  const style =
    (document.getElementById(
      viewTransitionStyleId,
    ) as HTMLStyleElement | null) ?? document.createElement('style');
  style.id = viewTransitionStyleId;
  style.media = 'screen';
  style.textContent = viewTransitionCss(durationMs);
  (document.head ?? document.documentElement).append(style);
}

function pageHasLiveVisuals() {
  if (document.querySelector('canvas')) return true;
  if (
    document
      .getAnimations?.()
      .some((animation) => animation.playState === 'running')
  ) {
    return true;
  }
  return [...document.querySelectorAll<HTMLVideoElement>('video')].some(
    (video) =>
      video.isConnected &&
      !video.paused &&
      !video.ended &&
      video.readyState >= 2,
  );
}

function extensionSurfaceOpen() {
  return extensionSurfaceIds.some((id) => document.getElementById(id));
}

function overlayPresentation(settings: PageThemeSettings) {
  const resolved = resolvePageTheme(settings, location.href, systemDark());
  const leavingDarkTheme = activeEngine !== null && !resolved.activeOnPage;
  return {
    color: leavingDarkTheme
      ? resolved.theme.lightSchemeBackgroundColor
      : resolved.theme.mode === 1
        ? resolved.theme.darkSchemeBackgroundColor
        : resolved.theme.lightSchemeBackgroundColor,
    peakOpacity: leavingDarkTheme ? 0.72 : 0.8,
  };
}

function mountTransitionOverlay(
  settings: PageThemeSettings,
  timing: PageThemeTransitionTiming,
) {
  const host = document.createElement('div');
  host.id = overlayHostId;
  host.setAttribute('aria-hidden', 'true');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.className = 'darkreader';
  const presentation = overlayPresentation(settings);
  const revealDurationMs = Math.max(
    120,
    timing.durationMs - timing.swapDelayMs,
  );
  style.textContent = `
:host {
  all: initial !important;
  position: fixed !important;
  z-index: 2147483645 !important;
  inset: 0 !important;
  display: block !important;
  overflow: hidden !important;
  contain: strict !important;
  isolation: isolate !important;
  pointer-events: none !important;
}

.veil {
  position: absolute;
  inset: 0;
  background: #181a1b;
  opacity: 0;
  will-change: opacity;
  animation: card-master-theme-veil-enter ${timing.swapDelayMs}ms cubic-bezier(0.2, 0, 0, 1) both;
}

@keyframes card-master-theme-veil-enter {
  from {
    opacity: 0;
  }

  to {
    opacity: ${presentation.peakOpacity};
  }
}
`.trim();
  const veil = document.createElement('div');
  veil.className = 'veil';
  veil.style.setProperty('background-color', presentation.color, 'important');
  shadow.append(style, veil);
  document.documentElement.append(host);
  activeOverlayHost = host;
  return {
    peakOpacity: presentation.peakOpacity,
    revealDurationMs,
    veil,
  };
}

function completeVisualTransition(sequence: number) {
  if (sequence !== visualTransitionSequence) return;
  clearVisualTransition();
}

function nextVisualFrame() {
  if (document.visibilityState === 'hidden') return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      resolve();
    };
    const frame = window.requestAnimationFrame(finish);
    const timeout = window.setTimeout(finish, VISUAL_FRAME_TIMEOUT_MS);
  });
}

function revealTransitionOverlay(
  veil: HTMLDivElement,
  peakOpacity: number,
  durationMs: number,
  sequence: number,
) {
  if (sequence !== visualTransitionSequence) return;
  const finish = () => completeVisualTransition(sequence);
  veil.addEventListener('transitionend', finish, { once: true });
  veil.addEventListener('transitioncancel', finish, { once: true });
  veil.style.setProperty('animation', 'none', 'important');
  veil.style.setProperty('opacity', String(peakOpacity), 'important');
  void veil.offsetWidth;
  veil.style.setProperty(
    'transition',
    `opacity ${durationMs}ms cubic-bezier(0.4, 0, 1, 1)`,
    'important',
  );
  veil.style.setProperty('opacity', '0', 'important');
  transitionEndTimer = window.setTimeout(finish, durationMs + 80);
}

function startOverlayTransition(
  settings: PageThemeSettings,
  timing: PageThemeTransitionTiming,
  sequence: number,
) {
  if (sequence !== visualTransitionSequence) return;
  let application: Promise<void> | null = null;
  const apply = () => {
    if (sequence !== visualTransitionSequence) return Promise.resolve();
    application ??= applySettings(settings, sequence);
    return application;
  };
  try {
    const { peakOpacity, revealDurationMs, veil } = mountTransitionOverlay(
      settings,
      timing,
    );
    const reveal = async () => {
      await apply();
      if (sequence !== visualTransitionSequence) return;
      await nextVisualFrame();
      revealTransitionOverlay(veil, peakOpacity, revealDurationMs, sequence);
    };
    let started = false;
    const beginApplication = () => {
      if (started || sequence !== visualTransitionSequence) return;
      started = true;
      window.clearTimeout(transitionSwapTimer);
      transitionSwapTimer = 0;
      void reveal();
    };
    veil.addEventListener('animationend', beginApplication, { once: true });
    veil.addEventListener('animationcancel', beginApplication, { once: true });
    transitionSwapTimer = window.setTimeout(
      beginApplication,
      OVERLAY_COVER_WATCHDOG_MS,
    );
  } catch {
    void apply().finally(() => completeVisualTransition(sequence));
  }
}

function startViewTransition(
  settings: PageThemeSettings,
  timing: PageThemeTransitionTiming,
  sequence: number,
) {
  if (sequence !== visualTransitionSequence) return;
  const pageDocument = document as TransitionDocument;
  if (!pageDocument.startViewTransition) {
    startOverlayTransition(settings, timing, sequence);
    return;
  }
  installViewTransitionStyle(timing.durationMs);
  let application: Promise<void> | null = null;
  const apply = () => {
    if (sequence !== visualTransitionSequence) return Promise.resolve();
    application ??= applySettings(settings, sequence);
    return application;
  };
  try {
    const transition = pageDocument.startViewTransition(apply);
    activeViewTransition = transition;
    const finish = async () => {
      await apply();
      if (sequence !== visualTransitionSequence) return;
      activeViewTransition = null;
      completeVisualTransition(sequence);
    };
    void transition.finished.then(finish, finish);
  } catch {
    document.getElementById(viewTransitionStyleId)?.remove();
    startOverlayTransition(settings, timing, sequence);
  }
}

function cleanupTheme() {
  cancelThemeReadiness();
  stopDarkThemeDetector();
  if (activeEngine === 'dynamicTheme') removeDynamicTheme();
  if (activeEngine === 'cssFilter') removeFilterTheme();
  activeEngine = null;
}

function dynamicFixes(url: string): DynamicThemeFix[] | null {
  return getDynamicThemeFixesFor(
    url,
    dynamicThemeFixesText,
    dynamicFixesIndex,
    true,
  );
}

function detectorHints(url: string): DetectorHint[] {
  return getDetectorHintsFor(url, detectorHintsText, detectorIndex) ?? [];
}

function applyFilterTheme(theme: Theme) {
  const style =
    document.getElementById(filterStyleId) ?? document.createElement('style');
  style.id = filterStyleId;
  style.className = 'darkreader card-master-page-theme-filter';
  style.textContent = cssFilterStyleSheetTemplate(
    'html',
    getCSSFilterValue(theme) ?? 'none',
    getCSSFilterValue({
      ...theme,
      mode: theme.mode === 1 ? 0 : 1,
    }) ?? 'none',
    theme,
    location.href,
    window === window.top,
    inversionFixesText,
    inversionFixesIndex,
  );
  (document.head ?? document.documentElement).append(style);
}

function report(snapshot: PageThemeSnapshot) {
  publishPageThemeSnapshot(snapshot);
}

async function applySettings(settings: PageThemeSettings, sequence: number) {
  if (sequence !== visualTransitionSequence) return;
  cancelThemeReadiness();
  const resolved = resolvePageTheme(settings, location.href, systemDark());
  const baseSnapshot: PageThemeSnapshot = {
    revision: settings.revision,
    status: 'starting',
    enabled: settings.enabled,
    activeOnPage: resolved.activeOnPage,
    inactiveReason: resolved.inactiveReason,
    currentHost: resolved.host,
    engine: resolved.theme.engine,
    darkThemeDetected: false,
  };
  report(baseSnapshot);

  try {
    stopDarkThemeDetector();
    if (!resolved.activeOnPage) {
      cleanupTheme();
      report({ ...baseSnapshot, status: 'ready' });
      return;
    }
    if (
      settings.detectDarkTheme &&
      isURLInList(location.href, knownDarkSites)
    ) {
      cleanupTheme();
      report({
        ...baseSnapshot,
        status: 'ready',
        activeOnPage: false,
        inactiveReason: 'native-dark',
        darkThemeDetected: true,
      });
      return;
    }

    const theme = resolved.theme as Theme;
    let readiness: Promise<PageThemeVisualReadiness> | null = null;
    let readinessController: AbortController | null = null;
    if (theme.engine === 'cssFilter') {
      if (activeEngine === 'dynamicTheme') removeDynamicTheme();
      applyFilterTheme(theme);
      activeEngine = 'cssFilter';
    } else {
      if (activeEngine === 'cssFilter') removeFilterTheme();
      createOrUpdateDynamicTheme(
        theme,
        dynamicFixes(location.href),
        window !== window.top,
      );
      activeEngine = 'dynamicTheme';
      readinessController = new AbortController();
      activeReadinessController = readinessController;
      readiness = waitForDynamicPageThemeVisualReady(document, theme.mode, {
        signal: readinessController.signal,
      });
    }

    if (settings.detectDarkTheme && window === window.top) {
      runDarkThemeDetector((detected) => {
        if (sequence !== visualTransitionSequence || !detected) return;
        cleanupTheme();
        report({
          ...baseSnapshot,
          status: 'ready',
          activeOnPage: false,
          inactiveReason: 'native-dark',
          darkThemeDetected: true,
        });
      }, detectorHints(location.href));
    }

    if (readiness) {
      const result = await readiness;
      if (activeReadinessController === readinessController) {
        activeReadinessController = null;
      }
      if (result === 'cancelled' || sequence !== visualTransitionSequence) {
        return;
      }
    }
    if (sequence !== visualTransitionSequence) return;
    report({
      ...baseSnapshot,
      status: 'ready',
      inactiveReason: null,
    });
  } catch (error) {
    if (sequence !== visualTransitionSequence) return;
    cleanupTheme();
    report({
      ...baseSnapshot,
      status: 'error',
      activeOnPage: false,
      error: errorMessage(error),
    });
  }
}

function installFetchAdapter() {
  if (!api) return;
  const target = window as typeof window & {
    DarkReader?: {
      Plugins?: {
        fetch?: (request: {
          url: string;
          responseType: 'data-url' | 'text';
          mimeType?: string;
          origin: string;
        }) => Promise<string>;
      };
    };
  };
  target.DarkReader ??= {};
  target.DarkReader.Plugins ??= {};
  target.DarkReader.Plugins.fetch = async (request) => {
    const response = await sendExtensionRequest<FetchResponse>(api, {
      channel: EXTENSION_CHANNEL,
      type: 'page-theme-fetch',
      request,
    });
    if (response.error) throw new Error(response.error);
    if (typeof response.data !== 'string') {
      throw new Error('暗夜降临没有收到页面样式资源。');
    }
    return response.data;
  };
}

let installed = false;

export function applyPageThemeSettings(
  settings: PageThemeSettings,
  transitionAvailableMs = 0,
) {
  if (!api || !isPageThemeSettings(settings)) return;
  if (!installed) {
    installed = true;
    installFetchAdapter();
  }
  visualTransitionSequence += 1;
  const sequence = visualTransitionSequence;
  cancelThemeReadiness();
  clearVisualTransition({ skipView: true });
  const authoredTiming = pageThemeTransitionTiming(transitionAvailableMs);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pageVisible = document.visibilityState !== 'hidden';
  if (!authoredTiming || !pageVisible) {
    void applySettings(settings, sequence);
    return;
  }
  const timing = reducedMotion
    ? { leadInMs: 0, durationMs: 240, swapDelayMs: 100 }
    : authoredTiming;
  const pageDocument = document as TransitionDocument;
  const mode = pageThemeTransitionMode({
    timing,
    reducedMotion,
    pageVisible,
    topFrame: window === window.top,
    viewTransitionAvailable:
      typeof pageDocument.startViewTransition === 'function',
    liveVisuals: pageHasLiveVisuals(),
    extensionSurfaceOpen: extensionSurfaceOpen(),
  });
  if (mode === 'immediate') {
    void applySettings(settings, sequence);
    return;
  }
  transitionLeadTimer = window.setTimeout(() => {
    transitionLeadTimer = 0;
    if (mode === 'view-transition') {
      startViewTransition(settings, timing, sequence);
      return;
    }
    startOverlayTransition(settings, timing, sequence);
  }, timing.leadInMs);
}

export function disposePageThemeRuntime() {
  visualTransitionSequence += 1;
  clearVisualTransition({ skipView: true });
  cleanupTheme();
  installed = false;
}
