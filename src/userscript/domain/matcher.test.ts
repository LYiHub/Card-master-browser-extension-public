import { describe, expect, it } from 'vitest';

import {
  createUserscriptMatchPlan,
  matchesWebExtensionPattern,
  matchPatternCompatibility,
  matchUserscript,
  matchUserscriptPlan,
  validateMatchPattern,
} from './matcher';
import type { UserscriptManagerConfig, UserscriptMetadata } from './types';

const metadata: UserscriptMetadata = {
  name: 'Matcher',
  namespace: 'tests',
  version: '1.0.0',
  description: '',
  author: '',
  contributors: [],
  copyright: '',
  license: '',
  matches: ['https://*.example.com/docs/*'],
  includes: [],
  excludeMatches: ['https://private.example.com/docs/*'],
  excludes: [],
  grants: [],
  requires: [],
  resources: {},
  connects: [],
  antifeatures: [],
  compatible: [],
  incompatible: [],
  tags: [],
  runAt: 'document-idle',
  noframes: false,
  localized: {},
  entries: [],
  unknown: [],
  raw: {},
};

const manager: UserscriptManagerConfig = {
  enabled: true,
  checkForUpdates: true,
  userMatches: [],
  userIncludes: [],
  userExcludeMatches: [],
  userExcludes: [],
};

describe('Userscript URL matching', () => {
  it('implements match-pattern scheme and subdomain semantics', () => {
    expect(
      matchesWebExtensionPattern(
        '*://*.example.com/*',
        new URL('https://docs.example.com/page'),
      ),
    ).toBe(true);
    expect(
      matchesWebExtensionPattern(
        '*://*.example.com/*',
        new URL('ftp://docs.example.com/page'),
      ),
    ).toBe(false);
  });

  it('normalizes common double-wildcard Userscript patterns', () => {
    expect(validateMatchPattern('**://ithelp.ithome.com.tw/*')).toBeNull();
    expect(
      matchesWebExtensionPattern(
        '**://ithelp.ithome.com.tw/*',
        new URL('https://ithelp.ithome.com.tw/articles/1'),
      ),
    ).toBe(true);
    expect(
      matchesWebExtensionPattern(
        '*://**/*',
        new URL('http://www.example.com/page'),
      ),
    ).toBe(true);
  });

  it('reports malformed match patterns before they reach the runtime', () => {
    expect(validateMatchPattern('https://example.com/*')).toBeNull();
    expect(validateMatchPattern('example.com/*')).toContain('有效');
    expect(validateMatchPattern('https://foo*bar.example/*')).toContain(
      '通配符',
    );
    expect(validateMatchPattern('http://127.0.0.1:5173/*')).toContain('端口');
    expect(validateMatchPattern('http://127.0.0.1/*')).toBeNull();
  });

  it('runs non-standard Userscript host globs through the exact runtime plan', () => {
    const legacyPattern = '*://*.*.163.com/news/*';
    expect(validateMatchPattern(legacyPattern)).toContain('通配符');
    expect(matchPatternCompatibility(legacyPattern)).toBe('legacy');
    expect(
      matchUserscript({ ...metadata, matches: [legacyPattern] }, manager, {
        url: 'https://sports.news.163.com/news/article',
        frameId: 0,
        topFrame: true,
      }),
    ).toEqual({ eligible: true, reason: 'matched' });
    expect(
      matchUserscript({ ...metadata, matches: [legacyPattern] }, manager, {
        url: 'https://news.163.com/news/article',
        frameId: 0,
        topFrame: true,
      }),
    ).toEqual({ eligible: false, reason: 'no-inclusion' });
  });

  it('uses the full URL for compatible @match patterns containing a query', () => {
    expect(
      matchUserscript(
        {
          ...metadata,
          matches: ['*://weibo.com/ttarticle/p/show?id=*'],
        },
        manager,
        {
          url: 'https://weibo.com/ttarticle/p/show?id=42#comments',
          frameId: 0,
          topFrame: true,
        },
      ),
    ).toEqual({ eligible: true, reason: 'matched' });
  });

  it('ignores URL ports when matching a standard host pattern', () => {
    expect(
      matchesWebExtensionPattern(
        'http://127.0.0.1/*',
        new URL('http://127.0.0.1:5173/extension-fixture'),
      ),
    ).toBe(true);
  });

  it('ignores query and hash for @match', () => {
    expect(
      matchUserscript(metadata, manager, {
        url: 'https://docs.example.com/docs/page?mode=compact#section',
        frameId: 0,
        topFrame: true,
      }),
    ).toEqual({ eligible: true, reason: 'matched' });
  });

  it('applies exclusions after inclusion', () => {
    expect(
      matchUserscript(metadata, manager, {
        url: 'https://private.example.com/docs/page',
        frameId: 0,
        topFrame: true,
      }),
    ).toEqual({ eligible: false, reason: 'excluded' });
  });

  it('keeps noframes independent from URL eligibility', () => {
    expect(
      matchUserscript({ ...metadata, noframes: true }, manager, {
        url: 'https://docs.example.com/docs/page',
        frameId: 3,
        topFrame: false,
      }),
    ).toEqual({ eligible: false, reason: 'noframes' });
  });

  it('uses one serialized plan for manager overrides and runtime matching', () => {
    const plan = createUserscriptMatchPlan(metadata, {
      ...manager,
      userMatches: ['https://override.example.net/*'],
    });

    expect(
      matchUserscriptPlan(plan, {
        url: 'https://docs.example.com/docs/page',
        frameId: 0,
        topFrame: true,
      }),
    ).toEqual({ eligible: false, reason: 'no-inclusion' });
    expect(
      matchUserscriptPlan(plan, {
        url: 'https://override.example.net/page?query=kept#hash-ignored',
        frameId: 0,
        topFrame: true,
      }),
    ).toEqual({ eligible: true, reason: 'matched' });
  });

  it('replaces both metadata inclusion categories when any manager inclusion exists', () => {
    const plan = createUserscriptMatchPlan(
      {
        ...metadata,
        includes: ['https://legacy.example.org/*'],
      },
      {
        ...manager,
        userMatches: ['https://override.example.net/*'],
      },
    );

    expect(
      matchUserscriptPlan(plan, {
        url: 'https://legacy.example.org/page',
        frameId: 0,
        topFrame: true,
      }),
    ).toEqual({ eligible: false, reason: 'no-inclusion' });
  });
});
