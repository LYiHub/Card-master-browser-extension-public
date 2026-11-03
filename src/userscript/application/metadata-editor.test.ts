import { afterEach, describe, expect, it } from 'vitest';
import { setLanguagePreference } from '../../localization/locale';
import {
  parseUserscriptMetadata,
  userscriptDisplayDescription,
  userscriptDisplayName,
  userscriptIdentity,
} from '../domain/metadata';
import { updateUserscriptEditableMetadata } from './metadata-editor';

afterEach(() => setLanguagePreference('auto'));

const SOURCE = `// ==UserScript==
// @name        Old name
// @namespace   local.test
// @version     1.0.0
// @match       https://example.com/*
// ==/UserScript==

console.log('unchanged');
`;

const BILINGUAL_SOURCE = SOURCE.replace(
  '// @name        Old name',
  `// @name        Old name
// @description Default description
// @name:zh-CN  简体名称
// @description:zh-CN 简体说明
// @name:zh-TW  繁體名稱
// @description:zh-TW 繁體說明`,
);

describe('editable userscript metadata', () => {
  it('updates name and inserts description without changing script code', () => {
    const updated = updateUserscriptEditableMetadata(SOURCE, {
      name: 'New name',
      description: 'New description',
    });
    const parsed = parseUserscriptMetadata(updated);
    const metadata = parsed.metadata;

    expect(metadata).not.toBeNull();
    if (!metadata) throw new Error('Expected valid metadata.');
    expect(userscriptDisplayName(metadata)).toBe('New name');
    expect(userscriptDisplayDescription(metadata)).toBe('New description');
    expect(updated).toContain("console.log('unchanged');");
  });

  it('rejects multiline metadata values', () => {
    expect(() =>
      updateUserscriptEditableMetadata(SOURCE, {
        name: 'Broken\nname',
        description: '',
      }),
    ).toThrow('不能包含换行');
  });

  it('updates the preferred localized display metadata when present', () => {
    const localized = SOURCE.replace(
      '// @name        Old name',
      '// @name        Old name\n// @name:zh-CN  旧名称\n// @description:zh-CN  旧描述',
    );
    const updated = updateUserscriptEditableMetadata(localized, {
      name: '新名称',
      description: '新描述',
    });
    const parsed = parseUserscriptMetadata(updated);
    const metadata = parsed.metadata;

    expect(metadata).not.toBeNull();
    if (!metadata) throw new Error('Expected valid metadata.');
    expect(userscriptDisplayName(metadata)).toBe('新名称');
    expect(userscriptDisplayDescription(metadata)).toBe('新描述');
  });

  it.each([
    'zh-CN',
    'zh-TW',
  ] as const)('keeps the exact source and identity when saving unchanged %s display metadata', (locale) => {
    setLanguagePreference(locale);
    const metadata = parseUserscriptMetadata(BILINGUAL_SOURCE).metadata;
    if (!metadata) throw new Error('Expected valid metadata.');
    const updated = updateUserscriptEditableMetadata(BILINGUAL_SOURCE, {
      name: userscriptDisplayName(metadata),
      description: userscriptDisplayDescription(metadata),
    });
    expect(updated).toBe(BILINGUAL_SOURCE);
    expect(userscriptIdentity(metadata)).toBe('local.test\nOld name');
  });

  it('edits Traditional descriptions without changing names, other translations or the script body', () => {
    setLanguagePreference('zh-TW');
    const updated = updateUserscriptEditableMetadata(BILINGUAL_SOURCE, {
      name: '繁體名稱',
      description: '新的繁體說明',
    });
    const metadata = parseUserscriptMetadata(updated).metadata;
    if (!metadata) throw new Error('Expected valid metadata.');
    expect(userscriptIdentity(metadata)).toBe('local.test\nOld name');
    expect(metadata.localized['zh-cn']).toEqual({
      name: '简体名称',
      description: '简体说明',
    });
    expect(metadata.localized['zh-tw']).toEqual({
      name: '繁體名稱',
      description: '新的繁體說明',
    });
    expect(userscriptDisplayDescription(metadata)).toBe('新的繁體說明');
    expect(updated.slice(updated.indexOf('// ==/UserScript=='))).toBe(
      BILINGUAL_SOURCE.slice(BILINGUAL_SOURCE.indexOf('// ==/UserScript==')),
    );
  });

  it('saves an explicit rename to the draft language after another entry changes the UI language', () => {
    setLanguagePreference('zh-CN');
    const updated = updateUserscriptEditableMetadata(BILINGUAL_SOURCE, {
      name: '新的繁體名稱',
      description: '繁體說明',
      locale: 'zh-TW',
    });
    const metadata = parseUserscriptMetadata(updated).metadata;
    if (!metadata) throw new Error('Expected valid metadata.');
    expect(metadata.name).toBe('新的繁體名稱');
    expect(metadata.localized['zh-tw']?.name).toBe('新的繁體名稱');
    expect(metadata.localized['zh-cn']?.name).toBe('简体名称');
    expect(userscriptDisplayName(metadata, 'zh-TW')).toBe('新的繁體名稱');
    expect(metadata.description).toBe('Default description');
    expect(metadata.localized['zh-tw']?.description).toBe('繁體說明');
  });

  it('uses the same Traditional script alias for display and editing', () => {
    setLanguagePreference('zh-TW');
    const source = BILINGUAL_SOURCE.replaceAll('zh-TW', 'zh-Hant');
    const updated = updateUserscriptEditableMetadata(source, {
      name: '新的繁體名稱',
      description: '繁體說明',
    });
    const metadata = parseUserscriptMetadata(updated).metadata;
    if (!metadata) throw new Error('Expected valid metadata.');
    expect(userscriptDisplayName(metadata)).toBe('新的繁體名稱');
    expect(metadata.localized['zh-hant']?.name).toBe('新的繁體名稱');
    expect(metadata.localized['zh-cn']?.name).toBe('简体名称');
  });
});
