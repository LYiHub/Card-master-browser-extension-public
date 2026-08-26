import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertDirectoriesMatch,
  assertDirectoryContains,
  ensureExtensionOutputRoot,
} from './extension-output.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('extension output root', () => {
  it('preserves existing platform builds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'extension-output-'));
    temporaryRoots.push(root);
    const firefoxMarker = join(root, 'firefox', 'marker.txt');
    const safariMarker = join(root, 'safari', 'marker.txt');
    await mkdir(join(root, 'firefox'));
    await mkdir(join(root, 'safari'));
    await writeFile(firefoxMarker, 'firefox');
    await writeFile(safariMarker, 'safari');

    await ensureExtensionOutputRoot(root);

    await expect(readFile(firefoxMarker, 'utf8')).resolves.toBe('firefox');
    await expect(readFile(safariMarker, 'utf8')).resolves.toBe('safari');
  });

  it('rejects missing or truncated archived resources', async () => {
    const root = await mkdtemp(join(tmpdir(), 'extension-output-'));
    temporaryRoots.push(root);
    const source = join(root, 'source');
    const destination = join(root, 'destination');
    await mkdir(join(source, 'vendor'), { recursive: true });
    await mkdir(join(destination, 'vendor'), { recursive: true });
    await writeFile(join(source, 'manifest.json'), '{}');
    await writeFile(join(source, 'vendor', 'runtime.js'), 'runtime');
    await writeFile(join(destination, 'manifest.json'), '{}');
    await writeFile(join(destination, 'vendor', 'runtime.js'), 'run');

    await expect(assertDirectoryContains(source, destination)).rejects.toThrow(
      'vendor/runtime.js: expected 7 bytes, found 3',
    );

    await writeFile(join(destination, 'vendor', 'runtime.js'), 'runtime');
    await expect(
      assertDirectoryContains(source, destination),
    ).resolves.toBeUndefined();

    await rm(join(destination, 'manifest.json'));
    await expect(assertDirectoryContains(source, destination)).rejects.toThrow(
      'manifest.json: missing',
    );
  });

  it('rejects unexpected files in archived resource trees', async () => {
    const root = await mkdtemp(join(tmpdir(), 'extension-output-'));
    temporaryRoots.push(root);
    const source = join(root, 'source');
    const destination = join(root, 'destination');
    await mkdir(source);
    await mkdir(destination);
    await writeFile(join(source, 'manifest.json'), '{}');
    await writeFile(join(destination, 'manifest.json'), '{}');

    await expect(
      assertDirectoriesMatch(source, destination),
    ).resolves.toBeUndefined();

    await writeFile(join(destination, 'stale.js'), 'stale');
    await expect(assertDirectoriesMatch(source, destination)).rejects.toThrow(
      'stale.js',
    );
  });
});
