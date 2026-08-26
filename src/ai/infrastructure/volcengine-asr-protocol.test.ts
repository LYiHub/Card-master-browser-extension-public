import { describe, expect, it } from 'vitest';

import {
  createVolcengineAsrAudioFrame,
  createVolcengineAsrRequest,
  parseVolcengineAsrResponse,
} from './volcengine-asr-protocol';

async function gzip(bytes: Uint8Array) {
  const stream = new Blob([bytes.slice().buffer])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array) {
  const stream = new Blob([bytes.slice().buffer])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function requestPayload(frame: Uint8Array) {
  const length = new DataView(
    frame.buffer,
    frame.byteOffset,
    frame.byteLength,
  ).getUint32(8);
  return JSON.parse(
    new TextDecoder().decode(await gunzip(frame.subarray(12, 12 + length))),
  );
}

async function serverFrame(payload: unknown, final = true) {
  const compressed = await gzip(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const frame = new Uint8Array(12 + compressed.length);
  frame.set([0x11, final ? 0x93 : 0x91, 0x11, 0]);
  const view = new DataView(frame.buffer);
  view.setInt32(4, 7);
  view.setUint32(8, compressed.length);
  frame.set(compressed, 12);
  return frame;
}

describe('Volcengine ASR protocol', () => {
  it('encodes the V3 big-model PCM request with a positive sequence', async () => {
    const frame = await createVolcengineAsrRequest(1, 'user-id');

    expect([...frame.subarray(0, 4)]).toEqual([0x11, 0x11, 0x11, 0]);
    expect(new DataView(frame.buffer).getInt32(4)).toBe(1);
    await expect(requestPayload(frame)).resolves.toMatchObject({
      user: { uid: 'user-id' },
      audio: {
        format: 'pcm',
        codec: 'raw',
        rate: 16_000,
        bits: 16,
        channel: 1,
      },
      request: {
        model_name: 'bigmodel',
        enable_itn: true,
        enable_punc: true,
        enable_ddc: true,
        show_utterances: true,
        enable_nonstream: false,
      },
    });
  });

  it('uses positive audio sequences and negates the final sequence', async () => {
    const regular = await createVolcengineAsrAudioFrame(
      new Uint8Array([1, 2]),
      2,
      false,
    );
    const final = await createVolcengineAsrAudioFrame(
      new Uint8Array(),
      3,
      true,
    );

    expect(regular[1]).toBe(0x21);
    expect(new DataView(regular.buffer).getInt32(4)).toBe(2);
    expect(final[1]).toBe(0x23);
    expect(new DataView(final.buffer).getInt32(4)).toBe(-3);
  });

  it('parses V3 cumulative text and the final response flag', async () => {
    const response = await parseVolcengineAsrResponse(
      await serverFrame({
        code: 0,
        result: { text: '这是字节跳动。' },
      }),
    );

    expect(response).toEqual({
      text: '这是字节跳动。',
      final: true,
      code: 0,
      message: undefined,
    });
  });
});
