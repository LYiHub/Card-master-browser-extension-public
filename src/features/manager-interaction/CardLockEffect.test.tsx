import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CardLockEffect } from './CardLockEffect';

describe('CardLockEffect', () => {
  const complete = () => undefined;

  it('renders locked and transition states but not the unlocked state', () => {
    expect(
      renderToStaticMarkup(
        <CardLockEffect
          phase="unlocked"
          active={false}
          onTransitionComplete={complete}
        />,
      ),
    ).toBe('');
    expect(
      renderToStaticMarkup(
        <CardLockEffect
          phase="locked"
          active
          onTransitionComplete={complete}
        />,
      ),
    ).toContain('is-locked is-inspecting');
    expect(
      renderToStaticMarkup(
        <CardLockEffect
          phase="locking"
          active={false}
          onTransitionComplete={complete}
        />,
      ),
    ).toContain('data-card-lock-phase="locking"');
    expect(
      renderToStaticMarkup(
        <CardLockEffect
          phase="unlocking"
          active={false}
          onTransitionComplete={complete}
        />,
      ),
    ).toContain('data-card-lock-phase="unlocking"');
  });

  it('uses the complete twelve-frame sprite under one GSAP owner', () => {
    const css = readFileSync(
      new URL('./card-lock-effect.css', import.meta.url),
      'utf8',
    );
    const source = readFileSync(
      new URL('./CardLockEffect.tsx', import.meta.url),
      'utf8',
    );

    expect(css).toContain('background-size: 100% 1200%');
    expect(css).toContain('inset-inline: 0');
    expect(css).toContain('width: 100%');
    expect(css).toContain('aspect-ratio: 303 / 251');
    expect(css).toContain('transform: translateY(-50%)');
    expect(css).not.toContain('left: 52.2%');
    expect(css).not.toContain('width: 136%');
    expect(css).not.toContain('@keyframes manager-card-lock');
    expect(source).toContain("ease: 'steps(11)'");
    expect(source).toContain('gsap.timeline({ repeat: -1 })');
    expect(source).toContain('registerCardLockTransition(card, transition)');
  });

  it('crops horizontal transparency and preserves the full frame height', async () => {
    const asset = fileURLToPath(
      new URL(
        '../../../assets/userscript-deck/visual/cards/card-lock-chain.webp',
        import.meta.url,
      ),
    );
    const metadata = await sharp(asset).metadata();

    expect(metadata.width).toBe(303);
    expect(metadata.height).toBe(251 * 12);
    expect(metadata.hasAlpha).toBe(true);
    expect(statSync(asset).size).toBeLessThan(549_083);
  });

  it('replaces every legacy sleeping seal and gates card video playback', () => {
    const face = readFileSync(
      new URL('./ManagerCardFace.tsx', import.meta.url),
      'utf8',
    );
    const cards = readFileSync(
      new URL('../userscript-deck/styles/cards.css', import.meta.url),
      'utf8',
    );
    const controller = readFileSync(
      new URL('../userscript-deck/useCardActionController.ts', import.meta.url),
      'utf8',
    );

    expect(face).toContain("lockPhase === 'unlocked'");
    expect(face).toContain('onTransitionComplete={completeLockTransition}');
    expect(face).not.toContain('manager-card__sleep-seal');
    expect(cards).not.toContain('.manager-card__face.is-sleeping::after');
    expect(cards).not.toContain('.manager-card__sleep-seal');
    expect(
      controller.match(/await finishToggleAction\(element\)/g),
    ).toHaveLength(7);
  });

  it('keeps toggle transitions above corner actions and returns without a timeout gap', () => {
    const transition = readFileSync(
      new URL('./card-lock-transition.ts', import.meta.url),
      'utf8',
    );
    const controller = readFileSync(
      new URL('../userscript-deck/useCardActionController.ts', import.meta.url),
      'utf8',
    );
    const interactions = readFileSync(
      new URL('../userscript-deck/styles/interactions.css', import.meta.url),
      'utf8',
    );
    const lifecycle = readFileSync(
      new URL('./useManagerCardLifecycleMotion.ts', import.meta.url),
      'utf8',
    );
    const overlay = readFileSync(
      new URL('../userscript-deck/UserscriptDeckOverlay.tsx', import.meta.url),
      'utf8',
    );

    expect(transition).toContain('activeTransitions');
    expect(transition).toContain('registerCardLockTransition');
    expect(transition).not.toContain('MutationObserver');
    expect(transition).not.toContain('setTimeout');
    expect(controller).not.toContain('is-lock-transitioning');
    expect(interactions).toMatch(
      /\.manager-action-layer\s*\{[\s\S]*?z-index: 24/,
    );
    expect(interactions).toMatch(
      /\.mode-resolving[\s\S]*?\.manager-corner-action\s*\{[\s\S]*?animation: none/,
    );
    expect(lifecycle).toContain("previousMode !== 'resolving'");
    expect(overlay).toContain('key: actionSubject.id');
    expect(overlay).not.toMatch(
      /key: `\$\{actionSubject\.id\}:\$\{cardStateKey\(actionSubject\)\}`/,
    );
  });
});
