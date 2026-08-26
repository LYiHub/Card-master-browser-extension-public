import { describe, expect, it } from 'vitest';

import { mergeUserRules } from './merge-user-rules';

describe('mergeUserRules', () => {
  it('combines independent local and remote edits against the same base', () => {
    expect(
      mergeUserRules(
        ['keep', 'remove-locally', 'remove-remotely'].join('\n'),
        ['keep', 'remove-remotely', 'local-addition'].join('\n'),
        ['keep', 'remove-locally', 'remote-addition'].join('\n'),
      ),
    ).toBe(['keep', 'remote-addition', 'local-addition'].join('\n'));
  });

  it('does not duplicate a rule added in both sources', () => {
    expect(mergeUserRules('', 'example.com##.ad', 'example.com##.ad')).toBe(
      'example.com##.ad',
    );
  });
});
