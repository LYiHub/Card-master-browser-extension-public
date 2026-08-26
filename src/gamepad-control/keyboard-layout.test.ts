import { describe, expect, it } from 'vitest';

import { gamepadKeyboardLayout } from './keyboard-layout';

describe('gamepad keyboard layout', () => {
  it('centers the keyboard directly below the input by default', () => {
    expect(
      gamepadKeyboardLayout({
        anchor: {
          top: 120,
          right: 500,
          bottom: 160,
          left: 300,
          width: 200,
        },
        keyboard: { width: 600, height: 260 },
        viewport: { width: 1_200, height: 800 },
      }),
    ).toEqual({
      left: 400,
      top: 168,
      placement: 'below',
    });
  });

  it('keeps the keyboard inside the horizontal viewport boundary', () => {
    expect(
      gamepadKeyboardLayout({
        anchor: {
          top: 80,
          right: 1_180,
          bottom: 120,
          left: 1_040,
          width: 140,
        },
        keyboard: { width: 600, height: 260 },
        viewport: { width: 1_200, height: 800 },
      }).left,
    ).toBe(888);
  });

  it('moves above the input when the bottom cannot contain it', () => {
    expect(
      gamepadKeyboardLayout({
        anchor: {
          top: 620,
          right: 700,
          bottom: 660,
          left: 500,
          width: 200,
        },
        keyboard: { width: 600, height: 260 },
        viewport: { width: 1_200, height: 800 },
      }),
    ).toEqual({
      left: 600,
      top: 352,
      placement: 'above',
    });
  });

  it('clamps vertically when neither side has enough room', () => {
    const layout = gamepadKeyboardLayout({
      anchor: {
        top: 180,
        right: 260,
        bottom: 220,
        left: 100,
        width: 160,
      },
      keyboard: { width: 500, height: 360 },
      viewport: { width: 600, height: 400 },
    });

    expect(layout.top).toBe(28);
    expect(layout.left).toBe(262);
  });
});
