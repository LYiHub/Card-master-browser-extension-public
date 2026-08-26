import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE,
  DAILY_REVIEW_WALLPAPER_SELECTION_STORAGE_KEY,
  type DailyReviewWallpaperGenerationRecord,
  type DailyReviewWallpaperState,
  dailyReviewStyleFingerprint,
  dailyReviewWallpaperImageId,
  localDateDaysBefore,
} from '../../new-tab/application/daily-review-wallpaper';
import { defaultNewTabPreferences } from '../../new-tab/application/preferences';
import { DailyReviewWallpaperService } from './daily-review-wallpaper-service';

afterEach(() => {
  vi.unstubAllGlobals();
});

function currentStyleFingerprint(reasoningEnabled = true) {
  return dailyReviewStyleFingerprint(
    `${DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE}\n思考模式：${
      reasoningEnabled ? '开启' : '关闭'
    }`,
  );
}

function historyApi(visitTime: number) {
  return {
    search: vi.fn(async (_query: chrome.history.HistoryQuery) => [
      {
        id: 'history-1',
        title: 'Research notes',
        url: 'https://example.com/research?private=token',
        lastVisitTime: visitTime,
        visitCount: 1,
      },
    ]),
    getVisits: vi.fn(async (_details: { url: string }) => [
      {
        id: 'history-1',
        visitId: 'visit-1',
        referringVisitId: '0',
        visitTime,
        transition: 'link' as const,
        isLocal: true,
      },
    ]),
    deleteUrl: vi.fn(),
  };
}

function aiServices() {
  const modelStream = vi.fn(async (_request: unknown, _callbacks: unknown) => ({
    model: 'deepseek-v4-flash',
    text: JSON.stringify({
      summary: '围绕研究展开的一天。',
      image_prompt:
        '一座明亮的手绘档案馆向外展开，书页和路径汇入同一片冒险风景。',
    }),
    toolCalls: [],
  }));
  const generateDailyReviewWallpaper = vi.fn(async (_prompt: string) => ({
    dataUrl: 'data:image/webp;base64,b3JpZ2luYWw=',
    mimeType: 'image/webp' as const,
    byteLength: 8,
    width: 3840 as const,
    height: 2160 as const,
    model: 'gpt-image-2',
  }));
  return {
    modelStream,
    generateDailyReviewWallpaper,
    service: {
      readView: vi.fn(async () => ({
        modelService: {
          baseUrl: 'https://api.example.com/v1',
          model: 'deepseek-v4-flash',
          protocol: 'responses',
          reasoningEffort: 'high',
          hasCredential: true,
        },
        imageService: {
          credentialSource: 'model-service',
          protocol: 'openai-images',
          baseUrl: 'https://api.example.com/v1',
          model: 'gpt-image-2',
          hasCredential: true,
        },
        speechService: { hasCredential: false },
      })),
      openModelSession: vi.fn(async () => ({
        view: {
          modelService: {
            baseUrl: 'https://api.example.com/v1',
            model: 'deepseek-v4-flash',
            protocol: 'responses',
            reasoningEffort: 'high',
            hasCredential: true,
          },
        },
        client: { stream: modelStream },
      })),
      generateDailyReviewWallpaper,
    },
  };
}

function stateRepository(initial: DailyReviewWallpaperState | null = null) {
  let current = initial;
  return {
    read: vi.fn(async () => current),
    write: vi.fn(async (state: DailyReviewWallpaperState) => {
      current = state;
      return state;
    }),
  };
}

function historyRepository() {
  const records = new Map<string, DailyReviewWallpaperGenerationRecord>();
  const current = () =>
    [...records.values()].sort(
      (left, right) => right.startedAt - left.startedAt,
    );
  return {
    records,
    read: vi.fn(async () => current()),
    prune: vi.fn(async () => ({
      history: current(),
      removedImageIds: [],
      retainedImageIds: current().flatMap((record) =>
        record.result?.imageId ? [record.result.imageId] : [],
      ),
    })),
    write: vi.fn(async (record: DailyReviewWallpaperGenerationRecord) => {
      records.set(record.id, record);
      return record;
    }),
  };
}

