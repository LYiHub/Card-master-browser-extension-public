import type {
  ImageGenerationProtocolAdapter,
  ImageGenerationRequestInput,
  ImageGenerationResult,
} from '../domain/image-generation-protocol';

const MIN_IMAGE_SIDE = 512;
const MAX_IMAGE_SIDE = 2048;
const IMAGE_SIDE_STEP = 32;

function dashscopeSize(value: string) {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) throw new Error(`百炼图像尺寸格式无效：${value}`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    width >= MIN_IMAGE_SIDE &&
    width <= MAX_IMAGE_SIDE &&
    height >= MIN_IMAGE_SIDE &&
    height <= MAX_IMAGE_SIDE
  ) {
    return `${width}*${height}`;
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / width, MAX_IMAGE_SIDE / height);
  const scaledWidth =
    Math.floor((width * scale) / IMAGE_SIDE_STEP) * IMAGE_SIDE_STEP;
  const scaledHeight =
    Math.floor((height * scale) / IMAGE_SIDE_STEP) * IMAGE_SIDE_STEP;
  if (scaledWidth < MIN_IMAGE_SIDE || scaledHeight < MIN_IMAGE_SIDE) {
    throw new Error(`百炼图像尺寸超出支持范围：${value}`);
  }
  return `${scaledWidth}*${scaledHeight}`;
}

export const dashscopeImagesAdapter: ImageGenerationProtocolAdapter = {
  protocol: 'dashscope',
  label: '阿里云百炼（DashScope）',
  description:
    '使用阿里云百炼同步图像生成接口，返回临时图片 URL（24 小时有效）。',
  defaultBaseUrl: 'https://dashscope.aliyuncs.com',
  defaultModel: 'qwen-image-3.0',

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
        size: dashscopeSize(input.size),
        prompt_extend: false,
      },
    };
  },

  parseResponse(payload: unknown): ImageGenerationResult | null {
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
          const usage = record.usage;
          const usageRecord =
            usage && typeof usage === 'object' && !Array.isArray(usage)
              ? (usage as Record<string, unknown>)
              : null;
          const widthValue = usageRecord?.output_width ?? usageRecord?.width;
          const heightValue = usageRecord?.output_height ?? usageRecord?.height;
          const width =
            Number.isSafeInteger(widthValue) && Number(widthValue) > 0
              ? Number(widthValue)
              : undefined;
          const height =
            Number.isSafeInteger(heightValue) && Number(heightValue) > 0
              ? Number(heightValue)
              : undefined;
          return {
            url: entry.image,
            ...(width && height ? { width, height } : {}),
          };
        }
      }
    }
    return null;
  },
};
