import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { archiveExtension } from './archive-extension.mjs';

const root = process.cwd();
const { version } = JSON.parse(
  await readFile(resolve(root, 'package.json'), 'utf8'),
);
const targets = [
  'chromium',
  'chromium-browser-new-tab',
  'firefox',
  'firefox-browser-new-tab',
];
const output = resolve(root, 'release-dist', `v${version}`);
for (const target of targets) {
  const manifest = JSON.parse(
    await readFile(
      resolve(root, 'extension-dist', target, 'manifest.json'),
      'utf8',
    ),
  );
  if (
    manifest.version !== version ||
    Boolean(manifest.chrome_url_overrides?.newtab) ===
      target.endsWith('browser-new-tab')
  ) {
    throw new Error(
      `${target} 的版本或新标签页声明不匹配，请重新执行 browsers ship。`,
    );
  }
}
await mkdir(output, { recursive: true });
const checksums = [];
for (const target of targets) {
  const name = `card-master-v${version}-${target}.zip`;
  const path = resolve(output, name);
  await archiveExtension(resolve(root, 'extension-dist', target), path);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  checksums.push(`${hash.digest('hex')}  ${name}`);
  console.log(
    `${name}: ${((await stat(path)).size / 1_000_000).toFixed(2)} MB`,
  );
}
await writeFile(resolve(output, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
console.log(`已生成四个发布包与校验清单：${output}`);
