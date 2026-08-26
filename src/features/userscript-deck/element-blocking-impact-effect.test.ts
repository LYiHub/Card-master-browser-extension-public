import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  contentBlockingVfxExtension,
  ELEMENT_BLOCKING_COMBO_DEFAULT_LAYOUT,
  elementBlockingComboContainsPoint,
  elementBlockingComboIntensity,
  elementBlockingComboShakeTier,
  elementBlockingImpactGeometry,
  elementBlockingRandomVariant,
  nextElementBlockingComboCount,
} from './element-blocking-impact-effect';

function visibleFraction(center: number, size: number, viewportSize: number) {
  const start = Math.max(0, center - size / 2);
  const end = Math.min(viewportSize, center + size / 2);
  return Math.max(0, end - start) / size;
}

describe('element blocking impact geometry', () => {
  it('uses visual area instead of the longest edge for flat elements', () => {
    expect(
      elementBlockingImpactGeometry(
        {
          left: 0,
          top: 0,
          width: 1_000,
          height: 20,
        },
        {
          width: 1_280,
          height: 800,
        },
      ),
    ).toMatchObject({
      kind: 'energy',
      width: 320,
      height: 180,
    });
  });

  it('treats equally sized horizontal and vertical strips consistently', () => {
    const horizontal = elementBlockingImpactGeometry(
      {
        left: 0,
        top: 0,
        width: 1_000,
        height: 20,
      },
      {
        width: 1_280,
        height: 800,
      },
    );
    const vertical = elementBlockingImpactGeometry(
      {
        left: 0,
        top: 0,
        width: 20,
        height: 1_000,
      },
      {
        width: 1_280,
        height: 800,
      },
    );

    expect(vertical.kind).toBe(horizontal.kind);
    expect(vertical.width).toBe(horizontal.width);
  });

  it('uses the larger effect for elements with substantial visual area', () => {
    const geometry = elementBlockingImpactGeometry(
      {
        left: 120,
        top: 80,
        width: 800,
        height: 300,
      },
      {
        width: 1_440,
        height: 900,
      },
    );

    expect(geometry.kind).toBe('sword');
    expect(geometry.width).toBeCloseTo(Math.sqrt(800 * 300) * 1.75);
    expect(geometry.height).toBeCloseTo(geometry.width * (9 / 16));
  });

  it('allows at most one third of the effect to cross a viewport edge', () => {
    const geometry = elementBlockingImpactGeometry(
      {
        left: -80,
        top: 740,
        width: 100,
        height: 40,
      },
      {
        width: 1_280,
        height: 800,
      },
    );

    expect(geometry.centerX).toBeCloseTo(geometry.width / 6);
    expect(geometry.centerY).toBe(760);
    expect(
      visibleFraction(geometry.centerX, geometry.width, 1_280),
    ).toBeCloseTo(2 / 3);
  });

  it('shrinks oversized effects only enough to keep two thirds visible', () => {
    const geometry = elementBlockingImpactGeometry(
      {
        left: 300,
        top: 180,
        width: 1_600,
        height: 900,
      },
      {
        width: 375,
        height: 240,
      },
    );

    expect(geometry.kind).toBe('sword');
    expect(geometry.width).toBeCloseTo(375 * 1.5);
    expect(geometry.height / geometry.width).toBeCloseTo(9 / 16);
    expect(geometry.centerX).toBeCloseTo(375 - geometry.width / 6);
    expect(geometry.centerY).toBeCloseTo(240 - geometry.height / 6);
    expect(visibleFraction(geometry.centerX, geometry.width, 375)).toBeCloseTo(
      2 / 3,
    );
    expect(visibleFraction(geometry.centerY, geometry.height, 240)).toBeCloseTo(
      2 / 3,
    );
  });
});

describe('element blocking random variants', () => {
  it('maps the four random quartiles to both sources and orientations', () => {
    expect(
      [0, 0.25, 0.5, 0.75].map((value) =>
        elementBlockingRandomVariant(() => value),
      ),
    ).toEqual([
      { sourceIndex: 0, mirrored: false },
      { sourceIndex: 1, mirrored: false },
      { sourceIndex: 0, mirrored: true },
      { sourceIndex: 1, mirrored: true },
    ]);
  });
});

