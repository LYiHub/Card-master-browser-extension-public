/**
 * Compact adapter of Video Speed Controller's media-local write echo and
 * bounded conflict rules, with Speeder's rule that external ratechange events
 * never become durable settings. See upstreams.json for pinned revisions.
 */
export const MEDIA_SPEED_LOCK_MAX_RETRIES = 5;

export type MediaSpeedPendingWrite = {
  generation: number;
  rate: number;
};

export type MediaSpeedRateChangeDecision =
  | 'ignore'
  | 'release'
  | 'restore'
  | 'surrender';

export function mediaSpeedWriteEchoMatches(
  expectedRate: number | undefined,
  currentRate: number,
) {
  return (
    expectedRate !== undefined &&
    Number.isFinite(expectedRate) &&
    Number.isFinite(currentRate) &&
    Math.abs(expectedRate - currentRate) <= 0.001
  );
}

export function mediaSpeedConsumeWriteEcho(
  pending: readonly MediaSpeedPendingWrite[],
  currentRate: number,
) {
  const index = pending.findIndex(({ rate }) =>
    mediaSpeedWriteEchoMatches(rate, currentRate),
  );
  return {
    ownChange: index >= 0,
    pending: index < 0 ? [...pending] : pending.filter((_, i) => i !== index),
  };
}

export function mediaSpeedRateChangeDecision({
  active,
  eligible,
  ownChange,
  readyState,
  currentRate,
  targetRate,
  lockSpeed,
  retryCount,
}: {
  active: boolean;
  eligible: boolean;
  ownChange: boolean;
  readyState: number;
  currentRate: number;
  targetRate: number;
  lockSpeed: boolean;
  retryCount: number;
}): MediaSpeedRateChangeDecision {
  if (
    !active ||
    !eligible ||
    ownChange ||
    !Number.isFinite(currentRate) ||
    Math.abs(currentRate - targetRate) <= 0.001
  ) {
    return 'ignore';
  }
  if (!lockSpeed || readyState < 1) return 'release';
  return retryCount >= MEDIA_SPEED_LOCK_MAX_RETRIES ? 'surrender' : 'restore';
}
