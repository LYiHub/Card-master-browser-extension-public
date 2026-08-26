import { describe, expect, it } from 'vitest';

import { advanceGamepadMotion, gamepadMotionActive } from './motion';

describe('gamepad motion timeline', () => {
  it('treats stick pressure as acceleration instead of instant speed', () => {
    const precise = advanceGamepadMotion({
      current: { x: 0, y: 0 },
      target: { x: 0.45, y: 0 },
      elapsedMs: 16,
      accelerationMs: 560,
    });
    let urgent = { x: 0, y: 0 };
    for (let frame = 0; frame < 12; frame += 1) {
      urgent = advanceGamepadMotion({
        current: urgent,
        target: { x: 1, y: 0 },
        elapsedMs: 16,
        accelerationMs: 780,
      });
    }

    expect(precise.x).toBeGreaterThan(0);
    expect(precise.x).toBeLessThan(0.03);
    expect(urgent.x).toBeGreaterThan(0.2);
    expect(urgent.x).toBeLessThan(0.3);

    for (let frame = 0; frame < 40; frame += 1) {
      urgent = advanceGamepadMotion({
        current: urgent,
        target: { x: 1, y: 0 },
        elapsedMs: 16,
        accelerationMs: 780,
      });
    }
    expect(urgent.x).toBeGreaterThan(0.98);
  });

  it('brakes faster than it accelerates and settles at zero', () => {
    let motion = { x: 0.8, y: -0.4 };
    for (let frame = 0; frame < 40; frame += 1) {
      motion = advanceGamepadMotion({
        current: motion,
        target: { x: 0, y: 0 },
        elapsedMs: 16,
        accelerationMs: 700,
      });
    }

    expect(gamepadMotionActive(motion)).toBe(false);
  });
});
