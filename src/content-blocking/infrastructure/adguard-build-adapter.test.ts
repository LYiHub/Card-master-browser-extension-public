import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AdGuard build adapter', () => {
  it('suppresses only browser-policy and stale-frame removeparam failures', () => {
    const source = readFileSync(
      new URL('../../../scripts/package-extension.mjs', import.meta.url),
      'utf8',
    );

    expect(source).toContain('cardMasterExpectedAdguardScriptInjectionFailure');
    expect(source).toContain("message === 'Blocked'");
    expect(source).toContain('Extension context invalidated');
    expect(source).toContain('No tab with id');
    expect(source).toContain(
      'Frame with ID .* (?:was removed|is showing error page)',
    );
    expect(
      source.match(/cardMasterExpectedAdguardScriptInjectionFailure\(e\)/g),
    ).toHaveLength(2);
    expect(source).toContain('RemoveParamInjectionService.executeInjection');
    expect(source).toContain('RemoveParamInjectionService.executeUpdate');
  });

  it('disables the unsupported removeparam History injection service in Safari', () => {
    const source = readFileSync(
      new URL('../../../scripts/package-extension.mjs', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      "if (extensionTarget === 'safari' && isMv3Engine)",
    );
    expect(source).toContain("'removeParamInjectionService.start();'");
    expect(source).toContain("'removeParamInjectionService.stop();'");
    expect(source).toContain(
      "'removeParamInjectionService.injectRemoveParam(tabId, frameId, details.url);'",
    );
    expect(source).toContain(
      "'removeParamInjectionService.invalidateTab(tabId);'",
    );
  });
});
