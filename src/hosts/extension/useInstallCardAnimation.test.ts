import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('install card animation', () => {
  it('stows the card inside the same circular logo footprint', () => {
    const source = readFileSync(
      new URL('./useInstallCardAnimation.ts', import.meta.url),
      'utf8',
    );
    const installerSource = readFileSync(
      new URL('./install.tsx', import.meta.url),
      'utf8',
    );
    const cardCss = readFileSync(
      new URL('./install-styles/card.css', import.meta.url),
      'utf8',
    );

    expect(source).toContain('cardScaleInsideCircle(');
    expect(source).toContain('CARD_COLLECTION_CARD_DIAMETER');
    expect(source).toContain('FORGE_AUDIO_DURATION');
    expect(source).toContain(
      'const lift = FORGE_AUDIO_DURATION * (0.2 / 1.18);',
    );
    expect(source).toContain('--card-glow-strength');
    expect(source).toContain('const tween = gsap.fromTo(');
    expect(source).toContain(".addLabel('card-stow', '>-0.18')");
    expect(source).toContain('slotDuration');
    expect(source).not.toContain("position: 'fixed'");
    expect(source).toContain('set(motion, { autoAlpha: 0 }, `card-stow+=');
    expect(source).not.toContain('slotBounds.width / cardBounds.width');
    expect(source).not.toContain("motion.style.animation = 'none'");
    expect(source).not.toMatch(/motion,\s*\{\s*opacity:\s*0,/su);
    expect(installerSource).toContain("phase === 'complete' ? (");
    expect(installerSource).toContain(
      '<div className="install-card-stage" aria-hidden="true" />',
    );
    expect(source).toContain('{ maxRotateX: 20, maxRotateY: 18 }');
    expect(cardCss).toContain('animation-play-state: paused');
    expect(cardCss).toContain('--hover-glow');
  });
});
