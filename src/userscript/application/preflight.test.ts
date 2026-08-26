import { describe, expect, it } from 'vitest';

import {
  installUserscriptSource,
  UserscriptInstallError,
} from './install-service';
import { userscriptInstallationDiagnostics } from './preflight';

function install(source: string) {
  return installUserscriptSource([], {
    source,
    createId: () => 'script',
    now: () => 1,
  });
}

describe('userscript installation preflight', () => {
  it('rejects invalid match ports before persistence', () => {
    expect(() =>
      install(`// ==UserScript==
// @name        Invalid Match
// @match       http://127.0.0.1:5173/*
// @grant       none
// ==/UserScript==

document.body.dataset.ready = 'true';`),
    ).toThrow(UserscriptInstallError);
  });

  it('rejects invalid JavaScript syntax without executing source', () => {
    expect(() =>
      install(`// ==UserScript==
// @name        Invalid Syntax
// @match       https://example.com/*
// @grant       none
// ==/UserScript==

const broken = ;`),
    ).toThrow('用户脚本语法错误');
  });

  it('accepts market metadata and reports compatible match normalization as a warning', () => {
    const installation = install(`// ==UserScript==
// @name        Market Script
// @description Navigate pages with the keyboard.
// @version     2025.11.27.15
// @author      Example Author
// @license     WTFPL
// @match       **://ithelp.ithome.com.tw/*
// @grant       none
// ==/UserScript==

document.body.dataset.ready = 'true';`);

    expect(installation.script.metadata.raw.license).toEqual(['WTFPL']);
    expect(installation.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'normalized-match-pattern',
        line: 7,
      }),
    );
  });

  it('accepts legacy Userscript host globs as a compatibility warning', () => {
    const installation = install(`// ==UserScript==
// @name        Legacy Host Glob
// @namespace   tests
// @match       *://*.*.163.com/news/*
// @grant       none
// ==/UserScript==

document.body.dataset.ready = 'true';`);

    expect(installation.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'legacy-match-pattern',
        line: 4,
      }),
    );
  });

  it('rejects invalid manager overrides and include regular expressions', () => {
    const installed = install(`// ==UserScript==
// @name        Valid Source
// @match       https://example.com/*
// @grant       none
// ==/UserScript==

document.body.dataset.ready = 'true';`).script;
    const diagnostics = userscriptInstallationDiagnostics({
      ...installed,
      manager: {
        ...installed.manager,
        userMatches: ['https://example.com:8443/*'],
        userIncludes: ['/[broken/'],
      },
    });

    expect(diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'invalid-manager-match-pattern',
        'invalid-manager-include-pattern',
      ]),
    );
  });
});
