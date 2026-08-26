import { describe, expect, it } from 'vitest';

import { deckLaunchSourceReady } from './deck-launch-readiness';

function launchElement({
  connected = true,
  anchor = false,
  width = 56,
  height = 56,
  logo,
}: {
  connected?: boolean;
  anchor?: boolean;
  width?: number;
  height?: number;
  logo?: HTMLElement | null;
}) {
  return {
    isConnected: connected,
    classList: {
      contains: (className: string) =>
        anchor && className === 'manager-deck-launch-anchor',
    },
    getBoundingClientRect: () => ({
      left: 100,
      top: 200,
      width,
      height,
    }),
    querySelector: () => logo ?? null,
  } as unknown as HTMLElement;
}

describe('deck launch readiness', () => {
  it('waits for a connected Logo with usable dimensions', () => {
    const logo = launchElement({});
    expect(deckLaunchSourceReady(launchElement({ logo }))).toBe(true);
    expect(
      deckLaunchSourceReady(
        launchElement({ logo: launchElement({ connected: false }) }),
      ),
    ).toBe(false);
    expect(
      deckLaunchSourceReady(
        launchElement({ logo: launchElement({ width: 0 }) }),
      ),
    ).toBe(false);
  });

  it('accepts the hidden-trigger launch anchor after it has layout', () => {
    expect(deckLaunchSourceReady(launchElement({ anchor: true }))).toBe(true);
    expect(
      deckLaunchSourceReady(launchElement({ anchor: true, height: 0 })),
    ).toBe(false);
  });

  it('rejects a missing or detached launch source', () => {
    expect(deckLaunchSourceReady(null)).toBe(false);
    expect(deckLaunchSourceReady(launchElement({ connected: false }))).toBe(
      false,
    );
  });
});
