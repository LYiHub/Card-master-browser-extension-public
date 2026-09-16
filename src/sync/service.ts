import type { ExtensionBackgroundApi } from '../hosts/extension/api';
import { mergeEntries } from './merge';
import {
  SYNC_STORAGE_KEY,
  type SyncCommand,
  type SyncConnection,
  type SyncDocument,
  type SyncSnapshot,
  type SyncStorageState,
  type SyncVersion,
  validateConnection,
  validateDocument,
} from './model';
import type { SyncProjection } from './projection';
import { SyncRemoteChanged, WebDavSync } from './webdav';

function emptyState(): SyncStorageState {
  return {
    version: 1,
    connection: null,
    spaceId: null,
    base: {},
    history: [],
    pending: null,
    lastSyncedAt: null,
    status: 'disconnected',
    message: '尚未连接同步空间。',
  };
}

function publicConnection(connection: SyncConnection | null) {
  if (!connection) return null;
  const { password: _password, ...safe } = connection;
  return safe;
}

function version(document: SyncDocument): SyncVersion {
  return { id: document.id, at: document.at, entries: document.entries };
}

export class SyncService {
  private statePromise: Promise<SyncStorageState> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private active: Promise<SyncSnapshot> | null = null;

  constructor(
    private readonly api: ExtensionBackgroundApi,
    private readonly projection: SyncProjection,
  ) {}

  private async state() {
    if (!this.statePromise) {
      this.statePromise = this.api.storage.local
        .get(SYNC_STORAGE_KEY)
        .then((stored) => {
          const candidate = stored[SYNC_STORAGE_KEY];
          if (
            !candidate ||
            typeof candidate !== 'object' ||
            Array.isArray(candidate)
          )
            return emptyState();
          try {
            const value = candidate as SyncStorageState;
            if (
              value.version !== 1 ||
              (value.connection && !value.connection.password)
            )
              return emptyState();
            return { ...emptyState(), ...value };
          } catch {
            return emptyState();
          }
        });
    }
    return this.statePromise;
  }

  private async save(state: SyncStorageState) {
    await this.api.storage.local.set({ [SYNC_STORAGE_KEY]: state });
    this.statePromise = Promise.resolve(state);
  }

  private snapshot(state: SyncStorageState): SyncSnapshot {
    return {
      connected: Boolean(state.connection),
      connection: publicConnection(state.connection),
      status: state.status,
      message: state.message,
      lastSyncedAt: state.lastSyncedAt,
      preview: state.pending
        ? {
            id: state.pending.id,
            changes: state.pending.changes,
            restore: false,
          }
        : null,
      history: state.history.map(({ id, at }) => ({ id, at })),
    };
  }

  private async remote(connection: SyncConnection) {
    return new WebDavSync(connection).read();
  }

  private async preview(
    state: SyncStorageState,
    connection: SyncConnection,
    mode: 'connect' | 'sync' = 'sync',
  ) {
    const remoteClient = new WebDavSync(connection);
    if (mode === 'connect') await remoteClient.test();
    const [{ document, etag }, local] = await Promise.all([
      remoteClient.read(),
      this.projection.readEntries(connection.scopes),
    ]);
    const base = document ? document.entries : {};
    const merged = mergeEntries(base, local, document?.entries ?? {});
    const pending = {
      id: crypto.randomUUID(),
      remote: document,
      etag,
      local,
      merged: merged.entries,
      changes: merged.changes,
    };
    const next: SyncStorageState = {
      ...state,
      connection,
      spaceId: document?.spaceId ?? state.spaceId,
      pending: merged.unresolved.length > 0 ? pending : null,
      base,
      status: merged.unresolved.length > 0 ? 'review' : 'pending',
      message:
        merged.unresolved.length > 0
          ? `有 ${merged.unresolved.length} 项修改需要确认。`
          : '正在保存合并结果…',
    };
    await this.save(next);
    if (merged.unresolved.length > 0) return this.snapshot(next);
    return this.finish(next, pending);
  }

