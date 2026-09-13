import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertReleaseDirectoryClean } from './release-artifacts.mjs';

export async function packageBrowserNewTabVariant(source) {
  await assertReleaseDirectoryClean(source);
  const manifest = JSON.parse(
    await readFile(resolve(source, 'manifest.json'), 'utf8'),
  );
  if (manifest.chrome_url_overrides?.newtab !== 'new-tab.html') {
    throw new Error('保留浏览器新标签页版必须从完整的标准版生成。');
  }
  delete manifest.chrome_url_overrides.newtab;
  if (Object.keys(manifest.chrome_url_overrides).length === 0) {
    delete manifest.chrome_url_overrides;
  }

  const destination = `${resolve(source)}-browser-new-tab`;
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
  await writeFile(
    resolve(destination, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return destination;
}
