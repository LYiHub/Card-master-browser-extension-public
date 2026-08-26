import { systemCardDefinition } from './catalog';

export type SystemCardRuntimeStatus = 'idle' | 'starting' | 'ready' | 'error';

export type SystemCardState = Readonly<{
  id: string;
  available: boolean;
  enabled: boolean;
  activeOnPage: boolean;
  hidden: boolean;
  visible: boolean;
  active: boolean;
  runtime: SystemCardRuntimeStatus;
}>;

export function systemCardVisible(
  cardId: string,
  hiddenCardIds: ReadonlySet<string>,
) {
  const definition = systemCardDefinition(cardId);
  return !definition.hideable || !hiddenCardIds.has(cardId);
}

export function createSystemCardState({
  id,
  available = true,
  enabled = true,
  activeOnPage = true,
  runtime = 'ready',
  hiddenCardIds = [],
}: {
  id: string;
  available?: boolean;
  enabled?: boolean;
  activeOnPage?: boolean;
  runtime?: SystemCardRuntimeStatus;
  hiddenCardIds?: readonly string[] | ReadonlySet<string>;
}): SystemCardState {
  const hidden =
    hiddenCardIds instanceof Set ? hiddenCardIds : new Set(hiddenCardIds);
  const visible = available && systemCardVisible(id, hidden);
  return {
    id,
    available,
    enabled,
    activeOnPage,
    hidden: hidden.has(id),
    visible,
    active:
      visible &&
      enabled &&
      activeOnPage &&
      runtime !== 'starting' &&
      runtime !== 'error',
    runtime,
  };
}

export function summarizeSystemCardStates(states: readonly SystemCardState[]) {
  return {
    visibleCount: states.filter((state) => state.visible).length,
    activeCount: states.filter((state) => state.active).length,
  };
}
