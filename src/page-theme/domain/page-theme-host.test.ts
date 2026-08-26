import { describe, expect, it } from 'vitest';

import { defaultPageThemeSettings, togglePageThemeHost } from './types';

describe('暗夜降临站点规则', () => {
  it('让同一根域名下的不同子域共享启停规则', () => {
    const enabled = togglePageThemeHost(
      defaultPageThemeSettings(),
      'https://drrxacydkj.feishu.cn/',
    );

    expect(enabled.enabledFor).toEqual(['feishu.cn']);

    const disabled = togglePageThemeHost(enabled, 'https://docs.feishu.cn/');

    expect(disabled.enabledFor).toEqual([]);
    expect(disabled.disabledFor).toEqual(['feishu.cn']);
  });
});
