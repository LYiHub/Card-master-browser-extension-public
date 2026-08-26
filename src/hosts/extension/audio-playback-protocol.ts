import {
  type AudioPlaybackOutcome,
  type AudioSettings,
  normalizeAudioSettings,
} from '../../audio/AudioDirector';
import { AUDIO_CUES, type AudioCue } from '../../audio/cues';
import { EXTENSION_CHANNEL } from './extension-channel';

export { EXTENSION_CHANNEL };

export const OFFSCREEN_AUDIO_CHANNEL = 'card-master:offscreen-audio';
export const OFFSCREEN_AUDIO_PORT = 'card-master:offscreen-audio-port';

export type AudioPlaybackOptions = {
  gain?: number;
  playbackRate?: number;
  pan?: number;
  sourceIndex?: number;
};

export type AudioPlaybackRequest =
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'audio-playback-prepare';
      cues: AudioCue[];
      settings: AudioSettings;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'audio-playback-play';
      requestId: string;
      cue: AudioCue;
      options: AudioPlaybackOptions;
      settings: AudioSettings;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'audio-playback-settings-sync';
      settings: AudioSettings;
    };

type OffscreenAudioCommandFor<Request> = Request extends {
  channel: typeof EXTENSION_CHANNEL;
}
  ? Omit<Request, 'channel'> & {
      channel: typeof OFFSCREEN_AUDIO_CHANNEL;
    }
  : never;

export type OffscreenAudioCommand =
  OffscreenAudioCommandFor<AudioPlaybackRequest>;

export type OffscreenAudioPlaybackResult = {
  channel: typeof OFFSCREEN_AUDIO_CHANNEL;
  type: 'audio-playback-result';
  requestId: string;
  cue: AudioCue;
  playback: AudioPlaybackOutcome;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function audioCue(value: unknown): value is AudioCue {
  return typeof value === 'string' && Object.hasOwn(AUDIO_CUES, value);
}

function finiteNumberInRange(value: unknown, min: number, max: number) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function audioPlaybackOptions(value: unknown): value is AudioPlaybackOptions {
  return (
    record(value) &&
    (value.gain === undefined || finiteNumberInRange(value.gain, 0, 4)) &&
    (value.playbackRate === undefined ||
      finiteNumberInRange(value.playbackRate, 0.25, 4)) &&
    (value.pan === undefined || finiteNumberInRange(value.pan, -1, 1)) &&
    (value.sourceIndex === undefined ||
      (typeof value.sourceIndex === 'number' &&
        Number.isInteger(value.sourceIndex) &&
        finiteNumberInRange(value.sourceIndex, 0, 255)))
  );
}

function audioPlaybackMessage(
  value: unknown,
  channel: typeof EXTENSION_CHANNEL | typeof OFFSCREEN_AUDIO_CHANNEL,
) {
  if (
    !record(value) ||
    value.channel !== channel ||
    normalizeAudioSettings(value.settings) === null
  ) {
    return false;
  }
  switch (value.type) {
    case 'audio-playback-prepare':
      return (
        Array.isArray(value.cues) &&
        value.cues.length > 0 &&
        value.cues.length <= Object.keys(AUDIO_CUES).length &&
        value.cues.every(audioCue)
      );
    case 'audio-playback-play':
      return (
        typeof value.requestId === 'string' &&
        value.requestId.length > 0 &&
        value.requestId.length <= 128 &&
        audioCue(value.cue) &&
        audioPlaybackOptions(value.options)
      );
    case 'audio-playback-settings-sync':
      return true;
    default:
      return false;
  }
}

export function audioPlaybackRequest(
  value: unknown,
): value is AudioPlaybackRequest {
  return audioPlaybackMessage(value, EXTENSION_CHANNEL);
}

export function offscreenAudioCommand(
  value: unknown,
): value is OffscreenAudioCommand {
  return audioPlaybackMessage(value, OFFSCREEN_AUDIO_CHANNEL);
}

export function offscreenAudioPlaybackResult(
  value: unknown,
): value is OffscreenAudioPlaybackResult {
  if (
    !record(value) ||
    value.channel !== OFFSCREEN_AUDIO_CHANNEL ||
    value.type !== 'audio-playback-result' ||
    typeof value.requestId !== 'string' ||
    value.requestId.length === 0 ||
    value.requestId.length > 128 ||
    !audioCue(value.cue) ||
    !record(value.playback)
  ) {
    return false;
  }
  if (
    value.playback.result === 'playing' ||
    value.playback.result === 'muted' ||
    value.playback.result === 'cooldown' ||
    value.playback.result === 'destroyed'
  ) {
    return true;
  }
  return (
    value.playback.result === 'rejected' &&
    typeof value.playback.error === 'string' &&
    value.playback.error.length <= 2_048
  );
}
