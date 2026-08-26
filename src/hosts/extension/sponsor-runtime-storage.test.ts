import { describe, expect, it, vi } from 'vitest';
import {
  SPONSOR_STORAGE_CHANGED,
  SPONSOR_STORAGE_REQUEST,
  sponsorStorageNamespaceKey,
} from './sponsor-runtime';
import { SponsorRuntimeStorageService } from './sponsor-runtime-storage';

function storageArea() {
  const values: Record<string, unknown> = {};
  return {
    values,
    get: vi.fn(async (key?: string | string[]) => {
      if (typeof key === 'string') return { [key]: values[key] };
      if (Array.isArray(key)) {
        return Object.fromEntries(key.map((entry) => [entry, values[entry]]));
      }
      return { ...values };
    }),
    set: vi.fn(async (next: Record<string, unknown>) => {
      Object.assign(values, next);
    }),
    remove: vi.fn(async (key: string | string[]) => {
      for (const entry of Array.isArray(key) ? key : [key]) {
        delete values[entry];
      }
    }),
    setAccessLevel: vi.fn(async () => undefined),
  };
}

function harness() {
  const local = storageArea();
  const sync = storageArea();
  const sendMessage = vi.fn(async () => undefined);
  const service = new SponsorRuntimeStorageService({
    runtime: {
      id: 'card-master',
      sendMessage,
    },
    storage: { local, sync },
  } as never);
  return { local, sync, sendMessage, service };
}

describe('Sponsor runtime storage', () => {
  it('isolates Bilibili and YouTube values in each storage area', async () => {
    const test = harness();

    await test.service.set('bilibili', 'sync', { userID: 'bili-user' });
    await test.service.set('youtube', 'sync', { userID: 'youtube-user' });
    await test.service.set('youtube', 'local', { skipCount: 3 });

    await expect(
      test.service.request('bilibili', 'sync', 'get', 'userID'),
    ).resolves.toEqual({ userID: 'bili-user' });
    await expect(
      test.service.request('youtube', 'sync', 'get', 'userID'),
    ).resolves.toEqual({ userID: 'youtube-user' });
    expect(test.sync.values).toEqual({
      [sponsorStorageNamespaceKey('bilibili', 'sync')]: {
        userID: 'bili-user',
      },
      [sponsorStorageNamespaceKey('youtube', 'sync')]: {
        userID: 'youtube-user',
      },
    });
    expect(test.local.values).toEqual({
      [sponsorStorageNamespaceKey('youtube', 'local')]: { skipCount: 3 },
    });
  });

  it('emits scoped changes and resets only the requested runtime', async () => {
    const test = harness();
    await test.service.set('bilibili', 'sync', { enabled: true });
    await test.service.set('youtube', 'sync', { enabled: true });

    await test.service.reset('bilibili');

    expect(test.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SPONSOR_STORAGE_CHANGED,
        runtimeId: 'bilibili',
        areaName: 'sync',
        changes: {
          enabled: { oldValue: true },
        },
      }),
    );
    await expect(
      test.service.request('bilibili', 'sync', 'get', null),
    ).resolves.toEqual({});
    await expect(
      test.service.request('youtube', 'sync', 'get', null),
    ).resolves.toEqual({ enabled: true });
  });

  it('rejects storage bridge requests from foreign extensions', () => {
    const test = harness();
    const sendResponse = vi.fn();

    expect(
      test.service.handlesMessage(
        {
          type: SPONSOR_STORAGE_REQUEST,
          runtimeId: 'youtube',
          areaName: 'sync',
          operation: 'get',
        },
        { id: 'foreign-extension' } as chrome.runtime.MessageSender,
        sendResponse,
      ),
    ).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Sponsor runtime storage access was rejected.',
    });
  });
});
