export const BILIBILI_CAPABILITY_STORAGE_KEY =
  'bilibili-capabilities.settings.v1';

export const BILIBILI_CAPABILITY_IDS = [
  'recommendation-control',
  'danmaku-compression',
  'segment-skipping',
] as const;

export type BilibiliCapabilityId = (typeof BILIBILI_CAPABILITY_IDS)[number];
export type BilibiliRecommendationMode =
  | 'pure'
  | 'explore'
  | 'mixed'
  | 'native';
export type BilibiliSegmentPolicy = 'disabled' | 'overlay' | 'manual' | 'auto';
export type SponsorPlatform = 'bilibili' | 'youtube';

export type BilibiliRecommendationSettings = {
  mode: BilibiliRecommendationMode;
};

export type BilibiliDanmakuSettings = {
  threshold: number;
  maxDistance: number;
  maxCosine: number;
  trimPinyin: boolean;
  trimEnding: boolean;
  trimSpace: boolean;
  trimWidth: boolean;
  crossMode: boolean;
  mark: 'prefix' | 'suffix' | 'off';
  markThreshold: number;
  subscript: boolean;
  enlarge: boolean;
  shrinkThreshold: number;
  dropThreshold: number;
  tooltip: boolean;
  autoDisableDanmaku: boolean;
  autoOpenList: boolean;
  workerCount: number;
};

export type BilibiliSegmentSkippingSettings = {
  sponsor: BilibiliSegmentPolicy;
  selfPromotion: BilibiliSegmentPolicy;
  interaction: BilibiliSegmentPolicy;
  intro: BilibiliSegmentPolicy;
  outro: BilibiliSegmentPolicy;
  preview: BilibiliSegmentPolicy;
  filler: BilibiliSegmentPolicy;
  musicOfftopic: BilibiliSegmentPolicy;
  audioNotification: boolean;
  showNotice: boolean;
  showTimeWithSkips: boolean;
  skipOnSeek: boolean;
  dynamicSponsorBlock: boolean;
  commentSponsorBlock: boolean;
};

export type BilibiliCapabilitySettingsMap = {
  'recommendation-control': BilibiliRecommendationSettings;
  'danmaku-compression': BilibiliDanmakuSettings;
  'segment-skipping': BilibiliSegmentSkippingSettings;
};

export type BilibiliCapabilitySettings<
  Id extends BilibiliCapabilityId = BilibiliCapabilityId,
> = {
  [Key in Id]: {
    id: Key;
    settings: BilibiliCapabilitySettingsMap[Key];
  };
}[Id];

export type BilibiliCapabilityState<
  Id extends BilibiliCapabilityId = BilibiliCapabilityId,
> = BilibiliCapabilitySettings<Id> & {
  enabled: boolean;
};

export type BilibiliCapabilitiesState = {
  version: 1;
  revision: number;
  capabilities: {
    [Id in BilibiliCapabilityId]: BilibiliCapabilityState<Id>;
  };
};

export type BilibiliCapabilitySnapshot = {
  id: BilibiliCapabilityId;
  revision: number;
  status: 'starting' | 'ready' | 'error';
  available: boolean;
  unavailableReason?: string;
  enabled: boolean;
  activeOnPage: boolean;
  currentHost: string;
  temporaryMode: 'default' | 'original-danmaku';
  stateLabel: string;
  metrics: readonly { label: string; value: string }[];
  error?: string;
};

export type BilibiliCapabilityCard = {
  kind: 'bilibili-capability';
  id: `system-bilibili-${BilibiliCapabilityId}`;
  capabilityId: BilibiliCapabilityId;
  title: string;
  description: string;
  snapshot: BilibiliCapabilitySnapshot;
};

export type BilibiliCapabilitySnapshotListener = (
  snapshots: readonly BilibiliCapabilitySnapshot[],
) => void;

export type BilibiliCapabilityCommandMap = {
  'recommendation-control':
    | `mode:${BilibiliRecommendationMode}`
    | 'mixed-next'
    | 'reset-fingerprint';
  'danmaku-compression': 'reload' | 'restore';
  'segment-skipping': 'toggle-capture' | 'refresh-segments';
};

export type BilibiliCapabilityCommand<
  Id extends BilibiliCapabilityId = BilibiliCapabilityId,
> = BilibiliCapabilityCommandMap[Id];

