import type { ManagerMode } from '../manager-interaction/state';

import { DECK_ENTRY_LAYOUT } from './deck-entry-layout';

export const DECK_ENTRY_DOCK_WIDTH = DECK_ENTRY_LAYOUT.dock.width;
export const DECK_ENTRY_DOCK_HEIGHT = DECK_ENTRY_LAYOUT.dock.height;

export type DeckEntryCoreState =
  | 'hidden'
  | 'closed'
  | 'transition'
  | 'suppressed'
  | 'receiving';

export type DeckEntryAccessoryState =
  | 'none'
  | 'speed'
  | 'resources'
  | 'speed-resources';

export type DeckEntryPresentation = {
  coreState: DeckEntryCoreState;
  accessoryState: DeckEntryAccessoryState;
  coreVisible: boolean;
  canActivate: boolean;
  canDrag: boolean;
  resourcesVisible: boolean;
  resourcePlacement: 'top' | null;
};

function coreState({
  mode,
  ready,
  hidden,
  receiving,
}: Pick<
  DeckEntryPresentationInput,
  'mode' | 'ready' | 'hidden' | 'receiving'
>): DeckEntryCoreState {
  if (hidden) return 'hidden';
  if (receiving) return 'receiving';
  if (!ready) return 'hidden';
  if (mode === 'closed') return 'closed';
  if (mode === 'spread' || mode === 'reordering') return 'suppressed';
  if (mode === 'dealing' || mode === 'collecting') return 'transition';
  return 'suppressed';
}

export type DeckEntryPresentationInput = {
  mode: ManagerMode;
  ready: boolean;
  hidden: boolean;
  receiving: boolean;
  radialVisible: boolean;
  mediaResourcesAvailable: boolean;
};

export function deckEntryPresentation({
  mode,
  ready,
  hidden,
  receiving,
  radialVisible,
  mediaResourcesAvailable,
}: DeckEntryPresentationInput): DeckEntryPresentation {
  const nextCoreState = coreState({ mode, ready, hidden, receiving });
  const resourcesVisible =
    ready && mode === 'closed' && !receiving && mediaResourcesAvailable;
  const speedVisible =
    ready && radialVisible && mode === 'closed' && !receiving;
  const accessoryState =
    speedVisible && resourcesVisible
      ? 'speed-resources'
      : speedVisible
        ? 'speed'
        : resourcesVisible
          ? 'resources'
          : 'none';
  const coreVisible = nextCoreState !== 'hidden';

  return {
    coreState: nextCoreState,
    accessoryState,
    coreVisible,
    canActivate: nextCoreState === 'closed',
    canDrag: nextCoreState === 'closed',
    resourcesVisible,
    resourcePlacement: resourcesVisible ? 'top' : null,
  };
}
