import { describe, expect, it } from 'vitest';

import { transitionDurationMs } from './presence';

describe('transition presence timing', () => {
  it('parses millisecond durations', () => {
    expect(transitionDurationMs('150ms', '0s')).toBe(150);
  });

  it('converts second durations and delays to milliseconds', () => {
    expect(transitionDurationMs('0.2s', '0.05s')).toBe(250);
  });

  it('repeats shorter CSS timing lists when finding the longest transition', () => {
    expect(transitionDurationMs('100ms, 250ms', '50ms, 10ms, 400ms')).toBe(500);
  });
});
