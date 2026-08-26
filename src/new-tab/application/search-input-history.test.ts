import { describe, expect, it } from 'vitest';

import {
  NewTabSearchInputHistory,
  newTabSearchHistoryDirection,
  normalizeNewTabSearchHistory,
} from './search-input-history';

describe('new tab search input history', () => {
  it('deduplicates entries and restores the unfinished draft', () => {
    expect(normalizeNewTabSearchHistory(['one', 'two', 'one'])).toEqual([
      'two',
      'one',
    ]);
    const history = new NewTabSearchInputHistory(['first', 'second']);
    expect(history.move('previous', 'draft')).toEqual({
      handled: true,
      value: 'second',
    });
    expect(history.move('previous', 'second')).toEqual({
      handled: true,
      value: 'first',
    });
    expect(history.move('next', 'first')).toEqual({
      handled: true,
      value: 'second',
    });
    expect(history.move('next', 'second')).toEqual({
      handled: true,
      value: 'draft',
    });
  });

  it('uses the upstream Alt and arrow-key contract', () => {
    expect(
      newTabSearchHistoryDirection({
        altKey: true,
        code: 'ArrowUp',
        ctrlKey: false,
        key: 'ArrowUp',
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe('previous');
    expect(
      newTabSearchHistoryDirection({
        altKey: true,
        code: 'ArrowDown',
        ctrlKey: false,
        key: 'ArrowDown',
        metaKey: false,
        shiftKey: false,
      }),
    ).toBe('next');
  });
});
