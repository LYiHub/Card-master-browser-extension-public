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
import { CARD_ART_DIRECTION_PROMPT } from '../../userscript/application/card-art-direction';
import {
  type GeneratedUserscriptCover,
  optimizeUserscriptCoverImage,
} from '../../userscript/application/card-cover';
import { resolveImageServiceRuntimeConfig } from './ai-services-config';

const SOURCE_SIZE = '720x960';

export type CardCoverPromptOptions = {
  injectDefaultStyle?: boolean;
  requireEnglish?: boolean;
};

type JsonRecord = Record<string, unknown>;

export function isCardCoverVisualConceptText(value: string) {
  if (!value) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) return false;
  }
  return true;
}

function record(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function blobFromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'image/webp' });
}

export function buildCardCoverPrompt(
  visualConcept: string,
  options: CardCoverPromptOptions = {},
) {
  const { injectDefaultStyle = true, requireEnglish = true } = options;
  const concept = visualConcept.trim();
  if (!concept) throw new Error('卡牌封面提示词不能为空。');
  if (requireEnglish && !isCardCoverVisualConceptText(concept)) {
    throw new Error('卡牌封面视觉概念必须使用英文描述。');
  }
  if (!injectDefaultStyle) return concept;
  return [
    CARD_ART_DIRECTION_PROMPT,
    `User-directed visual concept: ${concept}.`,
  ].join(' ');
}

export function buildCardCoverRequest(
  prompt: string,
  model = AI_IMAGE_GENERATION_MODEL,
) {
  return {
    model,
    prompt,
    n: 1,
    size: SOURCE_SIZE,
    quality: 'low',
    output_format: 'webp',
  } as const;
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
      if (detail) return `卡牌封面生成失败：${detail}。`;
    }
  } catch {
    // 非 JSON 错误页只返回 HTTP 状态，避免把整页内容写入会话。
  }
  return `卡牌封面生成失败：HTTP ${status}。`;
}

export class ImageCardCoverGenerator {
  private readonly request: AiServiceFetch;

  constructor(request: AiServiceFetch = fetch) {
    this.request = request.bind(globalThis);
  }

  async generate(
    config: AiServicesConfig,
    visualConcept: string,
    signal?: AbortSignal,
    promptOptions: CardCoverPromptOptions = {},
  ): Promise<GeneratedUserscriptCover> {
    const imageConfig = resolveImageServiceRuntimeConfig(config);
    const usesModelServiceCredential =
      config.imageService.credentialSource === 'model-service';
    const { baseUrl, apiKey, model } = imageConfig;
    if (!apiKey) {
      throw new Error(
        usesModelServiceCredential
          ? '图像生成正在沿用模型服务，请先配置模型服务 API 密钥，或改用独立图像服务。'
          : '图像服务尚未配置，请填写独立图像服务的 API 密钥。',
      );
    }

    const adapter = getImageGenerationAdapter(imageConfig.protocol);
    const response = await requestAiService(
      this.request,
      { apiKey },
      adapter.buildUrl(baseUrl),
      adapter.buildRequestBody({
        prompt: buildCardCoverPrompt(visualConcept, promptOptions),
        model,
        size: SOURCE_SIZE,
        count: 1,
        quality: 'low',
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
      throw new Error('图像服务返回了无效 JSON。');
    }
    const parsed = adapter.parseResponse(payload);
    if (!parsed) {
      throw new Error('图像服务没有返回图片。');
    }

    let source: Blob;
    if (parsed.b64) {
      source = blobFromBase64(parsed.b64);
    } else if (parsed.url) {
      if (!isSecureServiceUrl(parsed.url)) {
        throw new Error('图像服务返回了不安全的图片地址。');
      }
      const imageResponse = await this.request(parsed.url, {
        signal,
      });
      if (!imageResponse.ok) {
        throw new Error(`下载卡牌封面失败：HTTP ${imageResponse.status}。`);
      }
      if (imageResponse.url && !isSecureServiceUrl(imageResponse.url)) {
        throw new Error('卡牌封面下载被重定向到了不安全的地址。');
      }
      const mimeType =
        imageResponse.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      source = new Blob([await readAiServiceBytes(imageResponse, signal)], {
        type: mimeType,
      });
    } else {
      throw new Error('图像生成结果既没有图像数据，也没有图片地址。');
    }
    if (!source.type.startsWith('image/')) {
      throw new Error('卡牌封面生成结果不是图片。');
    }

    return optimizeUserscriptCoverImage(source);
  }
}
