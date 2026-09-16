import type { ExtensionStorageArea } from '../hosts/extension/api';
import { mergeEntries, restoreEntries } from './merge';
import {
  entriesEqual,
  equal,
  isRevisionId,
  isSyncCommand,
  record,
  SYNC_HISTORY_LIMIT,
  SYNC_MAX_VERSIONS,
  SYNC_STORAGE_KEY,
  type SyncChoices,
  type SyncCommand,
  type SyncConnection,
  type SyncEntries,
  type SyncPreview,
  type SyncRemoteState,
  type SyncSnapshot,
  type SyncStorageState,
  type SyncVersion,
  validateConnection,
  validateEntries,
  validateRecord,
  validateVersion,
} from './model';
import type { SyncProjection } from './projection';
import { createRecord, mergeRemote } from './versions';
import { WebDavSync } from './webdav';

function emptyState(): SyncStorageState {
  return {
    version: 3,
    deviceId: crypto.randomUUID(),
    connection: null,
    heads: [],
    base: {},
    history: [],
    preview: null,
    commit: null,
    lastSyncedAt: null,
    status: 'disconnected',
    message: '连接后自动同步全部脚本与插件配置。',
    diagnostics: [],
    remoteVersionCount: 0,
  };
}

function previewEntry(entry: import('./model').SyncEntry | null) {
  if (!entry) return null;
  const text = JSON.stringify(entry.value, (_key, value) =>
    typeof value === 'string' && value.startsWith('data:') && value.length > 256
      ? `[媒体内容 ${(value.length / 1024).toFixed(1)} KB]`
      : value,
  );
  return {
    name: entry.name,
    value:
      text.length > 8000
        ? `${text.slice(0, 8000)}\n（预览已截断，完整内容仍保留在同步版本中）`
        : JSON.parse(text),
  };
}

function plan(preview: SyncPreview, choices: SyncChoices = {}) {
  if (!preview.restore)
    return mergeRemote(preview.base, preview.local, preview.remote, choices);
  const entries = restoreEntries(
    { ...preview.remote.entries, ...preview.local },
    preview.restore,
  );
  return {
    entries,
    changes: mergeEntries(preview.local, preview.local, entries).changes,
    unresolved: [],
  };
}

function validateRemote(remote: unknown): asserts remote is SyncRemoteState {
  if (
    !record(remote) ||
    !Array.isArray(remote.heads) ||
    !remote.heads.every(isRevisionId) ||
    !record(remote.conflicts) ||
    typeof remote.count !== 'number' ||
    !Number.isSafeInteger(remote.count)
  )
    throw new Error('同步版本列表记录无效。');
  validateEntries(remote.entries);
  for (const value of Object.values(remote.conflicts)) {
    if (
      !Array.isArray(value) ||
      !value.every(
        (item) =>
          record(item) &&
          isRevisionId(item.id) &&
          typeof item.label === 'string',
      )
    )
      throw new Error('同步冲突记录无效。');
  }
}

export class SyncService {
  private statePromise: Promise<SyncStorageState> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private running = false;
  private transport: { connection: SyncConnection; client: WebDavSync } | null =
    null;

  constructor(
    private readonly storage: ExtensionStorageArea,
    private readonly projection: Pick<
      SyncProjection,
      'readEntries' | 'applyEntries' | 'validate' | 'setOwnership'
    >,
    private readonly createRemote = (connection: SyncConnection) =>
      new WebDavSync(connection),
  ) {}

  private client(connection: SyncConnection) {
    if (!this.transport || !equal(this.transport.connection, connection)) {
      this.transport = { connection, client: this.createRemote(connection) };
    }
    return this.transport.client;
  }

  private state() {
    this.statePromise ??= this.storage.get(SYNC_STORAGE_KEY).then((stored) => {
      const value = stored[SYNC_STORAGE_KEY];
      if (value === undefined) return emptyState();
      if (
        !record(value) ||
        value.version !== 3 ||
        typeof value.deviceId !== 'string' ||
        !Array.isArray(value.heads) ||
        !value.heads.every(isRevisionId) ||
        !Array.isArray(value.history) ||
        !Array.isArray(value.diagnostics) ||
        !Object.hasOwn(value, 'commit')
      ) {
        throw new Error('本机同步记录损坏，已停止同步。');
      }
      validateEntries(value.base);
      if (value.connection !== null) validateConnection(value.connection);
      for (const item of value.history) validateVersion(item);
      if (value.preview) {
        if (!record(value.preview)) throw new Error('同步预览记录损坏。');
        validateConnection(value.preview.connection);
        validateEntries(value.preview.local);
        validateEntries(value.preview.base);
        validateRemote(value.preview.remote);
        if (value.preview.restore) validateEntries(value.preview.restore);
      }
      if (value.commit) {
        if (!record(value.commit)) throw new Error('同步提交记录损坏。');
        if (value.commit.record) validateRecord(value.commit.record);
        validateEntries(value.commit.entries);
        validateEntries(value.commit.local);
      }
      return value as unknown as SyncStorageState;
    });
    return this.statePromise;
  }

