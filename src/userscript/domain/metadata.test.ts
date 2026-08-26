import { describe, expect, it } from 'vitest';

import {
  parseUserscriptMetadata,
  stripUserscriptMetadata,
  userscriptDisplayDescription,
  userscriptDisplayName,
  userscriptIdentity,
} from './metadata';

const source = `// ==UserScript==
// @name        Example Script
// @namespace   tests
// @version     1.2.3
// @match       https://example.com/*
// @match       https://docs.example.com/*
// @exclude-match https://example.com/private/*
// @grant       GM_registerMenuCommand
// @resource    icon https://example.com/icon.png
// @run-at      document-end
// @noframes
// ==/UserScript==

console.log('ready');`;

describe('parseUserscriptMetadata', () => {
  it('preserves repeated fields and normalizes known metadata', () => {
    const parsed = parseUserscriptMetadata(source);

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.metadata).toMatchObject({
      name: 'Example Script',
      namespace: 'tests',
      version: '1.2.3',
      matches: ['https://example.com/*', 'https://docs.example.com/*'],
      excludeMatches: ['https://example.com/private/*'],
      grants: ['GM_registerMenuCommand'],
      resources: { icon: 'https://example.com/icon.png' },
      runAt: 'document-end',
      noframes: true,
    });
    expect(parsed.metadata && userscriptIdentity(parsed.metadata)).toBe(
      'tests\nExample Script',
    );
  });

  it('defaults omitted run-at to document-end and preserves explicit document-idle', () => {
    const withoutRunAt = parseUserscriptMetadata(
      source.replace('// @run-at      document-end\n', ''),
    );
    const explicitIdle = parseUserscriptMetadata(
      source.replace('document-end', 'document-idle'),
    );

    expect(withoutRunAt.metadata?.runAt).toBe('document-end');
    expect(explicitIdle.metadata?.runAt).toBe('document-idle');
  });

  it('preserves localized and unknown declarations with source lines', () => {
    const localized = parseUserscriptMetadata(
      source.replace(
        '// @namespace   tests',
        `// @namespace   tests
// @name:zh-CN  示例脚本
// @description:zh-Hans 本地化说明
// @X-Project   preserved`,
      ),
    );

    expect(localized.metadata).not.toBeNull();
    expect(localized.metadata?.localized).toEqual({
      'zh-cn': { name: '示例脚本' },
      'zh-hans': { description: '本地化说明' },
    });
    expect(localized.metadata?.unknown).toEqual([
      expect.objectContaining({
        key: 'X-Project',
        normalizedKey: 'x-project',
        value: 'preserved',
        line: 6,
      }),
    ]);
    expect(localized.metadata?.raw['x-project']).toEqual(['preserved']);
  });

  it('uses the fixed Simplified Chinese, Traditional Chinese, default display order', () => {
    const parsed = parseUserscriptMetadata(
      source.replace(
        '// @namespace   tests',
        `// @namespace   tests
// @description Default description
// @name:zh-TW  繁體名稱
// @description:zh-TW 繁體說明
// @name:zh-CN  简体名称
// @description:zh-CN 简体说明`,
      ),
    );
    const metadata = parsed.metadata;

    expect(metadata).not.toBeNull();
    if (!metadata) return;
    expect(userscriptDisplayName(metadata)).toBe('简体名称');
    expect(userscriptDisplayDescription(metadata)).toBe('简体说明');

    const withoutSimplified = {
      ...metadata,
      localized: { 'zh-tw': metadata.localized['zh-tw'] },
    };
    expect(userscriptDisplayName(withoutSimplified)).toBe('繁體名稱');
    expect(userscriptDisplayDescription(withoutSimplified)).toBe('繁體說明');

    const withoutChinese = { ...metadata, localized: {} };
    expect(userscriptDisplayName(withoutChinese)).toBe('Example Script');
    expect(userscriptDisplayDescription(withoutChinese)).toBe(
      'Default description',
    );
  });

  it('accepts informational changelog metadata without treating it as runtime behavior', () => {
    const parsed = parseUserscriptMetadata(
      source.replace(
        '// @namespace   tests',
        '// @namespace   tests\n// @changelog   https://example.com/changelog',
      ),
    );

    expect(parsed.metadata).not.toBeNull();
    expect(parsed.metadata?.raw.changelog).toEqual([
      'https://example.com/changelog',
    ]);
    expect(parsed.metadata?.unknown).toEqual([]);
  });

  it('accepts informational license metadata without treating it as runtime behavior', () => {
    const parsed = parseUserscriptMetadata(
      source.replace(
        '// @namespace   tests',
        '// @namespace   tests\n// @license     MIT',
      ),
    );

    expect(parsed.metadata).not.toBeNull();
    expect(parsed.metadata?.raw.license).toEqual(['MIT']);
    expect(parsed.metadata?.unknown).toEqual([]);
  });

  it('normalizes standard sandbox metadata without treating it as unknown', () => {
    const parsed = parseUserscriptMetadata(
      source.replace(
        '// @namespace   tests',
        '// @namespace   tests\n// @sandbox     JavaScript',
      ),
    );

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.metadata?.sandbox).toBe('JavaScript');
    expect(parsed.metadata?.unknown).toEqual([]);
  });

  it('preserves repeated contributor and marketplace metadata without blocking installation', () => {
    const parsed = parseUserscriptMetadata(
      source.replace(
        '// @namespace   tests',
        `// @namespace   tests
// @contributor Alice
// @contributor Bob
// @copyright   Example Authors
// @license     MIT
// @antifeature tracking
// @compatible  chrome
// @incompatible safari
// @tag         navigation`,
      ),
    );

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.metadata).toMatchObject({
      contributors: ['Alice', 'Bob'],
      copyright: 'Example Authors',
      license: 'MIT',
      antifeatures: ['tracking'],
      compatible: ['chrome'],
      incompatible: ['safari'],
      tags: ['navigation'],
      unknown: [],
    });
  });

  it('rejects malformed URL metadata with line-aware diagnostics', () => {
    const invalid = parseUserscriptMetadata(`// ==UserScript==
// @name        Invalid URLs
// @match       https://example.com/*
// @updateURL   javascript:alert(1)
// @require     relative-library.js
// ==/UserScript==`);

    expect(invalid.metadata).toBeNull();
    expect(invalid.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsupported-metadata-url-protocol',
          line: 4,
        }),
        expect.objectContaining({
          code: 'invalid-metadata-url',
          line: 5,
        }),
      ]),
    );
  });

  it('accepts data resources and reports duplicate resource identities', () => {
    const parsed = parseUserscriptMetadata(`// ==UserScript==
// @name        Resources
// @match       https://example.com/*
// @resource    icon data:image/png;base64,AA==
// @resource    icon https://example.com/icon.png
// ==/UserScript==`);

    expect(parsed.metadata).toBeNull();
    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'duplicate-resource', line: 5 }),
    );
  });

  it('rejects malformed @connect declarations during installation preflight', () => {
    const parsed = parseUserscriptMetadata(`// ==UserScript==
// @name        Invalid Connect
// @match       https://example.com/*
// @connect     https://api.example.com/path
// ==/UserScript==`);

    expect(parsed.metadata).toBeNull();
    expect(parsed.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'invalid-connect', line: 4 }),
    );
  });

  it('rejects missing metadata and unsupported run-at values explicitly', () => {
    expect(parseUserscriptMetadata('console.log(1)').metadata).toBeNull();
    const invalid = parseUserscriptMetadata(
      source.replace('document-end', 'document-magic'),
    );
    expect(invalid.metadata).toBeNull();
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unsupported-run-at', line: 10 }),
    );
  });

  it('removes only the metadata block before execution', () => {
    expect(stripUserscriptMetadata(source)).toContain("console.log('ready')");
    expect(stripUserscriptMetadata(source)).not.toContain('@namespace');
  });
});
