import {
  type ExtensionApi,
  sendExtensionTransportRequest,
} from '../hosts/extension/api';
import {
  type LanguagePreference,
  normalizeLanguagePreference,
  setLanguagePreference,
} from './locale';

export const LANGUAGE_PREFERENCE_KEY = 'card-master.language.v1';
export const LANGUAGE_PREFERENCE_CHANNEL = 'card-master.language';
export const LANGUAGE_PREFERENCE_CHANGED = 'language-preference-changed';
const bindings = new WeakMap<ExtensionApi, Promise<void>>();

function needsBackgroundBridge(api: ExtensionApi) {
  return (
    typeof location !== 'undefined' &&
    !location.href.startsWith(api.runtime.getURL(''))
  );
}

async function requestPreference(
  api: ExtensionApi,
  preference?: LanguagePreference,
) {
  const response = await sendExtensionTransportRequest<{
    preference?: unknown;
    error?: string;
  }>(api, {
    channel: LANGUAGE_PREFERENCE_CHANNEL,
    type:
      preference === undefined
        ? 'language-preference-read'
        : 'language-preference-write',
    ...(preference === undefined ? {} : { preference }),
  });
  if (response?.error) throw new Error(response.error);
  if (
    !response ||
    normalizeLanguagePreference(response.preference) !== response.preference
  ) {
    throw new Error('Invalid language preference response.');
  }
  return response.preference as LanguagePreference;
}

export function initializeLanguagePreference(api: ExtensionApi): Promise<void> {
  const existing = bindings.get(api);
  if (existing) return existing;
  let revision = 0;
  const bridged = needsBackgroundBridge(api);
  if (bridged) {
    api.runtime.onMessage.addListener((message) => {
      const update = message as {
        channel?: unknown;
        type?: unknown;
        preference?: unknown;
      } | null;
      if (
        update?.channel !== LANGUAGE_PREFERENCE_CHANNEL ||
        update.type !== LANGUAGE_PREFERENCE_CHANGED
      )
        return;
      revision += 1;
      setLanguagePreference(update.preference);
    });
  } else {
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !(LANGUAGE_PREFERENCE_KEY in changes)) return;
      revision += 1;
      setLanguagePreference(changes[LANGUAGE_PREFERENCE_KEY].newValue);
    });
  }
  const initialRevision = revision;
  const ready = Promise.resolve()
    .then(async () =>
      bridged
        ? requestPreference(api)
        : (await api.storage.local.get(LANGUAGE_PREFERENCE_KEY))?.[
            LANGUAGE_PREFERENCE_KEY
          ],
    )
    .then((preference) => {
      // A storage event may have delivered a newer choice while the initial read was pending.
      if (revision === initialRevision) {
        setLanguagePreference(preference);
      }
    });
  bindings.set(api, ready);
  return ready;
}

export async function writeLanguagePreference(
  api: ExtensionApi,
  preference: LanguagePreference,
) {
  if (normalizeLanguagePreference(preference) !== preference) {
    throw new Error('Invalid language preference.');
  }
  if (needsBackgroundBridge(api)) {
    setLanguagePreference(await requestPreference(api, preference));
    return;
  }
  await api.storage.local.set({ [LANGUAGE_PREFERENCE_KEY]: preference });
  setLanguagePreference(preference);
}
