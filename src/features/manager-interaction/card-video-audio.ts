export const CARD_VIDEO_AUDIO_HOVER_DELAY_MS = 320;
export const CARD_VIDEO_AUDIO_ATTACK_MS = 480;
export const CARD_VIDEO_AUDIO_RELEASE_MS = 140;
export const CARD_VIDEO_AUDIO_INTERACTION_RELEASE_MS = 420;
export const CARD_VIDEO_AUDIO_LOOP_FADE_SECONDS = 0.42;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function cardVideoAudioCurve(progress: number) {
  const normalized = clamp(progress, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

export function cardVideoLoopEnvelope(
  currentTime: number,
  duration: number,
  fadeSeconds = CARD_VIDEO_AUDIO_LOOP_FADE_SECONDS,
) {
  if (
    !Number.isFinite(currentTime) ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return 1;
  }
  const edgeDuration = Math.min(Math.max(0, fadeSeconds), duration / 2);
  if (edgeDuration <= 0) return 1;
  const position = clamp(currentTime, 0, duration);
  const entryGain = cardVideoAudioCurve(position / edgeDuration);
  const exitGain = cardVideoAudioCurve((duration - position) / edgeDuration);
  return Math.min(entryGain, exitGain);
}

export function cardVideoOutputVolume(
  peakVolume: number,
  interactionGain: number,
  currentTime: number,
  duration: number,
) {
  return (
    clamp(peakVolume, 0, 1) *
    clamp(interactionGain, 0, 1) *
    cardVideoLoopEnvelope(currentTime, duration)
  );
}

export function rampCardVideoGain(
  fromGain: number,
  targetGain: number,
  durationMs: number,
  onUpdate: (gain: number) => void,
  onComplete?: () => void,
) {
  const from = clamp(fromGain, 0, 1);
  const target = clamp(targetGain, 0, 1);
  if (durationMs <= 0 || Math.abs(target - from) < 0.001) {
    onUpdate(target);
    onComplete?.();
    return () => undefined;
  }

  const startedAt = performance.now();
  let frame: number | null = null;
  let cancelled = false;
  const render = (timestamp: number) => {
    if (cancelled) return;
    const progress = clamp((timestamp - startedAt) / durationMs, 0, 1);
    onUpdate(from + (target - from) * cardVideoAudioCurve(progress));
    if (progress >= 1) {
      onComplete?.();
      return;
    }
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);

  return () => {
    cancelled = true;
    if (frame !== null) cancelAnimationFrame(frame);
  };
}

export function monitorCardVideoVolume(
  video: HTMLMediaElement,
  peakVolume: number,
  interactionGain: () => number,
) {
  let frame: number | null = null;
  let cancelled = false;
  const render = () => {
    if (cancelled) return;
    video.volume = cardVideoOutputVolume(
      peakVolume,
      interactionGain(),
      video.currentTime,
      video.duration,
    );
    frame = requestAnimationFrame(render);
  };
  render();

  return () => {
    cancelled = true;
    if (frame !== null) cancelAnimationFrame(frame);
  };
}
