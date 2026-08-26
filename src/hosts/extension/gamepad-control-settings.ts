import type {
  GamepadControlController,
  GamepadControlSettings,
} from '../../gamepad-control/domain/settings';
import {
  defaultGamepadControlSettings,
  isGamepadControlSettings,
} from '../../gamepad-control/domain/settings';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  ExtensionMessageSubscription,
  sendExtensionRequest,
} from './api';
import { EXTENSION_CHANNEL } from './extension-channel';

function settingsResponse(response: unknown): GamepadControlSettings {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('扩展没有返回有效的手柄控制设置。');
  }
  const candidate = response as { error?: unknown };
  if (typeof candidate.error === 'string' && candidate.error) {
    throw new Error(candidate.error);
  }
  if (!isGamepadControlSettings(response)) {
    throw new Error('扩展没有返回有效的手柄控制设置。');
  }
  return response;
}

export class ExtensionGamepadControlController
  implements GamepadControlController
{
  private readonly listeners = new Set<
    (settings: GamepadControlSettings) => void
  >();
  private settings = defaultGamepadControlSettings();
  private hydrated = false;
  private readonly messageSubscription: ExtensionMessageSubscription;
  private readonly handleMessage: ExtensionMessageListener = (message) => {
    if (
      !message ||
      typeof message !== 'object' ||
      Array.isArray(message) ||
      (message as { channel?: unknown }).channel !== EXTENSION_CHANNEL ||
      (message as { type?: unknown }).type !==
        'gamepad-control-settings-changed'
    ) {
      return;
    }
    const settings = (message as { settings?: unknown }).settings;
    if (!isGamepadControlSettings(settings)) return;
    this.acceptSettings(settings);
  };

  constructor(private readonly api: ExtensionApi) {
    this.messageSubscription = new ExtensionMessageSubscription(
      api,
      this.handleMessage,
    );
  }

  private acceptSettings(settings: GamepadControlSettings) {
    this.settings = settings;
    this.hydrated = true;
    for (const listener of this.listeners) listener(settings);
    return settings;
  }

  async readSettings() {
    return this.acceptSettings(
      settingsResponse(
        await sendExtensionRequest<unknown>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'gamepad-control-settings-read',
        }),
      ),
    );
  }

  async saveSettings(settings: GamepadControlSettings) {
    return this.acceptSettings(
      settingsResponse(
        await sendExtensionRequest<unknown>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'gamepad-control-settings-save',
          settings,
        }),
      ),
    );
  }

  subscribe(listener: (settings: GamepadControlSettings) => void) {
    if (this.listeners.size === 0) this.messageSubscription.start();
    this.listeners.add(listener);
    if (this.hydrated) listener(this.settings);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.messageSubscription.stop();
    };
  }
}
