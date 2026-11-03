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
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
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
  {
    id: 'general',
    get label() {
      return t('cm_new_tab_settings_page_label_1');
    },
    icon: Settings,
  },
  {
    id: 'appearance',
    get label() {
      return t('cm_new_tab_settings_page_label_2');
    },
    icon: MonitorCog,
  },
  {
    id: 'wallpaper',
    get label() {
      return t('cm_new_tab_settings_page_label_3');
    },
    icon: Image,
  },
  {
    id: 'home',
    get label() {
      return t('cm_new_tab_settings_page_label_4');
    },
    icon: Home,
  },
  {
    id: 'search',
    get label() {
      return t('cm_new_tab_settings_page_label_5');
    },
    icon: Search,
  },
  {
    id: 'engines',
    get label() {
      return t('cm_new_tab_settings_page_label_6');
    },
    icon: Compass,
  },
  {
    id: 'blacklist',
    get label() {
      return t('cm_new_tab_settings_page_label_7');
    },
    icon: Link2,
  },
  {
    id: 'bookmarks',
    get label() {
      return t('cm_new_tab_settings_page_label_8');
    },
    icon: Bookmark,
  },
  {
    id: 'shortcuts',
    get label() {
      return t('cm_new_tab_settings_page_label_9');
    },
    icon: Sparkles,
  },
  {
    id: 'favicons',
    get label() {
      return t('cm_new_tab_settings_page_label_10');
    },
    icon: MonitorCog,
  },
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
  useLocale();

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
  useLocale();

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

