import { describe, expect, it } from 'vitest';

import {
  assessMediaSpeedVisibleVideo,
  MEDIA_SPEED_TARGET_MIN_HEIGHT,
  MEDIA_SPEED_TARGET_MIN_WIDTH,
} from './visible-video';

const viewport = { width: 1_280, height: 720 };
const visibleInput = {
  connected: true,
  display: 'block',
  visibility: 'visible',
  opacity: 1,
  cssVisible: true,
  bounds: {
    left: 100,
    top: 100,
    right: 740,
    bottom: 460,
    width: 640,
    height: 360,
  },
  viewport,
};

describe('visible media speed video', () => {
  it('accepts a visible video large enough for the projectile target', () => {
    expect(assessMediaSpeedVisibleVideo(visibleInput)).toMatchObject({
      eligible: true,
      decision: 'eligible',
      visible: { left: 100, top: 100, width: 640, height: 360 },
    });
  });

  it.each([
    [{ connected: false }, 'detached'],
    [{ display: 'none' }, 'display-none'],
    [{ visibility: 'hidden' }, 'visibility-hidden'],
    [{ opacity: 0 }, 'opacity-zero'],
    [{ cssVisible: false }, 'css-hidden'],
  ] as const)('rejects hidden videos as %s', (override, decision) => {
    expect(
      assessMediaSpeedVisibleVideo({ ...visibleInput, ...override }),
    ).toMatchObject({ eligible: false, decision });
  });

  it('uses the visible viewport intersection rather than full element size', () => {
    const assessment = assessMediaSpeedVisibleVideo({
      ...visibleInput,
      bounds: {
        left: viewport.width - MEDIA_SPEED_TARGET_MIN_WIDTH,
        top: viewport.height - MEDIA_SPEED_TARGET_MIN_HEIGHT,
        right: viewport.width + 600,
        bottom: viewport.height + 300,
        width: 648,
        height: 336,
      },
    });

    expect(assessment).toMatchObject({
      eligible: true,
      visible: {
        width: MEDIA_SPEED_TARGET_MIN_WIDTH,
        height: MEDIA_SPEED_TARGET_MIN_HEIGHT,
      },
    });
  });

  it('rejects offscreen and undersized viewport intersections', () => {
    expect(
      assessMediaSpeedVisibleVideo({
        ...visibleInput,
        bounds: {
          left: viewport.width - MEDIA_SPEED_TARGET_MIN_WIDTH + 1,
          top: viewport.height - MEDIA_SPEED_TARGET_MIN_HEIGHT + 1,
          right: viewport.width + 600,
          bottom: viewport.height + 300,
          width: 647,
          height: 335,
        },
      }),
    ).toMatchObject({
      eligible: false,
      decision: 'too-small-or-offscreen',
    });

    expect(
      assessMediaSpeedVisibleVideo({
        ...visibleInput,
        bounds: {
          left: viewport.width + 10,
          top: 100,
          right: viewport.width + 650,
          bottom: 460,
          width: 640,
          height: 360,
        },
      }),
    ).toMatchObject({
      eligible: false,
      decision: 'too-small-or-offscreen',
      visible: { width: 0 },
    });
  });
});
