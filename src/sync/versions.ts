import { mergeEntries } from './merge';
import {
  canonical,
  entryEqual,
  SYNC_MAX_VERSIONS,
  type SyncAlternative,
  type SyncChoices,
  type SyncEntries,
  type SyncRecord,
  type SyncRemoteState,
  validateEntries,
  validateRecord,
} from './model';

async function recordId(payload: Omit<SyncRecord, 'id'>) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical(payload)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function verifyRecord(record: SyncRecord) {
  validateRecord(record);
  const { id, ...payload } = record;
  if (id !== (await recordId(payload)))
    throw new Error('版本内容校验失败，已保留本机数据。');
}

export async function createRecord(
  deviceId: string,
  remote: SyncRemoteState,
  entries: SyncEntries,
): Promise<SyncRecord> {
  const changes: SyncEntries = {};
  for (const key of new Set([
    ...Object.keys(remote.entries),
    ...Object.keys(entries),
  ])) {
    if (!entryEqual(remote.entries[key], entries[key]) || remote.conflicts[key])
      changes[key] = entries[key] ?? null;
  }
  const payload: Omit<SyncRecord, 'id'> = {
    format: 'card-master-sync',
    version: 3,
    deviceId,
    nonce: crypto.randomUUID(),
    at: Date.now(),
    parents: [...remote.heads].sort(),
    changes,
  };
  const record = { ...payload, id: await recordId(payload) };
  validateRecord(record);
  return record;
}

export function resolveVersions(
  records: readonly SyncRecord[],
): SyncRemoteState {
  if (records.length > SYNC_MAX_VERSIONS)
    throw new Error(
      '同步版本超过 4096 个，已暂停读取。请保留目录备份后使用新的同步目录。',
    );
  const byId = new Map(records.map((record) => [record.id, record]));
  if (byId.size !== records.length) throw new Error('同步目录存在重复版本。');
  const children = new Map<string, string[]>();
  const degrees = new Map<string, number>();
  const keys = new Set<string>();
  const ready: string[] = [];
  for (const record of records) {
    validateRecord(record);
    degrees.set(record.id, record.parents.length);
    if (!record.parents.length) ready.push(record.id);
    for (const key of Object.keys(record.changes)) keys.add(key);
    for (const parent of record.parents) {
      if (!byId.has(parent))
        throw new Error('同步历史缺少父版本，请检查目录和代理缓存后重试。');
      const siblings = children.get(parent) ?? [];
      siblings.push(record.id);
      children.set(parent, siblings);
    }
  }
  for (let index = 0; index < ready.length; index++) {
    for (const child of children.get(ready[index]) ?? []) {
      const degree = (degrees.get(child) ?? 0) - 1;
      degrees.set(child, degree);
      if (degree === 0) ready.push(child);
    }
  }
  if (ready.length !== records.length)
    throw new Error('同步历史包含循环引用。');
  const heads = records
    .filter((record) => !children.has(record.id))
    .map((record) => record.id)
    .sort();
  const ancestors = new Map<string, Set<string>>();
  const ancestorsOf = (id: string) => {
    const cached = ancestors.get(id);
    if (cached) return cached;
    const result = new Set<string>();
    const pending = [...(byId.get(id)?.parents ?? [])];
    while (pending.length) {
      const parent = pending.pop();
      if (!parent || result.has(parent)) continue;
      result.add(parent);
      pending.push(...(byId.get(parent)?.parents ?? []));
    }
    ancestors.set(id, result);
    return result;
  };
  const entries: SyncEntries = {};
  const conflicts: SyncRemoteState['conflicts'] = {};
  for (const key of keys) {
    const visited = new Set<string>();
    const writers = new Set<string>();
    const pending = [...heads];
    while (pending.length) {
      const id = pending.pop();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      const record = byId.get(id);
      if (!record) continue;
      if (Object.hasOwn(record.changes, key)) writers.add(id);
      else pending.push(...record.parents);
    }
    const latest = [...writers]
      .filter(
        (id) =>
          ![...writers].some(
            (other) => other !== id && ancestorsOf(other).has(id),
          ),
      )
      .sort();
    const alternatives: SyncAlternative[] = [];
    for (const id of latest) {
      const record = byId.get(id);
      if (!record) continue;
      const entry = record.changes[key];
      if (alternatives.some((item) => entryEqual(item.entry, entry))) continue;
      alternatives.push({
        id,
        entry,
        label: `设备 ${record.deviceId.slice(0, 6)} · ${new Date(record.at).toLocaleString('zh-CN', { hour12: false })}`,
      });
    }
    entries[key] = alternatives[0]?.entry ?? null;
    if (alternatives.length > 1) conflicts[key] = alternatives;
  }
  validateEntries(entries);
  return { heads, entries, conflicts, count: records.length };
}

export function mergeRemote(
  base: SyncEntries,
  local: SyncEntries,
  remote: SyncRemoteState,
  choices: SyncChoices = {},
) {
  const merged = mergeEntries(base, local, remote.entries, choices);
  for (const [key, alternatives] of Object.entries(remote.conflicts)) {
    const change = {
      key,
      name:
        local[key]?.name ??
        alternatives.find((item) => item.entry)?.entry?.name ??
        key,
      kind: 'conflict' as const,
      local: local[key] ?? null,
      remote: remote.entries[key] ?? null,
      alternatives,
    };
    merged.changes = merged.changes.filter((item) => item.key !== key);
    merged.changes.push(change);
    const selected = alternatives.find((item) => item.id === choices[key]);
    if (choices[key] === 'local') merged.entries[key] = local[key] ?? null;
    else if (selected) merged.entries[key] = selected.entry;
  }
  merged.unresolved = merged.changes.filter(
    (change) =>
      change.kind === 'conflict' &&
      !(
        choices[change.key] === 'local' ||
        (change.alternatives
          ? change.alternatives.some((item) => item.id === choices[change.key])
          : choices[change.key] === 'remote')
      ),
  );
  return merged;
}
