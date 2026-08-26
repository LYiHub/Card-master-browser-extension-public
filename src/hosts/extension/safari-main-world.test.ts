import { describe, expect, it } from 'vitest';
import { safariMainWorldScripts } from './safari-main-world';

describe('Safari main-world scripts', () => {
  it('uses theme and media proxies on every supported page', () => {
    expect(safariMainWorldScripts('https://example.com/', true)).toEqual([
      'theme-proxy.js',
      'media-speed-proxy.js',
    ]);
  });

  it('adds Bilibili frame scripts without duplicating top-frame scripts', () => {
    expect(
      safariMainWorldScripts('https://www.bilibili.com/video/BV1xx', false),
    ).toEqual([
      'theme-proxy.js',
      'media-speed-proxy.js',
      'vendor/bilibili/sponsor/js/document.js',
    ]);
    expect(
      safariMainWorldScripts('https://www.bilibili.com/video/BV1xx', true),
    ).toEqual([
      'theme-proxy.js',
      'media-speed-proxy.js',
      'vendor/bilibili/sponsor/js/document.js',
      'bilibili-recommendation-proxy.js',
    ]);
  });

  it('adds the original SponsorBlock page runtime on YouTube frames', () => {
    expect(
      safariMainWorldScripts('https://www.youtube.com/watch?v=video', false),
    ).toEqual([
      'theme-proxy.js',
      'media-speed-proxy.js',
      'vendor/youtube/sponsor/js/document.js',
    ]);
    expect(
      safariMainWorldScripts(
        'https://www.youtube-nocookie.com/embed/video',
        true,
      ),
    ).toEqual([
      'theme-proxy.js',
      'media-speed-proxy.js',
      'vendor/youtube/sponsor/js/document.js',
    ]);
  });
});
