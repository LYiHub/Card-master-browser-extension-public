import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  dailyReviewAvailable,
  dailyReviewReadinessIssue,
  newTabSettingsCapabilities,
  newTabWallpaperToneForTheme,
  resolveEffectiveWallpaperSource,
  visibleNewTabSettingsSections,
} from './NewTabSettingsPage';

describe('new tab wallpaper mode readiness', () => {
  const source = readFileSync(
    new URL('./NewTabSettingsPage.tsx', import.meta.url),
    'utf8',
  );
  const styles = readFileSync(
    new URL('./new-tab-settings.css', import.meta.url),
    'utf8',
  );

  it('requires only the image service for custom wallpaper creation', () => {
    expect(
      dailyReviewReadinessIssue({
        modelServiceConfigured: false,
        imageServiceConfigured: false,
      })?.detail,
    ).toContain('图像服务');
    expect(
      dailyReviewReadinessIssue({
        modelServiceConfigured: false,
        imageServiceConfigured: true,
      }),
    ).toBeNull();
    expect(
      dailyReviewReadinessIssue({
        modelServiceConfigured: true,
        imageServiceConfigured: false,
      })?.title,
    ).toBe('图像服务尚未配置');
  });

  it('reports readiness failures without blocking a configured image service', () => {
    expect(
      dailyReviewReadinessIssue({
        modelServiceConfigured: true,
        imageServiceConfigured: true,
      }),
    ).toBeNull();
    expect(dailyReviewReadinessIssue(null, '配置读取失败')).toEqual({
      title: '无法检查 AI 服务配置',
      detail: '配置读取失败',
    });
  });

  it('enables the wallpaper source as soon as image generation is configured', () => {
    expect(dailyReviewAvailable(null)).toBe(false);
    expect(
      dailyReviewAvailable({
        modelServiceConfigured: true,
        imageServiceConfigured: false,
      }),
    ).toBe(false);
    expect(
      dailyReviewAvailable(
        {
          modelServiceConfigured: true,
          imageServiceConfigured: true,
        },
        '配置读取失败',
      ),
    ).toBe(false);
    expect(
      dailyReviewAvailable({
        modelServiceConfigured: false,
        imageServiceConfigured: true,
      }),
    ).toBe(true);
  });

  it('never presents unavailable AI wallpaper as the selected source', () => {
    expect(resolveEffectiveWallpaperSource('default', false)).toBe('default');
    expect(resolveEffectiveWallpaperSource('daily-review', false)).toBe(
      'default',
    );
    expect(resolveEffectiveWallpaperSource('default', true)).toBe('default');
    expect(resolveEffectiveWallpaperSource('daily-review', true)).toBe(
      'daily-review',
    );
  });

  it('keeps wallpaper controls aligned with the resolved page theme', () => {
    expect(newTabWallpaperToneForTheme('light', true)).toBe('light');
    expect(newTabWallpaperToneForTheme('dark', false)).toBe('dark');
    expect(newTabWallpaperToneForTheme('system', false)).toBe('light');
    expect(newTabWallpaperToneForTheme('system', true)).toBe('dark');
  });

  it('uses two explicit inactivity thresholds with matching controls', () => {
    const idleSettings = source.slice(
      source.indexOf('label="静置进入时间"'),
      source.indexOf('label="每日回顾画面风格"'),
    );
    expect(idleSettings).toContain('label="最长等待时间"');
    expect(idleSettings.match(/<select/gu)).toHaveLength(2);
    expect(idleSettings).toContain('DAILY_REVIEW_WALLPAPER_IDLE_SECONDS');
    expect(idleSettings).toContain('DAILY_REVIEW_WALLPAPER_FORCE_SECONDS');
    expect(idleSettings).not.toContain('type="range"');
    expect(idleSettings).not.toContain('无论鼠标是否持续活动');
  });

  it('offers bounded AI wallpaper retention choices', () => {
    expect(source).toContain('label="自动保留"');
    expect(source).toContain('DAILY_REVIEW_WALLPAPER_RETENTION_DAY_OPTIONS');
    expect(source).toContain("'dailyReviewRetentionDays'");
    expect(source).toContain(
      'retentionDays={preferences.dailyReviewRetentionDays}',
    );
  });

  it('lets users hide only the new-tab prompt surface', () => {
    expect(source).toContain('label="顶部展示提示词"');
    expect(source).toContain("patch('dailyReviewShowPrompt', checked)");
    expect(source).toContain('生成历史中的提示词仍会保留');
  });

  it('expands generation history downward without scroll anchoring jumps', () => {
    expect(styles).toContain('overflow-anchor: none;');
    expect(styles).toMatch(
      /\.cm-new-tab-daily-review-history\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto auto;[^}]*align-content:\s*start;/u,
    );
  });

  it('keeps the default source first while allowing the AI status panel to open', () => {
    const tabs = source.slice(
      source.indexOf('aria-label="壁纸来源" role="tablist"'),
    );
    expect(tabs.indexOf('默认壁纸')).toBeLessThan(tabs.indexOf('AI 每日回顾'));
    expect(tabs).toContain("selectWallpaperSource('daily-review')");
    expect(tabs).toContain(
      "wallpaperSourcePanel === 'daily-review' && dailyReviewIssue",
    );
    expect(source).toContain('await dailyReviewController.readReadiness();');
    expect(source).toContain('await openAiSettings();');
  });

  it('keeps AI setup messages out of the default wallpaper panel', () => {
    expect(source).toContain("wallpaperSourcePanel === 'default'");
    expect(source).toContain('aria-label="默认壁纸设置"');
    expect(source).toContain('aria-label="壁纸颜色模式"');
    expect(source).toContain('NEW_TAB_BUILTIN_WALLPAPERS.map');
    expect(source).not.toContain('无壁纸');
    expect(source).toContain('className="cm-new-tab-wallpaper-check"');
    expect(source).toContain('localWallpapers.map');
    expect(source).toContain('wallpaper.thumbnailDataUrl');
    expect(source).toContain('.readAll()');
    expect(source).not.toContain("'local'");
    expect(source).not.toContain('每日回顾图片规格');
  });

  it('uses the upstream wallpaper control hierarchy for filters', () => {
    expect(source).toContain('className="cm-new-tab-wallpaper-effect-tabs"');
    expect(source).toContain("preferences.wallpaperEffect !== 'none'");
    expect(source).toContain("preferences.wallpaperEffect === 'halftone'");
    expect(styles).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr));',
    );
    expect(styles).toMatch(
      /\.cm-new-tab-wallpaper-picker\s+\[data-selected="true"\]/u,
    );
    expect(styles).toMatch(
      /\.cm-new-tab-wallpaper-tone-tab\[data-selected="true"\]/u,
    );
    expect(styles).toContain('.cm-new-tab-wallpaper-current');
  });

  it('gives the active settings category an unmistakable filled state', () => {
    expect(styles).toContain(
      '.cm-new-tab-settings-layout > nav button[data-selected="true"]',
    );
    expect(styles).toContain('background: var(--cm-nt-accent);');
    expect(styles).toContain('color: #fff;');
  });

  it('hides bookmark, favicon and history home settings on Safari', () => {
    const safari = visibleNewTabSettingsSections(
      newTabSettingsCapabilities('safari'),
    ).map((item) => item.id);
    expect(safari).toEqual([
      'general',
      'appearance',
      'wallpaper',
      'search',
      'engines',
      'blacklist',
      'shortcuts',
    ]);
    expect(
      visibleNewTabSettingsSections(newTabSettingsCapabilities('firefox')).map(
        (item) => item.id,
      ),
    ).not.toContain('favicons');
    expect(
      visibleNewTabSettingsSections(newTabSettingsCapabilities('chromium')).map(
        (item) => item.id,
      ),
    ).toContain('favicons');
  });

  it('renders one continuous settings document with linked scroll navigation', () => {
    expect(source).toContain(
      '<SettingsContentSection id="general" label="常规">',
    );
    expect(source).toContain(
      '<SettingsContentSection id="wallpaper" label="壁纸">',
    );
    expect(source).toContain(
      '<SettingsContentSection id="favicons" label="图标与主题色">',
    );
    expect(source).not.toContain("{section === 'general'");
    expect(source).not.toContain("{section === 'wallpaper'");
    expect(source).toContain('scrollIntoView({');
    expect(source).toContain('window.location.hash ===');
    expect(source).toContain('settingsSectionDomId(item.id)');
    expect(source).toContain("behavior: 'auto'");
    expect(source).toContain('new ResizeObserver(scheduleUpdate)');
    expect(source).toContain('onClick={() => scrollToSection(item.id)}');
    expect(styles).toContain('scroll-margin-top: 104px;');
    expect(styles).toMatch(
      /body,\s*#new-tab-settings-root\s*\{[^}]*overflow: visible;/u,
    );
    expect(styles).toContain(
      '.cm-new-tab-settings-section[data-settings-section="wallpaper"]',
    );
  });
});
