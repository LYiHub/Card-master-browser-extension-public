import type { ExtensionStorageArea } from '../../hosts/extension/api';
import {
  NEW_TAB_SEARCH_SOURCES,
  type NewTabSearchBlacklistEntry,
  type NewTabSearchSource,
} from '../domain/types';
import {
  DAILY_REVIEW_WALLPAPER_DEFAULT_RETENTION_DAYS,
  DAILY_REVIEW_WALLPAPER_RETENTION_DAY_OPTIONS,
  type DailyReviewWallpaperRetentionDays,
  normalizeDailyReviewStyleOverride,
} from './daily-review-wallpaper';

export const NEW_TAB_PREFERENCES_STORAGE_KEY =
  'card-master.new-tab.preferences.v1';
export const NEW_TAB_SYNC_STORAGE_KEY =
  'card-master.new-tab.preferences.sync.v1';
export const LUMNO_GLOBAL_THEME_STORAGE_KEY =
  '_x_extension_theme_mode_2024_unique_';
export const LUMNO_NEW_TAB_THEME_MODE_STORAGE_KEY =
  '_x_extension_newtab_theme_mode_2026_unique_';
export const LUMNO_NEW_TAB_THEME_SCOPE_STORAGE_KEY =
  '_x_extension_newtab_theme_scope_2026_unique_';
export const LUMNO_NEW_TAB_SEARCH_WIDTH_STORAGE_KEY =
  '_x_extension_newtab_search_width_2026_unique_';
export const LUMNO_LANGUAGE_STORAGE_KEY = '_x_extension_language_2024_unique_';
export const LUMNO_SHORTCUTS_STORAGE_KEY =
  '_x_extension_newtab_shortcuts_2026_unique_';
export const LUMNO_UPDATE_NOTICE_ENABLED_STORAGE_KEY =
  '_x_extension_update_notice_enabled_2026_unique_';
export const LUMNO_UPDATE_NOTICE_STORAGE_KEY =
  '_x_lumno_update_notice_2026_unique_';
export const LUMNO_WALLPAPER_STORAGE_KEY =
  '_x_extension_newtab_wallpaper_2026_unique_';
export const LUMNO_LOCAL_WALLPAPER_STORAGE_KEY =
  '_x_extension_newtab_local_wallpaper_2026_unique_';
export const LUMNO_WALLPAPER_OVERLAY_STORAGE_KEY =
  '_x_extension_newtab_wallpaper_overlay_2026_unique_';
export const LUMNO_WALLPAPER_EFFECT_STORAGE_KEY =
  '_x_extension_newtab_wallpaper_effect_2026_unique_';

const LUMNO_WALLPAPER_STORAGE_VERSION = 2;
const LUMNO_WALLPAPER_OVERLAY_STORAGE_VERSION = 2;
const LUMNO_WALLPAPER_EFFECT_STORAGE_VERSION = 4;
const LUMNO_LOCAL_WALLPAPER_ID_PREFIX = 'custom-wallpaper-';

export type NewTabRecentMode = 'recent' | 'most-visited';
export type NewTabThemeMode = 'system' | 'light' | 'dark';
export type NewTabSearchPriority = 'autocomplete' | 'browser-search';
export type NewTabWallpaperSource = 'default' | 'daily-review';
export type NewTabWallpaperFit = 'cover' | 'contain';
export type NewTabWallpaperPosition =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right';
export type NewTabWallpaperEffect = 'none' | 'grain' | 'halftone' | 'ascii';
export type DailyReviewWallpaperResolution =
  | '1280x720'
  | '1920x1080'
  | '2560x1440'
  | '3840x2160';
export const DAILY_REVIEW_WALLPAPER_IDLE_SECONDS = [3, 5, 10, 15, 30] as const;
export const DAILY_REVIEW_WALLPAPER_FORCE_SECONDS = [
  30, 60, 120, 180, 300,
] as const;
export type DailyReviewWallpaperForceSeconds =
  (typeof DAILY_REVIEW_WALLPAPER_FORCE_SECONDS)[number];

export type NewTabShortcut = {
  id: string;
  title: string;
  url: string;
  iconDataUrl?: string;
};

export type NewTabSearchEngine = {
  id: string;
  name: string;
  queryUrl: string;
  keyword?: string;
};

