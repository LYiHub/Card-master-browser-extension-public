import { describe, expect, it } from 'vitest';

import { INITIAL_USERSCRIPTS } from '../fixtures';
import {
  createUserscriptSource,
  installUserscriptSource,
  UserscriptInstallError,
  userscriptIdentityConflict,
} from './install-service';
import { DEFAULT_USERSCRIPT_PRESENTATION } from './presentation';

describe('installUserscriptSource', () => {
  it('installs a new script from its complete source', () => {
    const source = INITIAL_USERSCRIPTS[0].source.code
      .replace('// @name        净域守望', '// @name        新脚本')
      .replace('// @version     2.4.1', '// @version     1.0.0');
    const result = installUserscriptSource([], {
      source,
      createId: () => 'generated-id',
      now: () => 42,
    });

    expect(result.mode).toBe('installed');
    expect(result.script.manager.enabled).toBe(true);
    expect(result.script.runtime.status).toBe('idle');
    expect(result.script.id).toBe('generated-id');
    expect(result.script.source.code).toBe(source);
    expect(result.script.source.installedAt).toBe(42);
    expect(result.script.metadata.name).toBe('新脚本');
    expect(result.scripts).toEqual([result.script]);
  });

  it('preserves non-blocking metadata warnings for installer review', () => {
    const source = INITIAL_USERSCRIPTS[0].source.code.replace(
      '// @name        净域守望',
      '// @name        净域守望\n// @name        重复名称',
    );
    const result = installUserscriptSource([], {
      source,
      createId: () => 'warning-script',
      now: () => 42,
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'duplicate-singleton-metadata',
        }),
      ]),
    );
  });

  it('installs scripts using contributor metadata and clipboard grants', () => {
    const source = INITIAL_USERSCRIPTS[0].source.code
      .replace(
        '// @namespace   card-master',
        '// @namespace   card-master\n// @contributor Clipboard Tester',
      )
      .replace(
        '// @grant       GM_setValue',
        '// @grant       GM_setClipboard',
      );
    const result = installUserscriptSource([], {
      source,
      createId: () => 'clipboard-script',
      now: () => 42,
    });

    expect(result.script.metadata.contributors).toEqual(['Clipboard Tester']);
    expect(result.script.metadata.grants).toContain('GM_setClipboard');
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ severity: 'error' }),
    );
  });

  it('accepts the reported marketplace metadata and grant combination', () => {
    const source = `// ==UserScript==
// @name        Marketplace Compatibility
// @namespace   tests
// @version     1.0.0
// @description Primary description
// @description Duplicate description
// @contributor Community Maintainer
// @match       *://*/*
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_addStyle
// @grant       GM_deleteValue
// @grant       GM_xmlhttpRequest
// @grant       GM_setClipboard
// @grant       GM_registerMenuCommand
// ==/UserScript==

GM_setClipboard('ready');`;
    const result = installUserscriptSource([], {
      source,
      createId: () => 'marketplace-compatible',
      now: () => 42,
    });

    expect(result.script.metadata.description).toBe('Primary description');
    expect(result.script.metadata.contributors).toEqual([
      'Community Maintainer',
    ]);
    expect(result.script.metadata.grants).toContain('GM_setClipboard');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'duplicate-singleton-metadata',
      }),
    ]);
  });

  it('installs page interop grants and sandbox metadata without blocking', () => {
    const source = `// ==UserScript==
// @name        Page Interop Compatibility
// @namespace   tests
// @version     1.0.0
// @match       *://*/*
// @grant       window.onurlchange
// @grant       unsafeWindow
// @sandbox     raw
// ==/UserScript==

if (window.onurlchange === null) {
  window.onurlchange = (event) => console.log(event.url);
}
unsafeWindow.document.title;`;
    const result = installUserscriptSource([], {
      source,
      createId: () => 'page-interop',
      now: () => 42,
    });

    expect(result.script.metadata.grants).toEqual([
      'window.onurlchange',
      'unsafeWindow',
    ]);
    expect(result.script.metadata.sandbox).toBe('raw');
    expect(result.diagnostics).not.toContainEqual(
      expect.objectContaining({ severity: 'error' }),
    );
  });

  it('replaces the same identity in place and preserves manager state', () => {
    const existing = {
      ...INITIAL_USERSCRIPTS[0],
      presentation: {
        ...DEFAULT_USERSCRIPT_PRESENTATION,
      },
      manager: {
        ...INITIAL_USERSCRIPTS[0].manager,
        enabled: false,
        checkForUpdates: false,
      },
    };
    const source = existing.source.code.replace(
      '// @version     2.4.1',
      '// @version     3.0.0',
    );
    const result = installUserscriptSource([existing, INITIAL_USERSCRIPTS[1]], {
      source,
      createId: () => 'unused-id',
      now: () => 84,
    });

    expect(result.mode).toBe('replaced');
    expect(result.script.id).toBe(existing.id);
    expect(result.script.source.installedAt).toBe(existing.source.installedAt);
    expect(result.script.source.updatedAt).toBe(84);
    expect(result.script.manager).toEqual(existing.manager);
    expect(result.script.presentation).toEqual(existing.presentation);
    expect(result.script.runtime.status).toBe('sleeping');
    expect(result.scripts.map((script) => script.id)).toEqual([
      existing.id,
      INITIAL_USERSCRIPTS[1].id,
    ]);
  });

  it('keeps explicit creation from replacing an existing identity', () => {
    const existing = INITIAL_USERSCRIPTS[0];

    expect(() =>
      createUserscriptSource([existing], {
        source: existing.source.code.replace(
          '// @version     2.4.1',
          '// @version     3.0.0',
        ),
        createId: () => 'must-not-be-used',
        now: () => 84,
      }),
    ).toThrow('请读取该脚本后执行更新');
  });

  it('rejects invalid source without rejecting supported privileged grants', () => {
    expect(() =>
      installUserscriptSource([], {
        source: 'console.log("missing metadata")',
        createId: () => 'invalid',
        now: () => 1,
      }),
    ).toThrow(UserscriptInstallError);

    const supported = installUserscriptSource([], {
      source: INITIAL_USERSCRIPTS[0].source.code.replace(
        '// @grant       GM_setValue',
        '// @grant       GM_download',
      ),
      createId: () => 'download-capable',
      now: () => 1,
    });
    expect(supported.script.metadata.grants).toContain('GM_download');
    expect(supported.diagnostics).not.toContainEqual(
      expect.objectContaining({ severity: 'error' }),
    );
  });

  it('assigns each new script from the least-used presentation set', () => {
    const first = installUserscriptSource([], {
      source: INITIAL_USERSCRIPTS[0].source.code,
      createId: () => 'first',
      now: () => 1,
      random: () => 0,
    });
    const second = installUserscriptSource(first.scripts, {
      source: INITIAL_USERSCRIPTS[1].source.code,
      createId: () => 'second',
      now: () => 2,
      random: () => 0,
    });
    const third = installUserscriptSource(second.scripts, {
      source: INITIAL_USERSCRIPTS[2].source.code,
      createId: () => 'third',
      now: () => 3,
      random: () => 0,
    });

    expect(first.script.presentation?.media).toMatchObject({
      kind: 'video',
      video: expect.stringContaining('/userscript-cards/01.mp4'),
    });
    expect(second.script.presentation?.media).toMatchObject({
      kind: 'video',
      video: expect.stringContaining('/userscript-cards/02.mp4'),
    });
    expect(third.script.presentation?.media).toMatchObject({
      kind: 'video',
      video: expect.stringContaining('/userscript-cards/03.mp4'),
    });
  });

  it('finds identity conflicts while allowing the current script identity', () => {
    const script = INITIAL_USERSCRIPTS[0];
    expect(
      userscriptIdentityConflict(
        INITIAL_USERSCRIPTS,
        script.metadata,
        script.id,
      ),
    ).toBeNull();
    expect(
      userscriptIdentityConflict(INITIAL_USERSCRIPTS, script.metadata),
    ).toBe(script);
  });
});
