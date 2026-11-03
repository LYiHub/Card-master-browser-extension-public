import { useSyncExternalStore } from 'react';
import { getLanguageState, subscribeLanguage } from './locale';

export function useLocale() {
  return useSyncExternalStore(
    subscribeLanguage,
    getLanguageState,
    getLanguageState,
  );
}
