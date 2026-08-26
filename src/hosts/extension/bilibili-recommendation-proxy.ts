const STATE_DATASET = 'cardMasterBilibiliCapabilities';
const REQUEST_EVENT = 'card-master:bilibili-recommendation-request';
const READY_EVENT = 'card-master:bilibili-recommendation-ready';
const STATE_CHANGED_EVENT = 'card-master:bilibili-state-changed';
const originalFetch = window.fetch.bind(window);
let mixedFetchQueue = Promise.resolve();

function recommendationRequest(input: RequestInfo | URL) {
  const url =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.href
        : input;
  return url.includes('/x/web-interface/wbi/index/top/feed/rcmd');
}

function mode() {
  const source = document.documentElement.dataset[STATE_DATASET];
  if (!source) return null;
  try {
    const state = JSON.parse(source) as {
      enabled?: boolean;
      mode?: string;
    };
    return state.enabled ? state.mode : 'native';
  } catch {
    return null;
  }
}

function waitForMode() {
  if (mode()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(finish, 500);
    function finish() {
      window.clearTimeout(timeout);
      document.removeEventListener(STATE_CHANGED_EVENT, finish);
      resolve();
    }
    document.addEventListener(STATE_CHANGED_EVENT, finish, { once: true });
  });
}

function prepareMixedRequest() {
  return new Promise<void>((resolve) => {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      document.removeEventListener(READY_EVENT, handleReady);
      resolve();
    }, 800);
    function handleReady(event: Event) {
      if (
        !(event instanceof CustomEvent) ||
        event.detail?.requestId !== requestId
      ) {
        return;
      }
      window.clearTimeout(timeout);
      document.removeEventListener(READY_EVENT, handleReady);
      resolve();
    }
    document.addEventListener(READY_EVENT, handleReady);
    document.dispatchEvent(
      new CustomEvent(REQUEST_EVENT, { detail: { requestId } }),
    );
  });
}

window.fetch = async (...args) => {
  if (!recommendationRequest(args[0])) {
    return originalFetch(...args);
  }
  await waitForMode();
  if (mode() !== 'mixed') return originalFetch(...args);
  const operation = mixedFetchQueue.then(async () => {
    await prepareMixedRequest();
    return originalFetch(...args);
  });
  mixedFetchQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
};
