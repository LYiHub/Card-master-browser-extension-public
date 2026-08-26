import { describe, expect, it } from 'vitest';

import {
  pageThemeTransitionMode,
  pageThemeTransitionTiming,
} from './transition';

describe('page theme transition', () => {
  it('fits a short visual transition inside the one-second cast', () => {
    expect(pageThemeTransitionTiming(1_000)).toEqual({
      leadInMs: 180,
      durationMs: 480,
      swapDelayMs: 202,
    });
    expect(pageThemeTransitionTiming(179)).toBeNull();
  });

  it('uses a page snapshot only when the document is safe to freeze briefly', () => {
    const base = {
      timing: pageThemeTransitionTiming(1_000),
      reducedMotion: false,
      pageVisible: true,
      topFrame: true,
      viewTransitionAvailable: true,
      liveVisuals: false,
      extensionSurfaceOpen: false,
    };

    expect(pageThemeTransitionMode(base)).toBe('view-transition');
    expect(pageThemeTransitionMode({ ...base, liveVisuals: true })).toBe(
      'overlay',
    );
    expect(
      pageThemeTransitionMode({ ...base, extensionSurfaceOpen: true }),
    ).toBe('overlay');
    expect(pageThemeTransitionMode({ ...base, reducedMotion: true })).toBe(
      'overlay',
    );
  });
});