describe('element blocking combo', () => {
  it('defines one shared default layout for production and previews', () => {
    expect(ELEMENT_BLOCKING_COMBO_DEFAULT_LAYOUT).toEqual({
      bannerOffsetY: 0,
      countOffsetX: 0,
      countOffsetY: 8,
      glyphOffsetX: 0,
      glyphOffsetY: -16,
      columnGap: 24,
    });
  });

  it('detects the visible banner bounds without intercepting page input', () => {
    const bounds = {
      left: 100,
      top: 60,
      width: 330,
      height: 180,
    };

    const overflow = {
      left: 430,
      top: 80,
      width: 80,
      height: 120,
    };

    expect(elementBlockingComboContainsPoint([bounds, overflow], 100, 60)).toBe(
      true,
    );
    expect(
      elementBlockingComboContainsPoint([bounds, overflow], 500, 190),
    ).toBe(true);
    expect(elementBlockingComboContainsPoint([bounds, overflow], 99, 120)).toBe(
      false,
    );
    expect(
      elementBlockingComboContainsPoint([bounds, overflow], 511, 120),
    ).toBe(false);
  });

  it('continues inside the hit window and resets after it', () => {
    expect(nextElementBlockingComboCount(1, 1_000, 3_200)).toBe(2);
    expect(nextElementBlockingComboCount(4, 1_000, 3_201)).toBe(1);
    expect(
      nextElementBlockingComboCount(0, Number.NEGATIVE_INFINITY, 500),
    ).toBe(1);
  });

  it('caps visible intensity at the fifth hit', () => {
    expect(elementBlockingComboIntensity(1)).toBe(0);
    expect(elementBlockingComboIntensity(2)).toBe(2);
    expect(elementBlockingComboIntensity(3)).toBe(3);
    expect(elementBlockingComboIntensity(4)).toBe(4);
    expect(elementBlockingComboIntensity(5)).toBe(5);
    expect(elementBlockingComboIntensity(20)).toBe(5);
  });

  it('caps screen shake at ten tiers', () => {
    expect(elementBlockingComboShakeTier(1)).toBe(0);
    expect(elementBlockingComboShakeTier(2)).toBe(1);
    expect(elementBlockingComboShakeTier(5)).toBe(4);
    expect(elementBlockingComboShakeTier(11)).toBe(10);
    expect(elementBlockingComboShakeTier(20)).toBe(10);
  });

  it('runs banner motion and disposal on the existing GSAP timeline', () => {
    const source = readFileSync(
      new URL('./element-blocking-impact-effect.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('comboBannerTimeline');
    expect(source).toContain('onComplete: removeBanner');
    expect(source).toContain('onInterrupt: removeBanner');
    expect(source).toContain(
      'top: calc(clamp(64px, 9vh, 104px) + var(--combo-banner-offset-y))',
    );
    expect(source).toContain('top: var(--combo-count-offset-y)');
    expect(source).toContain('top: var(--combo-glyph-offset-y)');
    expect(source).toContain("countSlot.className = 'combo__count-slot'");
    expect(source).toContain("glyphSlot.className = 'combo__glyph-slot'");
    expect(source).not.toContain(
      'translate: var(--combo-count-offset-x) var(--combo-count-offset-y)',
    );
    expect(source).toContain('column-gap: var(--combo-column-gap)');
    expect(source).toContain('updateElementBlockingComboLayout');
    expect(source).toContain('if (hold) timeline.addPause(1.672)');
    expect(source).toContain('transform-origin: 50% 50%');
    expect(source).not.toContain('transform-origin: 50% 68%');
    expect(source).toContain('.combo.is-pointer-obscuring > *');
    expect(source).toContain('opacity: 0.24');
    expect(source).toContain(
      "document.addEventListener('pointermove', handlePointerMove",
    );
    expect(source).toContain(
      "document.removeEventListener('pointermove', handlePointerMove, true)",
    );
    expect(source).not.toContain('translate: 0 -8px');
    expect(source).not.toContain('comboBannerTimeout');
    expect(source).not.toContain('@keyframes combo-banner');
    expect(source).not.toContain('animation: combo-count');
  });
});

describe('content blocking vfx container', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses HEVC movies on Safari and WebM everywhere else', () => {
    vi.stubGlobal('__EXTENSION_TARGET__', 'safari');
    expect(contentBlockingVfxExtension()).toBe('mov');
    vi.stubGlobal('__EXTENSION_TARGET__', 'chromium');
    expect(contentBlockingVfxExtension()).toBe('webm');
    vi.stubGlobal('__EXTENSION_TARGET__', 'firefox');
    expect(contentBlockingVfxExtension()).toBe('webm');
  });
});
