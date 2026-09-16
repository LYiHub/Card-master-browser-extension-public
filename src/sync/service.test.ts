import { describe, expect, it, vi } from 'vitest';
import type { ExtensionStorageArea } from '../hosts/extension/api';
import {
  entriesEqual,
  SYNC_STORAGE_KEY,
  type SyncConnection,
  type SyncDocument,
  type SyncEntries,
  type SyncSnapshot,
} from './model';
import { SyncService } from './service';
import { WebDavSync } from './webdav';

const connection: SyncConnection = {
  url: 'https://sync.example/dav/',
  username: 'tester',
  password: 'example-test-password',
};
const item = (value: string) => ({ name: value, value });

function harness() {
  const files = new Map<string, { body: string; tag: string }>();
  let revision = 0;
  let puts = 0;
  const fetcher = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      const current = files.get(path);
      const headers = new Headers(init?.headers);
      if (init?.method === 'MKCOL') return new Response(null, { status: 201 });
      if (init?.method === 'DELETE') {
        files.delete(path);
        return new Response(null, { status: 204 });
      }
      if (init?.method === 'PUT') {
        if (
          (headers.has('If-Match') &&
            headers.get('If-Match') !== current?.tag) ||
          (headers.get('If-None-Match') === '*' && current)
        )
          return new Response(null, { status: 412 });
        const value = { body: String(init.body), tag: `"${++revision}"` };
        files.set(path, value);
        if (path.endsWith('workspace.json')) puts++;
        return new Response(null, {
          status: 201,
          headers: { etag: value.tag },
        });
      }
      return current
        ? new Response(current.body, { headers: { etag: current.tag } })
        : new Response(null, { status: 404 });
    },
  );
  const client = (value: SyncConnection) => new WebDavSync(value, fetcher);
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
  return {
    device,
    files,
    client,
    fetcher,
    puts: () => puts,
    remote: () =>
      JSON.parse(
        files.get('https://sync.example/dav/card-master-sync/workspace.json')
          ?.body ?? 'null',
      ) as SyncDocument,
  };
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

describe('WebDAV multi-device synchronization', () => {
  it('requires preview confirmation and preserves cloud scripts when a new device is empty', async () => {
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
    expect(test.remote().entries['script:a']).toEqual(item('A'));
  });

  it('merges independent offline edits and surfaces edit/delete conflicts', async () => {
    const test = harness();
    const initial = { 'script:a': item('A'), 'script:b': item('B') };
    const a = test.device(initial);
    const b = test.device(initial);
    await connect(a.service);
    await connect(b.service);
    a.edit({ ...initial, 'script:a': item('A changed') });
    b.edit({ ...initial, 'script:b': item('B changed') });
    await a.service.request({ type: 'run' });
    await b.service.request({ type: 'run' });
    await a.service.request({ type: 'run' });
    expect(entriesEqual(a.read(), b.read())).toBe(true);
    a.edit({ ...a.read(), 'script:a': null });
    b.edit({ ...b.read(), 'script:a': item('B edits A') });
    await a.service.request({ type: 'run' });
    const conflict = await b.service.request({ type: 'run' });
    expect(conflict.preview?.changes[0].kind).toBe('conflict');
    expect(b.read()['script:a']).toEqual(item('B edits A'));
    await confirm(b.service, conflict, { 'script:a': 'local' });
    expect(test.remote().entries['script:a']).toEqual(item('B edits A'));
  });

  it('does not write or rotate history when nothing changes, including tombstones', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    await connect(a.service);
    a.edit({});
    await a.service.request({ type: 'run' });
    const puts = test.puts();
    const history = test.remote().history;
    await a.service.request({ type: 'run' });
    await a.service.request({ type: 'run' });
    expect(test.puts()).toBe(puts);
    expect(test.remote().history).toEqual(history);
  });

  it('invalidates a confirmation after either device edits and never applies stale choices', async () => {
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
    expect(b.read()['script:a']).toEqual(item('B newest'));
  });

  it('recovers after a committed remote write and interrupted local application', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    await connect(a.service);
    const b = test.device({});
    const preview = await b.service.request({ type: 'preview', connection });
    b.fail(true);
    expect((await confirm(b.service, preview)).status).toBe('error');
    expect(b.values[SYNC_STORAGE_KEY]).toHaveProperty('commit.document');
    b.fail(false);
    const recovered = await b.restart().request({ type: 'run' });
    expect(recovered.status).toBe('synced');
    expect(b.read()['script:a']).toEqual(item('A'));
  });

  it('previews history restoration and preserves the state being replaced', async () => {
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
    await confirm(b.service, preview);
    expect(b.read()['script:a']).toEqual(item('A'));
    expect(test.remote().entries['script:a']).toEqual(item('A'));
  });

  it('preserves local data for missing, corrupt, or unsupported remote workspaces', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    await connect(a.service);
    const path = 'https://sync.example/dav/card-master-sync/workspace.json';
    test.files.delete(path);
    expect((await a.service.request({ type: 'run' })).status).toBe('error');
    test.files.set(path, { body: '{broken', tag: '"broken"' });
    expect((await a.service.request({ type: 'run' })).status).toBe('error');
    expect(a.read()['script:a']).toEqual(item('A'));
    expect(test.puts()).toBe(1);
  });

  it('queues disconnect instead of confusing it with another in-flight request', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    await connect(a.service);
    const first = a.service.request({ type: 'run' });
    const second = a.service.request({ type: 'disconnect' });
    await first;
    expect((await second).connected).toBe(false);
    expect(a.read()['script:a']).toEqual(item('A'));
    expect(test.remote().entries['script:a']).toEqual(item('A'));
  });

  it('enforces server revisions and keeps credentials out of public snapshots', async () => {
    const test = harness();
    const a = test.device({ 'script:a': item('A') });
    const result = await connect(a.service);
    expect(JSON.stringify(result)).not.toContain(connection.password);
    const client = test.client(connection);
    const stale = await client.read();
    await client.write({ ...test.remote(), id: 'newer' }, stale.etag);
    await expect(
      client.write({ ...test.remote(), id: 'stale' }, stale.etag),
    ).rejects.toThrow('另一台设备');
  });
});
