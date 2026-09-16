import { describe, expect, it } from 'vitest';
import {
  defaultNewTabPreferences,
  NEW_TAB_PREFERENCES_STORAGE_KEY,
  NEW_TAB_SYNC_STORAGE_KEY,
  NewTabPreferencesRepository,
} from '../../new-tab/application/preferences';
import { type Json, SYNC_OWNER_KEY } from '../../sync/model';
import type { ExtensionBackgroundApi, ExtensionStorageArea } from './api';
import { sponsorStorageNamespaceKey } from './sponsor-runtime';
import { SponsorRuntimeStorageService } from './sponsor-runtime-storage';
import {
  takeVendorStorageOwnership,
  vendorSyncSettings,
} from './sync-vendor-settings';

function area(initial: Record<string, unknown> = {}) {
  const values = structuredClone(initial);
  const storage = {
    get: async (query: unknown) => {
      if (query === null) return structuredClone(values);
      const keys =
        typeof query === 'string'
          ? [query]
          : Array.isArray(query)
            ? query
            : Object.keys(query as object);
      return structuredClone(
        Object.fromEntries(
          keys.filter((key) => key in values).map((key) => [key, values[key]]),
        ),
      );
    },
    set: async (items: Record<string, unknown>) => {
      Object.assign(values, structuredClone(items));
    },
    remove: async (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys)
        delete values[key];
    },
  } as ExtensionStorageArea;
  return { values, storage };
}

describe('WebDAV storage ownership and vendor credentials', () => {
  it('keeps WebDAV preferences authoritative and disconnecting does not restore stale browser data', async () => {
    const local = area({
      [NEW_TAB_PREFERENCES_STORAGE_KEY]: defaultNewTabPreferences(),
    });
    const sync = area({
      [NEW_TAB_SYNC_STORAGE_KEY]: {
        ...defaultNewTabPreferences(),
        showClock: true,
      },
    });
    const repository = new NewTabPreferencesRepository(
      local.storage,
      sync.storage,
    );
    await repository.setWebdavOwnership(true);
    await repository.mutate((current) => ({ ...current, showClock: false }));
    expect((await repository.read()).showClock).toBe(false);
    expect(
      (sync.values[NEW_TAB_SYNC_STORAGE_KEY] as { showClock: boolean })
        .showClock,
    ).toBe(true);
    await repository.setWebdavOwnership(false);
    expect((await repository.read()).showClock).toBe(false);
    expect(await repository.runtimeStorage()).toBe(local.storage);
  });

  it('moves existing vendor preferences locally and exports neither credentials nor entitlements', async () => {
    const key = sponsorStorageNamespaceKey('bilibili', 'sync');
    const local = area();
    const sync = area({
      [key]: {
        userID: 'private-id',
        isVip: true,
        darkMode: true,
        skipCount: 20,
      },
      'card-master.cat-catch.mqttPassword': 'private-mqtt-password',
      'card-master.cat-catch.aria2RpcToken': 'private-aria-token',
      'card-master.cat-catch.playbackRate': 2,
    });
    const api = {
      storage: { local: local.storage, sync: sync.storage },
      runtime: { sendMessage: async () => undefined },
    } as unknown as ExtensionBackgroundApi;
    const repository = new NewTabPreferencesRepository(
      local.storage,
      sync.storage,
    );
    const sponsor = new SponsorRuntimeStorageService(api);
    await takeVendorStorageOwnership(api);
    await repository.setWebdavOwnership(true);
    const adapters = vendorSyncSettings(api, repository, sponsor);
    const exported = Object.fromEntries(
      await Promise.all(
        adapters.map(async (adapter) => [adapter.key, await adapter.read()]),
      ),
    );
    expect(JSON.stringify(exported)).not.toContain('private-');
    expect(JSON.stringify(exported)).not.toContain('isVip');
    expect(exported['sponsor-bilibili']).toEqual({ darkMode: true });
    const adapter = adapters.find((item) => item.key === 'sponsor-bilibili');
    if (!adapter) throw new Error('Missing adapter');
    await adapter.apply(
      { darkMode: false },
      exported['sponsor-bilibili'] as Json,
    );
    expect(local.values[key]).toMatchObject({
      darkMode: false,
      userID: 'private-id',
      isVip: true,
    });
    expect(sync.values[key]).toMatchObject({ darkMode: true });
    expect(local.values[SYNC_OWNER_KEY]).toBe(true);
  });
});
