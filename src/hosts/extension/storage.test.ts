import { describe, expect, it } from 'vitest';

import type { ExtensionStorageArea } from './api';
import { ExtensionStringStorage } from './storage';

class MemoryExtensionStorage {
  readonly values: Record<string, unknown> = {};

  async get(keys: string | string[] | null) {
    if (typeof keys === 'string') return { [keys]: this.values[keys] };
    return { ...this.values };
  }

  async set(items: Record<string, unknown>) {
    Object.assign(this.values, items);
  }
}

describe('ExtensionStringStorage', () => {
  it('adapts extension storage to the shared repository port', async () => {
    const area = new MemoryExtensionStorage();
    const storage = new ExtensionStringStorage(
      area as unknown as ExtensionStorageArea,
    );

    await storage.setItem('scripts', '{"version":1}');
    await expect(storage.getItem('scripts')).resolves.toBe('{"version":1}');
    area.values.scripts = 42;
    await expect(storage.getItem('scripts')).resolves.toBeNull();
  });
});
