import { describe, expect, it, vi } from 'vitest';

import { USERSCRIPT_REQUEST_HEADER_RULE_ID } from '../../userscript/runtime/capabilities';
import { ExtensionUserscriptRequestHeaderAdapter } from './userscript-request-headers';

function harness(options: { enabled?: boolean; installFails?: boolean } = {}) {
  const getSessionRules = vi.fn(async () => []);
  const updateSessionRules = options.installFails
    ? vi.fn().mockRejectedValueOnce(new Error('modifyHeaders unsupported'))
    : vi.fn(async () => undefined);
  const reportError = vi.fn();
  const adapter = new ExtensionUserscriptRequestHeaderAdapter(
    {
      getSessionRules,
      updateSessionRules,
    },
    {
      enabled: options.enabled,
      reportError,
    },
  );
  return { adapter, getSessionRules, reportError, updateSessionRules };
}

describe('ExtensionUserscriptRequestHeaderAdapter', () => {
  it('applies restricted headers through one exact transient DNR rule', async () => {
    const { adapter, updateSessionRules } = harness();
    const operation = vi.fn(async (headers: Headers) => headers);
    const headers = new Headers({
      Cookie: 'session=one',
      Origin: 'https://origin.example',
      Referer: 'https://origin.example/page',
      'User-Agent': 'Card Master',
      'X-Test': 'yes',
    });

    const forwarded = await adapter.request(
      'https://api.example.com/data?x=1#result',
      headers,
      operation,
    );

    expect(forwarded.get('x-test')).toBe('yes');
    expect(forwarded.get('cookie')).toBeNull();
    expect(forwarded.get('origin')).toBeNull();
    expect(forwarded.get('referer')).toBeNull();
    expect(forwarded.get('user-agent')).toBeNull();
    expect(updateSessionRules).toHaveBeenNthCalledWith(1, {
      removeRuleIds: [USERSCRIPT_REQUEST_HEADER_RULE_ID],
      addRules: [
        {
          id: USERSCRIPT_REQUEST_HEADER_RULE_ID,
          priority: 1_000_000,
          action: {
            type: 'modifyHeaders',
            requestHeaders: expect.arrayContaining([
              { header: 'cookie', operation: 'set', value: 'session=one' },
              {
                header: 'origin',
                operation: 'set',
                value: 'https://origin.example',
              },
              {
                header: 'referer',
                operation: 'set',
                value: 'https://origin.example/page',
              },
              {
                header: 'user-agent',
                operation: 'set',
                value: 'Card Master',
              },
            ]),
          },
          condition: {
            regexFilter: String.raw`^https://api\.example\.com/data\?x=1$`,
            resourceTypes: ['xmlhttprequest'],
            tabIds: [-1],
          },
        },
      ],
    });
    expect(updateSessionRules).toHaveBeenNthCalledWith(2, {
      removeRuleIds: [USERSCRIPT_REQUEST_HEADER_RULE_ID],
    });
  });

  it('keeps normal requests out of DNR and preserves a fallback on unsupported platforms', async () => {
    const normal = harness();
    const normalOperation = vi.fn(async (headers: Headers) => headers);
    await normal.adapter.request(
      'https://api.example.com/data',
      new Headers({ 'x-test': 'yes' }),
      normalOperation,
    );
    expect(normal.updateSessionRules).not.toHaveBeenCalled();

    const fallback = harness({ installFails: true });
    const fallbackOperation = vi.fn(async (headers: Headers) => headers);
    const forwarded = await fallback.adapter.request(
      'https://api.example.com/data',
      new Headers({ Cookie: 'session=one' }),
      fallbackOperation,
    );
    expect(forwarded.get('cookie')).toBe('session=one');
    expect(fallback.reportError).toHaveBeenCalledWith(
      'rule-install-failed',
      expect.any(Error),
    );
  });

  it('serializes restricted requests so their temporary rules cannot overlap', async () => {
    const { adapter, updateSessionRules } = harness();
    let releaseFirst: () => void = () => undefined;
    const firstOperation = vi.fn(
      async () =>
        await new Promise<Headers>((resolve) => {
          releaseFirst = () => resolve(new Headers());
        }),
    );
    const secondOperation = vi.fn(async () => new Headers());

    const first = adapter.request(
      'https://api.example.com/first',
      new Headers({ Cookie: 'first=one' }),
      firstOperation,
    );
    await vi.waitFor(() => expect(firstOperation).toHaveBeenCalledOnce());
    const second = adapter.request(
      'https://api.example.com/second',
      new Headers({ Cookie: 'second=one' }),
      secondOperation,
    );

    await Promise.resolve();
    expect(secondOperation).not.toHaveBeenCalled();
    expect(updateSessionRules).toHaveBeenCalledTimes(1);

    releaseFirst();
    await first;
    await second;
    expect(updateSessionRules).toHaveBeenCalledTimes(4);
  });

  it('does not install modifyHeaders rules when the platform disables them', async () => {
    const { adapter, getSessionRules, updateSessionRules } = harness({
      enabled: false,
    });
    const operation = vi.fn(async (headers: Headers) => headers);
    const forwarded = await adapter.request(
      'https://api.example.com/data',
      new Headers({ Cookie: 'session=one' }),
      operation,
    );

    expect(forwarded.get('cookie')).toBe('session=one');
    expect(getSessionRules).not.toHaveBeenCalled();
    expect(updateSessionRules).not.toHaveBeenCalled();
  });
});
