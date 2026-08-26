import { describe, expect, it, vi } from 'vitest';

import {
  activateGamepadPageTarget,
  reconcileGamepadPageLifecycle,
} from './gamepad-page-runtime';

describe('gamepad page activation', () => {
  it('never falls through to stale cursor coordinates in spatial mode', () => {
    const activateVirtualPointer = vi.fn(() => true);
    const activateCursor = vi.fn(() => true);

    expect(
      activateGamepadPageTarget({
        mode: 'spatial',
        activateSpatial: () => false,
        activateVirtualPointer,
        activateCursor,
      }),
    ).toBe(false);
    expect(activateVirtualPointer).not.toHaveBeenCalled();
    expect(activateCursor).not.toHaveBeenCalled();
  });

  it('uses virtual targets before page coordinates in cursor mode', () => {
    const activateCursor = vi.fn(() => true);

    expect(
      activateGamepadPageTarget({
        mode: 'cursor',
        activateSpatial: () => false,
        activateVirtualPointer: () => true,
        activateCursor,
      }),
    ).toBe(true);
    expect(activateCursor).not.toHaveBeenCalled();
  });
});

describe('gamepad page lifecycle', () => {
  it('neutralizes motion and hides visuals when ownership or visibility is lost', () => {
    const effects = {
      requireNeutral: vi.fn(),
      resetMotion: vi.fn(),
      hideVisuals: vi.fn(),
      showVisuals: vi.fn(),
    };

    reconcileGamepadPageLifecycle({ active: false, ...effects });

    expect(effects.requireNeutral).toHaveBeenCalledOnce();
    expect(effects.resetMotion).toHaveBeenCalledOnce();
    expect(effects.hideVisuals).toHaveBeenCalledOnce();
    expect(effects.showVisuals).not.toHaveBeenCalled();
  });

  it('requires neutral input before restored page control becomes visible', () => {
    const order: string[] = [];

    reconcileGamepadPageLifecycle({
      active: true,
      requireNeutral: () => order.push('neutral'),
      resetMotion: () => order.push('motion'),
      hideVisuals: () => order.push('hide'),
      showVisuals: () => order.push('show'),
    });

    expect(order).toEqual(['neutral', 'motion', 'show']);
  });
});
