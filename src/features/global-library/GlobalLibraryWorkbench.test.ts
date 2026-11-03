import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('GlobalLibraryWorkbench', () => {
  it('keeps selected card video silent unless the pointer is hovering it', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      'playing={visible && (selected || hovered || focused)}',
    );
    expect(source).toContain('audioActive={hovered}');
  });

  it('presses, settles and floats the selected card on one transform timeline', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );
    const css = readFileSync(
      new URL('./global-library.css', import.meta.url),
      'utf8',
    );

    expect(source).toContain('showHeading={false}');
    expect(source).toContain('expandable');
    expect(source).toContain('expanded={sourceExpanded}');
    expect(source).toContain('onSourceExpandedChange={setSourceExpanded}');
    expect(css).not.toContain('.global-library-workspace.is-source-inspection');
    expect(css).toContain('.global-library-workspace.is-source-expanded');
    expect(source).toContain('previousBoundsRef.current');
    expect(source).toContain('scale: 1.04');
    expect(source).toContain('scale: 1.1');
    expect(source).toContain("ease: 'power3.out'");
    expect(source).toContain('repeat: -1');
    expect(css).not.toContain('@keyframes global-library-card-float');
  });

  it('tints each bottom frame with that card theme accent', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );
    const css = readFileSync(
      new URL('./global-library.css', import.meta.url),
      'utf8',
    );

    expect(source).toContain("'--manager-accent': accent");
    expect(css).toContain('.global-library-card__bottom::before');
    expect(css).toContain('var(--manager-accent, #d9b76a)');
    expect(css).toContain(
      'mask: var(--card-bottom-frame-image) center / contain no-repeat',
    );
  });

  it('reveals the library after scripts load without waiting for every capability', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      'void consume(repository.list(), applyScripts).finally(() =>',
    );
    expect(source).not.toContain('void Promise.allSettled([');
  });

  it('uses the shared modal frame before the library workspace is ready', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );
    const css = readFileSync(
      new URL('./global-library.css', import.meta.url),
      'utf8',
    );

    expect(source).toContain('if (loading)');
    expect(source).toContain('className="global-library-loading-dialog"');
    expect(source.indexOf('if (loading)')).toBeLessThan(
      source.indexOf('<UiWorkspace'),
    );
    expect(css).toContain('.global-library-loading-dialog .app-ui-loader');
    expect(css).not.toContain('.global-library-frame__body > .app-ui-loader');
  });

  it('resets scroll after each cached close', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('GLOBAL_LIBRARY_CLOSED_EVENT');
    expect(source).toContain('ref={collectionRef}');
    expect(source).toContain('ref={detailRef}');
    expect(source).toContain('element.scrollTop = 0');
    expect(source).toContain('element.scrollLeft = 0');
    expect(source).toContain("'.userscript-source-panel__source'");
  });

  it('uses the shared dark textured workspace without a light override', () => {
    const css = readFileSync(
      new URL('./global-library.css', import.meta.url),
      'utf8',
    );

    expect(css).not.toContain('.global-library-overlay:not(.is-dark)');
    expect(css).toContain('color-scheme: dark');
  });

  it('uses shared buttons for userscript and system card management', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );
    const css = readFileSync(
      new URL('./global-library.css', import.meta.url),
      'utf8',
    );

    expect(source).toContain('function DeckVisibilityButton');
    expect(source).toContain('function CardEnablementButton');
    expect(source).toContain('onOpenCardSettings(selected)');
    expect(source).toContain("(action) => action.kind === 'manage'");
    expect(source).toContain("t('cm_global_library_workbench_text_24')");
    expect(source).toContain("t('cm_global_library_workbench_text_23')");
    expect(source).toContain("t('cm_global_library_workbench_text_22')");
    expect(source).toContain("t('cm_global_library_workbench_text_21')");
    expect(source).toContain('sessionOnly');
    expect(source).not.toContain('global-library-detail__hint');
    expect(source.replace(/\s+/gu, '')).toContain(
      "enabled ? t('cm_global_library_workbench_text_27') : t('cm_global_library_workbench_text_28')".replace(
        /\s+/gu,
        '',
      ),
    );
    expect(source).toContain(
      'className="global-library-detail__actions is-script-actions"',
    );
    expect(source).toContain('onHiddenFromDeckChange={(hidden) =>');
    expect(source).toContain('setCardHiddenInDeck(selected.id, hidden)');
    expect(source).toContain(
      'className="global-library-detail__actions is-paired"',
    );
    expect(source).not.toContain('<UiToggle');
    expect(css).toMatch(
      /\.global-library-detail__actions\.is-paired\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*width:\s*100%;/s,
    );
    expect(css).toMatch(
      /\.global-library-detail__actions\.is-management\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*width:\s*100%;/s,
    );
    expect(css).toMatch(
      /\.global-library-detail__actions\.is-script-actions\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.5fr\)\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s,
    );
    expect(css).toContain(
      '.global-library-detail__actions .app-ui-button[data-action="enable"]',
    );
    expect(css).toContain('overflow-x: hidden');
  });

  it('uses the shared loader while deleting or changing a card', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source.replace(/\s+/gu, '')).toContain(
      "title={removingScript ? t('cm_global_library_workbench_text_113') : t('cm_global_library_workbench_text_114')}".replace(
        /\s+/gu,
        '',
      ),
    );
    expect(source).toContain(
      'className="global-library-remove-dialog__loader"',
    );
    expect(source).toContain(
      "label={t('cm_global_library_workbench_label_83')}",
    );
    expect(source).toContain(
      "label={t('cm_global_library_workbench_label_29')}",
    );
  });

  it('closes only when the global library backdrop itself is pressed', () => {
    const source = readFileSync(
      new URL('../../hosts/extension/library.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('if (event.target === event.currentTarget)');
    expect(source).toContain('requestClose();');
  });

  it('opens safe userscript source links in a new tab', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('userscriptSourcePageUrl(script)');
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain("t('cm_global_library_workbench_title_13')");
  });

  it('keeps Bilibili and YouTube capabilities in one platform suite', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain("t('cm_global_library_workbench_title_89')");
    expect(source).not.toContain("id: 'cross-platform'");
    expect(source).toContain(
      'cards: visibleCards.filter(isBilibiliCapabilityCard)',
    );
    expect(source).toContain("t('cm_global_library_workbench_text_77')");
    expect(source).toContain("t('cm_global_library_workbench_text_79')");
  });

  it('keeps unsupported platform cards in the library but removes their controls', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );
    const css = readFileSync(
      new URL('./global-library.css', import.meta.url),
      'utf8',
    );

    expect(source).toContain('card.snapshot.available');
    expect(source).toContain('card.snapshot.unavailableReason');
    expect(source).toContain("t('cm_global_library_workbench_text_7')");
    expect(source).toContain("t('cm_global_library_workbench_text_8')");
    expect(source).toContain('cardUnavailableLabel(card)');
    expect(source).toContain('unavailableReason={cardUnavailableReason(card)}');
    expect(css).toContain('.global-library-card.is-unavailable');
    expect(css).toContain('.global-library-card__availability-badge');
  });

  it('keeps media resource discovery in the system card group', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      'mediaResources.available ? [mediaResourcesCard(mediaResources)] : []',
    );
    expect(source).toContain('onToggleMediaResources');
    expect(source).toContain("t('cm_global_library_workbench_title_73')");
    expect(source).toContain("t('cm_global_library_workbench_text_76')");
  });

  it('keeps the new-tab system card configurable without enablement or deletion', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('NEW_TAB_CARD');
    expect(source).toContain('systemCardOfferedOnTarget(NEW_TAB_CARD_ID');
    expect(source).toContain('isNewTabCard(card)');
    expect(source).toContain('onOpenNewTabSettings');
    expect(source).toContain("t('cm_global_library_workbench_text_33')");
  });

  it('shows Safari Userscript capability limits in the installed script detail', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('userscriptPlatformCompatibilityDiagnostics');
    expect(source).toContain("t('cm_global_library_workbench_title_84')");
    expect(source).toContain('platformDiagnostics.map');
  });

  it('lists the steward card so it can be restored after hiding', () => {
    const source = readFileSync(
      new URL('./GlobalLibraryWorkbench.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('DECK_STEWARD_CARD');
    expect(source).toContain("t('cm_global_library_workbench_text_22')");
    expect(source).not.toContain('全局 AI 系统卡牌');
    expect(source).toContain('GAMEPAD_CONTROL_CARD_ID');
  });

  it('keeps the library open beneath a selected card settings layer', () => {
    const libraryHost = readFileSync(
      new URL('../../hosts/extension/library.tsx', import.meta.url),
      'utf8',
    );
    const deck = readFileSync(
      new URL('../userscript-deck/UserscriptDeckOverlay.tsx', import.meta.url),
      'utf8',
    );

    expect(libraryHost).toContain('setCardSettingsOpen(true)');
    expect(libraryHost).toContain(
      'enabled: open && !closing && !cardSettingsOpen',
    );
    expect(libraryHost).toContain('CARD_SETTINGS_Z_INDEX');
    const openCardSettingsSource = libraryHost.match(
      /const openCardSettings = useCallback\([\s\S]*?\n {4}\}, \[\]\);/,
    )?.[0];
    expect(openCardSettingsSource).toBeDefined();
    expect(openCardSettingsSource).not.toContain('requestClose()');
    expect(deck).toContain("globalLibraryPresentation !== 'retreated'");
    expect(deck).toContain('GLOBAL_LIBRARY_CARD_SETTINGS_CLOSED_EVENT');
    expect(deck).toContain('is-global-library-card-settings');
  });
});
