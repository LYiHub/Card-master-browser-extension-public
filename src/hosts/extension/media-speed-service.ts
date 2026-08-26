import {
  defaultMediaSpeedSettings,
  isMediaSpeedSelection,
  isMediaSpeedSettings,
  MEDIA_SPEED_STORAGE_KEY,
  type MediaSpeedSelection,
  type MediaSpeedSettings,
  type MediaSpeedSnapshot,
  mediaSpeedActiveOnPage,
  mediaSpeedHost,
  mediaSpeedSelectionForSite,
  mediaSpeedSiteLockEnabled,
  normalizeMediaSpeedSettings,
  setMediaSpeedSiteSelection,
} from '../../media-speed/domain/types';
import type { ExtensionBackgroundApi } from './api';
import { extensionDiagnostics } from './diagnostics';
import { EXTENSION_CHANNEL } from './protocol';

type FrameReport = {
  videoCount: number;
  audioCount: number;
};

type PageFrameContext = {
  tabId: number;
  frameId: number;
  url: string;
  tabUrl?: string;
};

export class ExtensionMediaSpeedService {
  private settingsPromise: Promise<MediaSpeedSettings> | null = null;
  private mutationQueue = Promise.resolve();
  private readonly reports = new Map<number, Map<number, FrameReport>>();
  private readonly urls = new Map<number, string>();

  constructor(private readonly api: ExtensionBackgroundApi) {
    api.tabs.onRemoved.addListener((tabId) => this.clearTab(tabId));
    api.tabs.onUpdated.addListener((tabId, change, tab) => {
      if (change.status !== 'loading') return;
      this.reports.delete(tabId);
      if (tab.url) this.urls.set(tabId, tab.url);
    });
  }

  private clearTab(tabId: number) {
    this.reports.delete(tabId);
    this.urls.delete(tabId);
  }

  private pageUrl({ tabId, frameId, url, tabUrl }: PageFrameContext) {
    const pageUrl =
      frameId === 0 ? url : (tabUrl ?? this.urls.get(tabId) ?? url);
    this.urls.set(tabId, pageUrl);
    return pageUrl;
  }

  private async load() {
    const stored = (await this.api.storage.local.get(MEDIA_SPEED_STORAGE_KEY))[
      MEDIA_SPEED_STORAGE_KEY
    ];
    if (!isMediaSpeedSettings(stored)) {
      const settings = defaultMediaSpeedSettings();
      await this.api.storage.local.set({ [MEDIA_SPEED_STORAGE_KEY]: settings });
      return settings;
    }
    return normalizeMediaSpeedSettings(stored);
  }

  readSettings() {
    if (!this.settingsPromise) {
      this.settingsPromise = this.load().catch((error) => {
        this.settingsPromise = null;
        throw error;
      });
    }
    return this.settingsPromise;
  }

  private selectionFor(url: string, settings: MediaSpeedSettings) {
    return mediaSpeedSelectionForSite(settings, url);
  }

  private mediaCounts(tabId: number) {
    let videoCount = 0;
    let audioCount = 0;
    for (const report of this.reports.get(tabId)?.values() ?? []) {
      videoCount += report.videoCount;
      audioCount += report.audioCount;
    }
    return {
      videoCount,
      audioCount,
      mediaCount: videoCount + audioCount,
    };
  }

  private snapshot(
    tabId: number,
    url: string,
    settings: MediaSpeedSettings,
  ): MediaSpeedSnapshot {
    const counts = this.mediaCounts(tabId);
    return {
      revision: settings.revision,
      status: 'ready',
      enabled: settings.enabled,
      activeOnPage: mediaSpeedActiveOnPage(settings, url),
      currentHost: mediaSpeedHost(url),
      lockSpeed: mediaSpeedSiteLockEnabled(settings, url),
      ...counts,
      selection: this.selectionFor(url, settings),
      showWheel: settings.showWheel,
      wheelItems: settings.wheelItems,
    };
  }

  async read(context: PageFrameContext) {
    const { tabId } = context;
    const url = this.pageUrl(context);
    const settings = await this.readSettings();
    const snapshot = this.snapshot(tabId, url, settings);
    return {
      settings,
      selection: this.selectionFor(url, settings),
      snapshot,
    };
  }

