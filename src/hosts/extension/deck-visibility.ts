import {
  DECK_CREATION_PREVIEW_MESSAGE_TYPE,
  DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
  type DeckVisibilityRequest,
} from '../../features/userscript-deck/deck-entry';

export const EXTENSION_PAGE_DECK_DELIVERY_MESSAGE_TYPE =
  'card-master:extension-page-deck-delivery';

export type DeckVisibilityApi = {
  runtime?: Pick<typeof chrome.runtime, 'sendMessage'>;
  scripting?: Pick<typeof chrome.scripting, 'executeScript'>;
  tabs: Pick<typeof chrome.tabs, 'sendMessage'>;
};

export type ExtensionPageDeckDeliveryMessage = {
  type: typeof EXTENSION_PAGE_DECK_DELIVERY_MESSAGE_TYPE;
  tabId: number;
  message: object;
};

export function isExtensionPageDeckDeliveryMessage(
  value: unknown,
): value is ExtensionPageDeckDeliveryMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === EXTENSION_PAGE_DECK_DELIVERY_MESSAGE_TYPE &&
    typeof message.tabId === 'number' &&
    Boolean(message.message) &&
    typeof message.message === 'object'
  );
}

async function sendDeckMessage(
  api: DeckVisibilityApi,
  tabId: number,
  message: object,
) {
  let initialFailure: unknown;
  try {
    await api.tabs.sendMessage(tabId, message);
    return;
  } catch (error) {
    initialFailure = error;
  }

  if (api.runtime) {
    try {
      const response = await api.runtime.sendMessage({
        type: EXTENSION_PAGE_DECK_DELIVERY_MESSAGE_TYPE,
        tabId,
        message,
      } satisfies ExtensionPageDeckDeliveryMessage);
      if (
        response &&
        typeof response === 'object' &&
        (response as { handled?: unknown }).handled === true
      ) {
        return;
      }
    } catch {
      // Ordinary webpages do not host the extension-page relay.
    }
  }

  if (!api.scripting) throw initialFailure;
  await api.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });
  await api.tabs.sendMessage(tabId, message);
}

export function requestDeckVisibility(
  api: DeckVisibilityApi,
  tabId: number,
  visibility: DeckVisibilityRequest,
) {
  return sendDeckMessage(api, tabId, {
    type: DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
    visibility,
  });
}

export function requestDeckCreationPreview(
  api: DeckVisibilityApi,
  tabId: number,
  requestId: string,
  scriptId?: string,
) {
  return sendDeckMessage(api, tabId, {
    type: DECK_CREATION_PREVIEW_MESSAGE_TYPE,
    requestId,
    ...(scriptId ? { scriptId } : {}),
  });
}
