import { describe, expect, it } from 'vitest';

import {
  BrowserUserscriptValueStore,
  MemoryUserscriptValueStore,
} from './value-store';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe.each([
  ['memory', new MemoryUserscriptValueStore()],
  ['browser', new BrowserUserscriptValueStore(new MemoryStorage())],
])('%s Userscript value store', (_name, store) => {
  it('isolates values by script and supports standard value operations', () => {
    store.set('script-a', 'count', 3);
    store.set('script-b', 'count', 8);

    expect(store.get('script-a', 'count', 0)).toBe(3);
    expect(store.get('script-b', 'count', 0)).toBe(8);
    expect(store.list('script-a')).toEqual(['count']);
    store.delete('script-a', 'count');
    expect(store.get('script-a', 'count', 0)).toBe(0);
  });

  it('does not expose mutable references to stored values', () => {
    store.set('script-a', 'options', { enabled: true });
    const options = store.get('script-a', 'options', { enabled: false });
    options.enabled = false;

    expect(store.get('script-a', 'options', { enabled: false })).toEqual({
      enabled: true,
    });
  });
});
