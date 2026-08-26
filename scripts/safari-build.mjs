import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertDirectoriesMatch } from './extension-output.mjs';
import { syncSafariBranding } from './safari-branding.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const localEnvironment = resolve(root, '.env.local');
if (existsSync(localEnvironment)) process.loadEnvFile(localEnvironment);

const projectMetadata = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
);

export const SAFARI_DEVELOPER_DIR =
  '/Applications/Xcode-beta.app/Contents/Developer';
export const SAFARI_PROJECT = resolve(
  root,
  'safari/Card Master/Card Master.xcodeproj',
);
export const SAFARI_SCHEME = 'Card Master';
export const SAFARI_APP_NAME = 'Card Master.app';
export const SAFARI_EXTENSION_NAME = 'Card Master Extension.appex';
export const SAFARI_EXTENSION_IDENTIFIER = 'com.lyihub.cardmaster.Extension';
export const SAFARI_PACKAGED_RESOURCES = resolve(root, 'extension-dist/safari');
export const SAFARI_VERSION = projectMetadata.version;

if (!/^\d+\.\d+\.\d+$/.test(SAFARI_VERSION)) {
  throw new Error(
    `Safari release builds require a numeric semantic version, found ${SAFARI_VERSION}.`,
  );
}

export function runSafariCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: options.capture ? 'utf8' : undefined,
    env: {
      ...process.env,
      DEVELOPER_DIR: SAFARI_DEVELOPER_DIR,
      ...options.env,
    },
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture
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

function requireDevelopmentTeam() {
  const team = process.env.CARD_MASTER_SAFARI_DEVELOPMENT_TEAM?.trim();
  if (!team) {
    throw new Error(
      'Set CARD_MASTER_SAFARI_DEVELOPMENT_TEAM in .env.local before packaging Safari.',
    );
  }
  return team;
}

function currentCommitCount() {
  const head = runSafariCommand('git', ['rev-parse', '--verify', 'HEAD'], {
    allowFailure: true,
    capture: true,
  });
  if (head.status !== 0) return 0;

  const result = runSafariCommand('git', ['rev-list', '--count', 'HEAD'], {
    capture: true,
  });
  const count = Number.parseInt(result.stdout.trim(), 10);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Unable to derive the Safari build number from git.');
  }
  return count;
}

export function safariBuildNumber() {
  const status = runSafariCommand('git', ['status', '--porcelain'], {
    capture: true,
  });
  const pendingCommit = status.stdout.trim().length > 0 ? 1 : 0;
  return String(Math.max(1, currentCommitCount() + pendingCommit));
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function buildSafariArchive({
  archivePath,
  derivedDataPath,
  signing = 'development',
}) {
  if (!['development', 'developer-id'].includes(signing)) {
    throw new Error(`Unsupported Safari signing mode: ${signing}`);
  }

  await syncSafariBranding();
  const team = requireDevelopmentTeam();
  const buildNumber = safariBuildNumber();
  const buildArguments = [
    '-project',
    SAFARI_PROJECT,
    '-scheme',
    SAFARI_SCHEME,
    '-configuration',
    'Release',
    '-destination',
    'generic/platform=macOS',
    '-derivedDataPath',
    derivedDataPath,
    '-archivePath',
    archivePath,
    `CURRENT_PROJECT_VERSION=${buildNumber}`,
    `MARKETING_VERSION=${SAFARI_VERSION}`,
    `DEVELOPMENT_TEAM=${team}`,
  ];
  if (signing === 'developer-id') {
    buildArguments.push(
      'CODE_SIGN_STYLE=Manual',
      'CODE_SIGN_IDENTITY=Developer ID Application',
      'OTHER_CODE_SIGN_FLAGS=--timestamp',
    );
  }
  buildArguments.push('archive');

  runSafariCommand('xcodebuild', buildArguments);

  const app = join(archivePath, 'Products', 'Applications', SAFARI_APP_NAME);
  if (!(await pathExists(app))) {
    throw new Error(`Safari build did not produce ${app}.`);
  }
  await assertDirectoriesMatch(
    SAFARI_PACKAGED_RESOURCES,
    join(
      app,
      'Contents',
      'PlugIns',
      SAFARI_EXTENSION_NAME,
      'Contents',
      'Resources',
    ),
  );
  runSafariCommand('codesign', ['-vvv', '--deep', '--strict', app]);

  if (signing === 'developer-id') {
    const signature = runSafariCommand(
      'codesign',
      ['-dv', '--verbose=4', app],
      { capture: true },
    );
    const detail = `${signature.stdout}\n${signature.stderr}`;
    if (!detail.includes('Authority=Developer ID Application:')) {
      throw new Error(
        'Safari release app is not signed with a Developer ID Application certificate.',
      );
    }
  }

  return { app, buildNumber, team, version: SAFARI_VERSION };
}
