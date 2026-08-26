import { describe, expect, it } from 'vitest';
import { resolveSiteScope } from './site-scope';

describe('resolveSiteScope', () => {
  it.each([
    [
      'https://drrxacydkj.feishu.cn/docs/example',
      { host: 'feishu.cn', matchPattern: '*://*.feishu.cn/*' },
    ],
    [
      'https://a.example.co.uk/path',
      { host: 'example.co.uk', matchPattern: '*://*.example.co.uk/*' },
    ],
    [
      'http://localhost:5173/',
      { host: 'localhost', matchPattern: '*://localhost/*' },
    ],
    [
      'http://127.0.0.1:5173/',
      { host: '127.0.0.1', matchPattern: '*://127.0.0.1/*' },
    ],
  ])('将 %s 解析为统一站点作用域', (url, expected) => {
    expect(resolveSiteScope(url)).toEqual(expected);
  });

  it('拒绝无效地址', () => {
    expect(resolveSiteScope('not-a-url')).toBeNull();
  });
});
