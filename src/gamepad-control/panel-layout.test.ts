import { describe, expect, it } from 'vitest';

import { DECK_ENTRY_LAYOUT } from '../features/userscript-deck/deck-entry-layout';
import {
  gamepadPanelLayout,
  gamepadPanelPresentationReady,
} from './panel-layout';

describe('gamepadPanelLayout', () => {
  it('places the fixed-size controller beside the stable deck dock', () => {
    expect(
      gamepadPanelLayout({
        anchor: { x: 900, y: 650 },
        viewport: { width: 1_024, height: 768 },
        speedWheelVisible: true,
      }).placement,
    ).toBe('left');
    expect(
      gamepadPanelLayout({
        anchor: { x: 120, y: 650 },
        viewport: { width: 1_024, height: 768 },
        speedWheelVisible: true,
      }).placement,
    ).toBe('right');
  });

  it('moves closer to the logo when the speed wheel is unavailable', () => {
    const anchor = { x: 120, y: 650 };
    const viewport = { width: 1_024, height: 768 };
    const expanded = gamepadPanelLayout({
      anchor,
      viewport,
      speedWheelVisible: true,
    });
    const compact = gamepadPanelLayout({
      anchor,
      viewport,
      speedWheelVisible: false,
    });

    expect(expanded.x - compact.x).toBe(
      (DECK_ENTRY_LAYOUT.dock.width - DECK_ENTRY_LAYOUT.core.buttonWidth) / 2,
    );
  });

  it('clamps the complete controller inside the viewport', () => {
    expect(
      gamepadPanelLayout({
        anchor: { x: 12, y: 12 },
        viewport: { width: 320, height: 240 },
        speedWheelVisible: true,
      }),
    ).toMatchObject({
      x: 12 + DECK_ENTRY_LAYOUT.dock.width / 2 + 14 + 154 / 2,
      y: 66,
      placement: 'right',
    });
  });
});

describe('gamepadPanelPresentationReady', () => {
  const ready = {
    connected: true,
    pageReady: true,
    deckSettingsReady: true,
    positionReady: true,
    artworkReady: true,
  };

  it('requires every presentation dependency before showing the panel', () => {
    expect(gamepadPanelPresentationReady(ready)).toBe(true);
    for (const key of Object.keys(ready) as Array<keyof typeof ready>) {
      expect(gamepadPanelPresentationReady({ ...ready, [key]: false })).toBe(
        false,
      );
    }
  });
});
