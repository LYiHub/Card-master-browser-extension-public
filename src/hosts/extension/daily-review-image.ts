import { isSecureServiceUrl } from '../../ai/domain/ai-services-schema';
import { AI_IMAGE_GENERATION_MODEL } from '../../ai/domain/image-generation';
import type { AiServicesConfig } from '../../ai/domain/types';
import {
  type AiServiceFetch,
  readAiServiceBytes,
  readAiServiceText,
  requestAiService,
} from '../../ai/infrastructure/ai-service-http';
import { getImageGenerationAdapter } from '../../ai/infrastructure/image-generation-protocol-registry';
import { dailyReviewPromptUsesChinese } from '../../new-tab/application/daily-review-wallpaper';
import type { DailyReviewWallpaperResolution } from '../../new-tab/application/preferences';
import { resolveImageServiceRuntimeConfig } from './ai-services-config';

const DEFAULT_DAILY_REVIEW_SIZE: DailyReviewWallpaperResolution = '3840x2160';
const DAILY_REVIEW_MIME_TYPE = 'image/webp';
const DAILY_REVIEW_DIMENSIONS: Record<
  DailyReviewWallpaperResolution,
  { width: number; height: number }
> = {
  '1280x720': { width: 1280, height: 720 },
  '1920x1080': { width: 1920, height: 1080 },
  '2560x1440': { width: 2560, height: 1440 },
  '3840x2160': { width: 3840, height: 2160 },
};

type JsonRecord = Record<string, unknown>;

export type GeneratedDailyReviewWallpaper = {
  dataUrl: string;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
  model: string;
};

