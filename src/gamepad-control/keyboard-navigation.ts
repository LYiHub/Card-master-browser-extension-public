import type { NavigationDirection } from '../input/intents';

export type KeyboardNavigationTarget = Readonly<{
  row: number;
  column: number;
  x?: number;
  startX?: number;
  endX?: number;
  verticalNavigationEligible?: boolean;
}>;

export type HorizontalNavigationBounds = Readonly<{
  left: number;
  right: number;
}>;

export type HorizontalNavigationGeometry = Readonly<{
  x: number;
  startX: number;
  endX: number;
  visible: boolean;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function horizontalNavigationGeometry(
  target: HorizontalNavigationBounds,
  viewport: HorizontalNavigationBounds,
): HorizontalNavigationGeometry | null {
  const viewportWidth = viewport.right - viewport.left;
  if (
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0 ||
    !Number.isFinite(target.left) ||
    !Number.isFinite(target.right)
  ) {
    return null;
  }

  const targetLeft = Math.min(target.left, target.right);
  const targetRight = Math.max(target.left, target.right);
  const visibleLeft = Math.max(targetLeft, viewport.left);
  const visibleRight = Math.min(targetRight, viewport.right);
  const visible = visibleRight > visibleLeft;
  const center = visible
    ? (visibleLeft + visibleRight) / 2
    : clamp((targetLeft + targetRight) / 2, viewport.left, viewport.right);
  const start = visible ? visibleLeft : center;
  const end = visible ? visibleRight : center;

  return {
    x: (center - viewport.left) / viewportWidth,
    startX: (start - viewport.left) / viewportWidth,
    endX: (end - viewport.left) / viewportWidth,
    visible,
  };
}

export function horizontalRevealPosition(
  target: HorizontalNavigationBounds,
  viewport: HorizontalNavigationBounds,
): number | null {
  const viewportWidth = viewport.right - viewport.left;
  const targetWidth = target.right - target.left;
  if (viewportWidth <= 0 || targetWidth <= 0) return null;

  if (targetWidth >= viewportWidth) {
    if (target.right <= viewport.left) return target.right - viewportWidth;
    if (target.left >= viewport.right) return target.left;
    return null;
  }
  if (target.left < viewport.left) return target.left;
  if (target.right > viewport.right) return target.right - viewportWidth;
  return null;
}

function horizontalPosition(
  target: KeyboardNavigationTarget,
  row: readonly KeyboardNavigationTarget[],
) {
  if (typeof target.x === 'number') return target.x;
  const index = row.indexOf(target);
  return row.length <= 1 ? 0.5 : index / (row.length - 1);
}

function horizontalDistance(
  target: KeyboardNavigationTarget,
  row: readonly KeyboardNavigationTarget[],
  originX: number,
) {
  if (typeof target.startX === 'number' && typeof target.endX === 'number') {
    const start = Math.min(target.startX, target.endX);
    const end = Math.max(target.startX, target.endX);
    if (originX < start) return start - originX;
    if (originX > end) return originX - end;
    return 0;
  }
  return Math.abs(horizontalPosition(target, row) - originX);
}

export function findKeyboardNavigationTarget(
  targets: readonly KeyboardNavigationTarget[],
  current: KeyboardNavigationTarget,
  direction: NavigationDirection,
): KeyboardNavigationTarget | null {
  const rows = new Map<number, KeyboardNavigationTarget[]>();
  for (const target of targets) {
    const row = rows.get(target.row) ?? [];
    row.push(target);
    rows.set(target.row, row);
  }
  for (const row of rows.values()) {
    row.sort((left, right) => left.column - right.column);
  }

  const rowNumbers = [...rows.keys()].sort((left, right) => left - right);
  const currentRowIndex = rowNumbers.indexOf(current.row);
  if (currentRowIndex < 0) return null;
  const currentRow = rows.get(current.row) ?? [];
  const currentColumnIndex = currentRow.findIndex(
    (target) => target.column === current.column,
  );
  if (currentColumnIndex < 0) return null;

  if (direction === 'left' || direction === 'right') {
    const offset = direction === 'left' ? -1 : 1;
    return currentRow[currentColumnIndex + offset] ?? null;
  }

  const rowOffset = direction === 'up' ? -1 : 1;
  const targetRowNumber = rowNumbers[currentRowIndex + rowOffset];
  if (targetRowNumber === undefined) return null;
  const targetRow = (rows.get(targetRowNumber) ?? []).filter(
    (target) => target.verticalNavigationEligible !== false,
  );
  if (!targetRow.length) return null;
  const origin = currentRow[currentColumnIndex] ?? current;
  const originX = horizontalPosition(origin, currentRow);
  return (
    targetRow.reduce<KeyboardNavigationTarget | null>((nearest, target) => {
      if (!nearest) return target;
      const distance = horizontalDistance(target, targetRow, originX);
      const nearestDistance = horizontalDistance(nearest, targetRow, originX);
      const centerDistance = Math.abs(
        horizontalPosition(target, targetRow) - originX,
      );
      const nearestCenterDistance = Math.abs(
        horizontalPosition(nearest, targetRow) - originX,
      );
      return distance < nearestDistance ||
        (distance === nearestDistance &&
          (centerDistance < nearestCenterDistance ||
            (centerDistance === nearestCenterDistance &&
              target.column < nearest.column)))
        ? target
        : nearest;
    }, null) ?? null
  );
}
