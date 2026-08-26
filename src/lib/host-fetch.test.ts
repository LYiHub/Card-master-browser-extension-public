import { describe, expect, it, vi } from 'vitest';

import { invokeFetch } from './host-fetch';

describe('invokeFetch', () => {
  it('uses the active global scope as the native fetch receiver', async () => {
    const fetcher = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response('ok'));
    });

    const response = await invokeFetch(fetcher, 'https://example.com/');

    expect(await response.text()).toBe('ok');
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
