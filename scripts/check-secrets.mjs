import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const image =
  'zricethezav/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (!result.error && result.status === 0) return;
  if (result.error?.code === 'ENOENT' && command === 'docker') {
    console.error(
      'Secret scanning requires Docker to be installed and running.',
    );
    process.exit(1);
  }
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function runGitleaks(source, args) {
  run('docker', [
    'run',
    '--rm',
    '-v',
    `${source}:/repo`,
    '-w',
    '/repo',
    image,
    ...args,
  ]);
}

const root = process.cwd();
runGitleaks(root, [
  'git',
  '--config',
  '.gitleaks.toml',
  '--redact',
  '--no-banner',
  '--verbose',
  '--log-opts=HEAD',
]);

const listed = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
);
if (listed.error) throw listed.error;
if (listed.status !== 0) process.exit(listed.status ?? 1);

const snapshot = await mkdtemp(join(tmpdir(), 'card-master-secret-scan-'));
try {
  for (const path of listed.stdout.split('\0').filter(Boolean)) {
    const source = resolve(root, path);
    const metadata = await stat(source).catch(() => null);
    if (!metadata?.isFile()) continue;
    const destination = resolve(snapshot, path);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
  runGitleaks(snapshot, [
    'dir',
    '--config',
    '.gitleaks.toml',
    '--redact',
    '--no-banner',
    '--verbose',
    '--max-target-megabytes=16',
    '.',
  ]);
} finally {
  await rm(snapshot, { force: true, recursive: true });
}
