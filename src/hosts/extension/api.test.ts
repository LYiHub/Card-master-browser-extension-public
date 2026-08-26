import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  connectExtensionPort,
  ExtensionMessageSubscription,
  extensionApiOrNull,
  extensionUserscriptApi,
  requireExtensionApi,
  requireExtensionBackgroundApi,
  sendExtensionRequest,
} from './api';

function event() {
  return { addListener: vi.fn(), removeListener: vi.fn() };
}

function backgroundApi(userscripts: boolean) {
  const api = {
    runtime: {
      connect: vi.fn(),
      getURL: vi.fn(),
      id: 'extension-id',
      onConnect: event(),
      onInstalled: event(),
      onMessage: event(),
      onStartup: event(),
      sendMessage: vi.fn(),
      ...(userscripts ? { onUserScriptConnect: event() } : {}),
    },
    storage: {
      onChanged: event(),
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
      session: {
        get: vi.fn(),
        remove: vi.fn(),
        set: vi.fn(),
      },
    },
    action: {
      onClicked: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    alarms: {
      clear: vi.fn(),
      create: vi.fn(),
      onAlarm: event(),
    },
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
      onCreated: event(),
      onRemoved: event(),
      onUpdated: event(),
      query: vi.fn(),
      reload: vi.fn(),
      remove: vi.fn(),
      sendMessage: vi.fn(),
      update: vi.fn(),
    },
    windows: {
      create: vi.fn(),
    },
    downloads: {
      cancel: vi.fn(),
      download: vi.fn(),
      search: vi.fn(),
      onChanged: event(),
    },
    notifications: {
      clear: vi.fn(),
      create: vi.fn(),
      onClicked: event(),
      onClosed: event(),
    },
    cookies: {
      getAll: vi.fn(),
      remove: vi.fn(),
      set: vi.fn(),
    },
    webRequest: {
      onBeforeRequest: event(),
    },
    webNavigation: {
      onBeforeNavigate: event(),
    },
    ...(userscripts ? { userScripts: {} } : {}),
  };
  vi.stubGlobal('chrome', api);
  return api;
}

afterEach(() => vi.unstubAllGlobals());

describe('WebExtension API capabilities', () => {
  it('allows client contexts to start without the userScripts API', () => {
    const api = backgroundApi(false);

    expect(requireExtensionApi()).toBe(api);
  });

  it('prefers the Promise-based browser namespace when it is available', () => {
    const chromeApi = backgroundApi(false);
    const browserApi = { ...chromeApi, runtime: { ...chromeApi.runtime } };
    vi.stubGlobal('browser', browserApi);

    expect(requireExtensionApi()).toBe(browserApi);
  });

  it('keeps the background context available while user scripts are disabled', () => {
    const api = backgroundApi(false);
    const background = requireExtensionBackgroundApi();

    expect(background).toBe(api);
    expect(extensionUserscriptApi(background)).toBeNull();
  });

  it('exposes user-script execution only when both capabilities exist', () => {
    const api = backgroundApi(true);
    const background = requireExtensionBackgroundApi();

    expect(extensionUserscriptApi(background)).toBe(api);
  });

  it('recovers Chrome userScripts when the preferred browser namespace omits them', () => {
    const browserApi = backgroundApi(false);
    const chromeUserScripts = {
      register: vi.fn(),
      unregister: vi.fn(),
    };
    const onUserScriptConnect = event();
    vi.stubGlobal('browser', browserApi);
    vi.stubGlobal('chrome', {
      ...browserApi,
      runtime: {
        ...browserApi.runtime,
        onUserScriptConnect,
      },
      userScripts: chromeUserScripts,
    });

    const resolved = extensionUserscriptApi(requireExtensionBackgroundApi());

    expect(resolved?.userScripts).toBe(chromeUserScripts);
    expect(resolved?.runtime.onUserScriptConnect).toBe(onUserScriptConnect);
  });

  it('rejects partial extension globals before consumers start', () => {
    vi.stubGlobal('chrome', {
      runtime: { id: 'extension-id' },
      storage: { local: {} },
    });

    expect(() => requireExtensionApi()).toThrow(
      'browser extension API is unavailable',
    );
  });

  it('allows page hosts to probe stale extension contexts without throwing', () => {
    vi.stubGlobal('chrome', {
      get runtime() {
        throw new Error('Extension context invalidated.');
      },
    });

    expect(extensionApiOrNull()).toBeNull();
  });

  it('removes message listeners from the captured event after context teardown', () => {
    const api = backgroundApi(false);
    const runtimeMessage = api.runtime.onMessage;
    const listener = vi.fn();
    const subscription = new ExtensionMessageSubscription(
      api as never,
      listener,
    );

    subscription.start();
    Reflect.deleteProperty(api, 'runtime');

    expect(() => subscription.stop()).not.toThrow();
    expect(runtimeMessage.addListener).toHaveBeenCalledWith(listener);
    expect(runtimeMessage.removeListener).toHaveBeenCalledWith(listener);
  });

  it('rejects malformed runtime ports before consumers read onMessage', () => {
    const api = backgroundApi(false);
    api.runtime.connect.mockReturnValue({ name: 'broken' });

    expect(() => connectExtensionPort(api as never, 'assistant')).toThrow(
      'invalid runtime port',
    );
  });

  it('rejects malformed message events before subscriptions start', () => {
    const api = backgroundApi(false);
    api.runtime.onMessage = { addListener: vi.fn() } as never;

    expect(
      () => new ExtensionMessageSubscription(api as never, vi.fn()),
    ).toThrow('invalid message event');
  });

  it('silently treats BFCache message closure as a transient request failure', async () => {
    const api = backgroundApi(false);
    api.runtime.sendMessage.mockRejectedValue(
      new Error(
        'The page keeping the extension port is moved into back/forward cache, so the message channel is closed.',
      ),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      sendExtensionRequest(api as never, {
        channel: 'card-master',
        type: 'userscript-capability-read',
      }),
    ).rejects.toThrow('back/forward cache');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('silently tears down a stale content context after extension reload', async () => {
    const api = backgroundApi(false);
    api.runtime.getURL.mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      sendExtensionRequest(api as never, {
        channel: 'card-master',
        type: 'userscript-capability-read',
      }),
    ).rejects.toThrow('Extension context invalidated');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });
});
