import { describe, expect, it } from 'vitest';

import { deckEscapeDisposition } from './useDeckInputController';

describe('deck Escape routing', () => {
  it('orders element targeting, dialogs, and the card spread', () => {
    expect(deckEscapeDisposition('returning', false)).toBe('busy');
    expect(deckEscapeDisposition('element-targeting', true)).toBe(
      'cancel-targeting',
    );
    expect(deckEscapeDisposition('resolving', true)).toBe('cancel-targeting');
    expect(deckEscapeDisposition('detail', false)).toBe('close-detail');
    expect(deckEscapeDisposition('dealing', false)).toBe('collect');
    expect(deckEscapeDisposition('spread', false)).toBe('collect');
    expect(deckEscapeDisposition('closed', false)).toBeNull();
  });
});
