import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import {
  libraryImportAudioIndices,
  libraryImportCelebrationItem,
  libraryImportDeckMotion,
  libraryImportDestination,
  libraryImportFanPositions,
} from './LibraryImportCelebration';

const matchingContext = {
  url: 'http://127.0.0.1/article',
  frameId: 0,
  topFrame: true,
};

describe('LibraryImportCelebration', () => {
  it('uses five evenly distributed audio anchors including the middle card', () => {
    expect([...libraryImportAudioIndices(20)]).toEqual([0, 5, 10, 14, 19]);
    expect([...libraryImportAudioIndices(3)]).toEqual([0, 1, 2]);
    expect([...libraryImportAudioIndices(0)]).toEqual([]);
  });

  it('keeps cards near one shallow arc with subtle radial variation', () => {
    const cardWidth = 150;
    const cardHeight = 200;
    const centerX = 720;
    const apexCenterY = 360;
    const fanWidth = 640;
    const positions = libraryImportFanPositions({
      total: 9,
      fanWidth,
      cardWidth,
      cardHeight,
      centerX,
      apexCenterY,
    });
    const centerIndex = (positions.length - 1) / 2;
    const maximumRotation = Math.min(24, centerIndex * 3.4);
    const maximumAngle = (maximumRotation * Math.PI) / 180;
    const radius = fanWidth / (2 * Math.sin(maximumAngle));
    const circleCenterY = apexCenterY + radius;
    const radii: number[] = [];

    positions.forEach((position, index) => {
      const cardCenterX = position.x + cardWidth / 2;
      const cardCenterY = position.y + cardHeight / 2;
      const angle =
        centerIndex === 0
          ? 0
          : ((index - centerIndex) / centerIndex) * maximumAngle;
      const cardRadius = Math.hypot(
        cardCenterX - centerX,
        cardCenterY - circleCenterY,
      );
      const radialAngle = Math.atan2(
        cardCenterX - centerX,
        circleCenterY - cardCenterY,
      );
      radii.push(cardRadius);
      expect(position.rotation).toBeCloseTo((angle * 180) / Math.PI, 8);
      expect(radialAngle).toBeCloseTo(angle, 8);
      expect(Math.abs(cardRadius - radius)).toBeLessThanOrEqual(2.41);
    });
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(1);
  });

  it('routes enabled current-page scripts to the formation', () => {
    expect(
      libraryImportDestination(INITIAL_USERSCRIPTS[0], matchingContext),
    ).toBe('formation');
  });

  it('routes disabled or unmatched scripts to the deck entry', () => {
    expect(
      libraryImportDestination(
        {
          ...INITIAL_USERSCRIPTS[0],
          manager: {
            ...INITIAL_USERSCRIPTS[0].manager,
            enabled: false,
          },
        },
        matchingContext,
      ),
    ).toBe('deck');
    expect(
      libraryImportDestination(INITIAL_USERSCRIPTS[0], {
        ...matchingContext,
        url: 'https://example.com/',
      }),
    ).toBe('deck');
  });

  it('keeps the real imported card presentation', () => {
    const item = libraryImportCelebrationItem(
      INITIAL_USERSCRIPTS[0],
      matchingContext,
    );

    expect(item.id).toBe(INITIAL_USERSCRIPTS[0].id);
    expect(item.card.title).toBe('净域守望');
    expect(item.destination).toBe('formation');
  });

  it('uses a high arc when routing cards to the deck entry', () => {
    const target = { x: 760, y: 620 };
    const deck = libraryImportDeckMotion(420, 260, target, 1);

    expect(deck.path).toHaveLength(4);
    expect(deck.path[0]?.y).toBeLessThan(260);
    expect(deck.path[deck.path.length - 1]).toEqual(target);
  });

  it('keeps the real formation and deck entry visible during routing', () => {
    const css = readFileSync(
      new URL('./styles/cards.css', import.meta.url),
      'utf8',
    );
    const source = readFileSync(
      new URL('./LibraryImportCelebration.tsx', import.meta.url),
      'utf8',
    );

    expect(css).toContain('.manager-library-import-celebration');
    expect(css).toContain('.is-library-import-celebration');
    expect(css).not.toContain('.manager-library-import-celebration__target');
    expect(css).not.toContain('.manager-library-import-celebration__deck');
    expect(source).not.toContain('manager-card-creation-preview__deck');
  });

  it('reveals formation cards in place and only duplicates deck cards', () => {
    const css = readFileSync(
      new URL('./styles/cards.css', import.meta.url),
      'utf8',
    );
    const source = readFileSync(
      new URL('./LibraryImportCelebration.tsx', import.meta.url),
      'utf8',
    );
    const formationSetup = source.slice(
      source.indexOf('const restoreFormationCard'),
      source.indexOf('const deckDestination'),
    );
    const formationTimeline = source.slice(
      source.indexOf('formationEntries.forEach((entry, index)'),
      source.indexOf('const stackAt'),
    );
    const fanTimeline = source.slice(
      source.indexOf('deckEntries.forEach(({ card }, index)'),
      source.indexOf('const turnoverAt'),
    );
    const turnoverTimeline = source.slice(
      source.indexOf('const turnoverAt'),
      source.indexOf('const routingBase'),
    );

    expect(source).toContain(
      "import { gsap } from '../../motion/gsap-motion-path'",
    );
    expect(source).not.toContain('MAX_ANIMATED_IMPORT_CARDS');
    expect(source).not.toContain('.slice(0,');
    expect(source).toContain('libraryImportDeckMotion(');
    expect(source).toContain(
      "root.querySelectorAll<HTMLElement>('.manager-card')",
    );
    expect(source).toContain("card.classList.add('is-import-revealing')");
    expect(source).toContain("card.classList.remove('is-import-revealing')");
    expect(source).toContain(
      'formationEntries.length === 0 && deckEntries.length === 0',
    );
    expect(source).toContain(
      "item.destination === 'deck' && !collectedCardIds.has(item.id)",
    );
    expect(source).not.toContain('formationElements');
    expect(formationSetup).not.toContain('zIndex');
    expect(formationTimeline).not.toContain('zIndex');
    expect(source).toContain('card?.querySelector<HTMLElement>(');
    expect(source).toContain("'.manager-card-glow-effect'");
    expect(source).not.toContain('glowRefs');
    expect(source).not.toContain('glowX');
    expect(source).not.toContain('glowY');
    expect(source).not.toContain('manager-library-import-celebration__glow');
    expect(source).toContain('rotationY: 90');
    expect(source).toContain('addCommandReveal(');
    expect(source).toContain('managerCardDimensions(');
    expect(source).toContain('cardSequenceStagger(');
    expect(source).not.toContain('const CARD_WIDTH');
    expect(source).not.toContain('const CARD_HEIGHT');
    expect(source).toContain('const spreadStart');
    expect(source).toContain('libraryImportFanPositions({');
    expect(fanTimeline).toContain('deckCards.slice(index)');
    expect(fanTimeline).toContain('remainingCards');
    expect(fanTimeline).toContain('deckAudioIndices.has(index)');
    expect(fanTimeline).not.toContain('rotationY');
    expect(turnoverTimeline).toContain('scaleX: 0.08');
    expect(turnoverTimeline).toContain('{ rotationY: 0 }');
    expect(turnoverTimeline).toMatch(
      /20\s*\+\s*deckEntries\.length\s*\+\s*\(deckEntries\.length - 1 - index\)/,
    );
    expect(source).toContain('100 + (deckEntries.length - 1 - index)');
    expect(source).toContain('cardScaleInsideCircle(');
    expect(source).toContain('CARD_COLLECTION_CARD_DIAMETER');
    expect(source).not.toMatch(/\bscale:\s*0[,}]/u);
    expect(source).not.toContain('ENTRANCE_PROFILES');
    expect(source).toContain('onActiveItemChange?.(item)');
    expect(css).not.toContain('.manager-library-import-celebration__glow');
    expect(source).toContain('gsap.set(card, { autoAlpha: 0 })');
    expect(source).toContain('setCollectedCardIds((current)');
    expect(source).toContain('!collectedCardIds.has(item.id)');
    expect(css).toContain('background: transparent');
    expect(css).not.toContain('height: 176px');
    expect(css).toContain('var(--manager-preview-card-width, 150px)');
    expect(css).toMatch(
      /\.manager-library-import-celebration__card[\s\S]*?box-shadow:\s*0 2px 6px rgb\(0 0 0 \/ 0\.12\)/,
    );
    expect(source).toContain("'deckOpen'");
    expect(source).toContain("'deckClose'");
    expect(source).toContain("'cardDeal'");
    expect(source).toContain('paused: true');
    expect(source).toContain('timeline.play(0)');
    expect(source).toMatch(
      /turnoverAt\s*=\s*fanAt\s*\+\s*\(spreadFinishAt - fanAt\)\s*\*\s*\(2 \/ 3\)/,
    );
    expect(source).toMatch(
      /turnoverAt\s*\+\s*\(turnoverFinishAt - turnoverAt\)\s*\*\s*\(2 \/ 3\)/,
    );
    expect(source).toContain('cardTurnoverFinishAt');
    expect(source).toContain("item.card.media.kind === 'video'");
    expect(source).toMatch(
      /imageUrl:\s*item\.card\.media\.posterImageUrl\s*\?\?\s*IMPORT_COVER_FALLBACK_URL/,
    );
    expect(source).toContain('IMPORT_COVER_FALLBACK_URL');
    expect(source).not.toContain('loadMedia={false}');
    expect(css).toMatch(
      /\.manager-library-import-celebration__card \.manager-card__cover\s*\{[^}]*transform:\s*scaleX\(-1\);/s,
    );
    expect(css).toContain('.manager-card.is-import-revealing');
    expect(css).toMatch(/\.manager-card__tilt\s*\{\s*perspective:\s*900px;/s);
  });

  it('prepares presentation before repository commit and suppresses first paint', () => {
    const settingsSource = readFileSync(
      new URL('./SettingsBoard.tsx', import.meta.url),
      'utf8',
    );
    const overlaySource = readFileSync(
      new URL('./UserscriptDeckOverlay.tsx', import.meta.url),
      'utf8',
    );
    const interactionSource = readFileSync(
      new URL(
        '../manager-interaction/ManagerCardInteraction.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    const stageCss = readFileSync(
      new URL('./styles/stage.css', import.meta.url),
      'utf8',
    );
    const prepareIndex = settingsSource.indexOf(
      'onImportPrepare?.(importedScripts)',
    );
    const commitIndex = settingsSource.indexOf(
      'repository.replaceAll(result.scripts)',
    );

    expect(prepareIndex).toBeGreaterThan(-1);
    expect(prepareIndex).toBeLessThan(commitIndex);
    expect(overlaySource).toContain(
      "import { DetailStage } from './DetailStage'",
    );
    expect(overlaySource).toContain('<DetailStage');
    expect(overlaySource).toContain('suppressedCardIds={pendingImportCardIds}');
    expect(overlaySource).toMatch(
      /hidden=\{\s*importPresentationActive\s*\?\s*false\s*:\s*deckTriggerHidden\(deckEntrySettings\)\s*\}/u,
    );
    expect(overlaySource).toContain('receiving={importPresentationActive}');
    expect(interactionSource).toContain('hidden={presentationSuppressed}');
    expect(stageCss).toContain('.is-library-import-celebration,');
    expect(stageCss).toMatch(
      /\.is-card-creation-preview\s*\)\s*\.manager-deck-entry-cluster\s*\{[^}]*z-index:\s*540;/s,
    );
    expect(stageCss).not.toContain('manager-deck-trigger__receiving-stack');
  });

  it('keeps the information plaque behind moving imported cards', () => {
    const overlaySource = readFileSync(
      new URL('./UserscriptDeckOverlay.tsx', import.meta.url),
      'utf8',
    );
    const cardsCss = readFileSync(
      new URL('./styles/cards.css', import.meta.url),
      'utf8',
    );
    const interactionCss = readFileSync(
      new URL('./styles/interactions.css', import.meta.url),
      'utf8',
    );

    expect(overlaySource).toContain('libraryImportContextPrompt(');
    expect(overlaySource).toContain(
      'onActiveItemChange={setActiveImportCelebrationItem}',
    );
    expect(overlaySource).toContain('importPresentation');
    expect(interactionCss).toMatch(
      /\.context-plaque\.is-import-presentation\s*\{[^}]*z-index:\s*520;/s,
    );
    expect(cardsCss).toMatch(
      /\.manager-library-import-celebration\s*\{[^}]*z-index:\s*530;/s,
    );
    expect(interactionCss).not.toContain('manager-import-plaque-rise');
    expect(
      readFileSync(
        new URL('./LibraryImportCelebration.tsx', import.meta.url),
        'utf8',
      ),
    ).toContain("'.context-plaque.is-import-presentation'");
  });
});
