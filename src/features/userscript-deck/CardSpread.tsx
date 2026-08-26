import { type ComponentProps, useEffect, useRef } from 'react';

import { useAudioDirector } from '../../audio/AudioDirectorProvider';
import {
  cardHoverIndexAtPoint,
  type Point,
} from '../manager-interaction/layout';
import {
  cardCollectionRole,
  type ManagerState,
} from '../manager-interaction/state';
import type { ManagerAction } from './actions';
import type { DeckCard } from './cards';
import type { UserscriptDetailMode } from './detail-mode';
import { ManagerCard } from './ManagerCard';

type CardHandlers = Pick<
  ComponentProps<typeof ManagerCard>,
  | 'onFocus'
  | 'onDealReady'
  | 'onDealComplete'
  | 'onCollectAll'
  | 'onArrivalComplete'
  | 'onReturnComplete'
  | 'onInteractionClaim'
  | 'onInteractionRelease'
  | 'onDragStart'
  | 'onActionStart'
  | 'onActionCancel'
  | 'onActivate'
  | 'onReorderPoint'
  | 'onDragPoint'
  | 'onRelease'
>;

export function CardSpread({
  renderedItems,
  visibleItems,
  managerState,
  actionSlots,
  selectedId,
  selectedIndex,
  focusedIndex,
  emphasizedActionId,
  castingAction,
  viewportWidth,
  viewportHeight,
  motionCardCount,
  retreated,
  dealActive,
  dealCycle,
  collectCycle,
  arrivingId,
  deckTriggerElement,
  suppressedCardIds,
  interactionId,
  executionUnavailable,
  onFocus,
  onReorderRelease,
  ...handlers
}: CardHandlers & {
  renderedItems: readonly DeckCard[];
  visibleItems: readonly DeckCard[];
  managerState: ManagerState<UserscriptDetailMode>;
  actionSlots: readonly ManagerAction[];
  selectedId: string | null;
  selectedIndex: number;
  focusedIndex: number | null;
  emphasizedActionId: string | null;
  castingAction: {
    cardId: string;
    actionId: string;
    phase: 'charging' | 'returning';
  } | null;
  viewportWidth: number;
  viewportHeight: number;
  motionCardCount: number;
  retreated: boolean;
  dealActive: boolean;
  dealCycle: number;
  collectCycle: number;
  arrivingId: string | null;
  deckTriggerElement: HTMLElement | null;
  suppressedCardIds: ReadonlySet<string>;
  interactionId: string | null;
  executionUnavailable: boolean;
  onReorderRelease: (cardId: string, point: Point | null) => void;
}) {
  const audio = useAudioDirector();
  const mode = managerState.mode;
  const hoverEnabled =
    mode === 'spread' && !dealActive && interactionId === null && !retreated;
  const focusedIndexRef = useRef(focusedIndex);
  const lastPointerRef = useRef<Point | null>(null);
  focusedIndexRef.current = focusedIndex;
  const visibleIndexById = new Map(
    visibleItems.map((item, index) => [item.id, index]),
  );
  const actionById = new Map(actionSlots.map((action) => [action.id, action]));

  useEffect(() => {
    const updateHover = (point: Point) => {
      if (!hoverEnabled) return;
      const nextIndex = cardHoverIndexAtPoint({
        point,
        total: visibleItems.length,
        viewportWidth,
        viewportHeight,
        currentIndex: focusedIndexRef.current,
      });
      if (nextIndex === focusedIndexRef.current) return;
      focusedIndexRef.current = nextIndex;
      onFocus(nextIndex);
      if (nextIndex !== null) {
        audio.play('cardHover', { positionX: point.x });
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const point = { x: event.clientX, y: event.clientY };
      lastPointerRef.current = point;
      updateHover(point);
    };
    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget !== null) return;
      lastPointerRef.current = null;
      if (!hoverEnabled || focusedIndexRef.current === null) return;
      focusedIndexRef.current = null;
      onFocus(null);
    };

    window.addEventListener('pointermove', handlePointerMove, {
      capture: true,
      passive: true,
    });
    window.addEventListener('pointerout', handlePointerOut, true);
    if (lastPointerRef.current) updateHover(lastPointerRef.current);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerout', handlePointerOut, true);
    };
  }, [
    audio,
    hoverEnabled,
    onFocus,
    viewportHeight,
    viewportWidth,
    visibleItems.length,
  ]);

  return (
    <section
      className={`manager-card-spread${interactionId ? ' has-active-interaction' : ''}`}
      aria-label="当前页面可用的卡牌牌阵"
    >
      {renderedItems.map((item) => {
        const index = visibleIndexById.get(item.id) ?? -1;
        const activeManagerAction =
          selectedId === item.id && emphasizedActionId
            ? (actionById.get(emphasizedActionId) ?? null)
            : null;
        const castingActionKind =
          castingAction?.cardId === item.id
            ? (actionById.get(castingAction.actionId)?.kind ?? null)
            : null;

        return (
          <ManagerCard
            key={item.id}
            item={item}
            index={index}
            layerIndex={index}
            total={motionCardCount}
            mode={mode}
            selectedId={selectedId}
            selectedIndex={selectedIndex}
            focusedIndex={focusedIndex}
            viewportWidth={viewportWidth}
            viewportHeight={viewportHeight}
            retreated={retreated}
            dealActive={dealActive}
            dealCycle={dealCycle}
            collectCycle={collectCycle}
            arrivingId={arrivingId}
            castingActionKind={castingActionKind}
            collectionRole={cardCollectionRole(managerState, item.id, index)}
            activeManagerAction={activeManagerAction}
            deckTriggerElement={deckTriggerElement}
            presentationSuppressed={suppressedCardIds.has(item.id)}
            hoverManagedExternally={!dealActive}
            executionUnavailable={executionUnavailable}
            interactionId={interactionId}
            onFocus={onFocus}
            onReorderRelease={(point) => onReorderRelease(item.id, point)}
            {...handlers}
          />
        );
      })}
    </section>
  );
}
