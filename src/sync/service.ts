import type { ExtensionStorageArea } from '../hosts/extension/api';
import { mergeEntries, restoreEntries } from './merge';
import {
  entriesEqual,
  equal,
  isSyncCommand,
  record,
  SYNC_HISTORY_LIMIT,
  SYNC_STORAGE_KEY,
  type SyncChoices,
  type SyncCommand,
  type SyncConnection,
  type SyncDocument,
  type SyncEntries,
  type SyncPreview,
  type SyncSnapshot,
  type SyncStorageState,
  type SyncVersion,
  validateConnection,
  validateDocument,
  validateEntries,
  validateVersion,
} from './model';
import type { SyncProjection } from './projection';
import { type RemoteSnapshot, SyncRemoteChanged, WebDavSync } from './webdav';

function emptyState(): SyncStorageState {
  return {
    version: 2,
    connection: null,
    spaceId: null,
    base: {},
    history: [],
    preview: null,
    commit: null,
    lastSyncedAt: null,
    status: 'disconnected',
    message: '连接后自动同步全部脚本与插件配置。',
  };
}

function version(document: SyncVersion): SyncVersion {
  return { id: document.id, at: document.at, entries: document.entries };
}

function plan(preview: SyncPreview, choices: SyncChoices = {}) {
  if (!preview.restore)
    return mergeEntries(
      preview.base,
      preview.local,
      preview.remote?.entries ?? {},
      choices,
    );
  const target = restoreEntries(
    { ...preview.remote?.entries, ...preview.local },
    preview.restore,
  );
  return {
    entries: target,
    changes: mergeEntries(preview.local, preview.local, target).changes,
    unresolved: [],
  };
}

export class SyncService {
  private statePromise: Promise<SyncStorageState> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private running = false;

  constructor(
    private readonly storage: ExtensionStorageArea,
    private readonly projection: Pick<
      SyncProjection,
      'readEntries' | 'applyEntries' | 'validate' | 'setOwnership'
    >,
    private readonly createRemote = (connection: SyncConnection) =>
      new WebDavSync(connection),
  ) {}

  private state() {
    this.statePromise ??= this.storage.get(SYNC_STORAGE_KEY).then((stored) => {
      const value = stored[SYNC_STORAGE_KEY];
      if (value === undefined) return emptyState();
      if (
        !record(value) ||
        value.version !== 2 ||
        !Array.isArray(value.history) ||
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
        if (value.preview.restore) validateEntries(value.preview.restore);
        if (value.preview.remote) validateDocument(value.preview.remote);
      }
      if (value.commit) {
        if (!record(value.commit)) throw new Error('同步提交记录损坏。');
        validateDocument(value.commit.document);
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
            changes: plan(state.preview).changes,
            restore: Boolean(state.preview.restore),
          }
        : null,
      history: state.history.map(({ id, at }) => ({ id, at })),
    };
  }

  private assertSpace(state: SyncStorageState, remote: RemoteSnapshot) {
    if (
      state.spaceId &&
      (!remote.document || state.spaceId !== remote.document.spaceId)
    ) {
      throw new Error(
        '远端同步空间被删除或替换，已暂停同步。请重新连接并确认合并，本机数据仍在。',
      );
    }
    if (remote.document) {
      this.projection.validate(remote.document.entries);
      for (const item of remote.document.history)
        this.projection.validate(item.entries);
    }
  }

  private async showPreview(
    state: SyncStorageState,
    connection: SyncConnection,
    remote: RemoteSnapshot,
    local: SyncEntries,
    base: SyncEntries,
    restore: SyncEntries | null = null,
  ) {
    const preview: SyncPreview = {
      id: crypto.randomUUID(),
      connection,
      etag: remote.etag,
      remote: remote.document,
      local,
      base,
      restore,
    };
    const next: SyncStorageState = {
      ...state,
      preview,
      status: 'review',
      message: restore
        ? '请确认恢复内容，当前数据将保留一份历史。'
        : '请查看合并结果后确认同步。',
    };
    await this.save(next);
    return this.snapshot(next);
  }

  private async complete(state: SyncStorageState) {
    const commit = state.commit;
    if (!commit) throw new Error('缺少待完成的同步记录。');
    await this.projection.setOwnership(true);
    const { skipped } = await this.projection.applyEntries(
      commit.document.entries,
      commit.local,
    );
    const base = { ...commit.document.entries };
    for (const key of skipped) base[key] = state.base[key] ?? null;
    await this.save({
      ...state,
      base,
      spaceId: commit.document.spaceId,
      commit: null,
      preview: null,
      lastSyncedAt: skipped.size ? state.lastSyncedAt : Date.now(),
      status: skipped.size ? 'pending' : 'synced',
      message: skipped.size
        ? '本机有新的修改，已保留并等待下一次同步。'
        : '全部脚本与配置已同步。',
    });
  }

  private async commit(
    state: SyncStorageState,
    connection: SyncConnection,
    remote: RemoteSnapshot,
    local: SyncEntries,
    entries: SyncEntries,
  ) {
    this.projection.validate(entries);
    const changed =
      !remote.document || !entriesEqual(entries, remote.document.entries);
    const document: SyncDocument = changed
      ? {
          format: 'card-master-sync',
          version: 2,
          spaceId: remote.document?.spaceId ?? crypto.randomUUID(),
          id: crypto.randomUUID(),
          at: Date.now(),
          entries,
          history: [
            ...(remote.document?.history ?? []),
            ...(remote.document ? [version(remote.document)] : []),
          ].slice(-SYNC_HISTORY_LIMIT),
        }
      : (remote.document as SyncDocument);
    validateDocument(document);
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
      commit: { document, local, etag: remote.etag },
      status: 'pending',
      message: '同步提交待完成。',
    };
    // Persist before network or local effects so worker termination can resume safely.
    await this.save(next);
    if (changed) {
      try {
        await this.createRemote(connection).write(document, remote.etag);
      } catch (error) {
        if (error instanceof SyncRemoteChanged) {
          await this.save({ ...state, preview: null, commit: null });
        }
        throw error;
      }
    }
    await this.complete(next);
  }

