import { expect, it, vi } from 'vitest';
import {
  LANGUAGE_PREFERENCE_CHANGED,
  LANGUAGE_PREFERENCE_CHANNEL,
  LANGUAGE_PREFERENCE_KEY,
} from '../../localization/preferences';
import type { ExtensionBackgroundApi, ExtensionMessageListener } from './api';
import { installLanguagePreferenceBridge } from './language-preference-background';

function harness() {
  let handle: ExtensionMessageListener = () => {};
  let changed: (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => void = () => {};
  const stored: Record<string, unknown> = {
    [LANGUAGE_PREFERENCE_KEY]: 'zh-CN',
    secret: 'private',
  };
  const api = {
    runtime: {
      id: 'extension',
      onMessage: {
        addListener: (listener: typeof handle) => {
          handle = listener;
        },
      },
      sendMessage: vi.fn(async () => undefined),
    },
    storage: {
      local: {
        get: vi.fn(async () => stored),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(stored, values);
        }),
      },
      onChanged: {
        addListener: (listener: typeof changed) => {
          changed = listener;
        },
      },
    },
    tabs: {
      query: vi.fn(async () => [{ id: 7 }]),
      sendMessage: vi.fn(async () => undefined),
    },
  } as unknown as ExtensionBackgroundApi;
  installLanguagePreferenceBridge(api);
  const request = (type: string, preference?: unknown) =>
    new Promise<unknown>((resolve) => {
      handle(
        { channel: LANGUAGE_PREFERENCE_CHANNEL, type, preference },
        { id: 'extension' },
        resolve,
      );
    });
  return {
    api,
    request,
    handle: (...args: Parameters<typeof handle>) => handle(...args),
    changed: (...args: Parameters<typeof changed>) => changed(...args),
  };
}

it('exposes only language preference and persists validated values on behalf of content scripts', async () => {
  const { api, request } = harness();
  await expect(request('language-preference-read')).resolves.toEqual({
    preference: 'zh-CN',
  });
  await expect(request('language-preference-write', 'zh-TW')).resolves.toEqual({
    preference: 'zh-TW',
  });
  expect(api.storage.local.set).toHaveBeenCalledWith({
    [LANGUAGE_PREFERENCE_KEY]: 'zh-TW',
  });
  await expect(
    request('language-preference-write', 'invalid'),
  ).resolves.toEqual({ error: 'Invalid language preference.' });
  expect(api.storage.local.set).toHaveBeenCalledOnce();
});

it('ignores foreign senders and broadcasts only the public preference to open frames', async () => {
  const { api, handle, changed } = harness();
  const respond = vi.fn();
  expect(
    handle(
      {
        channel: LANGUAGE_PREFERENCE_CHANNEL,
        type: 'language-preference-read',
      },
      { id: 'foreign' },
      respond,
    ),
  ).toBeUndefined();
  expect(respond).not.toHaveBeenCalled();
  changed({ [LANGUAGE_PREFERENCE_KEY]: { newValue: 'zh-TW' } }, 'local');
  await vi.waitFor(() => expect(api.tabs.sendMessage).toHaveBeenCalled());
  const message = {
    channel: LANGUAGE_PREFERENCE_CHANNEL,
    type: LANGUAGE_PREFERENCE_CHANGED,
    preference: 'zh-TW',
  };
  expect(api.runtime.sendMessage).toHaveBeenCalledWith(message);
  expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, message);
});
