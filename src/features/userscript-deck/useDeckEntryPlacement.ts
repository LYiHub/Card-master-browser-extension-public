import { useCallback, useEffect, useState } from 'react';

import type { DeckEntryController, DeckEntryPosition } from './deck-entry';

export function useDeckEntryPlacement(
  controller: Pick<
    DeckEntryController,
    'readSettings' | 'updateSettings' | 'subscribeSettings'
  >,
) {
  const [position, setPosition] = useState<DeckEntryPosition | null>(null);

  useEffect(() => {
    let active = true;
    void controller.readSettings().then(
      (settings) => {
        if (active) setPosition(settings.position);
      },
      () => undefined,
    );
    const stop = controller.subscribeSettings((settings) => {
      setPosition(settings.position);
    });
    return () => {
      active = false;
      stop();
    };
  }, [controller]);

  const preview = useCallback((next: DeckEntryPosition) => {
    setPosition(next);
  }, []);

  const commit = useCallback(
    (next: DeckEntryPosition) => {
      setPosition(next);
      void controller.updateSettings({ kind: 'set-position', position: next });
    },
    [controller],
  );

  return { position, preview, commit };
}
