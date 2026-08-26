import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  buildCardMediaAccentCatalog,
  CARD_MEDIA_ACCENT_OUTPUT,
} from './card-media-accents.mjs';

describe('card media accent catalog', () => {
  it('matches every current bundled card poster', async () => {
    const generated = await buildCardMediaAccentCatalog();
    const current = await readFile(CARD_MEDIA_ACCENT_OUTPUT, 'utf8');

    expect(current).toBe(generated.source);
    expect(Object.keys(generated.accents)).toHaveLength(20);
    expect(
      Object.values(generated.accents).every((accent) =>
        /^#[\da-f]{6}$/.test(accent),
      ),
    ).toBe(true);
  });
});
