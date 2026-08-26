import type {
  PageThemeController,
  PageThemeSettings,
  PageThemeSettingsView,
  PageThemeSnapshot,
  PageThemeSnapshotListener,
} from '../../page-theme/domain/types';
import { startingPageThemeSnapshot } from '../../page-theme/domain/types';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  ExtensionMessageSubscription,
  sendExtensionRequest,
} from './api';
import {
  PAGE_THEME_SNAPSHOT_EVENT,
  readPageThemeSnapshot,
  requestPageThemeTransition,
} from './page-theme-protocol';
import { PAGE_THEME_VISUAL_READY_TIMEOUT_MS } from './page-theme-readiness';
import { EXTENSION_CHANNEL, extensionPageThemeEvent } from './protocol';

type SettingsResponse = {
  settings?: PageThemeSettings;
  error?: string;
};

const SNAPSHOT_WAIT_TIMEOUT_MS = PAGE_THEME_VISUAL_READY_TIMEOUT_MS + 3_000;

function snapshotCompleted(snapshot: PageThemeSnapshot, revision: number) {
  return snapshot.revision >= revision && snapshot.status !== 'starting';
}

function responseSettings(response: SettingsResponse) {
  if (response.error) throw new Error(response.error);
  if (!response.settings) {
    throw new Error('扩展返回了无效的暗夜降临设置。');
  }
  return response.settings;
}

export class ExtensionPageThemeController implements PageThemeController {
  private readonly listeners = new Set<PageThemeSnapshotListener>();
  private readonly snapshotWaiters = new Set<{
    revision: number;
    resolve: (snapshot: PageThemeSnapshot) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private currentSnapshot: PageThemeSnapshot;
  private readonly handleSnapshotEvent = (event: Event) => {
    const snapshot =
      event instanceof CustomEvent && event.detail
        ? (event.detail as PageThemeSnapshot)
        : readPageThemeSnapshot(this.pageDocument);
    if (!snapshot) return;
    this.acceptSnapshot(snapshot);
  };
  private readonly handleMessage: ExtensionMessageListener = (message) => {
    if (!extensionPageThemeEvent(message)) return;
    const local = readPageThemeSnapshot(this.pageDocument);
    if (local && local.revision >= message.settings.revision) {
      this.acceptSnapshot(local);
      return;
    }
    this.acceptSnapshot({
      ...this.currentSnapshot,
      revision: message.settings.revision,
      status: 'starting',
      enabled: message.settings.enabled,
      engine: message.settings.theme.engine,
    });
  };
  private readonly messageSubscription: ExtensionMessageSubscription;

  constructor(
    private readonly api: ExtensionApi,
    private readonly pageDocument: Document = document,
  ) {
    this.currentSnapshot =
      readPageThemeSnapshot(pageDocument) ??
      startingPageThemeSnapshot(pageDocument.location.href);
    this.messageSubscription = new ExtensionMessageSubscription(
      api,
      this.handleMessage,
    );
    pageDocument.addEventListener(
      PAGE_THEME_SNAPSHOT_EVENT,
      this.handleSnapshotEvent,
    );
  }

  private acceptSnapshot(snapshot: PageThemeSnapshot) {
    if (snapshot.revision < this.currentSnapshot.revision) {
      return this.currentSnapshot;
    }
    this.currentSnapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
    for (const waiter of [...this.snapshotWaiters]) {
      if (!snapshotCompleted(snapshot, waiter.revision)) continue;
      clearTimeout(waiter.timeout);
      this.snapshotWaiters.delete(waiter);
      waiter.resolve(snapshot);
    }
    return snapshot;
  }

  private waitForRevision(revision: number) {
    const local = readPageThemeSnapshot(this.pageDocument);
    if (local && snapshotCompleted(local, revision)) {
      this.acceptSnapshot(local);
      return Promise.resolve(local);
    }
    if (snapshotCompleted(this.currentSnapshot, revision)) {
      return Promise.resolve(this.currentSnapshot);
    }
    return new Promise<PageThemeSnapshot>((resolve) => {
      let waiter: {
        revision: number;
        resolve: (snapshot: PageThemeSnapshot) => void;
        timeout: ReturnType<typeof setTimeout>;
      };
      waiter = {
        revision,
        resolve,
        timeout: setTimeout(() => {
          this.snapshotWaiters.delete(waiter);
          resolve({
            ...this.currentSnapshot,
            revision,
            status: 'starting',
          });
        }, SNAPSHOT_WAIT_TIMEOUT_MS),
      };
      this.snapshotWaiters.add(waiter);
    });
  }

  async read() {
    const settings = responseSettings(
      await sendExtensionRequest<SettingsResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'page-theme-read',
      }),
    );
    const local = readPageThemeSnapshot(this.pageDocument);
    if (local && local.revision >= settings.revision) {
      this.acceptSnapshot(local);
      return local;
    }
    return {
      ...this.currentSnapshot,
      revision: settings.revision,
      enabled: settings.enabled,
      engine: settings.theme.engine,
    };
  }

  async readSettings(): Promise<PageThemeSettingsView> {
    const settings = responseSettings(
      await sendExtensionRequest<SettingsResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'page-theme-read',
      }),
    );
    return {
      settings,
      snapshot: await this.waitForRevision(settings.revision),
    };
  }

  private async mutate(
    request:
      | {
          channel: typeof EXTENSION_CHANNEL;
          type: 'page-theme-set-enabled';
          enabled: boolean;
        }
      | {
          channel: typeof EXTENSION_CHANNEL;
          type: 'page-theme-toggle-current-site';
        }
      | {
          channel: typeof EXTENSION_CHANNEL;
          type: 'page-theme-settings-save';
          settings: PageThemeSettings;
        }
      | {
          channel: typeof EXTENSION_CHANNEL;
          type: 'page-theme-settings-reset';
        },
  ) {
    const settings = responseSettings(
      await sendExtensionRequest<SettingsResponse>(this.api, request),
    );
    const snapshot = await this.waitForRevision(settings.revision);
    return {
      settings,
      snapshot,
    };
  }

  async setEnabled(enabled: boolean) {
    return (
      await this.mutate({
        channel: EXTENSION_CHANNEL,
        type: 'page-theme-set-enabled',
        enabled,
      })
    ).snapshot;
  }

  async toggleCurrentSite() {
    requestPageThemeTransition(this.pageDocument);
    return (
      await this.mutate({
        channel: EXTENSION_CHANNEL,
        type: 'page-theme-toggle-current-site',
      })
    ).snapshot;
  }

  saveSettings(settings: PageThemeSettings) {
    return this.mutate({
      channel: EXTENSION_CHANNEL,
      type: 'page-theme-settings-save',
      settings,
    });
  }

  resetSettings() {
    return this.mutate({
      channel: EXTENSION_CHANNEL,
      type: 'page-theme-settings-reset',
    });
  }

  subscribe(listener: PageThemeSnapshotListener) {
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
      PAGE_THEME_SNAPSHOT_EVENT,
      this.handleSnapshotEvent,
    );
    for (const waiter of this.snapshotWaiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve(this.currentSnapshot);
    }
    this.snapshotWaiters.clear();
    this.listeners.clear();
  }
}
