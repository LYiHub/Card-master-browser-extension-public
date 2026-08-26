import { readFile } from 'node:fs/promises';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  CARD_MASTER_BRANDING_SOURCE,
  renderSafariAppIcon,
  SAFARI_APP_ICONS,
} from './safari-branding.mjs';

describe('Safari branding', () => {
  it('derives every macOS app icon from the Card Master logo', async () => {
    const source = await readFile(CARD_MASTER_BRANDING_SOURCE);

    for (const icon of SAFARI_APP_ICONS) {
      const rendered = await renderSafariAppIcon(source, icon.size);
      const metadata = await sharp(rendered).metadata();
      expect(metadata.width).toBe(icon.size);
      expect(metadata.height).toBe(icon.size);
    }
  });

  it('references only current extension bundles', async () => {
    const project = await readFile(
      new URL(
        '../safari/Card Master/Card Master.xcodeproj/project.pbxproj',
        import.meta.url,
      ),
      'utf8',
    );
    for (const retired of [
      'content-host.js',
      'content-prefetch.js',
      'content-detail.js',
      'content-audio.js',
    ]) {
      expect(project).not.toContain(retired);
    }
    expect(project).not.toContain('ASSET_LICENSE.md');
  });
});
