import { describe, expect, it } from 'vitest';
import {
  GamepadExitGestureTracker,
  gamepadExitGestureStrength,
} from './exit-gesture';
import type { GamepadInputSnapshot } from './types';

function snapshot(axes: number[]): GamepadInputSnapshot {
  return {
    connected: true,
    index: 0,
    id: 'test',
    mapping: 'standard',
    buttons: [],
    axes,
  };
}

describe('gamepad exit gesture', () => {
  it('accepts an imprecise downward and inward gesture', () => {
    expect(
      gamepadExitGestureStrength(snapshot([0.38, 0.68, -0.24, 0.76])),
    ).toBeGreaterThanOrEqual(0.55);
  });

  it('rejects movement that is only downward or only inward', () => {
    expect(gamepadExitGestureStrength(snapshot([0, 0.8, 0, 0.8]))).toBe(0);
    expect(gamepadExitGestureStrength(snapshot([0.8, 0, -0.8, 0]))).toBe(0);
  });

  it('keeps hold progress through a brief stick deviation', () => {
    const tracker = new GamepadExitGestureTracker();
    const matched = snapshot([0.45, 0.76, -0.4, 0.72]);
    const released = snapshot([0, 0, 0, 0]);

    expect(tracker.update(matched, 0).progress).toBe(0);
    for (let now = 100; now < 600; now += 100) {
      tracker.update(matched, now);
    }
    expect(tracker.update(matched, 600).progress).toBeCloseTo(2 / 3);
    expect(tracker.update(released, 720).progress).toBeCloseTo(0.8);
    expect(tracker.update(matched, 760).progress).toBeGreaterThan(0.8);
    expect(tracker.update(matched, 920).complete).toBe(true);
  });

  it('resets after the dropout grace period', () => {
    const tracker = new GamepadExitGestureTracker();
    const matched = snapshot([0.45, 0.76, -0.4, 0.72]);
    const released = snapshot([0, 0, 0, 0]);

    tracker.update(matched, 0);
    tracker.update(matched, 500);
    expect(tracker.update(released, 700).progress).toBe(0);
  });
});
