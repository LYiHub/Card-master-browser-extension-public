import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExtensionStorageArea } from '../../hosts/extension/api';
import { DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE } from './daily-review-wallpaper';
import {
  defaultNewTabPreferences,
  LUMNO_GLOBAL_THEME_STORAGE_KEY,
  LUMNO_LANGUAGE_STORAGE_KEY,
  LUMNO_LOCAL_WALLPAPER_STORAGE_KEY,
  LUMNO_NEW_TAB_SEARCH_WIDTH_STORAGE_KEY,
  LUMNO_NEW_TAB_THEME_MODE_STORAGE_KEY,
  LUMNO_NEW_TAB_THEME_SCOPE_STORAGE_KEY,
  LUMNO_SHORTCUTS_STORAGE_KEY,
  LUMNO_UPDATE_NOTICE_ENABLED_STORAGE_KEY,
  LUMNO_UPDATE_NOTICE_STORAGE_KEY,
  LUMNO_WALLPAPER_EFFECT_STORAGE_KEY,
  LUMNO_WALLPAPER_OVERLAY_STORAGE_KEY,
  LUMNO_WALLPAPER_STORAGE_KEY,
  NEW_TAB_PREFERENCES_STORAGE_KEY,
  NewTabPreferencesRepository,
  normalizeNewTabPreferences,
  parseNewTabDestinationUrl,
} from './preferences';

