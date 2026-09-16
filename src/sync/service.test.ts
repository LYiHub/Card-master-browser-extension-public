import { describe, expect, it, vi } from 'vitest';
import type { ExtensionStorageArea } from '../hosts/extension/api';
import {
  entriesEqual,
  SYNC_STORAGE_KEY,
  type SyncConnection,
  type SyncEntries,
  type SyncSnapshot,
} from './model';
import { SyncService } from './service';
import { memoryWebDav } from './test-server';
import { WebDavSync } from './webdav';

const connection: SyncConnection = {
  url: 'https://sync.example/dav/',
  username: 'tester',
  password: 'example-test-password',
};
const item = (value: string) => ({ name: value, value });

function harness() {
  const server = memoryWebDav();
  const client = (value: SyncConnection) =>
    new WebDavSync(value, server.fetcher);
  const device = (initial: SyncEntries) => {
    let local = structuredClone(initial);
    const values: Record<string, unknown> = {};
    const storage = {
      get: async () => structuredClone(values),
      set: async (update: Record<string, unknown>) => {
        Object.assign(values, structuredClone(update));
      },
    } as ExtensionStorageArea;
    let failApplication = false;
    const projection = {
      readEntries: async () => structuredClone(local),
      validate() {},
      setOwnership: vi.fn(async () => undefined),
      applyEntries: vi.fn(async (next: SyncEntries, before: SyncEntries) => {
        if (failApplication)
          throw new Error('simulated interrupted application');
        if (!entriesEqual(local, before) && !entriesEqual(local, next))
          return { skipped: new Set(Object.keys(local)) };
        local = structuredClone(next);
        return { skipped: new Set<string>() };
      }),
    };
    const service = new SyncService(storage, projection, client);
    return {
      service,
      projection,
      storage,
      values,
      read: () => local,
      edit: (next: SyncEntries) => {
        local = next;
      },
      fail: (value: boolean) => {
        failApplication = value;
      },
      restart: () => new SyncService(storage, projection, client),
    };
  };
  return { ...server, device, client, remote: () => client(connection).read() };
}

async function connect(service: SyncService, choices = {}) {
  const preview = await service.request({ type: 'preview', connection });
  expect(preview.status).toBe('review');
  return confirm(service, preview, choices);
}

function confirm(service: SyncService, state: SyncSnapshot, choices = {}) {
  if (!state.preview) throw new Error('Expected a preview');
  return service.request({
    type: 'confirm',
    previewId: state.preview.id,
    choices,
  });
}

