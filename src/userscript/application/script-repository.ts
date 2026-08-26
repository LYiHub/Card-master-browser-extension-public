import {
  parseUserscriptMetadata,
  userscriptDisplayDescription,
  userscriptDisplayName,
} from '../domain/metadata';
import {
  type InstalledUserscript,
  isUserscriptPresentation,
  restoreInstalledScriptOrder,
  type UserscriptManagerConfig,
  type UserscriptPresentation,
  type UserscriptSource,
} from '../domain/types';
import { userscriptInstallationDiagnostics } from './preflight';
import { resolveUserscriptPresentation } from './presentation';

export type ScriptRepositoryListener = (
  scripts: readonly InstalledUserscript[],
) => void;

export type ScriptRepositoryQuery = {
  query: string | null;
  offset: number;
  limit: number;
};

export type ScriptRepositoryPage = {
  scripts: InstalledUserscript[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

export interface ScriptRepository {
  list(): Promise<InstalledUserscript[]>;
  get(scriptId: string): Promise<InstalledUserscript | null>;
  query(options: ScriptRepositoryQuery): Promise<ScriptRepositoryPage>;
  upsert(script: InstalledUserscript): Promise<InstalledUserscript[]>;
  remove(scriptId: string): Promise<InstalledUserscript[]>;
  reorder(orderedIds: readonly string[]): Promise<InstalledUserscript[]>;
  replaceAll(
    scripts: readonly InstalledUserscript[],
  ): Promise<InstalledUserscript[]>;
  subscribe(listener: ScriptRepositoryListener): () => void;
}

export type ScriptRepositoryTransaction<Result> = (
  scripts: readonly InstalledUserscript[],
) =>
  | {
      scripts: readonly InstalledUserscript[];
      result: Result;
    }
  | Promise<{
      scripts: readonly InstalledUserscript[];
      result: Result;
    }>;

export interface TransactionalScriptRepository extends ScriptRepository {
  transact<Result>(operation: ScriptRepositoryTransaction<Result>): Promise<{
    scripts: InstalledUserscript[];
    result: Result;
    committed: boolean;
  }>;
}

export interface StringStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  subscribe?(key: string, listener: () => void): () => void;
}

export type StoredScript = {
  id: string;
  source: UserscriptSource;
  presentation?: UserscriptPresentation;
  manager: UserscriptManagerConfig;
};

type StoredLibrary = {
  version: 1;
  scripts: StoredScript[];
};

type QuarantinedScript = {
  reason: string;
  record: unknown;
};

type ScriptQuarantine = {
  version: 1;
  records: QuarantinedScript[];
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((candidate) => typeof candidate === 'string')
  );
}

function storedSource(value: unknown): value is UserscriptSource {
  return (
    record(value) &&
    exactKeys(value, ['code', 'installedAt', 'updatedAt'], ['origin']) &&
    typeof value.code === 'string' &&
    (value.origin === undefined || typeof value.origin === 'string') &&
    typeof value.installedAt === 'number' &&
    Number.isFinite(value.installedAt) &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt)
  );
}

function storedManager(value: unknown): value is UserscriptManagerConfig {
  return (
    record(value) &&
    exactKeys(value, [
      'enabled',
      'checkForUpdates',
      'userMatches',
      'userIncludes',
      'userExcludeMatches',
      'userExcludes',
    ]) &&
    typeof value.enabled === 'boolean' &&
    typeof value.checkForUpdates === 'boolean' &&
    stringArray(value.userMatches) &&
    stringArray(value.userIncludes) &&
    stringArray(value.userExcludeMatches) &&
    stringArray(value.userExcludes)
  );
}

export function isStoredScript(value: unknown): value is StoredScript {
  return (
    record(value) &&
    exactKeys(value, ['id', 'source', 'manager'], ['presentation']) &&
    typeof value.id === 'string' &&
    storedSource(value.source) &&
    (value.presentation === undefined ||
      isUserscriptPresentation(value.presentation)) &&
    storedManager(value.manager)
  );
}

