import { resolveSiteScope } from '../../lib/site-scope';

export const PAGE_THEME_CARD_ID = 'system-theme-weaver' as const;
export const PAGE_THEME_STORAGE_KEY = 'page-theme.settings.v1';

export type PageThemeRuntimeStatus = 'starting' | 'ready' | 'error';

export type PageThemeEngine = 'dynamicTheme' | 'cssFilter';
export type PageThemeAutomationMode = 'none' | 'system' | 'time';
export type PageThemeAutomationBehavior = 'on-off' | 'scheme';
export type PageThemeInactiveReason =
  | 'global-disabled'
  | 'site-disabled'
  | 'automation'
  | 'native-dark'
  | null;

export type PageThemeTheme = {
  mode: 0 | 1;
  brightness: number;
  contrast: number;
  grayscale: number;
  sepia: number;
  useFont: boolean;
  fontFamily: string;
  textStroke: number;
  engine: PageThemeEngine;
  stylesheet: string;
  darkSchemeBackgroundColor: string;
  darkSchemeTextColor: string;
  lightSchemeBackgroundColor: string;
  lightSchemeTextColor: string;
  scrollbarColor: '' | 'auto' | string;
  selectionColor: '' | 'auto' | string;
  styleSystemControls: boolean;
  lightColorScheme: string;
  darkColorScheme: string;
  immediateModify: boolean;
};

export type PageThemeSettings = {
  version: 1;
  revision: number;
  enabled: boolean;
  theme: PageThemeTheme;
  enabledByDefault: boolean;
  enabledFor: string[];
  disabledFor: string[];
  detectDarkTheme: boolean;
  automation: {
    mode: PageThemeAutomationMode;
    behavior: PageThemeAutomationBehavior;
  };
  time: {
    activation: string;
    deactivation: string;
  };
  siteOverrides: Record<string, Partial<PageThemeTheme>>;
};

export type PageThemeSnapshot = {
  revision: number;
  status: PageThemeRuntimeStatus;
  enabled: boolean;
  activeOnPage: boolean;
  inactiveReason: PageThemeInactiveReason;
  currentHost: string;
  engine: PageThemeEngine;
  darkThemeDetected: boolean;
  error?: string;
};

export type PageThemeSettingsView = {
  settings: PageThemeSettings;
  snapshot: PageThemeSnapshot;
};

export type PageThemeCard = {
  kind: 'page-theme';
  id: typeof PAGE_THEME_CARD_ID;
  title: string;
  description: string;
  snapshot: PageThemeSnapshot;
};

export type PageThemeSnapshotListener = (snapshot: PageThemeSnapshot) => void;

export interface PageThemeController {
  read(): Promise<PageThemeSnapshot>;
  readSettings(): Promise<PageThemeSettingsView>;
  subscribe(listener: PageThemeSnapshotListener): () => void;
  setEnabled(enabled: boolean): Promise<PageThemeSnapshot>;
  toggleCurrentSite(): Promise<PageThemeSnapshot>;
  saveSettings(settings: PageThemeSettings): Promise<PageThemeSettingsView>;
  resetSettings(): Promise<PageThemeSettingsView>;
  dispose(): void;
}

function darkReaderDefaultFontFamily() {
  if (typeof navigator === 'undefined') return 'system-ui';
  const userAgentData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  const platform = (
    typeof userAgentData?.platform === 'string'
      ? userAgentData.platform
      : navigator.platform
  ).toLowerCase();
  return platform.startsWith('mac')
    ? 'Helvetica Neue'
    : platform.startsWith('win')
      ? 'Segoe UI'
      : 'system-ui';
}

export const DEFAULT_PAGE_THEME: PageThemeTheme = {
  mode: 1,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  sepia: 0,
  useFont: false,
  fontFamily: darkReaderDefaultFontFamily(),
  textStroke: 0,
  engine: 'dynamicTheme',
  stylesheet: '',
  darkSchemeBackgroundColor: '#181a1b',
  darkSchemeTextColor: '#e8e6e3',
  lightSchemeBackgroundColor: '#dcdad7',
  lightSchemeTextColor: '#181a1b',
  scrollbarColor: '',
  selectionColor: 'auto',
  styleSystemControls: false,
  lightColorScheme: 'Default',
  darkColorScheme: 'Default',
  immediateModify: false,
};

export function defaultPageThemeSettings(): PageThemeSettings {
  return {
    version: 1,
    revision: 0,
    enabled: false,
    theme: { ...DEFAULT_PAGE_THEME },
    enabledByDefault: false,
    enabledFor: [],
    disabledFor: [],
    detectDarkTheme: true,
    automation: {
      mode: 'none',
      behavior: 'on-off',
    },
    time: {
      activation: '18:00',
      deactivation: '09:00',
    },
    siteOverrides: {},
  };
}

