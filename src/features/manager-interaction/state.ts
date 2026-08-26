export type ManagerState<DetailMode extends string> =
  | { mode: 'closed' | 'dealing' | 'spread' }
  | { mode: 'reordering'; cardId: string }
  | { mode: 'dragging' | 'targeting'; cardId: string; actionId: string | null }
  | { mode: 'element-targeting'; cardId: string; actionId: string }
  | { mode: 'resolving'; cardId: string; actionId: string }
  | { mode: 'returning'; cardId: string }
  | {
      mode: 'detail';
      cardId: string;
      detail: DetailMode;
      returnTo: 'closed' | 'spread';
    }
  | { mode: 'forging'; cardId: string }
  | { mode: 'collecting'; collection: { kind: 'dismiss' } }
  | {
      mode: 'collecting';
      collection: {
        kind: 'cast';
        cardId: string;
        actionId: string;
        phase: 'charging' | 'returning';
      };
    };

export type ManagerMode = ManagerState<string>['mode'];

export type CardCollectionRole =
  | 'member'
  | 'dismiss-closer'
  | 'cast-deferred'
  | 'cast-closer';

export type ManagerEvent<DetailMode extends string> =
  | { type: 'deal' }
  | { type: 'showSpread' }
  | { type: 'collect' }
  | { type: 'close' }
  | { type: 'reorder'; cardId: string }
  | { type: 'dragAction'; cardId: string }
  | { type: 'target'; cardId: string }
  | { type: 'targetElement'; cardId: string; actionId: string }
  | { type: 'hoverAction'; actionId: string | null }
  | { type: 'resolve'; cardId: string; actionId: string }
  | { type: 'continueTargeting'; cardId: string; actionId: string }
  | { type: 'returnCard'; cardId: string }
  | { type: 'completeReturn'; cardId: string }
  | { type: 'openDetail'; cardId: string; detail: DetailMode }
  | { type: 'closeDetail' }
  | { type: 'forge'; cardId: string }
  | { type: 'startCast'; cardId: string; actionId: string }
  | { type: 'returnCast' }
  | { type: 'recover' };

export function initialManagerState<
  DetailMode extends string,
>(): ManagerState<DetailMode> {
  return { mode: 'closed' };
}

function invalidTransition<DetailMode extends string>(
  state: ManagerState<DetailMode>,
  event: ManagerEvent<DetailMode>,
): never {
  throw new Error(`Invalid manager transition: ${state.mode} -> ${event.type}`);
}

