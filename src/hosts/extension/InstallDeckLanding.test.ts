import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('install deck landing', () => {
  it('follows the shared deck entry and leaves clicking to content.js', () => {
    const landing = readFileSync(
      new URL('./InstallDeckLanding.tsx', import.meta.url),
      'utf8',
    );
    const installer = readFileSync(
      new URL('./install.tsx', import.meta.url),
      'utf8',
    );
    const page = readFileSync(
      new URL('../../../extension/install.html', import.meta.url),
      'utf8',
    );
    const host = readFileSync(new URL('./content.ts', import.meta.url), 'utf8');

    expect(landing).toContain('useDeckEntryPlacement(');
    expect(landing).not.toContain('createDeckEntryDragSession(');
    expect(installer).toContain('new ExtensionDeckEntryController(api)');
    expect(page).toContain('content.js');
    expect(host).toContain("getURL('install.html')");
  });
});
