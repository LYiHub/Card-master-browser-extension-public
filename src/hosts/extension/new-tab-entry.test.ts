import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { transformSync } from 'esbuild';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultNewTabPreferences,
  NEW_TAB_PREFERENCES_STORAGE_KEY,
  NEW_TAB_SYNC_STORAGE_KEY,
  NewTabPreferencesRepository,
} from '../../new-tab/application/preferences';
import type { ExtensionStorageArea } from './api';
import { extensionOverridesNewTab } from './extension-runtime-api';

// Execute the actual routing function without starting the page's DOM runtimes.
const source = transformSync(
  readFileSync(new URL('./new-tab-entry.ts', import.meta.url), 'utf8'),
  { loader: 'ts', target: 'es2022' },
).code;
const routing = parse(source, {
  ecmaVersion: 'latest',
  sourceType: 'module',
}).body.find(
  (node) =>
    node.type === 'FunctionDeclaration' &&
    node.id?.name === 'openConfiguredNewTab',
);
if (!routing) throw new Error('Missing new tab routing function');
const openConfiguredNewTab = new Function(
  'dependencies',
  `const { document, HTMLIFrameElement, preferencesRepository, location, api,
    installEmbeddedNewTabBranding, cardMasterLogoUrl, installPhotoFrameIdleMode,
    reportExtensionFailure, extensionOverridesNewTab } = dependencies;
    return (${source.slice(routing.start, routing.end)})(api);`,
);

afterEach(() => vi.unstubAllGlobals());

function memoryStorage(initial: Record<string, unknown>): ExtensionStorageArea {
  const values = structuredClone(initial);
  return {
    get: async () => structuredClone(values),
    set: async (items) => {
      Object.assign(values, structuredClone(items));
    },
    remove: async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete values[String(key)];
      }
    },
    setAccessLevel: async () => undefined,
  };
}

function harness(destinationUrl = '') {
  const preferences = { ...defaultNewTabPreferences(), destinationUrl };
  const local = memoryStorage({
    [NEW_TAB_PREFERENCES_STORAGE_KEY]: preferences,
  });
  const sync = memoryStorage({ [NEW_TAB_SYNC_STORAGE_KEY]: preferences });
  const manifest: chrome.runtime.Manifest = {
    manifest_version: 3,
    name: 'Card Master',
    version: '1.0.0',
    chrome_url_overrides: { newtab: 'new-tab.html' },
  };
  const runtime = {
    getManifest: () => manifest,
    getURL: (path: string) => `chrome-extension://test/${path}`,
  };
  vi.stubGlobal('browser', undefined);
  vi.stubGlobal('chrome', { runtime });
  class Frame {
    src = '';
  }
  const frame = new Frame();
  const location = {
    href: 'chrome-extension://test/new-tab.html?focus=1',
    replace: vi.fn(),
  };
  const reportExtensionFailure = vi.fn();
  return {
    frame,
    location,
    manifest,
    local,
    sync,
    reportExtensionFailure,
    open: () =>
      openConfiguredNewTab({
        api: { runtime },
        preferencesRepository: new NewTabPreferencesRepository(local, sync),
        document: { getElementById: () => frame },
        HTMLIFrameElement: Frame,
        location,
        extensionOverridesNewTab,
        installEmbeddedNewTabBranding: vi.fn(),
        cardMasterLogoUrl: () => 'logo',
        installPhotoFrameIdleMode: vi.fn(),
        reportExtensionFailure,
      }),
  };
}

describe('new tab package routing', () => {
  it('preserves standard-package custom destinations', async () => {
    const test = harness('https://example.com/');
    await test.open();
    expect(test.location.replace).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/',
    );
    expect(test.frame.src).toBe('');
  });

  it('does not redirect or erase a saved destination when switching packages', async () => {
    const test = harness('https://example.com/');
    delete test.manifest.chrome_url_overrides;
    await test.open();
    expect(test.location.replace).not.toHaveBeenCalled();
    expect(test.frame.src).toBe(
      'chrome-extension://test/src/newtab/newtab.html?focus=1',
    );
    expect(
      (await test.local.get(NEW_TAB_PREFERENCES_STORAGE_KEY))[
        NEW_TAB_PREFERENCES_STORAGE_KEY
      ],
    ).toMatchObject({ destinationUrl: 'https://example.com/' });
    expect(
      (await test.sync.get(NEW_TAB_SYNC_STORAGE_KEY))[NEW_TAB_SYNC_STORAGE_KEY],
    ).toMatchObject({ destinationUrl: 'https://example.com/' });
    test.manifest.chrome_url_overrides = { newtab: 'new-tab.html' };
    await test.open();
    expect(test.location.replace).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/',
    );
    expect(test.reportExtensionFailure).not.toHaveBeenCalled();
  });

  it('keeps the existing standard-package dashboard when the URL is empty', async () => {
    const test = harness();
    await test.open();
    expect(test.location.replace).not.toHaveBeenCalled();
    expect(test.frame.src).toBe(
      'chrome-extension://test/src/newtab/newtab.html?focus=1',
    );
  });
});
