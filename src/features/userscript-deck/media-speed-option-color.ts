import type { MediaSpeedWheelItem } from '../../media-speed/domain/types';

export const MEDIA_SPEED_RANDOM_COLOR = '#a77be8';
export const MEDIA_SPEED_HELL_COLOR = '#d94f5b';

function standardSpeedColorIndex(speed: number, fallbackIndex: number) {
  if (speed === 0.5) return 1;
  if (speed === 1) return 0;
  return fallbackIndex;
}

export function mediaSpeedWheelItemColor(
  item: MediaSpeedWheelItem,
  index: number,
  standardColors: readonly string[],
) {
  if (item.kind === 'random') return MEDIA_SPEED_RANDOM_COLOR;
  if (item.kind === 'hell') return MEDIA_SPEED_HELL_COLOR;
  return (
    standardColors[standardSpeedColorIndex(item.speed, index)] ?? '#f0c66e'
  );
}
