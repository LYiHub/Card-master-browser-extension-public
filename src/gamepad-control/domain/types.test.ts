import { describe, expect, it } from 'vitest';

import { DISCONNECTED_GAMEPAD_SNAPSHOT, isGamepadInputSnapshot } from './types';

describe('gamepad input snapshot', () => {
  it('accepts normalized connected and disconnected snapshots', () => {
    expect(isGamepadInputSnapshot(DISCONNECTED_GAMEPAD_SNAPSHOT)).toBe(true);
    expect(
      isGamepadInputSnapshot({
        connected: true,
        index: 1,
        id: 'Wireless Controller',
        mapping: 'standard',
        buttons: [0, 1, 0.42],
        axes: [-1, 0.125, 0, 1],
      }),
    ).toBe(true);
  });

  it('rejects unbounded or non-finite page data', () => {
    expect(
      isGamepadInputSnapshot({
        connected: true,
        index: -1,
        id: 'Controller',
        mapping: 'standard',
        buttons: [0],
        axes: [0],
      }),
    ).toBe(false);
    expect(
      isGamepadInputSnapshot({
        connected: true,
        index: 0,
        id: 'Controller',
        mapping: 'standard',
        buttons: [Number.NaN],
        axes: [0],
      }),
    ).toBe(false);
  });
});
