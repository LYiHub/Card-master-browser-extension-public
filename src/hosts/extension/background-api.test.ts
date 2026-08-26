import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireExtensionBackgroundApi } from './api';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('requireExtensionBackgroundApi', () => {
  it('keeps the background quiet when optional capabilities are absent', () => {
    const event = { addListener: vi.fn(), removeListener: vi.fn() };
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        getURL: vi.fn(),
        connect: vi.fn(),
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onConnect: event,
        onInstalled: event,
        onStartup: event,
      },
      storage: {
        onChanged: event,
        local: {
          get: vi.fn(),
          remove: vi.fn(),
          set: vi.fn(),
        },
        session: {
          get: vi.fn(),
          remove: vi.fn(),
          set: vi.fn(),
        },
      },
      alarms: { clear: vi.fn(), create: vi.fn(), onAlarm: event },
      declarativeNetRequest: {
        getDynamicRules: vi.fn(),
        getEnabledRulesets: vi.fn(),
        getSessionRules: vi.fn(),
        updateDynamicRules: vi.fn(),
        updateEnabledRulesets: vi.fn(),
        updateSessionRules: vi.fn(),
      },
      scripting: {
        executeScript: vi.fn(),
        insertCSS: vi.fn(),
        removeCSS: vi.fn(),
      },
      permissions: {
        contains: vi.fn(),
      },
      sidePanel: {
        open: vi.fn(),
        setOptions: vi.fn(),
      },
      tabs: {
        create: vi.fn(),
        get: vi.fn(),
        onCreated: event,
        onRemoved: event,
        onUpdated: event,
        query: vi.fn(),
        reload: vi.fn(),
        remove: vi.fn(),
        sendMessage: vi.fn(),
        update: vi.fn(),
      },
      webNavigation: { onBeforeNavigate: event },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(requireExtensionBackgroundApi()).toBe(
      (globalThis as typeof globalThis & { chrome: unknown }).chrome,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('fails early with the exact missing core API contract', () => {
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        getURL: vi.fn(),
        connect: vi.fn(),
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      storage: {
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        local: {
          get: vi.fn(),
          set: vi.fn(),
        },
      },
    });

    expect(() => requireExtensionBackgroundApi()).toThrow(
      /storage\.session\.get/,
    );
  });
});
