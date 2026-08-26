import { describe, expect, it } from 'vitest';

import {
  gamepadAxis,
  gamepadAxisWithCurve,
  gamepadDirections,
  gamepadStickVectorWithCurve,
  latchedGamepadButtons,
  moveGamepadCursor,
  newlyPressedGamepadButtons,
} from './input';
import { GAMEPAD_FEEL_PRESETS } from './response-curve';
import type { GamepadInputSnapshot } from './types';

function snapshot(
  buttons: number[] = [],
  axes: number[] = [],
): GamepadInputSnapshot {
  return {
    connected: true,
    index: 0,
    id: 'controller',
    mapping: 'standard',
    buttons,
    axes,
  };
}

describe('gamepad webpage input', () => {
  it('reports only newly pressed buttons', () => {
    expect(
      newlyPressedGamepadButtons([true, false, false], snapshot([1, 0.8, 0])),
    ).toEqual({
      current: [true, true, false],
      pressed: [1],
    });
  });

  it('latches analog buttons until they return to the release range', () => {
    expect(latchedGamepadButtons(snapshot([0.5]), [false])).toEqual([true]);
    expect(latchedGamepadButtons(snapshot([0.49]), [true])).toEqual([true]);
    expect(latchedGamepadButtons(snapshot([0.36]), [true])).toEqual([true]);
    expect(latchedGamepadButtons(snapshot([0.35]), [true])).toEqual([false]);
  });

  it('applies a smooth dead zone to analog axes', () => {
    expect(gamepadAxis(snapshot([], [0.12]), 0)).toBe(0);
    expect(gamepadAxis(snapshot([], [0.58]), 0)).toBeGreaterThan(0.25);
    expect(gamepadAxis(snapshot([], [-1]), 0)).toBe(-1);
  });

  it('applies independent response curves without changing full input', () => {
    const value = snapshot([], [0.68]);
    const precision = gamepadAxisWithCurve(
      value,
      0,
      0.16,
      GAMEPAD_FEEL_PRESETS[0].cursorResponse,
    );
    const rapid = gamepadAxisWithCurve(
      value,
      0,
      0.16,
      GAMEPAD_FEEL_PRESETS[2].cursorResponse,
    );

    expect(rapid).toBeGreaterThan(precision);
    expect(
      gamepadAxisWithCurve(
        snapshot([], [-1]),
        0,
        0.16,
        GAMEPAD_FEEL_PRESETS[2].cursorResponse,
      ),
    ).toBe(-1);
  });

  it('uses radial stick magnitude without diagonal speed inflation', () => {
    const curve = GAMEPAD_FEEL_PRESETS[1].cursorResponse;
    const horizontal = gamepadStickVectorWithCurve(
      snapshot([], [1, 0]),
      [0, 1],
      0.16,
      curve,
    );
    const diagonal = gamepadStickVectorWithCurve(
      snapshot([], [1, 1]),
      [0, 1],
      0.16,
      curve,
    );

    expect(Math.hypot(horizontal.x, horizontal.y)).toBeCloseTo(1);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2, 4);
  });

  it('keeps d-pad directions independent from analog cursor movement', () => {
    const buttons = Array.from({ length: 16 }, () => 0);
    buttons[12] = 1;
    buttons[15] = 1;

    expect(gamepadDirections(snapshot(buttons, [1, 1]))).toEqual([
      'up',
      'right',
    ]);
  });

  it('clamps cursor motion to the visible viewport', () => {
    expect(
      moveGamepadCursor({
        position: { x: 90, y: 40 },
        input: { x: 1, y: -1 },
        elapsedMs: 40,
        viewport: { width: 100, height: 80 },
      }),
    ).toEqual({ x: 90, y: 10 });
  });
});
