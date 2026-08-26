import type { NavigationDirection } from '../../input/intents';

export function nextCircularIndex(
  current: number | null,
  total: number,
  direction: -1 | 1,
  initial = direction > 0 ? 0 : total - 1,
) {
  if (total <= 0) return null;
  if (current === null || current < 0 || current >= total) {
    return Math.min(total - 1, Math.max(0, initial));
  }
  return (current + direction + total) % total;
}

function actionElement(root: ParentNode, actionId: string) {
  return root.querySelector<HTMLElement>(
    `[data-manager-action="${CSS.escape(actionId)}"]`,
  );
}

function center(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}

function scoreDirection(
  origin: { x: number; y: number },
  candidate: { x: number; y: number },
  direction: NavigationDirection,
) {
  const dx = candidate.x - origin.x;
  const dy = candidate.y - origin.y;
  const primary =
    direction === 'left'
      ? -dx
      : direction === 'right'
        ? dx
        : direction === 'up'
          ? -dy
          : dy;
  if (primary <= 2) return Number.POSITIVE_INFINITY;
  const secondary =
    direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
  return primary + secondary * 1.7 + (secondary * secondary) / primary;
}

export function nextSpatialActionId({
  root,
  actionIds,
  currentId,
  defaultId,
  direction,
}: {
  root: ParentNode;
  actionIds: readonly string[];
  currentId: string | null;
  defaultId: string | null;
  direction: NavigationDirection;
}) {
  const entries = actionIds.flatMap((id) => {
    const element = actionElement(root, id);
    if (!element || element.offsetParent === null) return [];
    return [{ id, element, center: center(element) }];
  });
  if (entries.length === 0) return null;
  const current =
    entries.find((entry) => entry.id === currentId) ??
    entries.find((entry) => entry.id === defaultId) ??
    entries[0];
  if (!currentId) return current?.id ?? null;
  const next = entries
    .filter((entry) => entry.id !== current.id)
    .map((entry) => ({
      ...entry,
      score: scoreDirection(current.center, entry.center, direction),
    }))
    .sort((left, right) => left.score - right.score)[0];
  return next && Number.isFinite(next.score) ? next.id : null;
}

export function focusManagerAction(root: ParentNode, actionId: string) {
  const element = actionElement(root, actionId);
  if (!element) return false;
  element.focus({ preventScroll: true });
  return true;
}
