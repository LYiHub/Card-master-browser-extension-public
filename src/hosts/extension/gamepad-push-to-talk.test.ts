import { describe, expect, it, vi } from 'vitest';

import type {
  AiSpeechRecognitionListener,
  AiSpeechRecognitionState,
} from '../../ai/domain/types';
import type { SpeechAudioCaptureSession } from '../../ai/infrastructure/speech-audio-capture';
import type { EditableTextTarget } from './editable-text';
import { GamepadPushToTalkController } from './gamepad-push-to-talk';

function fakeSpeech() {
  let state: AiSpeechRecognitionState = { status: 'idle', text: '' };
  const listeners = new Set<AiSpeechRecognitionListener>();
  const publish = (next: AiSpeechRecognitionState) => {
    state = next;
    for (const listener of listeners) listener(next);
  };
  return {
    publish,
    controller: {
      subscribeSpeech: vi.fn((listener: AiSpeechRecognitionListener) => {
        listeners.add(listener);
        listener(state);
        return () => listeners.delete(listener);
      }),
      startSpeechRecognition: vi.fn(async () => {
        publish({ status: 'listening', text: '' });
      }),
      sendSpeechAudio: vi.fn(async () => undefined),
      stopSpeechRecognition: vi.fn(async () => {
        publish({ status: 'stopping', text: state.text });
        publish({ status: 'idle', text: '你好，世界' });
      }),
      cancelSpeechRecognition: vi.fn(async () => {
        publish({ status: 'idle', text: '' });
      }),
      dispose: vi.fn(),
    },
  };
}

