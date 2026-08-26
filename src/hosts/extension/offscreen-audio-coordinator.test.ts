import { describe, expect, it, vi } from 'vitest';

import type { ExtensionAiServices } from './ai-services';
import type { ExtensionBackgroundApi, ExtensionPort } from './api';
import { OffscreenAudioCoordinator } from './offscreen-audio-coordinator';
import {
  type AudioPlaybackRequest,
  EXTENSION_CHANNEL,
  OFFSCREEN_AUDIO_CHANNEL,
  OFFSCREEN_AUDIO_PORT,
} from './protocol';
import {
  GAMEPAD_SPEECH_CAPTURE_PORT,
  GAMEPAD_SPEECH_CHANNEL,
  OFFSCREEN_SPEECH_CHANNEL,
} from './speech-capture-protocol';
import {
  OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
  SPEECH_RECOGNITION_PORT,
} from './speech-recognition-protocol';
import type { VolcengineSpeechAuthorizationCoordinator } from './volcengine-speech-session';

function apiWithOffscreen() {
  const getContexts = vi.fn().mockResolvedValue([]);
  const createDocument = vi.fn().mockResolvedValue(undefined);
  const api = {
    runtime: {
      getContexts,
      getURL: vi.fn(
        (path: string) => `chrome-extension://extension-id/${path}`,
      ),
    },
    offscreen: {
      createDocument,
    },
  } as unknown as ExtensionBackgroundApi;
  return { api, createDocument, getContexts };
}

function audioPort(name = OFFSCREEN_AUDIO_PORT) {
  const postMessage = vi.fn();
  const messageListeners: Array<(message: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  const port = {
    name,
    postMessage,
    onMessage: {
      addListener: vi.fn((listener: (message: unknown) => void) => {
        messageListeners.push(listener);
      }),
      removeListener: vi.fn((listener: (message: unknown) => void) => {
        const index = messageListeners.indexOf(listener);
        if (index >= 0) messageListeners.splice(index, 1);
      }),
    },
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => {
        disconnectListeners.push(listener);
      }),
    },
  } as unknown as ExtensionPort;
  return {
    port,
    postMessage,
    reply: (message: unknown) => {
      for (const listener of messageListeners) listener(message);
    },
    disconnect: () => {
      for (const listener of disconnectListeners) listener();
    },
  };
}

