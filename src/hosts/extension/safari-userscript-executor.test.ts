import { describe, expect, it, vi } from 'vitest';

import { executeSafariUserscriptRegistration } from './safari-userscript-executor';

describe('Safari userscript executor', () => {
  it('maps USER_SCRIPT registrations into Safari isolated executions', async () => {
    const executeScript = vi.fn(async () => []);

    await executeSafariUserscriptRegistration(
      { executeScript },
      { tabId: 7, documentIds: ['document-1'] },
      {
        id: 'card-script',
        js: [{ code: 'globalThis.__cardScript = true;' }],
        matches: ['<all_urls>'],
        world: 'USER_SCRIPT',
        worldId: 'card-world',
      },
    );

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 7, documentIds: ['document-1'] },
      world: 'ISOLATED',
      func: expect.any(Function),
      args: ['globalThis.__cardScript = true;', 'card-script'],
    });
  });

  it('preserves MAIN-world registrations for page interop', async () => {
    const executeScript = vi.fn(async () => []);

    await executeSafariUserscriptRegistration(
      { executeScript },
      { tabId: 9, frameIds: [0] },
      {
        id: 'card-page-script',
        js: [{ code: 'window.__pageScript = true;' }],
        matches: ['<all_urls>'],
        world: 'MAIN',
      },
    );

    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 9, frameIds: [0] },
        world: 'MAIN',
      }),
    );
  });
});