export function storedScript(script: InstalledUserscript): StoredScript {
  return {
    id: script.id,
    source: structuredClone(script.source),
    ...(script.presentation
      ? { presentation: structuredClone(script.presentation) }
      : {}),
    manager: structuredClone(script.manager),
  };
}

export function hydrateScript(script: StoredScript): InstalledUserscript {
  const parsed = parseUserscriptMetadata(script.source.code);
  if (!parsed.metadata) {
    throw new Error(
      `已存储脚本 ${script.id} 的元数据无效：${parsed.diagnostics.map((item) => item.message).join(' ')}`,
    );
  }
  const hydrated: InstalledUserscript = {
    kind: 'userscript',
    id: script.id,
    source: structuredClone(script.source),
    presentation: script.presentation
      ? resolveUserscriptPresentation(script.presentation)
      : undefined,
    metadata: parsed.metadata,
    manager: structuredClone(script.manager),
    runtime: {
      tabId: 0,
      frameId: 0,
      instanceId: null,
      status: script.manager.enabled ? 'idle' : 'sleeping',
      commands: [],
      pendingRefresh: false,
    },
  };
  const errors = userscriptInstallationDiagnostics(hydrated).filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (errors.length > 0) {
    throw new Error(
      `已存储脚本 ${script.id} 未通过预检：${errors.map((item) => item.message).join(' ')}`,
    );
  }
  return hydrated;
}

function parseLibrary(serialized: string) {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new Error('用户脚本仓库包含无效 JSON。', {
      cause: error,
    });
  }
  if (
    !record(value) ||
    !exactKeys(value, ['version', 'scripts']) ||
    value.version !== 1 ||
    !Array.isArray(value.scripts)
  ) {
    throw new Error(
      `不支持的用户脚本仓库版本：${record(value) ? String(value.version) : '未知'}`,
    );
  }

  const scripts: InstalledUserscript[] = [];
  const rejected: QuarantinedScript[] = [];
  for (const [index, candidate] of value.scripts.entries()) {
    if (!isStoredScript(candidate)) {
      rejected.push({
        reason: `第 ${index + 1} 条记录的持久化结构无效`,
        record: candidate,
      });
      continue;
    }
    try {
      scripts.push(hydrateScript(candidate));
    } catch (error) {
      rejected.push({
        reason: error instanceof Error ? error.message : String(error),
        record: candidate,
      });
    }
  }
  return { scripts, rejected };
}

function searchableScriptText(script: InstalledUserscript) {
  return [
    script.id,
    userscriptDisplayName(script.metadata),
    userscriptDisplayDescription(script.metadata),
    script.metadata.name,
    script.metadata.namespace,
    script.metadata.version,
    script.metadata.author,
    ...Object.values(script.metadata.localized).flatMap((metadata) => [
      metadata.name ?? '',
      metadata.description ?? '',
    ]),
    ...script.metadata.matches,
    ...script.metadata.includes,
    ...script.metadata.tags,
  ]
    .join('\n')
    .toLocaleLowerCase();
}

export function queryInstalledUserscripts(
  scripts: readonly InstalledUserscript[],
  { query, offset, limit }: ScriptRepositoryQuery,
): ScriptRepositoryPage {
  const normalizedQuery = query?.trim().toLocaleLowerCase() ?? '';
  const matched = normalizedQuery
    ? scripts.filter((script) =>
        searchableScriptText(script).includes(normalizedQuery),
      )
    : [...scripts];
  return {
    scripts: structuredClone(matched.slice(offset, offset + limit)),
    total: matched.length,
    offset,
    limit,
    hasMore: offset + limit < matched.length,
  };
}

export class StorageScriptRepository implements TransactionalScriptRepository {
  private readonly listeners = new Set<ScriptRepositoryListener>();
  private mutationQueue: Promise<unknown> = Promise.resolve();
  private readonly unsubscribeStorage?: () => void;
  private cache: InstalledUserscript[] | null = null;
  private loadPromise: Promise<InstalledUserscript[]> | null = null;

