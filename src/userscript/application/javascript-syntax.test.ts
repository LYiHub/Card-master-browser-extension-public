import { describe, expect, it } from 'vitest';

import { userscriptSyntaxDiagnostic } from './javascript-syntax';

describe('Userscript syntax parser', () => {
  it('accepts valid source', () => {
    expect(
      userscriptSyntaxDiagnostic(
        `// ==UserScript==
// @name Valid
// ==/UserScript==

document.body.dataset.ready = 'true';`,
      ),
    ).toBeNull();
  });

  it('reports the parser line for invalid source', () => {
    expect(
      userscriptSyntaxDiagnostic(`// ==UserScript==
// @name Invalid
// ==/UserScript==

const broken = ;`),
    ).toMatchObject({
      code: 'invalid-userscript-syntax',
      line: 5,
      severity: 'error',
    });
  });
});
