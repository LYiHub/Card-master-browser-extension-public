import { describe, expect, it } from 'vitest';

import {
  extensionSpeechCapability,
  extensionSpeechServiceConfigured,
} from './speech-capability';

describe('extension speech capability', () => {
  it('enables background speech only for Chromium builds', () => {
    expect(extensionSpeechCapability('chromium')).toEqual({
      available: true,
      title: '',
      message: '',
    });
    expect(extensionSpeechCapability('firefox')).toEqual({
      available: false,
      title: 'Firefox 暂不支持语音输入',
      message: '请使用 Chrome、Edge 等 Chromium 浏览器。',
    });
    expect(extensionSpeechCapability('safari')).toEqual({
      available: false,
      title: 'Safari 暂不支持语音输入',
      message: '请使用 Chrome、Edge 等 Chromium 浏览器。',
    });
  });

  it('accepts only an explicit saved speech credential', () => {
    expect(
      extensionSpeechServiceConfigured({
        config: { speechService: { hasCredential: true } },
      }),
    ).toBe(true);
    expect(
      extensionSpeechServiceConfigured({
        config: { speechService: { hasCredential: false } },
      }),
    ).toBe(false);
    expect(extensionSpeechServiceConfigured({ error: '读取失败' })).toBe(false);
  });
});
