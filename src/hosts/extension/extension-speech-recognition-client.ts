import type {
  AiSpeechRecognitionController,
  AiSpeechRecognitionListener,
  AiSpeechRecognitionState,
} from '../../ai/domain/types';
import {
  SPEECH_RECOGNITION_PORT,
  type SpeechRecognitionCommand,
  type SpeechRecognitionEvent,
} from './speech-recognition-protocol';

type SpeechRecognitionExtensionApi = {
  runtime: {
    connect(connectInfo?: chrome.runtime.ConnectInfo): chrome.runtime.Port;
  };
};

export class ExtensionSpeechRecognitionClient
  implements AiSpeechRecognitionController
{
  private readonly listeners = new Set<AiSpeechRecognitionListener>();
  private readonly port: chrome.runtime.Port;
  private state: AiSpeechRecognitionState = { status: 'idle', text: '' };
  private disposed = false;

  constructor(api: SpeechRecognitionExtensionApi) {
    this.port = api.runtime.connect({ name: SPEECH_RECOGNITION_PORT });
    this.port.onMessage.addListener(this.handleMessage);
    this.port.onDisconnect.addListener(this.handleDisconnect);
  }

  subscribeSpeech(listener: AiSpeechRecognitionListener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  startSpeechRecognition() {
    return this.post({ type: 'start' });
  }

  sendSpeechAudio(pcmBase64: string) {
    return this.post({ type: 'audio', pcmBase64 });
  }

  stopSpeechRecognition() {
    return this.post({ type: 'stop' });
  }

  cancelSpeechRecognition() {
    return this.post({ type: 'cancel' });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const release of [
      () => this.port.onMessage.removeListener(this.handleMessage),
      () => this.port.onDisconnect.removeListener(this.handleDisconnect),
      () => this.port.disconnect(),
    ]) {
      try {
        release();
      } catch {
        // Extension reloads can invalidate the port before local teardown runs.
      }
    }
    this.listeners.clear();
  }

  private readonly handleMessage = (message: SpeechRecognitionEvent) => {
    if (message?.type !== 'state') return;
    this.publish(message.state);
  };

  private readonly handleDisconnect = () => {
    if (this.disposed) return;
    this.publish({
      status: 'error',
      text: this.state.text,
      error: '语音识别扩展通道已经断开。',
    });
  };

  private post(command: SpeechRecognitionCommand) {
    if (this.disposed) {
      return Promise.reject(new Error('语音识别控制器已释放。'));
    }
    try {
      this.port.postMessage(command);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private publish(state: AiSpeechRecognitionState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