export function startingPageThemeSnapshot(
  url = typeof location === 'undefined' ? '' : location.href,
): PageThemeSnapshot {
  return {
    revision: 0,
    status: 'starting',
    enabled: false,
    activeOnPage: false,
    inactiveReason: null,
    currentHost: pageThemeHost(url),
    engine: 'dynamicTheme',
    darkThemeDetected: false,
  };
}

export function pageThemeHost(url: string) {
  return resolveSiteScope(url)?.host ?? '';
}

function uniqueHosts(values: readonly string[]) {
  return [
    ...new Set(
      values
        .map((value) =>
          pageThemeHost(value.includes('://') ? value : `https://${value}`),
        )
        .filter(Boolean),
    ),
  ];
}

function numberInRange(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function theme(value: unknown): value is PageThemeTheme {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.mode === 0 || candidate.mode === 1) &&
    numberInRange(candidate.brightness, 5, 200) &&
    numberInRange(candidate.contrast, 5, 200) &&
    numberInRange(candidate.grayscale, 0, 100) &&
    numberInRange(candidate.sepia, 0, 100) &&
    typeof candidate.useFont === 'boolean' &&
    typeof candidate.fontFamily === 'string' &&
    numberInRange(candidate.textStroke, 0, 2) &&
    (candidate.engine === 'dynamicTheme' || candidate.engine === 'cssFilter') &&
    typeof candidate.stylesheet === 'string' &&
    typeof candidate.darkSchemeBackgroundColor === 'string' &&
    typeof candidate.darkSchemeTextColor === 'string' &&
    typeof candidate.lightSchemeBackgroundColor === 'string' &&
    typeof candidate.lightSchemeTextColor === 'string' &&
    typeof candidate.scrollbarColor === 'string' &&
    typeof candidate.selectionColor === 'string' &&
    typeof candidate.styleSystemControls === 'boolean' &&
    typeof candidate.lightColorScheme === 'string' &&
    typeof candidate.darkColorScheme === 'string' &&
    typeof candidate.immediateModify === 'boolean'
  );
}

const PAGE_THEME_KEYS = new Set(Object.keys(DEFAULT_PAGE_THEME));

function partialTheme(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).every((key) => PAGE_THEME_KEYS.has(key)) &&
    theme({ ...DEFAULT_PAGE_THEME, ...candidate })
  );
}

export function isPageThemeSettings(
  value: unknown,
): value is PageThemeSettings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const automation =
    candidate.automation && typeof candidate.automation === 'object'
      ? (candidate.automation as Record<string, unknown>)
      : null;
  const time =
    candidate.time && typeof candidate.time === 'object'
      ? (candidate.time as Record<string, unknown>)
      : null;
  const siteOverrides =
    candidate.siteOverrides && typeof candidate.siteOverrides === 'object'
      ? (candidate.siteOverrides as Record<string, unknown>)
      : null;
  return (
    candidate.version === 1 &&
    typeof candidate.revision === 'number' &&
    Number.isSafeInteger(candidate.revision) &&
    candidate.revision >= 0 &&
    typeof candidate.enabled === 'boolean' &&
    theme(candidate.theme) &&
    typeof candidate.enabledByDefault === 'boolean' &&
    Array.isArray(candidate.enabledFor) &&
    candidate.enabledFor.every((entry) => typeof entry === 'string') &&
    Array.isArray(candidate.disabledFor) &&
    candidate.disabledFor.every((entry) => typeof entry === 'string') &&
    typeof candidate.detectDarkTheme === 'boolean' &&
    automation !== null &&
    (automation.mode === 'none' ||
      automation.mode === 'system' ||
      automation.mode === 'time') &&
    (automation.behavior === 'on-off' || automation.behavior === 'scheme') &&
    time !== null &&
    typeof time.activation === 'string' &&
    /^\d{2}:\d{2}$/.test(time.activation) &&
    typeof time.deactivation === 'string' &&
    /^\d{2}:\d{2}$/.test(time.deactivation) &&
    siteOverrides !== null &&
    Object.keys(siteOverrides).length <= 2_048 &&
    Object.entries(siteOverrides).every(
      ([host, entry]) => host.length <= 255 && partialTheme(entry),
    )
  );
}