  private async save(state: SyncStorageState) {
    await this.storage.set({ [SYNC_STORAGE_KEY]: state });
    this.statePromise = Promise.resolve(state);
  }

  private snapshot(state: SyncStorageState): SyncSnapshot {
    const connection = state.preview?.connection ?? state.connection;
    return {
      connected: Boolean(state.connection),
      connection: connection
        ? { url: connection.url, username: connection.username }
        : null,
      status: this.running ? 'syncing' : state.status,
      message: this.running ? '正在同步…' : state.message,
      lastSyncedAt: state.lastSyncedAt,
      preview: state.preview
        ? {
            id: state.preview.id,
            changes: plan(state.preview).changes.map((change) => ({
              ...change,
              local: previewEntry(change.local),
              remote: previewEntry(change.remote),
              ...(change.alternatives
                ? {
                    alternatives: change.alternatives.map((item) => ({
                      ...item,
                      entry: previewEntry(item.entry),
                    })),
                  }
                : {}),
            })),
            restore: Boolean(state.preview.restore),
          }
        : null,
      history: state.history.map(({ id, at }) => ({ id, at })),
      directory: connection
        ? new URL('card-master-sync/versions-v3/', connection.url).href
        : null,
      diagnostics: state.diagnostics,
      remoteVersionCount: state.remoteVersionCount,
    };
  }

  private checkRemote(remote: SyncRemoteState) {
    this.projection.validate(remote.entries);
    for (const [key, values] of Object.entries(remote.conflicts)) {
      for (const alternative of values)
        this.projection.validate({ [key]: alternative.entry });
    }
  }

  private async showPreview(
    state: SyncStorageState,
    connection: SyncConnection,
    remote: SyncRemoteState,
    local: SyncEntries,
    base: SyncEntries,
    restore: SyncEntries | null = null,
  ) {
    await this.save({
      ...state,
      preview: {
        id: crypto.randomUUID(),
        connection,
        remote,
        local,
        base,
        restore,
      },
      status: 'review',
      message: restore
        ? '请确认恢复内容，当前数据将保留一份历史。'
        : '请查看合并结果后确认同步。',
      diagnostics: [...this.client(connection).diagnostics],
      remoteVersionCount: remote.count,
    });
  }

  private async complete(state: SyncStorageState) {
    const commit = state.commit;
    if (!commit) throw new Error('缺少待完成的同步记录。');
    await this.projection.setOwnership(true);
    const { skipped } = await this.projection.applyEntries(
      commit.entries,
      commit.local,
    );
    const base = { ...commit.entries };
    for (const key of skipped) base[key] = state.base[key] ?? null;
    await this.save({
      ...state,
      base,
      heads: commit.heads,
      commit: null,
      preview: null,
      lastSyncedAt: skipped.size ? state.lastSyncedAt : Date.now(),
      status: skipped.size ? 'pending' : 'synced',
      message: skipped.size
        ? '本机有新的修改，已保留并等待下一次同步。'
        : '已同步当前可见版本，其他设备的新修改将在下次检查时合并。',
      diagnostics: [
        ...(this.transport?.client.diagnostics ?? state.diagnostics),
      ],
    });
  }

  private async commit(
    state: SyncStorageState,
    connection: SyncConnection,
    remote: SyncRemoteState,
    local: SyncEntries,
    entries: SyncEntries,
  ) {
    this.projection.validate(entries);
    const needsVersion =
      remote.heads.length !== 1 ||
      Object.keys(remote.conflicts).length > 0 ||
      !entriesEqual(entries, remote.entries);
    if (needsVersion && remote.count >= SYNC_MAX_VERSIONS)
      throw new Error(
        '同步空间已达到 4096 个版本，请保留目录备份后使用新的同步目录。',
      );
    const revision = needsVersion
      ? await createRecord(state.deviceId, remote, entries)
      : null;
    const backup: SyncVersion = {
      id: crypto.randomUUID(),
      at: Date.now(),
      entries: local,
    };
    const history = [...state.history];
    if (
      !entriesEqual(local, entries) &&
      !entriesEqual(history.at(-1)?.entries ?? {}, local)
    )
      history.push(backup);
    const next: SyncStorageState = {
      ...state,
      connection,
      preview: null,
      history: history.slice(-SYNC_HISTORY_LIMIT),
      commit: {
        record: revision,
        entries,
        heads: revision ? [revision.id] : remote.heads,
        local,
      },
      status: 'pending',
      message: '同步提交待完成。',
      remoteVersionCount: remote.count + (revision ? 1 : 0),
    };
    // Persist the exact content-addressed record before upload; retrying cannot replace a different revision.
    await this.save(next);
    if (revision) await this.client(connection).write(revision);
    await this.complete(next);
  }

