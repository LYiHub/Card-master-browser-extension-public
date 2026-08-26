import { describe, expect, it } from 'vitest';

import {
  buildDailyHistorySource,
  buildDailyReviewImagePrompt,
  buildDailyReviewModelInput,
  buildDailyReviewWallpaperGallery,
  DAILY_REVIEW_IMAGE_PROMPT_MAX_LENGTH,
  DAILY_REVIEW_SUMMARY_MAX_LENGTH,
  DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE,
  type DailyReviewWallpaperGenerationRecord,
  dailyReviewPromptUsesChinese,
  parseDailyReviewWallpaperPlan,
  resolveDailyReviewWallpaperDisplay,
  resolveDailyReviewWallpaperGallerySelection,
  sanitizeHistoryUrl,
} from './daily-review-wallpaper';

describe('daily history wallpaper', () => {
  it('removes credentials, query strings and fragments from history URLs', () => {
    expect(
      sanitizeHistoryUrl(
        'https://user:secret@example.com/watch?id=private#chapter',
      ),
    ).toBe('https://example.com/watch');
    expect(sanitizeHistoryUrl('chrome://history/')).toBeNull();
  });

  it('preserves every visit in chronological order while aggregating pages', () => {
    const morning = new Date(2026, 7, 5, 9, 15, 0).getTime();
    const evening = new Date(2026, 7, 5, 20, 30, 0).getTime();
    const historyUrl = 'https://example.com/article?token=secret';
    const items: chrome.history.HistoryItem[] = [
      {
        id: 'one',
        title: 'Example',
        url: historyUrl,
        lastVisitTime: evening,
        visitCount: 2,
      },
    ];
    const source = buildDailyHistorySource(
      items,
      new Map([
        [
          historyUrl,
          [
            {
              id: 'visit-2',
              visitId: 'visit-2',
              visitTime: evening,
              referringVisitId: '0',
              transition: 'link',
              isLocal: true,
            },
            {
              id: 'visit-1',
              visitId: 'visit-1',
              visitTime: morning,
              referringVisitId: '0',
              transition: 'typed',
              isLocal: true,
            },
          ],
        ],
      ]),
      '2026-08-05',
    );

    expect(source.pages).toEqual([
      {
        id: 'p1',
        title: 'Example',
        url: 'https://example.com/article',
        visitCount: 2,
        firstVisitTime: '2026-08-05 09:15:00',
        lastVisitTime: '2026-08-05 20:30:00',
        transitions: { typed: 1, link: 1 },
      },
    ]);
    expect(source.timeline.map((entry) => entry.time)).toEqual([
      '2026-08-05 09:15:00',
      '2026-08-05 20:30:00',
    ]);
  });

  it('asks the planner to name every theme and depict each one concretely', () => {
    const input = buildDailyReviewModelInput({
      sourceDate: '2026-08-05',
      pages: [],
      timeline: [],
    });

    expect(input).toContain('点名当天所有主要浏览主题');
    expect(input).toContain('能一眼认出的具体道具');
    expect(input).toContain('禁止只用光、雾、根系、色块等意象代替主题');
    expect(input).toContain(
      '每个主要主题都必须在 summary 和 image_prompt 里同时出现',
    );
  });

  it('accepts only the summary and image prompt fields', () => {
    const plan = parseDailyReviewWallpaperPlan(
      JSON.stringify({
        summary: '一天围绕创作和研究展开。',
        image_prompt:
          '一座明亮的手绘观星台在清晨苏醒，地图、书籍和发光路径自然汇入同一片冒险风景。',
      }),
    );

    expect(plan.summary).toBe('一天围绕创作和研究展开。');
    expect(() =>
      parseDailyReviewWallpaperPlan(
        JSON.stringify({ ...plan, unexpected: true }),
      ),
    ).toThrow('缺失或多余字段');
    expect(() =>
      parseDailyReviewWallpaperPlan(
        JSON.stringify({
          ...plan,
          image_prompt: 'A complete scene written only in English.',
        }),
      ),
    ).toThrow('必须使用简体中文');
    expect(
      dailyReviewPromptUsesChinese(
        '中文开头 followed by a complete English sentence here.',
      ),
    ).toBe(false);
    expect(() =>
      parseDailyReviewWallpaperPlan(
        JSON.stringify({
          ...plan,
          summary: 'A complete summary written in English.',
        }),
      ),
    ).toThrow('摘要必须使用简体中文');
    expect(() =>
      parseDailyReviewWallpaperPlan(
        JSON.stringify({
          ...plan,
          summary: `中文${'长'.repeat(DAILY_REVIEW_SUMMARY_MAX_LENGTH)}`,
        }),
      ),
    ).toThrow('摘要过长');
    expect(() =>
      parseDailyReviewWallpaperPlan(
        JSON.stringify({
          ...plan,
          image_prompt: `中文${'长'.repeat(
            DAILY_REVIEW_IMAGE_PROMPT_MAX_LENGTH,
          )}`,
        }),
      ),
    ).toThrow('生图提示词过长');
  });

  it('builds a cover-safe prompt without embedding output dimensions', () => {
    const prompt = buildDailyReviewImagePrompt(
      DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE,
      {
        summary: '摘要',
        image_prompt: '一座连贯的幻想城市在温暖晨光中苏醒。',
      },
    );

    expect(
      prompt.startsWith('生图提示词：一座连贯的幻想城市在温暖晨光中苏醒。'),
    ).toBe(true);
    expect(prompt.indexOf('生图提示词：')).toBeLessThan(
      prompt.indexOf('手绘幻想风景'),
    );
    expect(prompt).not.toContain('3840×2160');
    expect(prompt).toContain('横向 16:9');
    expect(prompt).toContain('中央安全区域');
    expect(prompt).toContain('不得出现任何文字');
    expect(prompt).toContain('不得覆盖或削弱');
  });

  it('keeps the previous successful image while a new daily review is generating', () => {
    const previous = {
      id: 'generation-previous',
      targetDate: '2026-08-06',
      sourceDate: '2026-08-05',
      trigger: 'startup',
      status: 'ready',
      startedAt: 1,
      result: {
        imageId: 'daily:previous',
        mimeType: 'image/webp',
        byteLength: 8,
        width: 3840,
        height: 2160,
        imageModel: 'gpt-image-2',
      },
    } as const;

    expect(
      resolveDailyReviewWallpaperDisplay(
        {
          status: 'generating',
          generationId: 'generation-current',
          targetDate: '2026-08-07',
          trigger: 'startup',
          phase: 'generating-image',
          startedAt: 2,
          updatedAt: 3,
          styleFingerprint: '12345678',
        },
        [
          {
            id: 'generation-current',
            targetDate: '2026-08-07',
            trigger: 'startup',
            status: 'running',
            phase: 'generating-image',
            startedAt: 2,
          },
          previous,
        ],
      ),
    ).toEqual({
      status: 'generating',
      imageId: 'daily:previous',
      record: previous,
    });
  });

  it('leaves the system wallpaper selected during the first generation', () => {
    expect(
      resolveDailyReviewWallpaperDisplay(
        {
          status: 'generating',
          generationId: 'generation-first',
          targetDate: '2026-08-07',
          trigger: 'configuration',
          phase: 'generating-image',
          startedAt: 1,
          updatedAt: 2,
          styleFingerprint: '12345678',
        },
        [
          {
            id: 'generation-first',
            targetDate: '2026-08-07',
            trigger: 'configuration',
            status: 'running',
            phase: 'generating-image',
            startedAt: 1,
          },
        ],
      ),
    ).toEqual({
      status: 'generating',
      imageId: '',
      record: null,
    });
  });

  it('keeps every successful generation available for gallery navigation', () => {
    const readyRecord = (
      id: string,
      sourceDate: string,
      completedAt: number,
    ): DailyReviewWallpaperGenerationRecord => ({
      id,
      targetDate: '2026-08-07',
      sourceDate,
      trigger: 'manual',
      status: 'ready',
      startedAt: completedAt - 10,
      completedAt,
      finalPrompt: `提示词 ${id}`,
      summary: `摘要 ${id}`,
      result: {
        imageId: `daily:${id}`,
        mimeType: 'image/webp',
        byteLength: 8,
        width: 3840,
        height: 2160,
        imageModel: 'gpt-image-2',
      },
    });

    expect(
      buildDailyReviewWallpaperGallery([
        readyRecord('august-5-old', '2026-08-05', 100),
        readyRecord('august-6', '2026-08-06', 200),
        readyRecord('august-5-new', '2026-08-05', 300),
        {
          ...readyRecord('failed', '2026-08-07', 400),
          status: 'failed',
          result: undefined,
        },
      ]).map((item) => ({
        generationId: item.generationId,
        sourceDate: item.sourceDate,
      })),
    ).toEqual([
      {
        generationId: 'august-5-old',
        sourceDate: '2026-08-05',
      },
      {
        generationId: 'august-5-new',
        sourceDate: '2026-08-05',
      },
      {
        generationId: 'august-6',
        sourceDate: '2026-08-06',
      },
    ]);
  });

  it('persists a manual date selection while no newer generation exists', () => {
    const items = [
      {
        generationId: 'older',
        imageId: 'daily:older',
        targetDate: '2026-08-06',
        sourceDate: '2026-08-05',
        generatedAt: 100,
        finalPrompt: '',
        summary: '',
      },
      {
        generationId: 'latest',
        imageId: 'daily:latest',
        targetDate: '2026-08-07',
        sourceDate: '2026-08-06',
        generatedAt: 200,
        finalPrompt: '',
        summary: '',
      },
    ];

    expect(
      resolveDailyReviewWallpaperGallerySelection(items, {
        selectedGenerationId: 'older',
        latestGenerationId: 'latest',
      }),
    ).toEqual({
      index: 0,
      latestIndex: 1,
      state: {
        selectedGenerationId: 'older',
        latestGenerationId: 'latest',
      },
    });
  });

  it('selects a newly generated wallpaper ahead of a persisted manual date', () => {
    const items = [
      {
        generationId: 'older',
        imageId: 'daily:older',
        targetDate: '2026-08-06',
        sourceDate: '2026-08-05',
        generatedAt: 100,
        finalPrompt: '',
        summary: '',
      },
      {
        generationId: 'previous-latest',
        imageId: 'daily:previous-latest',
        targetDate: '2026-08-07',
        sourceDate: '2026-08-06',
        generatedAt: 200,
        finalPrompt: '',
        summary: '',
      },
      {
        generationId: 'new-latest',
        imageId: 'daily:new-latest',
        targetDate: '2026-08-08',
        sourceDate: '2026-08-07',
        generatedAt: 300,
        finalPrompt: '',
        summary: '',
      },
    ];

    expect(
      resolveDailyReviewWallpaperGallerySelection(items, {
        selectedGenerationId: 'older',
        latestGenerationId: 'previous-latest',
      }),
    ).toEqual({
      index: 2,
      latestIndex: 2,
      state: {
        selectedGenerationId: 'new-latest',
        latestGenerationId: 'new-latest',
      },
    });
  });

  it('resolves an explicit return-to-latest selection to the latest image', () => {
    const items = [
      {
        generationId: 'older',
        imageId: 'daily:older',
        targetDate: '2026-08-06',
        sourceDate: '2026-08-05',
        generatedAt: 100,
        finalPrompt: '',
        summary: '',
      },
      {
        generationId: 'latest',
        imageId: 'daily:latest',
        targetDate: '2026-08-07',
        sourceDate: '2026-08-06',
        generatedAt: 200,
        finalPrompt: '',
        summary: '',
      },
    ];

    expect(
      resolveDailyReviewWallpaperGallerySelection(items, {
        selectedGenerationId: 'latest',
        latestGenerationId: 'latest',
      }),
    ).toEqual({
      index: 1,
      latestIndex: 1,
      state: {
        selectedGenerationId: 'latest',
        latestGenerationId: 'latest',
      },
    });
  });
});
