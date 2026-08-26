import { describe, expect, it } from 'vitest';

import {
  MEDIA_SPEED_HELL_COLOR,
  MEDIA_SPEED_RANDOM_COLOR,
  mediaSpeedWheelItemColor,
} from './media-speed-option-color';

describe('media speed wheel option colors', () => {
  const colors = [
    '#111111',
    '#222222',
    '#333333',
    '#444444',
    '#555555',
    '#666666',
  ];

  it('keeps 0.5x first while reserving the first gold color for 1x', () => {
    expect(
      mediaSpeedWheelItemColor({ kind: 'speed', speed: 0.5 }, 0, colors),
    ).toBe('#222222');
    expect(
      mediaSpeedWheelItemColor({ kind: 'speed', speed: 1 }, 1, colors),
    ).toBe('#111111');
    expect(
      mediaSpeedWheelItemColor({ kind: 'speed', speed: 1.25 }, 2, colors),
    ).toBe('#333333');
  });

  it('uses the destination speed color for a resolved random result', () => {
    expect(mediaSpeedWheelItemColor({ kind: 'random' }, 1, colors)).toBe(
      MEDIA_SPEED_RANDOM_COLOR,
    );
  });

  it('keeps the hell option visual identity independent of its numeric rate', () => {
    expect(mediaSpeedWheelItemColor({ kind: 'hell' }, 2, colors)).toBe(
      MEDIA_SPEED_HELL_COLOR,
    );
  });
});
