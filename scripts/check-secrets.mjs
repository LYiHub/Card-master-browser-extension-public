import { spawnSync } from 'node:child_process';

const image =
  'zricethezav/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f';
const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${process.cwd()}:/repo`,
    '-w',
    '/repo',
    image,
    'git',
    '--config',
    '.gitleaks.toml',
    '--redact',
    '--no-banner',
    '--verbose',
    '--log-opts=HEAD',
  ],
  { stdio: 'inherit' },
);

if (result.error) {
  if (result.error.code === 'ENOENT') {
    console.error(
      'Secret scanning requires Docker to be installed and running.',
    );
    process.exit(1);
  }
  throw result.error;
}
process.exit(result.status ?? 1);
