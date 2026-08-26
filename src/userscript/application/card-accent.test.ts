import { describe, expect, it } from 'vitest';

import { deriveCardAccent, isCardAccent } from './card-accent';

function solid(red: number, green: number, blue: number, alpha = 255) {
  return new Uint8ClampedArray([red, green, blue, alpha]);
}

function channels(color: string) {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16),
  );
}

describe('card accent derivation', () => {
  it('keeps the dominant hue while normalizing visibility', () => {
    const red = channels(deriveCardAccent(solid(120, 10, 18), 1, 1));
    const blue = channels(deriveCardAccent(solid(12, 28, 118), 1, 1));

    expect(red[0]).toBeGreaterThan(red[1]);
    expect(red[0]).toBeGreaterThan(red[2]);
    expect(blue[2]).toBeGreaterThan(blue[0]);
    expect(blue[2]).toBeGreaterThan(blue[1]);
  });

  it('ignores transparent pixels', () => {
    expect(
      deriveCardAccent(
        new Uint8ClampedArray([255, 0, 0, 0, 20, 110, 70, 255]),
        2,
        1,
      ),
    ).toBe(deriveCardAccent(solid(20, 110, 70), 1, 1));
  });

  it('returns a visible neutral accent for monochrome art', () => {
    const accent = deriveCardAccent(solid(80, 80, 80), 1, 1);
    const [red, green, blue] = channels(accent);

    expect(
      Math.max(red, green, blue) - Math.min(red, green, blue),
    ).toBeLessThan(2);
    expect(red).toBeGreaterThan(140);
  });

  it('accepts only concrete six-digit hex accents', () => {
    expect(isCardAccent('#72aabb')).toBe(true);
    expect(isCardAccent('color-mix(in srgb, red 50%, blue)')).toBe(false);
    expect(isCardAccent('#fff')).toBe(false);
  });
});
