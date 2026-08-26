const FRAME_SIZE = 2048;
const WorkletProcessor = globalThis.AudioWorkletProcessor;

class CardMasterSpeechCaptureProcessor extends WorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(FRAME_SIZE);
    this.offset = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type !== 'flush') return;
      if (this.offset > 0) {
        const completed = this.frame.slice(0, this.offset);
        this.port.postMessage(completed, [completed.buffer]);
        this.frame = new Float32Array(FRAME_SIZE);
        this.offset = 0;
      }
      this.port.postMessage({
        type: 'flushed',
        requestId: event.data.requestId,
      });
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let sourceOffset = 0;
    while (sourceOffset < channel.length) {
      const count = Math.min(
        FRAME_SIZE - this.offset,
        channel.length - sourceOffset,
      );
      this.frame.set(
        channel.subarray(sourceOffset, sourceOffset + count),
        this.offset,
      );
      this.offset += count;
      sourceOffset += count;
      if (this.offset !== FRAME_SIZE) continue;
      const completed = this.frame;
      this.port.postMessage(completed, [completed.buffer]);
      this.frame = new Float32Array(FRAME_SIZE);
      this.offset = 0;
    }
    return true;
  }
}

globalThis.registerProcessor(
  'card-master-speech-capture',
  CardMasterSpeechCaptureProcessor,
);
