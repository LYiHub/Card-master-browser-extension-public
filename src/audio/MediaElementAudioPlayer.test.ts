import { afterEach, describe, expect, it, vi } from 'vitest';

import { AUDIO_CUES } from './cues';
import {
  MediaElementAudioPlayer,
  mediaElementVoiceVolume,
} from './MediaElementAudioPlayer';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('media element audio mix', () => {
  it('applies global volume, channel level, cue gain, and ducking', () => {
    expect(
      mediaElementVoiceVolume(
        AUDIO_CUES.cardHover,
        { muted: false, volume: 0.8 },
        AUDIO_CUES.cardHover.gain,
        0.5,
      ),
    ).toBeCloseTo(0.8 * 0.76 * AUDIO_CUES.cardHover.gain * 0.5);
  });

  it('mutes globally without changing destructive-channel ducking', () => {
    expect(
      mediaElementVoiceVolume(
        AUDIO_CUES.cardBurn,
        { muted: true, volume: 0.8 },
        AUDIO_CUES.cardBurn.gain,
        0.5,
      ),
    ).toBe(0);
    expect(
      mediaElementVoiceVolume(
        AUDIO_CUES.cardBurn,
        { muted: false, volume: 0.8 },
        AUDIO_CUES.cardBurn.gain,
        0.5,
      ),
    ).toBeCloseTo(0.8 * 0.76 * AUDIO_CUES.cardBurn.gain);
  });

  it('sets an audible volume before starting an offscreen voice', async () => {
    const element = {
      addEventListener: vi.fn(),
      hidden: false,
      load: vi.fn(),
      muted: true,
      pause: vi.fn(),
      playbackRate: 1,
      play: vi.fn().mockResolvedValue(undefined),
      preload: '',
      preservesPitch: true,
      remove: vi.fn(),
      removeAttribute: vi.fn(),
      volume: 0,
    } as unknown as HTMLAudioElement;
    vi.stubGlobal('document', {
      body: { append: vi.fn() },
    });
    const player = new MediaElementAudioPlayer(() => element);
    player.applySettings({ muted: false, volume: 0.8 });

    await expect(player.play('cardHover')).resolves.toEqual({
      result: 'playing',
    });
    expect(element.volume).toBeGreaterThan(0);
    expect(element.play).toHaveBeenCalledOnce();
    player.destroy();
  });
});
