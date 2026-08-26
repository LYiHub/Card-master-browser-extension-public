import { describe, expect, it } from 'vitest';
import {
  parseUserscriptMetadata,
  userscriptDisplayDescription,
  userscriptDisplayName,
} from '../domain/metadata';
import { updateUserscriptEditableMetadata } from './metadata-editor';

const SOURCE = `// ==UserScript==
// @name        Old name
// @namespace   local.test
// @version     1.0.0
// @match       https://example.com/*
// ==/UserScript==

console.log('unchanged');
`;

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
});
