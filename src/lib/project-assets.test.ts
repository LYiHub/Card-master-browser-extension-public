import { describe, expect, it } from 'vitest';

import { projectAssetUrl, rewriteProjectAssetUrls } from './project-assets';

describe('project asset resolution', () => {
  it('uses the web development asset prefix outside an extension', () => {
    expect(
      projectAssetUrl('userscript-deck/visual/cards/card-master-back.webp'),
    ).toBe(
      '/project-assets/userscript-deck/visual/cards/card-master-back.webp',
    );
  });

  it('rewrites stylesheet asset roots for an extension origin', () => {
    expect(
      rewriteProjectAssetUrls(
        '.card{background:url("/project-assets/userscript-deck/visual/cards/card-master-back.webp")}',
        'chrome-extension://extension-id/project-assets/',
      ),
    ).toContain(
      'chrome-extension://extension-id/project-assets/userscript-deck/visual/cards/card-master-back.webp',
    );
  });
});
