import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type UpstreamRecord = {
  id: string;
  source: string;
  integration: string;
  pin: string;
  updateChannel: string;
  license: string;
  localTargets: string[];
  contentHashes?: Record<string, string>;
};

type UpstreamManifest = {
  schemaVersion: number;
  lastAuditedAt: string;
  upstreams: UpstreamRecord[];
};

const root = resolve(import.meta.dirname, '..');

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
}

describe('upstream manifest', () => {
  it('tracks every integration that contributes to the extension', async () => {
    const manifest = await json<UpstreamManifest>('upstreams.json');
    const ids = manifest.upstreams.map((upstream) => upstream.id);

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.lastAuditedAt).toBe('2026-08-26');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'adguard-tswebextension',
        'adguard-dnr-rulesets',
        'darkreader',
        'video-speed-controller',
        'speeder',
        'hayame',
        'cat-catch',
        'violentmonkey',
        'tampermonkey',
        'scriptcat',
        'tabulabili',
        'pakku',
        'bilibili-sponsorblock',
        'sponsorblock',
        'bilikit',
        'bilibili-favorites-fix',
        'copying-lifted',
        'remapad',
        'spatial-nav-css',
        'gaming-controller-tester',
        'pinyin-ime',
      ]),
    );
    for (const upstream of manifest.upstreams) {
      expect(upstream.source).toMatch(/^https:\/\/github\.com\//);
      expect(upstream.integration).not.toBe('');
      expect(upstream.pin).not.toBe('');
      expect(upstream.updateChannel).not.toBe('');
      expect(upstream.license).not.toBe('');
      expect(upstream.localTargets.length).toBeGreaterThan(0);
      for (const target of upstream.localTargets) {
        await expect(access(resolve(root, target))).resolves.toBeUndefined();
      }
    }
  });

  it('matches direct dependency versions', async () => {
    const manifest = await json<UpstreamManifest>('upstreams.json');
    const packageJson = await json<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>('package.json');
    const pins = new Map(
      manifest.upstreams.map((upstream) => [upstream.id, upstream.pin]),
    );

    expect(pins.get('adguard-tswebextension')).toBe(
      packageJson.dependencies['@adguard/tswebextension'],
    );
    expect(pins.get('adguard-dnr-rulesets')).toBe(
      packageJson.devDependencies['@adguard/dnr-rulesets'],
    );
  });

  it('matches the bundled preinstalled userscript content', async () => {
    const manifest = await json<UpstreamManifest>('upstreams.json');
    const declared = Object.assign(
      {},
      ...manifest.upstreams.map((upstream) => upstream.contentHashes ?? {}),
    ) as Record<string, string>;

    expect(Object.keys(declared)).toHaveLength(4);
    for (const [path, expectedHash] of Object.entries(declared)) {
      const contents = await readFile(resolve(root, path));
      const actualHash = createHash('sha256').update(contents).digest('hex');
      expect(actualHash).toBe(expectedHash);
    }
  });

  it('credits every tracked upstream in public documentation', async () => {
    const manifest = await json<UpstreamManifest>('upstreams.json');
    const readme = await readFile(resolve(root, 'README.md'), 'utf8');
    const notices = await readFile(
      resolve(root, 'THIRD_PARTY_NOTICES.md'),
      'utf8',
    );
    for (const upstream of manifest.upstreams) {
      expect(readme).toContain(upstream.source);
      expect(notices).toContain(upstream.source);
      const pin = upstream.pin;
      expect(notices).toContain(
        /^[0-9a-f]{8,}$/i.test(pin) ? pin.slice(0, 7) : pin,
      );
    }
  });

  it('credits every direct package dependency in third-party notices', async () => {
    const packageJson = await json<{
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    }>('package.json');
    const notices = await readFile(
      resolve(root, 'THIRD_PARTY_NOTICES.md'),
      'utf8',
    );

    const directDependencies = [
      ...Object.keys(packageJson.dependencies),
      ...Object.keys(packageJson.devDependencies),
    ];
    for (const dependency of directDependencies) {
      expect(notices).toContain(`\`${dependency}\``);
    }
  });
});
