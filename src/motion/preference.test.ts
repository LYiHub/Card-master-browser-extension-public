import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  observeReducedMotion,
  prefersReducedMotion,
  REDUCED_MOTION_QUERY,
} from './preference';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('motion preference', () => {
  it('defaults to full motion without a browser media query', () => {
    vi.stubGlobal('window', {});
    expect(prefersReducedMotion()).toBe(false);
  });

  it('reads and observes the browser reduced-motion preference', () => {
    const listeners = new Set<() => void>();
    const media = {
      matches: true,
      addEventListener: (_type: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        listeners.delete(listener),
    };
    const matchMedia = vi.fn(() => media);
    vi.stubGlobal('window', { matchMedia });
    const listener = vi.fn();

    const stop = observeReducedMotion(listener);

    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
    expect(prefersReducedMotion()).toBe(true);
    expect(listener).toHaveBeenLastCalledWith(true);

    media.matches = false;
    for (const notify of listeners) notify();
    expect(listener).toHaveBeenLastCalledWith(false);

    stop();
    expect(listeners).toHaveLength(0);
  });
});
