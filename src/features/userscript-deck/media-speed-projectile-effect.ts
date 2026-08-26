import { Skull } from 'lucide-react';
import { createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { extensionDiagnostics } from '../../hosts/extension/diagnostics';
import { projectAssetUrl } from '../../lib/project-assets';
import {
  inspectMediaSpeedVisibleVideo,
  MEDIA_SPEED_TARGET_SELECTOR,
} from '../../media-speed/domain/visible-video';
import { prefersReducedMotion } from '../../motion/preference';
import {
  MEDIA_SPEED_BORDER_FRAME,
  MEDIA_SPEED_BORDER_SEQUENCES,
  MEDIA_SPEED_PROJECTILE_FRAME,
  MEDIA_SPEED_PROJECTILE_SEQUENCES,
} from './media-speed-vfx-catalog.generated';

type Point = {
  x: number;
  y: number;
};

export type MediaSpeedProjectileEntryEdge = 'top' | 'right' | 'bottom' | 'left';

export type MediaSpeedProjectileEntry = {
  edge: MediaSpeedProjectileEntryEdge;
  boundaryPoint: Point;
  point: Point;
};

export type MediaSpeedProjectileGeometry = {
  control: Point;
  distance: number;
  duration: number;
  width: number;
};

export type MediaSpeedProjectileProfile = 'direct' | 'highArc' | 'flank';

export type MediaSpeedVfxMode = 'standard' | 'random' | 'hell';

export type MediaSpeedProjectileEffectOptions = {
  targetColor: string;
  playbackRate: number;
  mode: MediaSpeedVfxMode;
  effectIndex: number;
};

type PreparedProjectileSequence = {
  frames: HTMLImageElement[];
  contentLeft: number;
  dominantHue: number;
  sequenceId: string;
};

type PreparedBorderSequence = {
  frames: HTMLImageElement[];
  dominantHue: number;
  sequenceId: string;
};

type VisibleVideoTarget = {
  element: HTMLVideoElement;
  point: Point;
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  visibleArea: number;
  visibleWidth: number;
  visibleHeight: number;
  paused: boolean;
};

export type MediaSpeedImpactBorderGeometry = {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
};

const FRAME_WIDTH = MEDIA_SPEED_PROJECTILE_FRAME.width;
const FRAME_HEIGHT = MEDIA_SPEED_PROJECTILE_FRAME.height;
const PRE_IMPACT_FADE_DURATION = 80;
const PROJECTILE_ENTRY_CLEARANCE = 280;
const PROJECTILE_ASSET_BASE_PATH =
  'userscript-deck/visual/media-speed-vfx/arrow-trail';
const BORDER_ASSET_BASE_PATH =
  'userscript-deck/visual/media-speed-vfx/video-border';
const BORDER_MINIMUM_WIDTH = 320;
const IMPACT_MINIMUM_FONT_SIZE = 32;
const IMPACT_MAXIMUM_FONT_SIZE = 128;
const IMPACT_FONT_REFERENCE_RATIO = 0.065;
const IMPACT_FRAME_FONT_RATIO = 6.5;
const DIAGNOSTIC_SCOPE = '媒体倍速箭矢';
const PROJECTILE_PROFILES: Record<
  MediaSpeedProjectileProfile,
  {
    along: number;
    liftRatio: number;
    minimumLift: number;
    maximumLift: number;
    lateralRatio: number;
    durationScale: number;
    widthScale: number;
  }
> = {
  direct: {
    along: 0.48,
    liftRatio: 0.025,
    minimumLift: 10,
    maximumLift: 28,
    lateralRatio: 0,
    durationScale: 0.9,
    widthScale: 1.04,
  },
  highArc: {
    along: 0.38,
    liftRatio: 0.3,
    minimumLift: 120,
    maximumLift: 240,
    lateralRatio: 0.1,
    durationScale: 1.03,
    widthScale: 0.98,
  },
  flank: {
    along: 0.68,
    liftRatio: 0.04,
    minimumLift: 18,
    maximumLift: 56,
    lateralRatio: -0.26,
    durationScale: 0.96,
    widthScale: 1.01,
  },
};

let preparedProjectile:
  | {
      index: number;
      sequence: Promise<PreparedProjectileSequence>;
    }
  | undefined;
let preparedBorder:
  | {
      index: number;
      sequence: Promise<PreparedBorderSequence>;
    }
  | undefined;
let activeProjectileCleanup: (() => void) | null = null;
let activeBorderCleanup: (() => void) | null = null;
let effectGeneration = 0;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function mediaSpeedProjectileGeometry(
  start: Point,
  end: Point,
  profile: MediaSpeedProjectileProfile = 'direct',
): MediaSpeedProjectileGeometry {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distance = Math.hypot(deltaX, deltaY);
  const settings = PROJECTILE_PROFILES[profile];
  const inverseDistance = distance > 0 ? 1 / distance : 0;
  const normalX = -deltaY * inverseDistance;
  const normalY = deltaX * inverseDistance;
  const lateralOffset = distance * settings.lateralRatio;
  const arcLift = clamp(
    distance * settings.liftRatio,
    settings.minimumLift,
    settings.maximumLift,
  );
  return {
    control: {
      x: start.x + deltaX * settings.along + normalX * lateralOffset,
      y: start.y + deltaY * settings.along + normalY * lateralOffset - arcLift,
    },
    distance,
    duration: clamp(distance * 0.68 * settings.durationScale, 380, 620),
    width: clamp(distance * settings.widthScale, 480, 760),
  };
}

export function mediaSpeedProjectileImpactPoints(
  center: Point,
  targetWidth: number,
  targetHeight: number,
) {
  const horizontalSpread = clamp(targetWidth * 0.1, 34, 88);
  const verticalSpread = clamp(targetHeight * 0.08, 22, 54);
  return [
    center,
    {
      x: center.x - horizontalSpread,
      y: center.y - verticalSpread * 0.78,
    },
    {
      x: center.x + horizontalSpread,
      y: center.y + verticalSpread * 0.82,
    },
  ];
}

export function mediaSpeedProjectilePreImpactOpacity(remainingTime: number) {
  if (remainingTime >= PRE_IMPACT_FADE_DURATION) return 1;
  if (remainingTime <= 0) return 0;
  const fadeProgress = 1 - remainingTime / PRE_IMPACT_FADE_DURATION;
  return 1 - fadeProgress * fadeProgress * fadeProgress;
}

export function mediaSpeedProjectileLaunchDelays(leadDuration: number) {
  return [0, leadDuration * 0.25, leadDuration * 0.5] as const;
}

export function mediaSpeedProjectileEntryPoint(
  wheel: Point,
  target: Point,
  viewport: { width: number; height: number },
  clearance = PROJECTILE_ENTRY_CLEARANCE,
): MediaSpeedProjectileEntry {
  const origin = {
    x: clamp(wheel.x, 0, viewport.width),
    y: clamp(wheel.y, 0, viewport.height),
  };
  let direction = {
    x: origin.x - target.x,
    y: origin.y - target.y,
  };
  let distance = Math.hypot(direction.x, direction.y);
  if (distance < 0.001) {
    const nearest = [
      { edge: 'top' as const, distance: origin.y, direction: { x: 0, y: -1 } },
      {
        edge: 'right' as const,
        distance: viewport.width - origin.x,
        direction: { x: 1, y: 0 },
      },
      {
        edge: 'bottom' as const,
        distance: viewport.height - origin.y,
        direction: { x: 0, y: 1 },
      },
      {
        edge: 'left' as const,
        distance: origin.x,
        direction: { x: -1, y: 0 },
      },
    ].reduce((current, candidate) =>
      candidate.distance < current.distance ? candidate : current,
    );
    direction = nearest.direction;
    distance = 1;
  }

  const candidates: Array<{
    edge: MediaSpeedProjectileEntryEdge;
    scale: number;
  }> = [];
  if (direction.x > 0) {
    candidates.push({
      edge: 'right',
      scale: (viewport.width - origin.x) / direction.x,
    });
  } else if (direction.x < 0) {
    candidates.push({ edge: 'left', scale: -origin.x / direction.x });
  }
  if (direction.y > 0) {
    candidates.push({
      edge: 'bottom',
      scale: (viewport.height - origin.y) / direction.y,
    });
  } else if (direction.y < 0) {
    candidates.push({ edge: 'top', scale: -origin.y / direction.y });
  }
  const intersection = candidates
    .filter(({ scale }) => scale >= 0)
    .reduce((current, candidate) =>
      candidate.scale < current.scale ? candidate : current,
    );
  const boundaryPoint = {
    x: origin.x + direction.x * intersection.scale,
    y: origin.y + direction.y * intersection.scale,
  };
  const unit = {
    x: direction.x / distance,
    y: direction.y / distance,
  };
  return {
    edge: intersection.edge,
    boundaryPoint,
    point: {
      x: boundaryPoint.x + unit.x * clearance,
      y: boundaryPoint.y + unit.y * clearance,
    },
  };
}

function hexHue(color: string) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) return 0;
  const red = Number.parseInt(match[1] ?? '0', 16) / 255;
  const green = Number.parseInt(match[2] ?? '0', 16) / 255;
  const blue = Number.parseInt(match[3] ?? '0', 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  if (delta === 0) return 0;
  const hue =
    maximum === red
      ? ((green - blue) / delta) % 6
      : maximum === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
  return (hue * 60 + 360) % 360;
}

