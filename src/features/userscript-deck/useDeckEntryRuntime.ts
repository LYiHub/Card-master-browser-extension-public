import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { deckLaunchSourceReady } from '../manager-interaction/deck-launch-readiness';
import {
  DEFAULT_DECK_ENTRY_SETTINGS,
  type DeckEntryPosition,
  type DeckEntrySettings,
  type DeckEntrySettingsMutation,
} from './deck-entry';
import type { UserscriptDeckHost } from './host';

export function useDeckEntryRuntime({
  host,
  libraryReady,
  setInteractionError,
}: {
  host: UserscriptDeckHost;
  libraryReady: boolean;
  setInteractionError: Dispatch<SetStateAction<string | null>>;
}) {
  const [deckTriggerElement, setDeckTriggerElement] =
    useState<HTMLElement | null>(null);
  const [deckLaunchReady, setDeckLaunchReady] = useState(false);
  const [deckEntrySettings, setDeckEntrySettings] =
    useState<DeckEntrySettings | null>(null);
  const deckPositionFrameRef = useRef<number | null>(null);
  const pendingDeckPositionRef = useRef<DeckEntryPosition | null>(null);
  const readyNotifiedRef = useRef(false);
  const resolvedDeckEntrySettings =
    deckEntrySettings ?? DEFAULT_DECK_ENTRY_SETTINGS;

  useLayoutEffect(() => {
    setDeckLaunchReady(false);
    if (!libraryReady || !deckEntrySettings || !deckTriggerElement) return;
    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    const verifyLaunchSource = () => {
      if (cancelled) return;
      attempts += 1;
      if (deckLaunchSourceReady(deckTriggerElement)) {
        setDeckLaunchReady(true);
        return;
      }
      if (attempts < 4) frame = requestAnimationFrame(verifyLaunchSource);
    };
    frame = requestAnimationFrame(verifyLaunchSource);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [deckEntrySettings, deckTriggerElement, libraryReady]);

  useEffect(() => {
    let active = true;
    let receivedChange = false;
    const stop = host.deckEntry.subscribeSettings((settings) => {
      receivedChange = true;
      if (active) setDeckEntrySettings(settings);
    });
    void host.deckEntry.readSettings().then(
      (settings) => {
        if (active && !receivedChange) setDeckEntrySettings(settings);
      },
      (failure) => {
        if (!active) return;
        host.reportError?.(
          'userscript-deck',
          'deck-entry-settings-read-failed',
          failure,
        );
        setInteractionError(
          failure instanceof Error ? failure.message : String(failure),
        );
        setDeckEntrySettings(DEFAULT_DECK_ENTRY_SETTINGS);
      },
    );
    return () => {
      active = false;
      stop();
    };
  }, [host.deckEntry, host.reportError, setInteractionError]);

  useEffect(() => {
    if (!libraryReady || !deckEntrySettings || !deckLaunchReady) return;
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    host.onReady?.();
  }, [deckEntrySettings, deckLaunchReady, host.onReady, libraryReady]);

  const updateDeckEntrySettings = useCallback(
    async (mutation: DeckEntrySettingsMutation) => {
      try {
        const settings = await host.deckEntry.updateSettings(mutation);
        setDeckEntrySettings(settings);
        setInteractionError(null);
      } catch (failure) {
        host.reportError?.(
          'userscript-deck',
          'deck-entry-settings-update-failed',
          failure,
        );
        setInteractionError(
          failure instanceof Error ? failure.message : String(failure),
        );
      }
    },
    [host.deckEntry, host.reportError, setInteractionError],
  );

  const previewDeckEntryPosition = useCallback(
    (position: DeckEntryPosition) => {
      pendingDeckPositionRef.current = position;
      if (deckPositionFrameRef.current !== null) return;
      deckPositionFrameRef.current = requestAnimationFrame(() => {
        deckPositionFrameRef.current = null;
        const pending = pendingDeckPositionRef.current;
        if (!pending) return;
        setDeckEntrySettings((current) =>
          current ? { ...current, position: pending } : current,
        );
      });
    },
    [],
  );

  const commitDeckEntryPosition = useCallback(
    (position: DeckEntryPosition) => {
      if (deckPositionFrameRef.current !== null) {
        cancelAnimationFrame(deckPositionFrameRef.current);
        deckPositionFrameRef.current = null;
      }
      pendingDeckPositionRef.current = position;
      setDeckEntrySettings((current) =>
        current ? { ...current, position } : current,
      );
      return updateDeckEntrySettings({
        kind: 'set-position',
        position,
      });
    },
    [updateDeckEntrySettings],
  );

  useEffect(
    () => () => {
      if (deckPositionFrameRef.current !== null) {
        cancelAnimationFrame(deckPositionFrameRef.current);
      }
    },
    [],
  );

  return {
    deckTriggerElement,
    setDeckTriggerElement,
    deckLaunchReady,
    deckEntrySettings,
    resolvedDeckEntrySettings,
    updateDeckEntrySettings,
    previewDeckEntryPosition,
    commitDeckEntryPosition,
  };
}