  constructor(
    private readonly storage: StringStorage,
    private readonly key: string,
    private readonly seed: readonly InstalledUserscript[],
  ) {
    this.unsubscribeStorage = storage.subscribe?.(key, () => {
      this.cache = null;
      this.loadPromise = null;
      void this.list().then((scripts) => this.publish(scripts));
    });
  }

  async list() {
    return structuredClone(await this.load());
  }

  async get(scriptId: string) {
    const script = (await this.load()).find(
      (candidate) => candidate.id === scriptId,
    );
    return script ? structuredClone(script) : null;
  }

  async query(options: ScriptRepositoryQuery) {
    return queryInstalledUserscripts(await this.load(), options);
  }

  private async load() {
    if (this.cache) return this.cache;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.read().finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async read() {
    const serialized = await this.storage.getItem(this.key);
    if (!serialized) {
      const seeded = structuredClone([...this.seed]);
      await this.write(seeded);
      this.cache = seeded;
      return seeded;
    }

    const { scripts, rejected } = parseLibrary(serialized);
    if (rejected.length > 0) {
      await this.writeQuarantine(rejected);
      console.error(
        `已隔离 ${rejected.length} 条无效用户脚本仓库记录：${rejected.map(({ reason }) => reason).join(' ')}`,
      );
      await this.write(scripts);
    }
    this.cache = scripts;
    return scripts;
  }

  upsert(script: InstalledUserscript) {
    return this.update((scripts) => {
      const index = scripts.findIndex(
        (candidate) => candidate.id === script.id,
      );
      if (index < 0) return [...scripts, script];
      return scripts.map((candidate, candidateIndex) =>
        candidateIndex === index ? script : candidate,
      );
    });
  }

  remove(scriptId: string) {
    return this.update((scripts) =>
      scripts.filter((script) => script.id !== scriptId),
    );
  }

  reorder(orderedIds: readonly string[]) {
    return this.update((scripts) =>
      restoreInstalledScriptOrder(scripts, orderedIds),
    );
  }

  replaceAll(scripts: readonly InstalledUserscript[]) {
    return this.update(() => structuredClone([...scripts]));
  }

  transact<Result>(operation: ScriptRepositoryTransaction<Result>) {
    const pending = this.mutationQueue.then(async () => {
      const current = await this.list();
      const transaction = await operation(current);
      const committed = transaction.scripts !== current;
      const next = committed
        ? structuredClone([...transaction.scripts])
        : current;
      if (committed) {
        await this.write(next);
        this.cache = structuredClone(next);
        this.publish(next);
      }
      return {
        scripts: structuredClone(next),
        result: transaction.result,
        committed,
      };
    });
    this.mutationQueue = pending.catch(() => undefined);
    return pending;
  }

  subscribe(listener: ScriptRepositoryListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose() {
    this.unsubscribeStorage?.();
    this.listeners.clear();
    this.cache = null;
    this.loadPromise = null;
  }

  private update(
    operation: (scripts: InstalledUserscript[]) => InstalledUserscript[],
  ) {
    return this.transact((scripts) => ({
      scripts: operation([...scripts]),
      result: undefined,
    })).then(({ scripts }) => scripts);
  }

  private async write(scripts: readonly InstalledUserscript[]) {
    const library: StoredLibrary = {
      version: 1,
      scripts: scripts.map(storedScript),
    };
    await this.storage.setItem(this.key, JSON.stringify(library));
  }

  private async writeQuarantine(records: QuarantinedScript[]) {
    const quarantine: ScriptQuarantine = {
      version: 1,
      records: structuredClone(records),
    };
    await this.storage.setItem(
      `${this.key}.quarantine`,
      JSON.stringify(quarantine),
    );
  }

  private publish(scripts: readonly InstalledUserscript[]) {
    for (const listener of this.listeners) listener(structuredClone(scripts));
  }
}
