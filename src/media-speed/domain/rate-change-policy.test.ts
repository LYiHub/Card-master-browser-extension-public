import { describe, expect, it } from 'vitest';

import {
  MEDIA_SPEED_LOCK_MAX_RETRIES,
  mediaSpeedConsumeWriteEcho,
  mediaSpeedRateChangeDecision,
  mediaSpeedWriteEchoMatches,
} from './rate-change-policy';

const input = {
  active: true,
  eligible: true,
  ownChange: false,
  readyState: 4,
  currentRate: 1.5,
  targetRate: 2,
  lockSpeed: false,
  retryCount: 0,
};

describe('media speed rate change policy', () => {
  it('matches only the exact playback-rate echo written by the extension', () => {
    expect(mediaSpeedWriteEchoMatches(2, 2)).toBe(true);
    expect(mediaSpeedWriteEchoMatches(2, 2.0005)).toBe(true);
    expect(mediaSpeedWriteEchoMatches(2, 1.5)).toBe(false);
    expect(mediaSpeedWriteEchoMatches(undefined, 2)).toBe(false);
  });

  it('consumes matching extension echoes without losing newer generations', () => {
    expect(
      mediaSpeedConsumeWriteEcho(
        [
          { generation: 4, rate: 1.5 },
          { generation: 5, rate: 2 },
        ],
        1.5,
      ),
    ).toEqual({
      ownChange: true,
      pending: [{ generation: 5, rate: 2 }],
    });
  });

  it('releases inactive pages without forcing normal speed', () => {
    expect(mediaSpeedRateChangeDecision({ ...input, active: false })).toBe(
      'ignore',
    );
  });

  it('never treats an external rate change as durable selection state', () => {
    expect(mediaSpeedRateChangeDecision(input)).toBe('release');
  });

  it('bounds locked-site retries and eventually surrenders', () => {
    expect(mediaSpeedRateChangeDecision({ ...input, lockSpeed: true })).toBe(
      'restore',
    );
    expect(
      mediaSpeedRateChangeDecision({
        ...input,
        lockSpeed: true,
        retryCount: MEDIA_SPEED_LOCK_MAX_RETRIES,
      }),
    ).toBe('surrender');
  });
});
