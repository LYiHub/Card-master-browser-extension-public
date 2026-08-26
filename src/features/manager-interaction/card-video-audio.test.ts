import { describe, expect, it } from 'vitest';

import {
  CARD_VIDEO_AUDIO_INTERACTION_RELEASE_MS,
  CARD_VIDEO_AUDIO_RELEASE_MS,
  cardVideoAudioCurve,
  cardVideoLoopEnvelope,
  cardVideoOutputVolume,
} from './card-video-audio';

describe('card video audio envelope', () => {
  it('uses a bounded S-curve with quiet entry and a full-volume finish', () => {
    expect(cardVideoAudioCurve(-1)).toBe(0);
    expect(cardVideoAudioCurve(0.25)).toBeLessThan(0.25);
    expect(cardVideoAudioCurve(0.5)).toBe(0.5);
    expect(cardVideoAudioCurve(1)).toBe(1);
    expect(cardVideoAudioCurve(2)).toBe(1);
  });

  it('fades both sides of every native video loop to silence', () => {
    expect(cardVideoLoopEnvelope(0, 8)).toBe(0);
    expect(cardVideoLoopEnvelope(0.21, 8)).toBe(0.5);
    expect(cardVideoLoopEnvelope(1, 8)).toBe(1);
    expect(cardVideoLoopEnvelope(7.79, 8)).toBeCloseTo(0.5);
    expect(cardVideoLoopEnvelope(8, 8)).toBe(0);
  });

  it('combines global volume, interaction gain, and loop gain', () => {
    expect(cardVideoOutputVolume(0.8, 0.5, 1, 8)).toBeCloseTo(0.4);
    expect(cardVideoOutputVolume(0.8, 1, 0, 8)).toBe(0);
  });

  it('uses a longer release when card interaction takes ownership', () => {
    expect(CARD_VIDEO_AUDIO_INTERACTION_RELEASE_MS).toBeGreaterThan(
      CARD_VIDEO_AUDIO_RELEASE_MS,
    );
  });
});
