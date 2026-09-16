export const SYNC_STORAGE_KEY = 'card-master.sync.v2';
export const SYNC_OWNER_KEY = 'card-master.sync.new-tab-owner';
export const SYNC_MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
export const SYNC_MAX_DOCUMENT_BYTES = 257 * 1024 * 1024;
export const SYNC_HISTORY_LIMIT = 3;

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type SyncEntry = { name: string; value: Json };
export type SyncEntries = Record<string, SyncEntry | null>;
export type SyncConnection = {
  url: string;
  username: string;
  password: string;
};
export type SyncVersion = { id: string; at: number; entries: SyncEntries };
export type SyncDocument = SyncVersion & {
  format: 'card-master-sync';
  version: 2;
  spaceId: string;
  history: SyncVersion[];
};
export type SyncChange = {
  key: string;
  name: string;
  kind: 'add' | 'update' | 'delete' | 'conflict';
  local: SyncEntry | null;
  remote: SyncEntry | null;
};
export type SyncChoices = Record<string, 'local' | 'remote'>;
export type SyncSnapshot = {
  connected: boolean;
  connection: Omit<SyncConnection, 'password'> | null;
  status:
    | 'disconnected'
    | 'pending'
    | 'syncing'
    | 'review'
    | 'synced'
    | 'error';
  message: string;
  lastSyncedAt: number | null;
  preview: { id: string; changes: SyncChange[]; restore: boolean } | null;
  history: { id: string; at: number }[];
};
export type SyncPreview = {
  id: string;
  connection: SyncConnection;
  remote: SyncDocument | null;
  etag: string | null;
  local: SyncEntries;
  base: SyncEntries;
  restore: SyncEntries | null;
};
export type SyncCommit = {
  document: SyncDocument;
  local: SyncEntries;
  etag: string | null;
};
export type SyncStorageState = {
  version: 2;
  connection: SyncConnection | null;
  spaceId: string | null;
  base: SyncEntries;
  history: SyncVersion[];
  preview: SyncPreview | null;
  commit: SyncCommit | null;
  lastSyncedAt: number | null;
  status: SyncSnapshot['status'];
  message: string;
};
export type SyncCommand =
  | { type: 'read' | 'run' | 'disconnect' | 'cancel' }
  | { type: 'preview'; connection: SyncConnection }
  | { type: 'confirm'; previewId: string; choices: SyncChoices }
  | { type: 'restore'; versionId: string };
export interface SyncController {
  request(command: SyncCommand): Promise<SyncSnapshot>;
}

export function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    record(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}

export function equal(left: unknown, right: unknown) {
  return canonical(left) === canonical(right);
}
export function entryEqual(
  left: SyncEntry | null | undefined,
  right: SyncEntry | null | undefined,
) {
  return equal(left?.value ?? null, right?.value ?? null);
}
export function entriesEqual(left: SyncEntries, right: SyncEntries) {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].every(
    (key) => entryEqual(left[key], right[key]),
  );
}
export function jsonValue(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
export function withoutRevision<T extends { revision: number }>(value: T): T {
  return { ...value, revision: 0 };
}

function json(value: unknown, depth = 0): value is Json {
  if (depth > 20) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => json(item, depth + 1));
  return (
    record(value) &&
    Object.entries(value).every(
      ([key, item]) =>
        !['__proto__', 'constructor', 'prototype'].includes(key) &&
        json(item, depth + 1),
    )
  );
}

export function validateEntries(value: unknown): asserts value is SyncEntries {
  if (
    !record(value) ||
    Object.keys(value).length > 10_000 ||
    !Object.entries(value).every(
      ([key, entry]) =>
        /^(script|settings):.{1,4096}$/u.test(key) &&
        (entry === null ||
          (record(entry) &&
            Object.keys(entry).length === 2 &&
            typeof entry.name === 'string' &&
            entry.name.length <= 512 &&
            json(entry.value) &&
            entry.value !== null)),
    )
  ) {
    throw new Error('同步内容格式无效，本机数据未被替换。');
  }
  if (
    new TextEncoder().encode(JSON.stringify(value)).length >
    SYNC_MAX_SNAPSHOT_BYTES
  ) {
    throw new Error('同步内容超过 64 MB，已保留本机数据并暂停同步。');
  }
}

export function validateVersion(item: unknown): asserts item is SyncVersion {
  if (
    !record(item) ||
    typeof item.id !== 'string' ||
    !/^[\w-]{1,80}$/.test(item.id) ||
    typeof item.at !== 'number' ||
    !Number.isFinite(item.at) ||
    item.at < 0
  )
    throw new Error('同步版本记录无效。');
  validateEntries(item.entries);
}

export function validateDocument(
  value: unknown,
): asserts value is SyncDocument {
  if (
    !record(value) ||
    value.format !== 'card-master-sync' ||
    value.version !== 2 ||
    typeof value.spaceId !== 'string' ||
    !/^[\w-]{1,80}$/.test(value.spaceId) ||
    !Array.isArray(value.history) ||
    value.history.length > SYNC_HISTORY_LIMIT
  ) {
    throw new Error(
      '远端同步格式不受支持，请将所有设备更新到相同版本后使用新的同步目录。',
    );
  }
  const history = value.history;
  validateVersion(value);
  for (const version of history) validateVersion(version);
}

export function validateConnection(value: unknown): SyncConnection {
  if (
    !record(value) ||
    typeof value.url !== 'string' ||
    value.url.length > 4096 ||
    typeof value.username !== 'string' ||
    !value.username.trim() ||
    value.username.length > 512 ||
    value.username.includes(':') ||
    typeof value.password !== 'string' ||
    !value.password ||
    value.password.length > 4096
  ) {
    throw new Error('请填写 WebDAV 目录地址、账号和应用密码。');
  }
  let url: URL;
  try {
    url = new URL(value.url.trim());
  } catch {
    throw new Error('WebDAV 地址无效。');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      '请使用 HTTPS 目录地址，将账号与应用密码填写在各自的输入框中。',
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return {
    url: url.href,
    username: value.username.trim(),
    password: value.password,
  };
}

export function isSyncCommand(value: unknown): value is SyncCommand {
  if (!record(value)) return false;
  if (['read', 'run', 'disconnect', 'cancel'].includes(String(value.type)))
    return true;
  if (value.type === 'preview') {
    try {
      validateConnection(value.connection);
      return true;
    } catch {
      return false;
    }
  }
  if (value.type === 'restore') return typeof value.versionId === 'string';
  return (
    value.type === 'confirm' &&
    typeof value.previewId === 'string' &&
    record(value.choices) &&
    Object.values(value.choices).every(
      (choice) => choice === 'local' || choice === 'remote',
    )
  );
}