export function mediaSpeedHueRotation(sourceHue: number, targetColor: string) {
  const targetHue = hexHue(targetColor);
  return ((targetHue - sourceHue + 540) % 360) - 180;
}

export function mediaSpeedImpactBorderGeometry(target: {
  left: number;
  top: number;
  width: number;
  height: number;
}): MediaSpeedImpactBorderGeometry {
  const aspectRatio =
    MEDIA_SPEED_BORDER_FRAME.width / MEDIA_SPEED_BORDER_FRAME.height;
  const referenceWidth = Math.min(target.width, (target.height * 16) / 9);
  const fontSize = clamp(
    referenceWidth * IMPACT_FONT_REFERENCE_RATIO,
    IMPACT_MINIMUM_FONT_SIZE,
    IMPACT_MAXIMUM_FONT_SIZE,
  );
  const preferredWidth = Math.max(
    BORDER_MINIMUM_WIDTH,
    fontSize * IMPACT_FRAME_FONT_RATIO,
  );
  const width = Math.min(
    preferredWidth,
    Math.max(BORDER_MINIMUM_WIDTH, target.width),
  );
  const height = width / aspectRatio;
  return {
    left: target.left + target.width / 2 - width / 2,
    top: target.top + target.height / 2 - height / 2,
    width,
    height,
    fontSize,
  };
}

