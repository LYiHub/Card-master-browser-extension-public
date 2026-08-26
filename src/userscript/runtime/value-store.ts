export interface UserscriptValueStore {
  get<T>(scriptId: string, key: string, fallback?: T): T;
  set(scriptId: string, key: string, value: unknown): void;
  delete(scriptId: string, key: string): void;
  list(scriptId: string): string[];
}

export class MemoryUserscriptValueStore implements UserscriptValueStore {
  private readonly values = new Map<string, Map<string, unknown>>();

  get<T>(scriptId: string, key: string, fallback?: T) {
    const values = this.values.get(scriptId);
    return (
      values?.has(key) ? structuredClone(values.get(key)) : fallback
    ) as T;
  }

  set(scriptId: string, key: string, value: unknown) {
    const values = this.values.get(scriptId) ?? new Map<string, unknown>();
    values.set(key, structuredClone(value));
    this.values.set(scriptId, values);
  }

  delete(scriptId: string, key: string) {
    this.values.get(scriptId)?.delete(key);
  }

  list(scriptId: string) {
    return [...(this.values.get(scriptId)?.keys() ?? [])];
  }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export class BrowserUserscriptValueStore implements UserscriptValueStore {
  constructor(
    private readonly storage: StorageLike,
    private readonly prefix = 'card-master.values.v1',
  ) {}

  get<T>(scriptId: string, key: string, fallback?: T) {
    const values = this.read(scriptId);
    return Object.hasOwn(values, key) ? (values[key] as T) : (fallback as T);
  }

  set(scriptId: string, key: string, value: unknown) {
    const values = this.read(scriptId);
    values[key] = structuredClone(value);
    this.write(scriptId, values);
  }

  delete(scriptId: string, key: string) {
    const values = this.read(scriptId);
    delete values[key];
    this.write(scriptId, values);
  }

  list(scriptId: string) {
    return Object.keys(this.read(scriptId));
  }

  private storageKey(scriptId: string) {
    return `${this.prefix}:${encodeURIComponent(scriptId)}`;
  }

  private read(scriptId: string): Record<string, unknown> {
    const serialized = this.storage.getItem(this.storageKey(scriptId));
    if (!serialized) return {};
    try {
      const parsed = JSON.parse(serialized) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new TypeError('Expected an object.');
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Invalid GM value storage for script ${scriptId}.`, {
        cause: error,
      });
    }
  }

  private write(scriptId: string, values: Record<string, unknown>) {
    this.storage.setItem(this.storageKey(scriptId), JSON.stringify(values));
  }
}
