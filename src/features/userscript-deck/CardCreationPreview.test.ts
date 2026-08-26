import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import { cardCreationPreviewCard } from './CardCreationPreview';

describe('card creation preview projection', () => {
  it('accepts preset video presentations', () => {
    expect(cardCreationPreviewCard(INITIAL_USERSCRIPTS[0]).media).toMatchObject(
      {
        kind: 'video',
        videoUrl: expect.stringContaining(
          '/userscript-deck/video/userscript-cards/01.mp4',
        ),
        posterImageUrl: expect.stringContaining(
          '/userscript-deck/card-art/userscript-cards/01.webp',
        ),
      },
    );
  });

  it('accepts custom image presentations', () => {
    const imageUrl = 'data:image/webp;base64,Y292ZXI=';
    expect(
      cardCreationPreviewCard({
        ...INITIAL_USERSCRIPTS[0],
        presentation: {
          accent: '#abcdef',
          media: { kind: 'image', image: imageUrl },
        },
      }),
    ).toMatchObject({
      media: { kind: 'image', imageUrl },
      accent: '#abcdef',
    });
  });

  it('shows the back first, then flips, then collects into the real logo', () => {
    const source = readFileSync(
      new URL('./CardCreationPreview.tsx', import.meta.url),
      'utf8',
    );
    const css = readFileSync(
      new URL('./styles/cards.css', import.meta.url),
      'utf8',
    );
    const appearAt = source.indexOf('scale: 1');
    const flipAt = source.indexOf('rotationY: 90');

    expect(source).toContain('playing');
    expect(source).toContain('preloadFrame');
    expect(source).not.toContain('playing={false}');
    expect(source).not.toContain('videoAudio');
    expect(source).toContain('gsap.set(flipper, { rotationY: 180 })');
    expect(source).toContain('FORGE_AUDIO_DURATION');
    expect(source).toContain(
      'const collect = FORGE_AUDIO_DURATION * (0.82 / 2.16);',
    );
    expect(source).toContain('--card-glow-strength');
    expect(appearAt).toBeGreaterThan(-1);
    expect(flipAt).toBeGreaterThan(appearAt);
    expect(source).not.toContain('addCommandReveal(');
    expect(source).toContain('cardScaleInsideCircle(');
    expect(source).toContain('CARD_COLLECTION_CARD_DIAMETER');
    expect(source).toContain('collectAt + collect');
    expect(source).not.toContain(
      ".to(layer, { opacity: 0, duration: 0.2, ease: 'power1.in' }, 0.84)",
    );
    expect(source).not.toMatch(/\bscale:\s*0[,}]/u);
    expect(source).not.toContain('deckRef');
    expect(source).not.toContain('manager-card-creation-preview__deck');
    expect(css).not.toContain('.manager-card-creation-preview__deck');
  });
});
