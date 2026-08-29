import { describe, expect, it } from 'vitest';

import { openaiImagesAdapter } from './openai-images-adapter';

describe('openaiImagesAdapter', () => {
  it('has correct protocol metadata', () => {
    expect(openaiImagesAdapter.protocol).toBe('openai-images');
    expect(openaiImagesAdapter.label).toBe('OpenAI Images API');
    expect(openaiImagesAdapter.defaultBaseUrl).toBe(
      'https://api.openai.com/v1',
    );
    expect(openaiImagesAdapter.defaultModel).toBe('gpt-image-2');
  });

  it('buildUrl appends /images/generations to baseUrl', () => {
    expect(openaiImagesAdapter.buildUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/images/generations',
    );
    expect(openaiImagesAdapter.buildUrl('https://custom.example/v1')).toBe(
      'https://custom.example/v1/images/generations',
    );
  });

  it('buildRequestBody includes required fields and optional quality/outputFormat', () => {
    const body = openaiImagesAdapter.buildRequestBody({
      prompt: 'a cat',
      model: 'gpt-image-2',
      size: '1024x1024',
      count: 2,
      quality: 'high',
      outputFormat: 'webp',
    });
    expect(body).toEqual({
      model: 'gpt-image-2',
      prompt: 'a cat',
      n: 2,
      size: '1024x1024',
      quality: 'high',
      output_format: 'webp',
    });
  });

  it('buildRequestBody omits quality and outputFormat when not provided', () => {
    const body = openaiImagesAdapter.buildRequestBody({
      prompt: 'a cat',
      model: 'gpt-image-2',
      size: '1024x1024',
    });
    expect(body).toEqual({
      model: 'gpt-image-2',
      prompt: 'a cat',
      n: 1,
      size: '1024x1024',
    });
    expect(body).not.toHaveProperty('quality');
    expect(body).not.toHaveProperty('output_format');
  });

  it('parseResponse extracts b64_json from first data element', () => {
    const result = openaiImagesAdapter.parseResponse({
      data: [
        { b64_json: 'base64data' },
        { url: 'https://example.com/img.png' },
      ],
    });
    expect(result).toEqual({ b64: 'base64data' });
  });

  it('parseResponse falls back to url when b64_json is absent', () => {
    const result = openaiImagesAdapter.parseResponse({
      data: [{ url: 'https://example.com/img.png' }],
    });
    expect(result).toEqual({ url: 'https://example.com/img.png' });
  });

  it('parseResponse returns null for empty data array', () => {
    expect(openaiImagesAdapter.parseResponse({ data: [] })).toBeNull();
  });

  it('parseResponse returns null for non-object payload', () => {
    expect(openaiImagesAdapter.parseResponse(null)).toBeNull();
    expect(openaiImagesAdapter.parseResponse('string')).toBeNull();
    expect(openaiImagesAdapter.parseResponse(42)).toBeNull();
  });

  it('parseResponse returns null when data is not an array', () => {
    expect(openaiImagesAdapter.parseResponse({ data: 'not-array' })).toBeNull();
  });
});
