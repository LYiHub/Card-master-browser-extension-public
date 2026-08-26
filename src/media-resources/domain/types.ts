import { resolveSiteScope } from '../../lib/site-scope';

export const MEDIA_RESOURCES_CARD_ID = 'system-media-resources' as const;
export const MEDIA_RESOURCES_SETTINGS_STORAGE_KEY =
  'media-resources.settings.v1';
export const MEDIA_RESOURCES_SESSION_STORAGE_KEY = 'media-resources.session.v1';
export const MEDIA_RESOURCES_MAX_ITEMS = 120;
export const MEDIA_RESOURCES_MAX_PAGES = 64;
export const MEDIA_RESOURCE_MAX_HEADERS = 96;

export type MediaResourceKind =
  | 'hls'
  | 'dash'
  | 'video'
  | 'audio'
  | 'image'
  | 'subtitle'
  | 'media';

export type MediaResourceHeader = {
  name: string;
  value: string;
};

export type MediaResource = {
  id: string;
  tabId: number;
  url: string;
  kind: MediaResourceKind;
  fileName: string;
  mimeType: string;
  size: number | null;
  initiator: string;
  frameId: number;
  discoveredAt: number;
  requestHeaders: MediaResourceHeader[];
  responseHeaders: MediaResourceHeader[];
};

export type MediaResourcesPage = {
  tabId: number;
  title: string;
  url: string;
  resources: MediaResource[];
};

export type MediaResourcesSettings = {
  version: 1;
  revision: number;
  enabled: boolean;
  showPageTrigger: boolean;
  showResourceCountBadge: boolean;
};

export type MediaResourcesSnapshot = {
  revision: number;
  status: 'starting' | 'ready' | 'error';
  enabled: boolean;
  showPageTrigger: boolean;
  showResourceCountBadge: boolean;
  available: boolean;
  downloadAvailable: boolean;
  requestHeadersAvailable: boolean;
  captureAvailable: boolean;
  captureEnabled: boolean;
  activeOnPage: boolean;
  currentHost: string;
  resources: MediaResource[];
  pages: MediaResourcesPage[];
  unavailableReason?: string;
  limitation?: string;
  error?: string;
};

export type MediaManifestVariant = {
  url: string;
  name: string;
  bandwidth: number | null;
  resolution: string;
  codecs: string;
};

export type MediaManifestInspection = {
  resourceId: string;
  format: 'hls' | 'dash';
  live: boolean;
  encrypted: boolean;
  drmSystems: string[];
  segmentCount: number;
  duration: number | null;
  variants: MediaManifestVariant[];
  audioTracks: string[];
  preview: string;
};

export type MediaResourcesCard = {
  kind: 'media-resources';
  id: typeof MEDIA_RESOURCES_CARD_ID;
  title: string;
  description: string;
  snapshot: MediaResourcesSnapshot;
};

export type MediaResourcesSnapshotListener = (
  snapshot: MediaResourcesSnapshot,
) => void;

