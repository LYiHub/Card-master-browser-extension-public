import {
  defaultPageThemeSettings,
  normalizePageThemeSettings,
  type PageThemeEngine,
  type PageThemeSettings,
  type PageThemeTheme,
  pageThemeHost,
} from './types';

type JsonRecord = Record<string, unknown>;

export type DarkReaderMigrationResult = {
  settings: PageThemeSettings;
  importedSiteOverrides: number;
  skippedSitePatterns: number;
};

export type DarkReaderSettingsExport = {
  schemeVersion: 2;
  enabled: boolean;
  fetchNews: false;
  theme: PageThemeTheme;
  presets: [];
  customThemes: Array<{
    url: string[];
    theme: PageThemeTheme;
  }>;
  enabledByDefault: boolean;
  enabledFor: string[];
  disabledFor: string[];
  changeBrowserTheme: false;
  syncSettings: false;
  syncSitesFixes: false;
  automation: {
    enabled: boolean;
    mode: '' | 'system' | 'time';
    behavior: 'OnOff' | 'Scheme';
  };
  time: {
    activation: string;
    deactivation: string;
  };
  location: {
    latitude: null;
    longitude: null;
  };
  previewNewDesign: false;
  previewNewestDesign: false;
  enableForPDF: false;
  enableForProtectedPages: false;
  enableContextMenus: false;
  detectDarkTheme: boolean;
};

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function numberValue(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function darkReaderEngine(
  value: unknown,
  fallback: PageThemeEngine,
): PageThemeEngine {
  if (value === 'dynamicTheme') return 'dynamicTheme';
  if (
    value === 'cssFilter' ||
    value === 'svgFilter' ||
    value === 'staticTheme'
  ) {
    return 'cssFilter';
  }
  return fallback;
}

function importTheme(value: unknown, fallback: PageThemeTheme): PageThemeTheme {
  const candidate = record(value);
  if (!candidate) throw new Error('Dark Reader 配置缺少有效的主题设置。');
  return {
    mode:
      candidate.mode === 0 || candidate.mode === 1
        ? candidate.mode
        : fallback.mode,
    brightness: numberValue(candidate.brightness, fallback.brightness, 5, 200),
    contrast: numberValue(candidate.contrast, fallback.contrast, 5, 200),
    grayscale: numberValue(candidate.grayscale, fallback.grayscale, 0, 100),
    sepia: numberValue(candidate.sepia, fallback.sepia, 0, 100),
    useFont: booleanValue(candidate.useFont, fallback.useFont),
    fontFamily: stringValue(candidate.fontFamily, fallback.fontFamily),
    textStroke: numberValue(candidate.textStroke, fallback.textStroke, 0, 2),
    engine: darkReaderEngine(candidate.engine, fallback.engine),
    stylesheet: stringValue(candidate.stylesheet, fallback.stylesheet),
    darkSchemeBackgroundColor: stringValue(
      candidate.darkSchemeBackgroundColor,
      fallback.darkSchemeBackgroundColor,
    ),
    darkSchemeTextColor: stringValue(
      candidate.darkSchemeTextColor,
      fallback.darkSchemeTextColor,
    ),
    lightSchemeBackgroundColor: stringValue(
      candidate.lightSchemeBackgroundColor,
      fallback.lightSchemeBackgroundColor,
    ),
    lightSchemeTextColor: stringValue(
      candidate.lightSchemeTextColor,
      fallback.lightSchemeTextColor,
    ),
    scrollbarColor: stringValue(
      candidate.scrollbarColor,
      fallback.scrollbarColor,
    ),
    selectionColor: stringValue(
      candidate.selectionColor,
      fallback.selectionColor,
    ),
    styleSystemControls: booleanValue(
      candidate.styleSystemControls,
      fallback.styleSystemControls,
    ),
    lightColorScheme: stringValue(
      candidate.lightColorScheme,
      fallback.lightColorScheme,
    ),
    darkColorScheme: stringValue(
      candidate.darkColorScheme,
      fallback.darkColorScheme,
    ),
    immediateModify: booleanValue(
      candidate.immediateModify,
      fallback.immediateModify,
    ),
  };
}

function exactHost(pattern: string) {
  const value = pattern.trim();
  if (!value || /[*^$\\[\](){}|?]/.test(value)) return null;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    if (value.includes('/')) return null;
    return pageThemeHost(`https://${value}`);
  }
  try {
    const url = new URL(value);
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return pageThemeHost(url.href);
  } catch {
    return null;
  }
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function importHosts(values: readonly string[]) {
  const hosts: string[] = [];
  let skipped = 0;
  for (const value of values) {
    const host = exactHost(value);
    if (host) hosts.push(host);
    else skipped += 1;
  }
  return { hosts, skipped };
}

function normalizedTime(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function importDarkReaderSettings(
  value: unknown,
  revision: number,
): DarkReaderMigrationResult {
  const candidate = record(value);
  if (
    !candidate ||
    typeof candidate.schemeVersion !== 'number' ||
    !record(candidate.theme)
  ) {
    throw new Error('导入文件不是有效的 Dark Reader 设置。');
  }

  const defaults = defaultPageThemeSettings();
  const enabledFor = importHosts(stringArray(candidate.enabledFor));
  const disabledFor = importHosts(stringArray(candidate.disabledFor));
  const automation = record(candidate.automation);
  const automationEnabled =
    automation?.enabled !== false && automation?.enable !== false;
  const automationMode =
    automationEnabled &&
    (automation?.mode === 'system' || automation?.mode === 'time')
      ? automation.mode
      : 'none';
  const time = record(candidate.time);
  const siteOverrides: Record<string, Partial<PageThemeTheme>> = {};
  let skippedSitePatterns = enabledFor.skipped + disabledFor.skipped;

  const siteThemes = [
    ...(Array.isArray(candidate.presets) ? candidate.presets : []),
    ...(Array.isArray(candidate.customThemes) ? candidate.customThemes : []),
  ];
  for (const entry of siteThemes) {
    const siteTheme = record(entry);
    const theme = siteTheme && importTheme(siteTheme.theme, defaults.theme);
    if (!siteTheme || !theme) continue;
    const patterns = [
      ...stringArray(siteTheme.urls),
      ...stringArray(siteTheme.url),
    ];
    for (const pattern of patterns) {
      const host = exactHost(pattern);
      if (host) siteOverrides[host] = theme;
      else skippedSitePatterns += 1;
    }
  }

  const settings = normalizePageThemeSettings({
    ...defaults,
    revision,
    enabled: booleanValue(candidate.enabled, defaults.enabled),
    theme: importTheme(candidate.theme, defaults.theme),
    enabledByDefault: booleanValue(
      candidate.enabledByDefault,
      defaults.enabledByDefault,
    ),
    enabledFor: enabledFor.hosts,
    disabledFor: disabledFor.hosts,
    detectDarkTheme: booleanValue(
      candidate.detectDarkTheme,
      defaults.detectDarkTheme,
    ),
    automation: {
      mode: automationMode,
      behavior: automation?.behavior === 'Scheme' ? 'scheme' : 'on-off',
    },
    time: {
      activation: normalizedTime(time?.activation, defaults.time.activation),
      deactivation: normalizedTime(
        time?.deactivation,
        defaults.time.deactivation,
      ),
    },
    siteOverrides,
  });
  return {
    settings,
    importedSiteOverrides: Object.keys(settings.siteOverrides).length,
    skippedSitePatterns,
  };
}

export function exportDarkReaderSettings(
  settings: PageThemeSettings,
): DarkReaderSettingsExport {
  return {
    schemeVersion: 2,
    enabled: settings.enabled,
    fetchNews: false,
    theme: { ...settings.theme },
    presets: [],
    customThemes: Object.entries(settings.siteOverrides).map(
      ([host, override]) => ({
        url: [host],
        theme: { ...settings.theme, ...override },
      }),
    ),
    enabledByDefault: settings.enabledByDefault,
    enabledFor: [...settings.enabledFor],
    disabledFor: [...settings.disabledFor],
    changeBrowserTheme: false,
    syncSettings: false,
    syncSitesFixes: false,
    automation: {
      enabled: settings.automation.mode !== 'none',
      mode: settings.automation.mode === 'none' ? '' : settings.automation.mode,
      behavior: settings.automation.behavior === 'scheme' ? 'Scheme' : 'OnOff',
    },
    time: { ...settings.time },
    location: {
      latitude: null,
      longitude: null,
    },
    previewNewDesign: false,
    previewNewestDesign: false,
    enableForPDF: false,
    enableForProtectedPages: false,
    enableContextMenus: false,
    detectDarkTheme: settings.detectDarkTheme,
  };
}
