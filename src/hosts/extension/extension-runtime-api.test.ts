import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireExtensionRuntimeApi } from './extension-runtime-api';

afterEach(() => vi.unstubAllGlobals());

describe('offscreen extension runtime access', () => {
  it('requires only chrome.runtime and does not require storage', () => {
    const runtime = {
      id: 'extension-id',
      connect: vi.fn(),
    };
    vi.stubGlobal('chrome', { runtime });

    expect(requireExtensionRuntimeApi()).toBe(runtime);
  });

  it('rejects contexts without runtime.connect', () => {
    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' } });

    expect(() => requireExtensionRuntimeApi()).toThrow(
      'The browser extension runtime API is unavailable.',
    );
  });
});