describe('new tab preferences', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes malformed values without creating language settings', () => {
    expect(
      normalizeNewTabPreferences({
        version: 1,
        revision: 3,
        recentMode: 'most-visited',
        hiddenSiteUrls: [' https://example.com/ ', 'https://example.com/'],
        pinnedSiteUrls: [null, 'https://pinned.example/'],
        shortcuts: [
          {
            id: 'shortcut-lumno-default',
            title: 'Lumno',
            url: 'https://lumno.kubai.design/',
          },
          {
            id: 'one',
            title: 'Example',
            url: 'https://example.com/',
          },
          {
            id: 'invalid',
            title: 'Invalid',
            url: 'javascript:alert(1)',
          },
        ],
        locale: 'en',
        language: 'English',
      }),
    ).toMatchObject({
      version: 1,
      revision: 3,
      recentMode: 'most-visited',
      hiddenSiteUrls: ['https://example.com/'],
      pinnedSiteUrls: ['https://pinned.example/'],
      shortcuts: [
        {
          id: 'one',
          title: 'Example',
          url: 'https://example.com/',
        },
      ],
    });
    expect(
      normalizeNewTabPreferences({
        version: 1,
        locale: 'en',
        language: 'English',
      }),
    ).not.toHaveProperty('locale');
    expect(
      normalizeNewTabPreferences({
        version: 1,
        wallpaperSource: 'default',
        dailyReviewReasoningEnabled: false,
        dailyReviewShowPrompt: false,
        dailyReviewIdleSeconds: 99,
        dailyReviewForceSeconds: 180,
        dailyReviewRetentionDays: 30,
        dailyReviewStyleOverride: '  明亮的手绘幻想风格。  ',
      }),
    ).toMatchObject({
      wallpaperSource: 'default',
      dailyReviewReasoningEnabled: false,
      dailyReviewShowPrompt: false,
      dailyReviewIdleSeconds: 5,
      dailyReviewForceSeconds: 180,
      dailyReviewRetentionDays: 30,
      dailyReviewStyleOverride: '明亮的手绘幻想风格。',
    });
    expect(
      normalizeNewTabPreferences({
        version: 1,
        dailyReviewStyleOverride: 'English only style.',
      }).dailyReviewStyleOverride,
    ).toBe('');
    expect(defaultNewTabPreferences()).toMatchObject({
      themeMode: 'system',
      wallpaperSource: 'default',
      dailyReviewReasoningEnabled: true,
      dailyReviewShowPrompt: true,
      dailyReviewIdleSeconds: 5,
      dailyReviewForceSeconds: 60,
      dailyReviewRetentionDays: 7,
      dailyReviewStyleOverride: '',
      wallpaperLight: 'monet-coastal-white',
      wallpaperDark: 'dark-monet-lily-nocturne',
    });
    expect(
      normalizeNewTabPreferences({
        version: 1,
        wallpaperLight: '',
        wallpaperDark: '',
      }),
    ).toMatchObject({
      wallpaperLight: 'monet-coastal-white',
      wallpaperDark: 'dark-monet-lily-nocturne',
    });
    expect(DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE).toContain('手绘幻想风景');
    expect(
      normalizeNewTabPreferences({
        version: 1,
        dailyReviewRetentionDays: 365,
      }).dailyReviewRetentionDays,
    ).toBe(7);
  });

  it('keeps default wallpaper preferences independent from the AI source', async () => {
    let local: Record<string, unknown> = {
      [NEW_TAB_PREFERENCES_STORAGE_KEY]: {
        ...defaultNewTabPreferences(),
        wallpaperSource: 'daily-review',
      },
    };
    const repository = new NewTabPreferencesRepository({
      get: async () => local,
      set: async (items) => {
        local = { ...local, ...items };
      },
      remove: async (key) => {
        for (const entry of Array.isArray(key) ? key : [key]) {
          delete local[String(entry)];
        }
      },
      setAccessLevel: async () => undefined,
    });

    await repository.mutate((current) => ({
      ...current,
      wallpaperSource: 'default',
    }));

    expect(local[NEW_TAB_PREFERENCES_STORAGE_KEY]).toMatchObject({
      wallpaperSource: 'default',
      wallpaperLight: 'monet-coastal-white',
      wallpaperDark: 'dark-monet-lily-nocturne',
    });
  });

  it('serializes concurrent mutations and advances the revision', async () => {
    let stored: Record<string, unknown> = {
      [NEW_TAB_PREFERENCES_STORAGE_KEY]: defaultNewTabPreferences(),
    };
    const repository = new NewTabPreferencesRepository({
      get: async () => stored,
      set: async (items) => {
        stored = { ...stored, ...items };
      },
      remove: async () => undefined,
      setAccessLevel: async () => undefined,
    });

    const first = repository.mutate((current) => ({
      ...current,
      pinnedSiteUrls: ['https://first.example/'],
    }));
    const second = repository.mutate((current) => ({
      ...current,
      hiddenSiteUrls: ['https://second.example/'],
    }));

    await expect(first).resolves.toMatchObject({ revision: 1 });
    await expect(second).resolves.toMatchObject({
      revision: 2,
      pinnedSiteUrls: ['https://first.example/'],
      hiddenSiteUrls: ['https://second.example/'],
    });
  });

  it('accepts only browser-safe destination pages', () => {
    expect(parseNewTabDestinationUrl('www.bilibili.com')).toBe(
      'https://www.bilibili.com/',
    );
    expect(parseNewTabDestinationUrl('')).toBe('');
    expect(() => parseNewTabDestinationUrl('javascript:alert(1)')).toThrow(
      '指定页面仅支持 http 或 https 网址。',
    );
  });

  it('reads preferences without writing runtime compatibility state', async () => {
    let writes = 0;
    const repository = new NewTabPreferencesRepository({
      get: async () => ({
        [NEW_TAB_PREFERENCES_STORAGE_KEY]: defaultNewTabPreferences(),
      }),
      set: async () => {
        writes += 1;
      },
      remove: async () => {
        writes += 1;
      },
      setAccessLevel: async () => undefined,
    });

    await expect(repository.read()).resolves.toMatchObject({
      version: 1,
      destinationUrl: '',
    });
    expect(writes).toBe(0);
  });

  it('synchronizes the selected theme with the embedded new tab runtime', async () => {
    let local: Record<string, unknown> = {
      [NEW_TAB_PREFERENCES_STORAGE_KEY]: defaultNewTabPreferences(),
      [LUMNO_UPDATE_NOTICE_STORAGE_KEY]: { version: 'upstream' },
    };
    let sync: Record<string, unknown> = {
      [LUMNO_LANGUAGE_STORAGE_KEY]: 'en',
      [LUMNO_NEW_TAB_THEME_MODE_STORAGE_KEY]: 'dark',
      [LUMNO_SHORTCUTS_STORAGE_KEY]: [
        {
          id: 'shortcut-lumno-default',
          title: 'Lumno',
          url: 'https://lumno.kubai.design/',
        },
        {
          id: 'user-shortcut',
          title: '用户快捷方式',
          url: 'https://example.com/',
        },
      ],
      [LUMNO_UPDATE_NOTICE_ENABLED_STORAGE_KEY]: true,
    };
    const repository = new NewTabPreferencesRepository(
      {
        get: async () => local,
        set: async (items) => {
          local = { ...local, ...items };
        },
        remove: async (key) => {
          delete local[String(key)];
        },
        setAccessLevel: async () => undefined,
      },
      {
        get: async () => sync,
        set: async (items) => {
          sync = { ...sync, ...items };
        },
        remove: async (key) => {
          delete sync[String(key)];
        },
        setAccessLevel: async () => undefined,
      },
    );

    await repository.synchronize(await repository.read());
    expect(sync).toMatchObject({
      [LUMNO_LANGUAGE_STORAGE_KEY]: 'zh_CN',
      [LUMNO_GLOBAL_THEME_STORAGE_KEY]: 'system',
      [LUMNO_NEW_TAB_THEME_MODE_STORAGE_KEY]: 'global',
      [LUMNO_NEW_TAB_THEME_SCOPE_STORAGE_KEY]: 'home',
      [LUMNO_NEW_TAB_SEARCH_WIDTH_STORAGE_KEY]: 720,
      [LUMNO_SHORTCUTS_STORAGE_KEY]: [
        {
          id: 'user-shortcut',
          title: '用户快捷方式',
          url: 'https://example.com/',
        },
      ],
      [LUMNO_UPDATE_NOTICE_ENABLED_STORAGE_KEY]: false,
      [LUMNO_WALLPAPER_OVERLAY_STORAGE_KEY]: {
        version: 2,
        light: 18,
        dark: 18,
      },
      [LUMNO_WALLPAPER_EFFECT_STORAGE_KEY]: {
        version: 4,
        light: {
          version: 3,
          type: 'none',
          strength: 45,
          size: 50,
          spacing: 50,
        },
        dark: {
          version: 3,
          type: 'none',
          strength: 45,
          size: 50,
          spacing: 50,
        },
      },
      [LUMNO_WALLPAPER_STORAGE_KEY]: {
        version: 2,
        sameForModes: false,
        light: 'monet-coastal-white',
        dark: 'dark-monet-lily-nocturne',
      },
    });
    expect(local[LUMNO_LOCAL_WALLPAPER_STORAGE_KEY]).toBe('');
    expect(local[LUMNO_UPDATE_NOTICE_STORAGE_KEY]).toBeUndefined();

    await repository.mutate((current) => ({
      ...current,
      themeMode: 'system',
    }));
    expect(sync).toMatchObject({
      [LUMNO_GLOBAL_THEME_STORAGE_KEY]: 'system',
      [LUMNO_NEW_TAB_THEME_MODE_STORAGE_KEY]: 'global',
      [LUMNO_NEW_TAB_THEME_SCOPE_STORAGE_KEY]: 'home',
    });

    await repository.mutate((current) => ({
      ...current,
      themeMode: 'dark',
    }));
    expect(sync).toMatchObject({
      [LUMNO_NEW_TAB_THEME_MODE_STORAGE_KEY]: 'dark',
      [LUMNO_NEW_TAB_THEME_SCOPE_STORAGE_KEY]: 'home',
    });
  });

  it('adopts wallpaper changes made by the embedded runtime', async () => {
    let local: Record<string, unknown> = {
      [NEW_TAB_PREFERENCES_STORAGE_KEY]: defaultNewTabPreferences(),
    };
    let sync: Record<string, unknown> = {};
    const repository = new NewTabPreferencesRepository(
      {
        get: async () => local,
        set: async (items) => {
          local = { ...local, ...items };
        },
        remove: async (key) => {
          delete local[String(key)];
        },
        setAccessLevel: async () => undefined,
      },
      {
        get: async () => sync,
        set: async (items) => {
          sync = { ...sync, ...items };
        },
        remove: async (key) => {
          delete sync[String(key)];
        },
        setAccessLevel: async () => undefined,
      },
    );

    sync[LUMNO_WALLPAPER_STORAGE_KEY] = {
      version: 2,
      sameForModes: false,
      light: 'white-shanshui',
      dark: 'dark-shanshui-moonlit',
    };
    await expect(
      repository.adoptRuntimeWallpaperState(),
    ).resolves.toMatchObject({
      revision: 1,
      wallpaperLight: 'white-shanshui',
      wallpaperDark: 'dark-shanshui-moonlit',
    });
    expect(
      (
        local[NEW_TAB_PREFERENCES_STORAGE_KEY] as {
          wallpaperDark: string;
        }
      ).wallpaperDark,
    ).toBe('dark-shanshui-moonlit');

    await expect(
      repository.adoptRuntimeWallpaperOverlay({
        version: 2,
        light: 36,
        dark: 36,
      }),
    ).resolves.toMatchObject({
      revision: 2,
      wallpaperMask: 36,
    });
    await expect(
      repository.adoptRuntimeWallpaperEffect({
        version: 4,
        light: {
          version: 3,
          type: 'grain',
          strength: 72,
          size: 44,
          spacing: 61,
        },
        dark: {
          version: 3,
          type: 'grain',
          strength: 72,
          size: 44,
          spacing: 61,
        },
      }),
    ).resolves.toMatchObject({
      revision: 3,
      wallpaperEffect: 'grain',
      wallpaperEffectStrength: 72,
      wallpaperEffectSize: 44,
      wallpaperEffectSpacing: 61,
    });
  });

  it('keeps local wallpaper ids in local storage while preserving synced fallbacks', async () => {
    const customLight = 'custom-wallpaper-light';
    const customDark = 'custom-wallpaper-dark';
    let local: Record<string, unknown> = {
      [NEW_TAB_PREFERENCES_STORAGE_KEY]: defaultNewTabPreferences(),
      [LUMNO_LOCAL_WALLPAPER_STORAGE_KEY]: {
        version: 2,
        light: customLight,
        dark: customDark,
      },
    };
    let sync: Record<string, unknown> = {
      [LUMNO_WALLPAPER_STORAGE_KEY]: {
        version: 2,
        sameForModes: false,
        light: 'white-shanshui',
        dark: 'dark-shanshui-moonlit',
      },
    };
    const repository = new NewTabPreferencesRepository(
      {
        get: async () => local,
        set: async (items) => {
          local = { ...local, ...items };
        },
        remove: async () => undefined,
        setAccessLevel: async () => undefined,
      },
      {
        get: async () => sync,
        set: async (items) => {
          sync = { ...sync, ...items };
        },
        remove: async () => undefined,
        setAccessLevel: async () => undefined,
      },
    );

    await expect(
      repository.adoptRuntimeWallpaperState(),
    ).resolves.toMatchObject({
      wallpaperLight: customLight,
      wallpaperDark: customDark,
    });
    await repository.synchronize(await repository.read());

    expect(sync[LUMNO_WALLPAPER_STORAGE_KEY]).toMatchObject({
      light: 'white-shanshui',
      dark: 'dark-shanshui-moonlit',
    });
    expect(local[LUMNO_LOCAL_WALLPAPER_STORAGE_KEY]).toEqual({
      version: 2,
      light: customLight,
      dark: customDark,
    });
  });

  it('updates the fallback wallpaper without changing the AI source', async () => {
    let local: Record<string, unknown> = {
      [NEW_TAB_PREFERENCES_STORAGE_KEY]: {
        ...defaultNewTabPreferences(),
        wallpaperSource: 'daily-review',
      },
    };
    const repository = new NewTabPreferencesRepository({
      get: async () => local,
      set: async (items) => {
        local = { ...local, ...items };
      },
      remove: async (key) => {
        for (const entry of Array.isArray(key) ? key : [key]) {
          delete local[String(entry)];
        }
      },
      setAccessLevel: async () => undefined,
    });

    local[LUMNO_WALLPAPER_STORAGE_KEY] = {
      version: 2,
      sameForModes: false,
      light: 'white-shanshui',
      dark: 'dark-shanshui-moonlit',
    };
    await expect(
      repository.adoptRuntimeWallpaperState(),
    ).resolves.toMatchObject({
      wallpaperSource: 'daily-review',
      wallpaperLight: 'white-shanshui',
      wallpaperDark: 'dark-shanshui-moonlit',
    });
  });

  it('preserves the selected default wallpapers while toggling the AI source', async () => {
    let local: Record<string, unknown> = {
      [NEW_TAB_PREFERENCES_STORAGE_KEY]: {
        ...defaultNewTabPreferences(),
        wallpaperLight: 'white-shanshui',
        wallpaperDark: 'dark-shanshui-moonlit',
      },
    };
    const repository = new NewTabPreferencesRepository({
      get: async () => local,
      set: async (items) => {
        local = { ...local, ...items };
      },
      remove: async (key) => {
        for (const entry of Array.isArray(key) ? key : [key]) {
          delete local[String(entry)];
        }
      },
      setAccessLevel: async () => undefined,
    });

    await repository.mutate((current) => ({
      ...current,
      wallpaperSource: 'daily-review',
    }));
    await expect(
      repository.mutate((current) => ({
        ...current,
        wallpaperSource: 'default',
      })),
    ).resolves.toMatchObject({
      wallpaperSource: 'default',
      wallpaperLight: 'white-shanshui',
      wallpaperDark: 'dark-shanshui-moonlit',
    });
  });

  it('serializes mutations across repository instances', async () => {
    let stored: Record<string, unknown> = {
      [NEW_TAB_PREFERENCES_STORAGE_KEY]: defaultNewTabPreferences(),
    };
    let lockQueue = Promise.resolve();
    const request = vi.fn(
      (_name: string, operation: () => Promise<unknown>) => {
        const result = lockQueue.then(operation);
        lockQueue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    );
    vi.stubGlobal('navigator', { locks: { request } });
    const storage = {
      get: async (key: string) => {
        const snapshot = structuredClone(stored);
        await Promise.resolve();
        return { [key]: snapshot[key] };
      },
      set: async (items: Record<string, unknown>) => {
        await Promise.resolve();
        stored = { ...stored, ...structuredClone(items) };
      },
      remove: async (key: string) => {
        delete stored[key];
      },
      setAccessLevel: async () => undefined,
    };
    const first = new NewTabPreferencesRepository(
      storage as unknown as ExtensionStorageArea,
    );
    const second = new NewTabPreferencesRepository(
      storage as unknown as ExtensionStorageArea,
    );

    await Promise.all([
      first.mutate((current) => ({ ...current, showClock: true })),
      second.mutate((current) => ({ ...current, searchWidth: 840 })),
    ]);

    expect(stored[NEW_TAB_PREFERENCES_STORAGE_KEY]).toMatchObject({
      showClock: true,
      searchWidth: 840,
      revision: 2,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
