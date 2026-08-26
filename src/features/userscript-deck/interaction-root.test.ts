import { describe, expect, it } from 'vitest';

import {
  managerActionRoot,
  pointAction,
  resolveManagerActionLock,
  resolveManagerActionTarget,
  resolveManagerPointerAction,
} from '../manager-interaction/action-hit-testing';

function actionElement({
  action,
  corner,
  zone,
  bounds = {
    top: 0,
    right: 200,
    bottom: 200,
    left: 0,
    width: 200,
    height: 200,
  },
}: {
  action: string;
  corner?: string;
  zone: 'center' | 'corner';
  bounds?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
    width: number;
    height: number;
  };
}) {
  return {
    dataset: {
      managerAction: action,
      managerActionCorner: corner,
      managerActionZone: zone,
    },
    getBoundingClientRect: () => ({
      ...bounds,
      x: bounds.left,
      y: bounds.top,
      toJSON: () => undefined,
    }),
  } as unknown as HTMLElement;
}

function actionField() {
  return {
    dataset: {
      managerActionArcHeight: '200',
      managerActionBaselineOffset: '200',
      managerActionSpan: '200',
    },
    getBoundingClientRect: () => ({
      top: 0,
      right: 101,
      bottom: 1,
      left: 100,
      width: 1,
      height: 1,
      x: 100,
      y: 0,
      toJSON: () => undefined,
    }),
  } as unknown as HTMLElement;
}

