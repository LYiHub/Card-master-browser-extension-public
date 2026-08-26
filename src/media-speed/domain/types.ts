import { resolveSiteScope } from '../../lib/site-scope';

export const MEDIA_SPEED_CARD_ID = 'system-media-speed' as const;
export const MEDIA_SPEED_STORAGE_KEY = 'media-speed.settings.v1';
export const MEDIA_SPEED_STANDARD_SPEEDS = [0.5, 1, 1.25, 1.5, 2, 4] as const;

export type MediaSpeedStandardSpeed = number;

export type MediaSpeedWheelItem =
  | {
      kind: 'speed';
      speed: MediaSpeedStandardSpeed;
    }
  | {
      kind: 'random';
    }
  | {
      kind: 'hell';
    };

export const DEFAULT_MEDIA_SPEED_WHEEL_ITEMS: readonly MediaSpeedWheelItem[] = [
  ...MEDIA_SPEED_STANDARD_SPEEDS.map(
    (speed) => ({ kind: 'speed', speed }) as const,
  ),
  { kind: 'random' } as const,
  { kind: 'hell' } as const,
];

export type MediaSpeedSelection =
  | {
      mode: 'standard';
      speed: MediaSpeedStandardSpeed;
    }
  | {
      mode: 'hell';
    };

export function mediaSpeedSelectionsEqual(
  current: MediaSpeedSelection,
  next: MediaSpeedSelection,
) {
  return current.mode === next.mode
    ? current.mode === 'hell' ||
        (next.mode === 'standard' && current.speed === next.speed)
    : false;
}

export type MediaSpeedSiteOverride = {
  enabled?: false;
  lockSpeed?: true;
  selection?: MediaSpeedSelection;
};

export type MediaSpeedSettings = {
  version: 1;
  revision: number;
  enabled: boolean;
  defaultSpeed: MediaSpeedStandardSpeed;
  includeAudio: boolean;
  showWheel: boolean;
  wheelItems: MediaSpeedWheelItem[];
  siteOverrides: Record<string, MediaSpeedSiteOverride>;
};

export type MediaSpeedSnapshot = {
  revision: number;
  status: 'starting' | 'ready' | 'error';
  enabled: boolean;
  activeOnPage: boolean;
  currentHost: string;
  lockSpeed: boolean;
  mediaCount: number;
  videoCount: number;
  audioCount: number;
  selection: MediaSpeedSelection;
  showWheel: boolean;
  wheelItems: MediaSpeedWheelItem[];
  error?: string;
};

export function mediaSpeedWheelVisible(snapshot: MediaSpeedSnapshot) {
  return (
    snapshot.status === 'ready' &&
    snapshot.enabled &&
    snapshot.activeOnPage &&
    snapshot.showWheel &&
    snapshot.mediaCount > 0
  );
}

export type MediaSpeedSettingsView = {
  settings: MediaSpeedSettings;
  snapshot: MediaSpeedSnapshot;
};

export type MediaSpeedCard = {
  kind: 'media-speed';
  id: typeof MEDIA_SPEED_CARD_ID;
  title: string;
  description: string;
  snapshot: MediaSpeedSnapshot;
};

export type MediaSpeedSnapshotListener = (snapshot: MediaSpeedSnapshot) => void;

export interface MediaSpeedController {
  read(): Promise<MediaSpeedSnapshot>;
  readSettings(): Promise<MediaSpeedSettingsView>;
  subscribe(listener: MediaSpeedSnapshotListener): () => void;
  setEnabled(enabled: boolean): Promise<MediaSpeedSnapshot>;
  setSelection(selection: MediaSpeedSelection): Promise<MediaSpeedSnapshot>;
  saveSettings(settings: MediaSpeedSettings): Promise<MediaSpeedSettingsView>;
  dispose(): void;
}

export function isMediaSpeedStandardSpeed(
  value: unknown,
): value is MediaSpeedStandardSpeed {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0.1 &&
    value <= 16
  );
}

export function isMediaSpeedWheelItem(
  value: unknown,
): value is MediaSpeedWheelItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === 'random' || candidate.kind === 'hell') {
    return Object.keys(candidate).every((key) => key === 'kind');
  }
  return (
    candidate.kind === 'speed' &&
    isMediaSpeedStandardSpeed(candidate.speed) &&
    Object.keys(candidate).every((key) => key === 'kind' || key === 'speed')
  );
}

export function isMediaSpeedSelection(
  value: unknown,
): value is MediaSpeedSelection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.mode === 'hell'
    ? Object.keys(candidate).every((key) => key === 'mode')
    : candidate.mode === 'standard' &&
        isMediaSpeedStandardSpeed(candidate.speed) &&
        Object.keys(candidate).every(
          (key) => key === 'mode' || key === 'speed',
        );
}

