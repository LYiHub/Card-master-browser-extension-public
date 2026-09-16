import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { packageBrowserNewTabVariant } from './browser-new-tab-package.mjs';
import { writeCardMediaAccentCatalog } from './card-media-accents.mjs';
import { ensureExtensionOutputRoot } from './extension-output.mjs';
import {
  EXTENSION_PLATFORM_USAGE,
  parseExtensionPlatform,
} from './extension-platforms.mjs';

const output = resolve(
  process.cwd(),
  process.env.EXTENSION_OUTPUT_ROOT?.trim() || 'extension-dist',
);

let platform;
let positional;
try {
  ({ platform, positional } = parseExtensionPlatform(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    `Usage: node scripts/package-extensions.mjs [${EXTENSION_PLATFORM_USAGE}]`,
  );
  process.exit(1);
}
if (positional.length > 0) {
  console.error(`未知位置参数：${positional.join(' ')}`);
  console.error(
    `Usage: node scripts/package-extensions.mjs [${EXTENSION_PLATFORM_USAGE}]`,
  );
  process.exit(1);
}

async function packageTarget(target) {
  const result = spawnSync(
    process.execPath,
    ['scripts/package-extension.mjs'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        EXTENSION_TARGET: target,
      },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (target !== 'safari') {
    const variant = await packageBrowserNewTabVariant(resolve(output, target));
    console.log(`保留浏览器新标签页版已生成：${variant}`);
  }
}

await ensureExtensionOutputRoot(output);
await writeCardMediaAccentCatalog();

if (platform === 'all') {
  for (const target of ['chromium', 'firefox', 'safari']) {
    await packageTarget(target);
  }
} else if (platform === 'browsers') {
  for (const target of ['chromium', 'firefox']) {
    await packageTarget(target);
  }
} else {
  await packageTarget(platform);
}
