import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOGO_PATH =
  'project-assets/userscript-deck/visual/action-icons/card-master-logo.png';

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), 'utf8');
}

describe('new tab document branding', () => {
  it('uses neutral tab titles and the Card Master logo favicon', async () => {
    const [newTab, settings, runtime] = await Promise.all([
      source('extension/new-tab.html'),
      source('extension/new-tab-settings.html'),
      source('src/hosts/extension/new-tab-entry.ts'),
    ]);

    expect(newTab).toContain('<title>新标签页</title>');
    expect(settings).toContain('<title>新标签页设置</title>');
    expect(newTab).not.toContain('<title>卡牌大师</title>');
    expect(settings).not.toContain('新标签页设置 - 卡牌大师');
    expect(newTab).toContain(`href="${LOGO_PATH}"`);
    expect(settings).toContain(`href="${LOGO_PATH}"`);
    expect(runtime).toContain(
      "window.open(api.runtime.getURL('new-tab-settings.html'), '_blank')",
    );
    expect(runtime).toContain("const NEW_TAB_TITLE = '新标签页';");
    expect(runtime).toContain('const CARD_MASTER_LOGO_PATH');
    expect(runtime).toContain(LOGO_PATH);
  });
});
