import { GAMEPAD_CONTROL_CARD_ID } from '../../gamepad-control/domain/types';
import { MEDIA_RESOURCES_CARD_ID } from '../../media-resources/domain/types';
import {
  DECK_STEWARD_CARD_ID,
  NEW_TAB_CARD_ID,
} from '../../system-cards/domain/catalog';

export const DECK_ENTRY_SETTINGS_STORAGE_KEY =
  'card-master.deck-entry-settings.v1';
export const STEWARD_SESSION_HIDDEN_STORAGE_KEY =
  'card-master.steward-hidden-this-session.v1';
export const DECK_VISIBILITY_REQUEST_MESSAGE_TYPE = 'deck-visibility-request';
export const DECK_CREATION_PREVIEW_MESSAGE_TYPE =
  'deck-creation-preview-request';
export const DECK_TOGGLE_COMMAND = 'toggle-card-deck';
export const DEFAULT_DECK_SHORTCUT = 'Command+E';
export const SAFARI_DEFAULT_DECK_SHORTCUT = 'Command+Shift+E';
export const DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL = 'card-master-extension';
export const DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE = 'deck-entry-settings-read';
export const DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE =
  'deck-entry-settings-update';
export const DECK_ENTRY_SETTINGS_CHANGED_MESSAGE_TYPE =
  'deck-entry-settings-changed';
export const DECK_SHORTCUT_READ_MESSAGE_TYPE = 'deck-shortcut-read';
export const DECK_SHORTCUT_OPEN_SETTINGS_MESSAGE_TYPE =
  'deck-shortcut-open-settings';
export const DECK_ACTIVE_CARD_COUNT_UPDATE_MESSAGE_TYPE =
  'deck-active-card-count-update';
export const DECK_BOOTSTRAP_READ_MESSAGE_TYPE = 'deck-bootstrap-read';

export type DeckEntryPosition = {
  x: number;
  y: number;
};

export type DeckEntrySettings = {
  showDeckTrigger: boolean;
  showToolbarBadge: boolean;
  showDeckTriggerBadge: boolean;
  position: DeckEntryPosition | null;
  hiddenCardIds: string[];
};

export type DeckEntrySettingsMutation =
  | {
      kind: 'set-trigger-visible';
      visible: boolean;
    }
  | {
      kind: 'set-toolbar-badge-visible';
      visible: boolean;
    }
  | {
      kind: 'set-trigger-badge-visible';
      visible: boolean;
    }
  | {
      kind: 'set-position';
      position: DeckEntryPosition | null;
    }
  | {
      kind: 'set-card-hidden';
      cardId: string;
      hidden: boolean;
    };

export type DeckVisibility = 'open' | 'closed';
export type DeckVisibilityRequest = DeckVisibility | 'toggle';
export type DeckCreationPreviewRequest = {
  requestId: string;
  scriptId?: string;
};

export const DEFAULT_DECK_ENTRY_SETTINGS: DeckEntrySettings = {
  showDeckTrigger: true,
  showToolbarBadge: true,
  showDeckTriggerBadge: true,
  position: null,
  hiddenCardIds: [
    NEW_TAB_CARD_ID,
    GAMEPAD_CONTROL_CARD_ID,
    MEDIA_RESOURCES_CARD_ID,
    'preinstalled-copying-lifted',
  ],
};

export function deckTriggerHidden(settings: DeckEntrySettings | null) {
  return settings?.showDeckTrigger === false;
}

function normalizeHiddenCardIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_DECK_ENTRY_SETTINGS.hiddenCardIds];
  }
  return [
    ...new Set(
      value.filter(
        (cardId): cardId is string =>
          typeof cardId === 'string' &&
          cardId.length > 0 &&
          cardId.length <= 512,
      ),
    ),
  ].slice(0, 10_000);
}

export function deckCardHidden(
  settings: DeckEntrySettings | null,
  cardId: string,
) {
  return settings?.hiddenCardIds.includes(cardId) === true;
}

export function setDeckCardHidden(
  settings: DeckEntrySettings,
  cardId: string,
  hidden: boolean,
) {
  const hiddenCardIds = hidden
    ? [...new Set([...settings.hiddenCardIds, cardId])]
    : settings.hiddenCardIds.filter((candidate) => candidate !== cardId);
  return hiddenCardIds.length === settings.hiddenCardIds.length &&
    hiddenCardIds.every(
      (candidate, index) => candidate === settings.hiddenCardIds[index],
    )
    ? settings
    : { ...settings, hiddenCardIds };
}

export function persistableDeckEntrySettings(
  settings: DeckEntrySettings,
): DeckEntrySettings {
  return setDeckCardHidden(settings, DECK_STEWARD_CARD_ID, false);
}