  private async finish(
    state: SyncStorageState,
    pending: NonNullable<SyncStorageState['pending']>,
  ): Promise<SyncSnapshot> {
    if (!state.connection) throw new Error('同步连接已断开。');
    const client = new WebDavSync(state.connection);
    const old = pending.remote;
    const document: SyncDocument = {
      format: 'card-master-sync',
      version: 1,
      spaceId: old?.spaceId ?? state.spaceId ?? crypto.randomUUID(),
      id: crypto.randomUUID(),
      at: Date.now(),
      entries: pending.merged,
      history: [...(old?.history ?? []), ...(old ? [version(old)] : [])].slice(
        -3,
      ),
    };
    validateDocument(document);
    try {
      await client.write(document, pending.etag);
    } catch (error) {
      if (error instanceof SyncRemoteChanged) {
        const next = {
          ...state,
          status: 'pending' as const,
          message: '另一台设备刚更新了数据，正在重新合并。',
          pending: null,
        };
        await this.save(next);
        return this.sync(next);
      }
      throw error;
    }
    const applied = await this.projection.applyEntries(
      pending.merged,
      pending.local,
      state.connection.scopes,
    );
    const base = { ...pending.merged };
    for (const key of applied.skipped) base[key] = pending.local[key] ?? null;
    const next: SyncStorageState = {
      ...state,
      spaceId: document.spaceId,
      base,
      pending: null,
      history: [...document.history].slice(-3),
      lastSyncedAt: Date.now(),
      status: applied.skipped.size > 0 ? 'review' : 'synced',
      message:
        applied.skipped.size > 0
          ? '本机有刚刚发生的修改，下一次同步会继续处理。'
          : '已同步。',
    };
    await this.save(next);
    return this.snapshot(next);
  }

  private async sync(state: SyncStorageState): Promise<SyncSnapshot> {
    if (!state.connection) return this.snapshot(state);
    const [{ document, etag }, local] = await Promise.all([
      this.remote(state.connection),
      this.projection.readEntries(state.connection.scopes),
    ]);
    const base = state.base ?? {};
    const merged = mergeEntries(base, local, document?.entries ?? {});
    const pending = {
      id: crypto.randomUUID(),
      remote: document,
      etag,
      local,
      merged: merged.entries,
      changes: merged.changes,
    };
    if (merged.unresolved.length > 0) {
      const next = {
        ...state,
        pending,
        status: 'review' as const,
        message: `有 ${merged.unresolved.length} 项修改需要确认。`,
      };
      await this.save(next);
      return this.snapshot(next);
    }
    const next = {
      ...state,
      pending,
      status: 'syncing' as const,
      message: '正在同步…',
    };
    await this.save(next);
    return this.finish(next, pending);
  }

  request(command: SyncCommand) {
    if (this.active) return this.active;
    const task = this.queue
      .then(async () => {
        const state = await this.state();
        if (command.type === 'read') return this.snapshot(state);
        if (command.type === 'disconnect') {
          const next = {
            ...emptyState(),
            status: 'disconnected' as const,
            message: '已断开同步，本机数据仍然保留。',
          };
          await this.save(next);
          return this.snapshot(next);
        }
        if (command.type === 'preview')
          return this.preview(
            state,
            validateConnection(command.connection),
            'connect',
          );
        if (command.type === 'confirm') {
          if (!state.pending || state.pending.id !== command.previewId)
            throw new Error('同步预览已过期，请重新读取远端数据。');
          const merged = mergeEntries(
            state.base,
            state.pending.local,
            state.pending.remote?.entries ?? {},
            command.choices,
          );
          if (merged.unresolved.length > 0)
            throw new Error('仍有冲突项目未选择处理方式。');
          return this.finish(
            { ...state, pending: { ...state.pending, merged: merged.entries } },
            { ...state.pending, merged: merged.entries },
          );
        }
        if (command.type === 'restore') {
          if (!state.connection) throw new Error('同步连接已断开。');
          const history = state.history.find(
            (item) => item.id === command.versionId,
          );
          if (!history) throw new Error('找不到要恢复的同步版本。');
          const local = await this.projection.readEntries(
            state.connection.scopes,
          );
          const remote = await this.remote(state.connection);
          const merged = mergeEntries(
            remote.document?.entries ?? {},
            local,
            history.entries,
          );
          if (merged.unresolved.length > 0) {
            const next = {
              ...state,
              pending: {
                id: crypto.randomUUID(),
                remote: remote.document,
                etag: remote.etag,
                local,
                merged: merged.entries,
                changes: merged.changes,
              },
              status: 'review' as const,
              message: '恢复版本与当前修改有冲突，请确认。',
            };
            await this.save(next);
            return this.snapshot(next);
          }
          return this.finish(
            {
              ...state,
              pending: {
                id: crypto.randomUUID(),
                remote: remote.document,
                etag: remote.etag,
                local,
                merged: merged.entries,
                changes: merged.changes,
              },
            },
            {
              id: '',
              remote: remote.document,
              etag: remote.etag,
              local,
              merged: merged.entries,
              changes: merged.changes,
            },
          );
        }
        return this.sync(state);
      })
      .catch(async (error) => {
        const state = await this.state();
        const next = {
          ...state,
          status: 'error' as const,
          message: error instanceof Error ? error.message : String(error),
        };
        await this.save(next);
        throw error;
      });
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    this.active = task;
    void task.finally(() => {
      if (this.active === task) this.active = null;
    });
    return task;
  }
}
