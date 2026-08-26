import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { AudioDirector } from '../../audio/AudioDirector';
import type { AudioCue } from '../../audio/cues';
import type { ManagerEvent, ManagerMode } from '../manager-interaction/state';
import type { UserscriptDetailMode } from './detail-mode';

export const CARD_SPREAD_INTERACTION_CUES = [
  'deckHover',
  'deckOpen',
  'deckClose',
  'cardDeal',
  'cardCollect',
  'cardFlip',
] as const satisfies readonly AudioCue[];

export type DeckCollectionReason =
  | 'trigger-click'
  | 'input-cancel'
  | 'dismiss-layer'
  | 'unspecified';

export function deckMotionCardCount(
  mode: ManagerMode,
  visibleCardCount: number,
  collectionCardCount: number | null,
) {
  return mode === 'collecting' && collectionCardCount !== null
    ? collectionCardCount
    : visibleCardCount;
}

export function useDeckLifecycleController({
  audio,
  mode,
  cardCount,
  libraryReady,
  deckTriggerElement,
  hasInteractionOwner,
  dispatchManager,
  setFocusedIndex,
}: {
  audio: Pick<AudioDirector, 'play' | 'prepare'>;
  mode: ManagerMode;
  cardCount: number;
  libraryReady: boolean;
  deckTriggerElement: HTMLElement | null;
  hasInteractionOwner: () => boolean;
  dispatchManager: Dispatch<ManagerEvent<UserscriptDetailMode>>;
  setFocusedIndex: Dispatch<SetStateAction<number | null>>;
}) {
  const [dealCycle, setDealCycle] = useState(0);
  const [dealActive, setDealActive] = useState(false);
  const [collectCycle, setCollectCycle] = useState(0);
  const [collectionCardCount, setCollectionCardCount] = useState<number | null>(
    null,
  );
  const [arrivingId, setArrivingId] = useState<string | null>(null);
  const dealActiveRef = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (!libraryReady) return;
    void audio.prepare(CARD_SPREAD_INTERACTION_CUES);
  }, [audio, libraryReady]);

  const updateDealActive = useCallback((active: boolean) => {
    dealActiveRef.current = active;
    setDealActive(active);
  }, []);

  const deckPosition = useCallback(() => {
    const bounds = deckTriggerElement?.getBoundingClientRect();
    return bounds ? bounds.left + bounds.width / 2 : window.innerWidth;
  }, [deckTriggerElement]);

  const dealCardSpread = useCallback(() => {
    if (
      modeRef.current !== 'closed' ||
      dealActiveRef.current ||
      !libraryReady
    ) {
      return;
    }
    modeRef.current = 'dealing';
    updateDealActive(true);
    void audio.prepare(CARD_SPREAD_INTERACTION_CUES);
    audio.play('deckOpen', { positionX: deckPosition() });
    setFocusedIndex(null);
    setDealCycle((cycle) => cycle + 1);
    dispatchManager({ type: 'deal' });
  }, [
    audio,
    deckPosition,
    dispatchManager,
    libraryReady,
    setFocusedIndex,
    updateDealActive,
  ]);

  const beginCollection = useCallback(() => {
    if (
      modeRef.current !== 'dealing' &&
      modeRef.current !== 'spread' &&
      modeRef.current !== 'reordering' &&
      modeRef.current !== 'dragging' &&
      modeRef.current !== 'targeting' &&
      modeRef.current !== 'element-targeting' &&
      modeRef.current !== 'resolving'
    ) {
      return;
    }
    modeRef.current = 'collecting';
    setCollectionCardCount(cardCount);
    updateDealActive(false);
    audio.play('deckClose', { positionX: deckPosition() });
    setFocusedIndex(null);
    setCollectCycle((cycle) => cycle + 1);
    dispatchManager({ type: 'collect' });
  }, [
    audio,
    cardCount,
    deckPosition,
    dispatchManager,
    setFocusedIndex,
    updateDealActive,
  ]);

  const collectCardSpread = useCallback(
    (_reason: DeckCollectionReason = 'unspecified') => {
      if (hasInteractionOwner()) return;
      const currentMode = modeRef.current;
      if (
        currentMode !== 'dealing' &&
        currentMode !== 'spread' &&
        currentMode !== 'reordering' &&
        currentMode !== 'dragging'
      ) {
        return;
      }
      beginCollection();
    },
    [beginCollection, hasInteractionOwner],
  );

  const collectCardSpreadAfterAction = useCallback(() => {
    if (
      mode === 'targeting' ||
      mode === 'dragging' ||
      mode === 'element-targeting' ||
      mode === 'resolving'
    ) {
      beginCollection();
      return;
    }
    collectCardSpread();
  }, [beginCollection, collectCardSpread, mode]);

  const handleDealReady = useCallback(() => {
    if (!dealActiveRef.current) return;
    if (modeRef.current === 'dealing') {
      dispatchManager({ type: 'showSpread' });
    }
  }, [dispatchManager]);

  const handleDealComplete = useCallback(() => {
    updateDealActive(false);
  }, [updateDealActive]);

  const handleCollectAll = useCallback(() => {
    modeRef.current = 'closed';
    updateDealActive(false);
    setCollectionCardCount(null);
    setFocusedIndex(null);
    dispatchManager({ type: 'close' });
  }, [dispatchManager, setFocusedIndex, updateDealActive]);

  const completeArrival = useCallback(
    (id: string) => {
      setArrivingId((current) => (current === id ? null : current));
      setFocusedIndex(null);
      dispatchManager({ type: 'showSpread' });
    },
    [dispatchManager, setFocusedIndex],
  );

  const handleInstallComplete = useCallback(
    (installedId: string, shouldAnimateArrival: boolean) => {
      setFocusedIndex(null);
      audio.play(shouldAnimateArrival ? 'forgeStart' : 'panelClose', {
        positionX: window.innerWidth / 2,
      });
      if (shouldAnimateArrival) {
        setArrivingId(installedId);
        dispatchManager({ type: 'forge', cardId: installedId });
        return;
      }
      dispatchManager({ type: 'showSpread' });
    },
    [audio, dispatchManager, setFocusedIndex],
  );

  return {
    arrivingId,
    collectionCardCount,
    collectCycle,
    dealActive,
    dealCycle,
    setCollectCycle,
    dealCardSpread,
    collectCardSpread,
    collectCardSpreadAfterAction,
    handleDealReady,
    handleDealComplete,
    handleCollectAll,
    completeArrival,
    handleInstallComplete,
  };
}
