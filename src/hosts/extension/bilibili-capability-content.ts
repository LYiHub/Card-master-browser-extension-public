import type { BilibiliCapabilitiesState } from '../../bilibili-capabilities/domain/types';
import { extensionApiOrNull } from './api';
import {
  isBilibiliHomepage,
  refreshBilibiliRecommendations,
} from './bilibili-recommendation-refresh';
import {
  installExtensionContextBoundary,
  onExtensionContextInvalidated,
  registerExtensionListener,
  reportExtensionFailure,
} from './diagnostics';
import { EXTENSION_CHANNEL } from './extension-channel';
import { claimPageRuntime } from './page-runtime-ownership';

const STATE_DATASET = 'cardMasterBilibiliCapabilities';
const REQUEST_EVENT = 'card-master:bilibili-recommendation-request';
const READY_EVENT = 'card-master:bilibili-recommendation-ready';

type ReadResponse = {
  state?: BilibiliCapabilitiesState;
  error?: string;
};

type CapabilityContentApi = {
  runtime: Pick<typeof chrome.runtime, 'onMessage' | 'sendMessage'>;
};

async function request<T>(
  api: CapabilityContentApi,
  message: Record<string, unknown>,
) {
  const response = (await api.runtime.sendMessage(message)) as T & {
    error?: string;
  };
  if (response?.error) throw new Error(response.error);
  return response;
}

function publish(state: BilibiliCapabilitiesState) {
  const root = document.documentElement;
  if (!root) return;
  root.dataset[STATE_DATASET] = JSON.stringify({
    enabled: state.capabilities['recommendation-control'].enabled,
    mode: state.capabilities['recommendation-control'].settings.mode,
  });
  document.dispatchEvent(new Event('card-master:bilibili-state-changed'));
}

function mount(api: CapabilityContentApi) {
  const removeContextBoundary = installExtensionContextBoundary();
  let disposed = false;
  let releaseOwnership = () => {};
  let removeContextInvalidation = () => {};
  let removeMessageListener = () => {};
  const read = () =>
    request<ReadResponse>(api, {
      channel: EXTENSION_CHANNEL,
      type: 'bilibili-capabilities-read',
    }).then((response) => {
      if (response?.state) publish(response.state);
    });

  const handleRecommendationRequest = (event: Event) => {
    const requestId =
      event instanceof CustomEvent &&
      typeof event.detail?.requestId === 'string'
        ? event.detail.requestId
        : '';
    void request(api, {
      channel: EXTENSION_CHANNEL,
      type: 'bilibili-capability-command',
      capabilityId: 'recommendation-control',
      command: 'mixed-next',
    })
      .catch(() => undefined)
      .finally(() => {
        if (disposed) return;
        document.dispatchEvent(
          new CustomEvent(READY_EVENT, { detail: { requestId } }),
        );
      });
  };
  const handleMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    if (!message || typeof message !== 'object') return;
    const candidate = message as Record<string, unknown>;
    if (
      candidate.channel === EXTENSION_CHANNEL &&
      candidate.type === 'bilibili-capabilities-changed' &&
      candidate.state
    ) {
      publish(candidate.state as BilibiliCapabilitiesState);
    }
    if (
      candidate.channel === EXTENSION_CHANNEL &&
      candidate.type === 'bilibili-recommendation-refresh'
    ) {
      if (!isBilibiliHomepage(window.location)) {
        sendResponse({ refreshed: false, reason: 'not-homepage' });
        return true;
      }
      void refreshBilibiliRecommendations(document).then(
        (refreshed) => sendResponse({ refreshed }),
        (error) =>
          sendResponse({
            refreshed: false,
            error: error instanceof Error ? error.message : String(error),
          }),
      );
      return true;
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    releaseOwnership();
    removeContextInvalidation();
    removeMessageListener();
    document.removeEventListener(REQUEST_EVENT, handleRecommendationRequest);
    removeContextBoundary();
  };

  releaseOwnership = claimPageRuntime(
    'bilibili-capability-content',
    dispose,
  ).release;
  removeMessageListener = registerExtensionListener(
    api.runtime.onMessage,
    handleMessage,
  );
  removeContextInvalidation = onExtensionContextInvalidated(dispose);
  document.addEventListener(REQUEST_EVENT, handleRecommendationRequest);
  void read().catch((error) =>
    reportExtensionFailure(
      'bilibili-capability-content',
      'state-read-failed',
      error,
    ),
  );
  return dispose;
}

const api = extensionApiOrNull();
if (api) mount(api);
