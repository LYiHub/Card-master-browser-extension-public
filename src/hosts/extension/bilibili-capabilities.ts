import type {
  BilibiliCapabilityCommand,
  BilibiliCapabilityController,
  BilibiliCapabilityId,
  BilibiliCapabilitySettings,
  BilibiliCapabilitySnapshot,
  BilibiliCapabilitySnapshotListener,
} from '../../bilibili-capabilities/domain/types';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  ExtensionMessageSubscription,
  sendExtensionRequest,
} from './api';
import {
  EXTENSION_CHANNEL,
  extensionBilibiliCapabilitiesEvent,
} from './protocol';

type CapabilityResponse = {
  snapshots?: BilibiliCapabilitySnapshot[];
  capability?: BilibiliCapabilitySettings;
  error?: string;
};

function responseSnapshots(response: CapabilityResponse) {
  if (response.error) throw new Error(response.error);
  if (!Array.isArray(response.snapshots)) {
    throw new Error('扩展没有返回有效的平台能力状态。');
  }
  return response.snapshots;
}

export class ExtensionBilibiliCapabilityController
  implements BilibiliCapabilityController
{
  private readonly listeners = new Set<BilibiliCapabilitySnapshotListener>();
  private snapshots: readonly BilibiliCapabilitySnapshot[] = [];
  private readSequence = 0;
  private readonly handleMessage: ExtensionMessageListener = (message) => {
    if (!extensionBilibiliCapabilitiesEvent(message)) return;
    this.accept(message.snapshots);
  };
  private readonly subscription: ExtensionMessageSubscription;

  constructor(private readonly api: ExtensionApi) {
    this.subscription = new ExtensionMessageSubscription(
      api,
      this.handleMessage,
    );
  }

  private accept(snapshots: readonly BilibiliCapabilitySnapshot[]) {
    const currentRevision = Math.max(
      -1,
      ...this.snapshots.map((snapshot) => snapshot.revision),
    );
    const nextRevision = Math.max(
      -1,
      ...snapshots.map((snapshot) => snapshot.revision),
    );
    if (nextRevision < currentRevision) return this.snapshots;
    this.snapshots = snapshots;
    for (const listener of this.listeners) listener(snapshots);
    return snapshots;
  }

  async read(pageUrl?: string) {
    const sequence = ++this.readSequence;
    const snapshots = responseSnapshots(
      await sendExtensionRequest<CapabilityResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'bilibili-capabilities-read',
        ...(pageUrl ? { pageUrl } : {}),
      }),
    );
    return sequence === this.readSequence
      ? this.accept(snapshots)
      : this.snapshots;
  }

  async readSettings<Id extends BilibiliCapabilityId>(id: Id) {
    const response = await sendExtensionRequest<CapabilityResponse>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'bilibili-capability-settings-read',
      capabilityId: id,
    });
    if (response.error) throw new Error(response.error);
    if (!response.capability || response.capability.id !== id) {
      throw new Error('扩展没有返回有效的平台能力设置。');
    }
    return response.capability as BilibiliCapabilitySettings<Id>;
  }

  async setEnabled(id: BilibiliCapabilityId, enabled: boolean) {
    return this.accept(
      responseSnapshots(
        await sendExtensionRequest<CapabilityResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'bilibili-capability-set-enabled',
          capabilityId: id,
          enabled,
        }),
      ),
    );
  }

  async saveSettings<Id extends BilibiliCapabilityId>(
    value: BilibiliCapabilitySettings<Id>,
  ) {
    return this.accept(
      responseSnapshots(
        await sendExtensionRequest<CapabilityResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'bilibili-capability-settings-save',
          capability: value as BilibiliCapabilitySettings,
        }),
      ),
    );
  }

  async execute<Id extends BilibiliCapabilityId>(
    id: Id,
    command: BilibiliCapabilityCommand<Id>,
  ) {
    return this.accept(
      responseSnapshots(
        await sendExtensionRequest<CapabilityResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'bilibili-capability-command',
          capabilityId: id,
          command,
        }),
      ),
    );
  }

  subscribe(listener: BilibiliCapabilitySnapshotListener) {
    if (this.listeners.size === 0) this.subscription.start();
    this.listeners.add(listener);
    if (this.snapshots.length > 0) listener(this.snapshots);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.subscription.stop();
    };
  }

  dispose() {
    this.subscription.stop();
    this.listeners.clear();
  }
}
