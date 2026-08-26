import { describe, expect, it, vi } from 'vitest';

import { userscriptCardMedia } from '../../lib/userscript-deck-media';
import { INITIAL_USERSCRIPTS } from '../fixtures';
import { DEFAULT_USERSCRIPT_PRESENTATION } from './presentation';
import {
  hydrateScript,
  StorageScriptRepository,
  type StoredScript,
} from './script-repository';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('StorageScriptRepository', () => {
  it('seeds an empty repository and rehydrates metadata from source', async () => {
    const storage = new MemoryStorage();
    const repository = new StorageScriptRepository(
      storage,
      'scripts',
      INITIAL_USERSCRIPTS.slice(0, 2),
    );

    const first = await repository.list();
    const second = await repository.list();

    expect(first).toHaveLength(2);
    expect(second[0].metadata.name).toBe(first[0].metadata.name);
    expect(second[0].source.code).toBe(first[0].source.code);
    expect(second[0].runtime.commands).toEqual([]);
    expect(
      Object.keys(JSON.parse(storage.getItem('scripts') ?? '').scripts[0]),
    ).toEqual(['id', 'source', 'manager']);
  });

  it('rejects unknown repository versions instead of migrating silently', async () => {
    const storage = new MemoryStorage();
    storage.setItem('scripts', JSON.stringify({ version: 99, scripts: [] }));
    const repository = new StorageScriptRepository(storage, 'scripts', []);

    await expect(repository.list()).rejects.toThrow('不支持的用户脚本仓库版本');
  });

  it('quarantines an invalid record without blocking the remaining library', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'scripts',
      JSON.stringify({
        version: 1,
        scripts: [
          {
            id: 'broken',
            source: {
              code: 'console.log(1)',
              installedAt: 1,
              updatedAt: 1,
            },
            manager: {
              enabled: true,
              checkForUpdates: true,
              userMatches: [],
              userIncludes: [],
              userExcludeMatches: [],
              userExcludes: [],
            },
          },
        ],
      }),
    );
    const repository = new StorageScriptRepository(storage, 'scripts', []);

    await expect(repository.list()).resolves.toEqual([]);
    expect(JSON.parse(storage.getItem('scripts') ?? '').scripts).toEqual([]);
    expect(JSON.parse(storage.getItem('scripts.quarantine') ?? '')).toEqual({
      version: 1,
      records: [
        {
          reason: expect.stringContaining('元数据无效'),
          record: expect.objectContaining({ id: 'broken' }),
        },
      ],
    });
  });

  it('supports asynchronous host storage', async () => {
    const storage = new MemoryStorage();
    const repository = new StorageScriptRepository(
      {
        getItem: async (key) => storage.getItem(key),
        setItem: async (key, value) => storage.setItem(key, value),
      },
      'scripts',
      INITIAL_USERSCRIPTS.slice(0, 1),
    );

    await expect(repository.list()).resolves.toHaveLength(1);
  });

  it('reuses the hydrated library for direct reads and bounded queries', async () => {
    const storage = new MemoryStorage();
    const getItem = vi.fn(async (key: string) => storage.getItem(key));
    const repository = new StorageScriptRepository(
      {
        getItem,
        setItem: async (key, value) => storage.setItem(key, value),
      },
      'scripts',
      INITIAL_USERSCRIPTS,
    );

    const script = await repository.get(INITIAL_USERSCRIPTS[0].id);
    const page = await repository.query({
      query: '夜幕',
      offset: 0,
      limit: 10,
    });
    await repository.list();

    expect(script?.id).toBe(INITIAL_USERSCRIPTS[0].id);
    expect(page).toMatchObject({
      total: 1,
      hasMore: false,
      scripts: [{ id: INITIAL_USERSCRIPTS[1].id }],
    });
    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it('persists the assigned card presentation with the script record', async () => {
    const storage = new MemoryStorage();
    const seed = {
      ...INITIAL_USERSCRIPTS[0],
      presentation: {
        ...DEFAULT_USERSCRIPT_PRESENTATION,
      },
    };
    const repository = new StorageScriptRepository(storage, 'scripts', [seed]);

    const [rehydrated] = await repository.list();
    const [restored] = await repository.list();

    expect(rehydrated.presentation).toEqual(seed.presentation);
    expect(restored.presentation).toEqual(seed.presentation);
    expect(
      JSON.parse(storage.getItem('scripts') ?? '').scripts[0],
    ).toMatchObject({
      presentation: seed.presentation,
    });
  });

  it('resolves a stored bundled presentation to its current poster accent', () => {
    const seed = INITIAL_USERSCRIPTS[0];
    const stored: StoredScript = {
      id: seed.id,
      source: structuredClone(seed.source),
      manager: structuredClone(seed.manager),
      presentation: {
        accent: '#c98ccf',
        media: {
          kind: 'video',
          video: 'userscript-deck/video/userscript-cards/02.mp4',
        },
      },
    };

    expect(hydrateScript(stored).presentation).toEqual({
      accent: userscriptCardMedia('02').accent,
      media: {
        kind: 'video',
        video: 'userscript-deck/video/userscript-cards/02.mp4',
      },
    });
  });

  it('serializes atomic upsert, remove, and reorder mutations', async () => {
    const repository = new StorageScriptRepository(
      new MemoryStorage(),
      'scripts',
      INITIAL_USERSCRIPTS.slice(0, 2),
    );
    const third = INITIAL_USERSCRIPTS[2];

    await repository.upsert(third);
    await repository.reorder([third.id, INITIAL_USERSCRIPTS[0].id]);
    const removed = await repository.remove(INITIAL_USERSCRIPTS[1].id);

    expect(removed.map((script) => script.id)).toEqual([
      third.id,
      INITIAL_USERSCRIPTS[0].id,
    ]);
  });

  it('runs revision checks and writes against the latest queued library', async () => {
    const repository = new StorageScriptRepository(
      new MemoryStorage(),
      'scripts',
      INITIAL_USERSCRIPTS.slice(0, 2),
    );
    const original = INITIAL_USERSCRIPTS[0];
    const changed = {
      ...original,
      source: {
        ...original.source,
        code: original.source.code.replace(
          '// @version     2.4.1',
          '// @version     2.4.2',
        ),
      },
    };
    await repository.upsert(changed);

    const transaction = await repository.transact((current) => {
      const latest = current.find((script) => script.id === original.id);
      if (latest?.source.code !== original.source.code) {
        return { scripts: current, result: 'stale' as const };
      }
      return {
        scripts: current.map((script) =>
          script.id === original.id ? original : script,
        ),
        result: 'committed' as const,
      };
    });

    expect(transaction.result).toBe('stale');
    expect(transaction.committed).toBe(false);
    expect(transaction.scripts[0]?.source.code).toContain(
      '// @version     2.4.2',
    );
  });
});
