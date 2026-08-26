import { describe, expect, it, vi } from 'vitest';

import {
  createPageTargetFrameTracker,
  pageTargetFrameGeometry,
} from './page-target-frame';

describe('page target frame geometry', () => {
  it('matches the selected element without adding padding or rounded geometry', () => {
    expect(
      pageTargetFrameGeometry(
        { top: 40, left: 60, width: 120, height: 50 },
        { width: 800, height: 600 },
      ),
    ).toEqual({
      x: 60,
      y: 40,
      width: 120,
      height: 50,
    });
  });

  it('clips large targets to the visible viewport', () => {
    expect(
      pageTargetFrameGeometry(
        { top: -40, left: -80, width: 1_200, height: 900 },
        { width: 800, height: 600 },
      ),
    ).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
  });

  it('rejects targets that cannot produce a visible frame', () => {
    expect(
      pageTargetFrameGeometry(
        { top: 12, left: 18, width: 1, height: 20 },
        { width: 800, height: 600 },
      ),
    ).toBeNull();
  });
});

describe('page target frame tracker', () => {
  function harness() {
    let frame = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    const view = {
      innerWidth: 800,
      innerHeight: 600,
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        const id = ++frame;
        callbacks.set(id, callback);
        return id;
      }),
      cancelAnimationFrame: vi.fn((id: number) => callbacks.delete(id)),
    };
    return {
      view,
      tick() {
        const pending = [...callbacks.entries()];
        callbacks.clear();
        for (const [id, callback] of pending) callback(id);
      },
      pending() {
        return callbacks.size;
      },
    };
  }

  it('tracks live geometry without duplicate notifications', () => {
    const runtime = harness();
    let bounds = { top: 40, left: 60, width: 120, height: 50 };
    let connected = true;
    const target = {
      get isConnected() {
        return connected;
      },
      getBoundingClientRect: () => bounds as DOMRect,
    } as Element;
    const publish = vi.fn();
    const tracker = createPageTargetFrameTracker(runtime.view, publish);

    tracker.setTarget(target);
    expect(publish).toHaveBeenCalledOnce();
    runtime.tick();
    expect(publish).toHaveBeenCalledOnce();

    bounds = { ...bounds, left: 90 };
    runtime.tick();
    expect(publish).toHaveBeenLastCalledWith({
      target,
      geometry: { x: 90, y: 40, width: 120, height: 50 },
      targetChanged: false,
    });
    connected = false;
    runtime.tick();
    expect(publish).toHaveBeenLastCalledWith({
      target: null,
      geometry: null,
      targetChanged: true,
    });
    expect(runtime.pending()).toBe(0);
  });

  it('cancels its only scheduled frame when disposed', () => {
    const runtime = harness();
    const target = {
      isConnected: true,
      getBoundingClientRect: () =>
        ({ top: 0, left: 0, width: 20, height: 20 }) as DOMRect,
    } as Element;
    const tracker = createPageTargetFrameTracker(runtime.view, vi.fn());

    tracker.setTarget(target);
    expect(runtime.pending()).toBe(1);
    tracker.dispose();
    expect(runtime.pending()).toBe(0);
  });
});
