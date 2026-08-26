import { describe, expect, it } from 'vitest';

import { sequencedActionHexColor } from './action-colors';

describe('sequenced action hex colors', () => {
  it('keeps base palette colors and resolves later tones to concrete hex', () => {
    expect(sequencedActionHexColor(0)).toBe('#f0c66e');
    expect(sequencedActionHexColor(5)).toBe('#ff8068');
    expect(sequencedActionHexColor(6)).toMatch(/^#[\da-f]{6}$/);
    expect(sequencedActionHexColor(24)).toMatch(/^#[\da-f]{6}$/);
  });
});
