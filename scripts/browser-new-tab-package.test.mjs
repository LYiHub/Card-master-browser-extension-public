import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packageBrowserNewTabVariant } from './browser-new-tab-package.mjs';

const temporaryRoots = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(platform = 'chromium') {
  const root = await mkdtemp(join(tmpdir(), 'card-master-new-tab-package-'));
  temporaryRoots.push(root);
  const source = join(root, platform);
  await mkdir(join(source, 'src/newtab'), { recursive: true });
  const manifest = {
    ...JSON.parse(
      await readFile(resolve('extension/manifest.common.json'), 'utf8'),
    ),
    ...JSON.parse(
      await readFile(resolve(`extension/manifest.${platform}.json`), 'utf8'),
    ),
  };
  await writeFile(join(source, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(source, 'background.js'), 'background runtime');
  await writeFile(
    join(source, 'src/newtab/newtab.html'),
    '<main>dashboard</main>',
  );
  return { manifest, source };
}

describe('browser-managed new tab package', () => {
  it.each([
    'chromium',
    'firefox',
  ])('removes only the newtab override from the %s package', async (platform) => {
    const { manifest, source } = await fixture(platform);
    await mkdir(`${source}-browser-new-tab`);
    await writeFile(join(`${source}-browser-new-tab`, 'stale.js'), 'old build');
    const destination = await packageBrowserNewTabVariant(source);
    const nativeManifest = JSON.parse(
      await readFile(join(destination, 'manifest.json'), 'utf8'),
    );
    const expected = structuredClone(manifest);
    delete expected.chrome_url_overrides;
    expect(nativeManifest).toEqual(expected);
    expect(
      JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8')),
    ).toEqual(manifest);
    for (const path of ['background.js', 'src/newtab/newtab.html']) {
      expect(await readFile(join(destination, path))).toEqual(
        await readFile(join(source, path)),
      );
    }
    await expect(readFile(join(destination, 'stale.js'))).rejects.toMatchObject(
      { code: 'ENOENT' },
    );
  });

  it('rejects an invalid source before replacing an existing output', async () => {
    const { source } = await fixture();
    const destination = `${source}-browser-new-tab`;
    await mkdir(destination);
    await writeFile(join(destination, 'keep.txt'), 'previous valid output');
    await writeFile(join(source, 'manifest.json'), '{}');
    await expect(packageBrowserNewTabVariant(source)).rejects.toThrow(
      '完整的标准版',
    );
    expect(await readFile(join(destination, 'keep.txt'), 'utf8')).toBe(
      'previous valid output',
    );
  });
});
