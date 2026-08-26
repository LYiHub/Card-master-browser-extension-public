import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const EDGE_LOCAL_NEW_TAB = 'chrome-search://local-ntp/local-ntp.html';

function loadVendorGlobal<T>(path: string, name: string) {
  const context = { URL } as Record<string, unknown>;
  runInNewContext(
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    context,
  );
  return context[name] as T;
}

describe('Lumno Edge favicon boundary', () => {
  it('classifies the Edge local NTP alias as an internal new-tab page', () => {
    const guards = loadVendorGlobal<{
      isBrowserInternalUrl(url: string): boolean;
      isBrowserNewtabUrl(url: string): boolean;
    }>(
      '../../../vendor/lumno/runtime/src/shared/url-guards.js',
      'LumnoUrlGuards',
    );

    expect(guards.isBrowserInternalUrl(EDGE_LOCAL_NEW_TAB)).toBe(true);
    expect(guards.isBrowserNewtabUrl(EDGE_LOCAL_NEW_TAB)).toBe(true);
  });

  it('never produces a browser-local favicon candidate for internal pages', () => {
    const utils = loadVendorGlobal<{
      createFaviconUrlResolver(options: object): {
        buildFaviconCandidatePlan(input: object): unknown[];
        getPageFaviconCandidateUrl(url: string): string;
        getPageFaviconRenderCandidates(
          url: string,
          explicitUrl: string,
        ): { primaryUrl: string; browserUrl: string };
      };
    }>(
      '../../../vendor/lumno/runtime/src/shared/favicon-utils.js',
      'LumnoFaviconUtils',
    );
    const resolver = utils.createFaviconUrlResolver({
      chromeApi: {
        runtime: {
          id: 'card-master',
          getURL: (path: string) => `chrome-extension://card-master${path}`,
        },
      },
    });

    expect(resolver.getPageFaviconCandidateUrl(EDGE_LOCAL_NEW_TAB)).toBe('');
    expect(
      resolver.getPageFaviconRenderCandidates(EDGE_LOCAL_NEW_TAB, ''),
    ).toEqual({ primaryUrl: '', browserUrl: '' });
    expect(
      resolver.buildFaviconCandidatePlan({ pageUrl: EDGE_LOCAL_NEW_TAB }),
    ).toEqual([]);
  });

  it('filters internal browser pages from the recent-sites feed', () => {
    const source = readFileSync(
      new URL(
        '../../../vendor/lumno/runtime/src/newtab/newtab.js',
        import.meta.url,
      ),
      'utf8',
    );

    expect(source).toContain(
      'isBrowserNewtabUrl(url) || isBrowserInternalUrl(url)',
    );
  });
});
