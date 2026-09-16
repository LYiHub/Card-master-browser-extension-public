import { describe, expect, it } from 'vitest';
import { mergeEntries } from './merge';
import type { SyncEntries } from './model';

const entry = (name: string, value: unknown) => ({
  name,
  value: value as never,
});

describe('sync entry merge', () => {
  it('merges independent changes and propagates deletions', () => {
    const base: SyncEntries = {
      'script:a': entry('A', { code: 'a' }),
      'script:b': entry('B', { code: 'b' }),
    };
    const local: SyncEntries = {
      'script:a': entry('A', { code: 'local' }),
      'script:b': null,
    };
    const remote: SyncEntries = {
      'script:a': entry('A', { code: 'a' }),
      'script:b': entry('B', { code: 'b' }),
      'script:c': entry('C', { code: 'c' }),
    };

    const result = mergeEntries(base, local, remote);

    expect(result.unresolved).toHaveLength(0);
    expect(result.entries['script:a']?.value).toEqual({ code: 'local' });
    expect(result.entries['script:b']).toBeNull();
    expect(result.entries['script:c']?.value).toEqual({ code: 'c' });
  });

  it('requires an explicit choice when both devices changed one item', () => {
    const base: SyncEntries = { 'script:a': entry('A', { code: 'base' }) };
    const local: SyncEntries = { 'script:a': entry('A', { code: 'local' }) };
    const remote: SyncEntries = { 'script:a': entry('A', { code: 'remote' }) };

    const conflict = mergeEntries(base, local, remote);
    expect(conflict.unresolved.map(({ key }) => key)).toEqual(['script:a']);
    expect(
      mergeEntries(base, local, remote, { 'script:a': 'remote' }).entries[
        'script:a'
      ]?.value,
    ).toEqual({ code: 'remote' });
  });
});
