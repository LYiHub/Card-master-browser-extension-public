import { describe, expect, it } from 'vitest';

import type { InstalledUserscript } from '../domain/types';
import {
  userscriptPublicationPageUrl,
  userscriptSourcePageUrl,
} from './publication-page';

function script(
  overrides: {
    origin?: string;
    homepageUrl?: string;
    downloadUrl?: string;
    updateUrl?: string;
  } = {},
): InstalledUserscript {
  return {
    kind: 'userscript',
    id: 'script-1',
    source: {
      code: '// ==UserScript==\n// @name Test\n// ==/UserScript==',
      ...(overrides.origin ? { origin: overrides.origin } : {}),
      installedAt: 1,
      updatedAt: 1,
    },
    metadata: {
      name: 'Test',
      namespace: 'tests',
      version: '1.0.0',
      description: '',
      author: '',
      contributors: [],
      copyright: '',
      license: '',
      ...(overrides.homepageUrl ? { homepageUrl: overrides.homepageUrl } : {}),
      ...(overrides.downloadUrl ? { downloadUrl: overrides.downloadUrl } : {}),
      ...(overrides.updateUrl ? { updateUrl: overrides.updateUrl } : {}),
      matches: ['https://example.com/*'],
      includes: [],
      excludeMatches: [],
      excludes: [],
      grants: [],
      requires: [],
      resources: {},
      connects: [],
      antifeatures: [],
      compatible: [],
      incompatible: [],
      tags: [],
      runAt: 'document-end',
      noframes: false,
      localized: {},
      entries: [],
      unknown: [],
      raw: {},
    },
    manager: {
      enabled: true,
      checkForUpdates: true,
      userMatches: [],
      userIncludes: [],
      userExcludeMatches: [],
      userExcludes: [],
    },
    runtime: {
      tabId: 1,
      frameId: 0,
      instanceId: null,
      status: 'idle',
      commands: [],
      pendingRefresh: false,
    },
  };
}

describe('userscript publication page', () => {
  it('prefers a Greasy Fork listing over a generic declared homepage', () => {
    expect(
      userscriptPublicationPageUrl(
        script({
          origin:
            'https://update.greasyfork.org/scripts/499480/example.user.js',
          homepageUrl: 'https://github.com/example/project',
        }),
      ),
    ).toBe('https://greasyfork.org/scripts/499480');
  });

  it('normalizes direct Greasy Fork and Sleazy Fork code URLs', () => {
    expect(
      userscriptPublicationPageUrl(
        script({
          origin:
            'https://greasyfork.org/zh-CN/scripts/518149-example/code/example.user.js',
        }),
      ),
    ).toBe('https://greasyfork.org/scripts/518149');
    expect(
      userscriptPublicationPageUrl(
        script({
          updateUrl: 'https://update.sleazyfork.org/scripts/42/example.meta.js',
        }),
      ),
    ).toBe('https://sleazyfork.org/scripts/42');
  });

  it('derives ScriptCat and OpenUserJS listing pages', () => {
    expect(
      userscriptPublicationPageUrl(
        script({
          downloadUrl:
            'https://scriptcat.org/scripts/code/1234/example.user.js',
        }),
      ),
    ).toBe('https://scriptcat.org/zh-CN/script-show-page/1234');
    expect(
      userscriptPublicationPageUrl(
        script({
          origin: 'https://openuserjs.org/install/alice/example.user.js',
        }),
      ),
    ).toBe('https://openuserjs.org/scripts/alice/example');
  });

  it('uses an explicit homepage or derives a GitHub project page', () => {
    expect(
      userscriptPublicationPageUrl(
        script({ homepageUrl: 'https://example.com/userscripts/example' }),
      ),
    ).toBe('https://example.com/userscripts/example');
    expect(
      userscriptPublicationPageUrl(
        script({
          origin:
            'https://raw.githubusercontent.com/alice/example/main/example.user.js',
        }),
      ),
    ).toBe('https://github.com/alice/example');
  });

  it('returns null when no safe publication page can be determined', () => {
    expect(userscriptPublicationPageUrl(script())).toBeNull();
    expect(
      userscriptPublicationPageUrl(
        script({ homepageUrl: 'https://example.com/example.user.js' }),
      ),
    ).toBeNull();
  });

  it('provides a safe source link for card metadata', () => {
    expect(
      userscriptSourcePageUrl(
        script({
          origin:
            'https://update.greasyfork.org/scripts/518149/example.user.js',
        }),
      ),
    ).toBe('https://greasyfork.org/scripts/518149');
    expect(
      userscriptSourcePageUrl(
        script({ origin: 'https://example.com/example.user.js' }),
      ),
    ).toBe('https://example.com/example.user.js');
    expect(
      userscriptSourcePageUrl(
        script({ origin: 'archive:backup.zip#scripts/example.user.js' }),
      ),
    ).toBeNull();
  });
});