describe('DailyReviewWallpaperService', () => {
  it('protects the current and selected images during bounded cleanup', async () => {
    const now = new Date(2026, 7, 10, 12, 0, 0).getTime();
    const currentId = 'generation-current';
    const selectedId = 'generation-selected';
    const state = stateRepository({
      status: 'ready',
      generationId: currentId,
      targetDate: '2026-08-10',
      sourceDate: '2026-08-09',
      trigger: 'scheduled',
      startedAt: now - 1_000,
      generatedAt: now,
      imageId: dailyReviewWallpaperImageId(currentId),
      model: 'deepseek-v4-flash',
      imageModel: 'gpt-image-2',
      styleFingerprint: currentStyleFingerprint(),
    });
    const prune = vi.fn(async () => ({
      history: [],
      removedImageIds: [],
      retainedImageIds: [],
    }));
    const removeAllExcept = vi.fn(async () => undefined);
    const service = new DailyReviewWallpaperService(
      {
        storage: {
          local: {
            get: vi.fn(async () => ({
              [DAILY_REVIEW_WALLPAPER_SELECTION_STORAGE_KEY]: {
                selectedGenerationId: selectedId,
                latestGenerationId: currentId,
              },
            })),
          },
          sync: {},
        },
      } as never,
      aiServices().service as never,
      {
        read: vi.fn(async () => ({
          ...defaultNewTabPreferences(),
          dailyReviewRetentionDays: 7,
        })),
      } as never,
      state as never,
      {
        read: vi.fn(),
        removeAllExcept,
      } as never,
      { prune, read: vi.fn(async () => []) } as never,
    );

    await expect(service.readSnapshot(now)).resolves.toEqual({
      state: expect.objectContaining({ generationId: currentId }),
      history: [],
    });
    expect(prune).toHaveBeenCalledWith(
      expect.objectContaining({
        cutoff: localDateDaysBefore(now, 7),
        preservedGenerationIds: [currentId, selectedId],
        maxImages: 14,
        maxImagesPerSourceDate: 3,
        maxImageBytes: 100 * 1024 * 1024,
      }),
    );
    expect(removeAllExcept).toHaveBeenCalledWith([
      dailyReviewWallpaperImageId(currentId),
      dailyReviewWallpaperImageId(selectedId),
    ]);
  });

  it('stores the final image prompt and one unique image for a manual run', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'generation-1' });
    const now = new Date(2026, 7, 6, 10, 0, 0).getTime();
    const visitTime = new Date(2026, 7, 5, 18, 30, 0).getTime();
    const api = {
      history: historyApi(visitTime),
      storage: { local: {}, sync: {} },
    };
    const ai = aiServices();
    const state = stateRepository();
    const images = {
      matches: vi.fn(async () => false),
      read: vi.fn(),
      removeAllExcept: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    };
    const history = historyRepository();
    const service = new DailyReviewWallpaperService(
      api as never,
      ai.service as never,
      {
        read: vi.fn(async () => ({
          ...defaultNewTabPreferences(),
          wallpaperSource: 'default',
        })),
      } as never,
      state as never,
      images as never,
      history as never,
    );

    const task = service.start({
      trigger: 'manual',
      force: true,
      now,
    });
    const ready = await task.operation;
    const imageId = dailyReviewWallpaperImageId('generation-1');
    const finalPrompt = ai.generateDailyReviewWallpaper.mock.calls[0]?.[0];

    expect(task.started).toBe(true);
    expect(ready).toMatchObject({
      status: 'ready',
      generationId: 'generation-1',
      targetDate: '2026-08-06',
      sourceDate: '2026-08-05',
      trigger: 'manual',
      imageId,
      model: 'deepseek-v4-flash',
      imageModel: 'gpt-image-2',
    });
    expect(ai.modelStream).toHaveBeenCalledTimes(1);
    expect(ai.modelStream.mock.calls[0]?.[0]).toMatchObject({
      model: 'deepseek-v4-flash',
      reasoningEffort: 'high',
      responseFormat: 'json-object',
    });
    expect(ai.modelStream.mock.calls[0]?.[0]).not.toHaveProperty('tools');
    expect(ai.modelStream.mock.calls[0]?.[0]).not.toHaveProperty('toolChoice');
    expect(finalPrompt).not.toContain('3840×2160');
    expect(finalPrompt).toContain('横向 16:9');
    expect(finalPrompt).toContain('中央安全区域');
    expect(images.save).toHaveBeenCalledWith(
      expect.objectContaining({
        dataUrl: 'data:image/webp;base64,b3JpZ2luYWw=',
      }),
      '2026-08-05',
      expect.any(Number),
      imageId,
    );
    expect(history.records.get('generation-1')).toMatchObject({
      status: 'ready',
      trigger: 'manual',
      finalPrompt,
      summary: '围绕研究展开的一天。',
      result: {
        imageId,
        imageModel: 'gpt-image-2',
        width: 3840,
        height: 2160,
      },
    });
    expect(images.removeAllExcept).toHaveBeenLastCalledWith([imageId]);
    expect(api.history.search).toHaveBeenCalledWith(
      expect.objectContaining({
        endTime: new Date(2026, 7, 6, 0, 0, 0).getTime() - 1,
      }),
    );
  });

  it('uses custom content without reading history or opening a model session', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'custom-generation' });
    const now = new Date(2026, 7, 6, 10, 0, 0).getTime();
    const ai = aiServices();
    ai.service.readView.mockResolvedValue({
      modelService: {
        baseUrl: 'https://api.example.com/v1',
        model: 'deepseek-v4-flash',
        protocol: 'responses',
        reasoningEffort: 'high',
        hasCredential: false,
      },
      imageService: {
        credentialSource: 'image-service',
        protocol: 'openai-images',
        baseUrl: 'https://images.example.com/v1',
        model: 'gpt-image-2',
        hasCredential: true,
      },
      speechService: { hasCredential: false },
    });
    const images = {
      matches: vi.fn(async () => false),
      read: vi.fn(),
      removeAllExcept: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    };
    const history = historyRepository();
    const service = new DailyReviewWallpaperService(
      { storage: { local: {}, sync: {} } } as never,
      ai.service as never,
      {
        read: vi.fn(async () => ({
          ...defaultNewTabPreferences(),
          wallpaperSource: 'default',
        })),
      } as never,
      stateRepository() as never,
      images as never,
      history as never,
    );

    const ready = await service.start({
      trigger: 'manual',
      force: true,
      now,
      plan: {
        summary: '今天把一个想法整理成了可以开始执行的计划。',
        image_prompt: '云海中的明亮工坊正在组装一座通往远方的桥梁。',
      },
    }).operation;

    expect(ready).toMatchObject({
      status: 'ready',
      generationId: 'custom-generation',
      sourceDate: '2026-08-06',
      model: 'manual',
      imageModel: 'gpt-image-2',
    });
    expect(ai.service.openModelSession).not.toHaveBeenCalled();
    expect(ai.generateDailyReviewWallpaper).toHaveBeenCalledOnce();
    expect(history.records.get('custom-generation')).toMatchObject({
      status: 'ready',
      sourceDate: '2026-08-06',
      model: 'manual',
      summary: '今天把一个想法整理成了可以开始执行的计划。',
    });
    expect(images.save).toHaveBeenCalledWith(
      expect.any(Object),
      '2026-08-06',
      expect.any(Number),
      dailyReviewWallpaperImageId('custom-generation'),
    );
  });

  it('reapplies a completed wallpaper without repeating automatic generation', async () => {
    const imageId = dailyReviewWallpaperImageId('generation-ready');
    const styleFingerprint = currentStyleFingerprint();
    const startedAt = Date.now() - 10_000;
    const ready: DailyReviewWallpaperState = {
      status: 'ready',
      generationId: 'generation-ready',
      targetDate: '2026-08-06',
      sourceDate: '2026-08-05',
      trigger: 'manual',
      startedAt,
      generatedAt: Date.now(),
      imageId,
      model: 'deepseek-v4-flash',
      imageModel: 'gpt-image-2',
      styleFingerprint,
    };
    const state = stateRepository(ready);
    const ai = aiServices();
    const images = {
      matches: vi.fn(async () => true),
      read: vi.fn(),
      save: vi.fn(),
    };
    const history = historyRepository();
    history.records.set('generation-ready', {
      id: 'generation-ready',
      targetDate: '2026-08-06',
      sourceDate: '2026-08-05',
      trigger: 'manual',
      status: 'ready',
      startedAt,
      completedAt: ready.generatedAt,
      finalPrompt: '创作一幅明亮、连贯且完整的中文幻想风景壁纸。',
      summary: '围绕研究和创作展开的一天。',
      model: 'deepseek-v4-flash',
      styleFingerprint,
      result: {
        imageId,
        mimeType: 'image/webp',
        byteLength: 8,
        width: 3840,
        height: 2160,
        imageModel: 'gpt-image-2',
      },
    });
    const service = new DailyReviewWallpaperService(
      {
        history: historyApi(Date.now()),
        storage: { local: {}, sync: {} },
      } as never,
      ai.service as never,
      {
        read: vi.fn(async () => ({
          ...defaultNewTabPreferences(),
          wallpaperSource: 'daily-review',
        })),
      } as never,
      state as never,
      images as never,
      history as never,
    );

    await expect(
      service.run('scheduled', new Date(2026, 7, 6, 12, 0, 0).getTime()),
    ).resolves.toMatchObject({
      status: 'ready',
      imageId,
      lastCheckTrigger: 'scheduled',
    });
    expect(images.matches).toHaveBeenCalledWith(imageId, '2026-08-05');
    expect(ai.service.readView).not.toHaveBeenCalled();
    expect(ai.service.openModelSession).not.toHaveBeenCalled();
    expect(ai.service.generateDailyReviewWallpaper).not.toHaveBeenCalled();
  });

  it('restores today completed wallpaper after the disabled state replaced it', async () => {
    const now = new Date(2026, 7, 6, 12, 0, 0).getTime();
    const imageId = dailyReviewWallpaperImageId('generation-ready');
    const styleFingerprint = currentStyleFingerprint();
    const state = stateRepository({
      status: 'disabled',
      targetDate: '2026-08-06',
      trigger: 'startup',
      updatedAt: now - 1_000,
    });
    const history = historyRepository();
    history.records.set('generation-ready', {
      id: 'generation-ready',
      targetDate: '2026-08-06',
      sourceDate: '2026-08-05',
      trigger: 'configuration',
      status: 'ready',
      startedAt: now - 20_000,
      completedAt: now - 10_000,
      finalPrompt: '创作一幅明亮、连贯且完整的中文幻想风景壁纸。',
      summary: '围绕研究和创作展开的一天。',
      model: 'deepseek-v4-flash',
      styleFingerprint,
      result: {
        imageId,
        mimeType: 'image/webp',
        byteLength: 8,
        width: 3840,
        height: 2160,
        imageModel: 'gpt-image-2',
      },
    });
    const images = {
      matches: vi.fn(async () => true),
      read: vi.fn(),
      save: vi.fn(),
    };
    const ai = aiServices();
    const service = new DailyReviewWallpaperService(
      {
        history: historyApi(Date.now()),
        storage: { local: {}, sync: {} },
      } as never,
      ai.service as never,
      {
        read: vi.fn(async () => ({
          ...defaultNewTabPreferences(),
          wallpaperSource: 'daily-review',
        })),
      } as never,
      state as never,
      images as never,
      history as never,
    );

    await expect(service.run('configuration', now)).resolves.toMatchObject({
      status: 'ready',
      generationId: 'generation-ready',
      imageId,
      lastCheckTrigger: 'configuration',
    });
    expect(images.matches).toHaveBeenCalledWith(imageId, '2026-08-05');
    expect(ai.service.readView).not.toHaveBeenCalled();
    expect(ai.service.openModelSession).not.toHaveBeenCalled();
    expect(ai.service.generateDailyReviewWallpaper).not.toHaveBeenCalled();
    expect(history.records.size).toBe(1);
  });

  it('regenerates instead of reusing an English completion from an older rule set', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'generation-replacement' });
    const now = new Date(2026, 7, 6, 12, 0, 0).getTime();
    const visitTime = new Date(2026, 7, 5, 18, 30, 0).getTime();
    const imageId = dailyReviewWallpaperImageId('generation-legacy');
    const styleFingerprint = currentStyleFingerprint();
    const state = stateRepository({
      status: 'ready',
      generationId: 'generation-legacy',
      targetDate: '2026-08-06',
      sourceDate: '2026-08-05',
      trigger: 'startup',
      startedAt: now - 20_000,
      generatedAt: now - 10_000,
      imageId,
      model: 'gpt-5.6-terra',
      imageModel: 'gpt-image-2',
      styleFingerprint,
    });
    const history = historyRepository();
    history.records.set('generation-legacy', {
      id: 'generation-legacy',
      targetDate: '2026-08-06',
      sourceDate: '2026-08-05',
      trigger: 'startup',
      status: 'ready',
      startedAt: now - 20_000,
      completedAt: now - 10_000,
      finalPrompt: '创作一幅完整的中文幻想风景壁纸。',
      summary: 'A complete summary written only in English.',
      model: 'gpt-5.6-terra',
      styleFingerprint,
      result: {
        imageId,
        mimeType: 'image/webp',
        byteLength: 8,
        width: 3840,
        height: 2160,
        imageModel: 'gpt-image-2',
      },
    });
    const images = {
      matches: vi.fn(async () => true),
      read: vi.fn(),
      save: vi.fn(async () => undefined),
    };
    const ai = aiServices();
    const service = new DailyReviewWallpaperService(
      {
        history: historyApi(visitTime),
        storage: { local: {}, sync: {} },
      } as never,
      ai.service as never,
      {
        read: vi.fn(async () => ({
          ...defaultNewTabPreferences(),
          wallpaperSource: 'daily-review',
        })),
      } as never,
      state as never,
      images as never,
      history as never,
    );

    await expect(service.run('startup', now)).resolves.toMatchObject({
      status: 'ready',
      generationId: 'generation-replacement',
    });
    expect(images.matches).not.toHaveBeenCalled();
    expect(ai.modelStream).toHaveBeenCalledTimes(1);
    expect(ai.generateDailyReviewWallpaper).toHaveBeenCalledTimes(1);
  });

  it('regenerates when the completed image used a different style', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'generation-new-style' });
    const now = new Date(2026, 7, 6, 12, 0, 0).getTime();
    const visitTime = new Date(2026, 7, 5, 18, 30, 0).getTime();
    const imageId = dailyReviewWallpaperImageId('generation-old-style');
    const state = stateRepository({
      status: 'ready',
      generationId: 'generation-old-style',
      targetDate: '2026-08-06',
      sourceDate: '2026-08-05',
      trigger: 'startup',
      startedAt: now - 20_000,
      generatedAt: now - 10_000,
      imageId,
      model: 'deepseek-v4-flash',
      imageModel: 'gpt-image-2',
      styleFingerprint: 'oldstyle',
    });
    const images = {
      matches: vi.fn(async () => true),
      read: vi.fn(),
      save: vi.fn(async () => undefined),
    };
    const ai = aiServices();
    const service = new DailyReviewWallpaperService(
      {
        history: historyApi(visitTime),
        storage: { local: {}, sync: {} },
      } as never,
      ai.service as never,
      {
        read: vi.fn(async () => ({
          ...defaultNewTabPreferences(),
          wallpaperSource: 'daily-review',
        })),
      } as never,
      state as never,
      images as never,
      historyRepository() as never,
    );

    await expect(service.run('startup', now)).resolves.toMatchObject({
      status: 'ready',
      generationId: 'generation-new-style',
    });
    expect(images.matches).not.toHaveBeenCalled();
    expect(ai.modelStream).toHaveBeenCalledTimes(1);
  });

  it('returns the running operation instead of creating a duplicate task', async () => {
    let releasePreferences:
      | ((preferences: ReturnType<typeof defaultNewTabPreferences>) => void)
      | undefined;
    const preferences = new Promise<
      ReturnType<typeof defaultNewTabPreferences>
    >((resolve) => {
      releasePreferences = resolve;
    });
    const state = stateRepository();
    const history = historyRepository();
    const service = new DailyReviewWallpaperService(
      {
        storage: { local: {}, sync: {} },
      } as never,
      aiServices().service as never,
      { read: vi.fn(async () => preferences) } as never,
      state as never,
      {
        matches: vi.fn(),
        read: vi.fn(),
        save: vi.fn(),
      } as never,
      history as never,
    );

    const first = service.start({
      trigger: 'manual',
      force: true,
      now: new Date(2026, 7, 6, 12, 0, 0).getTime(),
    });
    const second = service.start({
      trigger: 'manual',
      force: true,
    });

    expect(first.started).toBe(true);
    expect(second.started).toBe(false);
    expect(second.operation).toBe(first.operation);

    releasePreferences?.(defaultNewTabPreferences());
    await expect(first.operation).resolves.toMatchObject({
      status: 'unsupported',
      trigger: 'manual',
    });
    expect(history.records.size).toBe(1);
    expect([...history.records.values()][0]).toMatchObject({
      status: 'blocked',
      trigger: 'manual',
    });
  });

  it('does not remove a manually applied result during a disabled automatic check', async () => {
    const state = stateRepository();
    const service = new DailyReviewWallpaperService(
      {
        history: historyApi(Date.now()),
        storage: { local: {}, sync: {} },
      } as never,
      aiServices().service as never,
      {
        read: vi.fn(async () => ({
          ...defaultNewTabPreferences(),
          wallpaperSource: 'default',
        })),
      } as never,
      state as never,
      {
        matches: vi.fn(),
        read: vi.fn(),
        save: vi.fn(),
      } as never,
      historyRepository() as never,
    );

    await expect(service.run('scheduled')).resolves.toMatchObject({
      status: 'disabled',
      trigger: 'scheduled',
    });
  });

  it('recovers a saved image after the background restarts during the saving phase', async () => {
    const now = new Date(2026, 7, 6, 14, 0, 0).getTime();
    const generatedAt = now - 2_000;
    const imageId = dailyReviewWallpaperImageId('generation-saving');
    const running: DailyReviewWallpaperGenerationRecord = {
      id: 'generation-saving',
      targetDate: '2026-08-06',
      sourceDate: '2026-08-05',
      trigger: 'manual',
      status: 'running',
      phase: 'saving',
      startedAt: now - 60_000,
      finalPrompt: 'Final prompt sent to the image service.',
      model: 'deepseek-v4-flash',
      styleFingerprint: '12345678',
      result: {
        imageId,
        mimeType: 'image/webp',
        byteLength: 8,
        width: 3840,
        height: 2160,
        imageModel: 'gpt-image-2',
      },
    };
    const state = stateRepository({
      status: 'generating',
      generationId: running.id,
      targetDate: running.targetDate,
      sourceDate: running.sourceDate,
      trigger: running.trigger,
      phase: 'saving',
      startedAt: running.startedAt,
      updatedAt: generatedAt,
      styleFingerprint: running.styleFingerprint ?? '',
    });
    const history = historyRepository();
    history.records.set(running.id, running);
    const images = {
      matches: vi.fn(),
      read: vi.fn(async () => ({
        imageId,
        dataUrl: 'data:image/webp;base64,b3JpZ2luYWw=',
        mimeType: 'image/webp',
        byteLength: 8,
        width: 3840,
        height: 2160,
        sourceDate: '2026-08-05',
        generatedAt,
      })),
      save: vi.fn(),
    };
    const service = new DailyReviewWallpaperService(
      {
        history: historyApi(Date.now()),
        storage: { local: {}, sync: {} },
      } as never,
      aiServices().service as never,
      {
        read: vi.fn(async () => defaultNewTabPreferences()),
      } as never,
      state as never,
      images as never,
      history as never,
    );

    await expect(service.readSnapshot(now)).resolves.toMatchObject({
      state: {
        status: 'ready',
        generationId: running.id,
        imageId,
        generatedAt,
      },
      history: [
        {
          status: 'ready',
          result: { imageId },
        },
      ],
    });
  });
});
