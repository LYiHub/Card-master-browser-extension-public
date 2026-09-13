import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extensionOverridesNewTab,
  requireExtensionRuntimeApi,
} from './extension-runtime-api';

afterEach(() => vi.unstubAllGlobals());

describe('offscreen extension runtime access', () => {
  it.each([
    'chrome',
    'browser',
  ])('reads new tab ownership from the installed %s manifest', (namespace) => {
    vi.stubGlobal('chrome', undefined);
    vi.stubGlobal('browser', undefined);
    const manifest: chrome.runtime.Manifest = {
      manifest_version: 3,
      name: 'Card Master',
      version: '1.0.0',
      chrome_url_overrides: { newtab: 'new-tab.html' },
    };
    vi.stubGlobal(namespace, { runtime: { getManifest: () => manifest } });
    expect(extensionOverridesNewTab()).toBe(true);
    delete manifest.chrome_url_overrides;
    expect(extensionOverridesNewTab()).toBe(false);
  });
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
