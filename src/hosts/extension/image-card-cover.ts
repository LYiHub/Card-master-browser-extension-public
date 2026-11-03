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
import { t } from '../../localization/messages';
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
  if (!concept) throw new Error(t('cm_image_card_cover_error_1'));
  if (requireEnglish && !isCardCoverVisualConceptText(concept)) {
    throw new Error(t('cm_image_card_cover_error_2'));
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
      if (detail) return t('cm_image_card_cover_text_3', [String(detail)]);
    }
  } catch {
    // 非 JSON 错误页只返回 HTTP 状态，避免把整页内容写入会话。
  }
  return t('cm_image_card_cover_text_4', [String(status)]);
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
          ? t('cm_image_card_cover_text_5')
          : t('cm_image_card_cover_text_6'),
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
      throw new Error(t('cm_image_card_cover_error_7'));
    }
    const parsed = adapter.parseResponse(payload);
    if (!parsed) {
      throw new Error(t('cm_image_card_cover_error_8'));
    }

    let source: Blob;
    if (parsed.b64) {
      source = blobFromBase64(parsed.b64);
    } else if (parsed.url) {
      if (!isSecureServiceUrl(parsed.url)) {
        throw new Error(t('cm_image_card_cover_error_9'));
      }
      const imageResponse = await this.request(parsed.url, {
        signal,
      });
      if (!imageResponse.ok) {
        throw new Error(
          t('cm_image_card_cover_error_10', [String(imageResponse.status)]),
        );
      }
      if (imageResponse.url && !isSecureServiceUrl(imageResponse.url)) {
        throw new Error(t('cm_image_card_cover_error_11'));
      }
      const mimeType =
        imageResponse.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      source = new Blob([await readAiServiceBytes(imageResponse, signal)], {
        type: mimeType,
      });
    } else {
      throw new Error(t('cm_image_card_cover_error_12'));
    }
    if (!source.type.startsWith('image/')) {
      throw new Error(t('cm_image_card_cover_error_13'));
    }

    return optimizeUserscriptCoverImage(source);
  }
}
