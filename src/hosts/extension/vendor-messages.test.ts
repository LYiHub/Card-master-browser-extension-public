import { afterEach, expect, it, vi } from 'vitest';
import { setLanguagePreference } from '../../localization/locale';
import { LANGUAGE_PREFERENCE_KEY } from '../../localization/preferences';
import { localizedVendorMessages } from './vendor-messages';

afterEach(() => {
  vi.unstubAllGlobals();
  setLanguagePreference('auto');
});

it('loads the app preference before vendor startup and keeps native i18n isolated', async () => {
  const nativeMessage = vi.fn(() => 'browser locale');
  vi.stubGlobal('chrome', {
    i18n: { getMessage: nativeMessage, getUILanguage: () => 'zh-CN' },
    storage: {
      local: {
        get: vi.fn(async () => ({ [LANGUAGE_PREFERENCE_KEY]: 'zh-TW' })),
      },
      onChanged: { addListener: vi.fn() },
    },
  });
  const messages = localizedVendorMessages(
    { title: { message: '设置 $1' } },
    { title: { message: '設定 $1' } },
  );
  await messages.ready;
  expect(messages.getMessage('title', ['$literal'])).toBe('設定 $literal');
  setLanguagePreference('zh-CN');
  expect(messages.getMessage('title', ['x'])).toBe('设置 x');
  expect(chrome.i18n.getMessage).toBe(nativeMessage);
  expect(nativeMessage).not.toHaveBeenCalled();
});
