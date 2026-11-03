import { type DependencyList, useMemo, useSyncExternalStore } from 'react';
import { getLanguageState, subscribeLanguage } from './locale';

export function useLocale() {
  return useSyncExternalStore(
    subscribeLanguage,
    getLanguageState,
    getLanguageState,
  );
}

export function useLocalizedMemo<T>(
  factory: () => T,
  dependencies: DependencyList,
): T {
  const { locale } = useLocale();
  // biome-ignore lint/correctness/useExhaustiveDependencies: Callers supply their dependencies; localized getters additionally depend on the active language.
  return useMemo(factory, [locale, ...dependencies]);
}