  private async recover(state: SyncStorageState) {
    if (!state.commit || !state.connection) return;
    if (state.commit.record) {
      await this.client(state.connection).write(state.commit.record);
      await this.client(state.connection).read(state.commit.heads);
    }
    await this.complete(state);
  }

  private async execute(command: SyncCommand) {
    let state = await this.state();
    if (command.type === 'disconnect') {
      if (state.connection) await this.projection.setOwnership(false);
      await this.save({
        ...emptyState(),
        deviceId: state.deviceId,
        history: state.history,
        message: '已断开同步，本机数据和历史均保留。',
      });
      this.transport = null;
      return;
    }
    if (state.commit) {
      await this.recover(state);
      state = await this.state();
    }
    if (command.type === 'cancel') {
      await this.save({
        ...state,
        preview: null,
        status: state.connection ? 'pending' : 'disconnected',
        message: '已取消预览，本机数据未更改。',
      });
      return;
    }
    if (command.type === 'preview') {
      const connection = validateConnection(command.connection);
      const client = this.client(connection);
      await client.test();
      const [remote, local] = await Promise.all([
        client.read(),
        this.projection.readEntries(),
      ]);
      this.checkRemote(remote);
      await this.showPreview(state, connection, remote, local, {});
      return;
    }
    if (command.type === 'confirm') {
      const preview = state.preview;
      if (!preview || preview.id !== command.previewId)
        throw new Error('预览已过期，请重新读取。');
      const [remote, local] = await Promise.all([
        this.client(preview.connection).read(preview.remote.heads),
        this.projection.readEntries(),
      ]);
      this.checkRemote(remote);
      if (
        !equal(remote.heads, preview.remote.heads) ||
        !equal(local, preview.local)
      ) {
        await this.showPreview(
          state,
          preview.connection,
          remote,
          local,
          preview.base,
          preview.restore,
        );
        return;
      }
      const merged = plan(preview, command.choices);
      if (merged.unresolved.length)
        throw new Error('请选择每项冲突要保留的版本。');
      await this.commit(
        { ...state, base: preview.base, heads: preview.remote.heads },
        preview.connection,
        remote,
        local,
        merged.entries,
      );
      return;
    }
    if (command.type === 'restore') {
      if (!state.connection) throw new Error('请先连接同步空间。');
      const history = state.history.find(
        (item) => item.id === command.versionId,
      );
      if (!history) throw new Error('找不到该历史版本。');
      const [remote, local] = await Promise.all([
        this.client(state.connection).read(state.heads),
        this.projection.readEntries(),
      ]);
      this.checkRemote(remote);
      await this.showPreview(
        state,
        state.connection,
        remote,
        local,
        state.base,
        history.entries,
      );
      return;
    }
    if (!state.connection || state.preview) return;
    const [remote, local] = await Promise.all([
      this.client(state.connection).read(state.heads),
      this.projection.readEntries(),
    ]);
    this.checkRemote(remote);
    const merged = mergeRemote(state.base, local, remote);
    if (merged.unresolved.length) {
      await this.showPreview(
        state,
        state.connection,
        remote,
        local,
        state.base,
      );
      return;
    }
    if (
      remote.heads.length === 1 &&
      entriesEqual(merged.entries, remote.entries) &&
      entriesEqual(local, merged.entries)
    ) {
      await this.save({
        ...state,
        base: merged.entries,
        heads: remote.heads,
        lastSyncedAt: Date.now(),
        status: 'synced',
        message: '已同步当前可见版本。',
        diagnostics: [...this.client(state.connection).diagnostics],
        remoteVersionCount: remote.count,
      });
    } else
      await this.commit(state, state.connection, remote, local, merged.entries);
  }

  request(command: SyncCommand): Promise<SyncSnapshot> {
    if (!isSyncCommand(command))
      return Promise.reject(new Error('同步操作格式无效。'));
    if (command.type === 'read')
      return this.state().then((state) => this.snapshot(state));
    const task = this.queue.then(async () => {
      this.running = true;
      try {
        await this.execute(command);
      } catch (error) {
        const state = await this.state();
        await this.save({
          ...state,
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : '同步失败，本机数据已保留。',
          diagnostics: [
            ...(this.transport?.client.diagnostics ?? state.diagnostics),
          ],
        });
      } finally {
        this.running = false;
      }
      return this.snapshot(await this.state());
    });
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}
