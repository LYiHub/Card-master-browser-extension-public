import type { AiSpeechRecognitionState } from '../../ai/domain/types';

export const SPEECH_RECOGNITION_PORT = 'card-master:speech-recognition';
export const OFFSCREEN_SPEECH_RECOGNITION_CHANNEL =
  'card-master:offscreen-speech-recognition';

export type SpeechRecognitionCommand =
  | { type: 'start' }
  | { type: 'audio'; pcmBase64: string }
  | { type: 'stop' }
  | { type: 'cancel' };

export type SpeechRecognitionEvent = {
  type: 'state';
  state: AiSpeechRecognitionState;
};

export type OffscreenSpeechRecognitionCommand =
  | {
      channel: typeof OFFSCREEN_SPEECH_RECOGNITION_CHANNEL;
      type: 'start';
      recognitionId: string;
      endpoint: string;
    }
  | ({
      channel: typeof OFFSCREEN_SPEECH_RECOGNITION_CHANNEL;
      recognitionId: string;
    } & Exclude<SpeechRecognitionCommand, { type: 'start' }>);

export type OffscreenSpeechRecognitionEvent = {
  channel: typeof OFFSCREEN_SPEECH_RECOGNITION_CHANNEL;
  type: 'state';
  recognitionId: string;
  state: AiSpeechRecognitionState;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function recognitionId(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function speechRecognitionState(
  value: unknown,
): value is AiSpeechRecognitionState {
  if (!record(value) || typeof value.text !== 'string') return false;
  return (
    value.status === 'idle' ||
    value.status === 'connecting' ||
    value.status === 'listening' ||
    value.status === 'stopping' ||
    (value.status === 'error' && typeof value.error === 'string')
  );
}

export function speechRecognitionCommand(
  value: unknown,
): value is SpeechRecognitionCommand {
  if (!record(value)) return false;
  if (
    value.type === 'start' ||
    value.type === 'stop' ||
    value.type === 'cancel'
  ) {
    return true;
  }
  return (
    value.type === 'audio' &&
    typeof value.pcmBase64 === 'string' &&
    value.pcmBase64.length > 0 &&
    value.pcmBase64.length <= 64 * 1024
  );
}

export function offscreenSpeechRecognitionCommand(
  value: unknown,
): value is OffscreenSpeechRecognitionCommand {
  if (
    !record(value) ||
    value.channel !== OFFSCREEN_SPEECH_RECOGNITION_CHANNEL ||
    !recognitionId(value.recognitionId)
  ) {
    return false;
  }
  if (value.type === 'start') {
    return typeof value.endpoint === 'string' && value.endpoint.length <= 2_048;
  }
  return speechRecognitionCommand(value);
}

export function offscreenSpeechRecognitionEvent(
  value: unknown,
): value is OffscreenSpeechRecognitionEvent {
  return (
    record(value) &&
    value.channel === OFFSCREEN_SPEECH_RECOGNITION_CHANNEL &&
    value.type === 'state' &&
    recognitionId(value.recognitionId) &&
    speechRecognitionState(value.state)
  );
}