  private async sendTabState(tabId: number, settings: MediaSpeedSettings) {
    const url = this.urls.get(tabId) ?? '';
    if (!mediaSpeedActiveOnPage(settings, url)) this.reports.delete(tabId);
    const selection = this.selectionFor(url, settings);
    const snapshot = this.snapshot(tabId, url, settings);
    await Promise.allSettled([
      this.api.tabs.sendMessage(tabId, {
        channel: EXTENSION_CHANNEL,
        type: 'media-speed-state-changed',
        settings,
        selection,
        activeOnPage: snapshot.activeOnPage,
      }),
      this.api.tabs.sendMessage(
        tabId,
        {
          channel: EXTENSION_CHANNEL,
          type: 'media-speed-page-snapshot',
          snapshot,
        },
        { frameId: 0 },
      ),
    ]);
  }

  private async broadcast(settings: MediaSpeedSettings) {
    const tabs = await this.api.tabs.query({});
    await Promise.allSettled(
      tabs.flatMap((tab) =>
        typeof tab.id === 'number' ? [this.sendTabState(tab.id, settings)] : [],
      ),
    );
  }

  private publish(settings: MediaSpeedSettings) {
    void this.broadcast(settings).catch((error) => {
      extensionDiagnostics.warn(
        'media-speed-service',
        '后台广播倍速设置失败',
        error,
        { revision: settings.revision },
      );
    });
  }

  private mutate(
    mutation: (settings: MediaSpeedSettings) => MediaSpeedSettings,
  ) {
    const operation = this.mutationQueue.then(async () => {
      const current = await this.readSettings();
      const settings = normalizeMediaSpeedSettings({
        ...mutation(structuredClone(current)),
        version: 1,
        revision: current.revision + 1,
      });
      await this.api.storage.local.set({ [MEDIA_SPEED_STORAGE_KEY]: settings });
      this.settingsPromise = Promise.resolve(settings);
      this.publish(settings);
      return settings;
    });
    this.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async setEnabled(tabId: number, url: string, enabled: boolean) {
    this.urls.set(tabId, url);
    const settings = await this.mutate((current) => ({
      ...current,
      enabled,
    }));
    return {
      settings,
      snapshot: this.snapshot(tabId, url, settings),
    };
  }

  async reset() {
    const current = await this.readSettings();
    const settings = {
      ...defaultMediaSpeedSettings(),
      revision: current.revision + 1,
    };
    await this.api.storage.local.set({ [MEDIA_SPEED_STORAGE_KEY]: settings });
    this.settingsPromise = Promise.resolve(settings);
    this.publish(settings);
  }

  async save(tabId: number, url: string, value: MediaSpeedSettings) {
    if (!isMediaSpeedSettings(value)) {
      throw new Error('媒体倍速设置格式无效。');
    }
    this.urls.set(tabId, url);
    const settings = await this.mutate(() => value);
    return {
      settings,
      snapshot: this.snapshot(tabId, url, settings),
    };
  }

  async setSelection(
    tabId: number,
    url: string,
    selection: MediaSpeedSelection,
  ) {
    if (!isMediaSpeedSelection(selection)) {
      throw new Error('媒体倍速收到了无效的倍速档位。');
    }
    this.urls.set(tabId, url);
    const settings = await this.mutate((current) =>
      setMediaSpeedSiteSelection(current, url, selection),
    );
    return {
      settings,
      selection,
      snapshot: this.snapshot(tabId, url, settings),
    };
  }

  async reportFrame({
    tabId,
    frameId,
    url,
    tabUrl,
    videoCount,
    audioCount,
  }: {
    tabId: number;
    frameId: number;
    url: string;
    tabUrl?: string;
    videoCount: number;
    audioCount: number;
  }) {
    const pageUrl = this.pageUrl({ tabId, frameId, url, tabUrl });
    const frameReports = this.reports.get(tabId) ?? new Map();
    frameReports.set(frameId, { videoCount, audioCount });
    this.reports.set(tabId, frameReports);
    const settings = await this.readSettings();
    const snapshot = this.snapshot(tabId, pageUrl, settings);
    const deliveryStartedAt = performance.now();
    void this.api.tabs
      .sendMessage(
        tabId,
        {
          channel: EXTENSION_CHANNEL,
          type: 'media-speed-page-snapshot',
          snapshot,
        },
        { frameId: 0 },
      )
      .then(
        () => undefined,
        (error) =>
          extensionDiagnostics.warn(
            'media-speed-service',
            '后台发送聚合快照失败',
            error,
            {
              tabId,
              mediaCount: snapshot.mediaCount,
              videoCount: snapshot.videoCount,
              audioCount: snapshot.audioCount,
              deliveryDurationMs:
                Math.round((performance.now() - deliveryStartedAt) * 10) / 10,
            },
          ),
      );
    return snapshot;
  }
}
