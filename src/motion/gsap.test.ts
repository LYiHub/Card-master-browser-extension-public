import { describe, expect, it } from 'vitest';

import {
  gsapTimeScaleForPreference,
  REDUCED_MOTION_GSAP_TIME_SCALE,
} from './gsap';

describe('GSAP motion policy', () => {
  it('preserves every authored duration during normal motion', () => {
    expect(gsapTimeScaleForPreference(false)).toBe(1);
  });

  it('shortens finite timelines without making them instantaneous', () => {
    expect(gsapTimeScaleForPreference(true)).toBe(
      REDUCED_MOTION_GSAP_TIME_SCALE,
    );
    expect(REDUCED_MOTION_GSAP_TIME_SCALE).toBeGreaterThan(1);
    expect(REDUCED_MOTION_GSAP_TIME_SCALE).toBeLessThan(10);
  });
});
