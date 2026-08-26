import { describe, expect, it } from 'vitest';

import {
  fetchExtensionText,
  normalizeExtensionSourceUrl,
} from './source-fetch';

describe('extension source fetch', () => {
  it('normalizes safe remote sources and strips fragments', () => {
    expect(
      normalizeExtensionSourceUrl(
        'https://example.com/script.user.js#metadata',
      ),
    ).toBe('https://example.com/script.user.js');
  });

  it('rejects executable and credential-bearing source URLs', () => {
    expect(() => normalizeExtensionSourceUrl('javascript:alert(1)')).toThrow(
      '不支持',
    );
    expect(() =>
      normalizeExtensionSourceUrl(
        'https://user:secret@example.com/script.user.js',
      ),
    ).toThrow('登录凭据');
  });

  it('returns bounded source with its final redirect URL', async () => {
    const response = new Response('// ==UserScript==', { status: 200 });
    Object.defineProperty(response, 'url', {
      value: 'https://cdn.example.com/final.user.js',
    });

    await expect(
      fetchExtensionText(
        'https://example.com/script.user.js',
        async () => response,
      ),
    ).resolves.toEqual({
      ok: true,
      status: 200,
      body: '// ==UserScript==',
      finalUrl: 'https://cdn.example.com/final.user.js',
    });
  });
});
