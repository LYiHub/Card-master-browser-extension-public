import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  Check,
  Compass,
  Home,
  Image,
  Link2,
  LoaderCircle,
  MonitorCog,
  PencilLine,
  RotateCcw,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE,
  DAILY_REVIEW_WALLPAPER_MAX_IMAGE_BYTES,
  DAILY_REVIEW_WALLPAPER_MAX_IMAGES,
  DAILY_REVIEW_WALLPAPER_MAX_IMAGES_PER_SOURCE_DATE,
  DAILY_REVIEW_WALLPAPER_RETENTION_DAY_OPTIONS,
  type DailyReviewWallpaperReadiness,
  type DailyReviewWallpaperRetentionDays,
  type DailyReviewWallpaperSettingsController,
  dailyReviewPromptUsesChinese,
  normalizeDailyReviewStyleOverride,
} from '../../new-tab/application/daily-review-wallpaper';
import type {
  NewTabLocalWallpaper,
  NewTabLocalWallpaperRepository,
  NewTabWallpaperTone,
} from '../../new-tab/application/local-wallpaper';
import {
  DAILY_REVIEW_WALLPAPER_FORCE_SECONDS,
  DAILY_REVIEW_WALLPAPER_IDLE_SECONDS,
  type DailyReviewWallpaperResolution,
  type NewTabPreferences,
  type NewTabPreferencesRepository,
  type NewTabSearchEngine,
  type NewTabWallpaperSource,
  parseNewTabDestinationUrl,
} from '../../new-tab/application/preferences';
import { NEW_TAB_BUILTIN_WALLPAPERS } from '../../new-tab/application/wallpapers';
import type {
  NewTabCapabilities,
  NewTabSearchBlacklistMode,
  NewTabSearchSource,
} from '../../new-tab/domain/types';
import { NEW_TAB_SEARCH_SOURCES } from '../../new-tab/domain/types';
import { DailyReviewWallpaperSettings } from './DailyReviewWallpaperSettings';

const SECTIONS = [
  { id: 'general', label: '常规', icon: Settings },
  { id: 'appearance', label: '外观', icon: MonitorCog },
  { id: 'wallpaper', label: '壁纸', icon: Image },
  { id: 'home', label: '首页内容', icon: Home },
  { id: 'search', label: '搜索结果', icon: Search },
  { id: 'engines', label: '搜索源', icon: Compass },
  { id: 'blacklist', label: '黑名单', icon: Link2 },
  { id: 'bookmarks', label: '书签', icon: Bookmark },
  { id: 'shortcuts', label: '快捷方式', icon: Sparkles },
  { id: 'favicons', label: '图标与主题色', icon: MonitorCog },
] as const;

type SettingsSection = (typeof SECTIONS)[number]['id'];

const SEARCH_SOURCE_CAPABILITY = {
  'open-tab': 'openTabs',
  bookmark: 'bookmarks',
  history: 'history',
  'top-site': 'topSites',
} as const satisfies Record<NewTabSearchSource, keyof NewTabCapabilities>;

export function newTabSettingsCapabilities(
  target: 'chromium' | 'firefox' | 'safari',
): NewTabCapabilities {
  return {
    history: target !== 'safari',
    bookmarks: target !== 'safari',
    topSites: target !== 'safari',
    openTabs: true,
    browserSearch: target !== 'safari',
    favicon: target === 'chromium',
    storageSync: true,
  };
}

export function visibleNewTabSettingsSections(
  capabilities: NewTabCapabilities,
) {
  return SECTIONS.filter((item) => {
    if (item.id === 'home')
      return capabilities.history || capabilities.topSites;
    if (item.id === 'bookmarks') return capabilities.bookmarks;
    if (item.id === 'favicons') return capabilities.favicon;
    return true;
  });
}

const DAILY_REVIEW_RESOLUTION_OPTIONS: Array<{
  value: DailyReviewWallpaperResolution;
  label: string;
}> = [
  { value: '1280x720', label: '720P · 1280×720' },
  { value: '1920x1080', label: '1080P · 1920×1080' },
  { value: '2560x1440', label: '2K · 2560×1440' },
  { value: '3840x2160', label: '4K · 3840×2160' },
];

function settingsSectionDomId(id: SettingsSection) {
  return `new-tab-settings-${id}`;
}

