import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const TEST_FILE = 'src/lib/repository-hygiene.test.ts';
const TEXT_ROOTS = ['src', 'scripts', 'extension'];
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
]);
const FORBIDDEN_TERMS = ['归' + '一'] as const;

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(path) : [path];
    }),
  );
  return files.flat();
}

describe('product terminology', () => {
  it('keeps active source and asset paths free of retired terms', async () => {
    const sourceFiles = (
      await Promise.all(TEXT_ROOTS.map((directory) => filesUnder(directory)))
    )
      .flat()
      .filter(
        (file) =>
          relative(ROOT, file) !== TEST_FILE &&
          TEXT_EXTENSIONS.has(extname(file)),
      );
    sourceFiles.push(join(ROOT, 'README.md'));
    const assetPaths = (await filesUnder(join(ROOT, 'assets'))).map((file) =>
      relative(ROOT, file),
    );
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const content = (await readFile(file, 'utf8')).toLowerCase();
      for (const term of FORBIDDEN_TERMS) {
        if (content.includes(term.toLowerCase())) {
          violations.push(`${relative(ROOT, file)}: ${term}`);
        }
      }
    }
    for (const path of assetPaths) {
      const normalized = path.toLowerCase();
      for (const term of FORBIDDEN_TERMS) {
        if (normalized.includes(term.toLowerCase())) {
          violations.push(`${path}: ${term}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps product documentation and runtime locales Simplified Chinese only', async () => {
    await expect(stat(join(ROOT, 'README.en.md'))).rejects.toThrow();

    const readme = await readFile(join(ROOT, 'README.md'), 'utf8');
    expect(readme).not.toContain('README.en.md');

    const manifest = JSON.parse(
      await readFile(join(ROOT, 'extension/manifest.common.json'), 'utf8'),
    ) as { default_locale?: string };
    expect(manifest.default_locale).toBe('zh_CN');

    for (const localeRoot of [
      join(ROOT, 'vendor/bilibili/sponsor/_locales'),
      join(ROOT, 'vendor/youtube/sponsor/_locales'),
    ]) {
      const locales: string[] = [];
      for (const entry of await readdir(localeRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const messages = join(localeRoot, entry.name, 'messages.json');
        if ((await stat(messages).catch(() => null))?.isFile()) {
          locales.push(entry.name);
        }
      }
      locales.sort();
      expect(locales).toEqual(['zh_CN']);
    }

    for (const vendorManifest of [
      join(ROOT, 'vendor/bilibili/sponsor/manifest.json'),
      join(ROOT, 'vendor/youtube/sponsor/manifest.json'),
    ]) {
      const vendor = JSON.parse(await readFile(vendorManifest, 'utf8')) as {
        default_locale?: string;
      };
      expect(vendor.default_locale).toBe('zh_CN');
    }
  });

  it('packages the new tab override from explicit source files', async () => {
    const packageScript = await readFile(
      join(ROOT, 'scripts/package-extension.mjs'),
      'utf8',
    );
    const html = await readFile(
      join(ROOT, 'vendor/lumno/runtime/src/newtab/newtab.html'),
      'utf8',
    );

    expect(packageScript).not.toContain(
      "['src/hosts/extension/new-tab.tsx', 'new-tab.js', 'iife']",
    );
    expect(packageScript).toContain(
      "resolve(root, 'vendor/lumno/runtime/src')",
    );
    expect(packageScript).toContain(
      "['src/hosts/extension/new-tab-entry.ts', 'new-tab-entry.js', 'iife']",
    );
    expect(html).toContain('data-lumno-page="newtab"');
    expect(html).toContain('data-page-entry="../newtab/newtab.js"');
    for (const retiredSource of [
      'src/hosts/extension/new-tab.tsx',
      'src/features/new-tab/NewTabAppearanceContext.tsx',
      'src/features/new-tab/NewTabBookmarks.tsx',
      'src/features/new-tab/NewTabFavicon.tsx',
      'src/features/new-tab/NewTabHome.tsx',
      'src/features/new-tab/NewTabPage.tsx',
      'src/features/new-tab/NewTabSearch.tsx',
      'src/features/new-tab/new-tab.css',
    ]) {
      expect(
        await stat(join(ROOT, retiredSource)).catch(() => null),
      ).toBeNull();
    }
  });

  it('keeps the audited Lumno wallpaper inventory exact', async () => {
    const vendorRoot = join(ROOT, 'vendor/lumno');
    await expect(
      stat(join(vendorRoot, 'runtime/assets/wallpapers')),
    ).rejects.toThrow();
    const inventory = JSON.parse(
      await readFile(join(vendorRoot, 'WALLPAPERS.json'), 'utf8'),
    ) as {
      fileCount: number;
      totalBytes: number;
      files: Array<{ file: string; bytes: number; sha256: string }>;
    };
    expect(inventory.fileCount).toBe(12);
    expect(inventory.totalBytes).toBe(2_286_490);
    let totalBytes = 0;
    for (const entry of inventory.files) {
      const contents = await readFile(
        join(vendorRoot, 'wallpapers', entry.file),
      );
      expect(contents.byteLength).toBe(entry.bytes);
      expect(createHash('sha256').update(contents).digest('hex')).toBe(
        entry.sha256,
      );
      totalBytes += contents.byteLength;
    }
    expect(inventory.files).toHaveLength(inventory.fileCount);
    expect(totalBytes).toBe(inventory.totalBytes);
  });

  it('keeps the customized new-tab page byte-exact', async () => {
    const source = await readFile(
      join(ROOT, 'vendor/lumno/runtime/src/newtab/newtab.html'),
    );
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      'c8599f755abf55f8da41efb771af5cd9eab1eae8ab48e49cf17c6f210b4c8fa0',
    );
  });
});
