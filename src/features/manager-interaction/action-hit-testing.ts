import {
  ACTION_TARGET_EXIT_TOLERANCE,
  ACTION_TARGET_FAST_RELEASE_GRACE_MS,
  ACTION_TARGET_FAST_RELEASE_TOLERANCE,
  ACTION_TARGET_HIT_TOLERANCE,
  ACTION_TARGET_LOCK_EXIT_TOLERANCE,
  type ActionHitSample,
  actionRegionContains,
  type CornerActionPosition,
  centralActionRegionContains,
  type Point,
} from './layout';

type PointActionOptions = {
  root?: ParentNode;
  zone?: 'corner' | 'center';
  previousActionId?: string | null;
  hitTolerance?: number;
  exitTolerance?: number;
};

type ManagerActionTargetOptions = {
  root?: ParentNode;
  previousActionId?: string | null;
};

type ManagerActionLockOptions = ManagerActionTargetOptions & {
  lastDirectHitAt: number;
  now: number;
};

export type ManagerActionLock = {
  actionId: string | null;
  lastDirectHitAt: number;
};

export function managerActionRoot(
  element: Node | null,
  fallback: ParentNode,
): ParentNode {
  const root = element?.getRootNode();
  return root && 'querySelectorAll' in root ? (root as ParentNode) : fallback;
}

function centralActionRegion(root: ParentNode) {
  const field = root.querySelector<HTMLElement>('[data-manager-action-field]');
  if (!field) return null;
  const bounds = field.getBoundingClientRect();
  const span = Number(field.dataset.managerActionSpan);
  const arcHeight = Number(field.dataset.managerActionArcHeight);
  const baselineOffset = Number(field.dataset.managerActionBaselineOffset);
  if (
    !Number.isFinite(span) ||
    !Number.isFinite(arcHeight) ||
    !Number.isFinite(baselineOffset)
  ) {
    return null;
  }
  return {
    centerX: bounds.left + bounds.width / 2,
    baselineY: bounds.top + baselineOffset,
    radiusX: span / 2,
    radiusY: arcHeight,
  };
}

export function pointAction(
  sample: ActionHitSample,
  {
    root = document,
    zone,
    previousActionId = null,
    hitTolerance = 0,
    exitTolerance = 0,
  }: PointActionOptions = {},
) {
  const actions = [
    ...root.querySelectorAll<HTMLElement>('[data-manager-action]'),
  ];
  if (zone !== 'center') {
    const corner = actions.find((element) => {
      if (element.dataset.managerActionZone !== 'corner') return false;
      const bounds = element.getBoundingClientRect();
      const position = element.dataset
        .managerActionCorner as CornerActionPosition;
      return (
        actionRegionContains(sample.pointer, bounds, position, hitTolerance) ||
        actionRegionContains(sample.cardCenter, bounds, position, hitTolerance)
      );
    });
    if (corner) return corner.dataset.managerAction ?? null;
  }

  const region = zone === 'corner' ? null : centralActionRegion(root);
  if (region) {
    const hitPoint = centralActionRegionContains(
      sample.pointer,
      region,
      hitTolerance,
    )
      ? sample.pointer
      : centralActionRegionContains(sample.cardCenter, region, hitTolerance)
        ? sample.cardCenter
        : null;
    const center = hitPoint
      ? actions.find((element) => {
          if (element.dataset.managerActionZone !== 'center') return false;
          const bounds = element.getBoundingClientRect();
          return hitPoint.x >= bounds.left && hitPoint.x <= bounds.right;
        })
      : null;
    if (center) return center.dataset.managerAction ?? null;
  }

  if (!previousActionId || exitTolerance <= 0) return null;
  const previous = actions.find(
    (element) => element.dataset.managerAction === previousActionId,
  );
  if (!previous) return null;
  if (previous.dataset.managerActionZone === 'corner') {
    if (zone === 'center') return null;
    const bounds = previous.getBoundingClientRect();
    const position = previous.dataset
      .managerActionCorner as CornerActionPosition;
    return actionRegionContains(
      sample.pointer,
      bounds,
      position,
      exitTolerance,
    ) ||
      actionRegionContains(sample.cardCenter, bounds, position, exitTolerance)
      ? previousActionId
      : null;
  }
  if (!region) return null;
  const bounds = previous.getBoundingClientRect();
  const retainsPoint = (point: ActionHitSample['pointer']) =>
    centralActionRegionContains(point, region, exitTolerance) &&
    point.x >= bounds.left - exitTolerance &&
    point.x <= bounds.right + exitTolerance;
  return retainsPoint(sample.pointer) || retainsPoint(sample.cardCenter)
    ? previousActionId
    : null;
}

export function resolveManagerActionTarget(
  sample: ActionHitSample,
  { root = document, previousActionId = null }: ManagerActionTargetOptions = {},
) {
  return pointAction(sample, {
    root,
    previousActionId,
    hitTolerance: ACTION_TARGET_HIT_TOLERANCE,
    exitTolerance: ACTION_TARGET_EXIT_TOLERANCE,
  });
}

export function resolveManagerActionLock(
  sample: ActionHitSample,
  {
    root = document,
    previousActionId = null,
    lastDirectHitAt,
    now,
  }: ManagerActionLockOptions,
): ManagerActionLock {
  const directActionId = pointAction(sample, {
    root,
    hitTolerance: ACTION_TARGET_HIT_TOLERANCE,
  });
  if (directActionId) {
    return {
      actionId: directActionId,
      lastDirectHitAt: now,
    };
  }
  if (!previousActionId) {
    return {
      actionId: null,
      lastDirectHitAt,
    };
  }

  const retainedActionId = pointAction(sample, {
    root,
    previousActionId,
    exitTolerance: ACTION_TARGET_LOCK_EXIT_TOLERANCE,
  });
  if (retainedActionId) {
    return {
      actionId: retainedActionId,
      lastDirectHitAt,
    };
  }

  const insideFastReleaseGrace =
    now - lastDirectHitAt <= ACTION_TARGET_FAST_RELEASE_GRACE_MS;
  const fastReleaseActionId = insideFastReleaseGrace
    ? pointAction(sample, {
        root,
        previousActionId,
        exitTolerance: ACTION_TARGET_FAST_RELEASE_TOLERANCE,
      })
    : null;
  return {
    actionId: fastReleaseActionId,
    lastDirectHitAt,
  };
}

export function resolveManagerPointerAction(
  point: Point,
  options: ManagerActionTargetOptions = {},
) {
  return resolveManagerActionTarget(
    { pointer: point, cardCenter: point },
    options,
  );
}
