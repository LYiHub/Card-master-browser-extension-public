import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { composeCatCatchBackground } from './cat-catch-vendor.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('CatCatch vendor integration', () => {
  it('uses portable DNR resource type strings in the composed background', async () => {
    const source = await composeCatCatchBackground(
      '/* platform background */',
      resolve(root, 'vendor/cat-catch'),
    );

    expect(source).not.toContain('declarativeNetRequest.ResourceType');
    expect(source).toContain(
      '"main_frame","sub_frame","stylesheet","script","image","font","object","xmlhttprequest","ping","csp_report","media","websocket","webtransport","webbundle","other"',
    );
    expect(source).toContain(
      "typeof messageOrId === 'string' && rest.length > 0",
    );
    expect(source).toContain("property === 'webNavigation'");
  });
});
