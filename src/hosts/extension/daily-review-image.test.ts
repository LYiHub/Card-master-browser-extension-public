import { describe, expect, it, vi } from 'vitest';

import type { AiServicesConfig } from '../../ai/domain/types';
import {
  buildDailyReviewImageRequest,
  DailyReviewImageGenerator,
} from './daily-review-image';

const config: AiServicesConfig = {
  modelService: {
    baseUrl: 'https://api.example.com/v1',
    model: 'deepseek-v4-flash',
    protocol: 'responses',
    reasoningEffort: 'high',
    apiKey: 'model-key',
  },
  imageService: {
    credentialSource: 'model-service',
    protocol: 'openai-images',
    baseUrl: 'https://unused.example.com/v1',
    model: 'gpt-image-2',
    apiKey: '',
  },
  speechService: { apiKey: '' },
};

describe('DailyReviewImageGenerator', () => {
  it('requests the original 4K landscape output without post-processing', async () => {
    const webpData = 'UklGRgQAAABXRUJQ';
    let requestBody: Record<string, unknown> | null = null;
    const request = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            data: [{ b64_json: webpData }],
          }),
          { status: 200 },
        );
      },
    );
    const generator = new DailyReviewImageGenerator(request as typeof fetch);

    await expect(
      generator.generate(config, '一张完整连贯的生活回顾场景。'),
    ).resolves.toEqual({
      dataUrl: `data:image/webp;base64,${webpData}`,
      mimeType: 'image/webp',
      byteLength: 12,
      width: 3840,
      height: 2160,
      model: 'gpt-image-2',
    });
    expect(requestBody).toEqual({
      model: 'gpt-image-2',
      prompt: '一张完整连贯的生活回顾场景。',
      n: 1,
      size: '3840x2160',
      quality: 'high',
      output_format: 'webp',
    });
  });

  it('accepts a complete image data URL returned in b64_json', async () => {
    const pngData = 'iVBORw0KGgo=';
    const request = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [{ b64_json: `data:image/png;base64,${pngData}` }],
        }),
        { status: 200 },
      );
    });
    const generator = new DailyReviewImageGenerator(request as typeof fetch);

    await expect(
      generator.generate(config, '一张完整连贯的生活回顾场景。'),
    ).resolves.toMatchObject({
      dataUrl: `data:image/png;base64,${pngData}`,
      mimeType: 'image/png',
      byteLength: 8,
    });
  });

  it('rejects image payloads that cannot be displayed', async () => {
    const request = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [{ b64_json: 'bm90LWFuLWltYWdl' }],
        }),
        { status: 200 },
      );
    });
    const generator = new DailyReviewImageGenerator(request as typeof fetch);

    await expect(
      generator.generate(config, '一张完整连贯的生活回顾场景。'),
    ).rejects.toThrow('无法识别的图片格式');
  });

  it('rejects empty prompts before contacting the image service', () => {
    expect(() => buildDailyReviewImageRequest('   ')).toThrow(
      '每日回顾提示词不能为空',
    );
  });

  it('rejects English daily review prompts before contacting the image service', () => {
    expect(() =>
      buildDailyReviewImageRequest('A complete English wallpaper prompt.'),
    ).toThrow('每日回顾提示词必须使用简体中文');
  });
});
