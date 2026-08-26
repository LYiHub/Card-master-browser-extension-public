import { spawnSync } from 'node:child_process';
import {
  EXTENSION_PLATFORM_USAGE,
  parseExtensionPlatform,
} from './extension-platforms.mjs';

let platform;
let positional;
try {
  ({ platform, positional } = parseExtensionPlatform(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    `Usage: pnpm ship "commit message" [${EXTENSION_PLATFORM_USAGE}]`,
  );
  process.exit(1);
}

const message = positional.join(' ').trim();

if (!message) {
  console.error(
    `Usage: pnpm ship "commit message" [${EXTENSION_PLATFORM_USAGE}]`,
  );
  process.exit(1);
}

const branch = spawnSync('git', ['branch', '--show-current'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});
if (branch.error) throw branch.error;
if (branch.status !== 0) process.exit(branch.status ?? 1);
if (branch.stdout.trim() !== 'main') {
  console.error('Card Master changes must be shipped directly from main.');
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('pnpm', ['install', '--frozen-lockfile=false']);
if (platform === 'safari' || platform === 'all') {
  run(process.execPath, ['scripts/sync-safari-branding.mjs']);
}
run(process.execPath, ['scripts/generate-card-media-accents.mjs']);
run('pnpm', ['lint:fix']);
run('pnpm', ['check']);
run(process.execPath, [
  'scripts/package-extensions.mjs',
  `--platform=${platform}`,
]);
if (platform === 'safari' || platform === 'all') {
  run(process.execPath, ['scripts/install-safari-app.mjs']);
}
run('git', ['add', '-A']);
run('git', ['commit', '-m', message]);

let pushed = false;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const result = spawnSync('git', ['push', 'origin', 'HEAD'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status === 0) {
    pushed = true;
    break;
  }
  if (attempt < 3) console.error(`Push failed, retrying (${attempt}/3)...`);
}

if (!pushed) process.exit(1);
