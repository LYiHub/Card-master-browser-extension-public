import { AudioDirector } from '../../audio/AudioDirector';
import { registerPageAudioDirector } from '../../audio/page-audio-director';
import type { ExtensionApi } from './api';
import { extensionAudioPlaybackTransport } from './audio-playback-transport';
import { ExtensionAudioSettingsRepository } from './audio-settings';

export function createExtensionPageAudioDirector(api: ExtensionApi) {
  const director = new AudioDirector(
    new ExtensionAudioSettingsRepository(api),
    extensionAudioPlaybackTransport(api),
  );
  const unregister = registerPageAudioDirector(director);
  return {
    director,
    dispose() {
      unregister();
      director.destroy();
    },
  };
}
