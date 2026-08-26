import type {
  AiSpeechRecognitionController,
  AiSpeechRecognitionListener,
  AiSpeechRecognitionState,
} from '../../ai/domain/types';
import {
  type VolcengineSpeechAuthorization,
  VolcengineSpeechSession,
} from './volcengine-speech-session';

export type SpeechAuthorizationGateway = {
  open(): Promise<VolcengineSpeechAuthorization>;
  close(sessionId: string): Promise<void>;
};

function decodeSpeechAudio(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export class ExtensionSpeechRecognitionController
  implements AiSpeechRecognitionController
{
  private readonly listeners = new Set<AiSpeechRecognitionListener>();
  private active: {
    session: VolcengineSpeechSession;
    authorizationId: string | null;
    text: string;
  } | null = null;
  private state: AiSpeechRecognitionState = {
    status: 'idle',
    text: '',
  };
  private disposed = false;

  constructor(private readonly authorization: SpeechAuthorizationGateway) {}

  subscribeSpeech(listener: AiSpeechRecognitionListener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async startSpeechRecognition() {
    if (this.disposed) throw new Error('语音识别控制器已释放。');
    if (this.active) throw new Error('已有语音输入会话正在运行。');
    this.publish({ status: 'connecting', text: '' });
    let authorization: VolcengineSpeechAuthorization | null = null;
    let active:
      | {
          session: VolcengineSpeechSession;
          authorizationId: string | null;
          text: string;
        }
      | undefined;
    try {
      authorization = await this.authorization.open();
      const session = new VolcengineSpeechSession({
        onResult: (result) => {
          if (!active || this.active !== active) return;
          if (result.text) active.text = result.text;
          this.publish({
            status: result.final ? 'idle' : 'listening',
            text: active.text,
          });
          if (!result.final) return;
          this.active = null;
          active.session.close();
          void this.releaseAuthorization(active).catch(() => undefined);
        },
        onError: (error) => {
          if (!active || this.active !== active) return;
          this.active = null;
          active.session.close();
          void this.releaseAuthorization(active).catch(() => undefined);
          this.publish({
            status: 'error',
            text: active.text,
            error: error.message,
          });
        },
        onClosed: () => {
          if (!active || this.active !== active) return;
          this.active = null;
          void this.releaseAuthorization(active).catch(() => undefined);
          this.publish({ status: 'idle', text: active.text });
        },
      });
      active = {
        session,
        authorizationId: authorization.sessionId,
        text: '',
      };
      this.active = active;
      await session.connect(authorization.endpoint);
      await this.releaseAuthorization(active);
      if (this.active === active) {
        this.publish({ status: 'listening', text: '' });
      }
    } catch (error) {
      if (active && this.active === active) this.active = null;
      active?.session.close();
      if (active) {
        await this.releaseAuthorization(active);
      } else if (authorization) {
        await this.authorization.close(authorization.sessionId);
      }
      const message = error instanceof Error ? error.message : String(error);
      this.publish({ status: 'error', text: '', error: message });
      throw error;
    }
  }

  async sendSpeechAudio(pcmBase64: string) {
    const active = this.active;
    if (!active) throw new Error('语音输入会话已经失效。');
    await active.session.sendAudio(decodeSpeechAudio(pcmBase64));
  }

  async stopSpeechRecognition() {
    const active = this.active;
    if (!active) return;
    this.publish({ status: 'stopping', text: active.text });
    await active.session.finish();
  }

  async cancelSpeechRecognition() {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.session.close();
    await this.releaseAuthorization(active);
    this.publish({ status: 'idle', text: active.text });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const active = this.active;
    this.active = null;
    active?.session.close();
    if (active) void this.releaseAuthorization(active).catch(() => undefined);
    this.listeners.clear();
  }

  private publish(state: AiSpeechRecognitionState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  private async releaseAuthorization(active: {
    authorizationId: string | null;
  }) {
    const sessionId = active.authorizationId;
    if (!sessionId) return;
    active.authorizationId = null;
    await this.authorization.close(sessionId);
  }
}
