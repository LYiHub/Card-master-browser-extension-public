import { equal, type Json, jsonValue, record } from './model';
import { SyncLocalChanged, type SyncPortableAdapter } from './projection';

const DATABASE = 'lumno-newtab-wallpaper';
const STORE = 'wallpapers';

export function validateWallpapers(value: Json) {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    !value.every(
      (item) =>
        record(item) &&
        typeof item.id === 'string' &&
        /^custom-wallpaper-[\w-]+$/.test(item.id) &&
        typeof item.key === 'string' &&
        item.key.length < 256 &&
        typeof item.name === 'string' &&
        item.name.length < 1024 &&
        typeof item.width === 'number' &&
        item.width > 0 &&
        item.width <= 8192 &&
        typeof item.height === 'number' &&
        item.height > 0 &&
        item.height <= 8192 &&
        typeof item.updatedAt === 'number' &&
        Number.isFinite(item.updatedAt) &&
        ['imageDataUrl', 'thumbnailDataUrl'].every(
          (key) =>
            typeof item[key] === 'string' &&
            item[key].length <= 3 * 1024 * 1024 &&
            /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(
              item[key],
            ),
        ) &&
        Object.keys(item).every((key) =>
          [
            'id',
            'key',
            'name',
            'imageDataUrl',
            'thumbnailDataUrl',
            'width',
            'height',
            'updatedAt',
          ].includes(key),
        ),
    )
  ) {
    throw new Error('自定义壁纸格式无效。');
  }
  if (
    new Set(value.map((item) => (item as { key: string }).key)).size !==
    value.length
  )
    throw new Error('自定义壁纸包含重复标识。');
}

function openDatabase(factory: IDBFactory) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('壁纸存储正在升级，请关闭旧设置页后重试。'));
    request.onsuccess = () => resolve(request.result);
  });
}

export function wallpaperSyncSettings(
  factory: IDBFactory,
): SyncPortableAdapter {
  const transaction = async (desired?: Json, expected?: Json) => {
    const database = await openDatabase(factory);
    return new Promise<Json>((resolve, reject) => {
      const tx = database.transaction(
        STORE,
        desired === undefined ? 'readonly' : 'readwrite',
      );
      const store = tx.objectStore(STORE);
      const request = store.getAll();
      let result: Json = [];
      let failure: unknown;
      request.onsuccess = () => {
        try {
          result = jsonValue(
            request.result.sort((a, b) =>
              String(a.key).localeCompare(String(b.key)),
            ),
          );
          if (desired === undefined) return;
          if (!equal(result, expected) && !equal(result, desired))
            throw new SyncLocalChanged('本机壁纸刚发生变化。');
          validateWallpapers(desired);
          store.clear();
          for (const item of desired as Json[]) store.put(item);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        database.close();
        resolve(result);
      };
      tx.onabort = tx.onerror = () => {
        database.close();
        reject(failure ?? tx.error ?? new Error('壁纸存储操作失败。'));
      };
    });
  };
  return {
    key: 'wallpapers',
    name: '自定义壁纸',
    read: () => transaction(),
    validate: validateWallpapers,
    apply: async (value, expected) => {
      await transaction(value, expected);
      return true;
    },
  };
}
