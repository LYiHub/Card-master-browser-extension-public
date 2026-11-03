import { afterEach, expect, it, vi } from 'vitest';
import type { ExtensionApi } from '../hosts/extension/api';
import { getLanguageState, setLanguagePreference } from './locale';
import {
  initializeLanguagePreference,
  LANGUAGE_PREFERENCE_CHANGED,
  LANGUAGE_PREFERENCE_CHANNEL,
  LANGUAGE_PREFERENCE_KEY,
  writeLanguagePreference,
} from './preferences';

afterEach(() => {
  vi.unstubAllGlobals();
  setLanguagePreference('auto');
});

function storage(
  get = vi.fn().mockResolvedValue({ [LANGUAGE_PREFERENCE_KEY]: 'zh-TW' }),
) {
  const listeners: ((
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => void)[] = [];
  const api = {
    storage: {
      local: { get, set: vi.fn().mockResolvedValue(undefined) },
      onChanged: {
        addListener: (listener: (typeof listeners)[number]) =>
          listeners.push(listener),
      },
    },
  } as unknown as ExtensionApi;
  return { api, listeners };
}

it('loads the preference once and broadcasts storage updates and removal', async () => {
  const { api, listeners } = storage();
  await initializeLanguagePreference(api);
  await initializeLanguagePreference(api);
  expect(listeners).toHaveLength(1);
  expect(getLanguageState().preference).toBe('zh-TW');
  listeners[0]({ [LANGUAGE_PREFERENCE_KEY]: { newValue: 'zh-CN' } }, 'local');
  expect(getLanguageState().preference).toBe('zh-CN');
  listeners[0]({ [LANGUAGE_PREFERENCE_KEY]: { newValue: 'zh-TW' } }, 'sync');
  expect(getLanguageState().preference).toBe('zh-CN');
  listeners[0]({ [LANGUAGE_PREFERENCE_KEY]: {} }, 'local');
  expect(getLanguageState().preference).toBe('auto');
});

it('does not overwrite a newer storage event with an older initial read', async () => {
  let finish: (value: Record<string, string>) => void = () => {};
  const pending = new Promise<Record<string, string>>((resolve) => {
    finish = resolve;
  });
  const { api, listeners } = storage(vi.fn().mockReturnValue(pending));
  const ready = initializeLanguagePreference(api);
  listeners[0]({ [LANGUAGE_PREFERENCE_KEY]: { newValue: 'zh-CN' } }, 'local');
  finish({ [LANGUAGE_PREFERENCE_KEY]: 'zh-TW' });
  await ready;
  expect(getLanguageState().preference).toBe('zh-CN');
});

it('persists only the local language preference and preserves current choice on failure', async () => {
  const { api } = storage();
  await writeLanguagePreference(api, 'zh-TW');
  expect(api.storage.local.set).toHaveBeenCalledWith({
    [LANGUAGE_PREFERENCE_KEY]: 'zh-TW',
  });
  vi.mocked(api.storage.local.set).mockRejectedValueOnce(
    new Error('storage failure'),
  );
  await expect(writeLanguagePreference(api, 'zh-CN')).rejects.toThrow(
    'storage failure',
  );
  expect(getLanguageState().preference).toBe('zh-TW');
});

it('reads, writes and receives changes in a content context where local storage is forbidden', async () => {
  vi.stubGlobal('location', {
    href: 'https://www.youtube.com/watch?v=example',
  });
  const denied = vi.fn(() => {
    throw new Error('Access to storage is not allowed from this context.');
  });
  const listeners: ((message: unknown) => unknown)[] = [];
  let saved = 'zh-CN';
  const sendMessage = vi.fn(
    async (request: { type: string; preference?: string }) => {
      if (request.type === 'language-preference-write')
        saved = request.preference ?? saved;
      return { preference: saved };
    },
  );
  const api = {
    runtime: {
      id: 'extension',
      getURL: (path: string) => `chrome-extension://extension/${path}`,
      sendMessage,
      onMessage: {
        addListener: (listener: (typeof listeners)[number]) =>
          listeners.push(listener),
      },
    },
    storage: {
      local: { get: denied, set: denied },
      onChanged: { addListener: denied },
    },
  } as unknown as ExtensionApi;
  await initializeLanguagePreference(api);
  expect(getLanguageState().locale).toBe('zh-CN');
  await writeLanguagePreference(api, 'zh-TW');
  expect(saved).toBe('zh-TW');
  expect(getLanguageState().locale).toBe('zh-TW');
  listeners[0]({
    channel: LANGUAGE_PREFERENCE_CHANNEL,
    type: LANGUAGE_PREFERENCE_CHANGED,
    preference: 'zh-CN',
  });
  expect(getLanguageState().locale).toBe('zh-CN');
  expect(denied).not.toHaveBeenCalled();
  expect(sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      channel: LANGUAGE_PREFERENCE_CHANNEL,
      type: 'language-preference-write',
      preference: 'zh-TW',
    }),
  );
});
