import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../vendor/bilibili/userscripts/bilikit-core.user.js',
  ),
  'utf8',
);

describe('vendored BiliKit Core regression contracts', () => {
  it('ships the 0.5.33 authentication and bootstrap fixes', () => {
    expect(source).toContain('@version      0.5.33');
    expect(source).toContain('const AUTH_CACHE_KEY = "bilikit:no-login-auth"');
    expect(source).toContain('async function verifyLogin(');
    expect(source).toContain('/x/web-interface/nav');
    expect(source).toContain('function rootBootstrapBackground(');
    expect(source).toContain(
      'root2.style.backgroundColor = rootBootstrapBackground(dark, document.readyState)',
    );
  });

  it('retains the packaged userscript update channel', () => {
    expect(source).toContain('@downloadURL https://update.greasyfork.org/');
    expect(source).toContain('@updateURL https://update.greasyfork.org/');
  });
});
