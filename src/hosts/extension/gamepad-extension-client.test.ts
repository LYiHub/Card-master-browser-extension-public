import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  gamepadExtensionApiOrNull,
  sendGamepadExtensionMessage,
} from './gamepad-extension-client';

afterEach(() => vi.unstubAllGlobals());

describe('gamepad extension client', () => {
  it('prefers the Promise-based browser namespace', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('browser', {
      runtime: {
        connect: vi.fn(),
        getURL: vi.fn(),
        id: 'browser-extension',
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        sendMessage,
      },
    });

    const api = gamepadExtensionApiOrNull();

    await expect(
      sendGamepadExtensionMessage(api as never, { type: 'test' }),
    ).resolves.toEqual({ ok: true });
  });

  it('reads callback responses and runtime errors from Chromium', async () => {
    const runtime = {
      connect: vi.fn(),
      getURL: vi.fn(),
      id: 'chromium-extension',
      lastError: undefined as chrome.runtime.LastError | undefined,
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      sendMessage: vi.fn(
        (_message: unknown, callback: (response: unknown) => void) =>
          callback({ ok: true }),
      ),
    };
    vi.stubGlobal('chrome', { runtime });

    const api = gamepadExtensionApiOrNull();

    await expect(
      sendGamepadExtensionMessage(api as never, { type: 'test' }),
    ).resolves.toEqual({ ok: true });
  });
});
