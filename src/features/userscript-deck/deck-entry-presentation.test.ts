import { describe, expect, it } from 'vitest';

import { deckEntryPresentation } from './deck-entry-presentation';

const base = {
  mode: 'closed',
  ready: true,
  hidden: false,
  receiving: false,
  radialVisible: false,
  mediaResourcesAvailable: false,
} as const;

describe('deck entry presentation', () => {
  it('maps the core manager modes to stable entry states', () => {
    expect(deckEntryPresentation({ ...base, ready: false })).toMatchObject({
      coreState: 'hidden',
      accessoryState: 'none',
      coreVisible: false,
      canActivate: false,
    });
    expect(deckEntryPresentation({ ...base, mode: 'closed' }).coreState).toBe(
      'closed',
    );
    expect(deckEntryPresentation({ ...base, mode: 'spread' }).coreState).toBe(
      'suppressed',
    );
    expect(
      deckEntryPresentation({ ...base, mode: 'reordering' }).coreState,
    ).toBe('suppressed');
    expect(deckEntryPresentation({ ...base, mode: 'dealing' }).coreState).toBe(
      'transition',
    );
    expect(
      deckEntryPresentation({ ...base, mode: 'collecting' }).coreState,
    ).toBe('transition');
    expect(
      deckEntryPresentation({ ...base, mode: 'targeting' }).coreState,
    ).toBe('suppressed');
    expect(
      deckEntryPresentation({ ...base, mode: 'returning' }).coreState,
    ).toBe('suppressed');
    expect(deckEntryPresentation({ ...base, receiving: true }).coreState).toBe(
      'receiving',
    );
  });

  it('keeps independent accessories available when the deck entry is hidden', () => {
    expect(
      deckEntryPresentation({
        ...base,
        hidden: true,
        mode: 'closed',
        mediaResourcesAvailable: true,
      }),
    ).toMatchObject({
      coreState: 'hidden',
      accessoryState: 'resources',
      coreVisible: false,
      resourcesVisible: true,
      resourcePlacement: 'top',
    });
  });

  it('enumerates the four accessory combinations', () => {
    expect(deckEntryPresentation({ ...base }).accessoryState).toBe('none');
    expect(
      deckEntryPresentation({ ...base, radialVisible: true }).accessoryState,
    ).toBe('speed');
    expect(
      deckEntryPresentation({
        ...base,
        mediaResourcesAvailable: true,
      }).accessoryState,
    ).toBe('resources');
    expect(
      deckEntryPresentation({
        ...base,
        radialVisible: true,
        mediaResourcesAvailable: true,
      }).accessoryState,
    ).toBe('speed-resources');
  });

  it('keeps the resource shortcut above the logo at every position', () => {
    expect(
      deckEntryPresentation({
        ...base,
        mediaResourcesAvailable: true,
      }).resourcePlacement,
    ).toBe('top');
    expect(
      deckEntryPresentation({
        ...base,
        radialVisible: true,
        mediaResourcesAvailable: true,
      }).resourcePlacement,
    ).toBe('top');
  });

  it('does not expose active accessories while the deck is open or receiving', () => {
    expect(
      deckEntryPresentation({
        ...base,
        mode: 'spread',
        radialVisible: true,
        mediaResourcesAvailable: true,
      }).accessoryState,
    ).toBe('none');
    expect(
      deckEntryPresentation({
        ...base,
        receiving: true,
        radialVisible: true,
        mediaResourcesAvailable: true,
      }).accessoryState,
    ).toBe('none');
    expect(
      deckEntryPresentation({
        ...base,
        receiving: true,
        radialVisible: false,
        mediaResourcesAvailable: true,
      }).resourcesVisible,
    ).toBe(false);
  });
});
