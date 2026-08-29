import { normalizeHttpHeaderCredential } from '../domain/ai-services-schema';

export type AiServiceFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type AiServiceRequestContext = {
  protocol?: 'responses' | 'chat-completions' | 'openai-images' | 'dashscope';
};

export type AiServiceRequestDiagnostic = {
  localRequestId: string;
  protocol: string;
  model: string;
  endpoint: string;
  stream: boolean;
  inputItemCount: number;
  toolCount: number;
  reasoningEffort: string | null;
  status?: number;
  durationMs?: number;
  contentType?: string;
  serviceRequestId?: string;
  serviceTraceId?: string;
};

const responseDiagnostics = new WeakMap<Response, AiServiceRequestDiagnostic>();

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function now() {
  return globalThis.performance?.now() ?? Date.now();
}

function requestInputItemCount(value: unknown) {
  if (typeof value === 'string') return 1;
  return Array.isArray(value) ? value.length : 0;
}

function requestReasoningEffort(value: unknown) {
  if (!record(value) || typeof value.effort !== 'string') return null;
  return value.effort;
}

function serviceHeader(response: Response, names: readonly string[]) {
  for (const name of names) {
    const value = response.headers.get(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

function requestDiagnostic(
  url: string,
  body: Record<string, unknown>,
  context: AiServiceRequestContext,
): AiServiceRequestDiagnostic {
  return {
    localRequestId: crypto.randomUUID(),
    protocol: context.protocol ?? 'unknown',
    model: typeof body.model === 'string' ? body.model : '',
    endpoint: url,
    stream: body.stream === true,
    inputItemCount: requestInputItemCount(body.input ?? body.messages),
    toolCount: Array.isArray(body.tools) ? body.tools.length : 0,
    reasoningEffort: requestReasoningEffort(body.reasoning),
  };
}

function diagnosticText(
  diagnostic: Partial<AiServiceRequestDiagnostic>,
  extra: readonly string[] = [],
) {
  return [
    diagnostic.localRequestId
      ? `localRequestId=${diagnostic.localRequestId}`
      : '',
    diagnostic.protocol ? `protocol=${diagnostic.protocol}` : '',
    diagnostic.model ? `model=${diagnostic.model}` : '',
    diagnostic.endpoint ? `endpoint=${diagnostic.endpoint}` : '',
    diagnostic.serviceRequestId
      ? `requestId=${diagnostic.serviceRequestId}`
      : '',
    diagnostic.serviceTraceId ? `traceId=${diagnostic.serviceTraceId}` : '',
    diagnostic.contentType ? `contentType=${diagnostic.contentType}` : '',
    typeof diagnostic.status === 'number' ? `status=${diagnostic.status}` : '',
    typeof diagnostic.durationMs === 'number'
      ? `durationMs=${diagnostic.durationMs}`
      : '',
    ...extra,
  ]
    .filter(Boolean)
    .join('; ');
}

function completedDiagnostic(
  diagnostic: AiServiceRequestDiagnostic,
  response: Response,
  startedAt: number,
): AiServiceRequestDiagnostic {
  return {
    ...diagnostic,
    status: response.status,
    durationMs: Math.max(0, Math.round(now() - startedAt)),
    contentType: response.headers.get('content-type') ?? undefined,
    serviceRequestId: serviceHeader(response, [
      'x-request-id',
      'request-id',
      'openai-request-id',
    ]),
    serviceTraceId: serviceHeader(response, [
      'x-ds-trace-id',
      'x-trace-id',
      'trace-id',
      'cf-ray',
    ]),
  };
}

export function aiServiceResponseDiagnostic(response: Response) {
  return responseDiagnostics.get(response);
}

export class AiServiceTransportError extends Error {
  constructor(
    message: string,
    readonly diagnostic: Readonly<AiServiceRequestDiagnostic>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AiServiceTransportError';
  }
}

export class AiServiceStreamError extends Error {
  constructor(
    message: string,
    readonly diagnostic: Readonly<
      AiServiceRequestDiagnostic & {
        byteLength: number;
        eventCount: number;
        streamDurationMs: number;
      }
    >,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AiServiceStreamError';
  }
}

export async function requestAiService(
  fetcher: AiServiceFetch,
  credential: { apiKey: string },
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  context: AiServiceRequestContext = {},
) {
  const apiKey = normalizeHttpHeaderCredential(
    credential.apiKey,
    'AI 服务 API 密钥',
  );
  if (!apiKey) {
    throw new Error('AI 服务 API 密钥尚未配置。');
  }
  const diagnostic = requestDiagnostic(url, body, context);
  const startedAt = now();
  try {
    const response = await Reflect.apply(fetcher, globalThis, [
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      },
    ]);
    const completed = completedDiagnostic(diagnostic, response, startedAt);
    responseDiagnostics.set(response, completed);
    if (!response.ok) {
      console.error('[Card Master][ai-service] request-failed', completed);
    }
    return response;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    const failed = {
      ...diagnostic,
      durationMs: Math.max(0, Math.round(now() - startedAt)),
    };
    console.error('[Card Master][ai-service] request-network-failed', {
      ...failed,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    const debug = diagnosticText(failed);
    throw new AiServiceTransportError(
      `AI 服务连接失败：${
        error instanceof Error ? error.message : String(error)
      }${debug ? `\n调试信息：${debug}` : ''}`,
      failed,
      { cause: error },
    );
  }
}

export async function requestStreamingAiService(
  fetcher: AiServiceFetch,
  credential: { apiKey: string },
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  context: AiServiceRequestContext = {},
) {
  const response = await requestAiService(
    fetcher,
    credential,
    url,
    body,
    signal,
    context,
  );
  return { response, signal };
}

async function readWithSignal<Result>(
  read: () => Promise<Result>,
  signal?: AbortSignal,
) {
  if (!signal) return await read();
  if (signal.aborted) throw signal.reason;
  let rejectAbort: ((reason: unknown) => void) | null = null;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const handleAbort = () => rejectAbort?.(signal.reason);
  signal.addEventListener('abort', handleAbort, { once: true });
  try {
    return await Promise.race([read(), aborted]);
  } finally {
    signal.removeEventListener('abort', handleAbort);
  }
}

export async function readAiServiceBytes(
  response: Response,
  signal?: AbortSignal,
) {
  if (!response.body) {
    return new Uint8Array(await response.arrayBuffer());
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      if (signal?.aborted) {
        await reader.cancel();
        throw signal.reason;
      }
      const { done, value } = await readWithSignal(() => reader.read(), signal);
      if (done) break;
      byteLength += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readAiServiceText(
  response: Response,
  signal?: AbortSignal,
) {
  return new TextDecoder().decode(await readAiServiceBytes(response, signal));
}

function frameData(frame: string) {
  return frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');
}

export async function consumeAiServiceSse(
  response: Response,
  signal: AbortSignal | undefined,
  onData: (data: string) => void,
) {
  if (!response.body) {
    throw new Error('AI 服务没有返回可读取的事件流。');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const startedAt = now();
  let buffer = '';
  let byteLength = 0;
  let eventCount = 0;
  const consumeFrames = (flush = false) => {
    const frames = buffer.split(/\r?\n\r?\n/);
    const remainder = frames.pop() ?? '';
    if (flush && remainder.trim()) frames.push(remainder);
    buffer = flush ? '' : remainder;
    for (const frame of frames) {
      const data = frameData(frame);
      if (data) {
        eventCount += 1;
        onData(data);
      }
    }
  };
  try {
    for (;;) {
      if (signal?.aborted) {
        await reader.cancel();
        throw signal.reason;
      }
      const { done, value } = await readWithSignal(() => reader.read(), signal);
      if (done) break;
      byteLength += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      consumeFrames();
    }
    buffer += decoder.decode();
    consumeFrames(true);
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    if (signal?.aborted) throw signal.reason;
    const baseDiagnostic = aiServiceResponseDiagnostic(response) ?? {
      localRequestId: 'unknown',
      protocol: 'unknown',
      model: '',
      endpoint: response.url || 'unknown',
      stream: true,
      inputItemCount: 0,
      toolCount: 0,
      reasoningEffort: null,
      status: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
    };
    const diagnostic = {
      ...baseDiagnostic,
      byteLength,
      eventCount,
      streamDurationMs: Math.max(0, Math.round(now() - startedAt)),
    };
    console.error('[Card Master][ai-service] stream-failed', {
      ...diagnostic,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    const debug = diagnosticText(diagnostic, [
      `streamDurationMs=${diagnostic.streamDurationMs}`,
      `eventCount=${eventCount}`,
      `byteLength=${byteLength}`,
    ]);
    throw new AiServiceStreamError(
      `AI 服务事件流中断：${
        error instanceof Error ? error.message : String(error)
      }${debug ? `\n调试信息：${debug}` : ''}`,
      diagnostic,
      { cause: error },
    );
  } finally {
    reader.releaseLock();
  }
}

function errorMetadata(raw: string) {
  try {
    const payload = JSON.parse(raw) as unknown;
    if (!record(payload) || !record(payload.error)) return {};
    return {
      errorType:
        typeof payload.error.type === 'string' ? payload.error.type : undefined,
      errorCode:
        typeof payload.error.code === 'string' ? payload.error.code : undefined,
    };
  } catch {
    return {};
  }
}

export class AiServiceHttpError extends Error {
  readonly code?: string;

  constructor(
    message: string,
    readonly diagnostic: Readonly<
      AiServiceRequestDiagnostic & {
        errorType?: string;
        errorCode?: string;
      }
    >,
  ) {
    super(message);
    this.name = 'AiServiceHttpError';
    this.code = diagnostic.errorCode;
  }
}

export function aiServiceHttpError(
  response: Response,
  raw: string,
  serviceMessage?: string,
  context: {
    protocol?: AiServiceRequestContext['protocol'];
    model?: string;
  } = {},
) {
  const status = response.status;
  const message =
    serviceMessage?.trim() || raw.trim() || 'AI 服务返回了空错误响应。';
  const baseDiagnostic = aiServiceResponseDiagnostic(response);
  const metadata = errorMetadata(raw);
  const diagnostic = {
    localRequestId: baseDiagnostic?.localRequestId ?? 'unknown',
    protocol: context.protocol ?? baseDiagnostic?.protocol ?? 'unknown',
    model: context.model ?? baseDiagnostic?.model ?? '',
    endpoint: baseDiagnostic?.endpoint ?? response.url ?? 'unknown',
    stream: baseDiagnostic?.stream ?? false,
    inputItemCount: baseDiagnostic?.inputItemCount ?? 0,
    toolCount: baseDiagnostic?.toolCount ?? 0,
    reasoningEffort: baseDiagnostic?.reasoningEffort ?? null,
    status,
    durationMs: baseDiagnostic?.durationMs,
    contentType:
      baseDiagnostic?.contentType ??
      response.headers.get('content-type') ??
      undefined,
    serviceRequestId:
      baseDiagnostic?.serviceRequestId ??
      serviceHeader(response, [
        'x-request-id',
        'request-id',
        'openai-request-id',
      ]),
    serviceTraceId:
      baseDiagnostic?.serviceTraceId ??
      serviceHeader(response, [
        'x-ds-trace-id',
        'x-trace-id',
        'trace-id',
        'cf-ray',
      ]),
    ...metadata,
  };
  const debug = diagnosticText(diagnostic, [
    diagnostic.errorType ? `type=${diagnostic.errorType}` : '',
    diagnostic.errorCode ? `code=${diagnostic.errorCode}` : '',
  ]);
  return new AiServiceHttpError(
    `AI 服务请求失败（HTTP ${status}）：${message}${debug ? `\n调试信息：${debug}` : ''}`,
    diagnostic,
  );
}
