export type NewTabWallpaperTone = 'light' | 'dark';

export type NewTabLocalWallpaper = {
  id: string;
  key: string;
  name: string;
  imageDataUrl: string;
  thumbnailDataUrl: string;
  width: number;
  height: number;
  updatedAt: number;
};

type LumnoLocalWallpaperStore = {
  buildRecordFromFile(file: File): Promise<NewTabLocalWallpaper>;
  normalizeRecord(value: unknown): NewTabLocalWallpaper | null;
  readAll(): Promise<NewTabLocalWallpaper[]>;
  write(record: NewTabLocalWallpaper): Promise<void>;
};

type LumnoLocalWallpaperApi = {
  createWallpaperLocalStore(options?: {
    documentObj?: Document;
    windowObj?: Window;
  }): LumnoLocalWallpaperStore;
};

function createStore() {
  const api = (
    globalThis as typeof globalThis & {
      LumnoNewtabWallpaperLocalStore?: LumnoLocalWallpaperApi;
    }
  ).LumnoNewtabWallpaperLocalStore;
  if (!api) throw new Error('本地壁纸存储组件尚未加载。');
  return api.createWallpaperLocalStore({
    documentObj: document,
    windowObj: window,
  });
}

export class NewTabLocalWallpaperRepository {
  private readonly store = createStore();

  readAll() {
    return this.store.readAll();
  }

  async save(file: File) {
    const record = await this.store.buildRecordFromFile(file);
    await this.store.write(record);
    const normalized = this.store.normalizeRecord(record);
    if (!normalized) throw new Error('本地壁纸记录无效。');
    return normalized;
  }
}
