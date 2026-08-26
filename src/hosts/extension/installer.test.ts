import { describe, expect, it, vi } from 'vitest';

import type { ExtensionApi, ExtensionBackgroundApi } from './api';
import {
  ExtensionUserscriptInstallerClient,
  INSTALL_REDIRECT_RULE_ID,
  LEGACY_INSTALL_REDIRECT_RULE_ID,
  normalizeUserscriptSourceUrl,
  readUserscriptInstallerSource,
  UserscriptInstallerError,
  UserscriptInstallInterceptor,
  userscriptInstallerPageUrl,
} from './installer';

function backgroundApi() {
  let navigation:
    | ((details: chrome.webNavigation.WebNavigationBaseCallbackDetails) => void)
    | undefined;
  const updateDynamicRules = vi.fn(async () => undefined);
  const update = vi.fn(async () => undefined);
  const api = {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    declarativeNetRequest: { updateDynamicRules },
    tabs: { update },
    webNavigation: {
      onBeforeNavigate: {
        addListener: (
          listener: (
            details: chrome.webNavigation.WebNavigationBaseCallbackDetails,
          ) => void,
        ) => {
          navigation = listener;
        },
      },
    },
  } as unknown as ExtensionBackgroundApi;
  return {
    api,
    emitNavigation: (url: string) =>
      navigation?.({
        documentLifecycle: 'active',
        tabId: 7,
        frameId: 0,
        frameType: 'outermost_frame',
        parentFrameId: -1,
        processId: 1,
        timeStamp: 1,
        url,
      }),
    update,
    updateDynamicRules,
  };
}

describe('Userscript install interception', () => {
  it('recognizes standard remote .user.js URLs and preserves query strings', () => {
    const source =
      'https://update.greasyfork.org/scripts/1/example.user.js?version=2&locale=en';

    expect(normalizeUserscriptSourceUrl(source)).toBe(source);
    expect(
      userscriptInstallerPageUrl(
        { getURL: (path) => `chrome-extension://test/${path}` },
        source,
      ),
    ).toBe(`chrome-extension://test/install.html?source=${source}`);
    expect(readUserscriptInstallerSource(`?source=${source}`)).toBe(source);
  });

  it('rejects non-userscript navigation targets', () => {
    expect(() =>
      normalizeUserscriptSourceUrl('https://example.com/script.js'),
    ).toThrow('.user.js');
  });

  it('preserves rejected source and diagnostics for installer review', async () => {
    const source = '// ==UserScript==\n// @grant GM_download';
    const sourceUrl = 'https://cdn.example.com/download/42';
    const client = new ExtensionUserscriptInstallerClient({
      runtime: {
        sendMessage: vi.fn(async () => ({
          error: 'The Userscript metadata block is incomplete.',
          diagnostics: [
            {
              severity: 'error',
              code: 'missing-metadata-block',
              message: 'The Userscript metadata block is incomplete.',
            },
          ],
          source,
          sourceUrl,
        })),
      },
    } as unknown as ExtensionApi);

    const error = await client
      .preview('https://example.com/tool.user.js')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UserscriptInstallerError);
    expect(error).toMatchObject({
      source,
      sourceUrl,
      diagnostics: [
        expect.objectContaining({
          code: 'missing-metadata-block',
        }),
      ],
    });
  });

  it('reads the browser user-script execution capability before installation', async () => {
    const sendMessage = vi.fn(async () => ({
      status: 'permission-required',
      message: 'Firefox 需要授权。',
    }));
    const client = new ExtensionUserscriptInstallerClient({
      runtime: { sendMessage },
    } as unknown as ExtensionApi);

    await expect(client.capability()).resolves.toEqual({
      status: 'permission-required',
      message: 'Firefox 需要授权。',
    });
    expect(sendMessage).toHaveBeenCalledWith({
      channel: 'card-master',
      type: 'userscript-capability-read',
    });
  });

  it('installs a DNR redirect and keeps webNavigation as a direct-navigation fallback', async () => {
    const { api, emitNavigation, update, updateDynamicRules } = backgroundApi();
    const interceptor = new UserscriptInstallInterceptor(api);

    await interceptor.start();
    emitNavigation('https://example.com/tool.user.js');

    expect(updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [
        INSTALL_REDIRECT_RULE_ID,
        LEGACY_INSTALL_REDIRECT_RULE_ID,
      ],
      addRules: [
        expect.objectContaining({
          id: INSTALL_REDIRECT_RULE_ID,
          action: {
            type: 'redirect',
            redirect: {
              regexSubstitution:
                'chrome-extension://test/install.html?source=\\1',
            },
          },
        }),
      ],
    });
    expect(update).toHaveBeenCalledWith(7, {
      url: 'chrome-extension://test/install.html?source=https://example.com/tool.user.js',
    });
  });

  it('uses webNavigation without an unsupported response-header rule on Firefox', async () => {
    vi.stubGlobal('__EXTENSION_TARGET__', 'firefox');
    try {
      const { api, emitNavigation, update, updateDynamicRules } =
        backgroundApi();
      const interceptor = new UserscriptInstallInterceptor(api);

      await interceptor.start();
      emitNavigation('https://example.com/tool.user.js');

      expect(updateDynamicRules).toHaveBeenCalledWith({
        removeRuleIds: [
          INSTALL_REDIRECT_RULE_ID,
          LEGACY_INSTALL_REDIRECT_RULE_ID,
        ],
      });
      expect(update).toHaveBeenCalledWith(7, {
        url: 'chrome-extension://test/install.html?source=https://example.com/tool.user.js',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses only webNavigation on Safari without submitting Chromium DNR rules', async () => {
    vi.stubGlobal('__EXTENSION_TARGET__', 'safari');
    try {
      const { api, emitNavigation, update, updateDynamicRules } =
        backgroundApi();
      const interceptor = new UserscriptInstallInterceptor(api);

      await interceptor.start();
      emitNavigation('https://example.com/tool.user.js');

      expect(updateDynamicRules).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(7, {
        url: 'chrome-extension://test/install.html?source=https://example.com/tool.user.js',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
