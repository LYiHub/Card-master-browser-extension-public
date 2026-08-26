import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DECK_ENTRY_LAYOUT, resolveDeckEntryInsets } from './deck-entry-layout';

describe('deck entry layout', () => {
  const stageCss = readFileSync(
    new URL('./styles/stage.css', import.meta.url),
    'utf8',
  );
  const motionCss = readFileSync(
    new URL('./styles/motion.css', import.meta.url),
    'utf8',
  );

  it('keeps the Card Master core visually dominant without resizing accessories', () => {
    expect(DECK_ENTRY_LAYOUT.core.logoSize).toBeGreaterThan(
      DECK_ENTRY_LAYOUT.resources.size,
    );
    expect(DECK_ENTRY_LAYOUT.resources.size).toBe(42);
    expect(DECK_ENTRY_LAYOUT.speed.optionWidth).toBe(47);
  });

  it('uses the speed wheel slot for a standalone resource shortcut', () => {
    expect(DECK_ENTRY_LAYOUT.resources.standaloneOffset).toBe(
      DECK_ENTRY_LAYOUT.speed.radius,
    );
  });

  it('keeps the resource shortcut clear of the crowded speed wheel', () => {
    const speedOuterEdge =
      DECK_ENTRY_LAYOUT.speed.crowdedRadius +
      DECK_ENTRY_LAYOUT.speed.crowdedOptionHeight / 2;
    const resourceInnerEdge =
      DECK_ENTRY_LAYOUT.resources.combinedOffset -
      DECK_ENTRY_LAYOUT.resources.size / 2;

    expect(resourceInnerEdge - speedOuterEdge).toBeGreaterThanOrEqual(10);
  });

  it('keeps both accessory gaps compact without overlap', () => {
    const logoToSpeedGap =
      DECK_ENTRY_LAYOUT.speed.radius -
      DECK_ENTRY_LAYOUT.speed.optionHeight / 2 -
      DECK_ENTRY_LAYOUT.core.logoSize / 2;
    const speedToResourcesGap =
      DECK_ENTRY_LAYOUT.resources.combinedOffset -
      DECK_ENTRY_LAYOUT.resources.size / 2 -
      (DECK_ENTRY_LAYOUT.speed.radius +
        DECK_ENTRY_LAYOUT.speed.optionHeight / 2);

    expect(logoToSpeedGap).toBeGreaterThanOrEqual(10);
    expect(speedToResourcesGap).toBeGreaterThanOrEqual(10);
    expect(logoToSpeedGap).toBeLessThanOrEqual(22);
    expect(speedToResourcesGap).toBeLessThanOrEqual(22);
  });

  it('sizes the dock and drag bounds to the unexpanded wheel only', () => {
    const wheelHalfWidth = Math.ceil(
      Math.max(
        DECK_ENTRY_LAYOUT.core.buttonWidth / 2,
        DECK_ENTRY_LAYOUT.speed.radius +
          DECK_ENTRY_LAYOUT.speed.optionWidth / 2,
        DECK_ENTRY_LAYOUT.speed.crowdedRadius +
          DECK_ENTRY_LAYOUT.speed.crowdedOptionWidth / 2,
      ),
    );
    const wheelHalfHeight = Math.ceil(
      Math.max(
        DECK_ENTRY_LAYOUT.core.buttonHeight / 2,
        DECK_ENTRY_LAYOUT.speed.radius +
          DECK_ENTRY_LAYOUT.speed.optionHeight / 2,
        DECK_ENTRY_LAYOUT.speed.crowdedRadius +
          DECK_ENTRY_LAYOUT.speed.crowdedOptionHeight / 2,
      ),
    );

    expect(DECK_ENTRY_LAYOUT.dock.width).toBe(wheelHalfWidth * 2);
    expect(DECK_ENTRY_LAYOUT.dock.height).toBe(wheelHalfHeight * 2);
    expect(DECK_ENTRY_LAYOUT.drag.insets).toEqual({
      left: wheelHalfWidth,
      right: wheelHalfWidth,
      top: wheelHalfHeight,
      bottom: wheelHalfHeight,
    });
    expect(DECK_ENTRY_LAYOUT.resources.combinedTopInset).toBe(
      DECK_ENTRY_LAYOUT.resources.combinedOffset +
        DECK_ENTRY_LAYOUT.resources.size / 2,
    );
    expect(resolveDeckEntryInsets(false)).toEqual(
      DECK_ENTRY_LAYOUT.drag.insets,
    );
    expect(resolveDeckEntryInsets(true)).toEqual({
      ...DECK_ENTRY_LAYOUT.drag.insets,
      top: DECK_ENTRY_LAYOUT.resources.combinedTopInset,
    });
    expect(stageCss).toMatch(
      /\.manager-deck-entry-cluster\s*\{[^}]*\boverflow:\s*visible;/su,
    );
  });

  it('keeps the Card Master logo as the fixed accessory anchor', () => {
    expect(stageCss).toMatch(/\.manager-deck-trigger\s*\{[^}]*\btop:\s*50%;/su);
    expect(stageCss).toMatch(
      /\.manager-media-resources-trigger\s*\{[^}]*\btop:\s*50%;/su,
    );
    expect(stageCss).not.toContain('--manager-deck-entry-content-shift-y');
  });

  it('centers the speed wheel on the Logo and keeps narrow layouts proportional', () => {
    expect(stageCss).toMatch(
      /\.manager-media-speed-radial\s*\{[^}]*\binset:\s*0;/su,
    );
    expect(motionCss).not.toMatch(
      /@media\s*\(max-width:\s*680px\)[\s\S]*?\.manager-deck-trigger\s*\{[^}]*\bscale:/u,
    );
  });

  it('places the page resource badge at the toolbar badge corner', () => {
    expect(stageCss).toMatch(
      /\.manager-media-resources-trigger__badge\s*\{[^}]*\bbottom:\s*-3px;/su,
    );
    expect(stageCss).toMatch(
      /\.manager-entry-count-badge\s*\{[^}]*\bwidth:\s*auto;[^}]*\bmin-width:\s*18px;[^}]*\bpadding:\s*0 4px;/su,
    );
    expect(stageCss).toContain('font-size: 11px;');
    expect(stageCss).toContain('font-size: 10px;');
    expect(stageCss).toContain('font-weight: 900;');
    expect(stageCss).toContain('font-variant-numeric: proportional-nums;');
    expect(stageCss).toContain('letter-spacing: 0;');
    expect(stageCss).toContain('background: #edc760;');
    expect(stageCss).toContain('border-radius: 999px;');
  });

  it('keeps the resource shortcut above the logo without a connector line', () => {
    expect(stageCss).toContain(
      '.manager-deck-entry-cluster[data-media-resources-placement="top"]',
    );
    expect(stageCss).not.toContain(
      '.manager-deck-entry-cluster[data-media-resources-placement="bottom"]',
    );
    expect(stageCss).not.toContain('.manager-media-resources-trigger::before');
    expect(stageCss).toMatch(
      /\.manager-deck-entry-cluster\.has-custom-position\s*\{[^}]*var\(--manager-deck-entry-top-inset\)[^}]*var\(--manager-deck-entry-bottom-inset\)[^}]*var\(--manager-deck-entry-left-inset\)[^}]*var\(--manager-deck-entry-right-inset\)/su,
    );
  });

  it('aligns the badge edges with the 56px logo image edges', () => {
    expect(stageCss).toContain('.manager-deck-trigger__logo-anchor');
    expect(stageCss).toMatch(
      /\.manager-deck-trigger__badge\s*\{[^}]*\bright:\s*0;[^}]*\bbottom:\s*0;/su,
    );
  });

  it('uses one mounted timeline for every logo entrance and exit', () => {
    expect(stageCss).toMatch(
      /\.manager-deck-trigger\s*\{[^}]*\bopacity:\s*1;[^}]*\bscale:\s*1;[^}]*\btranslate:\s*-50%\s+-50%;[^}]*\bvisibility:\s*visible;[^}]*\bopacity\s+360ms[^}]*\bscale\s+440ms[^}]*\btranslate\s+440ms[^}]*\bvisibility\s+0s/su,
    );
    expect(stageCss).toMatch(
      /\.manager-deck-trigger:is\(\.is-hidden,\s*\.is-suppressed\)\s*\{[^}]*\bopacity:\s*0;[^}]*\bscale:\s*0\.86;[^}]*\btranslate:\s*-50%\s+calc\(-50%\s*\+\s*18px\);[^}]*\bvisibility:\s*hidden;[^}]*\btransition-delay:[^}]*440ms;/su,
    );
    expect(stageCss).toMatch(
      /\.manager-deck-trigger\.is-transitioning\s*\{[^}]*\bscale:\s*1\.025;[^}]*\btranslate:\s*-50%\s+calc\(-50%\s*-\s*3px\);/su,
    );
    expect(stageCss).toMatch(
      /\.manager-deck-trigger\.is-import-receiving\s*\{[^}]*\bscale:\s*1\.04;[^}]*\btranslate:\s*-50%\s+calc\(-50%\s*-\s*4px\);/su,
    );
    expect(stageCss).toMatch(
      /\.userscript-deck:is\(\s*\.mode-dealing,\s*\.mode-collecting,\s*\.is-library-import-celebration,\s*\.is-card-creation-preview\s*\)\s*\.manager-deck-entry-cluster\s*\{[^}]*\bz-index:\s*540;/su,
    );
  });

  it('does not ship the temporary entry layout guides', () => {
    expect(stageCss).not.toContain('.manager-deck-entry-cluster__layout-guide');
    expect(stageCss).not.toContain('.manager-deck-trigger__launch-point');
    expect(stageCss).not.toContain('.manager-deck-trigger__card-footprint');
  });
});
