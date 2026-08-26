import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { archiveExtension } from './archive-extension.mjs';
import {
  assertArchiveListingClean,
  assertReleaseDirectoryClean,
} from './release-artifacts.mjs';
import {
  buildSafariArchive,
  runSafariCommand,
  SAFARI_APP_NAME,
  SAFARI_PACKAGED_RESOURCES,
  SAFARI_VERSION,
} from './safari-build.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const releaseOutput = resolve(root, 'release-dist');
const releasePrefix = `card-master-v${SAFARI_VERSION}`;
const releaseArguments = new Set(process.argv.slice(2));
const allowUnnotarizedSafari = releaseArguments.delete(
  '--allow-unnotarized-safari',
);
if (releaseArguments.size > 0) {
  throw new Error(
    `Unknown release arguments: ${[...releaseArguments].join(', ')}`,
  );
}
const notaryProfile = process.env.CARD_MASTER_SAFARI_NOTARY_PROFILE?.trim();
if (!notaryProfile && !allowUnnotarizedSafari) {
  throw new Error(
    'CARD_MASTER_SAFARI_NOTARY_PROFILE is required for a distributable release. Use --allow-unnotarized-safari only for an explicit preview release.',
  );
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function buildExtensions(output) {
  runSafariCommand(
    process.execPath,
    ['scripts/package-extensions.mjs', '--platform=all'],
    { env: { EXTENSION_OUTPUT_ROOT: output } },
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function assertPlatformBuilds(extensionOutput) {
  const platforms = ['chromium', 'firefox', 'safari'];
  const manifests = await Promise.all(
    platforms.map(async (platform) => {
      const output = resolve(extensionOutput, platform);
      await assertReleaseDirectoryClean(output);
      return {
        platform,
        manifest: await readJson(resolve(output, 'manifest.json')),
      };
    }),
  );
  const mismatches = manifests.filter(
    ({ manifest }) => manifest.version !== SAFARI_VERSION,
  );
  if (mismatches.length > 0) {
    throw new Error(
      `Release version mismatch: ${mismatches
        .map(
          ({ platform, manifest }) =>
            `${platform}=${manifest.version ?? 'missing'}`,
        )
        .join(', ')}, package=${SAFARI_VERSION}.`,
    );
  }
}

function archiveListing(destination) {
  return runSafariCommand('unzip', ['-Z1', destination], {
    capture: true,
  }).stdout;
}

function archiveSafariApp(app, destination) {
  runSafariCommand('ditto', [
    '-c',
    '-k',
    '--norsrc',
    '--noextattr',
    '--noqtn',
    '--noacl',
    '--keepParent',
    app,
    destination,
  ]);
  const listing = archiveListing(destination);
  assertArchiveListingClean(listing, basename(destination));
  if (!listing.includes(`${SAFARI_APP_NAME}/Contents/Info.plist`)) {
    throw new Error(`${basename(destination)} is missing the Safari app.`);
  }
}

async function validateSafariArchive(archive, validationRoot, { notarized }) {
  await rm(validationRoot, { force: true, recursive: true });
  await mkdir(validationRoot, { recursive: true });
  runSafariCommand('ditto', ['-x', '-k', archive, validationRoot]);
  const app = resolve(validationRoot, SAFARI_APP_NAME);
  runSafariCommand('codesign', ['-vvv', '--deep', '--strict', app]);
  if (notarized) {
    runSafariCommand('xcrun', ['stapler', 'validate', app]);
    runSafariCommand('spctl', ['-a', '-vv', app]);
  }
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function publishStagedRelease(stagedOutput, stagingRoot) {
  const previousRelease = resolve(stagingRoot, 'previous-release');
  const hadPreviousRelease = await pathExists(releaseOutput);
  if (hadPreviousRelease) await rename(releaseOutput, previousRelease);
  try {
    await rename(stagedOutput, releaseOutput);
  } catch (error) {
    if (hadPreviousRelease && (await pathExists(previousRelease))) {
      await rename(previousRelease, releaseOutput);
    }
    throw error;
  }
  await rm(previousRelease, { force: true, recursive: true });
}

const stagingRoot = await mkdtemp(resolve(root, '.release-dist-'));
const stagedOutput = resolve(stagingRoot, 'release-dist');
const releaseBuildOutput = resolve(stagingRoot, 'extension-dist');
const temporaryRoot = await mkdtemp(
  join(tmpdir(), 'card-master-safari-release-'),
);
let notarized = false;
try {
  buildExtensions(releaseBuildOutput);
  await assertPlatformBuilds(releaseBuildOutput);
  await mkdir(stagedOutput, { recursive: true });
  const chromiumArchive = resolve(
    stagedOutput,
    `${releasePrefix}-chromium.zip`,
  );
  const firefoxArchive = resolve(stagedOutput, `${releasePrefix}-firefox.zip`);
  const safariArchive = resolve(
    stagedOutput,
    `${releasePrefix}-safari-macos.zip`,
  );

  await archiveExtension(
    resolve(releaseBuildOutput, 'chromium'),
    chromiumArchive,
  );
  await archiveExtension(
    resolve(releaseBuildOutput, 'firefox'),
    firefoxArchive,
  );

  await rm(SAFARI_PACKAGED_RESOURCES, { force: true, recursive: true });
  await cp(resolve(releaseBuildOutput, 'safari'), SAFARI_PACKAGED_RESOURCES, {
    recursive: true,
  });

  const archivePath = join(temporaryRoot, 'Card Master.xcarchive');
  const derivedDataPath = join(temporaryRoot, 'DerivedData');
  const { app, buildNumber } = await buildSafariArchive({
    archivePath,
    derivedDataPath,
    signing: 'developer-id',
  });

  if (notaryProfile) {
    const submission = join(temporaryRoot, 'notary-submission.zip');
    archiveSafariApp(app, submission);
    await validateSafariArchive(
      submission,
      join(temporaryRoot, 'submission-validation'),
      { notarized: false },
    );
    runSafariCommand('xcrun', [
      'notarytool',
      'submit',
      submission,
      '--keychain-profile',
      notaryProfile,
      '--wait',
    ]);
    runSafariCommand('xcrun', ['stapler', 'staple', app]);
    runSafariCommand('xcrun', ['stapler', 'validate', app]);
    runSafariCommand('spctl', ['-a', '-vv', app]);
    notarized = true;
  } else {
    console.warn(
      'CARD_MASTER_SAFARI_NOTARY_PROFILE is not set; packaging a Developer ID signed but unnotarized Safari app.',
    );
  }

  archiveSafariApp(app, safariArchive);
  await validateSafariArchive(
    safariArchive,
    join(temporaryRoot, 'release-validation'),
    { notarized },
  );
  console.log(
    `Safari ${SAFARI_VERSION} build ${buildNumber} packaged (${notarized ? 'notarized' : 'not notarized'}).`,
  );

  const artifacts = (await readdir(stagedOutput)).sort();
  const checksums = await Promise.all(
    artifacts.map(
      async (name) => `${await sha256(resolve(stagedOutput, name))}  ${name}`,
    ),
  );
  await writeFile(
    resolve(stagedOutput, 'SHA256SUMS.txt'),
    `${checksums.join('\n')}\n`,
  );

  for (const name of artifacts) {
    const bytes = (await stat(resolve(stagedOutput, name))).size;
    console.log(`${name}: ${bytes} bytes`);
  }

  await publishStagedRelease(stagedOutput, stagingRoot);
  console.log(
    `Release ${SAFARI_VERSION} packaged at ${releaseOutput} with ${artifacts.length} platform artifacts and SHA-256 checksums.`,
  );
} finally {
  await Promise.all([
    rm(temporaryRoot, { force: true, recursive: true }),
    rm(stagingRoot, { force: true, recursive: true }),
  ]);
}
