import { describe, expect, it } from 'vitest';

import { nextCircularIndex } from './manager-input-navigation';

describe('manager input navigation', () => {
  it('wraps card and action focus in both directions', () => {
    expect(nextCircularIndex(null, 4, 1)).toBe(0);
    expect(nextCircularIndex(null, 4, -1)).toBe(3);
    expect(nextCircularIndex(3, 4, 1)).toBe(0);
    expect(nextCircularIndex(0, 4, -1)).toBe(3);
  });
});
