import {
  SpeechAudioCapture,
  type SpeechAudioCaptureSession,
} from '../../ai/infrastructure/speech-audio-capture';
import type { GamepadExtensionApi } from './gamepad-extension-client';
import {
  GAMEPAD_SPEECH_CAPTURE_PORT,
  GAMEPAD_SPEECH_CHANNEL,
  type GamepadSpeechCaptureCommand,
  gamepadSpeechCaptureEvent,
} from './speech-capture-protocol';

const CAPTURE_CONNECTION_TIMEOUT_MS = 5_000;
const CAPTURE_FINISH_TIMEOUT_MS = 2_000;

class OffscreenSpeechCaptureUnsupportedError extends Error {}

function command(
  captureId: string,
  type: GamepadSpeechCaptureCommand['type'],
): GamepadSpeechCaptureCommand {
  return {
    channel: GAMEPAD_SPEECH_CHANNEL,
    type,
    captureId,
  };
}

class OffscreenSpeechCapture implements SpeechAudioCaptureSession {
  private audioQueue: Promise<void> = Promise.resolve();
  private closed = false;
  private sendAudio: ((pcmBase64: string) => Promise<void>) | null = null;
  private onError: ((error: unknown) => Promise<void> | void) | null = null;
  private finishPromise: Promise<void> | null = null;
  private finishResolve: (() => void) | null = null;
  private finishReject: ((error: Error) => void) | null = null;

  private constructor(
    private readonly port: chrome.runtime.Port,
    private readonly captureId: string,
  ) {
    port.onMessage.addListener(this.handleMessage);
    port.onDisconnect.addListener(this.handleDisconnect);
  }

  static create(api: GamepadExtensionApi) {
    const port = api.runtime.connect({ name: GAMEPAD_SPEECH_CAPTURE_PORT });
    const capture = new OffscreenSpeechCapture(port, crypto.randomUUID());
    return capture.prepare();
  }

  start(
    sendAudio: (pcmBase64: string) => Promise<void>,
    onError: (error: unknown) => Promise<void> | void,
  ) {
    if (this.closed || this.sendAudio) return;
    this.sendAudio = sendAudio;
    this.onError = onError;
    this.port.postMessage(command(this.captureId, 'speech-capture-start'));
  }

  async finish() {
    if (this.closed) return;
    if (!this.finishPromise) {
      this.finishPromise = new Promise<void>((resolve, reject) => {
        this.finishResolve = resolve;
        this.finishReject = reject;
        const timeout = window.setTimeout(() => {
          if (!this.finishReject) return;
          const pendingReject = this.finishReject;
          this.finishResolve = null;
          this.finishReject = null;
          pendingReject(new Error('麦克风采集未能及时结束。'));
        }, CAPTURE_FINISH_TIMEOUT_MS);
        const finish = this.finishResolve;
        this.finishResolve = () => {
          window.clearTimeout(timeout);
          finish?.();
        };
      });
      this.port.postMessage(command(this.captureId, 'speech-capture-finish'));
    }
    try {
      await this.finishPromise;
      await this.audioQueue;
    } finally {
      this.disconnect();
    }
  }

  async close() {
    if (this.closed) return;
    try {
      this.port.postMessage(command(this.captureId, 'speech-capture-cancel'));
    } catch {
      // The extension context has already closed the port.
    }
    this.disconnect();
  }

  private prepare() {
    return new Promise<OffscreenSpeechCapture>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        this.disconnect();
        reject(new Error('扩展麦克风采集服务连接超时。'));
      }, CAPTURE_CONNECTION_TIMEOUT_MS);
      const handleReady = (message: unknown) => {
        if (
          !gamepadSpeechCaptureEvent(message) ||
          message.captureId !== this.captureId
        ) {
          return;
        }
        if (message.type === 'speech-capture-ready') {
          cleanup();
          resolve(this);
          return;
        }
        if (message.type === 'speech-capture-unsupported') {
          cleanup();
          this.disconnect();
          reject(
            new OffscreenSpeechCaptureUnsupportedError(
              '当前浏览器不支持扩展离屏麦克风采集。',
            ),
          );
          return;
        }
        if (message.type === 'speech-capture-error') {
          cleanup();
          this.disconnect();
          reject(new Error(message.error));
        }
      };
      const handleDisconnect = () => {
        cleanup();
        reject(new Error('扩展麦克风采集服务已经断开。'));
      };
      const cleanup = () => {
        window.clearTimeout(timeout);
        this.port.onMessage.removeListener(handleReady);
        this.port.onDisconnect.removeListener(handleDisconnect);
      };
      this.port.onMessage.addListener(handleReady);
      this.port.onDisconnect.addListener(handleDisconnect);
      this.port.postMessage(command(this.captureId, 'speech-capture-prepare'));
    });
  }

  private readonly handleMessage = (message: unknown) => {
    if (
      !gamepadSpeechCaptureEvent(message) ||
      message.captureId !== this.captureId
    ) {
      return;
    }
    if (message.type === 'speech-capture-audio') {
      if (!this.sendAudio) return;
      this.audioQueue = this.audioQueue
        .then(() => this.sendAudio?.(message.pcmBase64))
        .then(() => undefined)
        .catch((error) => this.onError?.(error));
      return;
    }
    if (message.type === 'speech-capture-finished') {
      this.finishResolve?.();
      this.finishResolve = null;
      this.finishReject = null;
      return;
    }
    if (message.type === 'speech-capture-error') {
      const error = new Error(message.error);
      this.finishReject?.(error);
      this.finishResolve = null;
      this.finishReject = null;
      void this.onError?.(error);
    }
  };

  private readonly handleDisconnect = () => {
    if (this.closed) return;
    const error = new Error('扩展麦克风采集服务已经断开。');
    this.finishReject?.(error);
    this.finishResolve = null;
    this.finishReject = null;
    void this.onError?.(error);
    this.closed = true;
  };

  private disconnect() {
    if (this.closed) return;
    this.closed = true;
    this.port.onMessage.removeListener(this.handleMessage);
    this.port.onDisconnect.removeListener(this.handleDisconnect);
    try {
      this.port.disconnect();
    } catch {
      // A reloaded extension has already destroyed the stale port.
    }
  }
}

export async function createExtensionSpeechCapture(
  api: GamepadExtensionApi,
): Promise<SpeechAudioCaptureSession> {
  try {
    return await OffscreenSpeechCapture.create(api);
  } catch (error) {
    if (!(error instanceof OffscreenSpeechCaptureUnsupportedError)) throw error;
    return SpeechAudioCapture.create();
  }
}