function SettingsContentSection({
  children,
  id,
  label,
}: {
  children: ReactNode;
  id: SettingsSection;
  label: string;
}) {
  const headingId = `${settingsSectionDomId(id)}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="cm-new-tab-settings-section"
      data-settings-section={id}
      id={settingsSectionDomId(id)}
    >
      <h1 id={headingId}>{label}</h1>
      {children}
    </section>
  );
}

function Field({
  children,
  description,
  label,
}: {
  children: ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <div className="cm-new-tab-settings-field">
      <div>
        <strong>{label}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="cm-new-tab-settings-toggle">
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" />
      <b>{label}</b>
    </label>
  );
}

function engineId() {
  return globalThis.crypto?.randomUUID?.() ?? `engine-${Date.now()}`;
}

export function dailyReviewReadinessIssue(
  readiness: DailyReviewWallpaperReadiness | null,
  error = '',
) {
  if (error) {
    return {
      title: '无法检查 AI 服务配置',
      detail: error,
    };
  }
  if (!readiness) return null;
  if (!readiness.imageServiceConfigured) {
    return {
      title: '图像服务尚未配置',
      detail:
        '请先配置图像服务；规划模型可以稍后配置，自定义内容生成不依赖它。',
    };
  }
  return null;
}

export function dailyReviewAvailable(
  readiness: DailyReviewWallpaperReadiness | null,
  error = '',
) {
  return Boolean(!error && readiness?.imageServiceConfigured);
}

export function resolveEffectiveWallpaperSource(
  source: NewTabWallpaperSource,
  dailyReviewAvailable: boolean,
): NewTabWallpaperSource {
  return source === 'daily-review' && dailyReviewAvailable
    ? 'daily-review'
    : 'default';
}

export function newTabWallpaperToneForTheme(
  mode: NewTabPreferences['themeMode'],
  systemDark: boolean,
): NewTabWallpaperTone {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return systemDark ? 'dark' : 'light';
}

export function NewTabSettingsPage({
  assetUrl,
  backUrl,
  capabilities,
  dailyReviewController,
  dailyReviewSupported,
  localWallpaperRepository,
  preferencesRepository,
}: {
  assetUrl(path: string): string;
  backUrl: string;
  capabilities: NewTabCapabilities;
  dailyReviewController: DailyReviewWallpaperSettingsController;
  dailyReviewSupported: boolean;
  localWallpaperRepository: NewTabLocalWallpaperRepository;
  preferencesRepository: NewTabPreferencesRepository;
}) {
  const sections = visibleNewTabSettingsSections(capabilities);
  const searchSources = NEW_TAB_SEARCH_SOURCES.filter(
    (source) => capabilities[SEARCH_SOURCE_CAPABILITY[source]],
  );
  const [section, setSection] = useState<SettingsSection>('general');
  const [preferences, setPreferences] = useState<NewTabPreferences | null>(
    null,
  );
  const [wallpaperSourcePanel, setWallpaperSourcePanel] =
    useState<NewTabWallpaperSource>('default');
  const [wallpaperTone, setWallpaperTone] =
    useState<NewTabWallpaperTone>('light');
  const [localWallpapers, setLocalWallpapers] = useState<
    NewTabLocalWallpaper[]
  >([]);
  const [notice, setNotice] = useState('');
  const [destinationDraft, setDestinationDraft] = useState('');
  const [dailyReviewStyleDraft, setDailyReviewStyleDraft] = useState(
    DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE,
  );
  const [dailyReviewReadiness, setDailyReviewReadiness] =
    useState<DailyReviewWallpaperReadiness | null>(null);
  const [dailyReviewReadinessError, setDailyReviewReadinessError] =
    useState('');
  const [engineDraft, setEngineDraft] = useState({
    name: '',
    keyword: '',
    queryUrl: '',
  });
  const [blacklistDraft, setBlacklistDraft] = useState({
    mode: 'domain' as NewTabSearchBlacklistMode,
    value: '',
  });

  useEffect(() => {
    void preferencesRepository
      .read()
      .then((next) => {
        setPreferences(next);
        setWallpaperSourcePanel(next.wallpaperSource);
        setDestinationDraft(next.destinationUrl);
        setDailyReviewStyleDraft(
          next.dailyReviewStyleOverride || DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE,
        );
      })
      .catch((error) =>
        setNotice(error instanceof Error ? error.message : '设置读取失败。'),
      );
  }, [preferencesRepository]);

  const themeMode = preferences?.themeMode;
  useEffect(() => {
    if (!themeMode) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTone = () =>
      setWallpaperTone(newTabWallpaperToneForTheme(themeMode, media.matches));
    syncTone();
    if (themeMode !== 'system') return;
    media.addEventListener('change', syncTone);
    return () => media.removeEventListener('change', syncTone);
  }, [themeMode]);

  useEffect(() => {
    void localWallpaperRepository
      .readAll()
      .then(setLocalWallpapers)
      .catch((error) =>
        setNotice(
          error instanceof Error ? error.message : '本地壁纸读取失败。',
        ),
      );
  }, [localWallpaperRepository]);

  useEffect(() => {
    if (!dailyReviewSupported) {
      setDailyReviewReadiness(null);
      setDailyReviewReadinessError('');
      return;
    }
    let active = true;
    const readReadiness = async () => {
      try {
        const next = await dailyReviewController.readReadiness();
        if (!active) return;
        setDailyReviewReadiness(next);
        setDailyReviewReadinessError('');
      } catch (error) {
        if (!active) return;
        setDailyReviewReadinessError(
          error instanceof Error ? error.message : 'AI 服务配置状态读取失败。',
        );
      }
    };
    const onFocus = () => void readReadiness();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void readReadiness();
    };
    const unsubscribe = dailyReviewController.subscribeReadiness(
      () => void readReadiness(),
    );
    void readReadiness();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [dailyReviewSupported, dailyReviewController]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3_200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const settingsLoaded = preferences !== null;
  useEffect(() => {
    if (!settingsLoaded) return;
    const target = SECTIONS.find(
      (item) =>
        window.location.hash === `#${settingsSectionDomId(item.id)}` &&
        document.getElementById(settingsSectionDomId(item.id)),
    );
    if (!target) return;
    setSection(target.id);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(settingsSectionDomId(target.id))?.scrollIntoView({
        behavior: 'auto',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded) return;
    const content = document.querySelector<HTMLElement>(
      '.cm-new-tab-settings-content',
    );
    const observed = SECTIONS.flatMap((item) => {
      const element = document.getElementById(settingsSectionDomId(item.id));
      return element instanceof HTMLElement ? [{ element, id: item.id }] : [];
    });
    if (!content || observed.length === 0) return;

    let frame = 0;
    const updateActiveSection = () => {
      frame = 0;
      const anchor = 104;
      let active = observed[0];
      for (const candidate of observed) {
        if (candidate.element.getBoundingClientRect().top > anchor) break;
        active = candidate;
      }
      const atPageEnd =
        Math.ceil(window.scrollY + window.innerHeight) >=
        document.documentElement.scrollHeight - 2;
      const next = atPageEnd ? observed.at(-1) : active;
      if (next) {
        setSection((current) => (current === next.id ? current : next.id));
      }
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveSection);
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(content);
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    scheduleUpdate();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate);
    };
  }, [settingsLoaded]);

  const scrollToSection = (id: SettingsSection) => {
    setSection(id);
    document.getElementById(settingsSectionDomId(id))?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const mutate = useCallback(
    async (
      mutation: (current: NewTabPreferences) => NewTabPreferences,
      message = '设置已保存。',
    ) => {
      try {
        const next = await preferencesRepository.mutate(mutation);
        setPreferences(next);
        setNotice(message);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '设置保存失败。');
      }
    },
    [preferencesRepository],
  );

  const patch = <Key extends keyof NewTabPreferences>(
    key: Key,
    value: NewTabPreferences[Key],
    message?: string,
  ) => mutate((current) => ({ ...current, [key]: value }), message);

  const uploadWallpaper = async (
    tone: NewTabWallpaperTone,
    file: File | undefined,
  ) => {
    if (!file) return;
    try {
      const wallpaper = await localWallpaperRepository.save(file);
      setLocalWallpapers((current) => [...current, wallpaper]);
      await patch(
        tone === 'light' ? 'wallpaperLight' : 'wallpaperDark',
        wallpaper.id,
        `${tone === 'light' ? '浅色' : '深色'}本地壁纸已保存。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '本地壁纸保存失败。');
    }
  };

  const addEngine = () => {
    const draft: NewTabSearchEngine = {
      id: engineId(),
      name: engineDraft.name.trim(),
      queryUrl: engineDraft.queryUrl.trim(),
      ...(engineDraft.keyword.trim()
        ? { keyword: engineDraft.keyword.trim().replace(/^@/, '') }
        : {}),
    };
    if (!draft.name || !draft.queryUrl.includes('{query}')) {
      setNotice('搜索源需要名称，并在查询地址中包含 {query}。');
      return;
    }
    void mutate(
      (current) => ({
        ...current,
        searchEngines: [...current.searchEngines, draft],
      }),
      '搜索源已添加。',
    ).then(() => setEngineDraft({ name: '', keyword: '', queryUrl: '' }));
  };

  const saveDestination = async () => {
    try {
      const destinationUrl = parseNewTabDestinationUrl(destinationDraft);
      await patch(
        'destinationUrl',
        destinationUrl,
        destinationUrl
          ? '新标签页将打开指定网页。'
          : '新标签页将使用内置页面。',
      );
      setDestinationDraft(destinationUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '网址保存失败。');
    }
  };

  const dailyReviewIssue = dailyReviewReadinessIssue(
    dailyReviewReadiness,
    dailyReviewReadinessError,
  );
  const dailyReviewReadinessLoading =
    !dailyReviewReadiness && !dailyReviewReadinessError;
  const dailyReviewReady = dailyReviewAvailable(
    dailyReviewReadiness,
    dailyReviewReadinessError,
  );
  const dailyReviewCanConfigure =
    !dailyReviewReadinessLoading && !dailyReviewReady;
  const effectiveWallpaperSource = resolveEffectiveWallpaperSource(
    preferences?.wallpaperSource ?? 'default',
    dailyReviewReady,
  );

  const openAiSettings = async () => {
    try {
      await dailyReviewController.openAiSettings();
      setNotice('已打开 AI 服务设置。');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : '无法打开 AI 服务设置。',
      );
    }
  };

  const selectWallpaperSource = async (source: NewTabWallpaperSource) => {
    setWallpaperSourcePanel(source);
    await mutate(
      (current) =>
        current.wallpaperSource === source
          ? current
          : { ...current, wallpaperSource: source },
      source === 'daily-review'
        ? '已切换为 AI 每日回顾壁纸。'
        : '已切换为默认壁纸。',
    );
    if (source === 'default') return;
    try {
      const readiness = await dailyReviewController.readReadiness();
      setDailyReviewReadiness(readiness);
      setDailyReviewReadinessError('');
      if (readiness.imageServiceConfigured) {
        return;
      }
    } catch (error) {
      setDailyReviewReadinessError(
        error instanceof Error ? error.message : 'AI 服务配置状态读取失败。',
      );
    }
    await openAiSettings();
  };

  if (!preferences) {
    return (
      <main className="cm-new-tab-settings-loading">正在读取新标签页设置</main>
    );
  }

  return (
    <main
      className="cm-new-tab-settings-page"
      data-theme={preferences.themeMode}
    >
      <header className="cm-new-tab-settings-header">
        <button
          aria-label="返回新标签页"
          onClick={() => {
            location.href = backUrl;
          }}
          title="返回新标签页"
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <div>
          <strong>新标签页设置</strong>
        </div>
      </header>

      <div className="cm-new-tab-settings-layout">
        <nav aria-label="设置分类">
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-current={section === item.id ? 'page' : undefined}
                aria-controls={settingsSectionDomId(item.id)}
                data-selected={section === item.id ? 'true' : 'false'}
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="cm-new-tab-settings-content">
          <SettingsContentSection id="general" label="常规">
            <Field
              description="留空时使用内置新标签页；填写后，新建标签页会直接打开该网址。"
              label="新标签页内容"
            >
              <div className="cm-new-tab-settings-destination">
                <input
                  aria-label="指定新标签页网址"
                  onChange={(event) =>
                    setDestinationDraft(event.currentTarget.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void saveDestination();
                    }
                  }}
                  placeholder="例如：https://www.bilibili.com/"
                  type="url"
                  value={destinationDraft}
                />
                <button onClick={() => void saveDestination()} type="button">
                  <Save aria-hidden="true" size={15} />
                  保存
                </button>
                <button
                  disabled={
                    !preferences.destinationUrl && !destinationDraft.trim()
                  }
                  onClick={() => {
                    setDestinationDraft('');
                    void patch(
                      'destinationUrl',
                      '',
                      '新标签页将使用内置页面。',
                    );
                  }}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={15} />
                  使用内置页面
                </button>
              </div>
            </Field>
            <Field label="主题">
              <select
                onChange={(event) =>
                  void patch(
                    'themeMode',
                    event.currentTarget.value as NewTabPreferences['themeMode'],
                  )
                }
                value={preferences.themeMode}
              >
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </Field>
            <Field label="顶部时间">
              <Toggle
                checked={preferences.showClock}
                label="显示"
                onChange={(checked) => void patch('showClock', checked)}
              />
            </Field>
            {capabilities.storageSync ? (
              <Field
                description="同步布局、搜索和普通偏好；本地壁纸、自定义图标与书签顶部外观不参与同步。"
                label="浏览器内置同步"
              >
                <Toggle
                  checked={preferences.syncEnabled}
                  label="启用"
                  onChange={(checked) => void patch('syncEnabled', checked)}
                />
              </Field>
            ) : null}
          </SettingsContentSection>

          <SettingsContentSection id="appearance" label="外观">
            <Field label={`内容宽度 ${preferences.contentWidth}px`}>
              <input
                max="1680"
                min="720"
                onChange={(event) =>
                  void patch('contentWidth', Number(event.currentTarget.value))
                }
                step="20"
                type="range"
                value={preferences.contentWidth}
              />
            </Field>
            <Field label={`搜索框宽度 ${preferences.searchWidth}px`}>
              <input
                max="1040"
                min="520"
                onChange={(event) =>
                  void patch('searchWidth', Number(event.currentTarget.value))
                }
                step="20"
                type="range"
                value={preferences.searchWidth}
              />
            </Field>
          </SettingsContentSection>

          {capabilities.history || capabilities.topSites ? (
            <SettingsContentSection id="home" label="首页内容">
              <Field label="网站来源">
                <select
                  onChange={(event) =>
                    void patch(
                      'recentMode',
                      event.currentTarget
                        .value as NewTabPreferences['recentMode'],
                    )
                  }
                  value={preferences.recentMode}
                >
                  {capabilities.history ? (
                    <option value="recent">最近访问</option>
                  ) : null}
                  {capabilities.topSites ? (
                    <option value="most-visited">最常访问</option>
                  ) : null}
                </select>
              </Field>
              <Field label={`网站数量 ${preferences.recentCount}`}>
                <input
                  max="16"
                  min="4"
                  onChange={(event) =>
                    void patch('recentCount', Number(event.currentTarget.value))
                  }
                  type="range"
                  value={preferences.recentCount}
                />
              </Field>
              <Field label="隐藏的网站">
                <button
                  disabled={preferences.hiddenSiteUrls.length === 0}
                  onClick={() => void patch('hiddenSiteUrls', [])}
                  type="button"
                >
                  恢复 {preferences.hiddenSiteUrls.length} 个网站
                </button>
              </Field>
            </SettingsContentSection>
          ) : null}

          <SettingsContentSection id="search" label="搜索结果">
            <Field label="结果优先级">
              <select
                onChange={(event) =>
                  void patch(
                    'searchPriority',
                    event.currentTarget
                      .value as NewTabPreferences['searchPriority'],
                  )
                }
                value={preferences.searchPriority}
              >
                <option value="autocomplete">补全结果优先</option>
                {capabilities.browserSearch ? (
                  <option value="browser-search">网页搜索优先</option>
                ) : null}
              </select>
            </Field>
            <Field label="搜索来源">
              <div className="cm-new-tab-settings-checks">
                {searchSources.map((source) => (
                  <Toggle
                    checked={preferences.searchSources.includes(source)}
                    key={source}
                    label={
                      {
                        history: '历史',
                        bookmark: '书签',
                        'top-site': '常用网站',
                        'open-tab': '当前标签页',
                      }[source]
                    }
                    onChange={(checked) => {
                      const next = checked
                        ? [...preferences.searchSources, source]
                        : preferences.searchSources.filter(
                            (entry) => entry !== source,
                          );
                      if (next.length > 0) {
                        void patch('searchSources', [...new Set(next)]);
                      }
                    }}
                  />
                ))}
              </div>
            </Field>
          </SettingsContentSection>

          <SettingsContentSection id="engines" label="搜索源">
            <Field label="默认搜索源">
              <select
                onChange={(event) =>
                  void patch('defaultSearchEngineId', event.currentTarget.value)
                }
                value={preferences.defaultSearchEngineId}
              >
                {capabilities.browserSearch ? (
                  <option value="browser">浏览器默认</option>
                ) : null}
                {preferences.searchEngines.map((engine) => (
                  <option key={engine.id} value={engine.id}>
                    {engine.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="cm-new-tab-settings-list">
              {preferences.searchEngines.map((engine) => (
                <div key={engine.id}>
                  <span>
                    <strong>{engine.name}</strong>
                    <small>
                      {engine.keyword ? `@${engine.keyword} · ` : ''}
                      {engine.queryUrl}
                    </small>
                  </span>
                  <button
                    aria-label={`删除 ${engine.name}`}
                    onClick={() =>
                      void mutate((current) => ({
                        ...current,
                        searchEngines: current.searchEngines.filter(
                          (entry) => entry.id !== engine.id,
                        ),
                        defaultSearchEngineId:
                          current.defaultSearchEngineId === engine.id
                            ? 'browser'
                            : current.defaultSearchEngineId,
                      }))
                    }
                    title="删除"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="cm-new-tab-settings-form-grid">
              <input
                onChange={(event) =>
                  setEngineDraft((current) => ({
                    ...current,
                    name: event.currentTarget.value,
                  }))
                }
                placeholder="名称"
                value={engineDraft.name}
              />
              <input
                onChange={(event) =>
                  setEngineDraft((current) => ({
                    ...current,
                    keyword: event.currentTarget.value,
                  }))
                }
                placeholder="站内关键词，例如 bilibili"
                value={engineDraft.keyword}
              />
              <input
                onChange={(event) =>
                  setEngineDraft((current) => ({
                    ...current,
                    queryUrl: event.currentTarget.value,
                  }))
                }
                placeholder="https://example.com/search?q={query}"
                value={engineDraft.queryUrl}
              />
              <button onClick={addEngine} type="button">
                添加搜索源
              </button>
            </div>
          </SettingsContentSection>

          <SettingsContentSection id="blacklist" label="黑名单">
            <div className="cm-new-tab-settings-list">
              {preferences.searchBlacklist.map((entry, index) => (
                <div key={`${entry.mode}:${entry.value}`}>
                  <span>
                    <strong>
                      {
                        {
                          domain: '域名',
                          'url-prefix': '网址前缀',
                          'exact-url': '完整网址',
                        }[entry.mode]
                      }
                    </strong>
                    <small>{entry.value}</small>
                  </span>
                  <button
                    aria-label="删除黑名单规则"
                    onClick={() =>
                      void patch(
                        'searchBlacklist',
                        preferences.searchBlacklist.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      )
                    }
                    title="删除"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="cm-new-tab-settings-form-grid is-compact">
              <select
                onChange={(event) =>
                  setBlacklistDraft((current) => ({
                    ...current,
                    mode: event.currentTarget
                      .value as NewTabSearchBlacklistMode,
                  }))
                }
                value={blacklistDraft.mode}
              >
                <option value="domain">域名</option>
                <option value="url-prefix">网址前缀</option>
                <option value="exact-url">完整网址</option>
              </select>
              <input
                onChange={(event) =>
                  setBlacklistDraft((current) => ({
                    ...current,
                    value: event.currentTarget.value,
                  }))
                }
                placeholder="example.com"
                value={blacklistDraft.value}
              />
              <button
                onClick={() => {
                  if (!blacklistDraft.value.trim()) return;
                  void patch('searchBlacklist', [
                    ...preferences.searchBlacklist,
                    {
                      mode: blacklistDraft.mode,
                      value: blacklistDraft.value.trim(),
                    },
                  ]).then(() =>
                    setBlacklistDraft({
                      mode: 'domain',
                      value: '',
                    }),
                  );
                }}
                type="button"
              >
                添加规则
              </button>
            </div>
          </SettingsContentSection>

          {capabilities.bookmarks ? (
            <SettingsContentSection id="bookmarks" label="书签">
              <Field label={`每页数量 ${preferences.bookmarkPageSize}`}>
                <input
                  max="30"
                  min="6"
                  onChange={(event) =>
                    void patch(
                      'bookmarkPageSize',
                      Number(event.currentTarget.value),
                    )
                  }
                  type="range"
                  value={preferences.bookmarkPageSize}
                />
              </Field>
              <Field label={`列数 ${preferences.bookmarkColumns}`}>
                <input
                  max="6"
                  min="2"
                  onChange={(event) =>
                    void patch(
                      'bookmarkColumns',
                      Number(event.currentTarget.value),
                    )
                  }
                  type="range"
                  value={preferences.bookmarkColumns}
                />
              </Field>
              <Field label="文件夹图标">
                <Toggle
                  checked={preferences.bookmarkFolderIcons}
                  label="显示"
                  onChange={(checked) =>
                    void patch('bookmarkFolderIcons', checked)
                  }
                />
              </Field>
            </SettingsContentSection>
          ) : null}

          <SettingsContentSection id="shortcuts" label="快捷方式">
            <Field label="快捷方式区域">
              <div className="cm-new-tab-settings-checks">
                <Toggle
                  checked={preferences.shortcutsVisible}
                  label="显示快捷方式"
                  onChange={(checked) =>
                    void patch('shortcutsVisible', checked)
                  }
                />
                <Toggle
                  checked={preferences.shortcutAddVisible}
                  label="显示添加按钮"
                  onChange={(checked) =>
                    void patch('shortcutAddVisible', checked)
                  }
                />
                <Toggle
                  checked={preferences.shortcutDockMagnification}
                  label="悬浮放大"
                  onChange={(checked) =>
                    void patch('shortcutDockMagnification', checked)
                  }
                />
              </div>
            </Field>
            <div className="cm-new-tab-settings-list">
              {preferences.shortcuts.map((shortcut) => (
                <div key={shortcut.id}>
                  <span>
                    <strong>{shortcut.title}</strong>
                    <small>{shortcut.url}</small>
                  </span>
                  <button
                    aria-label={`删除 ${shortcut.title}`}
                    onClick={() =>
                      void patch(
                        'shortcuts',
                        preferences.shortcuts.filter(
                          (entry) => entry.id !== shortcut.id,
                        ),
                      )
                    }
                    title="删除"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
              ))}
            </div>
          </SettingsContentSection>

          <SettingsContentSection id="wallpaper" label="壁纸">
            <h2>显示效果</h2>
            <section aria-label="壁纸显示参数">
              <Field label="填充方式">
                <select
                  onChange={(event) =>
                    void patch(
                      'wallpaperFit',
                      event.currentTarget
                        .value as NewTabPreferences['wallpaperFit'],
                    )
                  }
                  value={preferences.wallpaperFit}
                >
                  <option value="cover">填满页面</option>
                  <option value="contain">完整显示</option>
                </select>
              </Field>
              <Field label="壁纸位置">
                <select
                  onChange={(event) =>
                    void patch(
                      'wallpaperPosition',
                      event.currentTarget
                        .value as NewTabPreferences['wallpaperPosition'],
                    )
                  }
                  value={preferences.wallpaperPosition}
                >
                  <option value="center">居中</option>
                  <option value="top">顶部</option>
                  <option value="bottom">底部</option>
                  <option value="left">左侧</option>
                  <option value="right">右侧</option>
                </select>
              </Field>
              <Field label={`遮罩效果 ${preferences.wallpaperMask}%`}>
                <input
                  max="100"
                  min="0"
                  onChange={(event) =>
                    void patch(
                      'wallpaperMask',
                      Number(event.currentTarget.value),
                    )
                  }
                  type="range"
                  value={preferences.wallpaperMask}
                />
              </Field>
              <Field label="壁纸滤镜">
                <fieldset
                  aria-label="壁纸滤镜"
                  className="cm-new-tab-wallpaper-effect-tabs"
                >
                  {(
                    [
                      ['none', '关闭'],
                      ['grain', '颗粒'],
                      ['halftone', '网点'],
                      ['ascii', 'ASCII'],
                    ] as const
                  ).map(([effect, label]) => (
                    <button
                      aria-pressed={preferences.wallpaperEffect === effect}
                      data-selected={
                        preferences.wallpaperEffect === effect
                          ? 'true'
                          : 'false'
                      }
                      key={effect}
                      onClick={() => void patch('wallpaperEffect', effect)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </fieldset>
              </Field>
              {preferences.wallpaperEffect !== 'none' ? (
                <Field
                  label={`滤镜强度 ${preferences.wallpaperEffectStrength}`}
                >
                  <input
                    max="100"
                    min="0"
                    onChange={(event) =>
                      void patch(
                        'wallpaperEffectStrength',
                        Number(event.currentTarget.value),
                      )
                    }
                    type="range"
                    value={preferences.wallpaperEffectStrength}
                  />
                </Field>
              ) : null}
              {preferences.wallpaperEffect === 'halftone' ||
              preferences.wallpaperEffect === 'ascii' ? (
                <Field label={`滤镜尺寸 ${preferences.wallpaperEffectSize}`}>
                  <input
                    max="100"
                    min="10"
                    onChange={(event) =>
                      void patch(
                        'wallpaperEffectSize',
                        Number(event.currentTarget.value),
                      )
                    }
                    type="range"
                    value={preferences.wallpaperEffectSize}
                  />
                </Field>
              ) : null}
              {preferences.wallpaperEffect === 'halftone' ||
              preferences.wallpaperEffect === 'ascii' ? (
                <Field label={`滤镜间距 ${preferences.wallpaperEffectSpacing}`}>
                  <input
                    max="100"
                    min="0"
                    onChange={(event) =>
                      void patch(
                        'wallpaperEffectSpacing',
                        Number(event.currentTarget.value),
                      )
                    }
                    type="range"
                    value={preferences.wallpaperEffectSpacing}
                  />
                </Field>
              ) : null}
            </section>
            <h2 className="cm-new-tab-settings-subsection-title">壁纸来源</h2>
            <div className="cm-new-tab-wallpaper-mode">
              <div aria-label="壁纸来源" role="tablist">
                <button
                  aria-selected={wallpaperSourcePanel === 'default'}
                  data-current={
                    effectiveWallpaperSource === 'default' ? 'true' : 'false'
                  }
                  data-selected={
                    wallpaperSourcePanel === 'default' ? 'true' : 'false'
                  }
                  onClick={() => void selectWallpaperSource('default')}
                  role="tab"
                  type="button"
                >
                  <Image aria-hidden="true" size={15} />
                  默认壁纸
                  <span className="cm-new-tab-wallpaper-current">使用中</span>
                </button>
                <button
                  aria-selected={wallpaperSourcePanel === 'daily-review'}
                  data-current={
                    effectiveWallpaperSource === 'daily-review'
                      ? 'true'
                      : 'false'
                  }
                  data-selected={
                    wallpaperSourcePanel === 'daily-review' ? 'true' : 'false'
                  }
                  onClick={() => void selectWallpaperSource('daily-review')}
                  role="tab"
                  type="button"
                >
                  <Sparkles aria-hidden="true" size={15} />
                  AI 每日回顾
                  <span className="cm-new-tab-wallpaper-current">使用中</span>
                </button>
              </div>
              <p>
                {wallpaperSourcePanel === 'daily-review'
                  ? '根据浏览历史自动回顾，或自己填写点题摘要和具体画面描述。摘要要点名当天全部主题，画面要把每个主题写成能认出的东西。'
                  : '使用预设壁纸或你上传的本地图片。'}
              </p>
            </div>

            {wallpaperSourcePanel === 'daily-review' &&
            dailyReviewReadinessLoading ? (
              <div
                className="cm-new-tab-wallpaper-mode-state"
                data-state="loading"
                role="status"
              >
                <LoaderCircle
                  aria-hidden="true"
                  className="cm-new-tab-wallpaper-mode-state-icon"
                  size={18}
                />
                <div>
                  <strong>正在检查创作服务</strong>
                  <p>确认图像服务和可选的规划模型是否可用。</p>
                </div>
              </div>
            ) : wallpaperSourcePanel === 'daily-review' && dailyReviewIssue ? (
              <div
                className="cm-new-tab-wallpaper-mode-state"
                data-state="error"
                role="alert"
              >
                <AlertCircle
                  aria-hidden="true"
                  className="cm-new-tab-wallpaper-mode-state-icon"
                  size={18}
                />
                <div>
                  <strong>{dailyReviewIssue.title}</strong>
                  <p>{dailyReviewIssue.detail}</p>
                  <p>配置完成前，当前继续使用默认壁纸。</p>
                  {dailyReviewCanConfigure ? (
                    <div className="cm-new-tab-wallpaper-mode-state-actions">
                      <button
                        onClick={() => void openAiSettings()}
                        type="button"
                      >
                        <Settings aria-hidden="true" size={14} />
                        配置 AI 服务
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {wallpaperSourcePanel === 'daily-review' && dailyReviewReady ? (
              <section
                aria-label="AI 每日回顾壁纸设置"
                className="cm-new-tab-wallpaper-mode-panel"
                role="tabpanel"
              >
                {!dailyReviewSupported ||
                !dailyReviewReadiness?.modelServiceConfigured ? (
                  <div
                    className="cm-new-tab-wallpaper-mode-state"
                    data-state="notice"
                  >
                    <PencilLine
                      aria-hidden="true"
                      className="cm-new-tab-wallpaper-mode-state-icon"
                      size={18}
                    />
                    <div>
                      <strong>自定义内容生成已可用</strong>
                      <p>
                        {!dailyReviewSupported
                          ? '当前平台不能读取完整历史，但你仍可直接填写摘要和画面描述生成图片。'
                          : '规划模型尚未配置；你可以直接创作，或配置模型后启用历史自动回顾。'}
                      </p>
                      {!dailyReviewReadiness?.modelServiceConfigured ? (
                        <div className="cm-new-tab-wallpaper-mode-state-actions">
                          <button
                            onClick={() => void openAiSettings()}
                            type="button"
                          >
                            <Settings aria-hidden="true" size={14} />
                            配置规划模型
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <Field
                  description={
                    dailyReviewSupported &&
                    dailyReviewReadiness?.modelServiceConfigured
                      ? '让规划模型先分析整天的浏览脉络，再写出点题摘要，以及把每个主题都写成具体道具的生图提示词。'
                      : '配置模型服务并允许历史记录后可使用自动规划；下方自定义内容生成不受影响。'
                  }
                  label="生成前思考"
                >
                  <Toggle
                    checked={
                      dailyReviewSupported &&
                      preferences.dailyReviewReasoningEnabled
                    }
                    disabled={
                      !dailyReviewSupported ||
                      !dailyReviewReadiness?.modelServiceConfigured
                    }
                    label={
                      preferences.dailyReviewReasoningEnabled ? '开启' : '关闭'
                    }
                    onChange={(checked) =>
                      void patch('dailyReviewReasoningEnabled', checked)
                    }
                  />
                </Field>
                <Field
                  description="控制 AI 壁纸顶部的摘要和提示词展开栏；生成历史中的提示词仍会保留。"
                  label="顶部展示提示词"
                >
                  <Toggle
                    checked={preferences.dailyReviewShowPrompt}
                    label={preferences.dailyReviewShowPrompt ? '显示' : '隐藏'}
                    onChange={(checked) =>
                      void patch('dailyReviewShowPrompt', checked)
                    }
                  />
                </Field>
                <Field
                  description="固定 16:9 比例，影响下一次生成的图片尺寸。"
                  label="生成分辨率"
                >
                  <select
                    onChange={(event) =>
                      void patch(
                        'dailyReviewResolution',
                        event.currentTarget
                          .value as DailyReviewWallpaperResolution,
                      )
                    }
                    value={preferences.dailyReviewResolution}
                  >
                    {DAILY_REVIEW_RESOLUTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  description={`到期后自动清理；同时最多保留 ${DAILY_REVIEW_WALLPAPER_MAX_IMAGES} 张、同一日期 ${DAILY_REVIEW_WALLPAPER_MAX_IMAGES_PER_SOURCE_DATE} 张，原始图片合计不超过 ${DAILY_REVIEW_WALLPAPER_MAX_IMAGE_BYTES / 1024 / 1024} MB。当前展示和最新壁纸始终保留。`}
                  label="自动保留"
                >
                  <select
                    onChange={(event) =>
                      void patch(
                        'dailyReviewRetentionDays',
                        Number(
                          event.currentTarget.value,
                        ) as DailyReviewWallpaperRetentionDays,
                      )
                    }
                    value={preferences.dailyReviewRetentionDays}
                  >
                    {DAILY_REVIEW_WALLPAPER_RETENTION_DAY_OPTIONS.map(
                      (days) => (
                        <option key={days} value={days}>
                          {days} 天{days === 7 ? '（默认）' : ''}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <DailyReviewWallpaperSettings
                  active={preferences.wallpaperSource === 'daily-review'}
                  controller={dailyReviewController}
                  historyPlanningAvailable={Boolean(
                    dailyReviewSupported &&
                      dailyReviewReadiness?.modelServiceConfigured,
                  )}
                  onNotice={setNotice}
                  retentionDays={preferences.dailyReviewRetentionDays}
                />
                <Field
                  description="AI 壁纸启用后，本标签页首次没有操作且没有待处理交互时，自动进入电子相框；活动返回后不再重复触发。"
                  label="静置进入时间"
                >
                  <select
                    onChange={(event) =>
                      void patch(
                        'dailyReviewIdleSeconds',
                        Number(event.currentTarget.value),
                      )
                    }
                    value={preferences.dailyReviewIdleSeconds}
                  >
                    {DAILY_REVIEW_WALLPAPER_IDLE_SECONDS.map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds} 秒
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  description="AI 壁纸启用后，持续没有操作达到此时间时，忽略聚焦、悬浮和已打开的控件进入电子相框；每次活动后重新计时。"
                  label="最长等待时间"
                >
                  <select
                    onChange={(event) =>
                      void patch(
                        'dailyReviewForceSeconds',
                        Number(
                          event.currentTarget.value,
                        ) as NewTabPreferences['dailyReviewForceSeconds'],
                      )
                    }
                    value={preferences.dailyReviewForceSeconds}
                  >
                    {DAILY_REVIEW_WALLPAPER_FORCE_SECONDS.map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds < 60
                          ? `${seconds} 秒`
                          : `${seconds / 60} 分钟`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  description="只影响后续生成的每日回顾图片。恢复默认会自动跟随后续的默认风格更新。"
                  label="每日回顾画面风格"
                >
                  <div className="cm-new-tab-settings-style-editor">
                    <textarea
                      aria-label="每日回顾画面风格"
                      onChange={(event) =>
                        setDailyReviewStyleDraft(event.currentTarget.value)
                      }
                      placeholder="请使用简体中文描述每日回顾壁纸的画面风格。"
                      rows={10}
                      value={dailyReviewStyleDraft}
                    />
                    <div>
                      <button
                        onClick={() => {
                          if (
                            dailyReviewStyleDraft.trim() &&
                            !dailyReviewPromptUsesChinese(dailyReviewStyleDraft)
                          ) {
                            setNotice('画面风格必须使用简体中文。');
                            return;
                          }
                          const override = normalizeDailyReviewStyleOverride(
                            dailyReviewStyleDraft,
                          );
                          void patch(
                            'dailyReviewStyleOverride',
                            override === DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE
                              ? ''
                              : override,
                            '每日回顾风格已保存，将从下一次生成开始使用。',
                          );
                        }}
                        type="button"
                      >
                        <Save aria-hidden="true" size={15} />
                        保存
                      </button>
                      <button
                        disabled={
                          !preferences.dailyReviewStyleOverride &&
                          dailyReviewStyleDraft ===
                            DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE
                        }
                        onClick={() => {
                          setDailyReviewStyleDraft(
                            DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE,
                          );
                          void patch(
                            'dailyReviewStyleOverride',
                            '',
                            '每日回顾风格已恢复默认。',
                          );
                        }}
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" size={15} />
                        恢复默认
                      </button>
                    </div>
                  </div>
                </Field>
              </section>
            ) : wallpaperSourcePanel === 'default' ? (
              <section
                aria-label="默认壁纸设置"
                className="cm-new-tab-wallpaper-mode-panel"
                role="tabpanel"
              >
                <div
                  aria-label="壁纸颜色模式"
                  className="cm-new-tab-wallpaper-tone-tabs"
                  role="tablist"
                >
                  {(['light', 'dark'] as const).map((tone) => (
                    <button
                      aria-selected={wallpaperTone === tone}
                      className="cm-new-tab-wallpaper-tone-tab"
                      data-selected={wallpaperTone === tone ? 'true' : 'false'}
                      key={tone}
                      onClick={() => setWallpaperTone(tone)}
                      role="tab"
                      type="button"
                    >
                      {tone === 'light' ? '浅色模式' : '深色模式'}
                    </button>
                  ))}
                </div>
                <p className="cm-new-tab-wallpaper-tone-hint">
                  正在设置{wallpaperTone === 'light' ? '浅色' : '深色'}
                  模式壁纸
                </p>
                <div className="cm-new-tab-wallpaper-picker">
                  {NEW_TAB_BUILTIN_WALLPAPERS.map((wallpaper) => (
                    <button
                      aria-label={`使用${wallpaper.label}`}
                      data-selected={
                        (wallpaperTone === 'light'
                          ? preferences.wallpaperLight
                          : preferences.wallpaperDark) === wallpaper.id
                          ? 'true'
                          : 'false'
                      }
                      key={wallpaper.id}
                      onClick={() =>
                        void patch(
                          wallpaperTone === 'light'
                            ? 'wallpaperLight'
                            : 'wallpaperDark',
                          wallpaper.id,
                        )
                      }
                      type="button"
                    >
                      <span className="cm-new-tab-wallpaper-thumbnail">
                        <img
                          alt=""
                          loading="lazy"
                          src={assetUrl(wallpaper.thumbnailPath)}
                        />
                        <span
                          aria-hidden="true"
                          className="cm-new-tab-wallpaper-check"
                        >
                          <Check size={11} />
                        </span>
                      </span>
                    </button>
                  ))}
                  {localWallpapers.map((wallpaper) => (
                    <button
                      aria-label={`使用本地壁纸${wallpaper.name || ''}`}
                      data-selected={
                        (wallpaperTone === 'light'
                          ? preferences.wallpaperLight
                          : preferences.wallpaperDark) === wallpaper.id
                          ? 'true'
                          : 'false'
                      }
                      key={wallpaper.id}
                      onClick={() =>
                        void patch(
                          wallpaperTone === 'light'
                            ? 'wallpaperLight'
                            : 'wallpaperDark',
                          wallpaper.id,
                        )
                      }
                      type="button"
                    >
                      <span className="cm-new-tab-wallpaper-thumbnail">
                        <img alt="" src={wallpaper.thumbnailDataUrl} />
                        <span
                          aria-hidden="true"
                          className="cm-new-tab-wallpaper-check"
                        >
                          <Check size={11} />
                        </span>
                      </span>
                    </button>
                  ))}
                  <label
                    aria-label={`上传${wallpaperTone === 'light' ? '浅色' : '深色'}本地壁纸`}
                    className="cm-new-tab-wallpaper-upload-tile"
                  >
                    <span className="cm-new-tab-wallpaper-thumbnail">
                      <Upload aria-hidden="true" size={22} />
                    </span>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) =>
                        void uploadWallpaper(
                          wallpaperTone,
                          event.currentTarget.files?.[0],
                        )
                      }
                      type="file"
                    />
                  </label>
                </div>
              </section>
            ) : null}
          </SettingsContentSection>

          {capabilities.favicon ? (
            <SettingsContentSection id="favicons" label="图标与主题色">
              <Field label="网站图标">
                <Toggle
                  checked={preferences.faviconEnhanced}
                  label="增强获取"
                  onChange={(checked) => void patch('faviconEnhanced', checked)}
                />
              </Field>
              <Field label="主题色">
                <Toggle
                  checked={preferences.faviconThemeColor}
                  label="从网站图标提取"
                  onChange={(checked) =>
                    void patch('faviconThemeColor', checked)
                  }
                />
              </Field>
              <Field
                description="每行一个域名，这些网站的图标不参与主题色提取。"
                label="排除规则"
              >
                <textarea
                  onBlur={(event) =>
                    void patch(
                      'faviconExcludedDomains',
                      event.currentTarget.value
                        .split(/\r?\n/)
                        .map((entry) => entry.trim())
                        .filter(Boolean),
                    )
                  }
                  defaultValue={preferences.faviconExcludedDomains.join('\n')}
                  rows={8}
                />
              </Field>
            </SettingsContentSection>
          ) : null}
        </div>
      </div>

      {notice ? (
        <div className="cm-new-tab-notice" role="status">
          {notice}
        </div>
      ) : null}
    </main>
  );
}
