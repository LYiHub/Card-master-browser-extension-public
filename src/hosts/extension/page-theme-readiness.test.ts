import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  dynamicPageThemeVisualReady,
  waitForDynamicPageThemeVisualReady,
} from './page-theme-readiness';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function readinessDocument({
  mode = 'dynamic',
  scheme = 'dark',
  fallback = '',
}: {
  mode?: string | null;
  scheme?: string | null;
  fallback?: string | null;
}) {
  const attributes = new Map<string, string>();
  if (mode) attributes.set('data-darkreader-mode', mode);
  if (scheme) attributes.set('data-darkreader-scheme', scheme);
  const fallbackStyle = fallback === null ? null : { textContent: fallback };
  return {
    documentElement: {
      getAttribute: (name: string) => attributes.get(name) ?? null,
    },
    querySelector: (selector: string) =>
      selector === '.darkreader--fallback' ? fallbackStyle : null,
  } as unknown as Document;
}

describe('page theme visual readiness', () => {
  it('accepts only the requested dynamic scheme after its fallback is cleared', () => {
    expect(
      dynamicPageThemeVisualReady(
        readinessDocument({ fallback: 'html { background: #181a1b; }' }),
        1,
      ),
    ).toBe(false);
    expect(
      dynamicPageThemeVisualReady(readinessDocument({ fallback: '' }), 1),
    ).toBe(true);
    expect(
      dynamicPageThemeVisualReady(
        readinessDocument({ scheme: 'dimmed', fallback: '' }),
        1,
      ),
    ).toBe(false);
  });

  it('waits for Dark Reader to clear the fallback instead of using a fixed delay', async () => {
    vi.useFakeTimers();
    let fallback = 'html { background: #181a1b; }';
    let notifyMutation = () => {};
    const disconnect = vi.fn();
    class TestMutationObserver {
      constructor(callback: MutationCallback) {
        notifyMutation = () => callback([], this as never);
      }

      observe() {}

      disconnect() {
        disconnect();
      }
    }
    vi.stubGlobal('MutationObserver', TestMutationObserver);
    const pageDocument = {
      documentElement: {
        getAttribute: (name: string) =>
          name === 'data-darkreader-mode'
            ? 'dynamic'
            : name === 'data-darkreader-scheme'
              ? 'dark'
              : null,
      },
      querySelector: () => ({ textContent: fallback }),
    } as unknown as Document;

    let settled = false;
    const readiness = waitForDynamicPageThemeVisualReady(pageDocument, 1, {
      timeoutMs: 2_000,
    }).then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(settled).toBe(false);
    fallback = '';
    notifyMutation();

    await expect(readiness).resolves.toBe('ready');
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
