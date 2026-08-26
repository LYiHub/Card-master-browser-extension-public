import {
  defaultMediaResourcesSettings,
  isMediaResourcesSettings,
  MEDIA_RESOURCES_MAX_ITEMS,
  MEDIA_RESOURCES_MAX_PAGES,
  MEDIA_RESOURCES_SETTINGS_STORAGE_KEY,
  type MediaManifestInspection,
  type MediaResource,
  type MediaResourceHeader,
  type MediaResourceKind,
  type MediaResourcesPage,
  type MediaResourcesSettings,
  type MediaResourcesSnapshot,
  mediaResourcesHost,
} from '../../media-resources/domain/types';
import type { ExtensionBackgroundApi } from './api';
import { EXTENSION_CHANNEL } from './extension-channel';
import { extensionTarget } from './platform';

type CatCatchResource = Record<string, unknown>;
type CatCatchState = {
  enabled: boolean;
  captureEnabled: boolean;
  badgeNumber: boolean;
};
type CatCatchBridge = {
  readAll(): Record<string, CatCatchResource[]>;
  state(tabId: number): CatCatchState;
  setEnabled(enabled: boolean): CatCatchState;
  setCaptureEnabled(
    tabId: number,
    enabled: boolean,
    reload?: boolean,
  ): CatCatchState;
  clear(tabId: number): void;
  reset(): void;
};

declare global {
  var __cardMasterCatCatchBridge: CatCatchBridge | undefined;
  var __cardMasterCatCatchChanged: ((tabId?: number) => void) | undefined;
  var __cardMasterCatCatchReady: (() => void) | undefined;
}

type CapturedTab = {
  title: string;
  url: string;
  resources: MediaResource[];
};

const AUDIO_EXTENSIONS = new Set([
  'aac',
  'acc',
  'm4a',
  'mp3',
  'ogg',
  'opus',
  'wav',
  'weba',
  'wma',
]);
const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);
const SUBTITLE_EXTENSIONS = new Set(['srt', 'vtt']);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value: unknown, limit = 8_192) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

function finiteInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function resourceKind(resource: CatCatchResource): MediaResourceKind {
  const extension = text(resource.ext, 32).toLowerCase();
  const mime = text(resource.type, 256).toLowerCase();
  if (extension === 'm3u8' || extension === 'm3u') return 'hls';
  if (extension === 'mpd' || mime.includes('dash+xml')) return 'dash';
  if (AUDIO_EXTENSIONS.has(extension) || mime.startsWith('audio/')) {
    return 'audio';
  }
  if (IMAGE_EXTENSIONS.has(extension) || mime.startsWith('image/')) {
    return 'image';
  }
  if (SUBTITLE_EXTENSIONS.has(extension) || mime.includes('text/vtt')) {
    return 'subtitle';
  }
  if (mime.startsWith('video/')) return 'video';
  return 'media';
}

function requestHeaders(resource: CatCatchResource): MediaResourceHeader[] {
  const headers = record(resource.requestHeaders)
    ? Object.entries(resource.requestHeaders)
        .flatMap(([name, value]) =>
          typeof value === 'string'
            ? [{ name: name.slice(0, 256), value: value.slice(0, 8_192) }]
            : [],
        )
        .slice(0, 96)
    : [];
  const cookie = text(resource.cookie);
  if (cookie && headers.length < 96) {
    headers.push({ name: 'cookie', value: cookie });
  }
  return headers;
}

