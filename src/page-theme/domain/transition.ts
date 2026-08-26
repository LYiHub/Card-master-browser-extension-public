export type PageThemeTransitionMode =
  | 'immediate'
  | 'view-transition'
  | 'overlay';

export type PageThemeTransitionTiming = {
  leadInMs: number;
  durationMs: number;
  swapDelayMs: number;
};

const MIN_TRANSITION_MS = 180;
const MAX_LEAD_IN_MS = 180;
const MAX_VISUAL_DURATION_MS = 480;
const SWAP_PROGRESS = 0.42;

export function pageThemeTransitionTiming(
  availableMs: number,
): PageThemeTransitionTiming | null {
  if (!Number.isFinite(availableMs) || availableMs < MIN_TRANSITION_MS) {
    return null;
  }
  const available = Math.round(availableMs);
  const leadInMs = Math.min(MAX_LEAD_IN_MS, Math.round(available * 0.2));
  const durationMs = Math.min(MAX_VISUAL_DURATION_MS, available - leadInMs);
  return {
    leadInMs,
    durationMs,
    swapDelayMs: Math.round(durationMs * SWAP_PROGRESS),
  };
}

export function pageThemeTransitionMode({
  timing,
  reducedMotion,
  pageVisible,
  topFrame,
  viewTransitionAvailable,
  liveVisuals,
  extensionSurfaceOpen,
}: {
  timing: PageThemeTransitionTiming | null;
  reducedMotion: boolean;
  pageVisible: boolean;
  topFrame: boolean;
  viewTransitionAvailable: boolean;
  liveVisuals: boolean;
  extensionSurfaceOpen: boolean;
}): PageThemeTransitionMode {
  if (!timing || !pageVisible) return 'immediate';
  if (reducedMotion) return 'overlay';
  if (
    viewTransitionAvailable &&
    topFrame &&
    !liveVisuals &&
    !extensionSurfaceOpen
  ) {
    return 'view-transition';
  }
  return 'overlay';
}
