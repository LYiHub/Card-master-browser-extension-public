import type { SpeechServiceProbe } from '../../ai/domain/types';
import type { AudioPlaybackOutcome } from '../../audio/AudioDirector';
import type { ExtensionAiServices } from './ai-services';
import type { ExtensionBackgroundApi, ExtensionPort } from './api';
import {
  type AudioPlaybackRequest,
  OFFSCREEN_AUDIO_CHANNEL,
  OFFSCREEN_AUDIO_PORT,
  type OffscreenAudioCommand,
  offscreenAudioPlaybackResult,
} from './audio-playback-protocol';
import {
  GAMEPAD_SPEECH_CAPTURE_PORT,
  GAMEPAD_SPEECH_CHANNEL,
  type GamepadSpeechCaptureCommand,
  gamepadSpeechCaptureCommand,
  OFFSCREEN_SPEECH_CHANNEL,
  type OffscreenSpeechCaptureCommand,
  offscreenSpeechCaptureEvent,
} from './speech-capture-protocol';
import {
  OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
  type OffscreenSpeechRecognitionCommand,
  type OffscreenSpeechRecognitionEvent,
  offscreenSpeechRecognitionEvent,
  SPEECH_RECOGNITION_PORT,
  type SpeechRecognitionCommand,
  type SpeechRecognitionEvent,
  speechRecognitionCommand,
} from './speech-recognition-protocol';
import type { VolcengineSpeechAuthorizationCoordinator } from './volcengine-speech-session';

const OFFSCREEN_AUDIO_DOCUMENT = 'offscreen-audio.html';
const OFFSCREEN_AUDIO_JUSTIFICATION =
  '播放交互音效，并为手柄按住说话采集麦克风音频。';
const OFFSCREEN_CONNECTION_TIMEOUT_MS = 3_000;
const OFFSCREEN_PLAYBACK_TIMEOUT_MS = 3_000;
const SPEECH_RECOGNITION_TEST_TIMEOUT_MS = 6_000;