export function withStewardSessionHidden(
  settings: DeckEntrySettings,
  hidden: boolean,
): DeckEntrySettings {
  return setDeckCardHidden(
    persistableDeckEntrySettings(settings),
    DECK_STEWARD_CARD_ID,
    hidden,
  );
}

export function applyDeckEntrySettingsMutation(
  settings: DeckEntrySettings,
  mutation: DeckEntrySettingsMutation,
) {
  if (mutation.kind === 'set-trigger-visible') {
    return settings.showDeckTrigger === mutation.visible
      ? settings
      : { ...settings, showDeckTrigger: mutation.visible };
  }
  if (mutation.kind === 'set-toolbar-badge-visible') {
    return settings.showToolbarBadge === mutation.visible
      ? settings
      : { ...settings, showToolbarBadge: mutation.visible };
  }
  if (mutation.kind === 'set-trigger-badge-visible') {
    return settings.showDeckTriggerBadge === mutation.visible
      ? settings
      : { ...settings, showDeckTriggerBadge: mutation.visible };
  }
  if (mutation.kind === 'set-position') {
    return settings.position === mutation.position
      ? settings
      : { ...settings, position: mutation.position };
  }
  return setDeckCardHidden(settings, mutation.cardId, mutation.hidden);
}

export type DeckShortcutState = {
  shortcut: string;
  defaultShortcut: string;
};

export type DeckEntrySettingsMessage =
  | {
      channel: typeof DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL;
      type: typeof DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE;
    }
  | {
      channel: typeof DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL;
      type: typeof DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE;
      mutation: DeckEntrySettingsMutation;
    }
  | {
      channel: typeof DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL;
      type: typeof DECK_SHORTCUT_READ_MESSAGE_TYPE;
    }
  | {
      channel: typeof DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL;
      type: typeof DECK_SHORTCUT_OPEN_SETTINGS_MESSAGE_TYPE;
    }
  | {
      channel: typeof DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL;
      type: typeof DECK_ACTIVE_CARD_COUNT_UPDATE_MESSAGE_TYPE;
      activeCount: number;
    }
  | {
      channel: typeof DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL;
      type: typeof DECK_BOOTSTRAP_READ_MESSAGE_TYPE;
      url: string;
      tabId: number | null;
    };

export type DeckEntrySettingsResponse =
  | {
      ok: true;
      settings: DeckEntrySettings;
    }
  | {
      ok: false;
      error: string;
    };

export type DeckEntrySettingsChangedMessage = {
  type: typeof DECK_ENTRY_SETTINGS_CHANGED_MESSAGE_TYPE;
  settings: DeckEntrySettings;
};

export type DeckShortcutResponse =
  | {
      ok: true;
      state: DeckShortcutState;
    }
  | {
      ok: false;
      error: string;
    };

export type DeckEntryActionResponse =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

export type DeckBootstrapResponse =
  | {
      ok: true;
      settings: DeckEntrySettings;
      visibleCount: number;
      activeCount: number;
    }
  | {
      ok: false;
      error: string;
    };

export type DeckEntryController = {
  readSettings(): Promise<DeckEntrySettings>;
  updateSettings(
    mutation: DeckEntrySettingsMutation,
  ): Promise<DeckEntrySettings>;
  subscribeSettings(
    listener: (settings: DeckEntrySettings) => void,
  ): () => void;
  readShortcut(): Promise<DeckShortcutState>;
  shortcutSettingsAvailable(): boolean;
  openShortcutSettings(): Promise<void>;
  updateActiveCardCount(activeCount: number): Promise<void>;
  subscribeVisibilityRequest(
    listener: (request: DeckVisibilityRequest) => void,
  ): () => void;
  subscribeCreationPreview(
    listener: (request: DeckCreationPreviewRequest) => void,
  ): () => void;
};

export function isDeckEntryPosition(
  value: unknown,
): value is DeckEntryPosition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const position = value as Record<string, unknown>;
  return (
    typeof position.x === 'number' &&
    Number.isFinite(position.x) &&
    position.x >= 0 &&
    position.x <= 1 &&
    typeof position.y === 'number' &&
    Number.isFinite(position.y) &&
    position.y >= 0 &&
    position.y <= 1
  );
}

