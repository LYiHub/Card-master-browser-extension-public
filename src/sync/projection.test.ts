import { describe, expect, it, vi } from 'vitest';
import {
  hydrateScript,
  StorageScriptRepository,
  storedScript,
} from '../userscript/application/script-repository';
import { equal, type Json, type SyncEntries } from './model';
import {
  type SyncPortableAdapter,
  SyncProjection,
  syncScriptKey,
} from './projection';

function script(name: string, code = 'console.log(1)') {
  return hydrateScript({
    id: `local-${name}`,
    source: {
      code: `// ==UserScript==\n// @name ${name}\n// @namespace tests\n// @version 1\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\n${code}`,
      installedAt: 100,
      updatedAt: 100,
    },
    manager: {
      enabled: true,
      checkForUpdates: true,
      userMatches: [],
      userIncludes: [],
      userExcludes: [],
      userExcludeMatches: [],
    },
  });
}

function harness() {
  const values = new Map<string, string>();
  const repo = new StorageScriptRepository(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    },
    'library',
    [script('a')],
  );
  let config: Json = { visible: true };
  const adapter: SyncPortableAdapter = {
    key: 'display',
    name: '显示',
    read: async () => config,
    validate: (value) => {
      if (
        !value ||
        typeof value !== 'object' ||
        !('visible' in value) ||
        typeof value.visible !== 'boolean'
      )
        throw new Error('invalid display');
    },
    apply: async (value, expected) => {
      if (!equal(config, expected)) return false;
      config = value;
      return true;
    },
  };
  const commit = vi.fn(async () => undefined);
  const projection = new SyncProjection(
    repo,
    commit,
    [adapter],
    async () => undefined,
  );
  return {
    repo,
    commit,
    projection,
    config: () => config,
    editConfig: (value: Json) => {
      config = value;
    },
  };
}

describe('sync projection', () => {
  it('applies remote scripts and settings through live services without replacing installation identity', async () => {
    const test = harness();
    const before = await test.projection.readEntries();
    const incoming = script('a', 'console.log(2)');
    const stored = storedScript(incoming);
    const { id: _id, ...value } = stored;
    const next: SyncEntries = {
      ...before,
      [syncScriptKey(incoming)]: { name: 'a', value },
      'settings:display': { name: '显示', value: { visible: false } },
    };
    const applied = await test.projection.applyEntries(next, before);
    expect(applied.skipped.size).toBe(0);
    expect((await test.repo.list())[0]).toMatchObject({
      id: 'local-a',
      source: { installedAt: 100, code: incoming.source.code },
    });
    expect(test.config()).toEqual({ visible: false });
    expect(test.commit).toHaveBeenCalledOnce();
  });

  it('retains edits and newly installed scripts that occur while the network is in flight', async () => {
    const test = harness();
    const before = await test.projection.readEntries();
    const a = script('a');
    const b = script('b');
    await test.repo.upsert(b);
    await test.repo.upsert(script('a', 'console.log("newest")'));
    test.editConfig({ visible: false });
    const result = await test.projection.applyEntries(
      { ...before, [syncScriptKey(a)]: null },
      before,
    );
    expect(result.skipped.has(syncScriptKey(a))).toBe(true);
    expect(await test.repo.list()).toHaveLength(2);
    expect((await test.repo.get('local-a'))?.source.code).toContain('newest');
    expect(test.config()).toEqual({ visible: false });
  });

  it('does not repeatedly rewrite timestamps, register scripts or discard custom artwork', async () => {
    const test = harness();
    const a = script('a');
    a.presentation = {
      accent: '#aabbcc',
      media: { kind: 'image', image: 'data:image/webp;base64,YWJjZA==' },
    };
    await test.repo.upsert(a);
    const before = await test.projection.readEntries();
    expect(JSON.stringify(before)).toContain('data:image/webp;base64,YWJjZA==');
    await test.projection.applyEntries(before, before);
    await test.projection.applyEntries(before, before);
    expect(test.commit).not.toHaveBeenCalled();
    expect((await test.repo.list())[0].source.updatedAt).toBe(100);
  });

  it('rejects invalid remote fields before mutating any domain', async () => {
    const test = harness();
    const before = await test.projection.readEntries();
    await expect(
      test.projection.applyEntries(
        { ...before, 'script:invalid': { name: 'x', value: {} } },
        before,
      ),
    ).rejects.toThrow();
    await expect(
      test.projection.applyEntries(
        {
          ...before,
          'settings:display': { name: '显示', value: { visible: 'invalid' } },
        },
        before,
      ),
    ).rejects.toThrow();
    expect(await test.projection.readEntries()).toEqual(before);
  });
});
