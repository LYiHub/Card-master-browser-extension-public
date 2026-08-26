import {
  DECK_ACTIVE_CARD_COUNT_UPDATE_MESSAGE_TYPE,
  DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
  DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
  DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE,
  DECK_SHORTCUT_OPEN_SETTINGS_MESSAGE_TYPE,
  DECK_SHORTCUT_READ_MESSAGE_TYPE,
  type DeckCreationPreviewRequest,
  type DeckEntryActionResponse,
  type DeckEntryController,
  type DeckEntrySettings,
  type DeckEntrySettingsMutation,
  type DeckEntrySettingsResponse,
  type DeckShortcutResponse,
  type DeckVisibilityRequest,
  isDeckCreationPreviewMessage,
  isDeckEntrySettingsChangedMessage,
  isDeckVisibilityRequestMessage,
  normalizeDeckEntrySettings,
} from '../../features/userscript-deck/deck-entry';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  ExtensionMessageSubscription,
  sendExtensionTransportRequest,
} from './api';
import { extensionTarget } from './platform';

export class ExtensionDeckEntryController implements DeckEntryController {
  constructor(
    private readonly api: ExtensionApi,
    private readonly subscribeLocalVisibilityRequest?: (
      listener: (request: DeckVisibilityRequest) => void,
    ) => () => void,
    private readonly subscribeLocalCreationPreview?: (
      listener: (request: DeckCreationPreviewRequest) => void,
    ) => () => void,
  ) {}

  async readSettings() {
    const response =
      await sendExtensionTransportRequest<DeckEntrySettingsResponse>(this.api, {
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
      });
    if (!response.ok) throw new Error(response.error);
    return normalizeDeckEntrySettings(response.settings);
  }

  async updateSettings(mutation: DeckEntrySettingsMutation) {
    const response =
      await sendExtensionTransportRequest<DeckEntrySettingsResponse>(this.api, {
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE,
        mutation,
      });
    if (!response.ok) throw new Error(response.error);
    return normalizeDeckEntrySettings(response.settings);
  }

  subscribeSettings(listener: (settings: DeckEntrySettings) => void) {
    const handleMessage: ExtensionMessageListener = (message) => {
      if (isDeckEntrySettingsChangedMessage(message)) {
        listener(normalizeDeckEntrySettings(message.settings));
      }
    };
    const subscription = new ExtensionMessageSubscription(
      this.api,
      handleMessage,
    );
    subscription.start();
    return () => subscription.stop();
  }

  async readShortcut() {
    const response = await sendExtensionTransportRequest<DeckShortcutResponse>(
      this.api,
      {
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_SHORTCUT_READ_MESSAGE_TYPE,
      },
    );
    if (!response.ok) throw new Error(response.error);
    return response.state;
  }

  shortcutSettingsAvailable() {
    return extensionTarget() === 'chromium';
  }

  async openShortcutSettings() {
    const response =
      await sendExtensionTransportRequest<DeckEntryActionResponse>(this.api, {
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_SHORTCUT_OPEN_SETTINGS_MESSAGE_TYPE,
      });
    if (!response.ok) throw new Error(response.error);
  }

  async updateActiveCardCount(activeCount: number) {
    const response =
      await sendExtensionTransportRequest<DeckEntryActionResponse>(this.api, {
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_ACTIVE_CARD_COUNT_UPDATE_MESSAGE_TYPE,
        activeCount,
      });
    if (!response.ok) throw new Error(response.error);
  }

  subscribeVisibilityRequest(
    listener: (request: DeckVisibilityRequest) => void,
  ) {
    const handleMessage: ExtensionMessageListener = (message) => {
      if (isDeckVisibilityRequestMessage(message)) {
        listener(message.visibility);
      }
    };
    const subscription = new ExtensionMessageSubscription(
      this.api,
      handleMessage,
    );
    subscription.start();
    const stopLocal = this.subscribeLocalVisibilityRequest?.(listener);
    return () => {
      subscription.stop();
      stopLocal?.();
    };
  }

  subscribeCreationPreview(
    listener: (request: DeckCreationPreviewRequest) => void,
  ) {
    const handleMessage: ExtensionMessageListener = (message) => {
      if (isDeckCreationPreviewMessage(message)) {
        listener({
          requestId: message.requestId,
          ...(message.scriptId ? { scriptId: message.scriptId } : {}),
        });
      }
    };
    const subscription = new ExtensionMessageSubscription(
      this.api,
      handleMessage,
    );
    subscription.start();
    const stopLocal = this.subscribeLocalCreationPreview?.(listener);
    return () => {
      subscription.stop();
      stopLocal?.();
    };
  }
}
