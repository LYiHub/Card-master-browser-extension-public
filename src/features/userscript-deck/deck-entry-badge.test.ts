import { describe, expect, it } from 'vitest';

import { deckEntryBadgeCompact, deckEntryBadgeText } from './deck-entry-badge';

describe('deck entry badge', () => {
  it('caps counts at 99 and compacts every two-digit value', () => {
    expect(deckEntryBadgeText(-1)).toBe('0');
    expect(deckEntryBadgeText(9)).toBe('9');
    expect(deckEntryBadgeText(10)).toBe('10');
    expect(deckEntryBadgeText(99)).toBe('99');
    expect(deckEntryBadgeText(120)).toBe('99');
    expect(deckEntryBadgeCompact(9)).toBe(false);
    expect(deckEntryBadgeCompact(10)).toBe(true);
    expect(deckEntryBadgeCompact(120)).toBe(true);
  });
});