export function isMediaSpeedSiteOverride(
  value: unknown,
): value is MediaSpeedSiteOverride {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  return (
    keys.length > 0 &&
    keys.every(
      (key) => key === 'enabled' || key === 'lockSpeed' || key === 'selection',
    ) &&
    (candidate.enabled === undefined || candidate.enabled === false) &&
    (candidate.lockSpeed === undefined || candidate.lockSpeed === true) &&
    (candidate.selection === undefined ||
      isMediaSpeedSelection(candidate.selection))
  );
}

export function defaultMediaSpeedSettings(): MediaSpeedSettings {
  return {
    version: 1,
    revision: 0,
    enabled: true,
    defaultSpeed: 1,
    includeAudio: true,
    showWheel: true,
    wheelItems: DEFAULT_MEDIA_SPEED_WHEEL_ITEMS.map((item) => ({ ...item })),
    siteOverrides: {},
  };
}

export function mediaSpeedHost(url: string) {
  return resolveSiteScope(url)?.host ?? '';
}

function normalizedMediaSpeedHost(value: string) {
  return mediaSpeedHost(value.includes('://') ? value : `https://${value}`);
}

export function isMediaSpeedSettings(
  value: unknown,
): value is MediaSpeedSettings {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    typeof candidate.revision === 'number' &&
    Number.isSafeInteger(candidate.revision) &&
    candidate.revision >= 0 &&
    typeof candidate.enabled === 'boolean' &&
    isMediaSpeedStandardSpeed(candidate.defaultSpeed) &&
    typeof candidate.includeAudio === 'boolean' &&
    typeof candidate.showWheel === 'boolean' &&
    Array.isArray(candidate.wheelItems) &&
    candidate.wheelItems.length > 0 &&
    candidate.wheelItems.length <= 12 &&
    candidate.wheelItems.every(isMediaSpeedWheelItem) &&
    Boolean(
      candidate.siteOverrides &&
        typeof candidate.siteOverrides === 'object' &&
        !Array.isArray(candidate.siteOverrides),
    ) &&
    Object.entries(candidate.siteOverrides as Record<string, unknown>).every(
      ([host, override]) =>
        Boolean(normalizedMediaSpeedHost(host)) &&
        isMediaSpeedSiteOverride(override),
    )
  );
}

export function normalizeMediaSpeedSettings(
  value: MediaSpeedSettings,
): MediaSpeedSettings {
  const wheelItems: MediaSpeedWheelItem[] = [];
  const speeds = new Set<number>();
  let randomAdded = false;
  let hellAdded = false;
  for (const item of value.wheelItems) {
    if (wheelItems.length >= 12) break;
    if (item.kind === 'speed') {
      const speed = Math.round(item.speed * 100) / 100;
      if (speeds.has(speed)) continue;
      speeds.add(speed);
      wheelItems.push({ kind: 'speed', speed });
      continue;
    }
    if (item.kind === 'random') {
      if (randomAdded) continue;
      randomAdded = true;
      wheelItems.push({ kind: 'random' });
      continue;
    }
    if (hellAdded) continue;
    hellAdded = true;
    wheelItems.push({ kind: 'hell' });
  }
  const normalizedItems =
    wheelItems.length > 0
      ? wheelItems
      : DEFAULT_MEDIA_SPEED_WHEEL_ITEMS.map((item) => ({ ...item }));
  const numericItems = normalizedItems.filter(
    (item): item is Extract<MediaSpeedWheelItem, { kind: 'speed' }> =>
      item.kind === 'speed',
  );
  if (numericItems.length === 0) {
    normalizedItems.unshift({ kind: 'speed', speed: value.defaultSpeed });
  }
  const defaultSpeed = normalizedItems.some(
    (item) => item.kind === 'speed' && item.speed === value.defaultSpeed,
  )
    ? value.defaultSpeed
    : (numericItems[0]?.speed ?? value.defaultSpeed);
  const siteOverrides: Record<string, MediaSpeedSiteOverride> = {};
  for (const [rawHost, rawOverride] of Object.entries(value.siteOverrides)) {
    const host = normalizedMediaSpeedHost(rawHost);
    if (!host) continue;
    const selection = rawOverride.selection;
    const override: MediaSpeedSiteOverride = {
      ...(rawOverride.enabled === false ? { enabled: false as const } : {}),
      ...(rawOverride.lockSpeed === true ? { lockSpeed: true as const } : {}),
      ...(selection ? { selection } : {}),
    };
    if (Object.keys(override).length > 0) siteOverrides[host] = override;
  }
  return {
    version: 1,
    revision: Math.max(0, Math.trunc(value.revision)),
    enabled: value.enabled,
    defaultSpeed,
    includeAudio: value.includeAudio,
    showWheel: value.showWheel,
    wheelItems: normalizedItems,
    siteOverrides,
  };
}

export function mediaSpeedActiveOnPage(
  settings: MediaSpeedSettings,
  url: string,
) {
  const host = normalizedMediaSpeedHost(url);
  return (
    settings.enabled &&
    Boolean(host) &&
    settings.siteOverrides[host]?.enabled !== false
  );
}

