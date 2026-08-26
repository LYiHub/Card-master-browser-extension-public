import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GSAP_ADAPTERS = new Set(['motion/gsap-motion-path.ts', 'motion/gsap.ts']);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
}

function sourcePath(file: string) {
  return relative(SOURCE_ROOT, file).replaceAll('\\', '/');
}

describe('motion architecture boundaries', () => {
  it('routes GreenSock imports through the shared motion adapters', async () => {
    const violations = [];
    for (const file of await sourceFiles(SOURCE_ROOT)) {
      const path = sourcePath(file);
      if (GSAP_ADAPTERS.has(path)) continue;
      const source = await readFile(file, 'utf8');
      if (/from\s+['"]gsap(?:\/[^'"]*)?['"]/.test(source)) {
        violations.push(path);
      }
    }
    expect(violations).toEqual([]);
  });

  it('does not introduce a competing Web Animations API layer', async () => {
    const violations = [];
    for (const file of await sourceFiles(SOURCE_ROOT)) {
      const source = await readFile(file, 'utf8');
      if (/\.animate\s*\(/.test(source)) {
        violations.push(sourcePath(file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps targeting motion under the existing GSAP tilt owner', async () => {
    const gesture = await readFile(
      resolve(
        SOURCE_ROOT,
        'features/manager-interaction/useManagerCardGesture.ts',
      ),
      'utf8',
    );
    const cards = await readFile(
      resolve(SOURCE_ROOT, 'features/userscript-deck/styles/cards.css'),
      'utf8',
    );
    const motion = await readFile(
      resolve(SOURCE_ROOT, 'features/userscript-deck/styles/motion.css'),
      'utf8',
    );

    expect(gesture).toContain('const timeline = gsap.timeline({ repeat: -1 })');
    expect(cards).not.toContain('manager-card-ios-wiggle');
    expect(motion).not.toContain('@keyframes manager-card-ios-wiggle');
  });
});
