import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const CARD_MASTER_BRANDING_SOURCE = resolve(
  root,
  'assets/userscript-deck/visual/action-icons/card-master-logo.png',
);

export const SAFARI_HOST_ICON = resolve(
  root,
  'safari/Card Master/Card Master/Resources/Icon.png',
);

const appIconDirectory = resolve(
  root,
  'safari/Card Master/Card Master/Assets.xcassets/AppIcon.appiconset',
);

export const SAFARI_APP_ICONS = [
  { path: resolve(appIconDirectory, 'mac-icon-16@1x.png'), size: 16 },
  { path: resolve(appIconDirectory, 'mac-icon-16@2x.png'), size: 32 },
  { path: resolve(appIconDirectory, 'mac-icon-32@1x.png'), size: 32 },
  { path: resolve(appIconDirectory, 'mac-icon-32@2x.png'), size: 64 },
  { path: resolve(appIconDirectory, 'mac-icon-128@1x.png'), size: 128 },
  { path: resolve(appIconDirectory, 'mac-icon-128@2x.png'), size: 256 },
  { path: resolve(appIconDirectory, 'mac-icon-256@1x.png'), size: 256 },
  { path: resolve(appIconDirectory, 'mac-icon-256@2x.png'), size: 512 },
  { path: resolve(appIconDirectory, 'mac-icon-512@1x.png'), size: 512 },
  { path: resolve(appIconDirectory, 'mac-icon-512@2x.png'), size: 1024 },
];

async function writeIfChanged(path, content) {
  const current = await readFile(path).catch(() => null);
  if (current?.equals(content)) return false;
  await writeFile(path, content);
  return true;
}

export async function renderSafariAppIcon(source, size) {
  return sharp(source)
    .resize(size, size, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .png({
      adaptiveFiltering: true,
      compressionLevel: 9,
    })
    .toBuffer();
}

export async function syncSafariBranding() {
  const source = await readFile(CARD_MASTER_BRANDING_SOURCE);
  const changed = [];

  if (await writeIfChanged(SAFARI_HOST_ICON, source)) {
    changed.push(SAFARI_HOST_ICON);
  }

  const renderedBySize = new Map();
  for (const icon of SAFARI_APP_ICONS) {
    let rendered = renderedBySize.get(icon.size);
    if (!rendered) {
      rendered = await renderSafariAppIcon(source, icon.size);
      renderedBySize.set(icon.size, rendered);
    }
    if (await writeIfChanged(icon.path, rendered)) {
      changed.push(icon.path);
    }
  }

  return changed;
}
