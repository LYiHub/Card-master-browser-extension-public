import { describe, expect, it } from 'vitest';

import { shouldReturnDirectly } from './card-return';

describe('card return paths', () => {
  it('only skips extraction for the unobstructed rightmost card', () => {
    expect(shouldReturnDirectly(4, 5)).toBe(true);
    expect(shouldReturnDirectly(3, 5)).toBe(false);
    expect(shouldReturnDirectly(0, 1)).toBe(true);
    expect(shouldReturnDirectly(0, 0)).toBe(false);
  });
});
