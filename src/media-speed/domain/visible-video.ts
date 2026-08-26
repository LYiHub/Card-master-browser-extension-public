export const MEDIA_SPEED_TARGET_SELECTOR = 'video';
export const MEDIA_SPEED_TARGET_MIN_WIDTH = 48;
export const MEDIA_SPEED_TARGET_MIN_HEIGHT = 36;

export type MediaSpeedVideoVisibilityDecision =
  | 'eligible'
  | 'detached'
  | 'display-none'
  | 'visibility-hidden'
  | 'opacity-zero'
  | 'css-hidden'
  | 'too-small-or-offscreen';

export type MediaSpeedViewport = {
  width: number;
  height: number;
};

export type MediaSpeedVideoVisibilityInput = {
  connected: boolean;
  display: string;
  visibility: string;
  opacity: number;
  cssVisible: boolean;
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  viewport: MediaSpeedViewport;
};

export type MediaSpeedVisibleVideoAssessment = {
  eligible: boolean;
  decision: MediaSpeedVideoVisibilityDecision;
  display: string;
  visibility: string;
  opacity: number;
  bounds: MediaSpeedVideoVisibilityInput['bounds'];
  visible: {
    left: number;
    top: number;
    width: number;
    height: number;
    area: number;
  };
};

export function assessMediaSpeedVisibleVideo({
  connected,
  display,
  visibility,
  opacity,
  cssVisible,
  bounds,
  viewport,
}: MediaSpeedVideoVisibilityInput): MediaSpeedVisibleVideoAssessment {
  const left = Math.max(0, Math.min(bounds.left, viewport.width));
  const right = Math.max(0, Math.min(bounds.right, viewport.width));
  const top = Math.max(0, Math.min(bounds.top, viewport.height));
  const bottom = Math.max(0, Math.min(bounds.bottom, viewport.height));
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const decision: MediaSpeedVideoVisibilityDecision = !connected
    ? 'detached'
    : display === 'none'
      ? 'display-none'
      : visibility === 'hidden' || visibility === 'collapse'
        ? 'visibility-hidden'
        : opacity <= 0
          ? 'opacity-zero'
          : !cssVisible
            ? 'css-hidden'
            : width < MEDIA_SPEED_TARGET_MIN_WIDTH ||
                height < MEDIA_SPEED_TARGET_MIN_HEIGHT
              ? 'too-small-or-offscreen'
              : 'eligible';

  return {
    eligible: decision === 'eligible',
    decision,
    display,
    visibility,
    opacity,
    bounds,
    visible: {
      left,
      top,
      width,
      height,
      area: width * height,
    },
  };
}

export function inspectMediaSpeedVisibleVideo(
  video: HTMLVideoElement,
  viewport: MediaSpeedViewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  },
) {
  const style = window.getComputedStyle(video);
  const bounds = video.getBoundingClientRect();
  let cssVisible = true;
  try {
    cssVisible = video.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
      contentVisibilityAuto: true,
    });
  } catch {
    // Geometry and computed styles remain the cross-browser fallback.
  }

  return assessMediaSpeedVisibleVideo({
    connected: video.isConnected,
    display: style.display,
    visibility: style.visibility,
    opacity: Number(style.opacity),
    cssVisible,
    bounds: {
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      width: bounds.width,
      height: bounds.height,
    },
    viewport,
  });
}
