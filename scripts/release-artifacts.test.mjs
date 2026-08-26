import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertArchiveListingClean,
  assertReleaseDirectoryClean,
  releaseArtifactPathIssue,
} from './release-artifacts.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('release artifact hygiene', () => {
  it('rejects browser caches, macOS metadata, source maps and temporary files', () => {
    expect(
      releaseArtifactPathIssue('_metadata/generated_indexed_rulesets/rules'),
    ).toContain('_metadata');
    expect(releaseArtifactPathIssue('__MACOSX/App/._binary')).toContain(
      '__MACOSX',
    );
    expect(releaseArtifactPathIssue('App/Contents/._binary')).toContain(
      'AppleDouble',
    );
    expect(releaseArtifactPathIssue('background.js.map')).toContain(
      'source map',
    );
    expect(releaseArtifactPathIssue('manifest.json')).toBeNull();
  });

  it('validates release source directories recursively', async () => {
    const root = await mkdtemp(join(tmpdir(), 'card-master-release-source-'));
    temporaryRoots.push(root);
    await mkdir(join(root, 'project-assets'), { recursive: true });
    await writeFile(join(root, 'manifest.json'), '{}');
    await writeFile(join(root, 'project-assets', 'card.webp'), 'card');

    await expect(assertReleaseDirectoryClean(root)).resolves.toBeUndefined();

    await mkdir(join(root, '_metadata'), { recursive: true });
    await writeFile(join(root, '_metadata', 'rules'), 'cache');
    await expect(assertReleaseDirectoryClean(root)).rejects.toThrow(
      '_metadata: contains forbidden component',
    );
  });

  it('rejects symbolic links and polluted archive listings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'card-master-release-source-'));
    temporaryRoots.push(root);
    await writeFile(join(root, 'manifest.json'), '{}');
    await symlink(
      join(root, 'manifest.json'),
      join(root, 'manifest-link.json'),
    );

    await expect(assertReleaseDirectoryClean(root)).rejects.toThrow(
      'symbolic links are not allowed',
    );
    expect(() =>
      assertArchiveListingClean(
        'manifest.json\n__MACOSX/App/._Info.plist\n',
        'artifact.zip',
      ),
    ).toThrow('artifact.zip contains generated or unsafe files');
  });
});
