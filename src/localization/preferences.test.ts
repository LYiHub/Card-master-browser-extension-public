import { afterEach, expect, it, vi } from 'vitest';
import type { ExtensionApi } from '../hosts/extension/api';
import { getLanguageState, setLanguagePreference } from './locale';
import {
  initializeLanguagePreference,
  LANGUAGE_PREFERENCE_KEY,
  writeLanguagePreference,
} from './preferences';

afterEach(() => setLanguagePreference('auto'));

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
