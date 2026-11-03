export type AppLocale = 'zh-CN' | 'zh-TW';
export type LanguagePreference = 'auto' | AppLocale;

export function normalizeLanguagePreference(
  value: unknown,
): LanguagePreference {
  return value === 'zh-CN' || value === 'zh-TW' ? value : 'auto';
}

export function resolveAppLocale(language: string): AppLocale {
  try {
    const locale = new Intl.Locale(language.replaceAll('_', '-'));
    if (locale.language !== 'zh') return 'zh-CN';
    const script = locale.script ?? locale.maximize().script;
    return script === 'Hant' ? 'zh-TW' : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

function browserLanguage() {
  const globals = globalThis as typeof globalThis & {
    browser?: { i18n?: { getUILanguage?(): string } };
    chrome?: { i18n?: { getUILanguage?(): string } };
  };
  try {
    return (
      (globals.browser ?? globals.chrome)?.i18n?.getUILanguage?.() ??
      (typeof navigator === 'undefined' ? 'zh-CN' : navigator.language)
    );
  } catch {
    return 'zh-CN';
  }
}

let state: { preference: LanguagePreference; locale: AppLocale } = {
  preference: 'auto',
  locale: resolveAppLocale(browserLanguage()),
};
const listeners = new Set<() => void>();

export const getLanguageState = () => state;
export const getLocale = () => state.locale;

export function setLanguagePreference(value: unknown) {
  const preference = normalizeLanguagePreference(value);
  const locale =
    preference === 'auto' ? resolveAppLocale(browserLanguage()) : preference;
  if (state.preference === preference && state.locale === locale) return;
  state = { preference, locale };
  for (const listener of listeners) listener();
}

export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
