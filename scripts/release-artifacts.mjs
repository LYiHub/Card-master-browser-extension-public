import { readdir } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';

const FORBIDDEN_COMPONENTS = new Set([
  '.DS_Store',
  '.git',
  '__MACOSX',
  '_metadata',
  'node_modules',
]);

function normalizedPath(path) {
  return path
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
}

export function releaseArtifactPathIssue(path) {
  const normalized = normalizedPath(path);
  if (!normalized) return null;
  const components = normalized.split('/');
  const forbidden = components.find((component) =>
    FORBIDDEN_COMPONENTS.has(component),
  );
  if (forbidden) return `contains forbidden component ${forbidden}`;

  const name = basename(normalized);
  if (name.startsWith('._')) return 'contains an AppleDouble sidecar';
  if (name.endsWith('.map')) return 'contains a source map';
  if (name.endsWith('.tmp') || name.endsWith('~')) {
    return 'contains a temporary file';
  }
  return null;
}

async function releaseDirectoryIssues(root, directory = root) {
  const issues = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const relativePath = relative(root, path).split('\\').join('/');
    const issue = releaseArtifactPathIssue(relativePath);
    if (issue) {
      issues.push(`${relativePath}: ${issue}`);
      continue;
    }
    if (entry.isSymbolicLink()) {
      issues.push(`${relativePath}: symbolic links are not allowed`);
    } else if (entry.isDirectory()) {
      issues.push(...(await releaseDirectoryIssues(root, path)));
    }
  }
  return issues;
}

export async function assertReleaseDirectoryClean(root) {
  const issues = await releaseDirectoryIssues(root);
  if (issues.length > 0) {
    throw new Error(
      `Release source contains generated or unsafe files:\n${issues.join('\n')}`,
    );
  }
}

export function assertArchiveListingClean(listing, artifactName) {
  const issues = listing
    .split('\n')
    .map((path) => [path, releaseArtifactPathIssue(path)])
    .filter((entry) => entry[1])
    .map(([path, issue]) => `${normalizedPath(path)}: ${issue}`);
  if (issues.length > 0) {
    throw new Error(
      `${artifactName} contains generated or unsafe files:\n${issues.join('\n')}`,
    );
  }
}
