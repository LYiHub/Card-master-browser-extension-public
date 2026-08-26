import { describe, expect, it, vi } from 'vitest';

import {
  DECK_ACTIVE_CARD_COUNT_UPDATE_MESSAGE_TYPE,
  DECK_BOOTSTRAP_READ_MESSAGE_TYPE,
  DECK_CREATION_PREVIEW_MESSAGE_TYPE,
  DECK_ENTRY_SETTINGS_CHANGED_MESSAGE_TYPE,
  DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
  DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
  DECK_ENTRY_SETTINGS_STORAGE_KEY,
  DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE,
  DECK_SHORTCUT_OPEN_SETTINGS_MESSAGE_TYPE,
  DECK_SHORTCUT_READ_MESSAGE_TYPE,
  DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
  DEFAULT_DECK_ENTRY_SETTINGS,
  type DeckCreationPreviewRequest,
  type DeckVisibilityRequest,
} from '../../features/userscript-deck/deck-entry';
import { DECK_STEWARD_CARD_ID } from '../../system-cards/domain/catalog';
import type { ExtensionApi, ExtensionMessageListener } from './api';
import { ExtensionDeckEntryController } from './deck-entry';
import {
  installExtensionDeckEntrySettingsHandler,
  mutateExtensionDeckEntrySettings,
} from './deck-entry-background';

function contentApi(respond: (message: unknown) => unknown): ExtensionApi {
  const get = vi.fn(() => {
    throw new Error('Content scripts must not read protected storage.');
  });
  return {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      getURL: vi.fn(),
      connect: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      sendMessage: vi.fn((message, callback) => {
        callback(respond(message));
      }),
    },
    storage: {
      local: {
        get,
        set: vi.fn(),
        remove: vi.fn(),
        setAccessLevel: vi.fn(),
      },
    },
  } as unknown as ExtensionApi;
}