function fakeCapture() {
  let sendAudio: ((pcmBase64: string) => Promise<void>) | null = null;
  const capture: SpeechAudioCaptureSession = {
    start: vi.fn((send) => {
      sendAudio = send;
    }),
    finish: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  return {
    capture,
    send: (pcmBase64: string) => sendAudio?.(pcmBase64),
  };
}

function fakeComposition() {
  return {
    update: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
  };
}

describe('GamepadPushToTalkController', () => {
  it('streams interim text and commits the final result exactly once', async () => {
    const target = { isConnected: true } as EditableTextTarget;
    const speech = fakeSpeech();
    const capture = fakeCapture();
    const composition = fakeComposition();
    const publish = vi.fn();
    const controller = new GamepadPushToTalkController({
      resolveTarget: () => target,
      createCapture: async () => capture.capture,
      createSpeech: () => speech.controller,
      createComposition: () => composition,
      publish,
    });

    expect(controller.start()).toBe(true);
    await vi.waitFor(() =>
      expect(speech.controller.startSpeechRecognition).toHaveBeenCalledOnce(),
    );
    await capture.send('AAECAw==');
    expect(speech.controller.sendSpeechAudio).toHaveBeenCalledWith('AAECAw==');
    speech.publish({ status: 'listening', text: '你好' });
    expect(composition.update).toHaveBeenCalledWith('你好');
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'listening',
        text: '你好',
      }),
    );

    expect(controller.finish()).toBe(true);
    await vi.waitFor(() =>
      expect(composition.commit).toHaveBeenCalledWith('你好，世界'),
    );
    expect(composition.update).toHaveBeenLastCalledWith('你好，世界');
    expect(composition.commit).toHaveBeenCalledOnce();
    expect(composition.cancel).not.toHaveBeenCalled();
    expect(capture.capture.finish).toHaveBeenCalledOnce();
    expect(speech.controller.stopSpeechRecognition).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('releases gamepad interaction as soon as recording finishes', async () => {
    const target = { isConnected: true } as EditableTextTarget;
    const speech = fakeSpeech();
    const capture = fakeCapture();
    const composition = fakeComposition();
    const controller = new GamepadPushToTalkController({
      resolveTarget: () => target,
      createCapture: async () => capture.capture,
      createSpeech: () => speech.controller,
      createComposition: () => composition,
      publish: vi.fn(),
    });

    expect(controller.start()).toBe(true);
    expect(controller.recording).toBe(true);
    await vi.waitFor(() =>
      expect(speech.controller.startSpeechRecognition).toHaveBeenCalledOnce(),
    );
    expect(controller.finish()).toBe(true);
    expect(controller.active).toBe(true);
    expect(controller.recording).toBe(false);
    controller.dispose();
  });

  it('does not start without an editable target', () => {
    const publish = vi.fn();
    const controller = new GamepadPushToTalkController({
      resolveTarget: () => null,
      createCapture: vi.fn(),
      createSpeech: vi.fn(),
      createComposition: vi.fn(),
      publish,
    });

    expect(controller.start()).toBe(false);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error: '先选择网页中的输入框，再按住说话。',
      }),
    );
    controller.dispose();
  });

  it('cancels without inserting text', async () => {
    const target = { isConnected: true } as EditableTextTarget;
    const speech = fakeSpeech();
    const capture = fakeCapture();
    const composition = fakeComposition();
    const controller = new GamepadPushToTalkController({
      resolveTarget: () => target,
      createCapture: async () => capture.capture,
      createSpeech: () => speech.controller,
      createComposition: () => composition,
      publish: vi.fn(),
    });

    controller.start();
    await vi.waitFor(() =>
      expect(speech.controller.startSpeechRecognition).toHaveBeenCalledOnce(),
    );
    expect(controller.cancel()).toBe(true);
    await vi.waitFor(() =>
      expect(speech.controller.cancelSpeechRecognition).toHaveBeenCalledOnce(),
    );
    expect(composition.cancel).toHaveBeenCalledOnce();
    expect(composition.commit).not.toHaveBeenCalled();
    controller.dispose();
  });

  it.each([
    [
      'synchronous failure',
      () => {
        throw new Error('extension context invalidated');
      },
    ],
    [
      'rejected promise',
      () => Promise.reject(new Error('extension context invalidated')),
    ],
  ])('finishes cancellation cleanup after a %s', async (_label, cancel) => {
    const target = { isConnected: true } as EditableTextTarget;
    const speech = fakeSpeech();
    speech.controller.cancelSpeechRecognition.mockImplementation(cancel);
    const capture = fakeCapture();
    const composition = fakeComposition();
    const controller = new GamepadPushToTalkController({
      resolveTarget: () => target,
      createCapture: async () => capture.capture,
      createSpeech: () => speech.controller,
      createComposition: () => composition,
      publish: vi.fn(),
    });

    controller.start();
    await vi.waitFor(() =>
      expect(speech.controller.startSpeechRecognition).toHaveBeenCalledOnce(),
    );
    expect(controller.cancel()).toBe(true);

    await vi.waitFor(() =>
      expect(speech.controller.dispose).toHaveBeenCalled(),
    );
    expect(capture.capture.close).toHaveBeenCalledOnce();
    expect(composition.cancel).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);
  });

  it('rolls back interim text when the target disconnects before finalization', async () => {
    const target = { isConnected: true } as EditableTextTarget;
    const speech = fakeSpeech();
    const capture = fakeCapture();
    const composition = fakeComposition();
    const controller = new GamepadPushToTalkController({
      resolveTarget: () => target,
      createCapture: async () => capture.capture,
      createSpeech: () => speech.controller,
      createComposition: () => composition,
      publish: vi.fn(),
    });

    controller.start();
    await vi.waitFor(() =>
      expect(speech.controller.startSpeechRecognition).toHaveBeenCalledOnce(),
    );
    speech.publish({ status: 'listening', text: '临时文本' });
    Object.defineProperty(target, 'isConnected', { value: false });
    controller.finish();

    await vi.waitFor(() => expect(composition.cancel).toHaveBeenCalledOnce());
    expect(composition.commit).not.toHaveBeenCalled();
    controller.dispose();
  });
});
