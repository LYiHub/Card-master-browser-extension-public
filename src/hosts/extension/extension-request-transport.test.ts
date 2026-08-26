import { describe, expect, it, vi } from 'vitest';

import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

function extensionApi(runtime: Partial<ExtensionApi['runtime']>): ExtensionApi {
  return {
    runtime: {
      connect: vi.fn(),
      getURL: vi.fn(() => 'chrome-extension://test/'),
      id: 'test-extension',
      lastError: undefined,
      onMessage: {
        addListener: vi.fn(),
        hasListener: vi.fn(),
        hasListeners: vi.fn(),
        removeListener: vi.fn(),
      },
      sendMessage: vi.fn(),
      ...runtime,
    } as ExtensionApi['runtime'],
    storage: {
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      local: {
        get: vi.fn(),
        remove: vi.fn(),
        set: vi.fn(),
        setAccessLevel: vi.fn(),
      },
      sync: {
        get: vi.fn(),
        remove: vi.fn(),
        set: vi.fn(),
        setAccessLevel: vi.fn(),
      },
    },
  };
}

describe('extension request transport', () => {
  it('reads runtime.lastError inside the callback and retries with its message', async () => {
    let lastError: { message: string } | undefined;
    let attempts = 0;
    const sendMessage = vi.fn(
      (_request: unknown, callback: (response: unknown) => void): undefined => {
        attempts += 1;
        if (attempts === 1) {
          lastError = {
            message:
              'Could not establish connection. Receiving end does not exist.',
          };
          callback(undefined);
          lastError = undefined;
          return undefined;
        }
        callback({ status: 'available' });
        return undefined;
      },
    );
    const api = extensionApi({
      sendMessage:
        sendMessage as unknown as ExtensionApi['runtime']['sendMessage'],
    });
    Object.defineProperty(api.runtime, 'lastError', {
      configurable: true,
      get: () => lastError,
    });

    await expect(
      sendExtensionRequest<{ status: 'available' }>(api, {
        channel: EXTENSION_CHANNEL,
        type: 'userscript-capability-read',
      }),
    ).resolves.toEqual({ status: 'available' });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('treats an opaque Chromium rejection as retryable transport noise', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce({})
      .mockResolvedValueOnce({ status: 'available' });
    const api = extensionApi({
      sendMessage: sendMessage as ExtensionApi['runtime']['sendMessage'],
    });

    await expect(
      sendExtensionRequest<{ status: 'available' }>(api, {
        channel: EXTENSION_CHANNEL,
        type: 'userscript-capability-read',
      }),
    ).resolves.toEqual({ status: 'available' });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
