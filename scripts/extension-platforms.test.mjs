import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTENSION_PLATFORM,
  parseExtensionPlatform,
} from './extension-platforms.mjs';

describe('extension platform arguments', () => {
  it('defaults to Chromium and preserves the commit message', () => {
    expect(parseExtensionPlatform(['remove card labels'])).toEqual({
      platform: DEFAULT_EXTENSION_PLATFORM,
      positional: ['remove card labels'],
    });
  });

  it('accepts one explicit browser platform', () => {
    expect(
      parseExtensionPlatform(['release Firefox build', '--platform=firefox']),
    ).toEqual({
      platform: 'firefox',
      positional: ['release Firefox build'],
    });
  });

  it('rejects duplicate, unknown, and unsupported options', () => {
    expect(() =>
      parseExtensionPlatform([
        'release all builds',
        '--platform=all',
        '--platform=safari',
      ]),
    ).toThrow('平台参数只能指定一次');
    expect(() => parseExtensionPlatform(['message', '--force'])).toThrow(
      '未知参数',
    );
    expect(() =>
      parseExtensionPlatform(['message', '--platform=webkit']),
    ).toThrow('不支持的扩展平台');
  });
});
