import { describe, expect, it, vi } from 'vitest';

import { GreasyForkClient, normalizeGreasyForkSite } from './greasyfork-client';

function response(body: unknown, url: string) {
  const result = new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    {
      status: 200,
      headers: {
        'content-type':
          typeof body === 'string'
            ? 'text/javascript; charset=utf-8'
            : 'application/json; charset=utf-8',
      },
    },
  );
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

describe('Greasy Fork client', () => {
  it('从完整网址提取域名并拒绝非 HTTP、凭据和端口', () => {
    expect(normalizeGreasyForkSite('https://WWW.YouTube.com/watch?v=1')).toBe(
      'www.youtube.com',
    );
    expect(() => normalizeGreasyForkSite('file:///tmp/page')).toThrow('只支持');
    expect(() =>
      normalizeGreasyForkSite('https://user:secret@example.com/'),
    ).toThrow('无凭据');
    expect(() => normalizeGreasyForkSite('https://example.com:8443/')).toThrow(
      '无端口',
    );
    expect(() => normalizeGreasyForkSite('http://127.0.0.1/')).toThrow(
      '公开网站域名',
    );
  });

  it('固定全部语言和每页 20 条，并返回精简摘要', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      response(
        {
          query: [
            {
              id: 30545,
              name: 'HTML5 视频播放工具',
              description: '视频控制与快捷键。',
              daily_installs: 12,
              total_installs: 34_567,
              fan_score: '88.5',
              good_ratings: 100,
              ok_ratings: 3,
              bad_ratings: 2,
              code_updated_at: '2026-07-30T00:00:00.000Z',
              users: [{ name: 'ignored' }],
              version: '9.9.9',
              license: 'MIT',
              code_url:
                'https://update.greasyfork.org/scripts/30545/example.user.js',
            },
          ],
        },
        String(input),
      ),
    );
    const result = await new GreasyForkClient(fetcher).search({
      site: 'https://youtube.com/watch?v=1',
      query: 'enhancer',
      sort: 'ratings',
      page: 2,
    });
    const requested = new URL(String(fetcher.mock.calls[0]?.[0]));

    expect(requested.origin).toBe('https://api.greasyfork.org');
    expect(requested.pathname).toBe('/en/scripts/by-site/youtube.com.json');
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      filter_locale: '0',
      language: 'all',
      per_page: '20',
      sort: 'ratings',
      page: '2',
      q: 'enhancer',
    });
    expect(result).toEqual({
      site: 'youtube.com',
      query: 'enhancer',
      sort: 'ratings',
      page: 2,
      pageSize: 20,
      hasMore: false,
      nextPage: null,
      scripts: [
        {
          id: 30545,
          name: 'HTML5 视频播放工具',
          description: '视频控制与快捷键。',
          dailyInstalls: 12,
          totalInstalls: 34_567,
          fanScore: 88.5,
          ratings: { good: 100, ok: 3, bad: 2 },
          updatedAt: '2026-07-30T00:00:00.000Z',
          detailUrl: 'https://greasyfork.org/scripts/30545',
        },
      ],
    });
    expect(result.scripts[0]).not.toHaveProperty('authors');
    expect(result.scripts[0]).not.toHaveProperty('version');
    expect(result.scripts[0]).not.toHaveProperty('license');
    expect(result.scripts[0]).not.toHaveProperty('codeUrl');
  });

  it('兼容未知站点返回的空数组', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      response([], String(input)),
    );

    await expect(
      new GreasyForkClient(fetcher).search({
        site: 'missing.example',
        query: null,
        sort: 'daily_installs',
        page: 1,
      }),
    ).resolves.toMatchObject({
      scripts: [],
      hasMore: false,
      nextPage: null,
    });
  });

  it('满 20 条时返回下一页位置', async () => {
    const scripts = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      name: `Script ${index + 1}`,
    }));
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      response({ query: scripts }, String(input)),
    );

    await expect(
      new GreasyForkClient(fetcher).search({
        site: 'example.com',
        query: null,
        sort: 'daily_installs',
        page: 3,
      }),
    ).resolves.toMatchObject({
      page: 3,
      pageSize: 20,
      hasMore: true,
      nextPage: 4,
      scripts,
    });
  });

  it('只按数字 ID 从官方详情和官方更新源下载安装', async () => {
    const source =
      '// ==UserScript==\n// @name Example\n// @namespace test\n// @version 1.0.0\n// @match https://example.com/*\n// ==/UserScript==\n';
    const codeUrl =
      'https://update.greasyfork.org/scripts/30545/example.user.js';
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          {
            id: 30545,
            name: 'Example',
            code_url: codeUrl,
            users: [{ name: 'ignored' }],
            version: '1.0.0',
            license: 'MIT',
          },
          'https://api.greasyfork.org/en/scripts/30545.json',
        ),
      )
      .mockResolvedValueOnce(response(source, codeUrl));

    await expect(
      new GreasyForkClient(fetcher).download(30545),
    ).resolves.toEqual({
      scriptId: 30545,
      name: 'Example',
      detailUrl: 'https://greasyfork.org/scripts/30545',
      sourceUrl: codeUrl,
      source,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('拒绝详情返回的非官方脚本地址', async () => {
    const fetcher = vi.fn(async () =>
      response(
        {
          id: 30545,
          name: 'Example',
          code_url: 'https://evil.example/payload.user.js',
        },
        'https://api.greasyfork.org/en/scripts/30545.json',
      ),
    );

    await expect(new GreasyForkClient(fetcher).download(30545)).rejects.toThrow(
      '不属于官方更新源',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
