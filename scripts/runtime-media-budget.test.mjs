import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cardArtRoot = resolve(root, 'assets/userscript-deck/card-art');
const logoPath = resolve(
  root,
  'assets/userscript-deck/visual/action-icons/card-master-logo.png',
);

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? filesRecursively(path) : [path];
    }),
  );
  return files.flat();
}

describe('runtime media budget', () => {
  it('keeps every card cover at or under 300 KB', async () => {
    const posters = (await filesRecursively(cardArtRoot)).filter((path) =>
      path.endsWith('.webp'),
    );
    expect(posters.length).toBeGreaterThan(0);
    for (const poster of posters) {
      expect((await stat(poster)).size).toBeLessThanOrEqual(300 * 1024);
    }
  });

  it('keeps the brand logo at the 512px identity size', async () => {
    const metadata = await sharp(logoPath).metadata();
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect((await stat(logoPath)).size).toBeLessThan(200 * 1024);
  });
});
