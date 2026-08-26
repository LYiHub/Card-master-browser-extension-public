import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { FLAME_SEQUENCE_IDS } from './FlameSequence';

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('UiLoader', () => {
  it('uses only the retained flame sequences', () => {
    expect(FLAME_SEQUENCE_IDS).toEqual([
      '01',
      '02',
      '03',
      '04',
      '06',
      '07',
      '10',
    ]);
    for (const sequence of ['05', '08', '09']) {
      expect(
        existsSync(
          new URL(
            `../../../assets/userscript-deck/visual/ui/flame-sequences/${sequence}`,
            import.meta.url,
          ),
        ),
      ).toBe(false);
    }
    expect(
      existsSync(
        new URL(
          '../../../assets/userscript-deck/visual/ui/interface/surfaces/loader-clock.webp',
          import.meta.url,
        ),
      ),
    ).toBe(false);
  });

  it('replaces only the shared loader and keeps independent loaders intact', () => {
    const ui = source('./Ui.tsx');
    const styles = source('./ui.css');
    const assistant = source(
      '../../features/assistant/AiConversationWorkbench.tsx',
    );
    const newTab = source('../../features/new-tab/NewTabSettingsPage.tsx');
    const flame = source('./FlameSequence.tsx');
    const message = source(
      '../../features/assistant/AssistantConversationMessage.tsx',
    );

    expect(ui).toContain('<LoadingFlame');
    expect(ui).toContain('size={compact ? 28 : large ? 260 : 112}');
    expect(ui).toContain('useTransitionPresence(visible, loaderRef)');
    expect(styles).not.toContain('loader-clock.webp');
    expect(assistant).toContain('Loader2');
    expect(newTab).toContain('LoaderCircle');
    expect(flame).toContain('usePageVisible()');
    expect(flame).toContain('!animated || !pageVisible');
    expect(message).toContain("animated={call.status !== 'error'}");
  });
});
