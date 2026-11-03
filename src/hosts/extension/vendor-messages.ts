import {
  createMessageReader,
  type MessageCatalog,
  type Substitutions,
} from '../../localization/format';
import { getLocale } from '../../localization/locale';
import { initializeLanguagePreference } from '../../localization/preferences';
import type { ExtensionApi } from './api';

export function localizedVendorMessages(
  simplified: MessageCatalog,
  traditional: MessageCatalog,
) {
  const readers = {
    'zh-CN': createMessageReader(simplified),
    'zh-TW': createMessageReader(traditional, simplified),
  };
  const ready = initializeLanguagePreference(
    chrome as unknown as ExtensionApi,
  ).catch((error) => {
    console.error('[Card Master] Unable to read language preference.', error);
  });
  return {
    ready,
    getMessage(name: string, substitutions?: Substitutions) {
      return readers[getLocale()](name, substitutions);
    },
  };
}
