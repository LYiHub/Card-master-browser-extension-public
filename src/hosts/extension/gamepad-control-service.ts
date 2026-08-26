import {
  defaultGamepadControlSettings,
  GAMEPAD_CONTROL_STORAGE_KEY,
  type GamepadControlSettings,
  isGamepadControlSettings,
  normalizeGamepadControlSettings,
} from '../../gamepad-control/domain/settings';
import type { ExtensionBackgroundApi } from './api';
import { EXTENSION_CHANNEL } from './extension-channel';

export class ExtensionGamepadControlService {
  private settingsPromise: Promise<GamepadControlSettings> | null = null;
  private mutationQueue = Promise.resolve();

  constructor(private readonly api: ExtensionBackgroundApi) {}

  private async load() {
    const stored = await this.api.storage.local.get(
      GAMEPAD_CONTROL_STORAGE_KEY,
    );
    const current = stored[GAMEPAD_CONTROL_STORAGE_KEY];
    if (isGamepadControlSettings(current)) {
      return normalizeGamepadControlSettings(current);
    }
    const settings = defaultGamepadControlSettings();
    await this.api.storage.local.set({
      [GAMEPAD_CONTROL_STORAGE_KEY]: settings,
    });
    return settings;
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

  private broadcast(settings: GamepadControlSettings) {
    void this.api.tabs
      .query({})
      .then((tabs) =>
        Promise.allSettled(
          tabs.flatMap((tab) =>
            typeof tab.id === 'number'
              ? [
                  this.api.tabs.sendMessage(tab.id, {
                    channel: EXTENSION_CHANNEL,
                    type: 'gamepad-control-settings-changed',
                    settings,
                  }),
                ]
              : [],
          ),
        ),
      )
      .catch(() => undefined);
  }

  private mutate(
    mutation: (settings: GamepadControlSettings) => GamepadControlSettings,
  ) {
    const operation = this.mutationQueue.then(async () => {
      const current = await this.readSettings();
      const settings = normalizeGamepadControlSettings({
        ...mutation(structuredClone(current)),
        version: 1,
        revision: current.revision + 1,
      });
      await this.api.storage.local.set({
        [GAMEPAD_CONTROL_STORAGE_KEY]: settings,
      });
      this.settingsPromise = Promise.resolve(settings);
      this.broadcast(settings);
      return settings;
    });
    this.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  save(settings: GamepadControlSettings) {
    if (!isGamepadControlSettings(settings)) {
      throw new Error('手柄控制设置格式无效。');
    }
    return this.mutate(() => settings);
  }

  setControllerIndicatorVisible(visible: boolean) {
    return this.mutate((settings) => ({
      ...settings,
      showControllerIndicator: visible,
    }));
  }

  async reset() {
    const current = await this.readSettings();
    const settings = {
      ...defaultGamepadControlSettings(),
      revision: current.revision + 1,
    };
    await this.api.storage.local.set({
      [GAMEPAD_CONTROL_STORAGE_KEY]: settings,
    });
    this.settingsPromise = Promise.resolve(settings);
    this.broadcast(settings);
  }
}
