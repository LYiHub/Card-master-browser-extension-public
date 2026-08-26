import { describe, expect, it } from 'vitest';

import { DECK_STEWARD_CARD_ID, NEW_TAB_CARD_ID } from './catalog';
import { createSystemCardState, summarizeSystemCardStates } from './state';

describe('system card state', () => {
  it('separates hidden, visible and active states', () => {
    expect(
      createSystemCardState({
        id: NEW_TAB_CARD_ID,
        hiddenCardIds: [NEW_TAB_CARD_ID],
      }),
    ).toMatchObject({
      hidden: true,
      visible: false,
      active: false,
    });
  });

  it('allows the steward card to be hidden from the spread', () => {
    expect(
      createSystemCardState({
        id: DECK_STEWARD_CARD_ID,
        hiddenCardIds: [DECK_STEWARD_CARD_ID],
      }),
    ).toMatchObject({
      hidden: true,
      visible: false,
      active: false,
    });
  });

  it('counts visible and active cards independently', () => {
    expect(
      summarizeSystemCardStates([
        createSystemCardState({ id: DECK_STEWARD_CARD_ID }),
        createSystemCardState({
          id: NEW_TAB_CARD_ID,
          enabled: false,
        }),
      ]),
    ).toEqual({
      visibleCount: 2,
      activeCount: 1,
    });
  });
});