describe('OffscreenAudioCoordinator', () => {
  it('waits for one ready connection across concurrent requests', async () => {
    const { api, createDocument, getContexts } = apiWithOffscreen();
    const connection = audioPort();
    const coordinator = new OffscreenAudioCoordinator(api);
    const request: AudioPlaybackRequest = {
      channel: EXTENSION_CHANNEL,
      type: 'audio-playback-prepare',
      cues: ['deckHover'],
      settings: { muted: false, volume: 0.78 },
    };

    const requests = [coordinator.handle(request), coordinator.handle(request)];
    expect(coordinator.connect(connection.port)).toBe(true);
    await Promise.all(requests);

    expect(getContexts).toHaveBeenCalledOnce();
    expect(createDocument).toHaveBeenCalledOnce();
    expect(createDocument).toHaveBeenCalledWith({
      url: 'offscreen-audio.html',
      reasons: ['AUDIO_PLAYBACK', 'USER_MEDIA'],
      justification: '播放交互音效，并为手柄按住说话采集麦克风音频。',
    });
    expect(connection.postMessage).toHaveBeenCalledTimes(2);
  });

  it('waits for the actual offscreen playback result', async () => {
    const { api } = apiWithOffscreen();
    const connection = audioPort();
    const coordinator = new OffscreenAudioCoordinator(api);
    coordinator.connect(connection.port);

    const playback = coordinator.handle({
      channel: EXTENSION_CHANNEL,
      type: 'audio-playback-play',
      requestId: 'audio-1',
      cue: 'deckHover',
      options: {},
      settings: { muted: false, volume: 0.78 },
    });
    await Promise.resolve();
    connection.reply({
      channel: OFFSCREEN_AUDIO_CHANNEL,
      type: 'audio-playback-result',
      requestId: 'audio-1',
      cue: 'deckHover',
      playback: { result: 'playing' },
    });

    await expect(playback).resolves.toEqual({
      supported: true,
      playback: { result: 'playing' },
    });
  });

  it('drops a disconnected port and accepts the replacement', async () => {
    const { api } = apiWithOffscreen();
    const first = audioPort();
    const replacement = audioPort();
    const coordinator = new OffscreenAudioCoordinator(api);

    expect(coordinator.connect(first.port)).toBe(true);
    first.disconnect();
    const request = coordinator.handle({
      channel: EXTENSION_CHANNEL,
      type: 'audio-playback-settings-sync',
      settings: { muted: true, volume: 0.4 },
    });
    expect(coordinator.connect(replacement.port)).toBe(true);
    await request;

    expect(first.postMessage).not.toHaveBeenCalled();
    expect(replacement.postMessage).toHaveBeenCalledOnce();
  });

  it('reports unsupported platforms without opening a connection', async () => {
    const api = {
      runtime: {
        getURL: vi.fn(),
      },
    } as unknown as ExtensionBackgroundApi;
    const coordinator = new OffscreenAudioCoordinator(api);

    await expect(
      coordinator.handle({
        channel: EXTENSION_CHANNEL,
        type: 'audio-playback-settings-sync',
        settings: { muted: true, volume: 0.4 },
      }),
    ).resolves.toEqual({ supported: false });
  });

  it('forwards one page speech capture through the shared offscreen document', async () => {
    const { api } = apiWithOffscreen();
    const offscreen = audioPort();
    const client = audioPort(GAMEPAD_SPEECH_CAPTURE_PORT);
    const coordinator = new OffscreenAudioCoordinator(api);
    coordinator.connect(offscreen.port);
    expect(coordinator.connectSpeechClient(client.port)).toBe(true);

    client.reply({
      channel: GAMEPAD_SPEECH_CHANNEL,
      type: 'speech-capture-prepare',
      captureId: 'capture-1',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(offscreen.postMessage).toHaveBeenCalledWith({
      channel: OFFSCREEN_SPEECH_CHANNEL,
      type: 'speech-capture-prepare',
      captureId: 'capture-1',
    });

    offscreen.reply({
      channel: OFFSCREEN_SPEECH_CHANNEL,
      type: 'speech-capture-ready',
      captureId: 'capture-1',
    });
    expect(client.postMessage).toHaveBeenCalledWith({
      channel: GAMEPAD_SPEECH_CHANNEL,
      type: 'speech-capture-ready',
      captureId: 'capture-1',
    });
  });

  it('opens page speech recognition inside the offscreen document', async () => {
    const { api } = apiWithOffscreen();
    const offscreen = audioPort();
    const client = audioPort(SPEECH_RECOGNITION_PORT);
    const services = {
      readSpeechService: vi.fn(async () => ({ apiKey: 'speech-key' })),
    } as unknown as ExtensionAiServices;
    const authorization = {
      open: vi.fn(async () => ({
        sessionId: 'authorization-1',
        endpoint: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
      })),
      close: vi.fn(async () => undefined),
    } as unknown as VolcengineSpeechAuthorizationCoordinator;
    const coordinator = new OffscreenAudioCoordinator(api);
    coordinator.connect(offscreen.port);
    expect(
      coordinator.connectSpeechRecognitionClient(
        client.port,
        services,
        authorization,
      ),
    ).toBe(true);

    client.reply({ type: 'start' });

    await vi.waitFor(() =>
      expect(offscreen.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
          type: 'start',
          endpoint: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
        }),
      ),
    );
    const command = offscreen.postMessage.mock.calls.at(-1)?.[0] as {
      recognitionId: string;
    };
    offscreen.reply({
      channel: OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
      type: 'state',
      recognitionId: command.recognitionId,
      state: { status: 'listening', text: '' },
    });

    expect(client.postMessage).toHaveBeenCalledWith({
      type: 'state',
      state: { status: 'listening', text: '' },
    });
    await vi.waitFor(() =>
      expect(authorization.close).toHaveBeenCalledWith('authorization-1'),
    );
  });

  it('tests the same offscreen speech connection used by pages', async () => {
    const { api } = apiWithOffscreen();
    const offscreen = audioPort();
    const authorization = {
      open: vi.fn(async () => ({
        sessionId: 'authorization-2',
        endpoint: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
      })),
      close: vi.fn(async () => undefined),
    } as unknown as VolcengineSpeechAuthorizationCoordinator;
    const coordinator = new OffscreenAudioCoordinator(api);
    coordinator.connect(offscreen.port);

    const probe = coordinator.testSpeechRecognition(
      'speech-key',
      authorization,
    );
    await vi.waitFor(() =>
      expect(offscreen.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
          type: 'start',
        }),
      ),
    );
    const command = offscreen.postMessage.mock.calls.at(-1)?.[0] as {
      recognitionId: string;
    };
    offscreen.reply({
      channel: OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
      type: 'state',
      recognitionId: command.recognitionId,
      state: { status: 'listening', text: '' },
    });

    await expect(probe).resolves.toMatchObject({ ok: true });
    expect(offscreen.postMessage).toHaveBeenCalledWith({
      channel: OFFSCREEN_SPEECH_RECOGNITION_CHANNEL,
      type: 'cancel',
      recognitionId: command.recognitionId,
    });
  });
});
