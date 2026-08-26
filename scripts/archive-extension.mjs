import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

import {
  assertArchiveListingClean,
  assertReleaseDirectoryClean,
} from './release-artifacts.mjs';

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture
      ? [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
      : '';
    throw new Error(
      `${basename(command)} exited with ${result.status ?? 'unknown'}${
        detail ? `:\n${detail}` : ''
      }`,
    );
  }
  return result;
}

export async function archiveExtension(source, destination) {
  await assertReleaseDirectoryClean(source);
  run('ditto', [
    '-c',
    '-k',
    '--norsrc',
    '--noextattr',
    '--noqtn',
    '--noacl',
    source,
    destination,
  ]);
  const listing = run('unzip', ['-Z1', destination], { capture: true }).stdout;
  assertArchiveListingClean(listing, basename(destination));
  if (!listing.split('\n').includes('manifest.json')) {
    throw new Error(
      `${basename(destination)} must contain manifest.json at its root.`,
    );
  }
}
