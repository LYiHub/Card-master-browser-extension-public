import type {
  AiServicesConfig,
  ImageServiceConfig,
  ImageServiceConfigInput,
  ImageServiceProtocol,
  ModelServiceConfig,
  SpeechServiceConfig,
  SpeechServiceConfigInput,
} from './types';
import { isAiModelProtocol, isAiReasoningEffort } from './types';

const HTTP_HEADER_CREDENTIAL_PATTERN = /^[\x21-\x7e]*$/;
const MODEL_SERVICE_KEYS = new Set([
  'baseUrl',
  'model',
  'protocol',
  'reasoningEffort',
  'apiKey',
]);
const IMAGE_SERVICE_KEYS = new Set([
  'credentialSource',
  'protocol',
  'baseUrl',
  'model',
  'apiKey',
]);
const SPEECH_SERVICE_KEYS = new Set(['apiKey']);
const AI_SERVICES_KEYS = new Set([
  'modelService',
  'imageService',
  'speechService',
]);
const IMAGE_SERVICE_PROTOCOLS = new Set<ImageServiceProtocol>([
  'openai-images',
  'dashscope',
]);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>) {
  return Object.keys(value).every((key) => keys.has(key));
}

export function isHttpHeaderSafeCredential(value: string) {
  return HTTP_HEADER_CREDENTIAL_PATTERN.test(value);
}

export function normalizeHttpHeaderCredential(value: string, label: string) {
  const credential = value.trim();
  if (!isHttpHeaderSafeCredential(credential)) {
    throw new Error(
      `${label}包含请求头不支持的字符。请只输入密钥本身，不要附带中文说明、全角标点、空格或换行。`,
    );
  }
  return credential;
}

export function normalizeAiServiceBaseUrl(value: string, defaultRootPath = '') {
  const url = new URL(value);
  if ((url.pathname === '/' || url.pathname === '') && defaultRootPath) {
    url.pathname = defaultRootPath;
  } else {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  url.search = '';
  url.hash = '';
  return url.href.replace(/\/+$/, '');
}

export function isSecureServiceUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]')
  );
}

export function normalizeModelServiceInput(value: unknown):
  | (Omit<ModelServiceConfig, 'apiKey'> & {
      apiKey?: string;
    })
  | null {
  if (!record(value) || !hasOnlyKeys(value, MODEL_SERVICE_KEYS)) return null;
  const model = typeof value.model === 'string' ? value.model.trim() : '';
  if (
    typeof value.baseUrl !== 'string' ||
    value.baseUrl.length > 2_048 ||
    !isSecureServiceUrl(value.baseUrl) ||
    typeof value.model !== 'string' ||
    !model ||
    value.model.length > 256 ||
    !isAiModelProtocol(value.protocol) ||
    !isAiReasoningEffort(value.reasoningEffort) ||
    (value.apiKey !== undefined &&
      (typeof value.apiKey !== 'string' ||
        value.apiKey.length > 8_192 ||
        !isHttpHeaderSafeCredential(value.apiKey.trim())))
  ) {
    return null;
  }
  return {
    baseUrl: normalizeAiServiceBaseUrl(
      value.baseUrl,
      value.protocol === 'responses' ? '/v1' : '',
    ),
    model,
    protocol: value.protocol,
    reasoningEffort: value.reasoningEffort,
    ...(typeof value.apiKey === 'string'
      ? { apiKey: value.apiKey.trim() }
      : {}),
  };
}

export function normalizeImageServiceInput(
  value: unknown,
): ImageServiceConfigInput | null {
  if (!record(value) || !hasOnlyKeys(value, IMAGE_SERVICE_KEYS)) return null;
  if (
    (value.credentialSource !== 'model-service' &&
      value.credentialSource !== 'independent') ||
    !IMAGE_SERVICE_PROTOCOLS.has(value.protocol as ImageServiceProtocol) ||
    typeof value.baseUrl !== 'string' ||
    value.baseUrl.length > 2_048 ||
    !isSecureServiceUrl(value.baseUrl) ||
    typeof value.model !== 'string' ||
    !value.model.trim() ||
    value.model.length > 256 ||
    (value.apiKey !== undefined &&
      (typeof value.apiKey !== 'string' ||
        value.apiKey.length > 8_192 ||
        !isHttpHeaderSafeCredential(value.apiKey.trim())))
  ) {
    return null;
  }
  const protocol = value.protocol as ImageServiceProtocol;
  return {
    credentialSource: value.credentialSource,
    protocol,
    baseUrl: normalizeAiServiceBaseUrl(
      value.baseUrl,
      protocol === 'openai-images' ? '/v1' : '',
    ),
    model: value.model.trim(),
    ...(typeof value.apiKey === 'string'
      ? { apiKey: value.apiKey.trim() }
      : {}),
  };
}

export function normalizeSpeechServiceInput(
  value: unknown,
): SpeechServiceConfigInput | null {
  if (!record(value) || !hasOnlyKeys(value, SPEECH_SERVICE_KEYS)) return null;
  if (
    value.apiKey !== undefined &&
    (typeof value.apiKey !== 'string' ||
      value.apiKey.length > 8_192 ||
      !isHttpHeaderSafeCredential(value.apiKey.trim()))
  ) {
    return null;
  }
  return typeof value.apiKey === 'string'
    ? { apiKey: value.apiKey.trim() }
    : {};
}

function normalizeModelServiceConfig(
  value: unknown,
): ModelServiceConfig | null {
  if (!record(value) || typeof value.apiKey !== 'string') return null;
  const input = normalizeModelServiceInput(value);
  return input ? { ...input, apiKey: input.apiKey ?? '' } : null;
}

function normalizeImageServiceConfig(
  value: unknown,
): ImageServiceConfig | null {
  if (!record(value) || typeof value.apiKey !== 'string') return null;
  const input = normalizeImageServiceInput(value);
  return input ? { ...input, apiKey: input.apiKey ?? '' } : null;
}

function normalizeSpeechServiceConfig(
  value: unknown,
): SpeechServiceConfig | null {
  if (!record(value) || typeof value.apiKey !== 'string') return null;
  const input = normalizeSpeechServiceInput(value);
  return input ? { apiKey: input.apiKey ?? '' } : null;
}

export function normalizeAiServicesConfig(
  value: unknown,
): AiServicesConfig | null {
  if (!record(value) || !hasOnlyKeys(value, AI_SERVICES_KEYS)) return null;
  const modelService = normalizeModelServiceConfig(value.modelService);
  const imageService = normalizeImageServiceConfig(value.imageService);
  const speechService = normalizeSpeechServiceConfig(value.speechService);
  return modelService && imageService && speechService
    ? { modelService, imageService, speechService }
    : null;
}