export function managerStateReducer<DetailMode extends string>(
  state: ManagerState<DetailMode>,
  event: ManagerEvent<DetailMode>,
): ManagerState<DetailMode> {
  switch (event.type) {
    case 'deal':
      return state.mode === 'closed'
        ? { mode: 'dealing' }
        : invalidTransition(state, event);
    case 'showSpread':
      return state.mode === 'dealing' ||
        state.mode === 'spread' ||
        state.mode === 'reordering' ||
        state.mode === 'dragging' ||
        state.mode === 'targeting' ||
        state.mode === 'element-targeting' ||
        state.mode === 'resolving' ||
        state.mode === 'detail' ||
        state.mode === 'forging'
        ? { mode: 'spread' }
        : invalidTransition(state, event);
    case 'collect':
      return state.mode === 'dealing' ||
        state.mode === 'spread' ||
        state.mode === 'reordering' ||
        state.mode === 'dragging' ||
        state.mode === 'targeting' ||
        state.mode === 'element-targeting' ||
        state.mode === 'resolving'
        ? { mode: 'collecting', collection: { kind: 'dismiss' } }
        : invalidTransition(state, event);
    case 'close':
      return state.mode === 'collecting'
        ? { mode: 'closed' }
        : invalidTransition(state, event);
    case 'reorder':
      return state.mode === 'spread' || state.mode === 'dragging'
        ? { mode: 'reordering', cardId: event.cardId }
        : invalidTransition(state, event);
    case 'dragAction':
      return state.mode === 'reordering' && state.cardId === event.cardId
        ? { mode: 'dragging', cardId: event.cardId, actionId: null }
        : invalidTransition(state, event);
    case 'target':
      return state.mode === 'spread'
        ? { mode: 'targeting', cardId: event.cardId, actionId: null }
        : invalidTransition(state, event);
    case 'targetElement':
      return (state.mode === 'dragging' || state.mode === 'targeting') &&
        state.cardId === event.cardId
        ? {
            mode: 'element-targeting',
            cardId: event.cardId,
            actionId: event.actionId,
          }
        : invalidTransition(state, event);
    case 'hoverAction':
      return state.mode === 'dragging' || state.mode === 'targeting'
        ? state.actionId === event.actionId
          ? state
          : { ...state, actionId: event.actionId }
        : state;
    case 'resolve':
      return ((state.mode === 'dragging' || state.mode === 'targeting') &&
        state.cardId === event.cardId) ||
        (state.mode === 'element-targeting' &&
          state.cardId === event.cardId &&
          state.actionId === event.actionId)
        ? {
            mode: 'resolving',
            cardId: event.cardId,
            actionId: event.actionId,
          }
        : invalidTransition(state, event);
    case 'continueTargeting':
      return state.mode === 'resolving' &&
        state.cardId === event.cardId &&
        state.actionId === event.actionId
        ? {
            mode: 'element-targeting',
            cardId: event.cardId,
            actionId: event.actionId,
          }
        : invalidTransition(state, event);
    case 'returnCard':
      return (state.mode === 'reordering' ||
        state.mode === 'dragging' ||
        state.mode === 'targeting' ||
        state.mode === 'element-targeting' ||
        state.mode === 'resolving' ||
        state.mode === 'detail') &&
        state.cardId === event.cardId
        ? { mode: 'returning', cardId: event.cardId }
        : invalidTransition(state, event);
    case 'completeReturn':
      return state.mode === 'returning' && state.cardId === event.cardId
        ? { mode: 'spread' }
        : invalidTransition(state, event);
    case 'openDetail':
      if (state.mode === 'closed') {
        return {
          mode: 'detail',
          cardId: event.cardId,
          detail: event.detail,
          returnTo: 'closed',
        };
      }
      return state.mode === 'spread' ||
        (state.mode === 'resolving' && state.cardId === event.cardId)
        ? {
            mode: 'detail',
            cardId: event.cardId,
            detail: event.detail,
            returnTo: 'spread',
          }
        : invalidTransition(state, event);
    case 'closeDetail':
      return state.mode === 'detail'
        ? { mode: state.returnTo }
        : invalidTransition(state, event);
    case 'forge':
      return state.mode === 'detail'
        ? { mode: 'forging', cardId: event.cardId }
        : invalidTransition(state, event);
    case 'startCast':
      return state.mode === 'resolving' && state.cardId === event.cardId
        ? {
            mode: 'collecting',
            collection: {
              kind: 'cast',
              cardId: event.cardId,
              actionId: event.actionId,
              phase: 'charging',
            },
          }
        : invalidTransition(state, event);
    case 'returnCast':
      return state.mode === 'collecting' &&
        state.collection.kind === 'cast' &&
        state.collection.phase === 'charging'
        ? {
            ...state,
            collection: { ...state.collection, phase: 'returning' },
          }
        : invalidTransition(state, event);
    case 'recover':
      return state.mode === 'closed' ? state : { mode: 'spread' };
  }
}

export function selectedCardId<DetailMode extends string>(
  state: ManagerState<DetailMode>,
) {
  if ('cardId' in state) return state.cardId;
  if (state.mode === 'collecting' && state.collection.kind === 'cast') {
    return state.collection.cardId;
  }
  return null;
}

export function hoveredActionId<DetailMode extends string>(
  state: ManagerState<DetailMode>,
) {
  return state.mode === 'dragging' || state.mode === 'targeting'
    ? state.actionId
    : null;
}

export function resolvingActionId<DetailMode extends string>(
  state: ManagerState<DetailMode>,
) {
  if (state.mode === 'resolving' || state.mode === 'element-targeting') {
    return state.actionId;
  }
  if (
    state.mode === 'collecting' &&
    state.collection.kind === 'cast' &&
    state.collection.phase === 'charging'
  ) {
    return state.collection.actionId;
  }
  return null;
}

export function castingCollection<DetailMode extends string>(
  state: ManagerState<DetailMode>,
) {
  return state.mode === 'collecting' && state.collection.kind === 'cast'
    ? state.collection
    : null;
}

export function cardCollectionRole<DetailMode extends string>(
  state: ManagerState<DetailMode>,
  cardId: string,
  index: number,
): CardCollectionRole {
  const casting = castingCollection(state);
  if (!casting) return index === 0 ? 'dismiss-closer' : 'member';
  if (casting.cardId !== cardId) return 'member';
  return casting.phase === 'charging' ? 'cast-deferred' : 'cast-closer';
}

export function detailMode<DetailMode extends string>(
  state: ManagerState<DetailMode>,
) {
  return state.mode === 'detail' ? state.detail : null;
}

export function detailReturnMode<DetailMode extends string>(
  state: ManagerState<DetailMode>,
) {
  return state.mode === 'detail' ? state.returnTo : null;
}