export function normalizeDeckEntrySettings(value: unknown): DeckEntrySettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_DECK_ENTRY_SETTINGS;
  }
  const settings = value as Record<string, unknown>;
  const showDeckTrigger = settings.showDeckTrigger;
  const showToolbarBadge = settings.showToolbarBadge;
  const showDeckTriggerBadge = settings.showDeckTriggerBadge;
  return {
    showDeckTrigger:
      typeof showDeckTrigger === 'boolean'
        ? showDeckTrigger
        : DEFAULT_DECK_ENTRY_SETTINGS.showDeckTrigger,
    showToolbarBadge:
      typeof showToolbarBadge === 'boolean'
        ? showToolbarBadge
        : DEFAULT_DECK_ENTRY_SETTINGS.showToolbarBadge,
    showDeckTriggerBadge:
      typeof showDeckTriggerBadge === 'boolean'
        ? showDeckTriggerBadge
        : DEFAULT_DECK_ENTRY_SETTINGS.showDeckTriggerBadge,
    position: isDeckEntryPosition(settings.position) ? settings.position : null,
    hiddenCardIds: normalizeHiddenCardIds(settings.hiddenCardIds),
  };
}

function isDeckEntrySettings(value: unknown): value is DeckEntrySettings {
  const settings = value as Record<string, unknown>;
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof settings.showDeckTrigger === 'boolean' &&
    typeof settings.showToolbarBadge === 'boolean' &&
    typeof settings.showDeckTriggerBadge === 'boolean' &&
    (settings.position === null || isDeckEntryPosition(settings.position)) &&
    Array.isArray(settings.hiddenCardIds) &&
    settings.hiddenCardIds.every(
      (cardId) =>
        typeof cardId === 'string' && cardId.length > 0 && cardId.length <= 512,
    )
  );
}

export function isDeckEntrySettingsMutation(
  value: unknown,
): value is DeckEntrySettingsMutation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const mutation = value as Record<string, unknown>;
  if (mutation.kind === 'set-trigger-visible') {
    return typeof mutation.visible === 'boolean';
  }
  if (
    mutation.kind === 'set-toolbar-badge-visible' ||
    mutation.kind === 'set-trigger-badge-visible'
  ) {
    return typeof mutation.visible === 'boolean';
  }
  if (mutation.kind === 'set-position') {
    return mutation.position === null || isDeckEntryPosition(mutation.position);
  }
  return (
    mutation.kind === 'set-card-hidden' &&
    typeof mutation.cardId === 'string' &&
    mutation.cardId.length > 0 &&
    mutation.cardId.length <= 512 &&
    typeof mutation.hidden === 'boolean'
  );
}

export function isDeckEntrySettingsMessage(
  value: unknown,
): value is DeckEntrySettingsMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (message.channel !== DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL) return false;
  if (
    message.type === DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE ||
    message.type === DECK_SHORTCUT_READ_MESSAGE_TYPE ||
    message.type === DECK_SHORTCUT_OPEN_SETTINGS_MESSAGE_TYPE
  ) {
    return true;
  }
  if (message.type === DECK_BOOTSTRAP_READ_MESSAGE_TYPE) {
    return (
      typeof message.url === 'string' &&
      message.url.length > 0 &&
      (message.tabId === null ||
        (typeof message.tabId === 'number' &&
          Number.isSafeInteger(message.tabId) &&
          message.tabId >= 0))
    );
  }
  if (message.type === DECK_ACTIVE_CARD_COUNT_UPDATE_MESSAGE_TYPE) {
    return (
      typeof message.activeCount === 'number' &&
      Number.isSafeInteger(message.activeCount) &&
      message.activeCount >= 0
    );
  }
  if (message.type !== DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE) return false;
  return isDeckEntrySettingsMutation(message.mutation);
}

export function isDeckEntrySettingsChangedMessage(
  value: unknown,
): value is DeckEntrySettingsChangedMessage {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).type ===
      DECK_ENTRY_SETTINGS_CHANGED_MESSAGE_TYPE &&
    isDeckEntrySettings((value as Record<string, unknown>).settings)
  );
}

export function isDeckVisibilityRequestMessage(value: unknown): value is {
  type: typeof DECK_VISIBILITY_REQUEST_MESSAGE_TYPE;
  visibility: DeckVisibilityRequest;
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).type ===
      DECK_VISIBILITY_REQUEST_MESSAGE_TYPE &&
    ((value as Record<string, unknown>).visibility === 'open' ||
      (value as Record<string, unknown>).visibility === 'closed' ||
      (value as Record<string, unknown>).visibility === 'toggle')
  );
}

export function isDeckCreationPreviewMessage(value: unknown): value is {
  type: typeof DECK_CREATION_PREVIEW_MESSAGE_TYPE;
  requestId: string;
  scriptId?: string;
} {
  const message = value as Record<string, unknown>;
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    message.type === DECK_CREATION_PREVIEW_MESSAGE_TYPE &&
    typeof message.requestId === 'string' &&
    message.requestId.length > 0 &&
    message.requestId.length <= 128 &&
    (message.scriptId === undefined ||
      (typeof message.scriptId === 'string' &&
        message.scriptId.length > 0 &&
        message.scriptId.length <= 128))
  );
}
