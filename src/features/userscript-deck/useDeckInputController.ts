import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import type { AudioDirector } from '../../audio/AudioDirector';
import { publishGamepadControlOwner } from '../../hosts/extension/gamepad-bridge';
import {
  INPUT_SCOPE_PRIORITY,
  inputCoordinatorFor,
} from '../../input/coordinator';
import { registerEscapeLayer } from '../../input/escape-layer';
import type { IntentEnvelope } from '../../input/intents';
import {
  focusManagerAction,
  nextCircularIndex,
  nextSpatialActionId,
} from '../manager-interaction/manager-input-navigation';
import type { ManagerEvent, ManagerMode } from '../manager-interaction/state';
import { actionsFor, type ManagerAction, preferredActionId } from './actions';
import { type DeckCard, isGamepadControlCard } from './cards';
import type { UserscriptDetailMode } from './detail-mode';

function inputRoot(actionRoot: ParentNode) {
  return actionRoot instanceof Document || actionRoot instanceof ShadowRoot
    ? actionRoot
    : document;
}

export function deckEscapeDisposition(
  mode: ManagerMode,
  pageElementInteraction: boolean,
) {
  if (mode === 'returning') return 'busy';
  if (
    mode === 'targeting' ||
    mode === 'element-targeting' ||
    pageElementInteraction
  ) {
    return 'cancel-targeting';
  }
  if (mode === 'detail') return 'close-detail';
  if (
    mode === 'dealing' ||
    mode === 'spread' ||
    mode === 'reordering' ||
    mode === 'dragging'
  ) {
    return 'collect';
  }
  return null;
}

