import {
  SpeechAudioCapture,
  type SpeechAudioCaptureSession,
} from '../../ai/infrastructure/speech-audio-capture';
import { MediaElementAudioPlayer } from '../../audio/MediaElementAudioPlayer';
import {
  OFFSCREEN_AUDIO_CHANNEL,
  OFFSCREEN_AUDIO_PORT,
  offscreenAudioCommand,
} from './audio-playback-protocol';
import {
  installExtensionContextBoundary,
  notifyExtensionContextInvalidated,
  onExtensionContextInvalidated,
  registerExtensionListener,
  reportExtensionFailure,
} from './diagnostics';
import { requireExtensionRuntimeApi } from './extension-runtime-api';
import { ExtensionSpeechRecognitionController } from './extension-speech-recognition';
import {
  OFFSCREEN_SPEECH_CHANNEL,
  type OffscreenSpeechCaptureCommand,
  offscreenSpeechCaptureCommand,
  type SpeechCaptureEventPayload,
} from './speech-capture-protocol';
import {
  OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
  type OffscreenSpeechRecognitionCommand,
  offscreenSpeechRecognitionCommand,
} from './speech-recognition-protocol';

const audio = new MediaElementAudioPlayer();
const runtime = requireExtensionRuntimeApi();
let speechCapture: SpeechAudioCaptureSession | null = null;
let speechCaptureId: string | null = null;
let speechQueue = Promise.resolve();
let speechRecognition:
  | {
      recognitionId: string;
      controller: ExtensionSpeechRecognitionController;
      unsubscribe: () => void;
    }
  | undefined;
let recognitionQueue = Promise.resolve();
let runtimeActive = true;
let reconnectTimer = 0;
let disconnectCurrentPort = () => {};
let removeContextInvalidation = () => {};
const removeContextBoundary = installExtensionContextBoundary();

function postSpeech(
  port: chrome.runtime.Port,
  event: SpeechCaptureEventPayload & { captureId: string },
) {
  if (!runtimeActive) return;
  port.postMessage({
    ...event,
    channel: OFFSCREEN_SPEECH_CHANNEL,
  });
}

async function closeSpeechCapture() {
  const capture = speechCapture;
  speechCapture = null;
  speechCaptureId = null;
  await capture?.close();
}

function closeSpeechRecognition() {
  const active = speechRecognition;
  speechRecognition = undefined;
  active?.unsubscribe();
  active?.controller.dispose();
}

async function handleSpeechRecognitionCommand(
  message: OffscreenSpeechRecognitionCommand,
  port: chrome.runtime.Port,
) {
  if (message.type === 'start') {
    closeSpeechRecognition();
    const controller = new ExtensionSpeechRecognitionController({
      open: async () => ({
        sessionId: message.recognitionId,
        endpoint: message.endpoint,
      }),
      close: async () => undefined,
    });
    let started = false;
    const active: {
      recognitionId: string;
      controller: ExtensionSpeechRecognitionController;
      unsubscribe: () => void;
    } = {
      recognitionId: message.recognitionId,
      controller,
      unsubscribe: () => undefined,
    };
    active.unsubscribe = controller.subscribeSpeech((state) => {
      if (!started || speechRecognition !== active) return;
      port.postMessage({
        channel: OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
        type: 'state',
        recognitionId: message.recognitionId,
        state,
      });
    });
    speechRecognition = active;
    started = true;
    await controller.startSpeechRecognition();
    if (!runtimeActive) closeSpeechRecognition();
    return;
  }
  const active = speechRecognition;
  if (!active || active.recognitionId !== message.recognitionId) {
    throw new Error('语音识别会话已经失效。');
  }
  switch (message.type) {
    case 'audio':
      await active.controller.sendSpeechAudio(message.pcmBase64);
      return;
    case 'stop':
      await active.controller.stopSpeechRecognition();
      return;
    case 'cancel':
      await active.controller.cancelSpeechRecognition();
      closeSpeechRecognition();
      return;
  }
}

