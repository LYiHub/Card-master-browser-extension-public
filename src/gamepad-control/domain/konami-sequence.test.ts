import { describe, expect, it } from 'vitest';
import {
  GamepadKonamiSequenceTracker,
  konamiFaceButtonIndices,
} from './konami-sequence';
import type { GamepadInputSnapshot } from './types';

function snapshot(id: string, pressed: number[] = []): GamepadInputSnapshot {
  const buttons = Array.from({ length: 18 }, () => 0);
  for (const index of pressed) buttons[index] = 1;
  return {
    connected: true,
    index: 0,
    id,
    mapping: 'standard',
    buttons,
    axes: [],
  };
}

function enterCode(
  tracker: GamepadKonamiSequenceTracker,
  id: string,
  faceButtons: readonly [number, number],
) {
  const inputs = [12, 12, 13, 13, 14, 15, 14, 15, ...faceButtons];
  let consumedButton: number | null = null;
  tracker.update(snapshot(id), 0);
  inputs.forEach((button, index) => {
    const timestamp = (index + 1) * 100;
    consumedButton = tracker.update(snapshot(id, [button]), timestamp);
    tracker.update(snapshot(id), timestamp + 40);
  });
  return consumedButton;
}

describe('GamepadKonamiSequenceTracker', () => {
  it('maps BA to the physical labels used by each controller family', () => {
    expect(konamiFaceButtonIndices('Xbox Wireless Controller')).toEqual({
      b: 1,
      a: 0,
    });
    expect(konamiFaceButtonIndices('DualSense Wireless Controller')).toEqual({
      b: 1,
      a: 0,
    });
    expect(konamiFaceButtonIndices('Nintendo Switch Pro Controller')).toEqual({
      b: 0,
      a: 1,
    });
    expect(konamiFaceButtonIndices('Vendor: 057e Product: 2009')).toEqual({
      b: 0,
      a: 1,
    });
  });

  it('triggers once for the Xbox and PlayStation position sequence', () => {
    const tracker = new GamepadKonamiSequenceTracker();

    expect(enterCode(tracker, 'Xbox Wireless Controller', [1, 0])).toBe(0);
    expect(enterCode(tracker, 'Xbox Wireless Controller', [1, 0])).toBe(0);
  });

  it('uses Nintendo button labels instead of Xbox button positions', () => {
    const tracker = new GamepadKonamiSequenceTracker();

    expect(enterCode(tracker, 'Nintendo Switch Pro Controller', [0, 1])).toBe(
      1,
    );
  });

  it('rejects held, simultaneous and expired input', () => {
    const tracker = new GamepadKonamiSequenceTracker();
    const id = 'Xbox Wireless Controller';
    tracker.update(snapshot(id), 0);
    expect(tracker.update(snapshot(id, [12]), 100)).toBeNull();
    expect(tracker.update(snapshot(id, [12]), 200)).toBeNull();
    tracker.update(snapshot(id), 240);
    expect(tracker.update(snapshot(id, [12, 13]), 300)).toBeNull();
    tracker.update(snapshot(id), 340);
    expect(tracker.update(snapshot(id, [4]), 400)).toBeNull();
    tracker.update(snapshot(id), 440);
    expect(tracker.update(snapshot(id, [12]), 4_000)).toBeNull();
    tracker.reset(snapshot(id));
    expect(enterCode(tracker, id, [1, 0])).toBe(0);
  });
});
