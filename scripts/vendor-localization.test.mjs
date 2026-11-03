import { describe, expect, it } from 'vitest';
import { localizeVendorPage } from './vendor-localization.mjs';

describe('vendor page language startup', () => {
  it('preserves script order, modules and bootstrap attributes without running commented scripts', () => {
    const html = `<html><body><!-- <script src="unused.js"></script> --><script src="first.js"></script><script src="second.js" type="module" data-page-entry="app.js"></script></body></html>`;
    const result = localizeVendorPage(html, '../../vendor-page.js');
    expect(result).toContain('src="../../vendor-page.js"');
    const data = result
      .match(/data-scripts="([^"]*)"/)[1]
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&');
    expect(JSON.parse(data)).toEqual([
      { src: 'first.js' },
      { src: 'second.js', type: 'module', 'data-page-entry': 'app.js' },
    ]);
    expect(result).toContain('<!-- <script src="unused.js"></script> -->');
    expect(result).not.toContain('<script src="first.js">');
  });
  it('rejects a page without an external entry', () => {
    expect(() => localizeVendorPage('<body></body>', 'loader.js')).toThrow(
      'no external scripts',
    );
  });
});