  private async recover(state: SyncStorageState) {
    if (!state.commit || !state.connection) return;
    const client = this.createRemote(state.connection);
    const remote = await client.read();
    const pending = state.commit;
    if (
      remote.document?.id === pending.document.id ||
      remote.document?.history.some((item) => item.id === pending.document.id)
    ) {
      await this.complete(state);
    } else if (remote.etag === pending.etag) {
      await client.write(pending.document, pending.etag);
      await this.complete(state);
    } else {
      // An unacknowledged write must never overwrite an unrelated newer revision.
      await this.save({
        ...state,
        commit: null,
        status: 'pending',
        message: '远端已更新，将重新合并。',
      });
    }
  }

  private async execute(command: SyncCommand) {
    let state = await this.state();
    if (command.type === 'disconnect') {
      if (state.connection) await this.projection.setOwnership(false);
      await this.save({
        ...emptyState(),
        history: state.history,
        message: '已断开同步，本机数据和历史均保留。',
      });
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
      const client = this.createRemote(connection);
      await client.test();
      const [remote, local] = await Promise.all([
        client.read(),
        this.projection.readEntries(),
      ]);
      this.assertSpace({ ...state, spaceId: null }, remote);
      await this.showPreview(state, connection, remote, local, {});
      return;
    }
    if (command.type === 'confirm') {
      const preview = state.preview;
      if (!preview || preview.id !== command.previewId)
        throw new Error('预览已过期，请重新读取。');
      const [remote, local] = await Promise.all([
        this.createRemote(preview.connection).read(),
        this.projection.readEntries(),
      ]);
      this.assertSpace(
        { ...state, spaceId: preview.remote?.spaceId ?? null },
        remote,
      );
      if (remote.etag !== preview.etag || !equal(local, preview.local)) {
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
        {
          ...state,
          base: preview.base,
          spaceId: preview.remote?.spaceId ?? null,
        },
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
        this.createRemote(state.connection).read(),
        this.projection.readEntries(),
      ]);
      this.assertSpace(state, remote);
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
      this.createRemote(state.connection).read(),
      this.projection.readEntries(),
    ]);
    this.assertSpace(state, remote);
    const merged = mergeEntries(
      state.base,
      local,
      remote.document?.entries ?? {},
    );
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
      remote.document &&
      entriesEqual(merged.entries, remote.document.entries) &&
      entriesEqual(local, merged.entries)
    ) {
      await this.save({
        ...state,
        base: merged.entries,
        lastSyncedAt: Date.now(),
        status: 'synced',
        message: '全部脚本与配置已同步。',
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
