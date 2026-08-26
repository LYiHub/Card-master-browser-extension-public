import { describe, expect, it } from 'vitest';

import { supportsOffscreenAudioPlayback } from './audio-playback-transport';

describe('offscreen audio platform support', () => {
  it('enables Chromium browsers and excludes Firefox and Safari', () => {
    expect(
      supportsOffscreenAudioPlayback(
        'Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36',
      ),
    ).toBe(true);
    expect(supportsOffscreenAudioPlayback('Mozilla/5.0 Edg/135.0.0.0')).toBe(
      true,
    );
    expect(supportsOffscreenAudioPlayback('Mozilla/5.0 Firefox/153.0')).toBe(
      false,
    );
    expect(
      supportsOffscreenAudioPlayback(
        'Mozilla/5.0 Version/27.0 Safari/620.1.14',
      ),
    ).toBe(false);
  });
});
