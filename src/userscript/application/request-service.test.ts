import { describe, expect, it, vi } from 'vitest';

import { INITIAL_USERSCRIPTS } from '../fixtures';
import {
  type UserscriptRequestError,
  type UserscriptRequestHeaderAdapter,
  UserscriptRequestService,
} from './request-service';
import type { UserscriptFetch } from './update-service';

function requestScript(connects: string[]) {
  return {
    ...INITIAL_USERSCRIPTS[0],
    metadata: {
      ...INITIAL_USERSCRIPTS[0].metadata,
      connects,
    },
  };
}

describe('UserscriptRequestService', () => {
  it('allows declared hosts and returns text or JSON responses', async () => {
    const fetcher = vi.fn<UserscriptFetch>(
      async () =>
        new Response('{"value":42}', {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-test': 'yes' },
        }),
    );
    const service = new UserscriptRequestService(fetcher);

    const request = service.request(
      requestScript(['api.example.com']),
      'https://example.com/page',
      {
        url: 'https://api.example.com/data',
        responseType: 'json',
      },
    );

    await expect(request.promise).resolves.toMatchObject({
      status: 200,
      response: { value: 42 },
      responseText: '{"value":42}',
      finalUrl: 'https://api.example.com/data',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });

  it('bridges cross-origin fetch bodies and binary responses without @connect', async () => {
    const fetcher = vi.fn<UserscriptFetch>(
      async () =>
        new Response(new Uint8Array([4, 5, 6]), {
          status: 201,
          headers: { 'content-type': 'application/octet-stream' },
        }),
    );
    const service = new UserscriptRequestService(fetcher);
    const body = new Uint8Array([1, 2, 3]).buffer;

    const request = service.request(
      requestScript([]),
      'https://example.com/page',
      {
        method: 'POST',
        url: 'https://connect.linux.do/',
        data: body,
        responseType: 'arraybuffer',
      },
      { enforceConnect: false },
    );

    const response = await request.promise;
    expect(response).toMatchObject({
      status: 201,
      finalUrl: 'https://connect.linux.do/',
      responseText: '',
    });
    expect([...new Uint8Array(response.response as ArrayBuffer)]).toEqual([
      4, 5, 6,
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      'https://connect.linux.do/',
      expect.objectContaining({
        body,
        method: 'POST',
      }),
    );
  });

  it('rejects undeclared hosts and unsupported streaming responses', () => {
    const service = new UserscriptRequestService(vi.fn());
    expect(() =>
      service.request(requestScript(['self']), 'https://example.com/page', {
        url: 'https://api.example.com/data',
      }),
    ).toThrow('@connect');
    expect(() =>
      service.request(requestScript(['*']), 'https://example.com/page', {
        url: 'https://api.example.com/data',
        responseType: 'stream',
      }),
    ).toThrow('Unsupported GM request responseType');
  });

  it('returns blobs, forwards custom cookies, and reports request progress', async () => {
    const events: unknown[] = [];
    const fetcher = vi.fn<UserscriptFetch>(
      async () =>
        new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: {
            'content-length': '3',
            'content-type': 'application/octet-stream',
          },
        }),
    );
    const service = new UserscriptRequestService(fetcher);

    const request = service.request(
      requestScript(['*']),
      'https://example.com/page',
      {
        url: 'https://api.example.com/data',
        responseType: 'blob',
        headers: { 'x-test': 'yes' },
        cookie: 'session=one',
      },
      { onEvent: (event) => events.push(event) },
    );

    const response = await request.promise;
    expect(response.response).toBeInstanceOf(Blob);
    expect((response.response as Blob).type).toBe('application/octet-stream');
    const requestHeaders = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get('cookie')).toBe('session=one');
    expect(requestHeaders.get('x-test')).toBe('yes');
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'loadstart', readyState: 1 }),
        expect.objectContaining({ type: 'readystatechange', readyState: 2 }),
        expect.objectContaining({ type: 'readystatechange', readyState: 3 }),
        expect.objectContaining({
          type: 'progress',
          loaded: 3,
          total: 3,
          lengthComputable: true,
        }),
      ]),
    );
  });

  it('routes restricted headers through the configured browser adapter', async () => {
    const fetcher = vi.fn<UserscriptFetch>(async () => new Response('done'));
    const request = vi.fn();
    const headerAdapter: UserscriptRequestHeaderAdapter = {
      async request<T>(
        url: string,
        headers: Headers,
        operation: (headers: Headers) => Promise<T>,
      ) {
        request(url, headers);
        expect(url).toBe('https://api.example.com/data');
        expect(headers.get('cookie')).toBe('session=one');
        return await operation(new Headers({ 'x-adapted': 'yes' }));
      },
    };
    const service = new UserscriptRequestService(fetcher, headerAdapter);

    await service.request(requestScript(['*']), 'https://example.com/page', {
      url: 'https://api.example.com/data',
      cookie: 'session=one',
    }).promise;

    expect(request).toHaveBeenCalledOnce();
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('x-adapted'),
    ).toBe('yes');
  });

  it('does not claim a computable progress total when Content-Length is absent', async () => {
    const events: Array<{ type: string; lengthComputable: boolean }> = [];
    const service = new UserscriptRequestService(
      vi.fn(async () => new Response('done')),
    );

    await service.request(
      requestScript(['*']),
      'https://example.com/page',
      { url: 'https://api.example.com/data' },
      {
        onEvent: (event) => {
          events.push(event);
        },
      },
    ).promise;

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'progress',
        lengthComputable: false,
      }),
    );
  });

  it('supports timeout and explicit abort', async () => {
    const service = new UserscriptRequestService(
      vi.fn(
        async (_url, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const timed = service.request(
      requestScript(['*']),
      'https://example.com/page',
      { url: 'https://api.example.com/data', timeout: 1 },
    );
    await expect(timed.promise).rejects.toMatchObject({ kind: 'timeout' });

    const aborted = service.request(
      requestScript(['*']),
      'https://example.com/page',
      { url: 'https://api.example.com/data' },
    );
    aborted.abort();
    await expect(aborted.promise).rejects.toEqual(
      expect.objectContaining<Partial<UserscriptRequestError>>({
        kind: 'abort',
      }),
    );
  });

  it('revalidates every redirect against the declared @connect hosts', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response('', {
          status: 302,
          headers: { location: 'https://private.example.net/data' },
        }),
    );
    const service = new UserscriptRequestService(fetcher);

    const request = service.request(
      requestScript(['api.example.com']),
      'https://example.com/page',
      { url: 'https://api.example.com/redirect' },
    );

    await expect(request.promise).rejects.toThrow('@connect');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('follows authorized redirects and reports the concrete final URL', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('', {
          status: 302,
          headers: { location: '/final' },
        }),
      )
      .mockResolvedValueOnce(new Response('done', { status: 200 }));
    const service = new UserscriptRequestService(fetcher);

    const request = service.request(
      requestScript(['api.example.com']),
      'https://example.com/page',
      { url: 'https://api.example.com/redirect' },
    );

    await expect(request.promise).resolves.toMatchObject({
      finalUrl: 'https://api.example.com/final',
      responseText: 'done',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects oversized responses before buffering the body', async () => {
    const service = new UserscriptRequestService(
      vi.fn(
        async () =>
          new Response('small', {
            headers: { 'content-length': String(16 * 1024 * 1024 + 1) },
          }),
      ),
    );

    const request = service.request(
      requestScript(['*']),
      'https://example.com/page',
      { url: 'https://api.example.com/data' },
    );

    await expect(request.promise).rejects.toThrow('16 MB');
  });
});
