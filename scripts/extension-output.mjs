import { mkdir, readdir, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

export async function ensureExtensionOutputRoot(output) {
  await mkdir(output, { recursive: true });
}

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return filesRecursively(path);
      return entry.isFile() ? [path] : [];
    }),
  );
  return files.flat();
}

export async function assertDirectoryContains(source, destination) {
  const sourceFiles = await filesRecursively(source);
  const failures = [];
  for (const sourcePath of sourceFiles) {
    const path = relative(source, sourcePath);
    const [sourceMetadata, destinationMetadata] = await Promise.all([
      stat(sourcePath),
      stat(resolve(destination, path)).catch(() => null),
    ]);
    if (!destinationMetadata?.isFile()) {
      failures.push(`${path}: missing`);
      continue;
    }
    if (destinationMetadata.size !== sourceMetadata.size) {
      failures.push(
        `${path}: expected ${sourceMetadata.size} bytes, found ${destinationMetadata.size}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Extension resource tree is incomplete:\n${failures.join('\n')}`,
    );
  }
}

export async function assertDirectoriesMatch(source, destination) {
  const [sourceFiles, destinationFiles] = await Promise.all([
    filesRecursively(source),
    filesRecursively(destination),
  ]);
  const sourcePaths = new Set(
    sourceFiles.map((path) => relative(source, path)),
  );
  const extra = destinationFiles
    .map((path) => relative(destination, path))
    .filter((path) => !sourcePaths.has(path));
  if (extra.length > 0) {
    throw new Error(
      `Extension resource tree contains unexpected files:\n${extra.join('\n')}`,
    );
  }
  await assertDirectoryContains(source, destination);
}
