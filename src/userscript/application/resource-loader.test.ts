import { describe, expect, it, vi } from 'vitest';

import { INITIAL_USERSCRIPTS } from '../fixtures';
import { UserscriptResourceLoader } from './resource-loader';

describe('UserscriptResourceLoader', () => {
  it('loads dependencies in order and exposes named resource text and data URLs', async () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        requires: [
          'https://example.com/first.js',
          'https://example.com/second.js',
        ],
        resources: {
          theme: 'https://example.com/theme.css',
        },
      },
    };
    const fetcher = vi.fn(async (url: string) => {
      const body = url.endsWith('.css') ? 'body { color: red; }' : `// ${url}`;
      return new Response(body, {
        headers: {
          'content-type': url.endsWith('.css')
            ? 'text/css; charset=utf-8'
            : 'text/javascript',
        },
      });
    });
    const loader = new UserscriptResourceLoader(fetcher);

    const bundle = await loader.load(script);

    expect(bundle.requires).toEqual([
      '// https://example.com/first.js',
      '// https://example.com/second.js',
    ]);
    expect(bundle.resources.theme.text).toBe('body { color: red; }');
    expect(bundle.resources.theme.dataUrl).toMatch(/^data:text\/css;base64,/);
    await loader.load(script);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('deduplicates the same URL only within one resource load', async () => {
    const sharedUrl = 'https://example.com/shared.js';
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        requires: [sharedUrl],
        resources: { shared: sharedUrl },
      },
    };
    const fetcher = vi.fn(async () => new Response('const shared = true;'));
    const loader = new UserscriptResourceLoader(fetcher);

    await loader.load(script);
    expect(fetcher).toHaveBeenCalledOnce();
    await loader.load(script);
    expect(fetcher).toHaveBeenCalledOnce();
    await loader.load({
      ...script,
      source: {
        ...script.source,
        code: `${script.source.code}\n`,
        updatedAt: script.source.updatedAt + 1,
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects failed and unsupported resource URLs explicitly', async () => {
    const failed = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        requires: ['https://example.com/failure.js'],
      },
    };
    await expect(
      new UserscriptResourceLoader(
        vi.fn(async () => new Response('', { status: 503 })),
      ).load(failed),
    ).rejects.toThrow('HTTP 503');

    const unsupported = {
      ...failed,
      metadata: {
        ...failed.metadata,
        requires: ['file:///tmp/dependency.js'],
      },
    };
    await expect(
      new UserscriptResourceLoader(vi.fn()).load(unsupported),
    ).rejects.toThrow('不支持此用户脚本资源地址');
  });

  it('loads standard data URL resources without a network dependency', async () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        requires: ['data:text/javascript,const%20answer%20%3D%2042%3B'],
        resources: {
          label: 'data:text/plain;charset=utf-8,Card%20Master',
        },
      },
    };
    const loader = new UserscriptResourceLoader((url, init) =>
      fetch(url, init),
    );

    await expect(loader.load(script)).resolves.toMatchObject({
      requires: ['const answer = 42;'],
      resources: {
        label: {
          text: 'Card Master',
        },
      },
    });
  });

  it('rejects oversized resources before they enter the script bundle', async () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        requires: ['https://example.com/oversized.js'],
      },
    };
    const loader = new UserscriptResourceLoader(
      vi.fn(
        async () =>
          new Response('small', {
            headers: { 'content-length': String(8 * 1024 * 1024 + 1) },
          }),
      ),
    );

    await expect(loader.load(script)).rejects.toThrow('8 MB');
  });
});
