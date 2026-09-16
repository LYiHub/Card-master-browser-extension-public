import {
  hydrateScript,
  isStoredScript,
  storedScript,
  type TransactionalScriptRepository,
} from '../userscript/application/script-repository';
import { userscriptIdentity } from '../userscript/domain/metadata';
import type { InstalledUserscript } from '../userscript/domain/types';
import {
  entryEqual,
  equal,
  type Json,
  jsonValue,
  record,
  type SyncEntries,
  type SyncEntry,
  validateEntries,
} from './model';

export type SyncPortableAdapter = {
  key: string;
  name: string;
  read(): Promise<Json>;
  validate(value: Json): void;
  apply(value: Json, expected: Json): Promise<boolean>;
};

export class SyncLocalChanged extends Error {}

export function assertUnchanged(current: unknown, expected: unknown) {
  if (!equal(current, expected))
    throw new SyncLocalChanged('本机配置刚发生变化。');
}

export function syncScriptKey(script: InstalledUserscript) {
  return `script:${encodeURIComponent(userscriptIdentity(script.metadata))}`;
}

function scriptEntry(script: InstalledUserscript): SyncEntry {
  const { id: _id, source, ...portable } = storedScript(script);
  return {
    name: script.metadata.name.slice(0, 512),
    value: jsonValue({
      ...portable,
      source: { ...source, installedAt: 0, updatedAt: 0 },
    }),
  };
}

function decodeScript(
  entry: SyncEntry,
  key: string,
  id = 'sync-validation',
): InstalledUserscript {
  if (!record(entry.value)) throw new Error('同步脚本格式无效。');
  const script = { ...entry.value, id };
  if (!isStoredScript(script)) throw new Error('同步脚本配置不完整。');
  const hydrated = hydrateScript(script);
  if (syncScriptKey(hydrated) !== key)
    throw new Error('同步脚本的身份与源码不一致。');
  return hydrated;
}

export class SyncProjection {
  constructor(
    private readonly repository: TransactionalScriptRepository,
    private readonly commitScripts: (
      previous: InstalledUserscript[],
      next: InstalledUserscript[],
    ) => Promise<unknown>,
    private readonly portable: readonly SyncPortableAdapter[],
    private readonly ownership: (enabled: boolean) => Promise<void>,
  ) {}

  setOwnership(enabled: boolean) {
    return this.ownership(enabled);
  }

  async readEntries(): Promise<SyncEntries> {
    const [scripts, values] = await Promise.all([
      this.repository.list(),
      Promise.all(this.portable.map((adapter) => adapter.read())),
    ]);
    const entries: SyncEntries = Object.fromEntries(
      scripts.map((script) => [syncScriptKey(script), scriptEntry(script)]),
    );
    entries['settings:script-order'] = {
      name: '脚本排序',
      value: scripts.map(syncScriptKey),
    };
    for (const [index, adapter] of this.portable.entries()) {
      entries[`settings:${adapter.key}`] = {
        name: adapter.name,
        value: values[index],
      };
    }
    this.validate(entries);
    return entries;
  }

  validate(entries: SyncEntries) {
    validateEntries(entries);
    for (const [key, entry] of Object.entries(entries)) {
      if (key.startsWith('script:')) {
        if (entry) decodeScript(entry, key);
      } else if (key === 'settings:script-order') {
        if (
          !entry ||
          !Array.isArray(entry.value) ||
          !entry.value.every(
            (id) => typeof id === 'string' && id.startsWith('script:'),
          ) ||
          new Set(entry.value).size !== entry.value.length
        ) {
          throw new Error('同步的脚本排序无效。');
        }
      } else {
        const adapter = this.portable.find(
          (item) => key === `settings:${item.key}`,
        );
        if (!adapter || !entry)
          throw new Error('同步包含无法识别的配置，请更新所有设备后重试。');
        adapter.validate(entry.value);
      }
    }
  }

  async applyEntries(next: SyncEntries, before: SyncEntries) {
    this.validate(next);
    const skipped = new Set<string>();
    const transaction = await this.repository.transact((current) => {
      const scripts = new Map(
        current.map((script) => [syncScriptKey(script), script]),
      );
      for (const [key, desired] of Object.entries(next)) {
        if (!key.startsWith('script:')) continue;
        const existing = scripts.get(key);
        const live = existing ? scriptEntry(existing) : null;
        if (entryEqual(live, desired)) continue;
        if (!entryEqual(live, before[key])) {
          skipped.add(key);
          continue;
        }
        if (!desired) {
          scripts.delete(key);
          continue;
        }
        const script = decodeScript(
          desired,
          key,
          existing?.id ?? `installed-userscript-${crypto.randomUUID()}`,
        );
        script.source.installedAt = existing?.source.installedAt ?? Date.now();
        script.source.updatedAt = Date.now();
        scripts.set(key, script);
      }
      const order = next['settings:script-order']?.value;
      let ordered = [...scripts.values()];
      if (Array.isArray(order)) {
        const originalOrder = current.map(syncScriptKey);
        if (
          equal(originalOrder, before['settings:script-order']?.value) ||
          equal(originalOrder, order)
        ) {
          const rank = new Map(order.map((key, index) => [key, index]));
          ordered = ordered.sort(
            (a, b) =>
              (rank.get(syncScriptKey(a)) ?? order.length) -
              (rank.get(syncScriptKey(b)) ?? order.length),
          );
        } else skipped.add('settings:script-order');
      }
      const changed = !equal(
        current.map(storedScript),
        ordered.map(storedScript),
      );
      return {
        scripts: changed ? ordered : current,
        result: { previous: [...current], changed },
      };
    });
    if (transaction.result.changed)
      await this.commitScripts(
        transaction.result.previous,
        transaction.scripts,
      );
    for (const adapter of this.portable) {
      const key = `settings:${adapter.key}`;
      const desired = next[key];
      if (!desired) continue;
      const current = await adapter.read();
      if (equal(current, desired.value)) continue;
      const expected = before[key]?.value;
      if (expected === undefined || !equal(current, expected)) {
        skipped.add(key);
        continue;
      }
      try {
        if (!(await adapter.apply(desired.value, expected))) skipped.add(key);
      } catch (error) {
        if (!(error instanceof SyncLocalChanged)) throw error;
        skipped.add(key);
      }
    }
    return { skipped };
  }
}
