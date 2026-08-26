import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { archiveExtension } from './archive-extension.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const version = JSON.parse(
  await readFile(resolve(root, 'package.json'), 'utf8'),
).version;
const releaseOutput = resolve(root, 'release-dist');
const zipName = `card-master-v${version}-chromium.zip`;
const destination = resolve(releaseOutput, zipName);
const checksumsPath = resolve(releaseOutput, 'SHA256SUMS.txt');

const pack = spawnSync(
  process.execPath,
  ['scripts/package-extensions.mjs', '--platform=chromium'],
  { cwd: root, stdio: 'inherit' },
);
if (pack.status !== 0) process.exit(pack.status ?? 1);

await mkdir(releaseOutput, { recursive: true });
await archiveExtension(resolve(root, 'extension-dist/chromium'), destination);

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

const digest = await sha256(destination);
let checksums = '';
try {
  checksums = await readFile(checksumsPath, 'utf8');
} catch {
  checksums = '';
}
const lines = checksums
  .split('\n')
  .map((line) => line.trimEnd())
  .filter((line) => line && !line.endsWith(`  ${zipName}`));
lines.push(`${digest}  ${zipName}`);
lines.sort((left, right) => left.localeCompare(right));
await writeFile(checksumsPath, `${lines.join('\n')}\n`);

const megabytes = (await stat(destination)).size / (1024 * 1024);
console.log(`${zipName}: ${megabytes.toFixed(1)} MB at ${destination}`);
