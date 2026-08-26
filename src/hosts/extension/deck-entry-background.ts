import {
  applyDeckEntrySettingsMutation,
  DECK_ACTIVE_CARD_COUNT_UPDATE_MESSAGE_TYPE,
  DECK_BOOTSTRAP_READ_MESSAGE_TYPE,
  DECK_ENTRY_SETTINGS_CHANGED_MESSAGE_TYPE,
  DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
  DECK_ENTRY_SETTINGS_STORAGE_KEY,
  DECK_SHORTCUT_OPEN_SETTINGS_MESSAGE_TYPE,
  DECK_SHORTCUT_READ_MESSAGE_TYPE,
  DECK_TOGGLE_COMMAND,
  DEFAULT_DECK_ENTRY_SETTINGS,
  DEFAULT_DECK_SHORTCUT,
  type DeckBootstrapResponse,
  type DeckEntryActionResponse,
  type DeckEntrySettings,
  type DeckEntrySettingsMutation,
  type DeckEntrySettingsResponse,
  type DeckShortcutResponse,
  isDeckEntrySettingsMessage,
  normalizeDeckEntrySettings,
  persistableDeckEntrySettings,
  SAFARI_DEFAULT_DECK_SHORTCUT,
  STEWARD_SESSION_HIDDEN_STORAGE_KEY,
  withStewardSessionHidden,
} from '../../features/userscript-deck/deck-entry';
import { isExtensionStorageSpaceFailure } from '../../lib/extension-errors';
import { DECK_STEWARD_CARD_ID } from '../../system-cards/domain/catalog';
import type { ExtensionApi, ExtensionMessageListener } from './api';
import { extensionDiagnostics, extensionErrorMessage } from './diagnostics';
import { settleExtensionMessageDeliveries } from './extension-message-delivery';
import { extensionShortcutSettingsUrl, extensionTarget } from './platform';

const DECK_ENTRY_SETTINGS_DELIVERY_TIMEOUT_MS = 2_000;
const settingsMutationQueues = new WeakMap<object, Promise<void>>();
const storageReadFailures = new WeakSet<object>();
const stewardHiddenByApi = new WeakMap<object, boolean>();

type SessionStorageArea = {
  get: (keys: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string) => Promise<void>;
};

function sessionStorageOf(
  api: DeckEntryBackgroundApi,
): SessionStorageArea | undefined {
  const session = (api.storage as { session?: Partial<SessionStorageArea> })
    .session;
  if (!session?.get || !session?.set || !session?.remove) return undefined;
  return session as SessionStorageArea;
}

async function readStewardSessionHidden(api: DeckEntryBackgroundApi) {
  const session = sessionStorageOf(api);
  if (session) {
    const stored = await session.get(STEWARD_SESSION_HIDDEN_STORAGE_KEY);
    return stored[STEWARD_SESSION_HIDDEN_STORAGE_KEY] === true;
  }
  return stewardHiddenByApi.get(api) === true;
}

async function writeStewardSessionHidden(
  api: DeckEntryBackgroundApi,
  hidden: boolean,
) {
  stewardHiddenByApi.set(api, hidden);
  const session = sessionStorageOf(api);
  if (!session) return;
  if (hidden) {
    await session.set({ [STEWARD_SESSION_HIDDEN_STORAGE_KEY]: true });
    return;
  }
  await session.remove(STEWARD_SESSION_HIDDEN_STORAGE_KEY);
}

type DeckEntryBackgroundApi = ExtensionApi & {
  commands?: Pick<typeof chrome.commands, 'getAll'>;
};

type DeckEntryBackgroundOptions = {
  updateActiveCardCount?: (
    tabId: number,
    activeCount: number,
    visible: boolean,
  ) => void | Promise<void>;
  refreshActiveCardCounts?: (
    settings: DeckEntrySettings,
  ) => void | Promise<void>;
  readCardCounts?: (
    url: string,
    settings: DeckEntrySettings,
    tabId?: number,
  ) =>
    | { visibleCount: number; activeCount: number }
    | Promise<{ visibleCount: number; activeCount: number }>;
  onStorageReadFailure?: (error: unknown) => void;
};

