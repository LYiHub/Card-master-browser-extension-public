import type {
  MediaSpeedController,
  MediaSpeedSelection,
  MediaSpeedSettings,
  MediaSpeedSettingsView,
  MediaSpeedSnapshot,
  MediaSpeedSnapshotListener,
} from '../../media-speed/domain/types';
import {
  mediaSpeedHost,
  mediaSpeedSelectionsEqual,
  mediaSpeedSiteLockEnabled,
  startingMediaSpeedSnapshot,
} from '../../media-speed/domain/types';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  ExtensionMessageSubscription,
  sendExtensionRequest,
} from './api';
import {
  MEDIA_SPEED_SNAPSHOT_EVENT,
  readMediaSpeedSnapshot,
} from './media-speed-protocol';
import {
  EXTENSION_CHANNEL,
  extensionMediaSpeedPageSnapshotEvent,
  extensionMediaSpeedStateEvent,
} from './protocol';

type ReadResponse = {
  settings?: MediaSpeedSettings;
  selection?: MediaSpeedSelection;
  snapshot?: MediaSpeedSnapshot;
  error?: string;
};

function normalizedSnapshotHost(value: string) {
  if (!value) return '';
  return mediaSpeedHost(value.includes('://') ? value : `https://${value}`);
}

function responseView(response: ReadResponse): MediaSpeedSettingsView {
  if (response.error) throw new Error(response.error);
  if (!response.settings || !response.snapshot) {
    throw new Error('扩展返回了无效的媒体倍速状态。');
  }
  return {
    settings: response.settings,
    snapshot: response.snapshot,
  };
}

function responseSnapshot(response: ReadResponse) {
  if (response.error) throw new Error(response.error);
  if (!response.snapshot) {
    throw new Error('扩展没有返回媒体倍速页面状态。');
  }
  return response.snapshot;
}

export class ExtensionMediaSpeedController implements MediaSpeedController {
  private readonly listeners = new Set<MediaSpeedSnapshotListener>();
  private currentSnapshot: MediaSpeedSnapshot;
  private pendingSelection: MediaSpeedSelection | null = null;
  private selectionOperation = 0;
  private readonly handleSnapshotEvent = (event: Event) => {
    const snapshot =
      event instanceof CustomEvent && event.detail
        ? (event.detail as MediaSpeedSnapshot)
        : readMediaSpeedSnapshot(this.pageDocument);
    if (snapshot) this.acceptSnapshot(snapshot);
  };
  private readonly handleMessage: ExtensionMessageListener = (message) => {
    if (extensionMediaSpeedPageSnapshotEvent(message)) {
      this.acceptSnapshot(message.snapshot);
      return;
    }
    if (!extensionMediaSpeedStateEvent(message)) return;
    this.acceptSnapshot({
      ...this.currentSnapshot,
      revision: message.settings.revision,
      status: 'starting',
      enabled: message.settings.enabled,
      activeOnPage: message.activeOnPage,
      lockSpeed: mediaSpeedSiteLockEnabled(
        message.settings,
        this.pageDocument.location.href,
      ),
      selection: message.selection,
      showWheel: message.settings.showWheel,
      wheelItems: message.settings.wheelItems,
    });
  };
  private readonly messageSubscription: ExtensionMessageSubscription;

  constructor(
    private readonly api: ExtensionApi,
    private readonly pageDocument: Document = document,
  ) {
    this.currentSnapshot =
      readMediaSpeedSnapshot(pageDocument) ??
      startingMediaSpeedSnapshot(pageDocument.location.href);
    this.messageSubscription = new ExtensionMessageSubscription(
      api,
      this.handleMessage,
    );
    pageDocument.addEventListener(
      MEDIA_SPEED_SNAPSHOT_EVENT,
      this.handleSnapshotEvent,
    );
  }

  private acceptSnapshot(snapshot: MediaSpeedSnapshot) {
    const previous = this.currentSnapshot;
    if (snapshot.revision < previous.revision) {
      return previous;
    }
    const expectedHost = mediaSpeedHost(this.pageDocument.location.href);
    const nextHost = normalizedSnapshotHost(snapshot.currentHost);
    if (expectedHost && nextHost && nextHost !== expectedHost) {
      return previous;
    }
    const pendingSnapshot =
      this.pendingSelection &&
      !mediaSpeedSelectionsEqual(snapshot.selection, this.pendingSelection)
        ? { ...snapshot, selection: this.pendingSelection }
        : snapshot;
    const next =
      pendingSnapshot.revision === previous.revision &&
      previous.status === 'ready' &&
      pendingSnapshot.status === 'starting'
        ? {
            ...pendingSnapshot,
            status: previous.status,
            mediaCount: previous.mediaCount,
            videoCount: previous.videoCount,
            audioCount: previous.audioCount,
          }
        : pendingSnapshot;
    this.currentSnapshot = next;
    for (const listener of this.listeners) listener(next);
    return next;
  }

  async read() {
    const response = await sendExtensionRequest<ReadResponse>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'media-speed-read',
    });
    const snapshot = responseSnapshot(response);
    return this.acceptSnapshot(snapshot);
  }

  async readSettings() {
    const view = responseView(
      await sendExtensionRequest<ReadResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'media-speed-read',
      }),
    );
    return {
      ...view,
      snapshot: this.acceptSnapshot(view.snapshot),
    };
  }

  private async mutate(
    request:
      | {
          channel: typeof EXTENSION_CHANNEL;
          type: 'media-speed-set-enabled';
          enabled: boolean;
        }
      | {
          channel: typeof EXTENSION_CHANNEL;
          type: 'media-speed-selection-set';
          selection: MediaSpeedSelection;
        }
      | {
          channel: typeof EXTENSION_CHANNEL;
          type: 'media-speed-settings-save';
          settings: MediaSpeedSettings;
        },
  ) {
    const response = await sendExtensionRequest<ReadResponse>(
      this.api,
      request,
    );
    const snapshot = responseSnapshot(response);
    const acceptedSnapshot = this.acceptSnapshot(snapshot);
    return response.settings
      ? { settings: response.settings, snapshot: acceptedSnapshot }
      : { snapshot: acceptedSnapshot };
  }

  async setEnabled(enabled: boolean) {
    return (
      await this.mutate({
        channel: EXTENSION_CHANNEL,
        type: 'media-speed-set-enabled',
        enabled,
      })
    ).snapshot;
  }

  async setSelection(selection: MediaSpeedSelection) {
    const operation = ++this.selectionOperation;
    this.pendingSelection = selection;
    this.acceptSnapshot({ ...this.currentSnapshot, selection });
    try {
      const result = await this.mutate({
        channel: EXTENSION_CHANNEL,
        type: 'media-speed-selection-set',
        selection,
      });
      if (operation === this.selectionOperation) {
        this.pendingSelection = null;
      }
      return result.snapshot;
    } catch (error) {
      if (operation === this.selectionOperation) {
        this.pendingSelection = null;
      }
      throw error;
    }
  }

  async saveSettings(settings: MediaSpeedSettings) {
    const result = await this.mutate({
      channel: EXTENSION_CHANNEL,
      type: 'media-speed-settings-save',
      settings,
    });
    if (!result.settings) throw new Error('媒体倍速设置保存失败。');
    return { settings: result.settings, snapshot: result.snapshot };
  }

  subscribe(listener: MediaSpeedSnapshotListener) {
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
    this.pageDocument.removeEventListener(
      MEDIA_SPEED_SNAPSHOT_EVENT,
      this.handleSnapshotEvent,
    );
    this.listeners.clear();
  }
}
