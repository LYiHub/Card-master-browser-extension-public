import { access, mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDirectoriesMatch } from './extension-output.mjs';
import {
  buildSafariArchive,
  runSafariCommand,
  SAFARI_APP_NAME,
  SAFARI_EXTENSION_IDENTIFIER,
  SAFARI_EXTENSION_NAME,
  SAFARI_PACKAGED_RESOURCES,
} from './safari-build.mjs';

const appName = SAFARI_APP_NAME;
const extensionName = SAFARI_EXTENSION_NAME;
const installedApp = `/Applications/${appName}`;
const installedExtension = join(
  installedApp,
  'Contents',
  'PlugIns',
  extensionName,
);
const extensionIdentifier = SAFARI_EXTENSION_IDENTIFIER;
const launchServicesRegister =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const packagedExtensionResources = SAFARI_PACKAGED_RESOURCES;
const run = runSafariCommand;

function extensionResources(app) {
  return join(
    app,
    'Contents',
    'PlugIns',
    extensionName,
    'Contents',
    'Resources',
  );
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stopHostApp() {
  run('killall', ['Card Master'], { allowFailure: true });
}

function registerInstalledApp() {
  run(launchServicesRegister, ['-f', installedApp]);
  run('open', ['-g', '-j', '-n', installedApp]);
}

async function verifyInstalledApp() {
  run('codesign', ['-vvv', '--deep', '--strict', installedApp]);
  await assertDirectoriesMatch(
    packagedExtensionResources,
    extensionResources(installedApp),
  );
  const result = run(
    'pluginkit',
    ['-m', '-A', '-D', '-vv', '-i', extensionIdentifier],
    { capture: true },
  );
  if (!result.stdout.includes(`Path = ${installedExtension}`)) {
    throw new Error(
      `Safari extension registration does not point to ${installedExtension}:\n${result.stdout.trim()}`,
    );
  }
}

function safariIsRunning() {
  return (
    run('pgrep', ['-x', 'Safari'], {
      allowFailure: true,
      capture: true,
    }).status === 0
  );
}

const derivedData = await mkdtemp(join(tmpdir(), 'card-master-safari-'));
const archive = join(derivedData, 'Card Master.xcarchive');
const stagingApp = `/Applications/.${appName}.installing-${process.pid}`;
const backupApp = `/Applications/.${appName}.backup-${process.pid}`;
let oldAppMoved = false;

try {
  const safariWasRunning = safariIsRunning();
  const { app: builtApp, buildNumber } = await buildSafariArchive({
    archivePath: archive,
    derivedDataPath: derivedData,
    signing: 'development',
  });

  await rm(stagingApp, { force: true, recursive: true });
  await rm(backupApp, { force: true, recursive: true });
  run('ditto', [builtApp, stagingApp]);

  stopHostApp();
  if (await exists(installedApp)) {
    await rename(installedApp, backupApp);
    oldAppMoved = true;
  }

  await rename(stagingApp, installedApp);
  registerInstalledApp();
  await verifyInstalledApp();

  await rm(backupApp, { force: true, recursive: true });
  oldAppMoved = false;
  console.log(
    `Safari app ${buildNumber} installed, registered, and launched from ${installedApp}.`,
  );
  if (safariWasRunning) {
    console.warn(
      'Safari remained untouched during installation. Quit and reopen Safari before testing the updated extension.',
    );
  }
} catch (error) {
  if (oldAppMoved && (await exists(backupApp))) {
    stopHostApp();
    if (await exists(installedApp)) {
      await rm(installedApp, { force: true, recursive: true });
    }
    await rename(backupApp, installedApp);
    registerInstalledApp();
    oldAppMoved = false;
  }
  throw error;
} finally {
  await rm(stagingApp, { force: true, recursive: true });
  await rm(backupApp, { force: true, recursive: true });
  await rm(derivedData, { force: true, recursive: true });
}
