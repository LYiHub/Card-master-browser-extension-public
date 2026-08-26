import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SpeechRecognitionSettings } from './SpeechRecognitionSettings';

describe('speech recognition settings capability', () => {
  it('shows a neutral platform explanation without exposing credential input', () => {
    const markup = renderToStaticMarkup(
      <SpeechRecognitionSettings
        capability={{
          available: false,
          title: 'Safari 暂不支持语音输入',
          message: '请使用 Chrome、Edge 等 Chromium 浏览器。',
        }}
        config={null}
        permissionState="unavailable"
        onConfigChange={() => undefined}
      />,
    );

    expect(markup).toContain('Safari 暂不支持语音输入');
    expect(markup).toContain('请使用 Chrome、Edge 等 Chromium 浏览器');
    expect(markup).not.toContain('输入语音识别 API 密钥');
    expect(markup).not.toContain('保存语音配置');
    expect(markup).not.toContain('测试连接');
  });

  it('uses the shared loader for every assistant service operation', () => {
    for (const filename of [
      'ImageServiceSettings.tsx',
      'ModelServiceSettings.tsx',
      'SpeechRecognitionSettings.tsx',
    ]) {
      const source = readFileSync(
        new URL(`./${filename}`, import.meta.url),
        'utf8',
      );

      expect(source).toContain('<UiLoader');
      expect(source).toContain('cm-assistant-service-loader');
      expect(source).not.toContain("busy ? '正在");
    }
  });
});
