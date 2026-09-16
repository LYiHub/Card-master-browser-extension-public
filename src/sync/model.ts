export const SYNC_STORAGE_KEY = 'card-master.sync.v1';
export const SYNC_OWNER_KEY = 'card-master.sync.new-tab-owner';
export const SYNC_CHANNEL = 'card-master:sync';
export const SYNC_MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
export const SYNC_MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type SyncEntry = { name: string; value: Json };
export type SyncEntries = Record<string, SyncEntry | null>;
export type SyncScope = 'scripts' | 'preferences' | 'newTab';
export type SyncConnection = {
  url: string;
  username: string;
  password: string;
  scopes: SyncScope[];
};
export type SyncVersion = { id: string; at: number; entries: SyncEntries };
export type SyncDocument = SyncVersion & {
  format: 'card-master-sync';
  version: 1;
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
export type SyncStorageState = {
  version: 1;
  connection: SyncConnection | null;
  spaceId: string | null;
  base: SyncEntries;
  history: SyncVersion[];
  pending: {
    id: string;
    remote: SyncDocument | null;
    etag: string | null;
    local: SyncEntries;
    merged: SyncEntries;
    changes: SyncChange[];
  } | null;
  lastSyncedAt: number | null;
  status: SyncSnapshot['status'];
  message: string;
};
export type SyncCommand =
  | { type: 'read' | 'run' | 'disconnect' }
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

export function scopeFor(key: string): SyncScope {
  return key.startsWith('script:')
    ? 'scripts'
    : key.startsWith('newTab:')
      ? 'newTab'
      : 'preferences';
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
        /^(script|theme|speed|deck|newTab):.{1,1024}$/u.test(key) &&
        (entry === null ||
          (record(entry) &&
            Object.keys(entry).length === 2 &&
            typeof entry.name === 'string' &&
            entry.name.length <= 512 &&
            json(entry.value))),
    )
  )
    throw new Error('同步内容格式无效，本机数据未被替换。');
  if (
    new TextEncoder().encode(JSON.stringify(value)).length >
    SYNC_MAX_SNAPSHOT_BYTES
  ) {
    throw new Error('同步内容超过 4 MB，请缩小同步范围。');
  }
}

export function validateDocument(
  value: unknown,
): asserts value is SyncDocument {
  if (
    !record(value) ||
    value.format !== 'card-master-sync' ||
    value.version !== 1 ||
    typeof value.spaceId !== 'string' ||
    !/^[\w-]{1,80}$/.test(value.spaceId) ||
    !Array.isArray(value.history) ||
    value.history.length > 3
  ) {
    throw new Error('远端同步格式不受支持，请确认各设备使用相同的新版本。');
  }
  for (const item of [value, ...value.history]) {
    if (
      !record(item) ||
      typeof item.id !== 'string' ||
      !/^[\w-]{1,80}$/.test(item.id) ||
      typeof item.at !== 'number' ||
      !Number.isFinite(item.at)
    ) {
      throw new Error('同步版本记录无效。');
    }
    validateEntries(item.entries);
  }
}

export function validateConnection(value: unknown): SyncConnection {
  if (
    !record(value) ||
    typeof value.url !== 'string' ||
    typeof value.username !== 'string' ||
    typeof value.password !== 'string' ||
    !value.password ||
    value.password.length > 4096 ||
    value.username.length > 512 ||
    value.username.includes(':') ||
    !Array.isArray(value.scopes) ||
    value.scopes.length === 0 ||
    !value.scopes.every((scope) =>
      ['scripts', 'preferences', 'newTab'].includes(scope),
    )
  ) {
    throw new Error(
      '请填写有效的 WebDAV 地址、账号和应用密码，并选择同步内容。',
    );
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
    scopes: [...new Set(value.scopes)] as SyncScope[],
  };
}
