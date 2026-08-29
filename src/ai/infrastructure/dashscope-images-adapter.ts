import type {
  ImageGenerationProtocolAdapter,
  ImageGenerationRequestInput,
} from '../domain/image-generation-protocol';

export const dashscopeImagesAdapter: ImageGenerationProtocolAdapter = {
  protocol: 'dashscope',
  label: '阿里云百炼（DashScope）',
  description:
    '使用阿里云百炼 Z-Image 系列多模态生成接口，返回临时图片 URL（24 小时有效）。',
  defaultBaseUrl: 'https://dashscope.aliyuncs.com',

  buildUrl(baseUrl: string): string {
    return `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`;
  },

  buildRequestBody(
    input: ImageGenerationRequestInput,
  ): Record<string, unknown> {
    return {
      model: input.model,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: input.prompt }],
          },
        ],
      },
      parameters: {
        size: input.size.replace('x', '*'),
        prompt_extend: false,
      },
    };
  },

  parseResponse(payload: unknown): { url?: string; b64?: string } | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    const record = payload as Record<string, unknown>;
    const output = record.output as Record<string, unknown> | undefined;
    if (!output || typeof output !== 'object') return null;
    const choices = output.choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;
    const firstChoice = choices[0] as Record<string, unknown> | undefined;
    if (!firstChoice || typeof firstChoice !== 'object') return null;
    const message = firstChoice.message as Record<string, unknown> | undefined;
    if (!message || typeof message !== 'object') return null;
    const content = message.content;
    if (!Array.isArray(content)) return null;
    for (const item of content) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entry = item as Record<string, unknown>;
        if (typeof entry.image === 'string' && entry.image) {
          return { url: entry.image };
        }
      }
    }
    return null;
  },
};
