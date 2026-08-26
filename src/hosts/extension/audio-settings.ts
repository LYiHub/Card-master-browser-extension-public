import type {
  AudioSettings,
  AudioSettingsRepository,
} from '../../audio/AudioDirector';
import {
  type ExtensionApi,
  ExtensionMessageSubscription,
  sendExtensionRequest,
} from './api';
import { EXTENSION_CHANNEL, extensionAudioSettingsEvent } from './protocol';

type AudioSettingsResponse = {
  settings?: AudioSettings;
  error?: string;
};

export class ExtensionAudioSettingsRepository
  implements AudioSettingsRepository
{
  constructor(private readonly api: ExtensionApi) {}

  async read() {
    const response = await sendExtensionRequest<AudioSettingsResponse>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'audio-settings-read',
      },
    );
    if (response.error) throw new Error(response.error);
    return response.settings ?? null;
  }

  async write(settings: AudioSettings) {
    const response = await sendExtensionRequest<{ error?: string }>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'audio-settings-write',
      settings,
    });
    if (response.error) throw new Error(response.error);
  }

  subscribe(listener: (settings: AudioSettings) => void) {
    const subscription = new ExtensionMessageSubscription(
      this.api,
      (message) => {
        if (extensionAudioSettingsEvent(message)) {
          listener(message.settings);
        }
      },
    );
    subscription.start();
    return () => subscription.stop();
  }
}
