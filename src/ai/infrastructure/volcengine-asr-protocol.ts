import { t } from '../../localization/messages';

const PROTOCOL_VERSION = 1;
const HEADER_SIZE_WORDS = 1;
const FULL_CLIENT_REQUEST = 0x1;
const AUDIO_ONLY_REQUEST = 0x2;
const FULL_SERVER_RESPONSE = 0x9;
const SERVER_ERROR_RESPONSE = 0xf;
const POSITIVE_SEQUENCE = 0x1;
const FINAL_SEQUENCE = 0x3;
const NO_SERIALIZATION = 0x0;
const JSON_SERIALIZATION = 0x1;
const NO_COMPRESSION = 0x0;
const GZIP_COMPRESSION = 0x1;

export type VolcengineAsrResult = {
  text: string;
  final: boolean;
  code?: number;
  message?: string;
};

function ownedBuffer(bytes: Uint8Array) {
  return bytes.slice().buffer;
}

async function gzip(bytes: Uint8Array) {
  const stream = new Blob([ownedBuffer(bytes)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array) {
  const stream = new Blob([ownedBuffer(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function messageHeader(
  messageType: number,
  flags: number,
  serialization: number,
  compression: number,
) {
  return new Uint8Array([
    (PROTOCOL_VERSION << 4) | HEADER_SIZE_WORDS,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0,
  ]);
}

function framedPayload(
  header: Uint8Array,
  sequence: number,
  payload: Uint8Array,
) {
  const frame = new Uint8Array(header.length + 8 + payload.length);
  frame.set(header);
  const view = new DataView(frame.buffer);
  view.setInt32(header.length, sequence);
  view.setUint32(header.length + 4, payload.length);
  frame.set(payload, header.length + 8);
  return frame;
}

export async function createVolcengineAsrRequest(
  sequence: number,
  userId: string,
) {
  const payload = new TextEncoder().encode(
    JSON.stringify({
      user: {
        uid: userId,
      },
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
    }),
  );
  return framedPayload(
    messageHeader(
      FULL_CLIENT_REQUEST,
      POSITIVE_SEQUENCE,
      JSON_SERIALIZATION,
      GZIP_COMPRESSION,
    ),
    sequence,
    await gzip(payload),
  );
}

export async function createVolcengineAsrAudioFrame(
  pcm: Uint8Array,
  sequence: number,
  final: boolean,
) {
  return framedPayload(
    messageHeader(
      AUDIO_ONLY_REQUEST,
      final ? FINAL_SEQUENCE : POSITIVE_SEQUENCE,
      NO_SERIALIZATION,
      GZIP_COMPRESSION,
    ),
    final ? -sequence : sequence,
    await gzip(pcm),
  );
}

function payloadRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resultText(payload: Record<string, unknown>) {
  const result = payloadRecord(payload.result);
  if (typeof result?.text === 'string') return result.text;
  const legacyResult = Array.isArray(payload.result) ? payload.result : [];
  const first = payloadRecord(legacyResult[0]);
  return typeof first?.text === 'string' ? first.text : '';
}

function responseMessage(payload: Record<string, unknown>) {
  return typeof payload.message === 'string' ? payload.message : undefined;
}

export async function parseVolcengineAsrResponse(
  source: ArrayBuffer | Uint8Array,
): Promise<VolcengineAsrResult> {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.length < 8)
    throw new Error(t('cm_volcengine_asr_protocol_error_1'));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[0] >> 4;
  const headerSize = (bytes[0] & 0xf) * 4;
  const messageType = bytes[1] >> 4;
  const flags = bytes[1] & 0xf;
  const serialization = bytes[2] >> 4;
  const compression = bytes[2] & 0xf;
  if (
    version !== PROTOCOL_VERSION ||
    headerSize < 4 ||
    headerSize > bytes.length
  ) {
    throw new Error(t('cm_volcengine_asr_protocol_error_2'));
  }

  let offset = headerSize;
  let code: number | undefined;
  if ((flags & 0x1) !== 0) {
    if (offset + 4 > bytes.length)
      throw new Error(t('cm_volcengine_asr_protocol_error_3'));
    offset += 4;
  }
  if ((flags & 0x4) !== 0) {
    if (offset + 4 > bytes.length)
      throw new Error(t('cm_volcengine_asr_protocol_error_4'));
    offset += 4;
  }
  if (messageType === SERVER_ERROR_RESPONSE) {
    if (offset + 4 > bytes.length)
      throw new Error(t('cm_volcengine_asr_protocol_error_5'));
    code = view.getInt32(offset);
    offset += 4;
  }
  if (offset + 4 > bytes.length)
    throw new Error(t('cm_volcengine_asr_protocol_error_6'));
  const payloadLength = view.getUint32(offset);
  offset += 4;
  if (offset + payloadLength > bytes.length) {
    throw new Error(t('cm_volcengine_asr_protocol_error_7'));
  }

  let payloadBytes = bytes.subarray(offset, offset + payloadLength);
  if (compression === GZIP_COMPRESSION && payloadBytes.length > 0) {
    payloadBytes = await gunzip(payloadBytes);
  } else if (compression !== NO_COMPRESSION) {
    throw new Error(t('cm_volcengine_asr_protocol_error_8'));
  }
  const payload =
    serialization === JSON_SERIALIZATION && payloadBytes.length > 0
      ? (payloadRecord(JSON.parse(new TextDecoder().decode(payloadBytes))) ??
        {})
      : {};

  if (messageType === SERVER_ERROR_RESPONSE) {
    throw new Error(
      responseMessage(payload) ??
        t('cm_volcengine_asr_protocol_text_9', [String(code ?? '未知')]),
    );
  }
  if (messageType !== FULL_SERVER_RESPONSE) {
    return { text: '', final: false, code, message: responseMessage(payload) };
  }
  return {
    text: resultText(payload),
    final: (flags & 0x2) !== 0,
    code: typeof payload.code === 'number' ? payload.code : code,
    message: responseMessage(payload),
  };
}