export type NewTabPreferences = {
  version: 1;
  revision: number;
  syncEnabled: boolean;
  destinationUrl: string;
  themeMode: NewTabThemeMode;
  showClock: boolean;
  contentWidth: number;
  searchWidth: number;
  recentMode: NewTabRecentMode;
  recentCount: number;
  hiddenSiteUrls: string[];
  pinnedSiteUrls: string[];
  shortcutsVisible: boolean;
  shortcutAddVisible: boolean;
  shortcutDockMagnification: boolean;
  shortcuts: NewTabShortcut[];
  searchSources: NewTabSearchSource[];
  searchPriority: NewTabSearchPriority;
  searchBlacklist: NewTabSearchBlacklistEntry[];
  searchEngines: NewTabSearchEngine[];
  defaultSearchEngineId: string;
  bookmarkPageSize: number;
  bookmarkColumns: number;
  bookmarkFolderIcons: boolean;
  wallpaperSource: NewTabWallpaperSource;
  dailyReviewReasoningEnabled: boolean;
  dailyReviewShowPrompt: boolean;
  dailyReviewIdleSeconds: number;
  dailyReviewForceSeconds: DailyReviewWallpaperForceSeconds;
  dailyReviewResolution: DailyReviewWallpaperResolution;
  dailyReviewRetentionDays: DailyReviewWallpaperRetentionDays;
  dailyReviewStyleOverride: string;
  wallpaperLight: string;
  wallpaperDark: string;
  wallpaperFit: NewTabWallpaperFit;
  wallpaperPosition: NewTabWallpaperPosition;
  wallpaperMask: number;
  wallpaperEffect: NewTabWallpaperEffect;
  wallpaperEffectStrength: number;
  wallpaperEffectSize: number;
  wallpaperEffectSpacing: number;
  faviconEnhanced: boolean;
  faviconThemeColor: boolean;
  faviconExcludedDomains: string[];
};

export function defaultNewTabPreferences(): NewTabPreferences {
  return {
    version: 1,
    revision: 0,
    syncEnabled: true,
    destinationUrl: '',
    themeMode: 'system',
    showClock: false,
    contentWidth: 1440,
    searchWidth: 720,
    recentMode: 'most-visited',
    recentCount: 6,
    hiddenSiteUrls: [],
    pinnedSiteUrls: [],
    shortcutsVisible: true,
    shortcutAddVisible: true,
    shortcutDockMagnification: true,
    shortcuts: [],
    searchSources: [...NEW_TAB_SEARCH_SOURCES],
    searchPriority: 'autocomplete',
    searchBlacklist: [],
    searchEngines: [],
    defaultSearchEngineId: 'browser',
    bookmarkPageSize: 8,
    bookmarkColumns: 4,
    bookmarkFolderIcons: true,
    wallpaperSource: 'default',
    dailyReviewReasoningEnabled: true,
    dailyReviewShowPrompt: true,
    dailyReviewIdleSeconds: 5,
    dailyReviewForceSeconds: 60,
    dailyReviewResolution: '3840x2160',
    dailyReviewRetentionDays: DAILY_REVIEW_WALLPAPER_DEFAULT_RETENTION_DAYS,
    dailyReviewStyleOverride: '',
    wallpaperLight: 'monet-coastal-white',
    wallpaperDark: 'dark-monet-lily-nocturne',
    wallpaperFit: 'cover',
    wallpaperPosition: 'center',
    wallpaperMask: 18,
    wallpaperEffect: 'none',
    wallpaperEffectStrength: 45,
    wallpaperEffectSize: 50,
    wallpaperEffectSpacing: 50,
    faviconEnhanced: true,
    faviconThemeColor: true,
    faviconExcludedDomains: [],
  };
}