function record(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function base64ByteLength(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

function detectedImageMimeType(bytes: ArrayLike<number>) {
  const byte = (index: number) => Number(bytes[index] ?? -1);
  if (
    byte(0) === 0x52 &&
    byte(1) === 0x49 &&
    byte(2) === 0x46 &&
    byte(3) === 0x46 &&
    byte(8) === 0x57 &&
    byte(9) === 0x45 &&
    byte(10) === 0x42 &&
    byte(11) === 0x50
  ) {
    return 'image/webp';
  }
  if (
    byte(0) === 0x89 &&
    byte(1) === 0x50 &&
    byte(2) === 0x4e &&
    byte(3) === 0x47 &&
    byte(4) === 0x0d &&
    byte(5) === 0x0a &&
    byte(6) === 0x1a &&
    byte(7) === 0x0a
  ) {
    return 'image/png';
  }
  if (byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff) {
    return 'image/jpeg';
  }
  if (
    byte(0) === 0x47 &&
    byte(1) === 0x49 &&
    byte(2) === 0x46 &&
    byte(3) === 0x38 &&
    (byte(4) === 0x37 || byte(4) === 0x39) &&
    byte(5) === 0x61
  ) {
    return 'image/gif';
  }
  const fileType = String.fromCharCode(
    ...Array.from({ length: 12 }, (_, index) => Math.max(0, byte(index))),
  );
  if (
    fileType.slice(4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(fileType.slice(8, 12))
  ) {
    return 'image/avif';
  }
  return '';
}

function normalizedBase64Image(value: string) {
  const source = value.trim();
  const dataUrl = /^data:([^;,]+);base64,([\s\S]+)$/iu.exec(source);
  const encoded = (dataUrl?.[2] ?? source).replace(/\s+/gu, '');
  if (!encoded) throw new Error('每日回顾图像服务返回了空图片。');
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    throw new Error('每日回顾图像服务返回了无效的 Base64 图片。');
  }
  const mimeType = detectedImageMimeType(
    Array.from({ length: Math.min(16, decoded.length) }, (_, index) =>
      decoded.charCodeAt(index),
    ),
  );
  if (!mimeType) {
    throw new Error('每日回顾图像服务返回了无法识别的图片格式。');
  }
  return {
    dataUrl: `data:${mimeType};base64,${encoded}`,
    mimeType,
    byteLength: base64ByteLength(encoded),
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function responseErrorMessage(status: number, responseText: string) {
  try {
    const payload = JSON.parse(responseText) as unknown;
    if (record(payload)) {
      const error = record(payload.error) ? payload.error : payload;
      const detail =
        typeof error.message === 'string' && error.message.trim()
          ? error.message.trim()
          : null;
      if (detail) return `每日回顾生成失败：${detail}。`;
    }
  } catch {
    // 非 JSON 错误页只返回 HTTP 状态。
  }
  return `每日回顾生成失败：HTTP ${status}。`;
}

export function buildDailyReviewImageRequest(
  prompt: string,
  model = AI_IMAGE_GENERATION_MODEL,
  size: DailyReviewWallpaperResolution = DEFAULT_DAILY_REVIEW_SIZE,
) {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) throw new Error('每日回顾提示词不能为空。');
  if (!dailyReviewPromptUsesChinese(normalizedPrompt)) {
    throw new Error('每日回顾提示词必须使用简体中文。');
  }
  return {
    model,
    prompt: normalizedPrompt,
    n: 1,
    size,
    quality: 'high',
    output_format: 'webp',
  } as const;
}

export class DailyReviewImageGenerator {
  private readonly request: AiServiceFetch;

  constructor(request: AiServiceFetch = fetch) {
    this.request = request.bind(globalThis);
  }

  async generate(
    config: AiServicesConfig,
    prompt: string,
    signal?: AbortSignal,
    size: DailyReviewWallpaperResolution = DEFAULT_DAILY_REVIEW_SIZE,
  ): Promise<GeneratedDailyReviewWallpaper> {
    const imageConfig = resolveImageServiceRuntimeConfig(config);
    const usesModelServiceCredential =
      config.imageService.credentialSource === 'model-service';
    const { baseUrl, apiKey, model } = imageConfig;
    if (!apiKey) {
      throw new Error(
        usesModelServiceCredential
          ? '每日回顾正在沿用模型服务，请先配置模型服务 API 密钥，或改用独立图像服务。'
          : '每日回顾图像服务尚未配置，请填写独立图像服务的 API 密钥。',
      );
    }

    const adapter = getImageGenerationAdapter(imageConfig.protocol);
    const response = await requestAiService(
      this.request,
      { apiKey },
      adapter.buildUrl(baseUrl),
      adapter.buildRequestBody({
        prompt,
        model,
        size,
        count: 1,
        quality: 'high',
        outputFormat: 'webp',
      }),
      signal,
      { protocol: imageConfig.protocol },
    );
    const text = await readAiServiceText(response, signal);
    if (!response.ok) {
      throw new Error(responseErrorMessage(response.status, text));
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('每日回顾图像服务返回了无效 JSON。');
    }
    const parsed = adapter.parseResponse(payload);
    if (!parsed) {
      throw new Error('每日回顾图像服务没有返回图片。');
    }

    let dataUrl: string;
    let mimeType = DAILY_REVIEW_MIME_TYPE;
    let byteLength: number;
    if (parsed.b64) {
      const normalized = normalizedBase64Image(parsed.b64);
      dataUrl = normalized.dataUrl;
      mimeType = normalized.mimeType;
      byteLength = normalized.byteLength;
    } else if (parsed.url) {
      if (!isSecureServiceUrl(parsed.url)) {
        throw new Error('每日回顾图像服务返回了不安全的图片地址。');
      }
      const imageResponse = await this.request(parsed.url, { signal });
      if (!imageResponse.ok) {
        throw new Error(`下载每日回顾失败：HTTP ${imageResponse.status}。`);
      }
      if (imageResponse.url && !isSecureServiceUrl(imageResponse.url)) {
        throw new Error('每日回顾下载被重定向到了不安全的地址。');
      }
      const bytes = await readAiServiceBytes(imageResponse, signal);
      mimeType = detectedImageMimeType(bytes);
      if (!mimeType) throw new Error('每日回顾生成结果不是可识别的图片。');
      dataUrl = `data:${mimeType};base64,${bytesToBase64(bytes)}`;
      byteLength = bytes.byteLength;
    } else {
      throw new Error('每日回顾生成结果既没有图像数据，也没有图片地址。');
    }
    if (byteLength <= 0) {
      throw new Error('每日回顾图像服务返回了空图片。');
    }

    const dimensions = DAILY_REVIEW_DIMENSIONS[size];
    return {
      dataUrl,
      mimeType,
      byteLength,
      width: parsed.width ?? dimensions.width,
      height: parsed.height ?? dimensions.height,
      model,
    };
  }
}
