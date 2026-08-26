export const CARD_RETREAT_DURATION_SECONDS = 0.68;
export const CARD_RETREAT_STAGGER_SECONDS = 0.038;

export function cardRetreatSequenceDurationMs(cardCount: number) {
  const staggeredCards = Math.max(0, Math.floor(cardCount) - 1);
  return Math.ceil(
    (CARD_RETREAT_DURATION_SECONDS +
      staggeredCards * CARD_RETREAT_STAGGER_SECONDS) *
      1_000,
  );
}
