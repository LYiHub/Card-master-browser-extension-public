export const PAGE_THEME_VISUAL_READY_TIMEOUT_MS = 12_000;

export type PageThemeVisualReadiness = 'ready' | 'timeout' | 'cancelled';

function expectedScheme(mode: 0 | 1) {
  return mode === 1 ? 'dark' : 'dimmed';
}

export function dynamicPageThemeVisualReady(
  pageDocument: Document,
  mode: 0 | 1,
) {
  const root = pageDocument.documentElement;
  if (root.getAttribute('data-darkreader-mode') !== 'dynamic') return false;
  if (root.getAttribute('data-darkreader-scheme') !== expectedScheme(mode)) {
    return false;
  }
  const fallback = pageDocument.querySelector<HTMLStyleElement>(
    '.darkreader--fallback',
  );
  return !fallback || fallback.textContent?.trim().length === 0;
}

export function waitForDynamicPageThemeVisualReady(
  pageDocument: Document,
  mode: 0 | 1,
  {
    signal,
    timeoutMs = PAGE_THEME_VISUAL_READY_TIMEOUT_MS,
  }: {
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<PageThemeVisualReadiness> {
  if (dynamicPageThemeVisualReady(pageDocument, mode)) {
    return Promise.resolve('ready');
  }
  if (signal?.aborted) return Promise.resolve('cancelled');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PageThemeVisualReadiness) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', handleAbort);
      resolve(result);
    };
    const check = () => {
      if (dynamicPageThemeVisualReady(pageDocument, mode)) finish('ready');
    };
    const handleAbort = () => finish('cancelled');
    const observer = new MutationObserver(check);
    const timeout = globalThis.setTimeout(() => finish('timeout'), timeoutMs);

    signal?.addEventListener('abort', handleAbort, { once: true });
    observer.observe(pageDocument.documentElement, {
      attributes: true,
      attributeFilter: ['data-darkreader-mode', 'data-darkreader-scheme'],
      characterData: true,
      childList: true,
      subtree: true,
    });
    check();
  });
}
