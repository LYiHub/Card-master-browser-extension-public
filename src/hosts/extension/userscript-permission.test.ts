import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExtensionApi, ExtensionBackgroundApi } from './api';
import {
  requestUserscriptExecutionPermission,
  userscriptExecutionCapability,
} from './userscript-permission';

afterEach(() => vi.unstubAllGlobals());

describe('userscript permission', () => {
  it('reports a requestable Firefox permission instead of a generic failure', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Firefox/153.0' });

    await expect(
      userscriptExecutionCapability({
        permissions: { contains: vi.fn(async () => false) },
      } as unknown as ExtensionBackgroundApi),
    ).resolves.toEqual({
      status: 'permission-required',
      message: 'Firefox 需要先授权用户脚本执行权限。',
    });
  });

  it('requests Firefox userScripts permission and reloads after approval', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Firefox/153.0' });
    const request = vi.fn(async () => true);
    const reload = vi.fn();
    const api = {
      permissions: { request },
      runtime: { reload },
    } as unknown as ExtensionApi;

    await requestUserscriptExecutionPermission(api);

    expect(request).toHaveBeenCalledWith({ permissions: ['userScripts'] });
    expect(reload).toHaveBeenCalledOnce();
  });

  it('tells Chromium users to enable Allow User Scripts and reload', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36',
    });

    await expect(
      userscriptExecutionCapability({} as unknown as ExtensionBackgroundApi),
    ).resolves.toEqual({
      status: 'browser-setting-required',
      message:
        '请在扩展详情页开启“允许运行用户脚本”，然后重新加载扩展。Chrome 默认关闭这项开关。',
    });
  });

  it('uses the bundled Safari userscript runtime without a permission prompt', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 Version/27.0 Safari/620.1.14',
    });

    await expect(
      userscriptExecutionCapability({} as unknown as ExtensionBackgroundApi),
    ).resolves.toEqual({ status: 'available' });
  });
});
