import { AI_IMAGE_GENERATION_MODEL } from '../domain/image-generation';
import type {
  ImageGenerationProtocolAdapter,
  ImageGenerationRequestInput,
  ImageGenerationResult,
} from '../domain/image-generation-protocol';

export const openaiImagesAdapter: ImageGenerationProtocolAdapter = {
  protocol: 'openai-images',
  label: 'OpenAI Images API',
  description:
    '使用 OpenAI 图片生成接口格式（/images/generations），返回 b64 或 URL。',
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultModel: AI_IMAGE_GENERATION_MODEL,

  buildUrl(baseUrl: string): string {
    return `${baseUrl}/images/generations`;
  },

  buildRequestBody(
    input: ImageGenerationRequestInput,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: input.model,
      prompt: input.prompt,
      n: input.count ?? 1,
      size: input.size,
    };
    if (input.quality) body.quality = input.quality;
    if (input.outputFormat) body.output_format = input.outputFormat;
    return body;
  },

  parseResponse(payload: unknown): ImageGenerationResult | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    const record = payload as Record<string, unknown>;
    if (!Array.isArray(record.data)) return null;
    const image = record.data.find(
      (item: unknown): item is Record<string, unknown> =>
        Boolean(item && typeof item === 'object' && !Array.isArray(item)),
    );
    if (!image) return null;
    if (typeof image.b64_json === 'string' && image.b64_json) {
      return { b64: image.b64_json };
    }
    if (typeof image.url === 'string' && image.url) {
      return { url: image.url };
    }
    return null;
  },
};
