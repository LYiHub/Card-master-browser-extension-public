import { describe, expect, it } from 'vitest';

import {
  GAMEPAD_SPEECH_CHANNEL,
  gamepadSpeechCaptureCommand,
  gamepadSpeechCaptureEvent,
  OFFSCREEN_SPEECH_CHANNEL,
  offscreenSpeechCaptureCommand,
  offscreenSpeechCaptureEvent,
} from './speech-capture-protocol';

describe('speech capture protocol', () => {
  it('accepts bounded commands and audio events on their exact channels', () => {
    expect(
      gamepadSpeechCaptureCommand({
        channel: GAMEPAD_SPEECH_CHANNEL,
        type: 'speech-capture-prepare',
        captureId: 'capture-1',
      }),
    ).toBe(true);
    expect(
      offscreenSpeechCaptureCommand({
        channel: OFFSCREEN_SPEECH_CHANNEL,
        type: 'speech-capture-finish',
        captureId: 'capture-1',
      }),
    ).toBe(true);
    expect(
      gamepadSpeechCaptureEvent({
        channel: GAMEPAD_SPEECH_CHANNEL,
        type: 'speech-capture-audio',
        captureId: 'capture-1',
        pcmBase64: 'AAECAw==',
      }),
    ).toBe(true);
    expect(
      offscreenSpeechCaptureEvent({
        channel: OFFSCREEN_SPEECH_CHANNEL,
        type: 'speech-capture-error',
        captureId: 'capture-1',
        error: 'permission denied',
      }),
    ).toBe(true);
  });

  it('rejects cross-channel and unbounded payloads', () => {
    expect(
      gamepadSpeechCaptureCommand({
        channel: OFFSCREEN_SPEECH_CHANNEL,
        type: 'speech-capture-start',
        captureId: 'capture-1',
      }),
    ).toBe(false);
    expect(
      gamepadSpeechCaptureEvent({
        channel: GAMEPAD_SPEECH_CHANNEL,
        type: 'speech-capture-audio',
        captureId: 'capture-1',
        pcmBase64: 'a'.repeat(64 * 1024 + 1),
      }),
    ).toBe(false);
  });
});
