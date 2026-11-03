import type { ExtensionApi } from '../hosts/extension/api';
import { getLocale, subscribeLanguage } from './locale';
import { initializeLanguagePreference } from './preferences';

export async function initializeExtensionDocument(
  api: ExtensionApi,
  title: () => string,
) {
  await initializeLanguagePreference(api);
  const update = () => {
    document.documentElement.lang = getLocale();
    document.title = title();
  };
  update();
  return subscribeLanguage(update);
}