describe('ExtensionDeckEntryController', () => {
  it('reads settings through the background context transport', async () => {
    const api = contentApi((message) => {
      expect(message).toMatchObject({
        type: DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
      });
      return {
        ok: true,
        settings: {
          showDeckTrigger: false,
          showToolbarBadge: true,
          showDeckTriggerBadge: true,
          position: { x: 0.25, y: 0.75 },
          hiddenCardIds: [],
        },
      };
    });

    await expect(
      new ExtensionDeckEntryController(api).readSettings(),
    ).resolves.toEqual({
      showDeckTrigger: false,
      showToolbarBadge: true,
      showDeckTriggerBadge: true,
      position: { x: 0.25, y: 0.75 },
      hiddenCardIds: [],
    });
    expect(api.storage.local.get).not.toHaveBeenCalled();
  });

  it('updates settings through the background context transport', async () => {
    const api = contentApi((message) => {
      expect(message).toMatchObject({
        type: DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE,
        mutation: {
          kind: 'set-trigger-visible',
          visible: false,
        },
      });
      return {
        ok: true,
        settings: {
          showDeckTrigger: false,
          showToolbarBadge: true,
          showDeckTriggerBadge: true,
          position: null,
          hiddenCardIds: ['script-a'],
        },
      };
    });

    await expect(
      new ExtensionDeckEntryController(api).updateSettings({
        kind: 'set-trigger-visible',
        visible: false,
      }),
    ).resolves.toEqual({
      showDeckTrigger: false,
      showToolbarBadge: true,
      showDeckTriggerBadge: true,
      position: null,
      hiddenCardIds: ['script-a'],
    });
    expect(api.storage.local.set).not.toHaveBeenCalled();
  });

  it('reads the real browser shortcut and opens its configuration page', async () => {
    const messages: unknown[] = [];
    const api = contentApi((message) => {
      messages.push(message);
      if (
        (message as { type?: string }).type === DECK_SHORTCUT_READ_MESSAGE_TYPE
      ) {
        return {
          ok: true,
          state: {
            shortcut: 'Command+E',
            defaultShortcut: 'Command+E',
          },
        };
      }
      return { ok: true };
    });
    const controller = new ExtensionDeckEntryController(api);

    await expect(controller.readShortcut()).resolves.toEqual({
      shortcut: 'Command+E',
      defaultShortcut: 'Command+E',
    });
    await expect(controller.openShortcutSettings()).resolves.toBeUndefined();
    expect(messages).toEqual([
      expect.objectContaining({ type: DECK_SHORTCUT_READ_MESSAGE_TYPE }),
      expect.objectContaining({
        type: DECK_SHORTCUT_OPEN_SETTINGS_MESSAGE_TYPE,
      }),
    ]);
  });

  it('reports the current active card count without changing the icon', async () => {
    const messages: unknown[] = [];
    const api = contentApi((message) => {
      messages.push(message);
      return { ok: true };
    });

    await expect(
      new ExtensionDeckEntryController(api).updateActiveCardCount(7),
    ).resolves.toBeUndefined();
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: DECK_ACTIVE_CARD_COUNT_UPDATE_MESSAGE_TYPE,
        activeCount: 7,
      }),
    );
  });

  it('combines local visibility requests with toolbar requests', () => {
    const callbacks: {
      local?: (request: DeckVisibilityRequest) => void;
      runtime?: ExtensionMessageListener;
    } = {};
    const api = contentApi(() => ({ ok: true }));
    vi.mocked(api.runtime.onMessage.addListener).mockImplementation(
      (listener) => {
        callbacks.runtime = listener as unknown as ExtensionMessageListener;
        return undefined;
      },
    );
    const stopLocal = vi.fn();
    const controller = new ExtensionDeckEntryController(api, (listener) => {
      callbacks.local = listener;
      return stopLocal;
    });
    const listener = vi.fn();

    const stop = controller.subscribeVisibilityRequest(listener);
    callbacks.local?.('open');
    callbacks.runtime?.(
      {
        type: DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
        visibility: 'closed',
      },
      {} as chrome.runtime.MessageSender,
      () => undefined,
    );
    expect(listener.mock.calls).toEqual([['open'], ['closed']]);

    stop();
    expect(stopLocal).toHaveBeenCalledOnce();
    expect(api.runtime.onMessage.removeListener).toHaveBeenCalledOnce();
  });

  it('combines local and runtime card creation preview requests', () => {
    const callbacks: {
      local?: (request: DeckCreationPreviewRequest) => void;
      runtime?: ExtensionMessageListener;
    } = {};
    const api = contentApi(() => ({ ok: true }));
    vi.mocked(api.runtime.onMessage.addListener).mockImplementation(
      (listener) => {
        callbacks.runtime = listener as unknown as ExtensionMessageListener;
        return undefined;
      },
    );
    const stopLocal = vi.fn();
    const controller = new ExtensionDeckEntryController(
      api,
      undefined,
      (listener) => {
        callbacks.local = listener;
        return stopLocal;
      },
    );
    const listener = vi.fn();

    const stop = controller.subscribeCreationPreview(listener);
    callbacks.local?.({ requestId: 'local-preview' });
    callbacks.runtime?.(
      {
        type: DECK_CREATION_PREVIEW_MESSAGE_TYPE,
        requestId: 'runtime-preview',
        scriptId: 'created-script',
      },
      {} as chrome.runtime.MessageSender,
      () => undefined,
    );
    expect(listener.mock.calls).toEqual([
      [{ requestId: 'local-preview' }],
      [{ requestId: 'runtime-preview', scriptId: 'created-script' }],
    ]);

    stop();
    expect(stopLocal).toHaveBeenCalledOnce();
    expect(api.runtime.onMessage.removeListener).toHaveBeenCalledOnce();
  });

  it('subscribes to synchronized settings from the background', () => {
    let runtimeListener: ExtensionMessageListener | undefined;
    const api = contentApi(() => ({ ok: true }));
    vi.mocked(api.runtime.onMessage.addListener).mockImplementation(
      (listener) => {
        runtimeListener = listener as unknown as ExtensionMessageListener;
        return undefined;
      },
    );
    const listener = vi.fn();
    const stop = new ExtensionDeckEntryController(api).subscribeSettings(
      listener,
    );

    runtimeListener?.(
      {
        type: DECK_ENTRY_SETTINGS_CHANGED_MESSAGE_TYPE,
        settings: {
          showDeckTrigger: true,
          showToolbarBadge: true,
          showDeckTriggerBadge: true,
          position: { x: 0.4, y: 0.6 },
          hiddenCardIds: ['script-a'],
        },
      },
      {} as chrome.runtime.MessageSender,
      () => undefined,
    );

    expect(listener).toHaveBeenCalledWith({
      showDeckTrigger: true,
      showToolbarBadge: true,
      showDeckTriggerBadge: true,
      position: { x: 0.4, y: 0.6 },
      hiddenCardIds: ['script-a'],
    });
    stop();
    expect(api.runtime.onMessage.removeListener).toHaveBeenCalledOnce();
  });
});