export function mediaSpeedImpactBorderScale(progress: number) {
  const normalized = clamp(progress, 0, 1);
  const expansion = 1 - (1 - normalized) ** 2;
  return 0.14 + expansion * 0.86;
}

export function mediaSpeedImpactBorderOpacity(progress: number) {
  const normalized = clamp(progress, 0, 1);
  if (normalized >= 1) return 0;
  const fadeIn = clamp(normalized / 0.1, 0, 1);
  const fadeProgress = clamp((normalized - 0.68) / 0.32, 0, 1);
  const fadeOut = 1 - fadeProgress * fadeProgress * fadeProgress;
  return 0.72 * fadeIn * fadeOut;
}

export function mediaSpeedLeadImpactReached(
  projectileIndex: number,
  progress: number,
  alreadyTriggered: boolean,
) {
  return !alreadyTriggered && projectileIndex === 0 && progress >= 1;
}

export function mediaSpeedProjectileTravelProgress(progress: number) {
  const rawProgress = clamp(progress, 0, 1);
  const aerodynamicDrag = 0.08;
  return rawProgress + aerodynamicDrag * rawProgress * (1 - rawProgress);
}

export function mediaSpeedProjectilePoint(
  start: Point,
  control: Point,
  end: Point,
  progress: number,
) {
  const clampedProgress = clamp(progress, 0, 1);
  const remaining = 1 - clampedProgress;
  return {
    x:
      remaining * remaining * start.x +
      2 * remaining * clampedProgress * control.x +
      clampedProgress * clampedProgress * end.x,
    y:
      remaining * remaining * start.y +
      2 * remaining * clampedProgress * control.y +
      clampedProgress * clampedProgress * end.y,
  };
}

