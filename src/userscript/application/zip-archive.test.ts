import { describe, expect, it } from 'vitest';

import { createZipArchive, readZipArchive } from './zip-archive';

describe('ZIP archive codec', () => {
  it('round trips UTF-8 userscript entries', async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const archive = createZipArchive([
      {
        name: 'scripts/示例.user.js',
        data: encoder.encode('// ==UserScript==\n// ==/UserScript=='),
      },
    ]);

    const entries = await readZipArchive(archive);
    expect(decoder.decode(entries.get('scripts/示例.user.js'))).toContain(
      '==UserScript==',
    );
  });

  it('rejects corrupted entry data instead of importing it', async () => {
    const name = 'scripts/example.user.js';
    const archive = createZipArchive([
      {
        name,
        data: new TextEncoder().encode('// ==UserScript==\n// ==/UserScript=='),
      },
    ]);
    archive[30 + new TextEncoder().encode(name).byteLength + 5] ^= 0xff;

    await expect(readZipArchive(archive)).rejects.toThrow('ZIP 条目校验失败');
  });
});