describe('immutable WebDAV multi-device synchronization without ETag', () => {
  it('retains both first uploads when two devices initialize an empty directory concurrently', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    const b = test.device({ 'script:b': item('B') });
    const pa = await a.service.request({ type: 'preview', connection });
    const pb = await b.service.request({ type: 'preview', connection });
    test.gateWrites(2);
    await Promise.all([confirm(a.service, pa), confirm(b.service, pb)]);
    expect((await test.remote()).entries).toEqual({
      'script:a': item('A'),
      'script:b': item('B'),
    });
    await a.service.request({ type: 'run' });
    await b.service.request({ type: 'run' });
    expect(entriesEqual(a.read(), b.read())).toBe(true);
  });
  it('requires confirmation and preserves cloud scripts when a new device is empty', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    expect((await connect(a.service)).status).toBe('synced');
    const b = test.device({});
    const preview = await b.service.request({ type: 'preview', connection });
    expect(test.puts()).toBe(1);
    expect(b.read()).toEqual({});
    expect((await b.service.request({ type: 'run' })).status).toBe('review');
    expect((await confirm(b.service, preview)).status).toBe('synced');
    expect(b.read()['script:a']).toEqual(item('A'));
    expect((await test.remote()).entries['script:a']).toEqual(item('A'));
  });

  it('preserves genuinely simultaneous independent uploads and converges', async () => {
    const test = harness();
    const initial = { 'script:a': item('A'), 'script:b': item('B') };
    const a = test.device(initial);
    const b = test.device(initial);
    await connect(a.service);
    await connect(b.service);
    a.edit({ ...initial, 'script:a': item('A changed') });
    b.edit({ ...initial, 'script:b': item('B changed') });
    test.gateWrites(2);
    await Promise.all([
      a.service.request({ type: 'run' }),
      b.service.request({ type: 'run' }),
    ]);
    const concurrent = await test.remote();
    expect(concurrent.heads).toHaveLength(2);
    expect(concurrent.conflicts).toEqual({});
    expect(concurrent.entries).toMatchObject({
      'script:a': item('A changed'),
      'script:b': item('B changed'),
    });
    await a.service.request({ type: 'run' });
    await b.service.request({ type: 'run' });
    expect(entriesEqual(a.read(), b.read())).toBe(true);
    expect((await test.remote()).heads).toHaveLength(1);
    for (const [, init] of test.fetcher.mock.calls) {
      expect(new Headers(init?.headers).has('If-Match')).toBe(false);
      expect(new Headers(init?.headers).has('If-None-Match')).toBe(false);
    }
  });

  it('shows all three concurrent versions to a fresh device and records the explicit resolution', async () => {
    const test = harness();
    const initial = { 'script:a': item('base') };
    const devices = [
      test.device(initial),
      test.device(initial),
      test.device(initial),
    ];
    for (const device of devices) await connect(device.service);
    devices.forEach((device, index) => {
      device.edit({ 'script:a': item(`edit-${index}`) });
    });
    test.gateWrites(3);
    await Promise.all(
      devices.map((device) => device.service.request({ type: 'run' })),
    );
    const fresh = test.device({});
    const preview = await fresh.service.request({
      type: 'preview',
      connection,
    });
    const conflict = preview.preview?.changes.find(
      (change) => change.key === 'script:a',
    );
    expect(conflict?.alternatives).toHaveLength(3);
    const selected = conflict?.alternatives?.find(
      (alternative) => alternative.entry?.value === 'edit-1',
    );
    if (!selected) throw new Error('Missing concurrent version');
    expect(
      (await confirm(fresh.service, preview, { 'script:a': selected.id }))
        .status,
    ).toBe('synced');
    expect((await test.remote()).conflicts).toEqual({});
    expect(fresh.read()['script:a']?.value).toBe('edit-1');
  });

  it('preserves delete/edit conflicts instead of selecting by wall-clock timestamps', async () => {
    const test = harness();
    const initial = { 'script:a': item('base') };
    const a = test.device(initial);
    const b = test.device(initial);
    await connect(a.service);
    await connect(b.service);
    a.edit({});
    b.edit({ 'script:a': item('edited') });
    test.gateWrites(2);
    await Promise.all([
      a.service.request({ type: 'run' }),
      b.service.request({ type: 'run' }),
    ]);
    const conflict = await a.service.request({ type: 'run' });
    expect(conflict.preview?.changes[0].alternatives).toHaveLength(2);
    await confirm(a.service, conflict, { 'script:a': 'local' });
    expect((await test.remote()).entries['script:a']).toBeNull();
  });

  it('does not write new versions or rotate history when unchanged, including tombstones', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    await connect(a.service);
    a.edit({});
    await a.service.request({ type: 'run' });
    const puts = test.puts();
    await a.service.request({ type: 'run' });
    await a.service.request({ type: 'run' });
    expect(test.puts()).toBe(puts);
  });

  it('invalidates stale local or remote confirmation choices', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    await connect(a.service);
    const b = test.device({ 'script:a': item('B') });
    const preview = await b.service.request({ type: 'preview', connection });
    b.edit({ 'script:a': item('B newest') });
    const refreshed = await confirm(b.service, preview, {
      'script:a': 'remote',
    });
    expect(refreshed.preview?.id).not.toBe(preview.preview?.id);
    a.edit({ 'script:a': item('A newest') });
    await a.service.request({ type: 'run' });
    const again = await confirm(b.service, refreshed, { 'script:a': 'remote' });
    expect(again.preview?.id).not.toBe(refreshed.preview?.id);
    expect(b.read()['script:a']).toEqual(item('B newest'));
  });

  it('recovers after an interrupted upload and local application without losing another writer', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    await connect(a.service);
    a.edit({ 'script:a': item('changed') });
    test.options.partialUpload = true;
    expect((await a.service.request({ type: 'run' })).status).toBe('error');
    expect(a.values[SYNC_STORAGE_KEY]).toHaveProperty('commit.record');
    // An interrupted draft does not prevent another device from reading committed history.
    expect((await test.remote()).entries['script:a']).toEqual(item('A'));
    test.options.partialUpload = false;
    a.fail(true);
    expect((await a.restart().request({ type: 'run' })).status).toBe('error');
    a.fail(false);
    expect((await a.restart().request({ type: 'run' })).status).toBe('synced');
    expect((await test.remote()).entries['script:a']).toEqual(item('changed'));
  });

  it('previews restoration, records a new version, and retains replaced data', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    await connect(a.service);
    const b = test.device({ 'script:a': item('A') });
    await connect(b.service);
    a.edit({ 'script:a': item('updated') });
    await a.service.request({ type: 'run' });
    const synced = await b.service.request({ type: 'run' });
    const prior = synced.history.at(-1);
    if (!prior) throw new Error('Missing backup');
    const preview = await b.service.request({
      type: 'restore',
      versionId: prior.id,
    });
    expect(preview.preview?.restore).toBe(true);
    expect(b.read()['script:a']).toEqual(item('updated'));
    const before = [...test.files.keys()];
    await confirm(b.service, preview);
    expect((await test.remote()).entries['script:a']).toEqual(item('A'));
    expect([...test.files.keys()]).toEqual(expect.arrayContaining(before));
  });

  it('does not treat missing history or corrupt files as deletion of local data', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    await connect(a.service);
    const path = [...test.files.keys()].find((key) => key.includes('/rev-'));
    if (!path) throw new Error('Missing version');
    test.files.delete(path);
    expect((await a.service.request({ type: 'run' })).status).toBe('error');
    test.files.set(path, '{broken');
    expect((await a.restart().request({ type: 'run' })).status).toBe('error');
    expect(a.read()['script:a']).toEqual(item('A'));
    expect(test.puts()).toBe(1);
  });

  it('queues disconnect and keeps credentials out of snapshots and diagnostic messages', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    const connected = await connect(a.service);
    expect(JSON.stringify(connected)).not.toContain(connection.password);
    expect(connected.diagnostics.join('\n')).toContain('未返回 ETag');
    const first = a.service.request({ type: 'run' });
    const second = a.service.request({ type: 'disconnect' });
    await first;
    expect((await second).connected).toBe(false);
    expect(a.read()['script:a']).toEqual(item('A'));
  });
});