async function readStoredSettings(
  api: DeckEntryBackgroundApi,
  onStorageReadFailure?: (error: unknown) => void,
) {
  try {
    const stored = await api.storage.local.get(DECK_ENTRY_SETTINGS_STORAGE_KEY);
    storageReadFailures.delete(api);
    return withStewardSessionHidden(
      persistableDeckEntrySettings(
        normalizeDeckEntrySettings(stored[DECK_ENTRY_SETTINGS_STORAGE_KEY]),
      ),
      await readStewardSessionHidden(api),
    );
  } catch (error) {
    if (!isExtensionStorageSpaceFailure(error)) throw error;
    onStorageReadFailure?.(error);
    if (!storageReadFailures.has(api)) {
      storageReadFailures.add(api);
      extensionDiagnostics.warn(
        'deck-entry-background',
        'storage-read-recovery-defaults',
        error,
      );
    }
    return withStewardSessionHidden(
      persistableDeckEntrySettings(
        normalizeDeckEntrySettings(DEFAULT_DECK_ENTRY_SETTINGS),
      ),
      await readStewardSessionHidden(api),
    );
  }
}

async function readShortcut(api: DeckEntryBackgroundApi) {
  const commands = await api.commands?.getAll();
  const command = commands?.find((entry) => entry.name === DECK_TOGGLE_COMMAND);
  return {
    shortcut: command?.shortcut ?? '',
    defaultShortcut:
      extensionTarget() === 'safari'
        ? SAFARI_DEFAULT_DECK_SHORTCUT
        : DEFAULT_DECK_SHORTCUT,
  };
}

async function openShortcutSettings(api: DeckEntryBackgroundApi) {
  if (!api.tabs?.create) {
    throw new Error('The browser tabs API is unavailable.');
  }
  const url = extensionShortcutSettingsUrl(api.runtime.id, DECK_TOGGLE_COMMAND);
  if (!url) {
    throw new Error('请在浏览器的扩展设置中修改键盘快捷键。');
  }
  await api.tabs.create({
    active: true,
    url,
  });
}

async function broadcastSettings(
  api: DeckEntryBackgroundApi,
  settings: DeckEntrySettings,
) {
  const message = {
    type: DECK_ENTRY_SETTINGS_CHANGED_MESSAGE_TYPE,
    settings,
  };
  const tabs = api.tabs ? await api.tabs.query({}) : [];
  await settleExtensionMessageDeliveries(
    [
      api.runtime.sendMessage(message),
      ...tabs.flatMap((tab) =>
        typeof tab.id === 'number' && api.tabs
          ? [api.tabs.sendMessage(tab.id, message, { frameId: 0 })]
          : [],
      ),
    ],
    DECK_ENTRY_SETTINGS_DELIVERY_TIMEOUT_MS,
  );
}

function serializeSettingsMutation<T>(
  api: DeckEntryBackgroundApi,
  operation: () => Promise<T>,
) {
  const previous = settingsMutationQueues.get(api) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(operation);
  settingsMutationQueues.set(
    api,
    task.then(
      () => undefined,
      () => undefined,
    ),
  );
  return task;
}

async function persistSettings(
  api: DeckEntryBackgroundApi,
  settings: DeckEntrySettings,
) {
  const stewardHidden = settings.hiddenCardIds.includes(DECK_STEWARD_CARD_ID);
  const persisted = persistableDeckEntrySettings(settings);
  await api.storage.local.set({
    [DECK_ENTRY_SETTINGS_STORAGE_KEY]: persisted,
  });
  await writeStewardSessionHidden(api, stewardHidden);
  const live = withStewardSessionHidden(persisted, stewardHidden);
  await broadcastSettings(api, live);
  return live;
}