export function useDeckInputController({
  actionRoot,
  actions,
  actionSlots,
  audio,
  enabled = true,
  mode,
  pageElementInteraction,
  visibleItems,
  focusedIndex,
  setFocusedIndex,
  focusedActionId,
  interactionId,
  hasInteractionOwner,
  claimInteraction,
  activateTargeting,
  dispatchManager,
  cancelTargeting,
  closeDetail,
  cancelActiveInteraction,
  collectCardSpread,
  chooseTargetAction,
  toggleAudio,
}: {
  actionRoot: ParentNode;
  actions: readonly ManagerAction[];
  actionSlots: readonly ManagerAction[];
  audio: Pick<AudioDirector, 'play'>;
  enabled?: boolean;
  mode: ManagerMode;
  pageElementInteraction: boolean;
  visibleItems: readonly DeckCard[];
  focusedIndex: number | null;
  setFocusedIndex: Dispatch<SetStateAction<number | null>>;
  focusedActionId: string | null;
  interactionId: string | null;
  hasInteractionOwner: () => boolean;
  claimInteraction: (id: string, cancelGesture?: () => void) => boolean;
  activateTargeting: (
    item: DeckCard,
    element: HTMLElement,
    point: { x: number; y: number },
  ) => void;
  dispatchManager: Dispatch<ManagerEvent<UserscriptDetailMode>>;
  cancelTargeting: () => void;
  closeDetail: () => void;
  cancelActiveInteraction: () => boolean;
  collectCardSpread: () => void;
  chooseTargetAction: (actionId: string) => void;
  toggleAudio: () => void;
}) {
  const root = inputRoot(actionRoot);
  const actionIds = useMemo(
    () => actionSlots.map((action) => action.id),
    [actionSlots],
  );
  const defaultActionId = preferredActionId(actions);
  const escapeDisposition = deckEscapeDisposition(mode, pageElementInteraction);

  const focusCard = useCallback(
    (index: number) => {
      if (mode !== 'spread' || hasInteractionOwner()) return false;
      const item = visibleItems[index];
      if (!item) return false;
      setFocusedIndex(index);
      actionRoot
        .querySelector<HTMLElement>(
          `[data-manager-card-id="${CSS.escape(item.id)}"]`,
        )
        ?.focus({ preventScroll: true });
      return true;
    },
    [actionRoot, hasInteractionOwner, mode, setFocusedIndex, visibleItems],
  );

  const activateCard = useCallback(
    (index: number) => {
      if (mode !== 'spread' || hasInteractionOwner()) return false;
      const item = visibleItems[index];
      if (!item) return false;
      const element = actionRoot.querySelector<HTMLElement>(
        `[data-manager-card-id="${CSS.escape(item.id)}"]`,
      );
      if (!element || !claimInteraction(item.id)) return false;
      const bounds = element.getBoundingClientRect();
      setFocusedIndex(index);
      audio.play('cardFlip', {
        positionX: bounds.left + bounds.width / 2,
      });
      if (isGamepadControlCard(item)) {
        // Claim before React commits targeting mode. This blocks any remaining
        // intents produced by the same physical snapshot at the bridge boundary.
        publishGamepadControlOwner('gamepad-test');
      }
      activateTargeting(item, element, {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      });
      const preferredAction = isGamepadControlCard(item)
        ? null
        : preferredActionId(actionsFor(item));
      if (preferredAction) {
        dispatchManager({
          type: 'hoverAction',
          actionId: preferredAction,
        });
        requestAnimationFrame(() =>
          focusManagerAction(actionRoot, preferredAction),
        );
      }
      return true;
    },
    [
      actionRoot,
      activateTargeting,
      audio,
      claimInteraction,
      dispatchManager,
      hasInteractionOwner,
      mode,
      setFocusedIndex,
      visibleItems,
    ],
  );

  const focusAction = useCallback(
    (actionId: string) => {
      dispatchManager({ type: 'hoverAction', actionId });
      requestAnimationFrame(() => focusManagerAction(actionRoot, actionId));
      return true;
    },
    [actionRoot, dispatchManager],
  );

  const cancel = useCallback(() => {
    if (escapeDisposition === 'busy') return true;
    if (escapeDisposition === 'cancel-targeting') {
      cancelTargeting();
      return true;
    }
    if (escapeDisposition === 'close-detail') {
      closeDetail();
      return true;
    }
    if (cancelActiveInteraction()) return true;
    if (escapeDisposition === 'collect') {
      collectCardSpread();
      return true;
    }
    return false;
  }, [
    cancelActiveInteraction,
    cancelTargeting,
    closeDetail,
    collectCardSpread,
    escapeDisposition,
  ]);
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;

  const handleIntent = useCallback(
    ({ intent }: IntentEnvelope) => {
      if (intent.type === 'toggleAudio') {
        toggleAudio();
        return true;
      }
      if (
        intent.type === 'back' ||
        intent.type === 'toggleDeck' ||
        intent.type === 'toggleSpeechOrDeck'
      ) {
        return cancel();
      }
      if (mode === 'returning') return true;
      if (
        mode === 'dragging' ||
        mode === 'reordering' ||
        (mode === 'spread' && interactionId !== null)
      ) {
        return false;
      }

      if (mode === 'spread') {
        if (
          intent.type === 'navigate' &&
          (intent.direction === 'left' || intent.direction === 'right')
        ) {
          const next = nextCircularIndex(
            focusedIndex,
            visibleItems.length,
            intent.direction === 'left' ? -1 : 1,
          );
          return next === null ? false : focusCard(next);
        }
        if (
          intent.type === 'confirm' ||
          (intent.type === 'navigate' && intent.direction === 'up')
        ) {
          return activateCard(focusedIndex ?? 0);
        }
        return false;
      }

      if (mode !== 'targeting' || actionIds.length === 0) return false;
      if (intent.type === 'navigate') {
        const next = nextSpatialActionId({
          root: actionRoot,
          actionIds,
          currentId: focusedActionId,
          defaultId: defaultActionId,
          direction: intent.direction,
        });
        if (next) return focusAction(next);
        if (intent.direction === 'down') {
          cancelTargeting();
          return true;
        }
        return false;
      }
      if (intent.type !== 'confirm') return false;
      const actionId =
        focusedActionId && actionIds.includes(focusedActionId)
          ? focusedActionId
          : (defaultActionId ?? actionIds[0]);
      if (!actionId) return false;
      focusAction(actionId);
      chooseTargetAction(actionId);
      return true;
    },
    [
      actionIds,
      actionRoot,
      activateCard,
      cancel,
      cancelTargeting,
      chooseTargetAction,
      defaultActionId,
      focusAction,
      focusCard,
      focusedActionId,
      focusedIndex,
      interactionId,
      mode,
      toggleAudio,
      visibleItems.length,
    ],
  );
  const handleIntentRef = useRef(handleIntent);
  handleIntentRef.current = handleIntent;

  useEffect(() => {
    if (!enabled || !escapeDisposition) return;
    const ownerDocument = root instanceof Document ? root : root.ownerDocument;
    return registerEscapeLayer(ownerDocument, {
      id: 'userscript-deck',
      priority:
        escapeDisposition === 'cancel-targeting'
          ? INPUT_SCOPE_PRIORITY.actionRing
          : INPUT_SCOPE_PRIORITY.deck,
      onEscape: () => {
        cancelRef.current();
      },
    });
  }, [enabled, escapeDisposition, root]);

  useEffect(() => {
    if (!enabled || mode === 'closed' || mode === 'detail') return;
    return inputCoordinatorFor(root).register(root, {
      id: 'userscript-deck',
      priority:
        mode === 'targeting'
          ? INPUT_SCOPE_PRIORITY.actionRing
          : INPUT_SCOPE_PRIORITY.deck,
      handle: (event) => handleIntentRef.current(event),
    });
  }, [enabled, mode, root]);
}
