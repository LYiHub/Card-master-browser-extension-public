import type {
  AudioPlaybackOutcome,
  AudioPlaybackTransport,
  AudioPlayOptions,
  AudioSettings,
} from '../../audio/AudioDirector';
import type { AudioCue } from '../../audio/cues';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './audio-playback-protocol';

type AudioPlaybackResponse = {
  supported: boolean;
  playback?: AudioPlaybackOutcome;
  error?: string;
};

let requestSequence = 0;

function chromiumUserAgent(userAgent: string) {
  return (
    /(?:Chrome|Chromium|Edg|OPR|Vivaldi)\//i.test(userAgent) &&
    !/(?:Firefox|FxiOS)\//i.test(userAgent)
  );
}

export function supportsOffscreenAudioPlayback(
  userAgent = globalThis.navigator?.userAgent ?? '',
) {
  return chromiumUserAgent(userAgent);
}

function remoteOptions(options: AudioPlayOptions) {
  const { gain, playbackRate, sourceIndex } = options;
  const width = globalThis.innerWidth;
  const pan =
    options.pan ??
    (options.positionX === undefined || !Number.isFinite(width) || width <= 0
      ? undefined
      : Math.min(1, Math.max(-1, (options.positionX / width) * 2 - 1)) * 0.46);
  return {
    ...(gain === undefined ? {} : { gain }),
    ...(playbackRate === undefined ? {} : { playbackRate }),
    ...(pan === undefined ? {} : { pan }),
    ...(sourceIndex === undefined ? {} : { sourceIndex }),
  };
}

function nextRequestId() {
  requestSequence += 1;
  return `${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

export class ExtensionOffscreenAudioTransport
  implements AudioPlaybackTransport
{
  private destroyed = false;
  private lastSettings = '';

  constructor(private readonly api: ExtensionApi) {}

  async prepare(cues: readonly AudioCue[], settings: AudioSettings) {
    if (this.destroyed) return;
    const response = await sendExtensionRequest<AudioPlaybackResponse>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'audio-playback-prepare',
        cues: [...cues],
        settings,
      },
    );
    if (response.error) throw new Error(response.error);
  }

  play(cue: AudioCue, options: AudioPlayOptions, settings: AudioSettings) {
    if (this.destroyed) return;
    const requestId = nextRequestId();
    void sendExtensionRequest<AudioPlaybackResponse>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'audio-playback-play',
      requestId,
      cue,
      options: remoteOptions(options),
      settings,
    }).catch(() => undefined);
  }

  synchronize(settings: AudioSettings) {
    if (this.destroyed) return;
    const serialized = JSON.stringify(settings);
    if (serialized === this.lastSettings) return;
    this.lastSettings = serialized;
    void sendExtensionRequest(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'audio-playback-settings-sync',
      settings,
    }).catch(() => undefined);
  }

  destroy() {
    this.destroyed = true;
  }
}

export function extensionAudioPlaybackTransport(api: ExtensionApi) {
  return supportsOffscreenAudioPlayback()
    ? new ExtensionOffscreenAudioTransport(api)
    : undefined;
}
