import { describe, expect, it } from 'vitest';

import { dashscopeImagesAdapter } from './dashscope-images-adapter';

describe('dashscopeImagesAdapter', () => {
  it('has correct protocol metadata', () => {
    expect(dashscopeImagesAdapter.protocol).toBe('dashscope');
    expect(dashscopeImagesAdapter.label).toBe('阿里云百炼（DashScope）');
    expect(dashscopeImagesAdapter.defaultBaseUrl).toBe(
      'https://dashscope.aliyuncs.com',
    );
    expect(dashscopeImagesAdapter.defaultModel).toBe('qwen-image-3.0');
  });

  it('buildUrl appends the multimodal-generation path', () => {
    expect(
      dashscopeImagesAdapter.buildUrl('https://dashscope.aliyuncs.com'),
    ).toBe(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    );
    expect(dashscopeImagesAdapter.buildUrl('https://custom.example')).toBe(
      'https://custom.example/api/v1/services/aigc/multimodal-generation/generation',
    );
  });

  it('buildRequestBody uses star separator in size and wraps prompt in messages', () => {
    const body = dashscopeImagesAdapter.buildRequestBody({
      prompt: '一只猫',
      model: 'z-image-turbo',
      size: '1024x768',
      count: 2,
      quality: 'high',
      outputFormat: 'webp',
    });
    expect(body).toEqual({
      model: 'z-image-turbo',
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: '一只猫' }],
          },
        ],
      },
      parameters: {
        size: '1024*768',
        prompt_extend: false,
      },
    });
    // dashscope ignores count/quality/outputFormat
    expect(body).not.toHaveProperty('n');
    expect(body).not.toHaveProperty('quality');
    expect(body).not.toHaveProperty('output_format');
  });

  it('parseResponse extracts image URL from output.choices[0].message.content', () => {
    const result = dashscopeImagesAdapter.parseResponse({
      output: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: [
                { image: 'https://oss.example/img.png?Expires=123', text: '' },
              ],
            },
          },
        ],
      },
      usage: { width: 1024, height: 768, image_count: 1 },
      request_id: 'test-123',
    });
    expect(result).toEqual({
      url: 'https://oss.example/img.png?Expires=123',
      width: 1024,
      height: 768,
    });
  });

  it('scales existing 4K wallpaper sizes into the supported range', () => {
    const body = dashscopeImagesAdapter.buildRequestBody({
      prompt: '一片森林',
      model: 'z-image-turbo',
      size: '3840x2160',
    });
    expect(body).toMatchObject({
      parameters: { size: '2048*1152' },
    });
  });

  it('rejects aspect ratios that cannot keep both sides in range', () => {
    expect(() =>
      dashscopeImagesAdapter.buildRequestBody({
        prompt: '一片森林',
        model: 'z-image-turbo',
        size: '4096x512',
      }),
    ).toThrow('超出支持范围');
  });

  it('parseResponse skips non-image content entries', () => {
    const result = dashscopeImagesAdapter.parseResponse({
      output: {
        choices: [
          {
            message: {
              content: [
                { text: 'description' },
                { image: 'https://img.test/a.png' },
              ],
            },
          },
        ],
      },
    });
    expect(result).toEqual({ url: 'https://img.test/a.png' });
  });

  it('reads qwen-image 3.0 output dimensions', () => {
    expect(
      dashscopeImagesAdapter.parseResponse({
        output: {
          choices: [
            { message: { content: [{ image: 'https://img.test/qwen.png' }] } },
          ],
        },
        usage: { output_width: 1536, output_height: 864 },
      }),
    ).toEqual({
      url: 'https://img.test/qwen.png',
      width: 1536,
      height: 864,
    });
  });

  it('parseResponse returns null for error response format', () => {
    expect(
      dashscopeImagesAdapter.parseResponse({
        code: 'InvalidApiKey',
        message: 'Invalid API key',
        request_id: 'err-123',
      }),
    ).toBeNull();
  });

  it('parseResponse returns null for missing output or choices', () => {
    expect(dashscopeImagesAdapter.parseResponse(null)).toBeNull();
    expect(dashscopeImagesAdapter.parseResponse({})).toBeNull();
    expect(dashscopeImagesAdapter.parseResponse({ output: {} })).toBeNull();
    expect(
      dashscopeImagesAdapter.parseResponse({ output: { choices: [] } }),
    ).toBeNull();
  });

  it('parseResponse returns null when content has no image field', () => {
    expect(
      dashscopeImagesAdapter.parseResponse({
        output: {
          choices: [{ message: { content: [{ text: 'no image here' }] } }],
        },
      }),
    ).toBeNull();
  });
});