export function isPageThemeSnapshot(
  value: unknown,
): value is PageThemeSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.revision === 'number' &&
    Number.isSafeInteger(candidate.revision) &&
    candidate.revision >= 0 &&
    (candidate.status === 'starting' ||
      candidate.status === 'ready' ||
      candidate.status === 'error') &&
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.activeOnPage === 'boolean' &&
    (candidate.inactiveReason === null ||
      candidate.inactiveReason === 'global-disabled' ||
      candidate.inactiveReason === 'site-disabled' ||
      candidate.inactiveReason === 'automation' ||
      candidate.inactiveReason === 'native-dark') &&
    typeof candidate.currentHost === 'string' &&
    (candidate.engine === 'dynamicTheme' || candidate.engine === 'cssFilter') &&
    typeof candidate.darkThemeDetected === 'boolean' &&
    (candidate.error === undefined || typeof candidate.error === 'string')
  );
}

export function normalizePageThemeSettings(
  settings: PageThemeSettings,
): PageThemeSettings {
  const enabledFor = uniqueHosts(settings.enabledFor);
  const disabledFor = uniqueHosts(settings.disabledFor).filter(
    (host) => !enabledFor.includes(host),
  );
  return {
    ...settings,
    enabledFor,
    disabledFor,
    siteOverrides: Object.fromEntries(
      Object.entries(settings.siteOverrides)
        .map(([host, override]) => [pageThemeHost(`https://${host}`), override])
        .filter(([host]) => Boolean(host)),
    ),
  };
}

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function localTimeOn(date: Date, value: string, dayOffset: number) {
  const [hours, minutes] = value.split(':').map(Number);
  const result = new Date(date);
  result.setDate(result.getDate() + dayOffset);
  result.setHours(hours, minutes, 0, 0);
  return result.getTime();
}

export function nextPageThemeAutomationChange(
  settings: PageThemeSettings,
  now = new Date(),
) {
  if (
    settings.automation.mode !== 'time' ||
    settings.time.activation === settings.time.deactivation
  ) {
    return null;
  }
  const current = now.getTime();
  return Math.min(
    ...[settings.time.activation, settings.time.deactivation]
      .flatMap((value) =>
        [0, 1].map((dayOffset) => localTimeOn(now, value, dayOffset)),
      )
      .filter((timestamp) => timestamp > current),
  );
}

function timeAutomationActive(settings: PageThemeSettings, now: Date): boolean {
  const current = now.getHours() * 60 + now.getMinutes();
  const activation = timeMinutes(settings.time.activation);
  const deactivation = timeMinutes(settings.time.deactivation);
  if (activation === deactivation) return true;
  return activation < deactivation
    ? current >= activation && current < deactivation
    : current >= activation || current < deactivation;
}

export function resolvePageTheme(
  settings: PageThemeSettings,
  url: string,
  systemDark: boolean,
  now = new Date(),
) {
  const host = pageThemeHost(url);
  const listed = settings.enabledFor.includes(host)
    ? true
    : settings.disabledFor.includes(host)
      ? false
      : settings.enabledByDefault;
  const automated =
    settings.automation.mode === 'system'
      ? systemDark
      : settings.automation.mode === 'time'
        ? timeAutomationActive(settings, now)
        : true;
  const activeOnPage =
    settings.enabled &&
    listed &&
    (settings.automation.behavior === 'scheme' || automated);
  const inactiveReason: PageThemeInactiveReason = !settings.enabled
    ? 'global-disabled'
    : !listed
      ? 'site-disabled'
      : settings.automation.behavior !== 'scheme' && !automated
        ? 'automation'
        : null;
  const mode =
    settings.automation.behavior === 'scheme' &&
    settings.automation.mode !== 'none'
      ? automated
        ? 1
        : 0
      : settings.theme.mode;
  return {
    activeOnPage,
    inactiveReason,
    host,
    theme: {
      ...settings.theme,
      ...settings.siteOverrides[host],
      mode,
    },
  };
}

export function togglePageThemeHost(
  settings: PageThemeSettings,
  url: string,
): PageThemeSettings {
  const host = pageThemeHost(url);
  if (!host) return settings;
  const enabledFor = settings.enabledFor.filter((entry) => entry !== host);
  const disabledFor = settings.disabledFor.filter((entry) => entry !== host);
  const currentlyEnabled = settings.enabledFor.includes(host)
    ? true
    : settings.disabledFor.includes(host)
      ? false
      : settings.enabledByDefault;
  if (currentlyEnabled) disabledFor.push(host);
  else enabledFor.push(host);
  return normalizePageThemeSettings({
    ...settings,
    enabledFor,
    disabledFor,
  });
}
