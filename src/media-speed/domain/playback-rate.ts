import type { MediaSpeedSelection } from './types';

export const MEDIA_SPEED_HELL_RATE = 16;

export function mediaSpeedPlaybackRate(
  active: boolean,
  selection: MediaSpeedSelection,
) {
  if (!active) return 1;
  return selection.mode === 'hell' ? MEDIA_SPEED_HELL_RATE : selection.speed;
}

export function setMediaPlaybackRate(
  media: Pick<HTMLMediaElement, 'playbackRate'>,
  rate: number,
) {
  if (Math.abs(media.playbackRate - rate) <= 0.001) return false;
  media.playbackRate = rate;
  return true;
}
