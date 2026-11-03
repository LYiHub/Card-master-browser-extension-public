import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLanguageState,
  normalizeLanguagePreference,
  resolveAppLocale,
  setLanguagePreference,
  subscribeLanguage,
} from './locale';

afterEach(() => {
  vi.unstubAllGlobals();
  setLanguagePreference('auto');
});

describe('application language', () => {
  it.each([
    ['zh-CN', 'zh-CN'],
    ['zh-SG', 'zh-CN'],
    ['zh-TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh-MO', 'zh-TW'],
    ['zh_Hant', 'zh-TW'],
    ['zh-Hant-CN', 'zh-TW'],
    ['zh-Hans-HK', 'zh-CN'],
    ['en-US', 'zh-CN'],
    ['', 'zh-CN'],
    ['invalid locale!', 'zh-CN'],
  ])('resolves %s to %s', (input, expected) => {
    expect(resolveAppLocale(input)).toBe(expected);
  });

  it('normalizes legacy or invalid preference values', () => {
    for (const value of [undefined, null, {}, 'zh', 'en', 'auto']) {
      expect(normalizeLanguagePreference(value)).toBe('auto');
    }
    expect(normalizeLanguagePreference('zh-TW')).toBe('zh-TW');
  });

  it('uses browser UI language in automatic mode and not website preferences', () => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'zh-TW' } });
    setLanguagePreference('auto');
    expect(getLanguageState()).toEqual({ preference: 'auto', locale: 'zh-TW' });
    setLanguagePreference('zh-CN');
    expect(getLanguageState().locale).toBe('zh-CN');
  });

  it('notifies subscribers without remounting and supports disposal', () => {
    const listener = vi.fn();
    const remove = subscribeLanguage(listener);
    setLanguagePreference('zh-TW');
    setLanguagePreference('zh-TW');
    expect(listener).toHaveBeenCalledOnce();
    remove();
    setLanguagePreference('zh-CN');
    expect(listener).toHaveBeenCalledOnce();
  });
});
