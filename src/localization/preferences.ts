import type { ExtensionApi } from '../hosts/extension/api';
import {
  type LanguagePreference,
  normalizeLanguagePreference,
  setLanguagePreference,
} from './locale';

export const LANGUAGE_PREFERENCE_KEY = 'card-master.language.v1';
const bindings = new WeakMap<ExtensionApi, Promise<void>>();

export function initializeLanguagePreference(api: ExtensionApi): Promise<void> {
  const existing = bindings.get(api);
  if (existing) return existing;
  let revision = 0;
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(LANGUAGE_PREFERENCE_KEY in changes)) return;
    revision += 1;
    setLanguagePreference(changes[LANGUAGE_PREFERENCE_KEY].newValue);
  });
  const initialRevision = revision;
  const ready = Promise.resolve()
    .then(() => api.storage.local.get(LANGUAGE_PREFERENCE_KEY))
    .then((stored) => {
      // A storage event may have delivered a newer choice while the initial read was pending.
      if (revision === initialRevision) {
        setLanguagePreference(stored?.[LANGUAGE_PREFERENCE_KEY]);
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
  await api.storage.local.set({ [LANGUAGE_PREFERENCE_KEY]: preference });
  setLanguagePreference(preference);
}
