import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('manager card collection lifecycle', () => {
  it('hides every card at the logo and restores it only for the next deal', () => {
    const source = readFileSync(
      new URL('./useManagerCardLifecycleMotion.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("clearProps: 'opacity,visibility'");
    expect(
      source.match(/gsap\.set\(root, \{ autoAlpha: 0 \}\);/gu),
    ).toHaveLength(2);
  });

  it('removes card shadows while the deck is collecting', () => {
    const interaction = readFileSync(
      new URL('./ManagerCardInteraction.tsx', import.meta.url),
      'utf8',
    );
    const styles = readFileSync(
      new URL('../userscript-deck/styles/cards.css', import.meta.url),
      'utf8',
    );

    expect(interaction).toContain(
      "mode === 'collecting' ? ' is-collecting' : ''",
    );
    expect(styles).toMatch(
      /\.manager-card\.is-collecting[\s\S]*?box-shadow:\s*none;/u,
    );
  });

  it('uses the July deal path, settle bounce, and flip', () => {
    const source = readFileSync(
      new URL('./useManagerCardLifecycleMotion.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("ease: 'power1.inOut'");
    expect(source).toMatch(/back\.out\(\$\{bottomLaunch \? 1\.48 : 1\.36\}\)/);
    expect(source).toMatch(
      /rotationY:\s*0,\s*duration:\s*0\.5,\s*ease:\s*'back\.out\(1\.2\)'/,
    );
    expect(source).toContain(
      "{ rotationY: 180, duration: 0.42, ease: 'power3.inOut' }, 0",
    );
    expect(source).toContain("!root.classList.contains('is-import-revealing')");
  });
});