export function NewTabModeNotice({
  overridesBrowserNewTab,
}: {
  overridesBrowserNewTab: boolean;
}) {
  useLocale();

  return (
    <Field
      label={t('cm_new_tab_settings_page_label_11')}
      description={
        overridesBrowserNewTab
          ? t('cm_new_tab_settings_page_text_12')
          : t('cm_new_tab_settings_page_text_13')
      }
    >
      <div className="cm-new-tab-settings-mode">
        <a
          href="https://github.com/LYiHub/Card-master-browser-extension-public/releases/latest"
          rel="noreferrer"
          target="_blank"
        >
          {t('cm_new_tab_settings_page_text_14')}
        </a>
        <span>{t('cm_new_tab_settings_page_text_15')}</span>
      </div>
    </Field>
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
  useLocale();

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
      title: t('cm_new_tab_settings_page_title_16'),
      detail: error,
    };
  }
  if (!readiness) return null;
  if (!readiness.imageServiceConfigured) {
    return {
      title: t('cm_new_tab_settings_page_title_17'),
      detail: t('cm_new_tab_settings_page_detail_18'),
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
  overridesBrowserNewTab,
  dailyReviewController,
  dailyReviewSupported,
  localWallpaperRepository,
  preferencesRepository,
}: {
  assetUrl(path: string): string;
  backUrl: string;
  capabilities: NewTabCapabilities;
  overridesBrowserNewTab: boolean;
  dailyReviewController: DailyReviewWallpaperSettingsController;
  dailyReviewSupported: boolean;
  localWallpaperRepository: NewTabLocalWallpaperRepository;
  preferencesRepository: NewTabPreferencesRepository;
}) {
  useLocale();

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
  const [webdavSync, setWebdavSync] = useState(false);
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
    void preferencesRepository.webdavOwnsPreferences().then(setWebdavSync);
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
        setNotice(
          error instanceof Error
            ? error.message
            : t('cm_new_tab_settings_page_text_19'),
        ),
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
          error instanceof Error
            ? error.message
            : t('cm_new_tab_settings_page_text_20'),
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
          error instanceof Error
            ? error.message
            : t('cm_new_tab_settings_page_text_21'),
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
      message = t('cm_new_tab_settings_page_text_22'),
    ) => {
      try {
        const next = await preferencesRepository.mutate(mutation);
        setPreferences(next);
        setNotice(message);
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : t('cm_new_tab_settings_page_text_23'),
        );
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
        t('cm_new_tab_settings_page_text_24', [
          String(
            tone === 'light'
              ? t('cm_new_tab_settings_page_text_1')
              : t('cm_new_tab_settings_page_text_2'),
          ),
        ]),
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : t('cm_new_tab_settings_page_text_25'),
      );
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
      setNotice(t('cm_new_tab_settings_page_text_26'));
      return;
    }
    void mutate(
      (current) => ({
        ...current,
        searchEngines: [...current.searchEngines, draft],
      }),
      t('cm_new_tab_settings_page_text_27'),
    ).then(() => setEngineDraft({ name: '', keyword: '', queryUrl: '' }));
  };

  const saveDestination = async () => {
    try {
      const destinationUrl = parseNewTabDestinationUrl(destinationDraft);
      await patch(
        'destinationUrl',
        destinationUrl,
        destinationUrl
          ? t('cm_new_tab_settings_page_text_28')
          : t('cm_new_tab_settings_page_text_29'),
      );
      setDestinationDraft(destinationUrl);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : t('cm_new_tab_settings_page_text_30'),
      );
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
      setNotice(t('cm_new_tab_settings_page_text_31'));
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : t('cm_new_tab_settings_page_text_32'),
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
        ? t('cm_new_tab_settings_page_text_33')
        : t('cm_new_tab_settings_page_text_34'),
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
        error instanceof Error
          ? error.message
          : t('cm_new_tab_settings_page_text_35'),
      );
    }
    await openAiSettings();
  };

  if (!preferences) {
    return (
      <main className="cm-new-tab-settings-loading">
        {t('cm_new_tab_settings_page_text_36')}
      </main>
    );
  }

  return (
    <main
      className="cm-new-tab-settings-page"
      data-theme={preferences.themeMode}
    >
      <header className="cm-new-tab-settings-header">
        <button
          aria-label={t('cm_new_tab_settings_page_aria_label_37')}
          onClick={() => {
            location.href = backUrl;
          }}
          title={t('cm_new_tab_settings_page_title_38')}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <div>
          <strong>{t('cm_new_tab_settings_page_text_39')}</strong>
        </div>
      </header>

      <div className="cm-new-tab-settings-layout">
        <nav aria-label={t('cm_new_tab_settings_page_aria_label_40')}>
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
          <SettingsContentSection
            id="general"
            label={t('cm_new_tab_settings_page_label_41')}
          >
            <NewTabModeNotice overridesBrowserNewTab={overridesBrowserNewTab} />
            <Field
              description={
                overridesBrowserNewTab
                  ? t('cm_new_tab_settings_page_text_42')
                  : t('cm_new_tab_settings_page_text_43')
              }
              label={t('cm_new_tab_settings_page_label_44')}
            >
              <div className="cm-new-tab-settings-destination">
                <input
                  aria-label={t('cm_new_tab_settings_page_aria_label_45')}
                  disabled={!overridesBrowserNewTab}
                  onChange={(event) =>
                    setDestinationDraft(event.currentTarget.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void saveDestination();
                    }
                  }}
                  placeholder={t('cm_new_tab_settings_page_placeholder_46')}
                  type="url"
                  value={destinationDraft}
                />
                <button
                  disabled={!overridesBrowserNewTab}
                  onClick={() => void saveDestination()}
                  type="button"
                >
                  <Save aria-hidden="true" size={15} />
                  {t('cm_new_tab_settings_page_text_47')}
                </button>
                <button
                  disabled={
                    !overridesBrowserNewTab ||
                    (!preferences.destinationUrl && !destinationDraft.trim())
                  }
                  onClick={() => {
                    setDestinationDraft('');
                    void patch(
                      'destinationUrl',
                      '',
                      t('cm_new_tab_settings_page_text_48'),
                    );
                  }}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={15} />
                  {t('cm_new_tab_settings_page_text_49')}
                </button>
              </div>
            </Field>
            <Field label={t('cm_new_tab_settings_page_label_50')}>
              <select
                onChange={(event) =>
                  void patch(
                    'themeMode',
                    event.currentTarget.value as NewTabPreferences['themeMode'],
                  )
                }
                value={preferences.themeMode}
              >
                <option value="system">
                  {t('cm_new_tab_settings_page_text_51')}
                </option>
                <option value="light">
                  {t('cm_new_tab_settings_page_text_52')}
                </option>
                <option value="dark">
                  {t('cm_new_tab_settings_page_text_53')}
                </option>
              </select>
            </Field>
            <Field label={t('cm_new_tab_settings_page_label_54')}>
              <Toggle
                checked={preferences.showClock}
                label={t('cm_new_tab_settings_page_label_55')}
                onChange={(checked) => void patch('showClock', checked)}
              />
            </Field>
            {webdavSync ? (
              <Field
                label={t('cm_new_tab_settings_page_label_56')}
                description={t('cm_new_tab_settings_page_description_57')}
              >
                <span>{t('cm_new_tab_settings_page_text_58')}</span>
              </Field>
            ) : capabilities.storageSync ? (
              <Field
                description={t('cm_new_tab_settings_page_description_59')}
                label={t('cm_new_tab_settings_page_label_60')}
              >
                <Toggle
                  checked={preferences.syncEnabled}
                  label={t('cm_new_tab_settings_page_label_61')}
                  onChange={(checked) => void patch('syncEnabled', checked)}
                />
              </Field>
            ) : null}
          </SettingsContentSection>

          <SettingsContentSection
            id="appearance"
            label={t('cm_new_tab_settings_page_label_62')}
          >
            <Field
              label={t('cm_new_tab_settings_page_text_63', [
                String(preferences.contentWidth),
              ])}
            >
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
            <Field
              label={t('cm_new_tab_settings_page_text_64', [
                String(preferences.searchWidth),
              ])}
            >
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
            <SettingsContentSection
              id="home"
              label={t('cm_new_tab_settings_page_label_65')}
            >
              <Field label={t('cm_new_tab_settings_page_label_66')}>
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
                    <option value="recent">
                      {t('cm_new_tab_settings_page_text_67')}
                    </option>
                  ) : null}
                  {capabilities.topSites ? (
                    <option value="most-visited">
                      {t('cm_new_tab_settings_page_text_68')}
                    </option>
                  ) : null}
                </select>
              </Field>
              <Field
                label={t('cm_new_tab_settings_page_text_69', [
                  String(preferences.recentCount),
                ])}
              >
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
              <Field label={t('cm_new_tab_settings_page_label_70')}>
                <button
                  disabled={preferences.hiddenSiteUrls.length === 0}
                  onClick={() => void patch('hiddenSiteUrls', [])}
                  type="button"
                >
                  {t('cm_new_tab_settings_page_text_71')}
                  {preferences.hiddenSiteUrls.length}{' '}
                  {t('cm_new_tab_settings_page_text_72')}
                </button>
              </Field>
            </SettingsContentSection>
          ) : null}

          <SettingsContentSection
            id="search"
            label={t('cm_new_tab_settings_page_label_73')}
          >
            <Field label={t('cm_new_tab_settings_page_label_74')}>
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
                <option value="autocomplete">
                  {t('cm_new_tab_settings_page_text_75')}
                </option>
                {capabilities.browserSearch ? (
                  <option value="browser-search">
                    {t('cm_new_tab_settings_page_text_76')}
                  </option>
                ) : null}
              </select>
            </Field>
            <Field label={t('cm_new_tab_settings_page_label_77')}>
              <div className="cm-new-tab-settings-checks">
                {searchSources.map((source) => (
                  <Toggle
                    checked={preferences.searchSources.includes(source)}
                    key={source}
                    label={
                      {
                        history: t('cm_new_tab_settings_page_history_78'),
                        bookmark: t('cm_new_tab_settings_page_bookmark_79'),
                        'top-site': t('cm_new_tab_settings_page__top_site__80'),
                        'open-tab': t('cm_new_tab_settings_page__open_tab__81'),
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

          <SettingsContentSection
            id="engines"
            label={t('cm_new_tab_settings_page_label_82')}
          >
            <Field label={t('cm_new_tab_settings_page_label_83')}>
              <select
                onChange={(event) =>
                  void patch('defaultSearchEngineId', event.currentTarget.value)
                }
                value={preferences.defaultSearchEngineId}
              >
                {capabilities.browserSearch ? (
                  <option value="browser">
                    {t('cm_new_tab_settings_page_text_84')}
                  </option>
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
                    aria-label={t('cm_new_tab_settings_page_text_85', [
                      String(engine.name),
                    ])}
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
                    title={t('cm_new_tab_settings_page_title_86')}
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
                placeholder={t('cm_new_tab_settings_page_placeholder_87')}
                value={engineDraft.name}
              />
              <input
                onChange={(event) =>
                  setEngineDraft((current) => ({
                    ...current,
                    keyword: event.currentTarget.value,
                  }))
                }
                placeholder={t('cm_new_tab_settings_page_placeholder_88')}
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
                {t('cm_new_tab_settings_page_text_89')}
              </button>
            </div>
          </SettingsContentSection>

          <SettingsContentSection
            id="blacklist"
            label={t('cm_new_tab_settings_page_label_90')}
          >
            <div className="cm-new-tab-settings-list">
              {preferences.searchBlacklist.map((entry, index) => (
                <div key={`${entry.mode}:${entry.value}`}>
                  <span>
                    <strong>
                      {
                        {
                          domain: t('cm_new_tab_settings_page_domain_91'),
                          'url-prefix': t(
                            'cm_new_tab_settings_page__url_prefix__92',
                          ),
                          'exact-url': t(
                            'cm_new_tab_settings_page__exact_url__93',
                          ),
                        }[entry.mode]
                      }
                    </strong>
                    <small>{entry.value}</small>
                  </span>
                  <button
                    aria-label={t('cm_new_tab_settings_page_aria_label_94')}
                    onClick={() =>
                      void patch(
                        'searchBlacklist',
                        preferences.searchBlacklist.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      )
                    }
                    title={t('cm_new_tab_settings_page_title_95')}
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
                <option value="domain">
                  {t('cm_new_tab_settings_page_text_96')}
                </option>
                <option value="url-prefix">
                  {t('cm_new_tab_settings_page_text_97')}
                </option>
                <option value="exact-url">
                  {t('cm_new_tab_settings_page_text_98')}
                </option>
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
                {t('cm_new_tab_settings_page_text_99')}
              </button>
            </div>
          </SettingsContentSection>

          {capabilities.bookmarks ? (
            <SettingsContentSection
              id="bookmarks"
              label={t('cm_new_tab_settings_page_label_100')}
            >
              <Field
                label={t('cm_new_tab_settings_page_text_101', [
                  String(preferences.bookmarkPageSize),
                ])}
              >
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
              <Field
                label={t('cm_new_tab_settings_page_text_102', [
                  String(preferences.bookmarkColumns),
                ])}
              >
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
              <Field label={t('cm_new_tab_settings_page_label_103')}>
                <Toggle
                  checked={preferences.bookmarkFolderIcons}
                  label={t('cm_new_tab_settings_page_label_104')}
                  onChange={(checked) =>
                    void patch('bookmarkFolderIcons', checked)
                  }
                />
              </Field>
            </SettingsContentSection>
          ) : null}

          <SettingsContentSection
            id="shortcuts"
            label={t('cm_new_tab_settings_page_label_105')}
          >
            <Field label={t('cm_new_tab_settings_page_label_106')}>
              <div className="cm-new-tab-settings-checks">
                <Toggle
                  checked={preferences.shortcutsVisible}
                  label={t('cm_new_tab_settings_page_label_107')}
                  onChange={(checked) =>
                    void patch('shortcutsVisible', checked)
                  }
                />
                <Toggle
                  checked={preferences.shortcutAddVisible}
                  label={t('cm_new_tab_settings_page_label_108')}
                  onChange={(checked) =>
                    void patch('shortcutAddVisible', checked)
                  }
                />
                <Toggle
                  checked={preferences.shortcutDockMagnification}
                  label={t('cm_new_tab_settings_page_label_109')}
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
                    aria-label={t('cm_new_tab_settings_page_text_110', [
                      String(shortcut.title),
                    ])}
                    onClick={() =>
                      void patch(
                        'shortcuts',
                        preferences.shortcuts.filter(
                          (entry) => entry.id !== shortcut.id,
                        ),
                      )
                    }
                    title={t('cm_new_tab_settings_page_title_111')}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
              ))}
            </div>
          </SettingsContentSection>

          <SettingsContentSection
            id="wallpaper"
            label={t('cm_new_tab_settings_page_label_112')}
          >
            <h2>{t('cm_new_tab_settings_page_text_113')}</h2>
            <section aria-label={t('cm_new_tab_settings_page_aria_label_114')}>
              <Field label={t('cm_new_tab_settings_page_label_115')}>
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
                  <option value="cover">
                    {t('cm_new_tab_settings_page_text_116')}
                  </option>
                  <option value="contain">
                    {t('cm_new_tab_settings_page_text_117')}
                  </option>
                </select>
              </Field>
              <Field label={t('cm_new_tab_settings_page_label_118')}>
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
                  <option value="center">
                    {t('cm_new_tab_settings_page_text_119')}
                  </option>
                  <option value="top">
                    {t('cm_new_tab_settings_page_text_120')}
                  </option>
                  <option value="bottom">
                    {t('cm_new_tab_settings_page_text_121')}
                  </option>
                  <option value="left">
                    {t('cm_new_tab_settings_page_text_122')}
                  </option>
                  <option value="right">
                    {t('cm_new_tab_settings_page_text_123')}
                  </option>
                </select>
              </Field>
              <Field
                label={t('cm_new_tab_settings_page_text_124', [
                  String(preferences.wallpaperMask),
                ])}
              >
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
              <Field label={t('cm_new_tab_settings_page_label_125')}>
                <fieldset
                  aria-label={t('cm_new_tab_settings_page_aria_label_126')}
                  className="cm-new-tab-wallpaper-effect-tabs"
                >
                  {(
                    [
                      ['none', t('cm_new_tab_settings_page_text_127')],
                      ['grain', t('cm_new_tab_settings_page_text_128')],
                      ['halftone', t('cm_new_tab_settings_page_text_129')],
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
                  label={t('cm_new_tab_settings_page_text_130', [
                    String(preferences.wallpaperEffectStrength),
                  ])}
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
                <Field
                  label={t('cm_new_tab_settings_page_text_131', [
                    String(preferences.wallpaperEffectSize),
                  ])}
                >
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
                <Field
                  label={t('cm_new_tab_settings_page_text_132', [
                    String(preferences.wallpaperEffectSpacing),
                  ])}
                >
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
            <h2 className="cm-new-tab-settings-subsection-title">
              {t('cm_new_tab_settings_page_text_133')}
            </h2>
            <div className="cm-new-tab-wallpaper-mode">
              <div
                aria-label={t('cm_new_tab_settings_page_aria_label_134')}
                role="tablist"
              >
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
                  {t('cm_new_tab_settings_page_text_135')}
                  <span className="cm-new-tab-wallpaper-current">
                    {t('cm_new_tab_settings_page_text_136')}
                  </span>
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
                  {t('cm_new_tab_settings_page_text_137')}
                  <span className="cm-new-tab-wallpaper-current">
                    {t('cm_new_tab_settings_page_text_138')}
                  </span>
                </button>
              </div>
              <p>
                {wallpaperSourcePanel === 'daily-review'
                  ? t('cm_new_tab_settings_page_text_139')
                  : t('cm_new_tab_settings_page_text_140')}
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
                  <strong>{t('cm_new_tab_settings_page_text_141')}</strong>
                  <p>{t('cm_new_tab_settings_page_text_142')}</p>
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
                  <p>{t('cm_new_tab_settings_page_text_143')}</p>
                  {dailyReviewCanConfigure ? (
                    <div className="cm-new-tab-wallpaper-mode-state-actions">
                      <button
                        onClick={() => void openAiSettings()}
                        type="button"
                      >
                        <Settings aria-hidden="true" size={14} />
                        {t('cm_new_tab_settings_page_text_144')}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {wallpaperSourcePanel === 'daily-review' && dailyReviewReady ? (
              <section
                aria-label={t('cm_new_tab_settings_page_aria_label_145')}
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
                      <strong>{t('cm_new_tab_settings_page_text_146')}</strong>
                      <p>
                        {!dailyReviewSupported
                          ? t('cm_new_tab_settings_page_text_147')
                          : t('cm_new_tab_settings_page_text_148')}
                      </p>
                      {!dailyReviewReadiness?.modelServiceConfigured ? (
                        <div className="cm-new-tab-wallpaper-mode-state-actions">
                          <button
                            onClick={() => void openAiSettings()}
                            type="button"
                          >
                            <Settings aria-hidden="true" size={14} />
                            {t('cm_new_tab_settings_page_text_149')}
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
                      ? t('cm_new_tab_settings_page_text_150')
                      : t('cm_new_tab_settings_page_text_151')
                  }
                  label={t('cm_new_tab_settings_page_label_152')}
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
                      preferences.dailyReviewReasoningEnabled
                        ? t('cm_new_tab_settings_page_text_153')
                        : t('cm_new_tab_settings_page_text_154')
                    }
                    onChange={(checked) =>
                      void patch('dailyReviewReasoningEnabled', checked)
                    }
                  />
                </Field>
                <Field
                  description={t('cm_new_tab_settings_page_description_155')}
                  label={t('cm_new_tab_settings_page_label_156')}
                >
                  <Toggle
                    checked={preferences.dailyReviewShowPrompt}
                    label={
                      preferences.dailyReviewShowPrompt
                        ? t('cm_new_tab_settings_page_text_157')
                        : t('cm_new_tab_settings_page_text_158')
                    }
                    onChange={(checked) =>
                      void patch('dailyReviewShowPrompt', checked)
                    }
                  />
                </Field>
                <Field
                  description={t('cm_new_tab_settings_page_description_159')}
                  label={t('cm_new_tab_settings_page_label_160')}
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
                  description={t('cm_new_tab_settings_page_text_161', [
                    String(DAILY_REVIEW_WALLPAPER_MAX_IMAGES),
                    String(DAILY_REVIEW_WALLPAPER_MAX_IMAGES_PER_SOURCE_DATE),
                    String(
                      DAILY_REVIEW_WALLPAPER_MAX_IMAGE_BYTES / 1024 / 1024,
                    ),
                  ])}
                  label={t('cm_new_tab_settings_page_label_162')}
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
                          {days} {t('cm_new_tab_settings_page_text_163')}
                          {days === 7
                            ? t('cm_new_tab_settings_page_text_164')
                            : ''}
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
                  description={t('cm_new_tab_settings_page_description_165')}
                  label={t('cm_new_tab_settings_page_label_166')}
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
                        {seconds} {t('cm_new_tab_settings_page_text_167')}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  description={t('cm_new_tab_settings_page_description_168')}
                  label={t('cm_new_tab_settings_page_label_169')}
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
                          ? t('cm_new_tab_settings_page_text_170', [
                              String(seconds),
                            ])
                          : t('cm_new_tab_settings_page_text_171', [
                              String(seconds / 60),
                            ])}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  description={t('cm_new_tab_settings_page_description_172')}
                  label={t('cm_new_tab_settings_page_label_173')}
                >
                  <div className="cm-new-tab-settings-style-editor">
                    <textarea
                      aria-label={t('cm_new_tab_settings_page_aria_label_174')}
                      onChange={(event) =>
                        setDailyReviewStyleDraft(event.currentTarget.value)
                      }
                      placeholder={t(
                        'cm_new_tab_settings_page_placeholder_175',
                      )}
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
                            setNotice(t('cm_new_tab_settings_page_text_176'));
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
                            t('cm_new_tab_settings_page_text_177'),
                          );
                        }}
                        type="button"
                      >
                        <Save aria-hidden="true" size={15} />
                        {t('cm_new_tab_settings_page_text_178')}
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
                            t('cm_new_tab_settings_page_text_179'),
                          );
                        }}
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" size={15} />
                        {t('cm_new_tab_settings_page_text_180')}
                      </button>
                    </div>
                  </div>
                </Field>
              </section>
            ) : wallpaperSourcePanel === 'default' ? (
              <section
                aria-label={t('cm_new_tab_settings_page_aria_label_181')}
                className="cm-new-tab-wallpaper-mode-panel"
                role="tabpanel"
              >
                <div
                  aria-label={t('cm_new_tab_settings_page_aria_label_182')}
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
                      {tone === 'light'
                        ? t('cm_new_tab_settings_page_text_183')
                        : t('cm_new_tab_settings_page_text_184')}
                    </button>
                  ))}
                </div>
                <p className="cm-new-tab-wallpaper-tone-hint">
                  {t('cm_new_tab_settings_page_text_185')}
                  {wallpaperTone === 'light'
                    ? t('cm_new_tab_settings_page_text_186')
                    : t('cm_new_tab_settings_page_text_187')}
                  {t('cm_new_tab_settings_page_text_188')}
                </p>
                <div className="cm-new-tab-wallpaper-picker">
                  {NEW_TAB_BUILTIN_WALLPAPERS.map((wallpaper) => (
                    <button
                      aria-label={t('cm_new_tab_settings_page_text_189', [
                        String(wallpaper.label),
                      ])}
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
                      aria-label={t('cm_new_tab_settings_page_text_190', [
                        String(wallpaper.name || ''),
                      ])}
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
                    aria-label={t('cm_new_tab_settings_page_text_191', [
                      String(
                        wallpaperTone === 'light'
                          ? t('cm_new_tab_settings_page_text_3')
                          : t('cm_new_tab_settings_page_text_4'),
                      ),
                    ])}
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
            <SettingsContentSection
              id="favicons"
              label={t('cm_new_tab_settings_page_label_192')}
            >
              <Field label={t('cm_new_tab_settings_page_label_193')}>
                <Toggle
                  checked={preferences.faviconEnhanced}
                  label={t('cm_new_tab_settings_page_label_194')}
                  onChange={(checked) => void patch('faviconEnhanced', checked)}
                />
              </Field>
              <Field label={t('cm_new_tab_settings_page_label_195')}>
                <Toggle
                  checked={preferences.faviconThemeColor}
                  label={t('cm_new_tab_settings_page_label_196')}
                  onChange={(checked) =>
                    void patch('faviconThemeColor', checked)
                  }
                />
              </Field>
              <Field
                description={t('cm_new_tab_settings_page_description_197')}
                label={t('cm_new_tab_settings_page_label_198')}
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
