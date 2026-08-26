export const DECK_ENTRY_BADGE_MAX_COUNT = 99;

function normalizedBadgeCount(count: number) {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

export function deckEntryBadgeText(count: number) {
  return String(
    Math.min(DECK_ENTRY_BADGE_MAX_COUNT, normalizedBadgeCount(count)),
  );
}

export function deckEntryBadgeCompact(count: number) {
  return normalizedBadgeCount(count) >= 10;
}
