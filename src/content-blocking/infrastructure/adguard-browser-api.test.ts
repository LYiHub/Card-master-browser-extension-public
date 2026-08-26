import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ADGUARD_BROWSER_API_GLOBAL,
  type AdguardBrowserApi,
  installAdguardBrowserApi,
} from './adguard-browser-api';

afterEach(() => {
  Reflect.deleteProperty(globalThis, ADGUARD_BROWSER_API_GLOBAL);
});

describe('AdGuard browser API adapter', () => {
  it('installs one immutable adapter without changing browser API objects', () => {
    const api = {
      executeScript: vi.fn(),
      getDisabledRuleIds: vi.fn(),
      getAllFrames: vi.fn(),
      handlerBehaviorChanged: vi.fn(),
      insertCSS: vi.fn(),
      updateDynamicRules: vi.fn(),
      updateSessionRules: vi.fn(),
      updateStaticRules: vi.fn(),
    } as unknown as AdguardBrowserApi;

    installAdguardBrowserApi(api);

    expect(
      (
        globalThis as typeof globalThis & {
          [ADGUARD_BROWSER_API_GLOBAL]?: AdguardBrowserApi;
        }
      )[ADGUARD_BROWSER_API_GLOBAL],
    ).toEqual({
      executeScript: expect.any(Function),
      getDisabledRuleIds: expect.any(Function),
      getAllFrames: expect.any(Function),
      handlerBehaviorChanged: expect.any(Function),
      insertCSS: expect.any(Function),
      updateDynamicRules: expect.any(Function),
      updateSessionRules: expect.any(Function),
      updateStaticRules: expect.any(Function),
    });
    expect(
      Object.isFrozen(
        (
          globalThis as typeof globalThis & {
            [ADGUARD_BROWSER_API_GLOBAL]?: AdguardBrowserApi;
          }
        )[ADGUARD_BROWSER_API_GLOBAL],
      ),
    ).toBe(true);
    expect(Object.isFrozen(api)).toBe(false);
  });
});
