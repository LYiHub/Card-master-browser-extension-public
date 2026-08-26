import { describe, expect, it, vi } from 'vitest';

import { createRunAtScheduler } from './run-at-scheduler';

function schedulerHarness(readyState: DocumentReadyState = 'complete') {
  let domReady: (() => void) | null = null;
  const documentRef = {
    body: {} as HTMLElement,
    documentElement: {} as HTMLElement,
    readyState,
    addEventListener: vi.fn(
      (_type: string, listener: EventListenerOrEventListenerObject) => {
        domReady =
          typeof listener === 'function'
            ? () => listener(new Event('DOMContentLoaded'))
            : () => listener.handleEvent(new Event('DOMContentLoaded'));
      },
    ),
  };
  let idle: (() => void) | null = null;
  const windowRef = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout: vi.fn((callback: TimerHandler) => {
      if (typeof callback === 'function') callback();
      return 1;
    }),
    requestIdleCallback: vi.fn((callback: IdleRequestCallback) => {
      idle = () =>
        callback({
          didTimeout: false,
          timeRemaining: () => 16,
        });
      return 1;
    }),
  };
  return {
    schedule: createRunAtScheduler(documentRef, windowRef),
    dispatchDomReady: () => domReady?.(),
    dispatchIdle: () => idle?.(),
  };
}

describe('run-at scheduler', () => {
  it('runs document-start and an existing body without waiting', async () => {
    const harness = schedulerHarness();
    await expect(harness.schedule('document-start')).resolves.toBeUndefined();
    await expect(harness.schedule('document-body')).resolves.toBeUndefined();
  });

  it('waits for DOMContentLoaded at document-end', async () => {
    const harness = schedulerHarness('loading');
    let settled = false;
    const scheduled = harness.schedule('document-end').then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    harness.dispatchDomReady();
    await scheduled;
    expect(settled).toBe(true);
  });

  it('adds an idle boundary after document-end', async () => {
    const harness = schedulerHarness();
    let settled = false;
    const scheduled = harness.schedule('document-idle').then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    harness.dispatchIdle();
    await scheduled;
    expect(settled).toBe(true);
  });
});