async function handleSpeechCommand(
  message: OffscreenSpeechCaptureCommand,
  port: chrome.runtime.Port,
) {
  try {
    switch (message.type) {
      case 'speech-capture-prepare':
        await closeSpeechCapture();
        speechCapture = await SpeechAudioCapture.create();
        if (!runtimeActive) {
          await closeSpeechCapture();
          return;
        }
        speechCaptureId = message.captureId;
        postSpeech(port, {
          type: 'speech-capture-ready',
          captureId: message.captureId,
        });
        return;
      case 'speech-capture-start':
        if (!speechCapture || speechCaptureId !== message.captureId) {
          throw new Error('麦克风采集会话已经失效。');
        }
        speechCapture.start(
          async (pcmBase64) => {
            postSpeech(port, {
              type: 'speech-capture-audio',
              captureId: message.captureId,
              pcmBase64,
            });
          },
          async (error) => {
            postSpeech(port, {
              type: 'speech-capture-error',
              captureId: message.captureId,
              error: error instanceof Error ? error.message : String(error),
            });
            await closeSpeechCapture();
          },
        );
        return;
      case 'speech-capture-finish': {
        const capture = speechCapture;
        if (!capture || speechCaptureId !== message.captureId) {
          throw new Error('麦克风采集会话已经失效。');
        }
        speechCapture = null;
        speechCaptureId = null;
        await capture.finish();
        postSpeech(port, {
          type: 'speech-capture-finished',
          captureId: message.captureId,
        });
        return;
      }
      case 'speech-capture-cancel':
        await closeSpeechCapture();
        postSpeech(port, {
          type: 'speech-capture-finished',
          captureId: message.captureId,
        });
        return;
    }
  } catch (error) {
    await closeSpeechCapture();
    postSpeech(port, {
      type: 'speech-capture-error',
      captureId: message.captureId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCommand(message: unknown, port: chrome.runtime.Port) {
  if (!runtimeActive) return;
  if (offscreenSpeechRecognitionCommand(message)) {
    recognitionQueue = recognitionQueue
      .then(() => handleSpeechRecognitionCommand(message, port))
      .catch((error) => {
        if (message.type !== 'start') {
          port.postMessage({
            channel: OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
            type: 'state',
            recognitionId: message.recognitionId,
            state: {
              status: 'error',
              text: '',
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
        closeSpeechRecognition();
      });
    await recognitionQueue;
    return;
  }
  if (offscreenSpeechCaptureCommand(message)) {
    speechQueue = speechQueue.then(() => handleSpeechCommand(message, port));
    await speechQueue;
    return;
  }
  if (!offscreenAudioCommand(message)) return;
  audio.applySettings(message.settings);
  switch (message.type) {
    case 'audio-playback-prepare':
      audio.prepare(message.cues);
      return;
    case 'audio-playback-play': {
      const playback = await audio.play(message.cue, message.options);
      if (!runtimeActive) return;
      port.postMessage({
        channel: OFFSCREEN_AUDIO_CHANNEL,
        type: 'audio-playback-result',
        requestId: message.requestId,
        cue: message.cue,
        playback,
      });
      return;
    }
    case 'audio-playback-settings-sync':
      return;
  }
}

function runtimeAvailable() {
  try {
    return Boolean(runtime.id);
  } catch {
    return false;
  }
}

function dispose() {
  if (!runtimeActive) return;
  runtimeActive = false;
  window.clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  disconnectCurrentPort();
  disconnectCurrentPort = () => {};
  removeContextInvalidation();
  audio.destroy();
  void closeSpeechCapture().catch((error) =>
    reportExtensionFailure(
      'offscreen-audio',
      'speech-capture-dispose-failed',
      error,
    ),
  );
  closeSpeechRecognition();
  removeContextBoundary();
}

function scheduleReconnect() {
  if (!runtimeActive || reconnectTimer !== 0) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    connect();
  }, 50);
}

function connect() {
  if (!runtimeActive) return;
  let port: chrome.runtime.Port;
  try {
    port = runtime.connect({ name: OFFSCREEN_AUDIO_PORT });
  } catch (error) {
    if (notifyExtensionContextInvalidated(error) || !runtimeAvailable()) {
      dispose();
      return;
    }
    reportExtensionFailure('offscreen-audio', 'connect-failed', error);
    scheduleReconnect();
    return;
  }

  let disconnected = false;
  let removeMessageListener = () => {};
  let removeDisconnectListener = () => {};
  const cleanupPort = () => {
    if (disconnected) return;
    disconnected = true;
    removeMessageListener();
    removeDisconnectListener();
    try {
      port.disconnect();
    } catch (error) {
      notifyExtensionContextInvalidated(error);
    }
  };
  disconnectCurrentPort = cleanupPort;

  const handleMessage = (message: unknown) => {
    void handleCommand(message, port).catch((error) => {
      if (notifyExtensionContextInvalidated(error)) {
        dispose();
        return;
      }
      reportExtensionFailure('offscreen-audio', 'command-failed', error, {
        command:
          message && typeof message === 'object' && 'type' in message
            ? String(message.type)
            : 'unknown',
      });
    });
  };
  const handleDisconnect = () => {
    try {
      void (runtime as typeof chrome.runtime).lastError;
    } catch (error) {
      notifyExtensionContextInvalidated(error);
    }
    cleanupPort();
    if (disconnectCurrentPort === cleanupPort) {
      disconnectCurrentPort = () => {};
    }
    if (!runtimeActive) return;
    if (!runtimeAvailable()) {
      notifyExtensionContextInvalidated(
        new Error('Extension context invalidated.'),
      );
      dispose();
      return;
    }
    scheduleReconnect();
  };
  try {
    removeMessageListener = registerExtensionListener(
      port.onMessage,
      handleMessage,
    );
    removeDisconnectListener = registerExtensionListener(
      port.onDisconnect,
      handleDisconnect,
    );
  } catch (error) {
    cleanupPort();
    if (notifyExtensionContextInvalidated(error)) {
      dispose();
      return;
    }
    reportExtensionFailure(
      'offscreen-audio',
      'listener-registration-failed',
      error,
    );
    scheduleReconnect();
  }
}

removeContextInvalidation = onExtensionContextInvalidated(dispose);
connect();

window.addEventListener('unload', dispose, { once: true });
