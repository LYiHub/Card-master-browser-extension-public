import { extensionErrorMessage } from '../../lib/extension-errors';
import type { CosmeticData } from './adguard-cosmetic-layer';
import { publishAdguardCosmeticRevision } from './adguard-cosmetic-protocol';
import {
  type ExtensionApi,
  extensionApiOrNull,
  sendExtensionTransportRequest,
} from './api';
import { extensionContentHostUrl } from './content-host-url';
import {
  installExtensionContextBoundary,
  isExtensionPageLifecycleInterrupted,
  notifyExtensionContextInvalidated,
  onExtensionContextInvalidated,
  registerExtensionListener,
  reportExtensionFailure,
} from './diagnostics';
import { claimPageRuntime } from './page-runtime-ownership';

const REFRESH_MESSAGE_TYPE = 'content-blocking-page-refresh';
const UPSTREAM_RUNTIME_MARKER = 'data-card-master-adguard-runtime';

type AdguardContentRuntime = {
  dispose: () => void;
  refresh: () => Promise<void>;
};

type BackgroundResponse = {
  error?: unknown;
};

type CookieData = {
  isAppStarted: boolean;
  cookieRules: unknown[];
};

function usesNativeCosmeticsOnly(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtube-nocookie.com' ||
      hostname.endsWith('.youtube-nocookie.com')
    );
  } catch {
    return false;
  }
}

function canAccessDocumentCookies() {
  try {
    void document.cookie;
    return true;
  } catch {
    return false;
  }
}

function requireBackgroundResponse<Response>(
  requestType: string,
  response: Response | null,
) {
  if (
    response &&
    typeof response === 'object' &&
    'error' in response &&
    (response as BackgroundResponse).error
  ) {
    throw new Error(
      `内容拦截后台请求“${requestType}”失败：${extensionErrorMessage(
        (response as BackgroundResponse).error,
      )}`,
    );
  }
  return response;
}

type RuntimeState = {
  active: boolean;
  cosmeticRuntime: typeof import('./adguard-cosmetic-layer') | null;
  cookieRuntimeLoaded: boolean;
  refreshRequested: boolean;
  refreshOperation: Promise<void> | null;
};

function createRuntime(api: ExtensionApi): AdguardContentRuntime {
  const removeContextBoundary = installExtensionContextBoundary();
  const state: RuntimeState = {
    active: true,
    cosmeticRuntime: null,
    cookieRuntimeLoaded: false,
    refreshRequested: false,
    refreshOperation: null,
  };
  let removeContextInvalidation = () => {};
  let removeMessageListener = () => {};

  const performRefresh = async () => {
    const [cosmeticResponse, cookieResponse] = await Promise.all([
      sendExtensionTransportRequest<CosmeticData | null>(api, {
        handlerName: 'tsWebExtension',
        type: 'getCosmeticData',
        payload: { documentUrl: window.location.href },
      }),
      sendExtensionTransportRequest<CookieData | null>(api, {
        handlerName: 'tsWebExtension',
        type: 'getCookieRules',
        payload: { documentUrl: window.location.href },
      }),
    ]);
    if (!state.active) return;

    const responseCosmetic = requireBackgroundResponse(
      'getCosmeticData',
      cosmeticResponse,
    );
    const cosmetic =
      responseCosmetic && usesNativeCosmeticsOnly(location.href)
        ? { ...responseCosmetic, extCssRules: null }
        : responseCosmetic;
    const cookies = requireBackgroundResponse('getCookieRules', cookieResponse);

    if (
      (cosmetic?.extCssRules?.length ?? 0) === 0 &&
      (cosmetic?.nativeCssSelectors?.length ?? 0) === 0
    ) {
      state.cosmeticRuntime?.disposeAdguardCosmeticLayer();
    } else {
      const activeCosmeticRuntime =
        state.cosmeticRuntime ??
        (await import(
          /* @vite-ignore */ api.runtime.getURL('adguard-cosmetic-runtime.js')
        ));
      if (!state.active) return;
      state.cosmeticRuntime = activeCosmeticRuntime;
      activeCosmeticRuntime.applyAdguardCosmeticData(cosmetic);
    }

    if (cookies?.cookieRules?.length && canAccessDocumentCookies()) {
      if (!state.cookieRuntimeLoaded) {
        document.documentElement.removeAttribute(UPSTREAM_RUNTIME_MARKER);
        await import(
          /* @vite-ignore */ api.runtime.getURL('adguard-runtime.js')
        );
        if (!state.active) return;
        document.documentElement.setAttribute(UPSTREAM_RUNTIME_MARKER, '');
        state.cookieRuntimeLoaded = true;
      }
      publishAdguardCosmeticRevision(document, cosmetic?.revision);
      return;
    }
    publishAdguardCosmeticRevision(document, cosmetic?.revision);
  };

  const refresh = () => {
    if (!state.active) return Promise.resolve();
    state.refreshRequested = true;
    if (!state.refreshOperation) {
      const operation = (async () => {
        while (state.active && state.refreshRequested) {
          state.refreshRequested = false;
          await performRefresh();
        }
      })();
      state.refreshOperation = operation;
      const release = () => {
        if (state.refreshOperation === operation) {
          state.refreshOperation = null;
        }
      };
      void operation.then(release, release);
    }
    return state.refreshOperation;
  };

  const handleMessage = (message: unknown) => {
    if (
      !message ||
      typeof message !== 'object' ||
      (message as { type?: string }).type !== REFRESH_MESSAGE_TYPE
    ) {
      return;
    }
    void refresh().catch((error) =>
      reportExtensionFailure(
        'adguard-runtime',
        'cosmetic-layer-refresh-failed',
        error,
      ),
    );
  };

  let releaseOwnership = () => {};
  const runtime: AdguardContentRuntime = {
    refresh,
    dispose: () => {
      if (!state.active) return;
      state.active = false;
      state.refreshRequested = false;
      releaseOwnership();
      removeContextInvalidation();
      removeMessageListener();
      document.documentElement.removeAttribute(UPSTREAM_RUNTIME_MARKER);
      state.cosmeticRuntime?.disposeAdguardCosmeticLayer();
      removeContextBoundary();
    },
  };
  const ownership = claimPageRuntime('adguard-content', runtime.dispose);
  releaseOwnership = ownership.release;
  removeMessageListener = registerExtensionListener(
    api.runtime.onMessage,
    handleMessage,
  );
  removeContextInvalidation = onExtensionContextInvalidated(runtime.dispose);
  return runtime;
}

async function mountRuntime(runtime: AdguardContentRuntime) {
  try {
    await runtime.refresh();
  } catch (error) {
    if (isExtensionPageLifecycleInterrupted(error)) {
      notifyExtensionContextInvalidated(error);
      runtime.dispose();
      return;
    }
    runtime.dispose();
    reportExtensionFailure('adguard-runtime', 'mount-failed', error);
  }
}

async function bootstrap() {
  if (!extensionContentHostUrl(window.location.href)) return;
  const api = extensionApiOrNull();
  if (!api) return;
  await mountRuntime(createRuntime(api));
}

void bootstrap().catch((error) =>
  reportExtensionFailure('adguard-runtime', 'bootstrap-failed', error),
);