export function resetExtensionDeckEntrySettings(
  api: DeckEntryBackgroundApi,
  onReset?: (settings: DeckEntrySettings) => void | Promise<void>,
) {
  return serializeSettingsMutation(api, async () => {
    const settings = await persistSettings(
      api,
      normalizeDeckEntrySettings(DEFAULT_DECK_ENTRY_SETTINGS),
    );
    await onReset?.(settings);
    return settings;
  });
}

export function mutateExtensionDeckEntrySettings(
  api: DeckEntryBackgroundApi,
  mutation: DeckEntrySettingsMutation,
) {
  return serializeSettingsMutation(api, async () => {
    const current = await readStoredSettings(api);
    return persistSettings(
      api,
      applyDeckEntrySettingsMutation(current, mutation),
    );
  });
}

export function installExtensionDeckEntrySettingsHandler(
  api: DeckEntryBackgroundApi,
  options: DeckEntryBackgroundOptions = {},
) {
  const handleMessage: ExtensionMessageListener = (
    message,
    sender,
    sendResponse,
  ) => {
    if (!isDeckEntrySettingsMessage(message)) return undefined;
    void (async (): Promise<
      | DeckEntrySettingsResponse
      | DeckShortcutResponse
      | DeckEntryActionResponse
      | DeckBootstrapResponse
    > => {
      if (
        message.type === DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE ||
        message.type === DECK_BOOTSTRAP_READ_MESSAGE_TYPE
      ) {
        const settings = await readStoredSettings(
          api,
          options.onStorageReadFailure,
        );
        if (message.type === DECK_BOOTSTRAP_READ_MESSAGE_TYPE) {
          const tabId = sender.tab?.id ?? message.tabId ?? undefined;
          let counts: { visibleCount: number; activeCount: number } | undefined;
          try {
            counts = await options.readCardCounts?.(
              message.url,
              settings,
              tabId,
            );
          } catch (error) {
            if (!isExtensionStorageSpaceFailure(error)) throw error;
            options.onStorageReadFailure?.(error);
          }
          const visibleCount = Math.max(1, counts?.visibleCount ?? 1);
          const activeCount = Math.max(0, counts?.activeCount ?? 0);
          if (typeof tabId === 'number') {
            await options.updateActiveCardCount?.(
              tabId,
              activeCount,
              settings.showToolbarBadge,
            );
          }
          return {
            ok: true,
            settings,
            visibleCount,
            activeCount,
          };
        }
        return {
          ok: true,
          settings,
        };
      }
      if (message.type === DECK_SHORTCUT_READ_MESSAGE_TYPE) {
        return {
          ok: true,
          state: await readShortcut(api),
        };
      }
      if (message.type === DECK_SHORTCUT_OPEN_SETTINGS_MESSAGE_TYPE) {
        await openShortcutSettings(api);
        return { ok: true };
      }
      if (message.type === DECK_ACTIVE_CARD_COUNT_UPDATE_MESSAGE_TYPE) {
        if (typeof sender.tab?.id !== 'number') {
          throw new Error(
            'The active card count update has no browser tab identity.',
          );
        }
        const settings = await readStoredSettings(
          api,
          options.onStorageReadFailure,
        );
        await options.updateActiveCardCount?.(
          sender.tab.id,
          message.activeCount,
          settings.showToolbarBadge,
        );
        return { ok: true };
      }
      const settings = await mutateExtensionDeckEntrySettings(
        api,
        message.mutation,
      );
      await options.refreshActiveCardCounts?.(settings);
      return {
        ok: true,
        settings,
      };
    })().then(sendResponse, (error) =>
      sendResponse({
        ok: false,
        error: extensionErrorMessage(error),
      } satisfies DeckEntryActionResponse),
    );
    return true;
  };
  api.runtime.onMessage.addListener(handleMessage);
}
