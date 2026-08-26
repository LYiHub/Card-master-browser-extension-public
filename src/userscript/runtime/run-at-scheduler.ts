import type { UserscriptRunAt } from '../domain/types';

type SchedulerWindow = Pick<
  Window,
  'addEventListener' | 'removeEventListener' | 'setTimeout'
> & {
  requestIdleCallback?: (callback: IdleRequestCallback) => number;
};

type SchedulerDocument = Pick<
  Document,
  'body' | 'documentElement' | 'readyState' | 'addEventListener'
>;

function waitForBody(documentRef: SchedulerDocument) {
  if (documentRef.body) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (!documentRef.body) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(documentRef.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

function waitForDocumentEnd(documentRef: SchedulerDocument) {
  if (documentRef.readyState !== 'loading') return Promise.resolve();
  return new Promise<void>((resolve) => {
    documentRef.addEventListener('DOMContentLoaded', () => resolve(), {
      once: true,
    });
  });
}

function waitForIdle(windowRef: SchedulerWindow) {
  return new Promise<void>((resolve) => {
    if (windowRef.requestIdleCallback) {
      windowRef.requestIdleCallback(() => resolve());
    } else {
      windowRef.setTimeout(resolve, 0);
    }
  });
}

export function createRunAtScheduler(
  documentRef: SchedulerDocument = document,
  windowRef: SchedulerWindow = window,
) {
  return async (runAt: UserscriptRunAt) => {
    switch (runAt) {
      case 'document-start':
        return;
      case 'document-body':
        await waitForBody(documentRef);
        return;
      case 'document-end':
        await waitForDocumentEnd(documentRef);
        return;
      case 'document-idle':
        await waitForDocumentEnd(documentRef);
        await waitForIdle(windowRef);
    }
  };
}