describe('installExtensionDeckEntrySettingsHandler', () => {
  it('serializes concurrent field mutations against the latest stored state', async () => {
    let stored = {
      showDeckTrigger: true,
      showToolbarBadge: true,
      showDeckTriggerBadge: true,
      position: null,
      hiddenCardIds: [] as string[],
    };
    const api = {
      runtime: {
        sendMessage: vi.fn(async () => undefined),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            [DECK_ENTRY_SETTINGS_STORAGE_KEY]: stored,
          })),
          set: vi.fn(async (values: Record<string, unknown>) => {
            stored = values[DECK_ENTRY_SETTINGS_STORAGE_KEY] as typeof stored;
          }),
        },
      },
    } as unknown as Parameters<typeof mutateExtensionDeckEntrySettings>[0];

    await Promise.all([
      mutateExtensionDeckEntrySettings(api, {
        kind: 'set-card-hidden',
        cardId: 'script-a',
        hidden: true,
      }),
      mutateExtensionDeckEntrySettings(api, {
        kind: 'set-card-hidden',
        cardId: 'script-b',
        hidden: true,
      }),
    ]);

    expect(stored.hiddenCardIds).toEqual(['script-a', 'script-b']);
  });

  it('keeps steward hide in the current browser session only', async () => {
    let stored = {
      ...DEFAULT_DECK_ENTRY_SETTINGS,
      hiddenCardIds: [
        ...DEFAULT_DECK_ENTRY_SETTINGS.hiddenCardIds,
        DECK_STEWARD_CARD_ID,
      ],
    };
    const session: Record<string, unknown> = {};
    const broadcasts: Array<{ settings?: { hiddenCardIds: string[] } }> = [];
    const api = {
      runtime: {
        sendMessage: vi.fn(
          async (message: { settings?: { hiddenCardIds: string[] } }) => {
            broadcasts.push(message);
          },
        ),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            [DECK_ENTRY_SETTINGS_STORAGE_KEY]: stored,
          })),
          set: vi.fn(async (values: Record<string, unknown>) => {
            stored = values[DECK_ENTRY_SETTINGS_STORAGE_KEY] as typeof stored;
          }),
        },
        session: {
          get: vi.fn(async (key: string) => ({ [key]: session[key] })),
          set: vi.fn(async (values: Record<string, unknown>) => {
            Object.assign(session, values);
          }),
          remove: vi.fn(async (key: string) => {
            delete session[key];
          }),
        },
      },
    } as unknown as Parameters<typeof mutateExtensionDeckEntrySettings>[0];

    const hidden = await mutateExtensionDeckEntrySettings(api, {
      kind: 'set-card-hidden',
      cardId: DECK_STEWARD_CARD_ID,
      hidden: true,
    });
    expect(hidden.hiddenCardIds).toContain(DECK_STEWARD_CARD_ID);
    expect(stored.hiddenCardIds).not.toContain(DECK_STEWARD_CARD_ID);

    const next = await mutateExtensionDeckEntrySettings(api, {
      kind: 'set-card-hidden',
      cardId: 'script-a',
      hidden: true,
    });
    expect(next.hiddenCardIds).toEqual(
      expect.arrayContaining([DECK_STEWARD_CARD_ID, 'script-a']),
    );
    expect(stored.hiddenCardIds).toContain('script-a');
    expect(stored.hiddenCardIds).not.toContain(DECK_STEWARD_CARD_ID);
    expect(broadcasts.at(-1)?.settings?.hiddenCardIds).toContain(
      DECK_STEWARD_CARD_ID,
    );
  });

  it('keeps the update transaction alive until settings broadcasts settle', async () => {
    let listener: ExtensionMessageListener | undefined;
    const set = vi.fn(async () => undefined);
    let releaseBroadcast = () => {};
    const pendingBroadcast = new Promise<void>((resolve) => {
      releaseBroadcast = resolve;
    });
    const sendMessage = vi.fn(() => pendingBroadcast);
    const sendRuntimeMessage = vi.fn(async () => undefined);
    const api = {
      runtime: {
        sendMessage: sendRuntimeMessage,
        onMessage: {
          addListener: vi.fn((next) => {
            listener = next;
          }),
        },
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            [DECK_ENTRY_SETTINGS_STORAGE_KEY]: {
              showDeckTrigger: true,
              showToolbarBadge: true,
              showDeckTriggerBadge: true,
              position: { x: 0.4, y: 0.6 },
              hiddenCardIds: [],
            },
          })),
          set,
        },
      },
      tabs: {
        query: vi.fn(async () => [
          { id: 3 } as chrome.tabs.Tab,
          { id: 8 } as chrome.tabs.Tab,
        ]),
        sendMessage,
      },
    } as unknown as Parameters<
      typeof installExtensionDeckEntrySettingsHandler
    >[0];
    installExtensionDeckEntrySettingsHandler(api);
    const settings = {
      showDeckTrigger: true,
      showToolbarBadge: true,
      showDeckTriggerBadge: true,
      position: { x: 0.4, y: 0.6 },
      hiddenCardIds: ['script-a'],
    };

    const response = new Promise<unknown>((resolve) => {
      expect(
        listener?.(
          {
            channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
            type: DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE,
            mutation: {
              kind: 'set-card-hidden',
              cardId: 'script-a',
              hidden: true,
            },
          },
          { tab: { id: 3 } as chrome.tabs.Tab } as chrome.runtime.MessageSender,
          resolve,
        ),
      ).toBe(true);
    });
    let responseSettled = false;
    void response.then(() => {
      responseSettled = true;
    });
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledTimes(2);
    });

    expect(set).toHaveBeenCalledWith({
      [DECK_ENTRY_SETTINGS_STORAGE_KEY]: settings,
    });
    expect(responseSettled).toBe(false);
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: DECK_ENTRY_SETTINGS_CHANGED_MESSAGE_TYPE,
      settings,
    });
    expect(sendMessage.mock.calls).toEqual([
      [
        3,
        {
          type: DECK_ENTRY_SETTINGS_CHANGED_MESSAGE_TYPE,
          settings,
        },
        { frameId: 0 },
      ],
      [
        8,
        {
          type: DECK_ENTRY_SETTINGS_CHANGED_MESSAGE_TYPE,
          settings,
        },
        { frameId: 0 },
      ],
    ]);
    releaseBroadcast();
    await expect(response).resolves.toEqual({ ok: true, settings });
  });

  it('reads protected storage inside the background context', async () => {
    let listener: ExtensionMessageListener | undefined;
    const get = vi.fn(async () => ({
      [DECK_ENTRY_SETTINGS_STORAGE_KEY]: {
        showDeckTrigger: false,
        showToolbarBadge: true,
        showDeckTriggerBadge: true,
        position: { x: 0.25, y: 0.75 },
      },
    }));
    const api = {
      runtime: {
        onMessage: {
          addListener: vi.fn((next) => {
            listener = next;
          }),
        },
      },
      storage: {
        local: {
          get,
          set: vi.fn(),
        },
      },
    } as unknown as Parameters<
      typeof installExtensionDeckEntrySettingsHandler
    >[0];
    installExtensionDeckEntrySettingsHandler(api);

    const response = await new Promise<unknown>((resolve) => {
      expect(
        listener?.(
          {
            channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
            type: DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
          },
          {} as chrome.runtime.MessageSender,
          resolve,
        ),
      ).toBe(true);
    });

    expect(response).toEqual({
      ok: true,
      settings: {
        showDeckTrigger: false,
        showToolbarBadge: true,
        showDeckTriggerBadge: true,
        position: { x: 0.25, y: 0.75 },
        hiddenCardIds: DEFAULT_DECK_ENTRY_SETTINGS.hiddenCardIds,
      },
    });
    expect(get).toHaveBeenCalledWith(DECK_ENTRY_SETTINGS_STORAGE_KEY);
  });

  it('uses default settings when browser storage is out of space', async () => {
    let listener: ExtensionMessageListener | undefined;
    const failure = new Error('IO error: .../005016.ldb: FILE_ERROR_NO_SPACE');
    const onStorageReadFailure = vi.fn();
    const api = {
      runtime: {
        onMessage: {
          addListener: vi.fn((next) => {
            listener = next;
          }),
        },
      },
      storage: {
        local: {
          get: vi.fn(async () => {
            throw failure;
          }),
          set: vi.fn(),
        },
      },
    } as unknown as Parameters<
      typeof installExtensionDeckEntrySettingsHandler
    >[0];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installExtensionDeckEntrySettingsHandler(api, { onStorageReadFailure });

    const response = await new Promise<unknown>((resolve) => {
      expect(
        listener?.(
          {
            channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
            type: DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
          },
          {} as chrome.runtime.MessageSender,
          resolve,
        ),
      ).toBe(true);
    });

    expect(response).toEqual({
      ok: true,
      settings: DEFAULT_DECK_ENTRY_SETTINGS,
    });
    expect(onStorageReadFailure).toHaveBeenCalledWith(failure);
    warn.mockRestore();
  });

  it('does not hide unrelated protected-storage read failures', async () => {
    let listener: ExtensionMessageListener | undefined;
    const api = {
      runtime: {
        onMessage: {
          addListener: vi.fn((next) => {
            listener = next;
          }),
        },
      },
      storage: {
        local: {
          get: vi.fn(async () => {
            throw new Error('Storage transport failed');
          }),
          set: vi.fn(),
        },
      },
    } as unknown as Parameters<
      typeof installExtensionDeckEntrySettingsHandler
    >[0];
    installExtensionDeckEntrySettingsHandler(api);

    const response = await new Promise<unknown>((resolve) => {
      expect(
        listener?.(
          {
            channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
            type: DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
          },
          {} as chrome.runtime.MessageSender,
          resolve,
        ),
      ).toBe(true);
    });

    expect(response).toEqual({
      ok: false,
      error: 'Storage transport failed',
    });
  });

  it('returns the visible deck count during bootstrap', async () => {
    let listener: ExtensionMessageListener | undefined;
    const create = vi.fn(async () => ({ id: 9 }) as chrome.tabs.Tab);
    const readCardCounts = vi.fn(async () => ({
      visibleCount: 6,
      activeCount: 4,
    }));
    const api = {
      runtime: {
        id: 'extension-id',
        onMessage: {
          addListener: vi.fn((next) => {
            listener = next;
          }),
        },
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(),
        },
      },
      commands: {
        getAll: vi.fn(async () => [
          {
            name: 'toggle-card-deck',
            shortcut: 'Command+E',
          },
        ]),
      },
      tabs: { create },
    } as unknown as Parameters<
      typeof installExtensionDeckEntrySettingsHandler
    >[0];
    installExtensionDeckEntrySettingsHandler(api, {
      readCardCounts,
    });

    const request = (
      message: unknown,
      sender = {} as chrome.runtime.MessageSender,
    ) =>
      new Promise<unknown>((resolve) => {
        expect(listener?.(message, sender, resolve)).toBe(true);
      });

    await expect(
      request({
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_SHORTCUT_READ_MESSAGE_TYPE,
      }),
    ).resolves.toEqual({
      ok: true,
      state: {
        shortcut: 'Command+E',
        defaultShortcut: 'Command+E',
      },
    });
    await expect(
      request({
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_SHORTCUT_OPEN_SETTINGS_MESSAGE_TYPE,
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      request(
        {
          channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
          type: DECK_BOOTSTRAP_READ_MESSAGE_TYPE,
          url: 'https://example.com/',
          tabId: null,
        },
        { tab: { id: 42 } as chrome.tabs.Tab } as chrome.runtime.MessageSender,
      ),
    ).resolves.toEqual({
      ok: true,
      settings: DEFAULT_DECK_ENTRY_SETTINGS,
      visibleCount: 6,
      activeCount: 4,
    });
    expect(readCardCounts).toHaveBeenNthCalledWith(
      1,
      'https://example.com/',
      DEFAULT_DECK_ENTRY_SETTINGS,
      42,
    );
    await expect(
      request({
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_BOOTSTRAP_READ_MESSAGE_TYPE,
        url: 'chrome-extension://extension-id/new-tab.html',
        tabId: 73,
      }),
    ).resolves.toMatchObject({
      ok: true,
      visibleCount: 6,
      activeCount: 4,
    });
    expect(readCardCounts).toHaveBeenNthCalledWith(
      2,
      'chrome-extension://extension-id/new-tab.html',
      DEFAULT_DECK_ENTRY_SETTINGS,
      73,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        url: expect.stringContaining('extensions'),
      }),
    );
  });
});