type PendingPlayback = {
  resolve: (playback: AudioPlaybackOutcome) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type ActiveSpeechRecognition = {
  recognitionId: string;
  client: ExtensionPort | null;
  authorization: VolcengineSpeechAuthorizationCoordinator;
  authorizationId: string | null;
  probe:
    | {
        startedAt: number;
        resolve: (probe: SpeechServiceProbe) => void;
        timeout: ReturnType<typeof setTimeout>;
      }
    | undefined;
};

export class OffscreenAudioCoordinator {
  private creation: Promise<void> | null = null;
  private port: ExtensionPort | null = null;
  private connectionWaiters = new Set<() => void>();
  private pendingPlaybacks = new Map<string, PendingPlayback>();
  private activeSpeechCapture: {
    captureId: string;
    client: ExtensionPort;
  } | null = null;
  private activeSpeechRecognition: ActiveSpeechRecognition | null = null;

  constructor(private readonly api: ExtensionBackgroundApi) {}

  connect(port: ExtensionPort) {
    if (port.name !== OFFSCREEN_AUDIO_PORT) return false;
    this.port = port;
    const handleMessage = (message: unknown) => {
      if (offscreenAudioPlaybackResult(message)) {
        const pending = this.pendingPlaybacks.get(message.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pendingPlaybacks.delete(message.requestId);
        pending.resolve(message.playback);
        return;
      }
      if (offscreenSpeechRecognitionEvent(message)) {
        this.handleSpeechRecognitionEvent(message);
        return;
      }
      if (!offscreenSpeechCaptureEvent(message)) return;
      const active = this.activeSpeechCapture;
      if (!active || active.captureId !== message.captureId) return;
      this.safePost(active.client, {
        ...message,
        channel: GAMEPAD_SPEECH_CHANNEL,
      });
      if (
        message.type === 'speech-capture-finished' ||
        message.type === 'speech-capture-error'
      ) {
        this.activeSpeechCapture = null;
      }
    };
    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(() => {
      port.onMessage.removeListener(handleMessage);
      if (this.port === port) this.port = null;
      this.rejectPendingPlaybacks(
        new Error('Offscreen audio connection closed.'),
      );
      const active = this.activeSpeechCapture;
      this.activeSpeechCapture = null;
      if (active) {
        this.safePost(active.client, {
          channel: GAMEPAD_SPEECH_CHANNEL,
          type: 'speech-capture-error',
          captureId: active.captureId,
          error: '扩展麦克风采集服务已经断开。',
        });
      }
      const recognition = this.activeSpeechRecognition;
      this.activeSpeechRecognition = null;
      if (recognition) {
        this.finishSpeechProbe(recognition, {
          ok: false,
          durationMs: performance.now() - (recognition.probe?.startedAt ?? 0),
          error: '扩展语音识别服务已经断开。',
        });
        this.safePost(recognition.client, {
          type: 'state',
          state: {
            status: 'error',
            text: '',
            error: '扩展语音识别服务已经断开。',
          },
        } satisfies SpeechRecognitionEvent);
        void this.releaseSpeechAuthorization(recognition);
      }
    });
    for (const resolve of this.connectionWaiters) resolve();
    this.connectionWaiters.clear();
    return true;
  }

  connectSpeechRecognitionClient(
    port: ExtensionPort,
    services: ExtensionAiServices,
    authorization: VolcengineSpeechAuthorizationCoordinator,
  ) {
    if (port.name !== SPEECH_RECOGNITION_PORT) return false;
    let queue = Promise.resolve();
    let connected = true;
    const handleMessage = (message: unknown) => {
      if (!speechRecognitionCommand(message)) return;
      queue = queue
        .then(async () => {
          switch (message.type) {
            case 'start': {
              const config = await services.readSpeechService();
              if (!connected) return;
              await this.startSpeechRecognition(
                port,
                config.apiKey,
                authorization,
              );
              if (!connected) this.disconnectSpeechRecognitionClient(port);
              return;
            }
            case 'audio':
            case 'stop':
            case 'cancel':
              await this.forwardSpeechRecognitionCommand(port, message);
              return;
          }
        })
        .catch((error) => {
          this.safePost(port, {
            type: 'state',
            state: {
              status: 'error',
              text: '',
              error: error instanceof Error ? error.message : String(error),
            },
          } satisfies SpeechRecognitionEvent);
        });
    };
    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(() => {
      connected = false;
      port.onMessage.removeListener(handleMessage);
      this.disconnectSpeechRecognitionClient(port);
    });
    return true;
  }

  async testSpeechRecognition(
    apiKey: string,
    authorization: VolcengineSpeechAuthorizationCoordinator,
  ): Promise<SpeechServiceProbe> {
    const startedAt = performance.now();
    try {
      return await new Promise<SpeechServiceProbe>((resolve) => {
        const begin = async () => {
          if (this.activeSpeechRecognition) {
            resolve({
              ok: false,
              durationMs: performance.now() - startedAt,
              error: '已有语音识别会话正在运行，请结束后再测试。',
            });
            return;
          }
          if (!this.supported()) {
            resolve({
              ok: false,
              durationMs: performance.now() - startedAt,
              error: '当前浏览器不支持扩展后台语音识别。',
            });
            return;
          }
          await this.ensureDocument();
          const access = await authorization.open(apiKey);
          const recognitionId = crypto.randomUUID();
          const active: ActiveSpeechRecognition = {
            recognitionId,
            client: null,
            authorization,
            authorizationId: access.sessionId,
            probe: {
              startedAt,
              resolve,
              timeout: setTimeout(() => {
                if (this.activeSpeechRecognition !== active) return;
                this.activeSpeechRecognition = null;
                this.cancelOffscreenSpeechRecognition(recognitionId);
                void this.releaseSpeechAuthorization(active);
                resolve({
                  ok: false,
                  durationMs: performance.now() - startedAt,
                  error: '语音识别连接测试超时。',
                });
              }, SPEECH_RECOGNITION_TEST_TIMEOUT_MS),
            },
          };
          this.activeSpeechRecognition = active;
          try {
            this.postSpeechRecognition({
              channel: OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
              type: 'start',
              recognitionId,
              endpoint: access.endpoint,
            });
          } catch (error) {
            this.activeSpeechRecognition = null;
            await this.releaseSpeechAuthorization(active);
            this.finishSpeechProbe(active, {
              ok: false,
              durationMs: performance.now() - startedAt,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        };
        void begin().catch((error) => {
          resolve({
            ok: false,
            durationMs: performance.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      });
    } catch (error) {
      return {
        ok: false,
        durationMs: performance.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  connectSpeechClient(port: ExtensionPort) {
    if (port.name !== GAMEPAD_SPEECH_CAPTURE_PORT) return false;
    let queue = Promise.resolve();
    const handleMessage = (message: unknown) => {
      if (!gamepadSpeechCaptureCommand(message)) return;
      queue = queue
        .then(() => this.handleSpeechCommand(port, message))
        .catch((error) => {
          this.safePost(port, {
            channel: GAMEPAD_SPEECH_CHANNEL,
            type: 'speech-capture-error',
            captureId: message.captureId,
            error: error instanceof Error ? error.message : String(error),
          });
          if (this.activeSpeechCapture?.client === port) {
            this.activeSpeechCapture = null;
          }
        });
    };
    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(() => {
      port.onMessage.removeListener(handleMessage);
      const active = this.activeSpeechCapture;
      if (!active || active.client !== port) return;
      this.activeSpeechCapture = null;
      if (this.port) {
        this.postSpeech({
          channel: OFFSCREEN_SPEECH_CHANNEL,
          type: 'speech-capture-cancel',
          captureId: active.captureId,
        });
      }
    });
    return true;
  }

  async handle(request: AudioPlaybackRequest) {
    if (!this.supported()) return { supported: false };
    await this.ensureDocument();
    const { channel: _channel, ...payload } = request;
    const command = {
      ...payload,
      channel: OFFSCREEN_AUDIO_CHANNEL,
    } as OffscreenAudioCommand;
    if (request.type === 'audio-playback-play') {
      const playback = await this.forwardPlayback(command, request.requestId);
      return { supported: true, playback };
    }
    this.post(command);
    return { supported: true };
  }

  private supported() {
    return Boolean(
      this.api.offscreen?.createDocument && this.api.runtime.getContexts,
    );
  }

  private async ensureDocument() {
    if (this.port) return;
    if (this.creation) return this.creation;
    this.creation = this.createDocumentIfMissing().finally(() => {
      this.creation = null;
    });
    return this.creation;
  }

  private async createDocumentIfMissing() {
    const getContexts = this.api.runtime.getContexts;
    const createDocument = this.api.offscreen?.createDocument;
    if (!getContexts || !createDocument) return;
    const documentUrl = this.api.runtime.getURL(OFFSCREEN_AUDIO_DOCUMENT);
    const contexts = await getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [documentUrl],
    });
    if (contexts.length === 0) {
      await createDocument({
        url: OFFSCREEN_AUDIO_DOCUMENT,
        reasons: ['AUDIO_PLAYBACK', 'USER_MEDIA'],
        justification: OFFSCREEN_AUDIO_JUSTIFICATION,
      });
    }
    await this.waitForConnection();
  }

  private post(command: OffscreenAudioCommand) {
    if (!this.port) {
      throw new Error('Offscreen audio connection is unavailable.');
    }
    this.port.postMessage(command);
  }

  private async handleSpeechCommand(
    client: ExtensionPort,
    command: GamepadSpeechCaptureCommand,
  ) {
    if (command.type === 'speech-capture-prepare') {
      if (!this.supported()) {
        this.safePost(client, {
          channel: GAMEPAD_SPEECH_CHANNEL,
          type: 'speech-capture-unsupported',
          captureId: command.captureId,
        });
        return;
      }
      const active = this.activeSpeechCapture;
      if (
        active &&
        (active.client !== client || active.captureId !== command.captureId)
      ) {
        throw new Error('已有页面正在使用麦克风语音输入。');
      }
      this.activeSpeechCapture = {
        captureId: command.captureId,
        client,
      };
      await this.ensureDocument();
      this.postSpeech({
        ...command,
        channel: OFFSCREEN_SPEECH_CHANNEL,
      });
      return;
    }
    const active = this.activeSpeechCapture;
    if (
      !active ||
      active.client !== client ||
      active.captureId !== command.captureId
    ) {
      throw new Error('麦克风采集会话已经失效。');
    }
    this.postSpeech({
      ...command,
      channel: OFFSCREEN_SPEECH_CHANNEL,
    });
  }

  private postSpeech(command: OffscreenSpeechCaptureCommand) {
    if (!this.port) {
      throw new Error('Offscreen media connection is unavailable.');
    }
    this.port.postMessage(command);
  }

  private async startSpeechRecognition(
    client: ExtensionPort,
    apiKey: string,
    authorization: VolcengineSpeechAuthorizationCoordinator,
  ) {
    if (this.activeSpeechRecognition) {
      throw new Error('已有语音识别会话正在运行。');
    }
    if (!this.supported()) {
      throw new Error('当前浏览器不支持扩展后台语音识别。');
    }
    await this.ensureDocument();
    const access = await authorization.open(apiKey);
    const active: ActiveSpeechRecognition = {
      recognitionId: crypto.randomUUID(),
      client,
      authorization,
      authorizationId: access.sessionId,
      probe: undefined,
    };
    this.activeSpeechRecognition = active;
    try {
      this.postSpeechRecognition({
        channel: OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
        type: 'start',
        recognitionId: active.recognitionId,
        endpoint: access.endpoint,
      });
    } catch (error) {
      this.activeSpeechRecognition = null;
      await this.releaseSpeechAuthorization(active);
      throw error;
    }
  }

  private async forwardSpeechRecognitionCommand(
    client: ExtensionPort,
    command: Exclude<SpeechRecognitionCommand, { type: 'start' }>,
  ) {
    const active = this.activeSpeechRecognition;
    if (!active || active.client !== client) {
      throw new Error('语音识别会话已经失效。');
    }
    this.postSpeechRecognition({
      ...command,
      channel: OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
      recognitionId: active.recognitionId,
    });
  }

  private postSpeechRecognition(command: OffscreenSpeechRecognitionCommand) {
    if (!this.port) {
      throw new Error('Offscreen speech recognition is unavailable.');
    }
    this.port.postMessage(command);
  }

  private handleSpeechRecognitionEvent(event: OffscreenSpeechRecognitionEvent) {
    const active = this.activeSpeechRecognition;
    if (!active || active.recognitionId !== event.recognitionId) return;
    this.safePost(active.client, {
      type: 'state',
      state: event.state,
    } satisfies SpeechRecognitionEvent);
    if (event.state.status === 'listening') {
      void this.releaseSpeechAuthorization(active);
      if (!active.probe) return;
      this.activeSpeechRecognition = null;
      this.cancelOffscreenSpeechRecognition(active.recognitionId);
      this.finishSpeechProbe(active, {
        ok: true,
        durationMs: performance.now() - active.probe.startedAt,
      });
      return;
    }
    if (event.state.status !== 'idle' && event.state.status !== 'error') return;
    this.activeSpeechRecognition = null;
    void this.releaseSpeechAuthorization(active);
    if (active.probe) {
      this.finishSpeechProbe(active, {
        ok: false,
        durationMs: performance.now() - active.probe.startedAt,
        error: event.state.error || '语音识别连接在完成测试前意外结束。',
      });
    }
  }

  private cancelOffscreenSpeechRecognition(recognitionId: string) {
    if (!this.port) return;
    try {
      this.postSpeechRecognition({
        channel: OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
        type: 'cancel',
        recognitionId,
      });
    } catch {
      // The offscreen document has already disconnected.
    }
  }

  private disconnectSpeechRecognitionClient(client: ExtensionPort) {
    const active = this.activeSpeechRecognition;
    if (!active || active.client !== client) return;
    this.activeSpeechRecognition = null;
    this.cancelOffscreenSpeechRecognition(active.recognitionId);
    void this.releaseSpeechAuthorization(active);
  }

  private async releaseSpeechAuthorization(active: ActiveSpeechRecognition) {
    const authorizationId = active.authorizationId;
    if (!authorizationId) return;
    active.authorizationId = null;
    await active.authorization.close(authorizationId);
  }

  private finishSpeechProbe(
    active: ActiveSpeechRecognition,
    probe: SpeechServiceProbe,
  ) {
    if (!active.probe) return;
    clearTimeout(active.probe.timeout);
    const resolve = active.probe.resolve;
    active.probe = undefined;
    resolve(probe);
  }

  private safePost(port: ExtensionPort | null, message: unknown) {
    if (!port) return;
    try {
      port.postMessage(message);
    } catch {
      // The target context has already disconnected.
    }
  }

  private forwardPlayback(command: OffscreenAudioCommand, requestId: string) {
    return new Promise<AudioPlaybackOutcome>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingPlaybacks.delete(requestId);
        reject(
          new Error('Offscreen audio playback acknowledgement timed out.'),
        );
      }, OFFSCREEN_PLAYBACK_TIMEOUT_MS);
      this.pendingPlaybacks.set(requestId, { resolve, reject, timeout });
      try {
        this.post(command);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingPlaybacks.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private waitForConnection() {
    if (this.port) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const connected = () => {
        clearTimeout(timeout);
        this.connectionWaiters.delete(connected);
        resolve();
      };
      const timeout = setTimeout(() => {
        this.connectionWaiters.delete(connected);
        reject(new Error('Offscreen audio connection timed out.'));
      }, OFFSCREEN_CONNECTION_TIMEOUT_MS);
      this.connectionWaiters.add(connected);
    });
  }

  private rejectPendingPlaybacks(error: Error) {
    for (const pending of this.pendingPlaybacks.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingPlaybacks.clear();
  }
}
