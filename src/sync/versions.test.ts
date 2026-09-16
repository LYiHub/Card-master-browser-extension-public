import { describe, expect, it, vi } from 'vitest';
import { createRecord, resolveVersions } from './versions';

describe('causal sync versions', () => {
  it('uses ancestry instead of computer clocks to recognize sequential updates', async () => {
    const clock = vi.spyOn(Date, 'now');
    try {
      clock.mockReturnValue(100000);
      const root = await createRecord('a', resolveVersions([]), {
        'script:a': { name: 'A', value: 1 },
      });
      clock.mockReturnValue(1);
      const update = await createRecord('b', resolveVersions([root]), {
        'script:a': { name: 'A', value: 2 },
      });
      const state = resolveVersions([update, root]);
      expect(state.conflicts).toEqual({});
      expect(state.entries['script:a']?.value).toBe(2);
    } finally {
      clock.mockRestore();
    }
  });

  it('rejects missing and cyclic ancestry instead of rebuilding an incomplete state', async () => {
    const root = await createRecord('a', resolveVersions([]), {
      'script:a': { name: 'A', value: 1 },
    });
    const child = await createRecord('a', resolveVersions([root]), {});
    expect(() => resolveVersions([child])).toThrow('缺少父版本');
    expect(() =>
      resolveVersions([{ ...root, parents: [child.id] }, child]),
    ).toThrow('循环引用');
  });
});
