import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExtensionBackgroundApi } from './api';
import { refreshExtensionPageHosts } from './page-host-refresh';

afterEach(() => vi.unstubAllGlobals());

describe('extension page host refresh', () => {
  it('记录具体的脚本注入失败并继续恢复其他页面宿主', async () => {
    const executeScript = vi.fn(async (injection: { files?: string[] }) => {
      if (injection.files?.[0] === 'theme-content.js') {
        throw new Error('Bundled script execution failed');
      }
      return [];
    });
    const api = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 17,
            url: 'https://space.bilibili.com/0/upload/video',
          },
        ]),
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(true),
      },
      scripting: { executeScript },
    } as unknown as ExtensionBackgroundApi;
    const write = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await refreshExtensionPageHosts(api);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        '[Card Master][page-host-refresh] script-injection-failed',
      ),
      expect.objectContaining({
        details: {
          tabId: 17,
          url: 'https://space.bilibili.com/0/upload/video',
          file: 'theme-content.js',
          allFrames: true,
          world: 'ISOLATED',
        },
      }),
    );
    expect(executeScript).toHaveBeenCalledTimes(11);
    write.mockRestore();
  });

  it('没有站点访问权限时不触发脚本注入', async () => {
    const executeScript = vi.fn();
    const api = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 18,
            url: 'https://example.com/',
          },
        ]),
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(false),
      },
      scripting: { executeScript },
    } as unknown as ExtensionBackgroundApi;

    await refreshExtensionPageHosts(api);

    expect(executeScript).not.toHaveBeenCalled();
  });

  it('不会把站点专用 vendor runtime 注入无关页面', async () => {
    const executeScript = vi.fn().mockResolvedValue([]);
    const api = {
      tabs: {
        query: vi
          .fn()
          .mockResolvedValue([{ id: 22, url: 'https://antura.org/en/' }]),
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(true),
      },
      scripting: { executeScript },
    } as unknown as ExtensionBackgroundApi;

    await refreshExtensionPageHosts(api);

    const files = executeScript.mock.calls.map(
      ([injection]) => injection.files?.[0],
    );
    expect(files).not.toContain('vendor/youtube/sponsor/js/content.js');
    expect(files).not.toContain('vendor/bilibili/sponsor/js/content.js');
    expect(files).not.toContain(
      'vendor/bilibili/pakku/generated/content_script.js',
    );
  });

  it('只在 B 站播放器页注入赞助脚本', async () => {
    const executeScript = vi.fn().mockResolvedValue([]);
    const api = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 23,
            url: 'https://space.bilibili.com/0/favlist?fid=0',
          },
          {
            id: 24,
            url: 'https://www.bilibili.com/video/BV1xx411c7mD/',
          },
        ]),
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(true),
      },
      scripting: { executeScript },
    } as unknown as ExtensionBackgroundApi;

    await refreshExtensionPageHosts(api);

    const filesFor = (tabId: number) =>
      executeScript.mock.calls
        .filter(([injection]) => injection.target.tabId === tabId)
        .map(([injection]) => injection.files?.[0]);
    expect(filesFor(23)).not.toContain('vendor/bilibili/sponsor/js/content.js');
    expect(filesFor(24)).toContain('vendor/bilibili/sponsor/js/content.js');
  });

  it('页面拒绝访问后停止同一页面的后续注入', async () => {
    const executeScript = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
        ),
      );
    const api = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 19,
            url: 'https://example.com/',
          },
        ]),
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(true),
      },
      scripting: { executeScript },
    } as unknown as ExtensionBackgroundApi;
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await refreshExtensionPageHosts(api);

    expect(executeScript).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('Safari 先恢复隔离世界宿主，再请求原生主世界增强', async () => {
    vi.stubGlobal('__EXTENSION_TARGET__', 'safari');
    const executeScript = vi.fn(
      async (_injection: { files?: string[]; world?: string }) => [],
    );
    const api = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          {
            id: 20,
            url: 'https://example.com/',
          },
        ]),
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(true),
      },
      scripting: { executeScript },
    } as unknown as ExtensionBackgroundApi;

    await refreshExtensionPageHosts(api);

    expect(
      executeScript.mock.calls.map(([injection]) => injection.files?.[0]),
    ).toEqual([
      'adguard-content.js',
      'theme-content.js',
      'media-speed-proxy.js',
      'gamepad-content.js',
      'media-speed-content.js',
      'content.js',
      'safari-main-world-bootstrap.js',
    ]);
    expect(
      executeScript.mock.calls.every(([injection]) => !('world' in injection)),
    ).toBe(true);
    const gamepadInjection = executeScript.mock.calls.find(
      ([injection]) => injection.files?.[0] === 'gamepad-content.js',
    )?.[0];
    expect(gamepadInjection).toMatchObject({
      target: { allFrames: false },
    });
    expect(gamepadInjection).not.toHaveProperty('world');
  });

  it('Safari 忽略无法注入的旧标签页，不输出误导性错误', async () => {
    vi.stubGlobal('__EXTENSION_TARGET__', 'safari');
    const executeScript = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'Invalid call to scripting.executeScript(). Could not execute script on this tab.',
        ),
      );
    const api = {
      tabs: {
        query: vi
          .fn()
          .mockResolvedValue([{ id: 21, url: 'https://example.com/' }]),
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(true),
      },
      scripting: { executeScript },
    } as unknown as ExtensionBackgroundApi;
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await refreshExtensionPageHosts(api);

    expect(executeScript).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it.each([
    'No tab with id: 21',
    'Frame with ID 0 was removed.',
    'Frame with ID 0 is showing error page',
    'Blocked',
  ])('忽略扩展 reload 期间的注入竞态：%s', async (message) => {
    const executeScript = vi.fn().mockRejectedValue(new Error(message));
    const api = {
      tabs: {
        query: vi
          .fn()
          .mockResolvedValue([{ id: 21, url: 'https://example.com/' }]),
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(true),
      },
      scripting: { executeScript },
    } as unknown as ExtensionBackgroundApi;
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await refreshExtensionPageHosts(api);

    expect(executeScript).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