export function parseNewTabDestinationUrl(value: string) {
  const input = value.trim();
  if (!input) return '';
  const candidate = /^[a-z][a-z\d+.-]*:/iu.test(input)
    ? input
    : `https://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('请输入有效的网址。');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('指定页面仅支持 http 或 https 网址。');
  }
  return url.toString();
}

function normalizeNewTabDestinationUrl(value: unknown) {
  if (typeof value !== 'string') return '';
  try {
    return parseNewTabDestinationUrl(value);
  } catch {
    return '';
  }
}

function clampInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, Math.round(number)))
    : fallback;
}

function normalizedStringList(value: unknown, limit = 200) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, limit),
    ),
  ];
}

function normalizedShortcut(value: unknown): NewTabShortcut | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    !candidate.id.trim() ||
    typeof candidate.title !== 'string' ||
    candidate.title.length > 256 ||
    typeof candidate.url !== 'string' ||
    candidate.url.length > 8_192
  ) {
    return null;
  }
  let url: string;
  try {
    const parsed = new URL(candidate.url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    url = parsed.toString();
  } catch {
    return null;
  }
  const iconDataUrl =
    typeof candidate.iconDataUrl === 'string' &&
    candidate.iconDataUrl.startsWith('data:image/') &&
    candidate.iconDataUrl.length <= 350_000
      ? candidate.iconDataUrl
      : undefined;
  return {
    id: candidate.id.trim(),
    title: candidate.title.trim(),
    url,
    ...(iconDataUrl ? { iconDataUrl } : {}),
  };
}

function upstreamLumnoShortcut(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const shortcut = value as Record<string, unknown>;
  if (shortcut.id === 'shortcut-lumno-default') return true;
  if (
    typeof shortcut.title === 'string' &&
    shortcut.title.trim().toLocaleLowerCase('en-US') === 'lumno'
  ) {
    return true;
  }
  if (typeof shortcut.url !== 'string') return false;
  try {
    return new URL(shortcut.url).hostname === 'lumno.kubai.design';
  } catch {
    return false;
  }
}

function withoutUpstreamLumnoShortcuts(value: unknown) {
  return Array.isArray(value)
    ? value.filter((shortcut) => !upstreamLumnoShortcut(shortcut))
    : [];
}

function lumnoWallpaperModeValue(
  value: unknown,
  mode: 'light' | 'dark',
  fallback = '',
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return typeof value === 'string' ? value : fallback;
  }
  const stored = value as Record<string, unknown>;
  const selected = stored[mode];
  if (typeof selected === 'string') return selected;
  if (mode === 'dark' && typeof stored.light === 'string') {
    return stored.light;
  }
  return typeof stored.id === 'string' ? stored.id : fallback;
}

function lumnoWallpaperSelection(value: unknown) {
  const light = lumnoWallpaperModeValue(value, 'light');
  const sameForModes =
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as Record<string, unknown>).sameForModes !== false;
  return {
    light,
    dark: sameForModes ? light : lumnoWallpaperModeValue(value, 'dark', light),
  };
}

function lumnoLocalWallpaperSelection(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const id = typeof value === 'string' ? value : '';
    return { light: id, dark: id };
  }
  return {
    light: lumnoWallpaperModeValue(value, 'light'),
    dark: lumnoWallpaperModeValue(value, 'dark'),
  };
}

function isLumnoLocalWallpaperId(value: string) {
  return value.startsWith(LUMNO_LOCAL_WALLPAPER_ID_PREFIX);
}

function lumnoWallpaperStorageValue(
  preferences: NewTabPreferences,
  currentValue: unknown,
) {
  const current = lumnoWallpaperSelection(currentValue);
  const defaults = defaultNewTabPreferences();
  const light = isLumnoLocalWallpaperId(preferences.wallpaperLight)
    ? current.light || defaults.wallpaperLight
    : preferences.wallpaperLight;
  const dark = isLumnoLocalWallpaperId(preferences.wallpaperDark)
    ? current.dark || defaults.wallpaperDark
    : preferences.wallpaperDark;
  return {
    version: LUMNO_WALLPAPER_STORAGE_VERSION,
    sameForModes: preferences.wallpaperLight === preferences.wallpaperDark,
    light,
    dark,
  };
}

function lumnoLocalWallpaperStorageValue(preferences: NewTabPreferences) {
  const light = isLumnoLocalWallpaperId(preferences.wallpaperLight)
    ? preferences.wallpaperLight
    : '';
  const dark = isLumnoLocalWallpaperId(preferences.wallpaperDark)
    ? preferences.wallpaperDark
    : '';
  if (light === dark) return light;
  return {
    version: LUMNO_WALLPAPER_STORAGE_VERSION,
    light,
    dark,
  };
}

function lumnoWallpaperOverlayStorageValue(preferences: NewTabPreferences) {
  return {
    version: LUMNO_WALLPAPER_OVERLAY_STORAGE_VERSION,
    light: preferences.wallpaperMask,
    dark: preferences.wallpaperMask,
  };
}

function lumnoWallpaperEffectStorageValue(preferences: NewTabPreferences) {
  const effect = {
    version: 3,
    type: preferences.wallpaperEffect,
    strength: preferences.wallpaperEffectStrength,
    size: preferences.wallpaperEffectSize,
    spacing: preferences.wallpaperEffectSpacing,
  };
  return {
    version: LUMNO_WALLPAPER_EFFECT_STORAGE_VERSION,
    light: effect,
    dark: effect,
  };
}

function runtimeRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function runtimeWallpaperMask(value: unknown, fallback: number) {
  const record = runtimeRecord(value);
  const raw = record?.light ?? record?.dark ?? value;
  return clampInteger(raw, 0, 100, fallback);
}

function runtimeWallpaperEffect(
  value: unknown,
  preferences: NewTabPreferences,
) {
  const record = runtimeRecord(value);
  const effect =
    runtimeRecord(record?.light) ?? runtimeRecord(record?.dark) ?? record ?? {};
  return {
    wallpaperEffect:
      effect.type === 'grain' ||
      effect.type === 'halftone' ||
      effect.type === 'ascii'
        ? effect.type
        : 'none',
    wallpaperEffectStrength: clampInteger(
      effect.strength,
      0,
      100,
      preferences.wallpaperEffectStrength,
    ),
    wallpaperEffectSize: clampInteger(
      effect.size,
      10,
      100,
      preferences.wallpaperEffectSize,
    ),
    wallpaperEffectSpacing: clampInteger(
      effect.spacing,
      0,
      100,
      preferences.wallpaperEffectSpacing,
    ),
  } satisfies Pick<
    NewTabPreferences,
    | 'wallpaperEffect'
    | 'wallpaperEffectSize'
    | 'wallpaperEffectSpacing'
    | 'wallpaperEffectStrength'
  >;
}

export function applyLumnoWallpaperStorageValue(
  preferences: NewTabPreferences,
  value: unknown,
) {
  const selection = lumnoWallpaperSelection(value);
  return normalizeNewTabPreferences({
    ...preferences,
    wallpaperLight: selection.light,
    wallpaperDark: selection.dark,
  });
}

function applyLumnoWallpaperState(
  preferences: NewTabPreferences,
  wallpaperValue: unknown,
  localWallpaperValue: unknown,
) {
  const synchronized = applyLumnoWallpaperStorageValue(
    preferences,
    wallpaperValue,
  );
  const local = lumnoLocalWallpaperSelection(localWallpaperValue);
  return normalizeNewTabPreferences({
    ...synchronized,
    wallpaperLight: isLumnoLocalWallpaperId(local.light)
      ? local.light
      : synchronized.wallpaperLight,
    wallpaperDark: isLumnoLocalWallpaperId(local.dark)
      ? local.dark
      : synchronized.wallpaperDark,
  });
}

function normalizedSearchEngine(value: unknown): NewTabSearchEngine | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    !candidate.id.trim() ||
    typeof candidate.name !== 'string' ||
    !candidate.name.trim() ||
    typeof candidate.queryUrl !== 'string' ||
    !candidate.queryUrl.includes('{query}') ||
    candidate.queryUrl.length > 8_192
  ) {
    return null;
  }
  try {
    const probe = new URL(
      candidate.queryUrl.replace('{query}', encodeURIComponent('test')),
    );
    if (probe.protocol !== 'http:' && probe.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  const keyword =
    typeof candidate.keyword === 'string'
      ? candidate.keyword.trim().replace(/^@/, '').slice(0, 32)
      : '';
  return {
    id: candidate.id.trim().slice(0, 128),
    name: candidate.name.trim().slice(0, 128),
    queryUrl: candidate.queryUrl.trim(),
    ...(keyword ? { keyword } : {}),
  };
}

function normalizedBlacklist(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap<NewTabSearchBlacklistEntry>((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const candidate = entry as Record<string, unknown>;
      if (
        (candidate.mode !== 'exact-url' &&
          candidate.mode !== 'url-prefix' &&
          candidate.mode !== 'domain') ||
        typeof candidate.value !== 'string' ||
        !candidate.value.trim()
      ) {
        return [];
      }
      return [
        {
          mode: candidate.mode,
          value: candidate.value.trim().slice(0, 2_048),
        },
      ];
    })
    .slice(0, 1_000);
}

function normalizedSearchSources(value: unknown) {
  if (!Array.isArray(value)) return [...NEW_TAB_SEARCH_SOURCES];
  const selected = value.filter(
    (entry): entry is NewTabSearchSource =>
      typeof entry === 'string' &&
      NEW_TAB_SEARCH_SOURCES.includes(entry as NewTabSearchSource),
  );
  return selected.length > 0
    ? [...new Set(selected)]
    : [...NEW_TAB_SEARCH_SOURCES];
}

export function normalizeNewTabPreferences(value: unknown): NewTabPreferences {
  const defaults = defaultNewTabPreferences();
  if (!value || typeof value !== 'object') return defaults;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) return defaults;
  const shortcuts = Array.isArray(candidate.shortcuts)
    ? candidate.shortcuts
        .map(normalizedShortcut)
        .filter((entry): entry is NewTabShortcut => Boolean(entry))
        .filter((entry) => !upstreamLumnoShortcut(entry))
        .slice(0, 24)
    : [];
  const searchEngines = Array.isArray(candidate.searchEngines)
    ? candidate.searchEngines
        .map(normalizedSearchEngine)
        .filter((entry): entry is NewTabSearchEngine => Boolean(entry))
        .slice(0, 24)
    : [];
  const requestedEngine =
    typeof candidate.defaultSearchEngineId === 'string'
      ? candidate.defaultSearchEngineId
      : 'browser';
  const defaultSearchEngineId =
    requestedEngine === 'browser' ||
    searchEngines.some((engine) => engine.id === requestedEngine)
      ? requestedEngine
      : 'browser';
  return {
    version: 1,
    revision: clampInteger(candidate.revision, 0, Number.MAX_SAFE_INTEGER, 0),
    syncEnabled: candidate.syncEnabled !== false,
    destinationUrl: normalizeNewTabDestinationUrl(candidate.destinationUrl),
    themeMode:
      candidate.themeMode === 'light' || candidate.themeMode === 'dark'
        ? candidate.themeMode
        : 'system',
    showClock: candidate.showClock === true,
    contentWidth: clampInteger(candidate.contentWidth, 720, 1_680, 1_440),
    searchWidth: clampInteger(candidate.searchWidth, 520, 1_040, 720),
    recentMode:
      candidate.recentMode === 'most-visited' ? 'most-visited' : 'recent',
    recentCount: clampInteger(candidate.recentCount, 4, 16, 6),
    hiddenSiteUrls: normalizedStringList(candidate.hiddenSiteUrls),
    pinnedSiteUrls: normalizedStringList(candidate.pinnedSiteUrls),
    shortcutsVisible: candidate.shortcutsVisible !== false,
    shortcutAddVisible: candidate.shortcutAddVisible !== false,
    shortcutDockMagnification: candidate.shortcutDockMagnification !== false,
    shortcuts,
    searchSources: normalizedSearchSources(candidate.searchSources),
    searchPriority:
      candidate.searchPriority === 'browser-search'
        ? 'browser-search'
        : 'autocomplete',
    searchBlacklist: normalizedBlacklist(candidate.searchBlacklist),
    searchEngines,
    defaultSearchEngineId,
    bookmarkPageSize: clampInteger(candidate.bookmarkPageSize, 6, 30, 8),
    bookmarkColumns: clampInteger(candidate.bookmarkColumns, 2, 6, 4),
    bookmarkFolderIcons: candidate.bookmarkFolderIcons !== false,
    wallpaperSource:
      candidate.wallpaperSource === 'daily-review' ? 'daily-review' : 'default',
    dailyReviewReasoningEnabled:
      candidate.dailyReviewReasoningEnabled !== false,
    dailyReviewShowPrompt: candidate.dailyReviewShowPrompt !== false,
    dailyReviewIdleSeconds:
      typeof candidate.dailyReviewIdleSeconds === 'number' &&
      DAILY_REVIEW_WALLPAPER_IDLE_SECONDS.includes(
        candidate.dailyReviewIdleSeconds as (typeof DAILY_REVIEW_WALLPAPER_IDLE_SECONDS)[number],
      )
        ? candidate.dailyReviewIdleSeconds
        : 5,
    dailyReviewForceSeconds:
      typeof candidate.dailyReviewForceSeconds === 'number' &&
      DAILY_REVIEW_WALLPAPER_FORCE_SECONDS.includes(
        candidate.dailyReviewForceSeconds as DailyReviewWallpaperForceSeconds,
      )
        ? (candidate.dailyReviewForceSeconds as DailyReviewWallpaperForceSeconds)
        : 60,
    dailyReviewResolution:
      candidate.dailyReviewResolution === '1280x720' ||
      candidate.dailyReviewResolution === '1920x1080' ||
      candidate.dailyReviewResolution === '2560x1440'
        ? candidate.dailyReviewResolution
        : '3840x2160',
    dailyReviewRetentionDays:
      typeof candidate.dailyReviewRetentionDays === 'number' &&
      DAILY_REVIEW_WALLPAPER_RETENTION_DAY_OPTIONS.includes(
        candidate.dailyReviewRetentionDays as DailyReviewWallpaperRetentionDays,
      )
        ? (candidate.dailyReviewRetentionDays as DailyReviewWallpaperRetentionDays)
        : DAILY_REVIEW_WALLPAPER_DEFAULT_RETENTION_DAYS,
    dailyReviewStyleOverride: normalizeDailyReviewStyleOverride(
      candidate.dailyReviewStyleOverride,
    ),
    wallpaperLight:
      typeof candidate.wallpaperLight === 'string'
        ? candidate.wallpaperLight.slice(0, 512) || defaults.wallpaperLight
        : defaults.wallpaperLight,
    wallpaperDark:
      typeof candidate.wallpaperDark === 'string'
        ? candidate.wallpaperDark.slice(0, 512) || defaults.wallpaperDark
        : defaults.wallpaperDark,
    wallpaperFit: candidate.wallpaperFit === 'contain' ? 'contain' : 'cover',
    wallpaperPosition:
      candidate.wallpaperPosition === 'top' ||
      candidate.wallpaperPosition === 'bottom' ||
      candidate.wallpaperPosition === 'left' ||
      candidate.wallpaperPosition === 'right'
        ? candidate.wallpaperPosition
        : 'center',
    wallpaperMask: clampInteger(candidate.wallpaperMask, 0, 100, 18),
    wallpaperEffect:
      candidate.wallpaperEffect === 'grain' ||
      candidate.wallpaperEffect === 'halftone' ||
      candidate.wallpaperEffect === 'ascii'
        ? candidate.wallpaperEffect
        : 'none',
    wallpaperEffectStrength: clampInteger(
      candidate.wallpaperEffectStrength,
      0,
      100,
      45,
    ),
    wallpaperEffectSize: clampInteger(
      candidate.wallpaperEffectSize,
      10,
      100,
      50,
    ),
    wallpaperEffectSpacing: clampInteger(
      candidate.wallpaperEffectSpacing,
      0,
      100,
      50,
    ),
    faviconEnhanced: candidate.faviconEnhanced !== false,
    faviconThemeColor: candidate.faviconThemeColor !== false,
    faviconExcludedDomains: normalizedStringList(
      candidate.faviconExcludedDomains,
      500,
    ),
  };
}

function synchronizedPreferences(preferences: NewTabPreferences) {
  return {
    ...preferences,
    shortcuts: preferences.shortcuts.map((shortcut) => ({
      id: shortcut.id,
      title: shortcut.title,
      url: shortcut.url,
    })),
    wallpaperLight: isLumnoLocalWallpaperId(preferences.wallpaperLight)
      ? ''
      : preferences.wallpaperLight,
    wallpaperDark: isLumnoLocalWallpaperId(preferences.wallpaperDark)
      ? ''
      : preferences.wallpaperDark,
    bookmarkPageSize: defaultNewTabPreferences().bookmarkPageSize,
    bookmarkColumns: defaultNewTabPreferences().bookmarkColumns,
    bookmarkFolderIcons: defaultNewTabPreferences().bookmarkFolderIcons,
  };
}

function mergeSynchronizedPreferences(
  local: NewTabPreferences,
  synchronized: NewTabPreferences,
) {
  const icons = new Map(
    local.shortcuts.flatMap((shortcut) =>
      shortcut.iconDataUrl ? [[shortcut.id, shortcut.iconDataUrl]] : [],
    ),
  );
  return normalizeNewTabPreferences({
    ...synchronized,
    wallpaperLight: isLumnoLocalWallpaperId(local.wallpaperLight)
      ? local.wallpaperLight
      : synchronized.wallpaperLight,
    wallpaperDark: isLumnoLocalWallpaperId(local.wallpaperDark)
      ? local.wallpaperDark
      : synchronized.wallpaperDark,
    bookmarkPageSize: local.bookmarkPageSize,
    bookmarkColumns: local.bookmarkColumns,
    bookmarkFolderIcons: local.bookmarkFolderIcons,
    shortcuts: synchronized.shortcuts.map((shortcut) => ({
      ...shortcut,
      ...(icons.get(shortcut.id)
        ? { iconDataUrl: icons.get(shortcut.id) }
        : {}),
    })),
  });
}

function lumnoThemeStorageUpdate(themeMode: NewTabThemeMode) {
  return {
    [LUMNO_NEW_TAB_THEME_MODE_STORAGE_KEY]:
      themeMode === 'system' ? 'global' : themeMode,
    [LUMNO_NEW_TAB_THEME_SCOPE_STORAGE_KEY]: 'home',
    ...(themeMode === 'system'
      ? { [LUMNO_GLOBAL_THEME_STORAGE_KEY]: 'system' }
      : {}),
  };
}

const NEW_TAB_PREFERENCES_LOCK_NAME = 'card-master.new-tab.preferences';

function withNewTabPreferencesLock<T>(operation: () => Promise<T>) {
  const locks = globalThis.navigator?.locks;
  return locks
    ? locks.request(NEW_TAB_PREFERENCES_LOCK_NAME, operation)
    : operation();
}

export class NewTabPreferencesRepository {
  private mutationQueue = Promise.resolve();

  constructor(
    private readonly localStorage: ExtensionStorageArea,
    private readonly syncStorage?: ExtensionStorageArea,
  ) {}

  private enqueue<T>(operation: () => Promise<T>) {
    const queued = this.mutationQueue.then(() =>
      withNewTabPreferencesLock(operation),
    );
    this.mutationQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  async synchronize(preferences: NewTabPreferences) {
    const storage = this.syncStorage ?? this.localStorage;
    const update = {
      ...lumnoThemeStorageUpdate(preferences.themeMode),
      [LUMNO_LANGUAGE_STORAGE_KEY]: 'zh_CN',
      [LUMNO_NEW_TAB_SEARCH_WIDTH_STORAGE_KEY]: preferences.searchWidth,
      [LUMNO_UPDATE_NOTICE_ENABLED_STORAGE_KEY]: false,
      [LUMNO_WALLPAPER_OVERLAY_STORAGE_KEY]:
        lumnoWallpaperOverlayStorageValue(preferences),
      [LUMNO_WALLPAPER_EFFECT_STORAGE_KEY]:
        lumnoWallpaperEffectStorageValue(preferences),
    };
    const stored = await storage.get([
      ...Object.keys(update),
      LUMNO_SHORTCUTS_STORAGE_KEY,
      LUMNO_WALLPAPER_STORAGE_KEY,
    ]);
    const shortcuts = withoutUpstreamLumnoShortcuts(
      stored[LUMNO_SHORTCUTS_STORAGE_KEY],
    );
    const changed: Record<string, unknown> = Object.fromEntries(
      Object.entries(update).filter(
        ([key, value]) => JSON.stringify(stored[key]) !== JSON.stringify(value),
      ),
    );
    if (
      JSON.stringify(stored[LUMNO_SHORTCUTS_STORAGE_KEY]) !==
      JSON.stringify(shortcuts)
    ) {
      changed[LUMNO_SHORTCUTS_STORAGE_KEY] = shortcuts;
    }
    const wallpaper = lumnoWallpaperStorageValue(
      preferences,
      stored[LUMNO_WALLPAPER_STORAGE_KEY],
    );
    if (
      JSON.stringify(stored[LUMNO_WALLPAPER_STORAGE_KEY]) !==
      JSON.stringify(wallpaper)
    ) {
      changed[LUMNO_WALLPAPER_STORAGE_KEY] = wallpaper;
    }
    if (Object.keys(changed).length > 0) await storage.set(changed);
    const localWallpaper = lumnoLocalWallpaperStorageValue(preferences);
    const storedLocalWallpaper = await this.localStorage.get(
      LUMNO_LOCAL_WALLPAPER_STORAGE_KEY,
    );
    if (
      JSON.stringify(
        storedLocalWallpaper[LUMNO_LOCAL_WALLPAPER_STORAGE_KEY],
      ) !== JSON.stringify(localWallpaper)
    ) {
      await this.localStorage.set({
        [LUMNO_LOCAL_WALLPAPER_STORAGE_KEY]: localWallpaper,
      });
    }
    await storage.remove(LUMNO_UPDATE_NOTICE_STORAGE_KEY);
    if (storage !== this.localStorage) {
      await this.localStorage.remove(LUMNO_UPDATE_NOTICE_STORAGE_KEY);
    }
  }

  private async readStoredPreferences() {
    const localResult = await this.localStorage.get(
      NEW_TAB_PREFERENCES_STORAGE_KEY,
    );
    const local = normalizeNewTabPreferences(
      localResult[NEW_TAB_PREFERENCES_STORAGE_KEY],
    );
    let preferences = local;
    if (local.syncEnabled && this.syncStorage) {
      const syncResult = await this.syncStorage.get(NEW_TAB_SYNC_STORAGE_KEY);
      const rawSynchronized = syncResult[NEW_TAB_SYNC_STORAGE_KEY];
      if (rawSynchronized) {
        preferences = mergeSynchronizedPreferences(
          local,
          normalizeNewTabPreferences(rawSynchronized),
        );
      }
    }
    return preferences;
  }

  private async persist(preferences: NewTabPreferences) {
    await this.localStorage.set({
      [NEW_TAB_PREFERENCES_STORAGE_KEY]: preferences,
    });
    if (!this.syncStorage) return;
    if (preferences.syncEnabled) {
      await this.syncStorage.set({
        [NEW_TAB_SYNC_STORAGE_KEY]: synchronizedPreferences(preferences),
      });
      return;
    }
    await this.syncStorage.remove(NEW_TAB_SYNC_STORAGE_KEY);
  }

  async read() {
    return this.readStoredPreferences();
  }

  adoptRuntimeWallpaperState(): Promise<NewTabPreferences> {
    return this.enqueue(async () => {
      const current = await this.readStoredPreferences();
      const wallpaperStorage = this.syncStorage ?? this.localStorage;
      const [wallpaper, localWallpaper] = await Promise.all([
        wallpaperStorage.get(LUMNO_WALLPAPER_STORAGE_KEY),
        this.localStorage.get(LUMNO_LOCAL_WALLPAPER_STORAGE_KEY),
      ]);
      const adopted = applyLumnoWallpaperState(
        current,
        wallpaper[LUMNO_WALLPAPER_STORAGE_KEY],
        localWallpaper[LUMNO_LOCAL_WALLPAPER_STORAGE_KEY],
      );
      const unchanged =
        adopted.wallpaperLight === current.wallpaperLight &&
        adopted.wallpaperDark === current.wallpaperDark;
      if (unchanged) return current;
      const next = {
        ...adopted,
        revision: current.revision + 1,
      };
      await this.persist(next);
      return next;
    });
  }

  adoptRuntimeWallpaperOverlay(value: unknown): Promise<NewTabPreferences> {
    return this.enqueue(async () => {
      const current = await this.readStoredPreferences();
      const wallpaperMask = runtimeWallpaperMask(value, current.wallpaperMask);
      if (wallpaperMask === current.wallpaperMask) return current;
      const next = normalizeNewTabPreferences({
        ...current,
        revision: current.revision + 1,
        wallpaperMask,
      });
      await this.persist(next);
      return next;
    });
  }

  adoptRuntimeWallpaperEffect(value: unknown): Promise<NewTabPreferences> {
    return this.enqueue(async () => {
      const current = await this.readStoredPreferences();
      const effect = runtimeWallpaperEffect(value, current);
      if (
        effect.wallpaperEffect === current.wallpaperEffect &&
        effect.wallpaperEffectStrength === current.wallpaperEffectStrength &&
        effect.wallpaperEffectSize === current.wallpaperEffectSize &&
        effect.wallpaperEffectSpacing === current.wallpaperEffectSpacing
      ) {
        return current;
      }
      const next = normalizeNewTabPreferences({
        ...current,
        ...effect,
        revision: current.revision + 1,
      });
      await this.persist(next);
      return next;
    });
  }

  adoptRuntimeSearchWidth(value: unknown): Promise<NewTabPreferences> {
    return this.enqueue(async () => {
      const current = await this.readStoredPreferences();
      const next = normalizeNewTabPreferences({
        ...current,
        searchWidth: value,
        revision: current.revision + 1,
      });
      if (next.searchWidth === current.searchWidth) return current;
      await this.persist(next);
      return next;
    });
  }

  mutate(
    mutation: (preferences: NewTabPreferences) => NewTabPreferences,
  ): Promise<NewTabPreferences> {
    return this.enqueue(async () => {
      const current = await this.readStoredPreferences();
      const next = normalizeNewTabPreferences({
        ...mutation(structuredClone(current)),
        version: 1,
        revision: current.revision + 1,
      });
      await this.persist(next);
      await this.synchronize(next);
      return next;
    });
  }
}