function projectileTangent(
  start: Point,
  control: Point,
  end: Point,
  progress: number,
) {
  return {
    x:
      2 * (1 - progress) * (control.x - start.x) +
      2 * progress * (end.x - control.x),
    y:
      2 * (1 - progress) * (control.y - start.y) +
      2 * progress * (end.y - control.y),
  };
}

function loadFrame(source: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

export function mediaSpeedVfxSequenceIndex(
  effectIndex: number,
  sequenceCount: number,
) {
  if (sequenceCount <= 0) return 0;
  const integerIndex = Number.isFinite(effectIndex)
    ? Math.trunc(effectIndex)
    : 0;
  return ((integerIndex % sequenceCount) + sequenceCount) % sequenceCount;
}

function loadProjectileSequence(index: number) {
  const sequence =
    MEDIA_SPEED_PROJECTILE_SEQUENCES[index] ??
    MEDIA_SPEED_PROJECTILE_SEQUENCES[0];
  if (!sequence) {
    return Promise.resolve({
      frames: [],
      contentLeft: 0,
      dominantHue: 0,
      sequenceId: '',
    });
  }
  const startedAt = performance.now();
  const sources = Array.from({ length: sequence.frameCount }, (_, frameIndex) =>
    projectAssetUrl(
      `${PROJECTILE_ASSET_BASE_PATH}/${sequence.id}/${String(frameIndex).padStart(2, '0')}.webp`,
    ),
  );
  return Promise.all(sources.map(loadFrame)).then((frames) => {
    const loadedFrames = frames.filter(
      (frame): frame is HTMLImageElement => frame !== null,
    );
    const details = {
      sequenceId: sequence.id,
      expectedFrameCount: sequence.frameCount,
      loadedFrameCount: loadedFrames.length,
      failedFrameCount: sequence.frameCount - loadedFrames.length,
      contentLeft: sequence.contentLeft,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      firstFrameUrl: sources[0] ?? null,
    };
    if (loadedFrames.length === 0) {
      extensionDiagnostics.warn(
        DIAGNOSTIC_SCOPE,
        '箭矢序列预载失败',
        new Error('箭矢序列没有加载到任何可用帧。'),
        details,
      );
    }
    return {
      frames: loadedFrames,
      contentLeft: sequence.contentLeft,
      dominantHue: sequence.dominantHue,
      sequenceId: sequence.id,
    };
  });
}

function loadBorderSequence(index: number) {
  const sequence =
    MEDIA_SPEED_BORDER_SEQUENCES[index] ?? MEDIA_SPEED_BORDER_SEQUENCES[0];
  if (!sequence) {
    return Promise.resolve({
      frames: [],
      dominantHue: 0,
      sequenceId: '',
    });
  }
  const startedAt = performance.now();
  const sources = Array.from({ length: sequence.frameCount }, (_, frameIndex) =>
    projectAssetUrl(
      `${BORDER_ASSET_BASE_PATH}/${sequence.id}/${String(frameIndex).padStart(2, '0')}.webp`,
    ),
  );
  return Promise.all(sources.map(loadFrame)).then((frames) => {
    const loadedFrames = frames.filter(
      (frame): frame is HTMLImageElement => frame !== null,
    );
    const details = {
      sequenceId: sequence.id,
      sourceName: sequence.sourceName,
      expectedFrameCount: sequence.frameCount,
      loadedFrameCount: loadedFrames.length,
      failedFrameCount: sequence.frameCount - loadedFrames.length,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      firstFrameUrl: sources[0] ?? null,
    };
    if (loadedFrames.length === 0) {
      extensionDiagnostics.warn(
        DIAGNOSTIC_SCOPE,
        '命中边框序列预载失败',
        new Error('命中边框序列没有加载到任何可用帧。'),
        details,
      );
    }
    return {
      frames: loadedFrames,
      dominantHue: sequence.dominantHue,
      sequenceId: sequence.id,
    };
  });
}

function prepareBorderSequence(effectIndex: number) {
  const index = mediaSpeedVfxSequenceIndex(
    effectIndex,
    MEDIA_SPEED_BORDER_SEQUENCES.length,
  );
  if (preparedBorder?.index === index) return preparedBorder.sequence;
  const sequence = loadBorderSequence(index);
  preparedBorder = { index, sequence };
  return sequence;
}

export function prepareMediaSpeedProjectileEffect(effectIndex = 0) {
  const index = mediaSpeedVfxSequenceIndex(
    effectIndex,
    MEDIA_SPEED_PROJECTILE_SEQUENCES.length,
  );
  if (preparedProjectile?.index !== index) {
    preparedProjectile = {
      index,
      sequence: loadProjectileSequence(index),
    };
  }
  void prepareBorderSequence(effectIndex);
  return preparedProjectile.sequence;
}

function visibleVideoTarget(
  video: HTMLVideoElement,
): VisibleVideoTarget | null {
  if (!video.isConnected) return null;
  const assessment = inspectMediaSpeedVisibleVideo(video);
  if (!assessment.eligible) return null;
  return {
    element: video,
    point: {
      x: assessment.visible.left + assessment.visible.width / 2,
      y: assessment.visible.top + assessment.visible.height / 2,
    },
    bounds: {
      left: assessment.visible.left,
      top: assessment.visible.top,
      width: assessment.visible.width,
      height: assessment.visible.height,
    },
    visibleArea: assessment.visible.area,
    visibleWidth: assessment.visible.width,
    visibleHeight: assessment.visible.height,
    paused: video.paused,
  };
}

function primaryVisibleVideoTarget() {
  let best: { score: number; target: VisibleVideoTarget } | undefined;

  for (const video of document.querySelectorAll<HTMLVideoElement>(
    MEDIA_SPEED_TARGET_SELECTOR,
  )) {
    const target = visibleVideoTarget(video);
    if (!target) continue;
    const visibleArea = target.visibleArea;
    const score = visibleArea * (!video.paused && !video.ended ? 1.2 : 1);
    if (best && best.score >= score) continue;
    best = {
      score,
      target,
    };
  }

  return best?.target ?? null;
}

function revalidateVisibleVideoTarget(target: VisibleVideoTarget) {
  return visibleVideoTarget(target.element) ?? primaryVisibleVideoTarget();
}

function mediaSpeedVfxFilter(sourceHue: number, targetColor: string) {
  const rotation = mediaSpeedHueRotation(sourceHue, targetColor);
  return `hue-rotate(${rotation}deg) brightness(1.08) saturate(1.12) drop-shadow(0 0 16px ${targetColor}80)`;
}

function mountImpactBorder(
  sequence: PreparedBorderSequence,
  target: VisibleVideoTarget,
  targetColor: string,
  playbackRate: number,
  showHellIcon: boolean,
  generation: number,
  reducedMotion: boolean,
) {
  if (sequence.frames.length === 0 || generation !== effectGeneration) return;
  activeBorderCleanup?.();

  const geometry = mediaSpeedImpactBorderGeometry(target.bounds);
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.zIndex = '2147483646';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.contain = 'strict';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host {
      position: fixed;
      z-index: 2147483646;
      inset: 0;
      display: block;
      overflow: visible;
      pointer-events: none;
      contain: strict;
    }
    .impact {
      position: absolute;
      display: grid;
      place-items: center;
      transform-origin: 50% 50%;
      pointer-events: none;
      will-change: transform, opacity;
    }
    canvas {
      position: absolute;
      inset: 0;
      z-index: 0;
      display: block;
      width: 100%;
      height: 100%;
      mix-blend-mode: screen;
      pointer-events: none;
    }
    .label {
      position: relative;
      z-index: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.18em;
      color: var(--impact-color);
      font:
        800 var(--impact-font-size) / 1 "Cinzel",
        "Songti SC", STSong, SimSun,
        serif;
      letter-spacing: 0;
      text-shadow:
        0 2px 3px rgb(0 0 0 / 0.96),
        0 0 7px rgb(0 0 0 / 0.82),
        0 0 14px var(--impact-color),
        0 0 28px var(--impact-color);
      -webkit-text-stroke: 1px rgb(8 9 8 / 0.78);
      white-space: nowrap;
      pointer-events: none;
    }
    .label svg {
      display: block;
      width: 1em;
      height: 1em;
      flex: 0 0 auto;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `;
  const impact = document.createElement('div');
  impact.className = 'impact';
  impact.style.left = `${geometry.left}px`;
  impact.style.top = `${geometry.top}px`;
  impact.style.width = `${geometry.width}px`;
  impact.style.height = `${geometry.height}px`;
  impact.style.setProperty('--impact-color', targetColor);
  impact.style.setProperty('--impact-font-size', `${geometry.fontSize}px`);
  const canvas = document.createElement('canvas');
  canvas.width = MEDIA_SPEED_BORDER_FRAME.width;
  canvas.height = MEDIA_SPEED_BORDER_FRAME.height;
  canvas.style.filter = mediaSpeedVfxFilter(sequence.dominantHue, targetColor);
  canvas.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'label';
  label.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) {
    extensionDiagnostics.warn(
      DIAGNOSTIC_SCOPE,
      '命中边框画布创建失败',
      new Error('命中边框没有取得可用的 2D Canvas 上下文。'),
      { generation, sequenceId: sequence.sequenceId },
    );
    return;
  }
  const labelRoot = createRoot(label);
  labelRoot.render(
    createElement(
      Fragment,
      null,
      showHellIcon
        ? createElement(Skull, {
            size: '1em',
            strokeWidth: 2,
            'aria-hidden': true,
          })
        : null,
      `${playbackRate}×`,
    ),
  );
  impact.append(canvas, label);
  shadow.append(style, impact);
  document.documentElement.append(host);

  let animationFrame = 0;
  let lastFrameIndex = -1;
  let removed = false;
  const startedAt = performance.now();
  const duration = reducedMotion
    ? 520
    : (sequence.frames.length / MEDIA_SPEED_BORDER_FRAME.framesPerSecond) *
      1_000;
  const remove = () => {
    if (removed) return;
    removed = true;
    window.cancelAnimationFrame(animationFrame);
    labelRoot.unmount();
    host.remove();
    if (activeBorderCleanup === remove) activeBorderCleanup = null;
  };
  activeBorderCleanup = remove;

  const render = (timestamp: number) => {
    if (generation !== effectGeneration) {
      remove();
      return;
    }
    const progress = clamp((timestamp - startedAt) / duration, 0, 1);
    const frameIndex = Math.min(
      sequence.frames.length - 1,
      Math.floor(progress * sequence.frames.length),
    );
    if (frameIndex !== lastFrameIndex) {
      lastFrameIndex = frameIndex;
      context.clearRect(
        0,
        0,
        MEDIA_SPEED_BORDER_FRAME.width,
        MEDIA_SPEED_BORDER_FRAME.height,
      );
      const frame = sequence.frames[frameIndex];
      if (frame) {
        context.drawImage(
          frame,
          0,
          0,
          MEDIA_SPEED_BORDER_FRAME.width,
          MEDIA_SPEED_BORDER_FRAME.height,
        );
      }
    }
    impact.style.opacity = String(mediaSpeedImpactBorderOpacity(progress));
    impact.style.transform = `scale(${mediaSpeedImpactBorderScale(progress)})`;
    if (progress >= 1) {
      remove();
      return;
    }
    animationFrame = window.requestAnimationFrame(render);
  };
  animationFrame = window.requestAnimationFrame(render);
}

function mountProjectileVolley(
  frames: readonly HTMLImageElement[],
  contentLeft: number,
  sourceHue: number,
  start: Point,
  target: VisibleVideoTarget,
  targetColor: string,
  playbackRate: number,
  showHellIcon: boolean,
  borderSequence: Promise<PreparedBorderSequence>,
  generation: number,
  reducedMotion: boolean,
) {
  if (frames.length === 0) {
    extensionDiagnostics.warn(
      DIAGNOSTIC_SCOPE,
      '箭矢挂载已取消',
      new Error('待播放的箭矢序列没有可用帧。'),
      { generation },
    );
    return;
  }
  if (generation !== effectGeneration) return;
  activeProjectileCleanup?.();

  const impactPoints = mediaSpeedProjectileImpactPoints(
    target.point,
    target.visibleWidth,
    target.visibleHeight,
  );
  const startOffsets = [
    { x: 0, y: 0 },
    { x: -16, y: 10 },
    { x: 18, y: -10 },
  ];
  const profiles: readonly MediaSpeedProjectileProfile[] = [
    'direct',
    'highArc',
    'flank',
  ];
  const leadDuration = mediaSpeedProjectileGeometry(
    start,
    impactPoints[0] ?? target.point,
    'direct',
  ).duration;
  const launchDelays = mediaSpeedProjectileLaunchDelays(leadDuration);
  const trajectories = impactPoints.flatMap((end, index) => {
    const offset = startOffsets[index] ?? { x: 0, y: 0 };
    const profile = profiles[index] ?? 'direct';
    const projectileStart = {
      x: start.x + offset.x,
      y: start.y + offset.y,
    };
    const baseGeometry = mediaSpeedProjectileGeometry(
      projectileStart,
      end,
      profile,
    );
    if (baseGeometry.distance < 80) return [];
    return [
      {
        profile,
        start: projectileStart,
        end,
        delay: launchDelays[index] ?? index * 56,
        geometry: reducedMotion
          ? {
              ...baseGeometry,
              control: {
                x: (projectileStart.x + end.x) / 2,
                y: (projectileStart.y + end.y) / 2,
              },
              duration: Math.min(baseGeometry.duration, 300),
            }
          : baseGeometry,
      },
    ];
  });
  if (trajectories.length === 0) return;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.contain = 'strict';

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host {
      position: fixed;
      z-index: 2147483647;
      inset: 0;
      display: block;
      overflow: visible;
      pointer-events: none;
      contain: strict;
    }
    .projectile {
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
      transform-origin: 0 0;
      pointer-events: none;
      will-change: left, top, transform, opacity;
    }
    canvas {
      position: absolute;
      top: 0;
      left: 0;
      height: auto;
      aspect-ratio: 16 / 9;
      translate: 0 -50%;
      filter: brightness(1.08) saturate(1.08)
        drop-shadow(0 0 16px rgb(255 255 255 / 0.42));
      pointer-events: none;
    }
  `;

  const projectiles = trajectories.flatMap((trajectory) => {
    const element = document.createElement('div');
    element.className = 'projectile';
    const canvas = document.createElement('canvas');
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    canvas.style.width = `${trajectory.geometry.width}px`;
    canvas.style.filter = mediaSpeedVfxFilter(sourceHue, targetColor);
    canvas.setAttribute('aria-hidden', 'true');
    const context = canvas.getContext('2d');
    if (!context) return [];
    element.append(canvas);
    return [
      {
        ...trajectory,
        element,
        context,
        lastFrameIndex: -1,
      },
    ];
  });
  if (projectiles.length !== trajectories.length) {
    extensionDiagnostics.warn(
      DIAGNOSTIC_SCOPE,
      '箭矢画布创建失败',
      new Error('部分箭矢没有取得可用的 2D Canvas 上下文。'),
      {
        generation,
        expectedCanvasCount: trajectories.length,
        createdCanvasCount: projectiles.length,
      },
    );
  }
  if (projectiles.length === 0) {
    return;
  }
  shadow.append(style, ...projectiles.map(({ element }) => element));
  document.documentElement.append(host);

  let animationFrame = 0;
  let leadImpactTriggered = false;
  let removed = false;
  const startedAt = performance.now();

  const remove = () => {
    if (removed) return;
    removed = true;
    window.cancelAnimationFrame(animationFrame);
    host.remove();
    if (activeProjectileCleanup === remove) activeProjectileCleanup = null;
  };
  activeProjectileCleanup = remove;

  const render = (timestamp: number) => {
    const elapsed = timestamp - startedAt;
    let completed = true;
    for (const [projectileIndex, projectile] of projectiles.entries()) {
      const localElapsed = elapsed - projectile.delay;
      if (localElapsed < 0) {
        completed = false;
        continue;
      }
      const rawProgress = clamp(
        localElapsed / projectile.geometry.duration,
        0,
        1,
      );
      if (rawProgress < 1) completed = false;
      const progress = mediaSpeedProjectileTravelProgress(rawProgress);
      const point = mediaSpeedProjectilePoint(
        projectile.start,
        projectile.geometry.control,
        projectile.end,
        progress,
      );
      const tangent = projectileTangent(
        projectile.start,
        projectile.geometry.control,
        projectile.end,
        progress,
      );
      const rotation = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI + 180;
      const frameIndex = Math.min(
        frames.length - 1,
        Math.floor(rawProgress * frames.length),
      );

      if (frameIndex !== projectile.lastFrameIndex) {
        projectile.lastFrameIndex = frameIndex;
        projectile.context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        const frame = frames[frameIndex];
        if (frame) {
          projectile.context.drawImage(
            frame,
            -contentLeft,
            0,
            FRAME_WIDTH,
            FRAME_HEIGHT,
          );
        }
      }

      const fadeIn = clamp(rawProgress / 0.04, 0, 1);
      const remainingTime = Math.max(
        0,
        projectile.geometry.duration - localElapsed,
      );
      const preImpactFade = mediaSpeedProjectilePreImpactOpacity(remainingTime);
      projectile.element.style.left = `${point.x}px`;
      projectile.element.style.top = `${point.y}px`;
      projectile.element.style.opacity = String(
        Math.min(fadeIn, preImpactFade),
      );
      projectile.element.style.transform = `rotate(${rotation}deg)`;
      if (
        mediaSpeedLeadImpactReached(
          projectileIndex,
          rawProgress,
          leadImpactTriggered,
        )
      ) {
        leadImpactTriggered = true;
        void borderSequence.then((sequence) => {
          const impactTarget = revalidateVisibleVideoTarget(target);
          if (!impactTarget) return;
          mountImpactBorder(
            sequence,
            impactTarget,
            targetColor,
            playbackRate,
            showHellIcon,
            generation,
            reducedMotion,
          );
        });
      }
    }

    if (completed) {
      remove();
      return;
    }
    animationFrame = window.requestAnimationFrame(render);
  };

  animationFrame = window.requestAnimationFrame(render);
}

export function playMediaSpeedProjectileEffect(
  source: HTMLElement,
  {
    targetColor,
    playbackRate,
    mode,
    effectIndex,
  }: MediaSpeedProjectileEffectOptions,
) {
  const reducedMotion = prefersReducedMotion();
  const target = primaryVisibleVideoTarget();
  if (!target) return;
  const generation = ++effectGeneration;
  activeProjectileCleanup?.();
  activeBorderCleanup?.();
  const sequence = prepareMediaSpeedProjectileEffect(effectIndex);
  const borderSequence = prepareBorderSequence(effectIndex);
  preparedProjectile = undefined;
  preparedBorder = undefined;
  void sequence.then(({ frames, contentLeft, dominantHue }) => {
    if (generation !== effectGeneration) return;
    const currentTarget = revalidateVisibleVideoTarget(target);
    if (!currentTarget) return;
    const sourceBounds = source.isConnected
      ? source.getBoundingClientRect()
      : {
          left: window.innerWidth / 2,
          top: window.innerHeight,
          width: 0,
          height: 0,
        };
    const wheelBounds =
      (source.isConnected
        ? source
            .closest<HTMLElement>('.manager-deck-entry-cluster')
            ?.getBoundingClientRect()
        : null) ?? sourceBounds;
    const wheelPoint = {
      x: wheelBounds.left + wheelBounds.width / 2,
      y: wheelBounds.top + wheelBounds.height / 2,
    };
    const start = mediaSpeedProjectileEntryPoint(
      wheelPoint,
      currentTarget.point,
      {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    ).point;
    mountProjectileVolley(
      frames,
      contentLeft,
      dominantHue,
      start,
      currentTarget,
      targetColor,
      playbackRate,
      mode === 'hell',
      borderSequence,
      generation,
      reducedMotion,
    );
  });
}
