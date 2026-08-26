import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  dailyReviewAutomaticGenerationPending,
  dailyReviewGenerationButtonLabel,
} from './DailyReviewWallpaperSettings';

describe('daily review wallpaper settings', () => {
  const source = readFileSync(
    new URL('./DailyReviewWallpaperSettings.tsx', import.meta.url),
    'utf8',
  );
  const styles = readFileSync(
    new URL('./new-tab-settings.css', import.meta.url),
    'utf8',
  );

  it('distinguishes first generation from regeneration immediately', () => {
    expect(dailyReviewGenerationButtonLabel(false, false)).toBe('立即生成');
    expect(dailyReviewGenerationButtonLabel(false, true)).toBe('正在生成');
    expect(dailyReviewGenerationButtonLabel(true, false)).toBe('重新生成');
    expect(dailyReviewGenerationButtonLabel(true, true)).toBe('正在重新生成');
  });

  it('treats stale disabled snapshots as an automatic start in progress', () => {
    expect(dailyReviewAutomaticGenerationPending(true, null)).toBe(true);
    expect(
      dailyReviewAutomaticGenerationPending(true, {
        status: 'disabled',
        targetDate: '2026-08-08',
        trigger: 'configuration',
        updatedAt: 1,
      }),
    ).toBe(true);
    expect(dailyReviewAutomaticGenerationPending(false, null)).toBe(false);
  });

  it('offers a bounded manual image path with the shared settings hierarchy', () => {
    expect(source).toContain('手动生成图片');
    expect(source).toContain('摘要点名全部主题，画面描述写成能认出的具体东西');
    expect(source).not.toContain('不读取历史');
    expect(source).not.toContain('只跳过历史分析');
    expect(source).toContain('normalizeDailyReviewWallpaperPlan({');
    expect(source).toContain('controller.generate(plan)');
    expect(source).toContain('DAILY_REVIEW_SUMMARY_MAX_LENGTH');
    expect(source).toContain('DAILY_REVIEW_IMAGE_PROMPT_MAX_LENGTH');
    expect(styles).toContain('.cm-new-tab-daily-custom-body');
    expect(source).toContain('cm-new-tab-daily-review-history-toggle');
    expect(styles).toContain('grid-template-rows: 0fr;');
    expect(styles).toContain('grid-template-rows: 1fr;');
    expect(styles).toContain('@media (max-width: 760px)');
  });

  it('keeps every history row on the same date, summary, status and action tracks', () => {
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) 76px;');
    expect(styles).toContain('minmax(180px, 28%)');
    expect(styles).toContain('grid-template-columns: repeat(2, 38px);');
    expect(styles).toMatch(
      /\.cm-new-tab-daily-record-actions:empty\s*\{[^}]*visibility:\s*hidden;/u,
    );
    expect(source).toContain('cm-new-tab-daily-record-action-copy');
    expect(source).toContain('cm-new-tab-daily-record-action-image');
  });
});
