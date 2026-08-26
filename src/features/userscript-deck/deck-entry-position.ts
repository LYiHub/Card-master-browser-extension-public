import type { DeckEntryPosition } from './deck-entry';
import type { DeckEntryInsets } from './deck-entry-layout';

export const DECK_ENTRY_DRAG_THRESHOLD = 6;

export type DeckEntryDragSession = {
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startCenterX: number;
  startCenterY: number;
  insets: DeckEntryInsets;
  moved: boolean;
  position: DeckEntryPosition;
};

function clampedAxisPosition(
  position: number,
  size: number,
  startInset: number,
  endInset: number,
) {
  const minimum = Math.min(size / 2, startInset);
  const maximum = Math.max(minimum, size - Math.min(size / 2, endInset));
  return Math.min(maximum, Math.max(minimum, position));
}

export function normalizedDeckEntryPosition({
  centerX,
  centerY,
  insets,
  viewportWidth,
  viewportHeight,
}: {
  centerX: number;
  centerY: number;
  insets: DeckEntryInsets;
  viewportWidth: number;
  viewportHeight: number;
}): DeckEntryPosition {
  return {
    x:
      clampedAxisPosition(centerX, viewportWidth, insets.left, insets.right) /
      viewportWidth,
    y:
      clampedAxisPosition(centerY, viewportHeight, insets.top, insets.bottom) /
      viewportHeight,
  };
}

export function createDeckEntryDragSession({
  pointerId,
  pointerX,
  pointerY,
  centerX,
  centerY,
  viewportWidth,
  viewportHeight,
  position,
  insets,
}: {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  centerX: number;
  centerY: number;
  viewportWidth: number;
  viewportHeight: number;
  position: DeckEntryPosition | null;
  insets: DeckEntryInsets;
}): DeckEntryDragSession {
  return {
    pointerId,
    startPointerX: pointerX,
    startPointerY: pointerY,
    startCenterX: centerX,
    startCenterY: centerY,
    insets,
    moved: false,
    position:
      position ??
      normalizedDeckEntryPosition({
        centerX,
        centerY,
        insets,
        viewportWidth,
        viewportHeight,
      }),
  };
}

export function updateDeckEntryDragSession(
  session: DeckEntryDragSession,
  {
    pointerX,
    pointerY,
    viewportWidth,
    viewportHeight,
  }: {
    pointerX: number;
    pointerY: number;
    viewportWidth: number;
    viewportHeight: number;
  },
) {
  const deltaX = pointerX - session.startPointerX;
  const deltaY = pointerY - session.startPointerY;
  if (
    !session.moved &&
    Math.hypot(deltaX, deltaY) < DECK_ENTRY_DRAG_THRESHOLD
  ) {
    return null;
  }
  const started = !session.moved;
  session.moved = true;
  session.position = normalizedDeckEntryPosition({
    centerX: session.startCenterX + deltaX,
    centerY: session.startCenterY + deltaY,
    insets: session.insets,
    viewportWidth,
    viewportHeight,
  });
  return {
    position: session.position,
    started,
  };
}
