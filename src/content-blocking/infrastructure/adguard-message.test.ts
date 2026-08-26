import { describe, expect, it } from 'vitest';

import { normalizeAdguardMessage } from './adguard-message';

describe('AdGuard message normalization', () => {
  it('removes transport metadata rejected by the strict upstream parser', () => {
    expect(
      normalizeAdguardMessage(
        {
          handlerName: 'tsWebExtension',
          type: 'getCosmeticData',
          payload: { documentUrl: 'https://example.com/' },
          tabId: 42,
        },
        'tsWebExtension',
      ),
    ).toEqual({
      handlerName: 'tsWebExtension',
      type: 'getCosmeticData',
      payload: { documentUrl: 'https://example.com/' },
    });
  });
});
