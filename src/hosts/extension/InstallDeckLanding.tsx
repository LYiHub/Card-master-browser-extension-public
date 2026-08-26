import type { CSSProperties, RefObject } from 'react';

import type { DeckEntryController } from '../../features/userscript-deck/deck-entry';
import { DECK_ENTRY_LAYOUT } from '../../features/userscript-deck/deck-entry-layout';
import { useDeckEntryPlacement } from '../../features/userscript-deck/useDeckEntryPlacement';

export function InstallDeckLanding({
  landingRef,
  controller,
}: {
  landingRef: RefObject<HTMLDivElement>;
  controller: Pick<
    DeckEntryController,
    'readSettings' | 'updateSettings' | 'subscribeSettings'
  >;
}) {
  const { position } = useDeckEntryPlacement(controller);
  return (
    <div
      ref={landingRef}
      className={`install-deck-landing${position ? ' has-custom-position' : ''}`}
      style={
        {
          '--install-deck-entry-width': `${DECK_ENTRY_LAYOUT.core.buttonWidth}px`,
          '--install-deck-entry-height': `${DECK_ENTRY_LAYOUT.core.buttonHeight}px`,
          '--install-deck-entry-logo-size': `${DECK_ENTRY_LAYOUT.core.logoSize}px`,
          '--install-deck-entry-anchor-x': `${DECK_ENTRY_LAYOUT.dock.defaultCenterOffset}px`,
          '--install-deck-entry-anchor-y': `${DECK_ENTRY_LAYOUT.dock.defaultCenterOffset}px`,
          '--install-deck-entry-left-inset': `${DECK_ENTRY_LAYOUT.drag.insets.left}px`,
          '--install-deck-entry-right-inset': `${DECK_ENTRY_LAYOUT.drag.insets.right}px`,
          '--install-deck-entry-top-inset': `${DECK_ENTRY_LAYOUT.drag.insets.top}px`,
          '--install-deck-entry-bottom-inset': `${DECK_ENTRY_LAYOUT.drag.insets.bottom}px`,
          ...(position
            ? {
                '--install-deck-entry-x': `${position.x * 100}%`,
                '--install-deck-entry-y': `${position.y * 100}%`,
              }
            : {}),
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="install-deck-landing__slot" />
    </div>
  );
}
