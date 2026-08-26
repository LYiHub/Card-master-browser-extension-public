import { describe, expect, it } from 'vitest';

import {
  mediaSpeedWheelFocusIsIntentional,
  mediaSpeedWheelPointerMoved,
} from './media-speed-wheel-intent';

describe('media speed wheel interaction intent', () => {
  it('ignores zero-motion pointer events emitted during window reactivation', () => {
    expect(mediaSpeedWheelPointerMoved(0, 0)).toBe(false);
    expect(mediaSpeedWheelPointerMoved(1, 0)).toBe(true);
    expect(mediaSpeedWheelPointerMoved(0, -1)).toBe(true);
  });

  it('only expands for an in-document keyboard focus transition', () => {
    const previousTarget = new EventTarget();

    expect(mediaSpeedWheelFocusIsIntentional(null, true)).toBe(false);
    expect(mediaSpeedWheelFocusIsIntentional(previousTarget, false)).toBe(
      false,
    );
    expect(mediaSpeedWheelFocusIsIntentional(previousTarget, true)).toBe(true);
  });
});
