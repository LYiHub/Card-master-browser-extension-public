import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY,
  type DailyReviewWallpaperGenerationRecord,
  dailyReviewWallpaperImageId,
  localDateDaysBefore,
} from '../../new-tab/application/daily-review-wallpaper';
import type { ExtensionStorageArea } from './api';
import { DailyReviewWallpaperHistoryRepository } from './daily-review-wallpaper-storage';

class MemoryStorage {
  readonly values: Record<string, unknown> = {};

  async get(key: string) {
    return { [key]: this.values[key] };
  }

  async set(items: Record<string, unknown>) {
    Object.assign(this.values, items);
  }
}

function generationRecord(
  id: string,
  startedAt: number,
  {
    byteLength = 8,
    sourceDate = '2026-08-09',
  }: { byteLength?: number; sourceDate?: string } = {},
): DailyReviewWallpaperGenerationRecord {
  return {
    id,
    targetDate: '2026-08-10',
    sourceDate,
    trigger: 'manual',
    status: 'ready',
    startedAt,
    completedAt: startedAt + 1_000,
    result: {
      imageId: dailyReviewWallpaperImageId(id),
      mimeType: 'image/webp',
      byteLength,
      width: 3840,
      height: 2160,
      imageModel: 'gpt-image-2',
    },
  };
}

describe('DailyReviewWallpaperHistoryRepository', () => {
  it('deletes key-cursor records through the object store', () => {
    const source = readFileSync(
      new URL('./daily-review-wallpaper-storage.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('const request = store.openKeyCursor()');
    expect(source).toContain('store.delete(cursor.primaryKey)');
    expect(source).not.toContain('cursor.delete()');
  });

  it('removes expired history while preserving the active generation', async () => {
    const now = new Date(2026, 7, 10, 12, 0, 0).getTime();
    const cutoff = localDateDaysBefore(now, 30);
    const storage = new MemoryStorage();
    storage.values[DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY] = [
      generationRecord('recent', cutoff),
      generationRecord('active', cutoff - 2_000),
      generationRecord('expired', cutoff - 1_000),
    ];
    const repository = new DailyReviewWallpaperHistoryRepository(
      storage as unknown as ExtensionStorageArea,
    );

    await expect(
      repository.prune({
        cutoff,
        preservedGenerationIds: ['active'],
        maxImages: 14,
        maxImagesPerSourceDate: 3,
        maxImageBytes: 100 * 1024 * 1024,
      }),
    ).resolves.toMatchObject({
      history: [{ id: 'recent' }, { id: 'active' }],
      removedImageIds: [dailyReviewWallpaperImageId('expired')],
    });
    expect(
      storage.values[DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY],
    ).toMatchObject([{ id: 'recent' }, { id: 'active' }]);
  });

  it('limits successful images by total count and source date', async () => {
    const now = new Date(2026, 7, 10, 12, 0, 0).getTime();
    const storage = new MemoryStorage();
    storage.values[DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY] = [
      generationRecord('same-4', now - 1_000),
      generationRecord('same-3', now - 2_000),
      generationRecord('same-2', now - 3_000),
      generationRecord('same-1', now - 4_000),
      generationRecord('other', now - 5_000, {
        sourceDate: '2026-08-08',
      }),
      generationRecord('overflow', now - 6_000, {
        sourceDate: '2026-08-07',
      }),
    ];
    const repository = new DailyReviewWallpaperHistoryRepository(
      storage as unknown as ExtensionStorageArea,
    );

    await expect(
      repository.prune({
        cutoff: localDateDaysBefore(now, 7),
        maxImages: 4,
        maxImagesPerSourceDate: 3,
        maxImageBytes: 100 * 1024 * 1024,
      }),
    ).resolves.toMatchObject({
      history: [
        { id: 'same-4' },
        { id: 'same-3' },
        { id: 'same-2' },
        { id: 'other' },
      ],
      removedImageIds: [
        dailyReviewWallpaperImageId('same-1'),
        dailyReviewWallpaperImageId('overflow'),
      ],
    });
  });

  it('limits total stored image bytes while keeping the latest image', async () => {
    const now = new Date(2026, 7, 10, 12, 0, 0).getTime();
    const mebibyte = 1024 * 1024;
    const storage = new MemoryStorage();
    storage.values[DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY] = [
      generationRecord('latest', now - 1_000, { byteLength: 60 * mebibyte }),
      generationRecord('too-large', now - 2_000, {
        byteLength: 50 * mebibyte,
        sourceDate: '2026-08-08',
      }),
      generationRecord('fits', now - 3_000, {
        byteLength: 10 * mebibyte,
        sourceDate: '2026-08-07',
      }),
    ];
    const repository = new DailyReviewWallpaperHistoryRepository(
      storage as unknown as ExtensionStorageArea,
    );

    await expect(
      repository.prune({
        cutoff: localDateDaysBefore(now, 7),
        maxImages: 14,
        maxImagesPerSourceDate: 3,
        maxImageBytes: 100 * mebibyte,
      }),
    ).resolves.toMatchObject({
      history: [{ id: 'latest' }, { id: 'fits' }],
      removedImageIds: [dailyReviewWallpaperImageId('too-large')],
    });
  });
});
