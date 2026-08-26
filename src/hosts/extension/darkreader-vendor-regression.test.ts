import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_THEME } from '../../page-theme/domain/types';

const root = resolve(import.meta.dirname, '../../..');

function vendorSource(path: string) {
  return readFileSync(resolve(root, 'vendor/darkreader/src', path), 'utf8');
}

describe('vendored Dark Reader regression contracts', () => {
  it('uses the Dark Reader 4.9.129 default theme preset', () => {
    expect(DEFAULT_PAGE_THEME).toMatchObject({
      mode: 1,
      brightness: 100,
      contrast: 100,
      grayscale: 0,
      sepia: 0,
      useFont: false,
      textStroke: 0,
      engine: 'dynamicTheme',
      stylesheet: '',
      darkSchemeBackgroundColor: '#181a1b',
      darkSchemeTextColor: '#e8e6e3',
      lightSchemeBackgroundColor: '#dcdad7',
      lightSchemeTextColor: '#181a1b',
      scrollbarColor: '',
      selectionColor: 'auto',
      styleSystemControls: false,
      lightColorScheme: 'Default',
      darkColorScheme: 'Default',
      immediateModify: false,
    });
  });

  it('observes for a late body and clears pending styles during teardown', () => {
    const source = vendorSource('inject/dynamic-theme/injection.ts');

    expect(source).toContain(
      'bodyObserver.observe(document, {childList: true, subtree: true});',
    );
    expect(source).toContain('bodyObserver = null;');
    expect(source).toContain('stylesWaitingForBody.clear();');
  });

  it('handles CSS redirects, missing response types, and FileReader failures', () => {
    const source = vendorSource('utils/network.ts');

    expect(source).toContain(
      "const redirect = mimeType === 'text/css' ? undefined : 'error';",
    );
    expect(source).toContain(
      "const contentType = response.headers.get('Content-Type');",
    );
    expect(source).toMatch(/contentType\?\.startsWith\(`\$\{mimeType};`\)/);
    expect(source).toContain('reader.onerror = () => reject(reader.error);');
    expect(source).toContain(
      'response.redirected && response.url && shouldIgnoreCors',
    );
  });

  it('keeps the global important inline-color correction in the active fixes', () => {
    const fixes = vendorSource('config/dynamic-theme-fixes.config');

    expect(fixes).toContain(
      '*[style*="color: rgb(0, 0, 0) !important"][style*="--darkreader-inline-color"]',
    );
    expect(fixes).toContain(
      '-webkit-text-fill-color: var(--darkreader-inline-color) !important;',
    );
  });

  it('retains local cache guards while using the refreshed compact CSS keys', () => {
    const modifier = vendorSource(
      'inject/dynamic-theme/stylesheet-modifier.ts',
    );

    expect(modifier).toContain('if (existing !== undefined)');
    expect(modifier).toContain('String.fromCharCode(n & 0xFFFF)');
  });

  it('preserves and traverses CSS container rules', () => {
    const platform = vendorSource('utils/platform.ts');
    const rules = vendorSource('inject/dynamic-theme/css-rules.ts');
    const modifier = vendorSource(
      'inject/dynamic-theme/stylesheet-modifier.ts',
    );

    expect(platform).toContain(
      "isContainerRuleSupported = typeof CSSContainerRule === 'function'",
    );
    expect(rules).toContain('else if (isContainerRule(rule))');
    expect(modifier).toContain('`@container $' + '{query} {}`');
    expect(modifier).toContain('containerName, containerQuery');
  });

  it('keeps the current Bilibili space transparency fix', () => {
    const fixes = vendorSource('config/dynamic-theme-fixes.config');

    expect(fixes).toContain('space.bilibili.com');
    expect(fixes).toContain('background-color: transparent');
  });
});
