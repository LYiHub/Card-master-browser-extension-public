import {
  isMediaManifestInspection,
  isMediaResourcesSnapshot,
  type MediaManifestInspection,
  type MediaResourcesController,
  type MediaResourcesSnapshot,
  type MediaResourcesSnapshotListener,
  mediaResourcesHost,
  startingMediaResourcesSnapshot,
} from '../../media-resources/domain/types';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  ExtensionMessageSubscription,
  sendExtensionRequest,
} from './api';
import { EXTENSION_CHANNEL } from './extension-channel';
import { extensionMediaResourcesPageSnapshotEvent } from './protocol';

type MediaResourcesResponse = {
  snapshot?: MediaResourcesSnapshot;
  inspection?: MediaManifestInspection;
  ok?: boolean;
  error?: string;
};

function responseSnapshot(response: MediaResourcesResponse) {
  if (response.error) throw new Error(response.error);
  if (!isMediaResourcesSnapshot(response.snapshot)) {
    throw new Error('扩展没有返回有效的媒体资源状态。');
  }
  return response.snapshot;
}

export class ExtensionMediaResourcesController
  implements MediaResourcesController
{
  private readonly listeners = new Set<MediaResourcesSnapshotListener>();
  private currentSnapshot: MediaResourcesSnapshot;
  private readonly handleMessage: ExtensionMessageListener = (message) => {
    if (!extensionMediaResourcesPageSnapshotEvent(message)) return;
    this.acceptSnapshot(message.snapshot);
  };
  private readonly messageSubscription: ExtensionMessageSubscription;

  constructor(
    private readonly api: ExtensionApi,
    private readonly pageDocument: Document = document,
  ) {
    this.currentSnapshot = startingMediaResourcesSnapshot(
      pageDocument.location.href,
    );
    this.messageSubscription = new ExtensionMessageSubscription(
      api,
      this.handleMessage,
    );
  }

  private acceptSnapshot(snapshot: MediaResourcesSnapshot) {
    if (snapshot.revision < this.currentSnapshot.revision) {
      return this.currentSnapshot;
    }
    const expectedHost = mediaResourcesHost(this.pageDocument.location.href);
    if (
      expectedHost &&
      snapshot.currentHost &&
      snapshot.currentHost !== expectedHost
    ) {
      return this.currentSnapshot;
    }
    this.currentSnapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }

  private async request(
    request:
      | {
          channel: typeof EXTENSION_CHANNEL;
          type: 'media-resources-read';
        }
      | {
          channel: typeof EXTENSION_CHANNEL;
          type: 'media-resources-clear';
          targetTabId?: number;
        }
      | {
          channel: typeof EXTENSION_CHANNEL;
          type: 'media-resources-set-enabled';
          enabled: boolean;
        }
      | {
          channel: typeof EXTENSION_CHANNEL;
          type: 'media-resources-settings-update';
          presentation: {
            showPageTrigger: boolean;
            showResourceCountBadge: boolean;
          };
        },
  ) {
    return responseSnapshot(
      await sendExtensionRequest<MediaResourcesResponse>(this.api, request),
    );
  }

  async read() {
    return this.acceptSnapshot(
      await this.request({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-read',
      }),
    );
  }

  async setEnabled(enabled: boolean) {
    return this.acceptSnapshot(
      await this.request({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-set-enabled',
        enabled,
      }),
    );
  }

  async openSettings() {
    const response = await sendExtensionRequest<{
      ok?: boolean;
      error?: string;
    }>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'media-resources-settings-open',
    });
    if (response.error) throw new Error(response.error);
    if (!response.ok) throw new Error('扩展未能打开顺手牵羊设置。');
  }

  async setPresentationSettings(presentation: {
    showPageTrigger: boolean;
    showResourceCountBadge: boolean;
  }) {
    return this.acceptSnapshot(
      await this.request({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-settings-update',
        presentation,
      }),
    );
  }

  async setCaptureEnabled(enabled: boolean) {
    return this.acceptSnapshot(
      responseSnapshot(
        await sendExtensionRequest<MediaResourcesResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'media-resources-capture-set',
          enabled,
        }),
      ),
    );
  }

  async clear(tabId?: number) {
    return this.acceptSnapshot(
      await this.request({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-clear',
        targetTabId: tabId,
      }),
    );
  }

  async download(resourceId: string, tabId: number) {
    const response = await sendExtensionRequest<MediaResourcesResponse>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-download',
        resourceId,
        targetTabId: tabId,
      },
    );
    if (response.error) throw new Error(response.error);
    if (!response.ok) throw new Error('扩展没有确认媒体资源下载请求。');
  }

  async inspect(resourceId: string, tabId: number) {
    const response = await sendExtensionRequest<MediaResourcesResponse>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-inspect',
        resourceId,
        targetTabId: tabId,
      },
    );
    if (response.error) throw new Error(response.error);
    if (!isMediaManifestInspection(response.inspection)) {
      throw new Error('扩展没有返回有效的播放清单分析结果。');
    }
    return response.inspection;
  }

  async sendToAria2(resourceId: string, tabId: number) {
    const response = await sendExtensionRequest<MediaResourcesResponse>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-send-aria2',
        resourceId,
        targetTabId: tabId,
      },
    );
    if (response.error) throw new Error(response.error);
    if (!response.ok) throw new Error('扩展没有确认 Aria2 下载请求。');
  }

  subscribe(listener: MediaResourcesSnapshotListener) {
    if (this.listeners.size === 0) this.messageSubscription.start();
    this.listeners.add(listener);
    listener(this.currentSnapshot);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.messageSubscription.stop();
    };
  }

  dispose() {
    this.messageSubscription.stop();
    this.listeners.clear();
  }
}