export interface BilibiliCapabilityController {
  read(pageUrl?: string): Promise<readonly BilibiliCapabilitySnapshot[]>;
  readSettings<Id extends BilibiliCapabilityId>(
    id: Id,
  ): Promise<BilibiliCapabilitySettings<Id>>;
  subscribe(listener: BilibiliCapabilitySnapshotListener): () => void;
  setEnabled(
    id: BilibiliCapabilityId,
    enabled: boolean,
  ): Promise<readonly BilibiliCapabilitySnapshot[]>;
  saveSettings<Id extends BilibiliCapabilityId>(
    value: BilibiliCapabilitySettings<Id>,
  ): Promise<readonly BilibiliCapabilitySnapshot[]>;
  execute<Id extends BilibiliCapabilityId>(
    id: Id,
    command: BilibiliCapabilityCommand<Id>,
  ): Promise<readonly BilibiliCapabilitySnapshot[]>;
  dispose(): void;
}

export function isBilibiliPage(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com');
  } catch {
    return false;
  }
}

export function capabilityPlatformForPage(url: string): SponsorPlatform | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com')) {
      return 'bilibili';
    }
    if (
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtube-nocookie.com' ||
      hostname.endsWith('.youtube-nocookie.com')
    ) {
      return 'youtube';
    }
    return null;
  } catch {
    return null;
  }
}

export function capabilityHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function bilibiliVideoPage(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'www.bilibili.com') return false;
    return (
      /^\/video\/(?:BV[\da-z]+|av\d+)/i.test(parsed.pathname) ||
      /^\/bangumi\/play\/(?:ep|ss)\d+/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function sponsorPlatformForPage(url: string): SponsorPlatform | null {
  try {
    const parsed = new URL(url);
    if (bilibiliVideoPage(parsed.href)) return 'bilibili';
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'www.youtube-nocookie.com') {
      return /^\/embed\/[^/]+/.test(parsed.pathname) ? 'youtube' : null;
    }
    if (hostname !== 'youtube.com' && !hostname.endsWith('.youtube.com')) {
      return null;
    }
    if (parsed.pathname === '/watch') {
      return parsed.searchParams.has('v') ? 'youtube' : null;
    }
    return /^\/(?:embed|live|shorts)\/[^/]+/.test(parsed.pathname)
      ? 'youtube'
      : null;
  } catch {
    return null;
  }
}

export function bilibiliCapabilityAppliesToPage(
  id: BilibiliCapabilityId,
  url: string,
) {
  try {
    const parsed = new URL(url);
    if (id === 'recommendation-control') {
      return (
        parsed.hostname === 'www.bilibili.com' &&
        (parsed.pathname === '/' || parsed.pathname === '/index.html')
      );
    }
    if (id === 'segment-skipping') {
      return sponsorPlatformForPage(parsed.href) !== null;
    }
    return bilibiliVideoPage(parsed.href);
  } catch {
    return false;
  }
}

export function isBilibiliCapabilityId(
  value: unknown,
): value is BilibiliCapabilityId {
  return (
    typeof value === 'string' &&
    (BILIBILI_CAPABILITY_IDS as readonly string[]).includes(value)
  );
}

export function isBilibiliCapabilityCommand<Id extends BilibiliCapabilityId>(
  id: Id,
  value: unknown,
): value is BilibiliCapabilityCommand<Id> {
  if (typeof value !== 'string') return false;
  if (id === 'recommendation-control') {
    return (
      value === 'mode:pure' ||
      value === 'mode:explore' ||
      value === 'mode:mixed' ||
      value === 'mode:native' ||
      value === 'mixed-next' ||
      value === 'reset-fingerprint'
    );
  }
  if (id === 'danmaku-compression') {
    return value === 'reload' || value === 'restore';
  }
  return value === 'toggle-capture' || value === 'refresh-segments';
}