export function mediaSpeedSelectionForSite(
  settings: MediaSpeedSettings,
  urlOrHost: string,
) {
  const host = normalizedMediaSpeedHost(urlOrHost);
  const selection = host ? settings.siteOverrides[host]?.selection : undefined;
  return selection ?? defaultMediaSpeedSelection(settings);
}

export function mediaSpeedSiteEnabled(
  settings: MediaSpeedSettings,
  urlOrHost: string,
) {
  const host = normalizedMediaSpeedHost(urlOrHost);
  return Boolean(host) && settings.siteOverrides[host]?.enabled !== false;
}

export function setMediaSpeedSiteEnabled(
  settings: MediaSpeedSettings,
  urlOrHost: string,
  enabled: boolean,
) {
  const host = normalizedMediaSpeedHost(urlOrHost);
  if (!host) throw new Error('媒体倍速无法确定当前站点。');
  const current = settings.siteOverrides[host] ?? {};
  const next: MediaSpeedSiteOverride = {
    ...current,
    ...(enabled ? {} : { enabled: false }),
  };
  if (enabled) delete next.enabled;
  const siteOverrides = { ...settings.siteOverrides };
  if (Object.keys(next).length > 0) siteOverrides[host] = next;
  else delete siteOverrides[host];
  return {
    ...settings,
    siteOverrides,
  };
}

export function mediaSpeedSiteLockEnabled(
  settings: MediaSpeedSettings,
  urlOrHost: string,
) {
  const host = normalizedMediaSpeedHost(urlOrHost);
  return Boolean(host) && settings.siteOverrides[host]?.lockSpeed === true;
}

export function setMediaSpeedSiteLock(
  settings: MediaSpeedSettings,
  urlOrHost: string,
  lockSpeed: boolean,
) {
  const host = normalizedMediaSpeedHost(urlOrHost);
  if (!host) throw new Error('媒体倍速无法确定当前站点。');
  const current = settings.siteOverrides[host] ?? {};
  const next: MediaSpeedSiteOverride = {
    ...current,
    ...(lockSpeed ? { lockSpeed: true } : {}),
  };
  if (!lockSpeed) delete next.lockSpeed;
  const siteOverrides = { ...settings.siteOverrides };
  if (Object.keys(next).length > 0) siteOverrides[host] = next;
  else delete siteOverrides[host];
  return {
    ...settings,
    siteOverrides,
  };
}

export function defaultMediaSpeedSelection(
  settings: MediaSpeedSettings,
): MediaSpeedSelection {
  return { mode: 'standard', speed: settings.defaultSpeed };
}

export function setMediaSpeedSiteSelection(
  settings: MediaSpeedSettings,
  urlOrHost: string,
  selection: MediaSpeedSelection,
) {
  const host = normalizedMediaSpeedHost(urlOrHost);
  if (!host) throw new Error('媒体倍速无法确定当前站点。');
  return {
    ...settings,
    siteOverrides: {
      ...settings.siteOverrides,
      [host]: {
        ...settings.siteOverrides[host],
        selection,
      },
    },
  };
}

export function startingMediaSpeedSnapshot(
  url = typeof location === 'undefined' ? '' : location.href,
): MediaSpeedSnapshot {
  const settings = defaultMediaSpeedSettings();
  return {
    revision: 0,
    status: 'starting',
    enabled: settings.enabled,
    activeOnPage: mediaSpeedActiveOnPage(settings, url),
    currentHost: mediaSpeedHost(url),
    lockSpeed: mediaSpeedSiteLockEnabled(settings, url),
    mediaCount: 0,
    videoCount: 0,
    audioCount: 0,
    selection: mediaSpeedSelectionForSite(settings, url),
    showWheel: settings.showWheel,
    wheelItems: settings.wheelItems,
  };
}

export function isMediaSpeedSnapshot(
  value: unknown,
): value is MediaSpeedSnapshot {
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
    typeof candidate.currentHost === 'string' &&
    typeof candidate.lockSpeed === 'boolean' &&
    typeof candidate.mediaCount === 'number' &&
    Number.isSafeInteger(candidate.mediaCount) &&
    candidate.mediaCount >= 0 &&
    typeof candidate.videoCount === 'number' &&
    Number.isSafeInteger(candidate.videoCount) &&
    candidate.videoCount >= 0 &&
    typeof candidate.audioCount === 'number' &&
    Number.isSafeInteger(candidate.audioCount) &&
    candidate.audioCount >= 0 &&
    candidate.mediaCount === candidate.videoCount + candidate.audioCount &&
    isMediaSpeedSelection(candidate.selection) &&
    typeof candidate.showWheel === 'boolean' &&
    Array.isArray(candidate.wheelItems) &&
    candidate.wheelItems.length > 0 &&
    candidate.wheelItems.length <= 12 &&
    candidate.wheelItems.every(isMediaSpeedWheelItem) &&
    (candidate.error === undefined || typeof candidate.error === 'string')
  );
}