describe('manager action root', () => {
  it('uses the containing host root instead of the deck button', () => {
    const fallback = {
      querySelectorAll: () => [],
    } as unknown as ParentNode;
    const containingRoot = {
      querySelectorAll: () => [],
    } as unknown as ParentNode;
    const element = {
      getRootNode: () => containingRoot,
    } as unknown as Node;

    expect(managerActionRoot(element, fallback)).toBe(containingRoot);
    expect(managerActionRoot(null, fallback)).toBe(fallback);
  });

  it('finds fixed corner actions from an isolated host root', () => {
    const center = actionElement({
      action: 'command',
      zone: 'center',
    });
    const corner = actionElement({
      action: 'remove',
      corner: 'bottom-left',
      zone: 'corner',
    });
    const root = {
      querySelectorAll: () => [center, corner],
      querySelector: () => actionField(),
    } as unknown as ParentNode;
    const sample = {
      pointer: { x: 20, y: 180 },
      cardCenter: { x: 190, y: 10 },
    };

    expect(pointAction(sample, { root })).toBe('remove');
    expect(pointAction(sample, { root, zone: 'corner' })).toBe('remove');
    expect(
      pointAction(
        {
          pointer: { x: 300, y: 300 },
          cardCenter: { x: 100, y: 100 },
        },
        { root, zone: 'center' },
      ),
    ).toBe('command');
    expect(
      pointAction(
        {
          pointer: { x: 300, y: 300 },
          cardCenter: { x: 100, y: -20 },
        },
        { root },
      ),
    ).toBeNull();
  });

  it('uses the pointer or card center for central command rings, with pointer intent first', () => {
    const left = actionElement({
      action: 'left-command',
      zone: 'center',
      bounds: {
        top: 0,
        right: 100,
        bottom: 200,
        left: 0,
        width: 100,
        height: 200,
      },
    });
    const right = actionElement({
      action: 'right-command',
      zone: 'center',
      bounds: {
        top: 0,
        right: 200,
        bottom: 200,
        left: 100,
        width: 100,
        height: 200,
      },
    });
    const root = {
      querySelectorAll: () => [left, right],
      querySelector: () => actionField(),
    } as unknown as ParentNode;

    expect(
      pointAction(
        {
          pointer: { x: 150, y: 100 },
          cardCenter: { x: 50, y: 100 },
        },
        { root, zone: 'center' },
      ),
    ).toBe('right-command');
    expect(
      pointAction(
        {
          pointer: { x: 300, y: 300 },
          cardCenter: { x: 50, y: 100 },
        },
        { root, zone: 'center' },
      ),
    ).toBe('left-command');
  });

  it('keeps an attached action through a wider exit boundary without delaying direct switches', () => {
    const left = actionElement({
      action: 'left-command',
      zone: 'center',
      bounds: {
        top: 0,
        right: 100,
        bottom: 200,
        left: 0,
        width: 100,
        height: 200,
      },
    });
    const right = actionElement({
      action: 'right-command',
      zone: 'center',
      bounds: {
        top: 0,
        right: 200,
        bottom: 200,
        left: 100,
        width: 100,
        height: 200,
      },
    });
    const root = {
      querySelectorAll: () => [left, right],
      querySelector: () => actionField(),
    } as unknown as ParentNode;

    expect(
      pointAction(
        {
          pointer: { x: 205, y: 100 },
          cardCenter: { x: 300, y: 300 },
        },
        {
          root,
          previousActionId: 'right-command',
          exitTolerance: 18,
        },
      ),
    ).toBe('right-command');
    expect(
      pointAction(
        {
          pointer: { x: 50, y: 100 },
          cardCenter: { x: 300, y: 300 },
        },
        {
          root,
          previousActionId: 'right-command',
          exitTolerance: 18,
        },
      ),
    ).toBe('left-command');
  });

  it('retains a corner action without requiring a central action field', () => {
    const corner = actionElement({
      action: 'cancel',
      corner: 'top-left',
      zone: 'corner',
    });
    const root = {
      querySelectorAll: () => [corner],
      querySelector: () => null,
    } as unknown as ParentNode;

    expect(
      pointAction(
        {
          pointer: { x: 150, y: 150 },
          cardCenter: { x: 300, y: 300 },
        },
        {
          root,
          previousActionId: 'cancel',
          exitTolerance: 18,
        },
      ),
    ).toBe('cancel');
  });

  it('uses one enlarged target resolver for pointer and dragged-card selection', () => {
    const command = actionElement({
      action: 'command',
      zone: 'center',
      bounds: {
        top: 0,
        right: 200,
        bottom: 200,
        left: 100,
        width: 100,
        height: 200,
      },
    });
    const root = {
      querySelectorAll: () => [command],
      querySelector: () => actionField(),
    } as unknown as ParentNode;

    expect(resolveManagerPointerAction({ x: 150, y: 210 }, { root })).toBe(
      'command',
    );
    expect(
      resolveManagerActionTarget(
        {
          pointer: { x: 300, y: 300 },
          cardCenter: { x: 150, y: 210 },
        },
        { root },
      ),
    ).toBe('command');
  });

  it('locks an acquired action through a fast release beyond the normal exit boundary', () => {
    const corner = actionElement({
      action: 'remove',
      corner: 'top-left',
      zone: 'corner',
    });
    const root = {
      querySelectorAll: () => [corner],
      querySelector: () => null,
    } as unknown as ParentNode;
    const acquired = resolveManagerActionLock(
      {
        pointer: { x: 140, y: 140 },
        cardCenter: { x: 500, y: 500 },
      },
      {
        root,
        lastDirectHitAt: Number.NEGATIVE_INFINITY,
        now: 100,
      },
    );

    expect(acquired).toEqual({
      actionId: 'remove',
      lastDirectHitAt: 100,
    });
    expect(
      resolveManagerActionLock(
        {
          pointer: { x: 220, y: 220 },
          cardCenter: { x: 500, y: 500 },
        },
        {
          root,
          previousActionId: acquired.actionId,
          lastDirectHitAt: acquired.lastDirectHitAt,
          now: 180,
        },
      ),
    ).toEqual(acquired);
  });

  it('keeps a locked action near its target but releases deliberate movement away', () => {
    const corner = actionElement({
      action: 'remove',
      corner: 'top-left',
      zone: 'corner',
    });
    const root = {
      querySelectorAll: () => [corner],
      querySelector: () => null,
    } as unknown as ParentNode;
    const lock = {
      actionId: 'remove',
      lastDirectHitAt: 100,
    };

    expect(
      resolveManagerActionLock(
        {
          pointer: { x: 190, y: 190 },
          cardCenter: { x: 500, y: 500 },
        },
        {
          root,
          previousActionId: lock.actionId,
          lastDirectHitAt: lock.lastDirectHitAt,
          now: 500,
        },
      ),
    ).toEqual(lock);
    expect(
      resolveManagerActionLock(
        {
          pointer: { x: 220, y: 220 },
          cardCenter: { x: 500, y: 500 },
        },
        {
          root,
          previousActionId: lock.actionId,
          lastDirectHitAt: lock.lastDirectHitAt,
          now: 221,
        },
      ),
    ).toEqual({
      actionId: null,
      lastDirectHitAt: 100,
    });
    expect(
      resolveManagerActionLock(
        {
          pointer: { x: 260, y: 260 },
          cardCenter: { x: 500, y: 500 },
        },
        {
          root,
          previousActionId: lock.actionId,
          lastDirectHitAt: lock.lastDirectHitAt,
          now: 180,
        },
      ),
    ).toEqual({
      actionId: null,
      lastDirectHitAt: 100,
    });
  });
});
