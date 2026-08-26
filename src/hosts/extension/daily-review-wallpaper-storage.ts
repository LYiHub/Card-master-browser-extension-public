import {
  DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY,
  DAILY_REVIEW_WALLPAPER_STATE_STORAGE_KEY,
  type DailyReviewWallpaperGenerationRecord,
  type DailyReviewWallpaperState,
  type DailyReviewWallpaperTrigger,
  isDailyReviewWallpaperPhase,
  isDailyReviewWallpaperTrigger,
  type StoredDailyReviewWallpaperImage,
} from '../../new-tab/application/daily-review-wallpaper';
import type { ExtensionStorageArea } from './api';
import type { GeneratedDailyReviewWallpaper } from './daily-review-image';

const DAILY_REVIEW_WALLPAPER_DATABASE_NAME = 'card-master-new-tab-daily-review';
const DAILY_REVIEW_WALLPAPER_DATABASE_VERSION = 1;
const DAILY_REVIEW_WALLPAPER_STORE_NAME = 'images';
const GENERATION_STATUSES = [
  'running',
  'ready',
  'failed',
  'blocked',
  'no-history',
] as const;

function openWallpaperDatabase(databaseFactory: IDBFactory) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = databaseFactory.open(
      DAILY_REVIEW_WALLPAPER_DATABASE_NAME,
      DAILY_REVIEW_WALLPAPER_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (
        !database.objectStoreNames.contains(DAILY_REVIEW_WALLPAPER_STORE_NAME)
      ) {
        database.createObjectStore(DAILY_REVIEW_WALLPAPER_STORE_NAME, {
          keyPath: 'key',
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('每日回顾数据库无法打开。'));
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizedString(value: unknown, maxLength = 32_000) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

function normalizedTrigger(value: unknown): DailyReviewWallpaperTrigger | null {
  return isDailyReviewWallpaperTrigger(value) ? value : null;
}

function normalizeState(value: unknown): DailyReviewWallpaperState | null {
  if (!record(value)) return null;
  const state = value;
  const trigger = normalizedTrigger(state.trigger);
  if (
    typeof state.status !== 'string' ||
    typeof state.targetDate !== 'string' ||
    !trigger
  ) {
    return null;
  }
  if (state.status === 'ready') {
    if (
      typeof state.generationId !== 'string' ||
      typeof state.sourceDate !== 'string' ||
      typeof state.startedAt !== 'number' ||
      typeof state.generatedAt !== 'number' ||
      typeof state.imageId !== 'string' ||
      typeof state.model !== 'string' ||
      typeof state.imageModel !== 'string' ||
      typeof state.styleFingerprint !== 'string'
    ) {
      return null;
    }
    return {
      status: 'ready',
      generationId: state.generationId,
      targetDate: state.targetDate,
      sourceDate: state.sourceDate,
      trigger,
      startedAt: state.startedAt,
      generatedAt: state.generatedAt,
      imageId: state.imageId,
      model: state.model,
      imageModel: state.imageModel,
      styleFingerprint: state.styleFingerprint,
      ...(typeof state.lastCheckedAt === 'number'
        ? { lastCheckedAt: state.lastCheckedAt }
        : {}),
      ...(isDailyReviewWallpaperTrigger(state.lastCheckTrigger)
        ? { lastCheckTrigger: state.lastCheckTrigger }
        : {}),
    };
  }
  if (state.status === 'generating') {
    if (
      typeof state.generationId !== 'string' ||
      typeof state.startedAt !== 'number' ||
      typeof state.updatedAt !== 'number' ||
      typeof state.styleFingerprint !== 'string' ||
      !isDailyReviewWallpaperPhase(state.phase)
    ) {
      return null;
    }
    return {
      status: 'generating',
      generationId: state.generationId,
      targetDate: state.targetDate,
      trigger,
      phase: state.phase,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      styleFingerprint: state.styleFingerprint,
      ...(typeof state.sourceDate === 'string'
        ? { sourceDate: state.sourceDate }
        : {}),
    };
  }
  if (
    ![
      'disabled',
      'unsupported',
      'waiting-for-configuration',
      'no-history',
      'failed',
    ].includes(state.status)
  ) {
    return null;
  }
  const status = state.status as
    | 'disabled'
    | 'unsupported'
    | 'waiting-for-configuration'
    | 'no-history'
    | 'failed';
  return {
    status,
    targetDate: state.targetDate,
    trigger,
    ...(typeof state.generationId === 'string'
      ? { generationId: state.generationId }
      : {}),
    ...(typeof state.sourceDate === 'string'
      ? { sourceDate: state.sourceDate }
      : {}),
    ...(typeof state.startedAt === 'number'
      ? { startedAt: state.startedAt }
      : {}),
    updatedAt:
      typeof state.updatedAt === 'number' ? state.updatedAt : Date.now(),
    ...(typeof state.error === 'string'
      ? { error: state.error.slice(0, 2_000) }
      : {}),
    ...(typeof state.styleFingerprint === 'string'
      ? { styleFingerprint: state.styleFingerprint }
      : {}),
    ...(typeof state.lastCheckedAt === 'number'
      ? { lastCheckedAt: state.lastCheckedAt }
      : {}),
    ...(isDailyReviewWallpaperTrigger(state.lastCheckTrigger)
      ? { lastCheckTrigger: state.lastCheckTrigger }
      : {}),
  };
}

function normalizeGenerationRecord(
  value: unknown,
): DailyReviewWallpaperGenerationRecord | null {
  if (!record(value)) return null;
  const trigger = normalizedTrigger(value.trigger);
  if (
    typeof value.id !== 'string' ||
    typeof value.targetDate !== 'string' ||
    !trigger ||
    typeof value.status !== 'string' ||
    !(GENERATION_STATUSES as readonly string[]).includes(value.status) ||
    typeof value.startedAt !== 'number'
  ) {
    return null;
  }
  const result = record(value.result)
    ? {
        imageId: normalizedString(value.result.imageId, 512),
        mimeType: normalizedString(value.result.mimeType, 128),
        byteLength: value.result.byteLength,
        width: value.result.width,
        height: value.result.height,
        imageModel: normalizedString(value.result.imageModel, 512),
      }
    : null;
  const normalizedResult =
    result?.imageId &&
    result.mimeType &&
    typeof result.byteLength === 'number' &&
    typeof result.width === 'number' &&
    typeof result.height === 'number' &&
    result.imageModel
      ? {
          imageId: result.imageId,
          mimeType: result.mimeType,
          byteLength: result.byteLength,
          width: result.width,
          height: result.height,
          imageModel: result.imageModel,
        }
      : undefined;
  const sourceDate = normalizedString(value.sourceDate, 32);
  const finalPrompt = normalizedString(value.finalPrompt);
  const summary = normalizedString(value.summary, 2_000);
  const model = normalizedString(value.model, 512);
  const styleFingerprint = normalizedString(value.styleFingerprint, 64);
  const error = normalizedString(value.error, 4_000);
  return {
    id: value.id,
    targetDate: value.targetDate,
    trigger,
    status: value.status as DailyReviewWallpaperGenerationRecord['status'],
    startedAt: value.startedAt,
    ...(isDailyReviewWallpaperPhase(value.phase) ? { phase: value.phase } : {}),
    ...(typeof value.completedAt === 'number'
      ? { completedAt: value.completedAt }
      : {}),
    ...(sourceDate ? { sourceDate } : {}),
    ...(finalPrompt ? { finalPrompt } : {}),
    ...(summary ? { summary } : {}),
    ...(model ? { model } : {}),
    ...(styleFingerprint ? { styleFingerprint } : {}),
    ...(normalizedResult ? { result: normalizedResult } : {}),
    ...(error ? { error } : {}),
  };
}

export class DailyReviewWallpaperStateRepository {
  constructor(private readonly storage: ExtensionStorageArea) {}

  async read() {
    const stored = await this.storage.get(
      DAILY_REVIEW_WALLPAPER_STATE_STORAGE_KEY,
    );
    return normalizeState(stored[DAILY_REVIEW_WALLPAPER_STATE_STORAGE_KEY]);
  }

  async write(state: DailyReviewWallpaperState) {
    await this.storage.set({
      [DAILY_REVIEW_WALLPAPER_STATE_STORAGE_KEY]: state,
    });
    return state;
  }
}

export class DailyReviewWallpaperHistoryRepository {
  constructor(private readonly storage: ExtensionStorageArea) {}

  async read() {
    const stored = await this.storage.get(
      DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY,
    );
    const history = stored[DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY];
    if (!Array.isArray(history)) return [];
    return history
      .flatMap((entry) => {
        const normalized = normalizeGenerationRecord(entry);
        return normalized ? [normalized] : [];
      })
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  async prune({
    cutoff,
    preservedGenerationIds = [],
    maxImages,
    maxImagesPerSourceDate,
    maxImageBytes,
  }: {
    cutoff: number;
    preservedGenerationIds?: readonly string[];
    maxImages: number;
    maxImagesPerSourceDate: number;
    maxImageBytes: number;
  }) {
    const current = await this.read();
    const preserved = new Set(preservedGenerationIds);
    const latest = current.find(
      (entry) => entry.status === 'ready' && Boolean(entry.result?.imageId),
    );
    if (latest) preserved.add(latest.id);
    const eligible = current.filter(
      (entry) => entry.startedAt >= cutoff || preserved.has(entry.id),
    );
    let retainedImageCount = 0;
    let retainedImageBytes = 0;
    const retainedBySourceDate = new Map<string, number>();
    for (const entry of eligible) {
      if (!preserved.has(entry.id) || !entry.result?.imageId) continue;
      retainedImageCount += 1;
      retainedImageBytes += Math.max(0, entry.result.byteLength);
      const sourceDate = entry.sourceDate ?? entry.targetDate;
      retainedBySourceDate.set(
        sourceDate,
        (retainedBySourceDate.get(sourceDate) ?? 0) + 1,
      );
    }
    const history = eligible.filter((entry) => {
      const result = entry.result;
      if (!result?.imageId || preserved.has(entry.id)) return true;
      const sourceDate = entry.sourceDate ?? entry.targetDate;
      const sourceDateCount = retainedBySourceDate.get(sourceDate) ?? 0;
      const byteLength = Math.max(0, result.byteLength);
      if (
        retainedImageCount >= maxImages ||
        sourceDateCount >= maxImagesPerSourceDate ||
        retainedImageBytes + byteLength > maxImageBytes
      ) {
        return false;
      }
      retainedImageCount += 1;
      retainedImageBytes += byteLength;
      retainedBySourceDate.set(sourceDate, sourceDateCount + 1);
      return true;
    });
    const removed = current.filter((entry) => !history.includes(entry));
    if (removed.length > 0) {
      await this.storage.set({
        [DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY]: history,
      });
    }
    return {
      history,
      removedImageIds: removed.flatMap((entry) =>
        entry.result?.imageId ? [entry.result.imageId] : [],
      ),
      retainedImageIds: history.flatMap((entry) =>
        entry.result?.imageId ? [entry.result.imageId] : [],
      ),
    };
  }

  async write(record: DailyReviewWallpaperGenerationRecord) {
    const current = await this.read();
    const next = [
      record,
      ...current.filter((entry) => entry.id !== record.id),
    ].sort((left, right) => right.startedAt - left.startedAt);
    await this.storage.set({
      [DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY]: next,
    });
    return record;
  }
}

export class DailyReviewWallpaperImageRepository {
  constructor(
    private readonly databaseFactory: IDBFactory = globalThis.indexedDB,
  ) {}

  private async readRecord(imageId: string) {
    const database = await openWallpaperDatabase(this.databaseFactory);
    return new Promise<Record<string, unknown> | null>((resolve, reject) => {
      const transaction = database.transaction(
        DAILY_REVIEW_WALLPAPER_STORE_NAME,
        'readonly',
      );
      const request = transaction
        .objectStore(DAILY_REVIEW_WALLPAPER_STORE_NAME)
        .get(imageId);
      request.onsuccess = () => {
        resolve(record(request.result) ? request.result : null);
      };
      request.onerror = () =>
        reject(request.error ?? new Error('每日回顾读取失败。'));
      transaction.oncomplete = () => database.close();
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error('每日回顾读取已中止。'));
      };
    });
  }

  async matches(imageId: string, sourceDate: string) {
    const stored = await this.readRecord(imageId);
    return (
      stored?.key === imageId &&
      stored.sourceDate === sourceDate &&
      typeof stored.dataUrl === 'string' &&
      stored.dataUrl.startsWith('data:image/')
    );
  }

  async read(imageId: string): Promise<StoredDailyReviewWallpaperImage | null> {
    const stored = await this.readRecord(imageId);
    if (
      stored?.key !== imageId ||
      typeof stored.dataUrl !== 'string' ||
      !stored.dataUrl.startsWith('data:image/') ||
      typeof stored.mimeType !== 'string' ||
      typeof stored.byteLength !== 'number' ||
      typeof stored.width !== 'number' ||
      typeof stored.height !== 'number' ||
      typeof stored.sourceDate !== 'string' ||
      typeof stored.generatedAt !== 'number'
    ) {
      return null;
    }
    return {
      imageId,
      dataUrl: stored.dataUrl,
      mimeType: stored.mimeType,
      byteLength: stored.byteLength,
      width: stored.width,
      height: stored.height,
      sourceDate: stored.sourceDate,
      generatedAt: stored.generatedAt,
    };
  }

  async removeAllExcept(imageIds: readonly string[]) {
    const retained = new Set(imageIds);
    const database = await openWallpaperDatabase(this.databaseFactory);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        DAILY_REVIEW_WALLPAPER_STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(DAILY_REVIEW_WALLPAPER_STORE_NAME);
      const request = store.openKeyCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key !== 'string' || !retained.has(cursor.key)) {
          store.delete(cursor.primaryKey);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error('每日回顾清理已中止。'));
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error('每日回顾清理失败。'));
      };
    });
  }

  async save(
    image: GeneratedDailyReviewWallpaper,
    sourceDate: string,
    generatedAt: number,
    imageId: string,
  ) {
    const database = await openWallpaperDatabase(this.databaseFactory);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        DAILY_REVIEW_WALLPAPER_STORE_NAME,
        'readwrite',
      );
      const store = transaction.objectStore(DAILY_REVIEW_WALLPAPER_STORE_NAME);
      store.put({
        key: imageId,
        dataUrl: image.dataUrl,
        mimeType: image.mimeType,
        byteLength: image.byteLength,
        width: image.width,
        height: image.height,
        sourceDate,
        generatedAt,
      });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error('每日回顾写入已中止。'));
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error('每日回顾写入失败。'));
      };
    });
  }
}
