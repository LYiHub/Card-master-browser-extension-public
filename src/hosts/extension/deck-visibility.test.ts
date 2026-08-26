import { describe, expect, it, vi } from 'vitest';

import {
  DECK_CREATION_PREVIEW_MESSAGE_TYPE,
  DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
} from '../../features/userscript-deck/deck-entry';
import {
  EXTENSION_PAGE_DECK_DELIVERY_MESSAGE_TYPE,
  requestDeckCreationPreview,
  requestDeckVisibility,
} from './deck-visibility';

describe('deck creation preview requests', () => {
  it('keeps manual previews lightweight and identifies real created scripts', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const api = { tabs: { sendMessage } };

    await requestDeckCreationPreview(api, 7, 'manual-preview');
    await requestDeckCreationPreview(
      api,
      7,
      'created-preview',
      'created-script',
    );

    expect(sendMessage.mock.calls).toEqual([
      [
        7,
        {
          type: DECK_CREATION_PREVIEW_MESSAGE_TYPE,
          requestId: 'manual-preview',
        },
      ],
      [
        7,
        {
          type: DECK_CREATION_PREVIEW_MESSAGE_TYPE,
          requestId: 'created-preview',
          scriptId: 'created-script',
        },
      ],
    ]);
  });

  it('delivers toolbar requests directly to an extension-owned new tab', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Receiving end does not exist.'));
    const runtimeSendMessage = vi.fn(async () => ({ handled: true }));
    const executeScript = vi.fn();

    await requestDeckVisibility(
      {
        runtime: { sendMessage: runtimeSendMessage },
        scripting: { executeScript },
        tabs: { sendMessage },
      },
      18,
      'toggle',
    );

    expect(runtimeSendMessage).toHaveBeenCalledWith({
      type: EXTENSION_PAGE_DECK_DELIVERY_MESSAGE_TYPE,
      tabId: 18,
      message: {
        type: DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
        visibility: 'toggle',
      },
    });
    expect(executeScript).not.toHaveBeenCalled();
  });
});
