export type UserscriptRunAt =
  | 'document-start'
  | 'document-body'
  | 'document-end'
  | 'document-idle';

export type UserscriptSandbox = 'raw' | 'JavaScript' | 'DOM';

export type MetadataDiagnostic = {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  line?: number;
};

export type UserscriptMetadataEntry = {
  key: string;
  normalizedKey: string;
  value: string;
  line: number;
};

export type LocalizedUserscriptMetadata = {
  name?: string;
  description?: string;
};

export type UserscriptMetadata = {
  name: string;
  namespace: string;
  version: string;
  description: string;
  author: string;
  contributors: string[];
  copyright: string;
  license: string;
  icon?: string;
  icon64?: string;
  homepageUrl?: string;
  supportUrl?: string;
  downloadUrl?: string;
  updateUrl?: string;
  matches: string[];
  includes: string[];
  excludeMatches: string[];
  excludes: string[];
  grants: string[];
  requires: string[];
  resources: Record<string, string>;
  connects: string[];
  antifeatures: string[];
  compatible: string[];
  incompatible: string[];
  tags: string[];
  runAt: UserscriptRunAt;
  sandbox?: UserscriptSandbox;
  noframes: boolean;
  localized: Readonly<Record<string, LocalizedUserscriptMetadata>>;
  entries: readonly UserscriptMetadataEntry[];
  unknown: readonly UserscriptMetadataEntry[];
  raw: Readonly<Record<string, readonly string[]>>;
};

export type UserscriptSource = {
  code: string;
  origin?: string;
  installedAt: number;
  updatedAt: number;
};

export const USERSCRIPT_COVER_IMAGE_DATA_URL_PREFIX = 'data:image/webp;base64,';
export const MAX_USERSCRIPT_COVER_IMAGE_DATA_URL_LENGTH = 2 * 1024 * 1024;
export const MAX_USERSCRIPT_COVER_VIDEO_DATA_URL_LENGTH = 28 * 1024 * 1024;

function isBase64Payload(value: string) {
  return (
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

export function isUserscriptCoverImageDataUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value.startsWith(USERSCRIPT_COVER_IMAGE_DATA_URL_PREFIX) ||
    value.length > MAX_USERSCRIPT_COVER_IMAGE_DATA_URL_LENGTH
  ) {
    return false;
  }
  const encoded = value.slice(USERSCRIPT_COVER_IMAGE_DATA_URL_PREFIX.length);
  return isBase64Payload(encoded);
}

export function isUserscriptCoverVideoDataUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > MAX_USERSCRIPT_COVER_VIDEO_DATA_URL_LENGTH
  ) {
    return false;
  }
  const prefix = /^data:video\/[a-z0-9.+-]+;base64,/i.exec(value)?.[0];
  return Boolean(prefix && isBase64Payload(value.slice(prefix.length)));
}

export type UserscriptPresentationMedia =
  | {
      kind: 'video';
      video: string;
      poster?: string;
    }
  | {
      kind: 'image';
      image: string;
    };

export type UserscriptPresentation = {
  accent: string;
  media: UserscriptPresentationMedia;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

export function isUserscriptPresentationMedia(
  value: unknown,
): value is UserscriptPresentationMedia {
  if (!record(value)) return false;
  if (value.kind === 'video') {
    const hasPoster = Object.hasOwn(value, 'poster');
    return (
      exactKeys(
        value,
        hasPoster ? ['kind', 'video', 'poster'] : ['kind', 'video'],
      ) &&
      typeof value.video === 'string' &&
      value.video.length > 0 &&
      (!value.video.startsWith('data:') ||
        isUserscriptCoverVideoDataUrl(value.video)) &&
      (!hasPoster || isUserscriptCoverImageDataUrl(value.poster))
    );
  }
  return (
    value.kind === 'image' &&
    exactKeys(value, ['kind', 'image']) &&
    typeof value.image === 'string' &&
    (isUserscriptCoverImageDataUrl(value.image) ||
      /^userscript-deck\/card-art\/[\w./-]+\.webp$/.test(value.image))
  );
}

export function isUserscriptPresentation(
  value: unknown,
): value is UserscriptPresentation {
  if (
    !record(value) ||
    !exactKeys(value, ['accent', 'media']) ||
    typeof value.accent !== 'string' ||
    !/^#[\da-f]{6}$/i.test(value.accent) ||
    !record(value.media)
  ) {
    return false;
  }
  return isUserscriptPresentationMedia(value.media);
}

export type UserscriptManagerConfig = {
  enabled: boolean;
  checkForUpdates: boolean;
  userMatches: string[];
  userIncludes: string[];
  userExcludeMatches: string[];
  userExcludes: string[];
};

export type RuntimeMenuCommand = {
  id: string;
  title: string;
  description?: string;
  autoClose: boolean;
  order: number;
};

export type UserscriptRuntimeStatus =
  | 'idle'
  | 'sleeping'
  | 'not-matched'
  | 'running'
  | 'ready'
  | 'error';

export type UserscriptRuntimeState = {
  tabId: number;
  frameId: number;
  instanceId: string | null;
  status: UserscriptRuntimeStatus;
  commands: RuntimeMenuCommand[];
  error?: string;
  pendingRefresh: boolean;
};

export type InstalledUserscript = {
  kind: 'userscript';
  id: string;
  source: UserscriptSource;
  presentation?: UserscriptPresentation;
  metadata: UserscriptMetadata;
  manager: UserscriptManagerConfig;
  runtime: UserscriptRuntimeState;
};

export type ScriptMatchContext = {
  url: string;
  frameId: number;
  topFrame: boolean;
  softNavigation?: boolean;
};

export function scriptVersion(card: InstalledUserscript) {
  return card.metadata.version || '0.0.0';
}

export function restoreInstalledScriptOrder(
  current: InstalledUserscript[],
  orderedIds: readonly string[],
) {
  const byId = new Map(current.map((item) => [item.id, item]));
  const restored = orderedIds.flatMap((id) => {
    const item = byId.get(id);
    if (!item) return [];
    byId.delete(id);
    return [item];
  });
  const next = [...restored, ...byId.values()];
  return next.length === current.length &&
    next.every((item, index) => item === current[index])
    ? current
    : next;
}

export function reorderInstalledScriptSubset(
  current: InstalledUserscript[],
  subsetIds: readonly string[],
  movingId: string,
  targetIndex: number,
) {
  const subset = new Set(subsetIds);
  const visible = current.filter((item) => subset.has(item.id));
  const currentIndex = visible.findIndex((item) => item.id === movingId);
  if (currentIndex < 0 || visible.length < 2) return current;
  const boundedTarget = Math.max(0, Math.min(visible.length - 1, targetIndex));
  if (currentIndex === boundedTarget) return current;
  const reordered = [...visible];
  const [moving] = reordered.splice(currentIndex, 1);
  reordered.splice(boundedTarget, 0, moving);
  let cursor = 0;
  return current.map((item) =>
    subset.has(item.id) ? reordered[cursor++] : item,
  );
}