export interface MediaResourcesController {
  read(): Promise<MediaResourcesSnapshot>;
  subscribe(listener: MediaResourcesSnapshotListener): () => void;
  setEnabled(enabled: boolean): Promise<MediaResourcesSnapshot>;
  openSettings(): Promise<void>;
  setPresentationSettings(settings: {
    showPageTrigger: boolean;
    showResourceCountBadge: boolean;
  }): Promise<MediaResourcesSnapshot>;
  setCaptureEnabled(enabled: boolean): Promise<MediaResourcesSnapshot>;
  clear(tabId?: number): Promise<MediaResourcesSnapshot>;
  download(resourceId: string, tabId: number): Promise<void>;
  inspect(resourceId: string, tabId: number): Promise<MediaManifestInspection>;
  sendToAria2(resourceId: string, tabId: number): Promise<void>;
  dispose(): void;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function safeText(value: unknown, limit: number) {
  return typeof value === 'string' && value.length <= limit;
}

export function mediaResourcesHost(url: string) {
  return resolveSiteScope(url)?.host ?? '';
}

export function defaultMediaResourcesSettings(): MediaResourcesSettings {
  return {
    version: 1,
    revision: 0,
    enabled: false,
    showPageTrigger: true,
    showResourceCountBadge: true,
  };
}

export function isMediaResourcesSettings(
  value: unknown,
): value is MediaResourcesSettings {
  return (
    record(value) &&
    value.version === 1 &&
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    typeof value.enabled === 'boolean' &&
    typeof value.showPageTrigger === 'boolean' &&
    typeof value.showResourceCountBadge === 'boolean'
  );
}

export function isMediaResourceKind(
  value: unknown,
): value is MediaResourceKind {
  return (
    value === 'hls' ||
    value === 'dash' ||
    value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'subtitle' ||
    value === 'media'
  );
}

export function isMediaResource(value: unknown): value is MediaResource {
  return (
    record(value) &&
    safeText(value.id, 256) &&
    typeof value.tabId === 'number' &&
    Number.isSafeInteger(value.tabId) &&
    value.tabId >= 0 &&
    safeText(value.url, 8_192) &&
    isMediaResourceKind(value.kind) &&
    safeText(value.fileName, 512) &&
    safeText(value.mimeType, 256) &&
    (value.size === null ||
      (typeof value.size === 'number' &&
        Number.isSafeInteger(value.size) &&
        value.size >= 0)) &&
    safeText(value.initiator, 8_192) &&
    typeof value.frameId === 'number' &&
    Number.isSafeInteger(value.frameId) &&
    typeof value.discoveredAt === 'number' &&
    Number.isFinite(value.discoveredAt) &&
    isMediaResourceHeaders(value.requestHeaders) &&
    isMediaResourceHeaders(value.responseHeaders)
  );
}

function isMediaResourceHeaders(
  value: unknown,
): value is MediaResourceHeader[] {
  return (
    Array.isArray(value) &&
    value.length <= MEDIA_RESOURCE_MAX_HEADERS &&
    value.every(
      (header) =>
        record(header) &&
        safeText(header.name, 256) &&
        safeText(header.value, 8_192),
    )
  );
}

export function isMediaResourcesPage(
  value: unknown,
): value is MediaResourcesPage {
  return (
    record(value) &&
    typeof value.tabId === 'number' &&
    Number.isSafeInteger(value.tabId) &&
    value.tabId >= 0 &&
    safeText(value.title, 1_024) &&
    safeText(value.url, 8_192) &&
    Array.isArray(value.resources) &&
    value.resources.length <= MEDIA_RESOURCES_MAX_ITEMS &&
    value.resources.every(isMediaResource)
  );
}

export function isMediaResourcesSnapshot(
  value: unknown,
): value is MediaResourcesSnapshot {
  return (
    record(value) &&
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    (value.status === 'starting' ||
      value.status === 'ready' ||
      value.status === 'error') &&
    typeof value.enabled === 'boolean' &&
    typeof value.showPageTrigger === 'boolean' &&
    typeof value.showResourceCountBadge === 'boolean' &&
    typeof value.available === 'boolean' &&
    typeof value.downloadAvailable === 'boolean' &&
    typeof value.requestHeadersAvailable === 'boolean' &&
    typeof value.captureAvailable === 'boolean' &&
    typeof value.captureEnabled === 'boolean' &&
    typeof value.activeOnPage === 'boolean' &&
    safeText(value.currentHost, 512) &&
    Array.isArray(value.resources) &&
    value.resources.length <= MEDIA_RESOURCES_MAX_ITEMS &&
    value.resources.every(isMediaResource) &&
    Array.isArray(value.pages) &&
    value.pages.length <= MEDIA_RESOURCES_MAX_PAGES &&
    value.pages.every(isMediaResourcesPage) &&
    (value.unavailableReason === undefined ||
      safeText(value.unavailableReason, 2_048)) &&
    (value.limitation === undefined || safeText(value.limitation, 2_048)) &&
    (value.error === undefined || safeText(value.error, 4_096))
  );
}

export function isMediaManifestInspection(
  value: unknown,
): value is MediaManifestInspection {
  return (
    record(value) &&
    safeText(value.resourceId, 256) &&
    (value.format === 'hls' || value.format === 'dash') &&
    typeof value.live === 'boolean' &&
    typeof value.encrypted === 'boolean' &&
    Array.isArray(value.drmSystems) &&
    value.drmSystems.length <= 16 &&
    value.drmSystems.every((entry) => safeText(entry, 128)) &&
    typeof value.segmentCount === 'number' &&
    Number.isSafeInteger(value.segmentCount) &&
    value.segmentCount >= 0 &&
    (value.duration === null ||
      (typeof value.duration === 'number' &&
        Number.isFinite(value.duration) &&
        value.duration >= 0)) &&
    Array.isArray(value.variants) &&
    value.variants.length <= 200 &&
    value.variants.every(
      (entry) =>
        record(entry) &&
        safeText(entry.url, 8_192) &&
        safeText(entry.name, 512) &&
        (entry.bandwidth === null ||
          (typeof entry.bandwidth === 'number' &&
            Number.isFinite(entry.bandwidth) &&
            entry.bandwidth >= 0)) &&
        safeText(entry.resolution, 128) &&
        safeText(entry.codecs, 512),
    ) &&
    Array.isArray(value.audioTracks) &&
    value.audioTracks.length <= 200 &&
    value.audioTracks.every((entry) => safeText(entry, 512)) &&
    safeText(value.preview, 8_192)
  );
}

export function startingMediaResourcesSnapshot(
  url = '',
): MediaResourcesSnapshot {
  return {
    revision: 0,
    status: 'starting',
    enabled: false,
    showPageTrigger: true,
    showResourceCountBadge: true,
    available: true,
    downloadAvailable: true,
    requestHeadersAvailable: false,
    captureAvailable: true,
    captureEnabled: false,
    activeOnPage: false,
    currentHost: mediaResourcesHost(url),
    resources: [],
    pages: [],
  };
}