function resourceId(tabId: number, resource: CatCatchResource, index: number) {
  const requestId = text(resource.requestId, 192);
  if (requestId) return `cat-catch-${tabId}-${requestId}`;
  let hash = 2166136261;
  for (const character of `${tabId}:${text(resource.url)}:${index}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `cat-catch-${tabId}-${(hash >>> 0).toString(36)}`;
}

function fileName(resource: CatCatchResource, kind: MediaResourceKind) {
  const name = text(resource.name, 512);
  if (name) return name;
  const extension = text(resource.ext, 32);
  return extension ? `media.${extension}` : `${kind}-resource`;
}

function convertResource(
  tabId: number,
  resource: CatCatchResource,
  index: number,
): MediaResource {
  const kind = resourceKind(resource);
  return {
    id: resourceId(tabId, resource, index),
    tabId,
    url: text(resource.url),
    kind,
    fileName: fileName(resource, kind),
    mimeType: text(resource.type, 256),
    size: finiteInteger(resource.size),
    initiator: text(resource.initiator) || text(resource.webUrl),
    frameId: 0,
    discoveredAt:
      typeof resource.getTime === 'number' && Number.isFinite(resource.getTime)
        ? resource.getTime
        : Date.now(),
    requestHeaders: requestHeaders(resource),
    responseHeaders: [],
  };
}

function convertTab(tabId: number, resources: CatCatchResource[]): CapturedTab {
  const first = resources.find(record);
  return {
    title: text(first?.title, 1_024),
    url: text(first?.webUrl),
    resources: resources
      .filter(record)
      .slice(0, MEDIA_RESOURCES_MAX_ITEMS)
      .map((resource, index) => convertResource(tabId, resource, index)),
  };
}

export class ExtensionMediaResourcesService {
  private readonly tabs = new Map<number, CapturedTab>();
  private readonly listeners = new Set<
    (tabId: number, snapshot: MediaResourcesSnapshot) => void
  >();
  private settingsPromise: Promise<MediaResourcesSettings> | null = null;
  private revision = 0;

  constructor(private readonly api: ExtensionBackgroundApi) {
    globalThis.__cardMasterCatCatchChanged = () => {
      this.syncFromCatCatch();
    };
    globalThis.__cardMasterCatCatchReady = () => {
      void this.applyEnabledToBridge().then(() => this.syncFromCatCatch());
    };
    void this.applyEnabledToBridge();
    api.tabs.onRemoved.addListener((tabId) => {
      if (!this.tabs.delete(tabId)) return;
      this.publish(tabId);
    });
  }

  private bridge() {
    return globalThis.__cardMasterCatCatchBridge;
  }

  private async applyEnabledToBridge() {
    const settings = await this.readSettings();
    this.bridge()?.setEnabled(settings.enabled);
  }

  private syncFromCatCatch() {
    const bridge = this.bridge();
    if (!bridge) return;
    const previousTabIds = new Set(this.tabs.keys());
    this.tabs.clear();
    for (const [rawTabId, resources] of Object.entries(bridge.readAll())) {
      const tabId = Number(rawTabId);
      if (
        !Number.isSafeInteger(tabId) ||
        tabId < 0 ||
        !Array.isArray(resources)
      ) {
        continue;
      }
      this.tabs.set(tabId, convertTab(tabId, resources));
      previousTabIds.add(tabId);
    }
    for (const tabId of previousTabIds) this.publish(tabId);
  }

  async readSettings() {
    if (!this.settingsPromise) {
      this.settingsPromise = this.api.storage.local
        .get(MEDIA_RESOURCES_SETTINGS_STORAGE_KEY)
        .then((stored) => {
          const value = stored[MEDIA_RESOURCES_SETTINGS_STORAGE_KEY];
          return isMediaResourcesSettings(value)
            ? value
            : defaultMediaResourcesSettings();
        });
    }
    return this.settingsPromise;
  }

  private snapshot(
    tabId: number,
    url: string,
    settings: MediaResourcesSettings,
  ): MediaResourcesSnapshot {
    const current = this.tabs.get(tabId);
    const state = this.bridge()?.state(tabId) ?? {
      enabled: settings.enabled,
      captureEnabled: false,
      badgeNumber: true,
    };
    const resources = current?.resources ?? [];
    const pages: MediaResourcesPage[] = [...this.tabs]
      .sort(([left], [right]) =>
        left === tabId ? -1 : right === tabId ? 1 : left - right,
      )
      .slice(0, MEDIA_RESOURCES_MAX_PAGES)
      .map(([pageTabId, page]) => ({
        tabId: pageTabId,
        title: page.title,
        url: page.url,
        resources: structuredClone(page.resources),
      }));
    return {
      revision: this.revision,
      status: 'ready',
      enabled: settings.enabled,
      showPageTrigger: settings.showPageTrigger,
      showResourceCountBadge:
        settings.showResourceCountBadge && state.badgeNumber,
      available: extensionTarget() !== 'safari' && Boolean(this.api.webRequest),
      downloadAvailable: Boolean(this.api.downloads),
      requestHeadersAvailable: Boolean(
        this.api.webRequest?.onBeforeSendHeaders,
      ),
      captureAvailable: Boolean(this.api.scripting?.executeScript),
      captureEnabled: state.captureEnabled,
      activeOnPage:
        settings.enabled && (resources.length > 0 || state.captureEnabled),
      currentHost: mediaResourcesHost(url),
      resources: structuredClone(resources),
      pages,
    };
  }

  async read(tabId: number, url: string) {
    this.syncFromCatCatch();
    return this.snapshot(tabId, url, await this.readSettings());
  }

  async readCached(tabId: number, url: string) {
    return this.snapshot(tabId, url, await this.readSettings());
  }

  subscribe(
    listener: (tabId: number, snapshot: MediaResourcesSnapshot) => void,
  ) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(tabId: number) {
    this.revision += 1;
    void this.readSettings().then((settings) => {
      const current = this.tabs.get(tabId);
      const snapshot = this.snapshot(tabId, current?.url ?? '', settings);
      for (const listener of this.listeners) listener(tabId, snapshot);
      for (const [targetTabId, target] of this.tabs) {
        void this.api.tabs
          .sendMessage(
            targetTabId,
            {
              channel: EXTENSION_CHANNEL,
              type: 'media-resources-page-snapshot',
              snapshot:
                targetTabId === tabId
                  ? snapshot
                  : this.snapshot(targetTabId, target.url, settings),
            },
            { frameId: 0 },
          )
          .catch(() => undefined);
      }
    });
  }

  async setEnabled(tabId: number, url: string, enabled: boolean) {
    this.bridge()?.setEnabled(enabled);
    const current = await this.readSettings();
    const settings = { ...current, enabled, revision: current.revision + 1 };
    await this.api.storage.local.set({
      [MEDIA_RESOURCES_SETTINGS_STORAGE_KEY]: settings,
    });
    this.settingsPromise = Promise.resolve(settings);
    this.publish(tabId);
    return this.snapshot(tabId, url, settings);
  }

  async setPresentationSettings(
    tabId: number,
    url: string,
    presentation: Pick<
      MediaResourcesSettings,
      'showPageTrigger' | 'showResourceCountBadge'
    >,
  ) {
    const current = await this.readSettings();
    const settings = {
      ...current,
      ...presentation,
      revision: current.revision + 1,
    };
    await this.api.storage.local.set({
      [MEDIA_RESOURCES_SETTINGS_STORAGE_KEY]: settings,
    });
    this.settingsPromise = Promise.resolve(settings);
    for (const knownTabId of this.tabs.keys()) this.publish(knownTabId);
    return this.snapshot(tabId, url, settings);
  }

  async setCaptureEnabled(
    tabId: number,
    url: string,
    enabled: boolean,
    reload = true,
  ) {
    this.bridge()?.setCaptureEnabled(tabId, enabled, reload);
    this.publish(tabId);
    return this.snapshot(tabId, url, await this.readSettings());
  }

  async clear(tabId: number, url: string) {
    this.bridge()?.clear(tabId);
    this.tabs.delete(tabId);
    this.publish(tabId);
    return this.snapshot(tabId, url, await this.readSettings());
  }

  async reset() {
    this.bridge()?.reset();
    this.tabs.clear();
    const current = await this.readSettings();
    const settings = {
      ...defaultMediaResourcesSettings(),
      revision: current.revision + 1,
    };
    await this.api.storage.local.set({
      [MEDIA_RESOURCES_SETTINGS_STORAGE_KEY]: settings,
    });
    this.settingsPromise = Promise.resolve(settings);
  }

  private resource(tabId: number, resourceIdValue: string) {
    const resource = this.tabs
      .get(tabId)
      ?.resources.find((candidate) => candidate.id === resourceIdValue);
    if (!resource) throw new Error('当前页面已经没有这项媒体资源。');
    return resource;
  }

  async download(tabId: number, resourceIdValue: string) {
    if (!this.api.downloads) {
      throw new Error('当前浏览器没有提供扩展下载接口。');
    }
    const resource = this.resource(tabId, resourceIdValue);
    await this.api.downloads.download({
      url: resource.url,
      filename: resource.fileName,
      saveAs: false,
    });
  }

  async finishDownload(_requestId: string) {}

  async inspect(
    _tabId: number,
    _resourceIdValue: string,
  ): Promise<MediaManifestInspection> {
    throw new Error('播放清单请使用顺手牵羊原版解析器。');
  }

  async sendToAria2(tabId: number, resourceIdValue: string) {
    const resource = this.resource(tabId, resourceIdValue);
    const response = await fetch('http://127.0.0.1:6800/jsonrpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: resource.id,
        method: 'aria2.addUri',
        params: [
          [resource.url],
          {
            out: resource.fileName,
            ...(resource.requestHeaders.length > 0
              ? {
                  header: resource.requestHeaders.map(
                    ({ name, value }) => `${name}: ${value}`,
                  ),
                }
              : {}),
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Aria2 请求失败：HTTP ${response.status}。`);
    }
  }
}
