import { describe, expect, it } from 'vitest';

import {
  MEDIA_SPEED_HELL_RATE,
  mediaSpeedPlaybackRate,
  setMediaPlaybackRate,
} from './playback-rate';

describe('media speed playback rate', () => {
  it('uses native 16x playback for hell mode', () => {
    expect(MEDIA_SPEED_HELL_RATE).toBe(16);
    expect(mediaSpeedPlaybackRate(true, { mode: 'hell' })).toBe(16);
  });

  it('returns the selected standard rate only while active', () => {
    expect(mediaSpeedPlaybackRate(true, { mode: 'standard', speed: 2.5 })).toBe(
      2.5,
    );
    expect(
      mediaSpeedPlaybackRate(false, { mode: 'standard', speed: 2.5 }),
    ).toBe(1);
  });

  it('writes the native playback rate used by both video and audio elements', () => {
    const video = { playbackRate: 1 };
    const audio = { playbackRate: 1 };

    expect(setMediaPlaybackRate(video, 2)).toBe(true);
    expect(setMediaPlaybackRate(audio, 1.5)).toBe(true);
    expect(video.playbackRate).toBe(2);
    expect(audio.playbackRate).toBe(1.5);
    expect(setMediaPlaybackRate(audio, 1.5)).toBe(false);
  });
});
