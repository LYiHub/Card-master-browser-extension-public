import { describe, expect, it, vi } from 'vitest';
import type { AiServicesConfig } from '../../ai/domain/types';

import {
  buildCardCoverPrompt,
  buildCardCoverRequest,
  ImageCardCoverGenerator,
} from './image-card-cover';

const sharedServices: AiServicesConfig = {
  modelService: {
    baseUrl: 'https://router.example/v1',
    model: 'gpt-5.5',
    protocol: 'responses' as const,
    reasoningEffort: 'high' as const,
    apiKey: 'shared-secret',
  },
  imageService: {
    credentialSource: 'model-service' as const,
    protocol: 'openai-images' as const,
    baseUrl: 'https://router.example/v1',
    model: 'gpt-image-2',
    apiKey: '',
  },
  speechService: { apiKey: '' },
};

describe('卡牌封面生成', () => {
  it('只注入统一画风并保留用户构图自由与 OpenAI 兼容参数', () => {
    const prompt = buildCardCoverPrompt(
      'A night watchman sealing distracting page elements inside an iron reliquary',
    );

    expect(prompt).toContain(
      'bright whimsical hand-painted fantasy trading-card key art',
    );
    expect(prompt).toContain('broad painterly brushwork');
    expect(prompt).toContain(
      'A night watchman sealing distracting page elements inside an iron reliquary',
    );
    expect(prompt).not.toContain('composition');
    expect(prompt).not.toContain('camera angle');
    expect(prompt).not.toContain('stable pre-action anchor');
    expect(prompt).not.toContain('primarily in the left side');
    expect(prompt).not.toContain('overlap-safe zone');
    expect(prompt).not.toContain('exact 3:4 card ratio');
    expect(buildCardCoverRequest(prompt)).toMatchObject({
      model: 'gpt-image-2',
      prompt,
      n: 1,
      size: '720x960',
      quality: 'low',
      output_format: 'webp',
    });
  });

  it('可以沿用模型服务的 Base URL 与 Bearer API Key', async () => {
    const request = vi.fn(async (..._args: Parameters<typeof fetch>) => {
      return new Response(
        JSON.stringify({ error: { message: 'request inspected' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const generator = new ImageCardCoverGenerator(request as typeof fetch);

    await expect(
      generator.generate(
        sharedServices,
        'A librarian forging a browser spell into an illustrated card',
      ),
    ).rejects.toThrow('request inspected');

    expect(request).toHaveBeenCalledWith(
      'https://router.example/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer shared-secret',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('使用独立图像服务的地址、密钥和模型', async () => {
    const request = vi.fn(async (..._args: Parameters<typeof fetch>) => {
      return new Response(
        JSON.stringify({ error: { message: 'request inspected' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const generator = new ImageCardCoverGenerator(request as typeof fetch);

    await expect(
      generator.generate(
        {
          modelService: {
            baseUrl: 'https://chat.example/v1',
            model: 'deepseek-v4-flash',
            protocol: 'chat-completions',
            reasoningEffort: 'high',
            apiKey: '',
          },
          imageService: {
            credentialSource: 'independent',
            protocol: 'openai-images',
            baseUrl: 'https://images.example/v1',
            model: 'custom-image-model',
            apiKey: 'image-secret',
          },
          speechService: { apiKey: '' },
        },
        'A librarian forging a browser spell into an illustrated card',
      ),
    ).rejects.toThrow('request inspected');

    expect(request).toHaveBeenCalledWith(
      'https://images.example/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer image-secret',
          'Content-Type': 'application/json',
        },
      }),
    );
    const requestBody = JSON.parse(
      String(request.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(requestBody.model).toBe('custom-image-model');
  });

  it('拒绝中文视觉概念', () => {
    expect(() => buildCardCoverPrompt('一名守卫正在清理页面广告')).toThrow(
      '必须使用英文描述',
    );
  });

  it('允许设置页关闭默认风格并原样使用中英文提示词', () => {
    const customPrompt = '水彩拼贴风格，一个戴红帽的机械师正在整理书架';
    expect(
      buildCardCoverPrompt(customPrompt, {
        injectDefaultStyle: false,
        requireEnglish: false,
      }),
    ).toBe(customPrompt);
    expect(
      buildCardCoverPrompt(customPrompt, {
        injectDefaultStyle: true,
        requireEnglish: false,
      }),
    ).toContain('bright whimsical hand-painted fantasy trading-card key art');
  });

  it('拒绝图像服务返回的不安全下载地址', async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ url: 'http://images.example/generated.png' }],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const generator = new ImageCardCoverGenerator(request as typeof fetch);

    await expect(
      generator.generate(
        sharedServices,
        'A librarian forging a browser spell into an illustrated card',
      ),
    ).rejects.toThrow('不安全的图片地址');
    expect(request).toHaveBeenCalledOnce();
  });
});