function numberInRange(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function recommendationSettings(
  value: unknown,
): value is BilibiliRecommendationSettings {
  return (
    record(value) &&
    (value.mode === 'pure' ||
      value.mode === 'explore' ||
      value.mode === 'mixed' ||
      value.mode === 'native')
  );
}

function danmakuSettings(value: unknown): value is BilibiliDanmakuSettings {
  return (
    record(value) &&
    numberInRange(value.threshold, -1, 180) &&
    numberInRange(value.maxDistance, 0, 100) &&
    numberInRange(value.maxCosine, 0, 1_000) &&
    typeof value.trimPinyin === 'boolean' &&
    typeof value.trimEnding === 'boolean' &&
    typeof value.trimSpace === 'boolean' &&
    typeof value.trimWidth === 'boolean' &&
    typeof value.crossMode === 'boolean' &&
    (value.mark === 'prefix' ||
      value.mark === 'suffix' ||
      value.mark === 'off') &&
    numberInRange(value.markThreshold, 1, 9_999) &&
    typeof value.subscript === 'boolean' &&
    typeof value.enlarge === 'boolean' &&
    numberInRange(value.shrinkThreshold, 0, 999) &&
    numberInRange(value.dropThreshold, 0, 999) &&
    typeof value.tooltip === 'boolean' &&
    typeof value.autoDisableDanmaku === 'boolean' &&
    typeof value.autoOpenList === 'boolean' &&
    numberInRange(value.workerCount, 0, 6)
  );
}

function segmentPolicy(value: unknown): value is BilibiliSegmentPolicy {
  return (
    value === 'disabled' ||
    value === 'overlay' ||
    value === 'manual' ||
    value === 'auto'
  );
}

function segmentSettings(
  value: unknown,
): value is BilibiliSegmentSkippingSettings {
  return (
    record(value) &&
    segmentPolicy(value.sponsor) &&
    segmentPolicy(value.selfPromotion) &&
    segmentPolicy(value.interaction) &&
    segmentPolicy(value.intro) &&
    segmentPolicy(value.outro) &&
    segmentPolicy(value.preview) &&
    segmentPolicy(value.filler) &&
    segmentPolicy(value.musicOfftopic) &&
    typeof value.audioNotification === 'boolean' &&
    typeof value.showNotice === 'boolean' &&
    typeof value.showTimeWithSkips === 'boolean' &&
    typeof value.skipOnSeek === 'boolean' &&
    typeof value.dynamicSponsorBlock === 'boolean' &&
    typeof value.commentSponsorBlock === 'boolean'
  );
}

export function isBilibiliCapabilitySettings(
  value: unknown,
): value is BilibiliCapabilitySettings {
  if (!record(value) || !isBilibiliCapabilityId(value.id)) {
    return false;
  }
  if (value.id === 'recommendation-control') {
    return recommendationSettings(value.settings);
  }
  if (value.id === 'danmaku-compression') {
    return danmakuSettings(value.settings);
  }
  return segmentSettings(value.settings);
}

function isBilibiliCapabilityState(
  value: unknown,
): value is BilibiliCapabilityState {
  return (
    isBilibiliCapabilitySettings(value) &&
    typeof (value as Record<string, unknown>).enabled === 'boolean'
  );
}

export function defaultBilibiliCapabilitiesState(): BilibiliCapabilitiesState {
  return {
    version: 1,
    revision: 0,
    capabilities: {
      'recommendation-control': {
        id: 'recommendation-control',
        enabled: true,
        settings: {
          mode: 'pure',
        },
      },
      'danmaku-compression': {
        id: 'danmaku-compression',
        enabled: true,
        settings: {
          threshold: 30,
          maxDistance: 5,
          maxCosine: 45,
          trimPinyin: true,
          trimEnding: true,
          trimSpace: true,
          trimWidth: true,
          crossMode: true,
          mark: 'prefix',
          markThreshold: 1,
          subscript: true,
          enlarge: true,
          shrinkThreshold: 0,
          dropThreshold: 0,
          tooltip: true,
          autoDisableDanmaku: false,
          autoOpenList: false,
          workerCount: 3,
        },
      },
      'segment-skipping': {
        id: 'segment-skipping',
        enabled: true,
        settings: {
          sponsor: 'auto',
          selfPromotion: 'manual',
          interaction: 'manual',
          intro: 'manual',
          outro: 'manual',
          preview: 'overlay',
          filler: 'manual',
          musicOfftopic: 'auto',
          audioNotification: false,
          showNotice: true,
          showTimeWithSkips: true,
          skipOnSeek: true,
          dynamicSponsorBlock: true,
          commentSponsorBlock: false,
        },
      },
    },
  };
}

export function normalizeBilibiliCapabilitiesState(
  value: unknown,
): BilibiliCapabilitiesState {
  const defaults = defaultBilibiliCapabilitiesState();
  if (!record(value) || value.version !== 1 || !record(value.capabilities)) {
    return defaults;
  }
  const capabilities = { ...defaults.capabilities };
  for (const id of BILIBILI_CAPABILITY_IDS) {
    const candidate = value.capabilities[id];
    if (isBilibiliCapabilityState(candidate) && candidate.id === id) {
      capabilities[id] = candidate as never;
    }
  }
  return {
    version: 1,
    revision:
      typeof value.revision === 'number' &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0
        ? value.revision
        : 0,
    capabilities,
  };
}
