import { type Dispatch, type SetStateAction, useCallback, useRef } from 'react';

import {
  type InstalledUserscript,
  reorderInstalledScriptSubset,
  restoreInstalledScriptOrder,
} from '../../userscript/domain/types';
import { cardLayout, type Point } from '../manager-interaction/layout';
import type { DeckCard } from './cards';
import { isInstalledUserscript } from './cards';

export function useCardReordering({
  items,
  setItems,
  visibleItems,
  systemCards,
  matchingItemIds,
  scriptStartIndex,
  viewportWidth,
  viewportHeight,
  deckTriggerElement,
  setLayerOrder,
  setFocusedIndex,
  playReorder,
  persistOrder,
  onBeginReorder,
  onBeginAction,
  onShowCardSpread,
}: {
  items: readonly InstalledUserscript[];
  setItems: Dispatch<SetStateAction<InstalledUserscript[]>>;
  visibleItems: readonly DeckCard[];
  systemCards: readonly DeckCard[];
  matchingItemIds: readonly string[];
  scriptStartIndex: number;
  viewportWidth: number;
  viewportHeight: number;
  deckTriggerElement: HTMLElement | null;
  setLayerOrder: Dispatch<SetStateAction<string[]>>;
  setFocusedIndex: Dispatch<SetStateAction<number | null>>;
  playReorder: (positionX: number) => void;
  persistOrder: (orderedIds: readonly string[]) => void;
  onBeginReorder: (cardId: string) => void;
  onBeginAction: (cardId: string) => void;
  onShowCardSpread: () => void;
}) {
  const targetIndexRef = useRef<number | null>(null);
  const sessionRef = useRef<{
    cardId: string;
    originalOrder: string[];
  } | null>(null);

  const restorePreview = useCallback(
    (cardId: string) => {
      const session = sessionRef.current;
      if (!session || session.cardId !== cardId) return;
      setItems((current) =>
        restoreInstalledScriptOrder(current, session.originalOrder),
      );
      targetIndexRef.current = session.originalOrder.indexOf(cardId);
    },
    [setItems],
  );

  const finishSession = useCallback(
    (cardId: string, restoreOriginal: boolean) => {
      const session = sessionRef.current;
      if (!session || session.cardId !== cardId) return null;
      if (restoreOriginal) {
        setItems((current) =>
          restoreInstalledScriptOrder(current, session.originalOrder),
        );
      }
      sessionRef.current = null;
      targetIndexRef.current = null;
      return session.originalOrder;
    },
    [setItems],
  );

  const restoreSession = useCallback(
    (cardId: string) => {
      const originalOrder = finishSession(cardId, true);
      if (!originalOrder) return;
      setLayerOrder([
        ...systemCards.map((systemCard) => systemCard.id),
        ...originalOrder,
      ]);
    },
    [finishSession, setLayerOrder, systemCards],
  );

  const beginReorder = useCallback(
    (cardId: string) => {
      sessionRef.current = {
        cardId,
        originalOrder: items.map((candidate) => candidate.id),
      };
      const visibleIndex = visibleItems.findIndex(
        (candidate) => candidate.id === cardId,
      );
      targetIndexRef.current = Math.max(0, visibleIndex - scriptStartIndex);
      setFocusedIndex(visibleIndex);
      onBeginReorder(cardId);
    },
    [items, onBeginReorder, scriptStartIndex, setFocusedIndex, visibleItems],
  );

  const beginAction = useCallback(
    (cardId: string) => {
      restorePreview(cardId);
      setFocusedIndex(null);
      onBeginAction(cardId);
    },
    [onBeginAction, restorePreview, setFocusedIndex],
  );

  const cancelAction = useCallback(
    (cardId: string) => {
      setFocusedIndex(
        visibleItems.findIndex((candidate) => candidate.id === cardId),
      );
      onBeginReorder(cardId);
    },
    [onBeginReorder, setFocusedIndex, visibleItems],
  );

  const updateReorder = useCallback(
    (cardId: string, point: Point) => {
      const movingItem = visibleItems.find((item) => item.id === cardId);
      if (
        !movingItem ||
        !isInstalledUserscript(movingItem) ||
        items.length < 2 ||
        sessionRef.current?.cardId !== cardId
      ) {
        return;
      }

      let targetVisibleIndex = scriptStartIndex;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (
        let visibleIndex = scriptStartIndex;
        visibleIndex < visibleItems.length;
        visibleIndex += 1
      ) {
        const slot = cardLayout(
          visibleIndex,
          visibleItems.length,
          viewportWidth,
          viewportHeight,
        );
        const distance = Math.abs(point.x - (viewportWidth / 2 + slot.x));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          targetVisibleIndex = visibleIndex;
        }
      }

      const targetIndex = targetVisibleIndex - scriptStartIndex;
      if (targetIndexRef.current === targetIndex) return;
      targetIndexRef.current = targetIndex;
      playReorder(point.x);
      setFocusedIndex(targetVisibleIndex);
      setItems((current) =>
        reorderInstalledScriptSubset(
          current,
          matchingItemIds,
          cardId,
          targetIndex,
        ),
      );
    },
    [
      items.length,
      matchingItemIds,
      playReorder,
      scriptStartIndex,
      setFocusedIndex,
      setItems,
      viewportHeight,
      viewportWidth,
      visibleItems,
    ],
  );

  const releaseReorder = useCallback(
    (cardId: string, point: Point | null) => {
      const originalOrder = finishSession(cardId, point === null);
      setLayerOrder(
        point === null && originalOrder
          ? [
              ...systemCards.map((systemCard) => systemCard.id),
              ...originalOrder,
            ]
          : visibleItems.map((candidate) => candidate.id),
      );

      const rootNode = deckTriggerElement?.getRootNode();
      const hitElements =
        rootNode instanceof ShadowRoot
          ? rootNode.elementsFromPoint(point?.x ?? 0, point?.y ?? 0)
          : document.elementsFromPoint(point?.x ?? 0, point?.y ?? 0);
      const cardAtPointer = point
        ? hitElements
            .map((element) =>
              element.closest<HTMLElement>('[data-manager-card-id]'),
            )
            .find((element): element is HTMLElement => Boolean(element))
        : null;
      const nextFocusedIndex = cardAtPointer
        ? visibleItems.findIndex(
            (candidate) => candidate.id === cardAtPointer.dataset.managerCardId,
          )
        : -1;
      setFocusedIndex(nextFocusedIndex >= 0 ? nextFocusedIndex : null);
      if (point !== null) {
        persistOrder(items.map((script) => script.id));
      }
      onShowCardSpread();
    },
    [
      deckTriggerElement,
      finishSession,
      items,
      onShowCardSpread,
      persistOrder,
      setFocusedIndex,
      setLayerOrder,
      systemCards,
      visibleItems,
    ],
  );

  return {
    beginReorder,
    beginAction,
    cancelAction,
    updateReorder,
    releaseReorder,
    restoreSession,
  };
}
