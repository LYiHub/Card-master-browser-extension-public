export const OFFSCREEN_SPEECH_CHANNEL = 'card-master:offscreen-speech';
export const GAMEPAD_SPEECH_CHANNEL = 'card-master:gamepad-speech';
export const GAMEPAD_SPEECH_CAPTURE_PORT =
  'card-master:gamepad-speech-capture-port';

type SpeechCaptureCommandType =
  | 'speech-capture-prepare'
  | 'speech-capture-start'
  | 'speech-capture-finish'
  | 'speech-capture-cancel';

export type SpeechCaptureEventPayload =
  | { type: 'speech-capture-ready' }
  | { type: 'speech-capture-audio'; pcmBase64: string }
  | { type: 'speech-capture-finished' }
  | { type: 'speech-capture-error'; error: string }
  | { type: 'speech-capture-unsupported' };

export type GamepadSpeechCaptureCommand = {
  channel: typeof GAMEPAD_SPEECH_CHANNEL;
  type: SpeechCaptureCommandType;
  captureId: string;
};

export type OffscreenSpeechCaptureCommand = Omit<
  GamepadSpeechCaptureCommand,
  'channel'
> & {
  channel: typeof OFFSCREEN_SPEECH_CHANNEL;
};

export type GamepadSpeechCaptureEvent = SpeechCaptureEventPayload & {
  channel: typeof GAMEPAD_SPEECH_CHANNEL;
  captureId: string;
};

export type OffscreenSpeechCaptureEvent = SpeechCaptureEventPayload & {
  channel: typeof OFFSCREEN_SPEECH_CHANNEL;
  captureId: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function captureId(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function captureCommand(
  value: unknown,
  channel: typeof GAMEPAD_SPEECH_CHANNEL | typeof OFFSCREEN_SPEECH_CHANNEL,
) {
  return (
    record(value) &&
    value.channel === channel &&
    captureId(value.captureId) &&
    (value.type === 'speech-capture-prepare' ||
      value.type === 'speech-capture-start' ||
      value.type === 'speech-capture-finish' ||
      value.type === 'speech-capture-cancel')
  );
}

function captureEvent(
  value: unknown,
  channel: typeof GAMEPAD_SPEECH_CHANNEL | typeof OFFSCREEN_SPEECH_CHANNEL,
) {
  if (
    !record(value) ||
    value.channel !== channel ||
    !captureId(value.captureId)
  ) {
    return false;
  }
  switch (value.type) {
    case 'speech-capture-ready':
    case 'speech-capture-finished':
    case 'speech-capture-unsupported':
      return true;
    case 'speech-capture-audio':
      return (
        typeof value.pcmBase64 === 'string' &&
        value.pcmBase64.length > 0 &&
        value.pcmBase64.length <= 64 * 1024
      );
    case 'speech-capture-error':
      return (
        typeof value.error === 'string' &&
        value.error.length > 0 &&
        value.error.length <= 2_048
      );
    default:
      return false;
  }
}

export function gamepadSpeechCaptureCommand(
  value: unknown,
): value is GamepadSpeechCaptureCommand {
  return captureCommand(value, GAMEPAD_SPEECH_CHANNEL);
}

export function offscreenSpeechCaptureCommand(
  value: unknown,
): value is OffscreenSpeechCaptureCommand {
  return captureCommand(value, OFFSCREEN_SPEECH_CHANNEL);
}

export function gamepadSpeechCaptureEvent(
  value: unknown,
): value is GamepadSpeechCaptureEvent {
  return captureEvent(value, GAMEPAD_SPEECH_CHANNEL);
}

export function offscreenSpeechCaptureEvent(
  value: unknown,
): value is OffscreenSpeechCaptureEvent {
  return captureEvent(value, OFFSCREEN_SPEECH_CHANNEL);
}
