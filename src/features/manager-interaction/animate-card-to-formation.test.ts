import { describe, expect, it } from 'vitest';

import { cardReturnMotion } from './animate-card-to-formation';

describe('cardReturnMotion', () => {
  it('keeps the shared return path anchored to the requested formation', () => {
    const layout = {
      x: 640,
      y: 420,
      rotation: -4,
      scale: 0.92,
    };
    const motion = cardReturnMotion(260, 180, layout);

    expect(motion.duration).toBeGreaterThanOrEqual(0.64);
    expect(motion.duration).toBeLessThanOrEqual(0.9);
    expect(motion.path).toHaveLength(3);
    expect(motion.path[0]?.x).toBeLessThan(260);
    expect(motion.path[1]?.x).toBeLessThan(layout.x);
    expect(motion.path[motion.path.length - 1]).toEqual({
      x: layout.x,
      y: layout.y,
    });
  });
});
