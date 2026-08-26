import { describe, expect, it } from 'vitest';

import {
  applyGamepadResponseCurve,
  GAMEPAD_FEEL_PRESETS,
  normalizeGamepadResponseCurve,
} from './response-curve';

describe('gamepad response curves', () => {
  it('keeps fixed endpoints and monotonic output', () => {
    const curve = GAMEPAD_FEEL_PRESETS[1].cursorResponse;

    expect(applyGamepadResponseCurve(0, curve)).toBe(0);
    expect(applyGamepadResponseCurve(1, curve)).toBe(1);

    const outputs = Array.from({ length: 21 }, (_, index) =>
      applyGamepadResponseCurve(index / 20, curve),
    );
    expect(outputs).toEqual([...outputs].sort((left, right) => left - right));
  });

  it('gives the rapid preset a stronger middle and late response', () => {
    const precision = GAMEPAD_FEEL_PRESETS[0].cursorResponse;
    const rapid = GAMEPAD_FEEL_PRESETS[2].cursorResponse;

    expect(applyGamepadResponseCurve(0.6, rapid)).toBeGreaterThan(
      applyGamepadResponseCurve(0.6, precision),
    );
    expect(applyGamepadResponseCurve(0.82, rapid)).toBeGreaterThan(
      applyGamepadResponseCurve(0.82, precision),
    );
  });

  it('keeps the balanced cursor precise near the dead-zone edge', () => {
    expect(
      applyGamepadResponseCurve(0.1, GAMEPAD_FEEL_PRESETS[1].cursorResponse),
    ).toBeLessThan(0.005);
  });

  it('keeps a broad precision range before accelerating near full input', () => {
    const balanced = GAMEPAD_FEEL_PRESETS[1].cursorResponse;

    expect(applyGamepadResponseCurve(0.8, balanced)).toBeLessThan(0.12);
    expect(applyGamepadResponseCurve(0.95, balanced)).toBeLessThan(0.6);
    expect(applyGamepadResponseCurve(1, balanced)).toBe(1);
  });

  it('keeps every full-stick scroll preset at half of the original speed', () => {
    expect(GAMEPAD_FEEL_PRESETS.map((preset) => preset.scrollSpeed)).toEqual([
      1_100, 2_250, 4_800,
    ]);
    expect(
      Math.max(...GAMEPAD_FEEL_PRESETS.map((preset) => preset.scrollSpeed)),
    ).toBeLessThanOrEqual(6_000);
  });

  it('normalizes crossing control points into a valid curve', () => {
    expect(
      normalizeGamepadResponseCurve({
        p1: { x: 0.8, y: 0.72 },
        p2: { x: 0.24, y: 0.18 },
      }),
    ).toEqual({
      p1: { x: 0.24, y: 0.18 },
      p2: { x: 0.8, y: 0.72 },
    });
  });
});
