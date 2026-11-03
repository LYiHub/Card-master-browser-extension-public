import { normalizeLanguagePreference } from '../../localization/locale';
import {
  LANGUAGE_PREFERENCE_CHANGED,
  LANGUAGE_PREFERENCE_CHANNEL,
  LANGUAGE_PREFERENCE_KEY,
} from '../../localization/preferences';
import type { ExtensionBackgroundApi } from './api';
import { reportExtensionFailure } from './diagnostics';
import { settleExtensionMessageDeliveries } from './extension-message-delivery';

export function installLanguagePreferenceBridge(api: ExtensionBackgroundApi) {
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const request = message as {
      channel?: unknown;
      type?: unknown;
      preference?: unknown;
    } | null;
    if (request?.channel !== LANGUAGE_PREFERENCE_CHANNEL) return;
    if (sender.id !== api.runtime.id) return;
    if (
      request.type !== 'language-preference-read' &&
      request.type !== 'language-preference-write'
    )
      return;
    void (async () => {
      if (request.type === 'language-preference-write') {
        if (
          normalizeLanguagePreference(request.preference) !== request.preference
        )
          throw new Error('Invalid language preference.');
        await api.storage.local.set({
          [LANGUAGE_PREFERENCE_KEY]: request.preference,
        });
      }
      const stored = await api.storage.local.get(LANGUAGE_PREFERENCE_KEY);
      return {
        preference: normalizeLanguagePreference(
          stored[LANGUAGE_PREFERENCE_KEY],
        ),
      };
    })().then(sendResponse, (error) =>
      sendResponse({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return true;
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(LANGUAGE_PREFERENCE_KEY in changes)) return;
    const update = {
      channel: LANGUAGE_PREFERENCE_CHANNEL,
      type: LANGUAGE_PREFERENCE_CHANGED,
      preference: normalizeLanguagePreference(
        changes[LANGUAGE_PREFERENCE_KEY].newValue,
      ),
    };
    void api.tabs
      .query({})
      .then((tabs) =>
        settleExtensionMessageDeliveries(
          [
            api.runtime.sendMessage(update),
            ...tabs.flatMap((tab) =>
              typeof tab.id === 'number'
                ? [api.tabs.sendMessage(tab.id, update)]
                : [],
            ),
          ],
          2000,
        ),
      )
      .catch((error) =>
        reportExtensionFailure(
          'localization',
          'preference-broadcast-failed',
          error,
        ),
      );
  });
}
