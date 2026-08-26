import { describe, expect, it } from 'vitest';

import { userscriptExportFilename } from './source-export';

describe('userscriptExportFilename', () => {
  it('creates a portable .user.js filename from the script name', () => {
    expect(userscriptExportFilename('页面净化 / 专注模式')).toBe(
      '页面净化 - 专注模式.user.js',
    );
  });

  it('falls back when the metadata name contains no filename characters', () => {
    expect(userscriptExportFilename('...')).toBe('userscript.user.js');
  });
});
