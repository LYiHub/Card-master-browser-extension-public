const SPEECH_CAPTURE_WORKLET_NAME = 'card-master-speech-capture';

export type SpeechAudioCaptureSession = {
  start(
    sendAudio: (pcmBase64: string) => Promise<void>,
    onError: (error: unknown) => Promise<void> | void,
  ): void;
  finish(): Promise<void>;
  close(): Promise<void>;
};

function speechCaptureWorkletUrl() {
  const globals = globalThis as typeof globalThis & {
    browser?: typeof chrome;
    chrome?: typeof chrome;
  };
  const runtime = globals.browser?.runtime ?? globals.chrome?.runtime;
  if (!runtime?.getURL) {
    throw new Error('当前页面无法加载语音采集工作线程。');
  }
  return runtime.getURL('assistant-speech-worklet.js');
}

function pcm16Base64(input: Float32Array, sampleRate: number) {
  const targetRate = 16_000;
  const ratio = sampleRate / targetRate;
  const sampleCount = Math.max(1, Math.floor(input.length / ratio));
  const bytes = new Uint8Array(sampleCount * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < sampleCount; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let total = 0;
    for (
      let sourceIndex = start;
      sourceIndex < end && sourceIndex < input.length;
      sourceIndex += 1
    ) {
      total += input[sourceIndex] ?? 0;
    }
    const sample = Math.max(-1, Math.min(1, total / (end - start)));
    view.setInt16(
      index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function flushProcessor(processor: AudioWorkletNode) {
  return new Promise<void>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        !event.data ||
        typeof event.data !== 'object' ||
        (event.data as { type?: unknown }).type !== 'flushed' ||
        (event.data as { requestId?: unknown }).requestId !== requestId
      ) {
        return;
      }
      window.clearTimeout(timeout);
      processor.port.removeEventListener('message', handleMessage);
      resolve();
    };
    const timeout = window.setTimeout(() => {
      processor.port.removeEventListener('message', handleMessage);
      reject(new Error('语音采集工作线程未能及时完成尾帧发送。'));
    }, 1_000);
    processor.port.addEventListener('message', handleMessage);
    processor.port.postMessage({ type: 'flush', requestId });
  });
}

export class SpeechAudioCapture implements SpeechAudioCaptureSession {
  private audioQueue: Promise<void> = Promise.resolve();
  private started = false;
  private closed = false;

  private constructor(
    private readonly context: AudioContext,
    private readonly gain: GainNode,
    private readonly processor: AudioWorkletNode,
    private readonly source: MediaStreamAudioSourceNode,
    private readonly stream: MediaStream,
  ) {}

  static async create() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const context = new AudioContext({ sampleRate: 16_000 });
    try {
      await context.resume();
      await context.audioWorklet.addModule(speechCaptureWorkletUrl());
      const source = context.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(
        context,
        SPEECH_CAPTURE_WORKLET_NAME,
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount: 1,
          channelCountMode: 'explicit',
        },
      );
      const gain = context.createGain();
      gain.gain.value = 0;
      return new SpeechAudioCapture(context, gain, processor, source, stream);
    } catch (error) {
      for (const track of stream.getTracks()) track.stop();
      await context.close().catch(() => undefined);
      throw error;
    }
  }

  start(
    sendAudio: (pcmBase64: string) => Promise<void>,
    onError: (error: unknown) => Promise<void> | void,
  ) {
    if (this.started || this.closed) return;
    this.started = true;
    this.processor.port.onmessage = (event: MessageEvent<unknown>) => {
      if (!(event.data instanceof Float32Array)) return;
      const pcmBase64 = pcm16Base64(event.data, this.context.sampleRate);
      this.audioQueue = this.audioQueue
        .then(() => sendAudio(pcmBase64))
        .catch(onError);
    };
    this.source.connect(this.processor);
    this.processor.connect(this.gain);
    this.gain.connect(this.context.destination);
  }

  async finish() {
    try {
      if (!this.closed && this.started) await flushProcessor(this.processor);
    } finally {
      await this.close();
    }
    await this.audioQueue;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.processor.port.onmessage = null;
    this.source.disconnect();
    this.processor.disconnect();
    this.gain.disconnect();
    for (const track of this.stream.getTracks()) track.stop();
    await this.context.close().catch(() => undefined);
  }
}
