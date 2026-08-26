import { describe, expect, it } from 'vitest';

import {
  cardCollectionRole,
  castingCollection,
  detailReturnMode,
  hoveredActionId,
  initialManagerState,
  managerStateReducer,
  resolvingActionId,
  selectedCardId,
} from './state';

const INITIAL_MANAGER_STATE = initialManagerState<'manage' | 'create'>();

describe('manager interaction state', () => {
  it('models deal and dismissal as complete states', () => {
    const dealing = managerStateReducer(INITIAL_MANAGER_STATE, {
      type: 'deal',
    });
    const spread = managerStateReducer(dealing, { type: 'showSpread' });
    const collecting = managerStateReducer(spread, { type: 'collect' });
    const closed = managerStateReducer(collecting, { type: 'close' });

    expect(closed).toEqual({ mode: 'closed' });
  });

  it('collects immediately while cards are still dealing', () => {
    expect(
      managerStateReducer({ mode: 'dealing' }, { type: 'collect' }),
    ).toEqual({
      mode: 'collecting',
      collection: { kind: 'dismiss' },
    });
  });

  it('keeps card and action identity through targeting and resolution', () => {
    const targeting = managerStateReducer(
      { mode: 'spread' },
      { type: 'target', cardId: 'script-1' },
    );
    const hovering = managerStateReducer(targeting, {
      type: 'hoverAction',
      actionId: 'command:primary',
    });
    const resolving = managerStateReducer(hovering, {
      type: 'resolve',
      cardId: 'script-1',
      actionId: 'command:primary',
    });

    expect(selectedCardId(hovering)).toBe('script-1');
    expect(hoveredActionId(hovering)).toBe('command:primary');
    expect(resolvingActionId(resolving)).toBe('command:primary');
  });

  it('keeps the selected card explicit until its return animation completes', () => {
    const returning = managerStateReducer(
      { mode: 'targeting', cardId: 'script-1', actionId: null },
      { type: 'returnCard', cardId: 'script-1' },
    );

    expect(returning).toEqual({ mode: 'returning', cardId: 'script-1' });
    expect(selectedCardId(returning)).toBe('script-1');
    expect(
      managerStateReducer(returning, {
        type: 'completeReturn',
        cardId: 'script-1',
      }),
    ).toEqual({ mode: 'spread' });
  });

  it('uses the same return state when a reorder gesture is cancelled', () => {
    expect(
      managerStateReducer(
        { mode: 'reordering', cardId: 'script-1' },
        { type: 'returnCard', cardId: 'script-1' },
      ),
    ).toEqual({ mode: 'returning', cardId: 'script-1' });
  });

  it('collects the deck directly after resolving an action', () => {
    const collecting = managerStateReducer(
      {
        mode: 'resolving',
        cardId: 'steward',
        actionId: 'script-workshop',
      },
      { type: 'collect' },
    );

    expect(collecting).toEqual({
      mode: 'collecting',
      collection: { kind: 'dismiss' },
    });
  });

  it('opens a direct detail surface from the closed deck and returns closed', () => {
    const detail = managerStateReducer(INITIAL_MANAGER_STATE, {
      type: 'openDetail',
      cardId: 'system-media-resources',
      detail: 'manage',
    });

    expect(detail).toEqual({
      mode: 'detail',
      cardId: 'system-media-resources',
      detail: 'manage',
      returnTo: 'closed',
    });
    expect(detailReturnMode(detail)).toBe('closed');
    expect(managerStateReducer(detail, { type: 'closeDetail' })).toEqual({
      mode: 'closed',
    });
  });

  it('returns card-opened detail surfaces to the spread', () => {
    const detail = managerStateReducer(
      {
        mode: 'resolving',
        cardId: 'script-1',
        actionId: 'manage',
      },
      {
        type: 'openDetail',
        cardId: 'script-1',
        detail: 'manage',
      },
    );

    expect(detailReturnMode(detail)).toBe('spread');
    expect(managerStateReducer(detail, { type: 'closeDetail' })).toEqual({
      mode: 'spread',
    });
  });

  it('opens a library-selected detail surface directly from the spread', () => {
    const detail = managerStateReducer(
      { mode: 'spread' },
      {
        type: 'openDetail',
        cardId: 'script-1',
        detail: 'manage',
      },
    );

    expect(detail).toEqual({
      mode: 'detail',
      cardId: 'script-1',
      detail: 'manage',
      returnTo: 'spread',
    });
  });

  it('keeps the chosen ability while selecting a page element', () => {
    const targeting = managerStateReducer(
      { mode: 'targeting', cardId: 'blocker', actionId: null },
      {
        type: 'targetElement',
        cardId: 'blocker',
        actionId: 'block-element',
      },
    );
    const resolving = managerStateReducer(targeting, {
      type: 'resolve',
      cardId: 'blocker',
      actionId: 'block-element',
    });

    expect(selectedCardId(targeting)).toBe('blocker');
    expect(resolvingActionId(targeting)).toBe('block-element');
    expect(resolving).toEqual({
      mode: 'resolving',
      cardId: 'blocker',
      actionId: 'block-element',
    });
    expect(
      managerStateReducer(resolving, {
        type: 'continueTargeting',
        cardId: 'blocker',
        actionId: 'block-element',
      }),
    ).toEqual({
      mode: 'element-targeting',
      cardId: 'blocker',
      actionId: 'block-element',
    });
  });

  it('stages a cast before the casting card returns', () => {
    const resolving = {
      mode: 'resolving',
      cardId: 'script-1',
      actionId: 'command:primary',
    } as const;
    const charging = managerStateReducer(resolving, {
      type: 'startCast',
      cardId: 'script-1',
      actionId: 'command:primary',
    });
    const returning = managerStateReducer(charging, { type: 'returnCast' });

    expect(castingCollection(charging)?.phase).toBe('charging');
    expect(cardCollectionRole(charging, 'script-1', 4)).toBe('cast-deferred');
    expect(cardCollectionRole(charging, 'script-2', 0)).toBe('member');
    expect(resolvingActionId(charging)).toBe('command:primary');
    expect(castingCollection(returning)?.phase).toBe('returning');
    expect(cardCollectionRole(returning, 'script-1', 4)).toBe('cast-closer');
    expect(resolvingActionId(returning)).toBeNull();
  });

  it('recovers an interrupted cast without violating the lifecycle', () => {
    const charging = managerStateReducer(
      {
        mode: 'resolving',
        cardId: 'blocker',
        actionId: 'block-element',
      },
      {
        type: 'startCast',
        cardId: 'blocker',
        actionId: 'block-element',
      },
    );

    expect(managerStateReducer(charging, { type: 'recover' })).toEqual({
      mode: 'spread',
    });
    expect(() => managerStateReducer(charging, { type: 'showSpread' })).toThrow(
      'Invalid manager transition: collecting -> showSpread',
    );
    expect(
      managerStateReducer(INITIAL_MANAGER_STATE, { type: 'recover' }),
    ).toBe(INITIAL_MANAGER_STATE);
  });

  it('fails loudly when a lifecycle transition is invalid', () => {
    expect(() =>
      managerStateReducer(INITIAL_MANAGER_STATE, { type: 'returnCast' }),
    ).toThrow('Invalid manager transition');
  });
});
