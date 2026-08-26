import {
  extensionDiagnostics,
  isExtensionPageLifecycleInterrupted,
  notifyExtensionContextInvalidated,
} from './diagnostics';
import { extensionGlobalApi } from './extension-runtime-api';
import type { ExtensionRequest } from './protocol';

export type ExtensionMessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean | undefined;

type ExtensionMessageEvent = Pick<
  typeof chrome.runtime.onMessage,
  'addListener' | 'removeListener'
>;

export type ExtensionPort = chrome.runtime.Port;
export type ExtensionStorageArea = Pick<
  chrome.storage.StorageArea,
  'get' | 'remove' | 'set' | 'setAccessLevel'
>;
export type RegisteredUserScript = chrome.userScripts.RegisteredUserScript;

export type FirefoxSidebarAction = {
  open(): Promise<void>;
  setPanel(details: {
    panel: string;
    tabId?: number;
    windowId?: number;
  }): Promise<void>;
};

export type ExtensionSearchApi = Partial<
  Pick<typeof chrome.search, 'query'>
> & {
  search?: (searchProperties: {
    query: string;
    tabId?: number;
  }) => Promise<void> | void;
};

export type ExtensionApi = {
  runtime: Pick<
    typeof chrome.runtime,
    | 'connect'
    | 'getURL'
    | 'id'
    | 'lastError'
    | 'onMessage'
    | 'reload'
    | 'sendMessage'
  >;
  storage: {
    local: ExtensionStorageArea;
    sync: ExtensionStorageArea;
    onChanged: Pick<
      typeof chrome.storage.onChanged,
      'addListener' | 'removeListener'
    >;
  };
  permissions?: Pick<typeof chrome.permissions, 'contains' | 'request'>;
  tabs?: Pick<
    typeof chrome.tabs,
    | 'create'
    | 'get'
    | 'getCurrent'
    | 'onActivated'
    | 'onRemoved'
    | 'onUpdated'
    | 'query'
    | 'sendMessage'
  >;
};

export type ExtensionBackgroundApi = ExtensionApi & {
  storage: ExtensionApi['storage'] & {
    session: ExtensionStorageArea;
  };
  runtime: ExtensionApi['runtime'] &
    Pick<typeof chrome.runtime, 'onConnect' | 'onInstalled' | 'onStartup'> & {
      getContexts?: typeof chrome.runtime.getContexts;
    };
  offscreen?: Pick<typeof chrome.offscreen, 'createDocument'>;
  action: {
    onClicked: Pick<
      typeof chrome.action.onClicked,
      'addListener' | 'removeListener'
    >;
    setBadgeBackgroundColor: typeof chrome.action.setBadgeBackgroundColor;
    setBadgeText: typeof chrome.action.setBadgeText;
    setBadgeTextColor?: (details: {
      color: string | number[];
      tabId?: number;
    }) => Promise<void>;
  };
  commands?: {
    getAll: typeof chrome.commands.getAll;
    onCommand: Pick<
      typeof chrome.commands.onCommand,
      'addListener' | 'removeListener'
    >;
  };
  alarms: Pick<typeof chrome.alarms, 'clear' | 'create' | 'onAlarm'>;
  declarativeNetRequest: Pick<
    typeof chrome.declarativeNetRequest,
    | 'getDynamicRules'
    | 'getEnabledRulesets'
    | 'getSessionRules'
    | 'updateDynamicRules'
    | 'updateEnabledRulesets'
    | 'updateSessionRules'
  > &
    Partial<
      Pick<
        typeof chrome.declarativeNetRequest,
        'getDisabledRuleIds' | 'updateStaticRules'
      >
    >;
  scripting: Pick<
    typeof chrome.scripting,
    'executeScript' | 'insertCSS' | 'removeCSS'
  >;
  tabs: Pick<
    typeof chrome.tabs,
    | 'create'
    | 'get'
    | 'onActivated'
    | 'onCreated'
    | 'onRemoved'
    | 'onUpdated'
    | 'query'
    | 'reload'
    | 'remove'
    | 'sendMessage'
    | 'update'
  > &
    Partial<Pick<typeof chrome.tabs, 'goBack' | 'goForward'>>;
  sidePanel?: Pick<typeof chrome.sidePanel, 'open' | 'setOptions'>;
  sidebarAction?: FirefoxSidebarAction;
  windows?: {
    create(
      createData?: chrome.windows.CreateData,
    ): Promise<chrome.windows.Window | undefined>;
    update?(
      windowId: number,
      updateInfo: chrome.windows.UpdateInfo,
    ): Promise<chrome.windows.Window>;
  };
  downloads?: {
    cancel(downloadId: number): Promise<void>;
    download(options: chrome.downloads.DownloadOptions): Promise<number>;
    search(
      query: chrome.downloads.DownloadQuery,
    ): Promise<chrome.downloads.DownloadItem[]>;
    onChanged: Pick<
      typeof chrome.downloads.onChanged,
      'addListener' | 'removeListener'
    >;
  };
  bookmarks?: Pick<
    typeof chrome.bookmarks,
    | 'create'
    | 'getTree'
    | 'move'
    | 'remove'
    | 'removeTree'
    | 'search'
    | 'update'
  >;
  history?: Pick<typeof chrome.history, 'deleteUrl' | 'getVisits' | 'search'>;
  topSites?: Pick<typeof chrome.topSites, 'get'>;
  search?: ExtensionSearchApi;
  notifications?: {
    clear(notificationId: string): Promise<boolean>;
    create(
      options: chrome.notifications.NotificationCreateOptions,
    ): Promise<string>;
    onClicked: Pick<
      typeof chrome.notifications.onClicked,
      'addListener' | 'removeListener'
    >;
    onClosed: Pick<
      typeof chrome.notifications.onClosed,
      'addListener' | 'removeListener'
    >;
  };
  cookies?: {
    getAllCookieStores?(): Promise<chrome.cookies.CookieStore[]>;
    getAll(
      details: chrome.cookies.GetAllDetails,
    ): Promise<chrome.cookies.Cookie[]>;
    remove(
      details: chrome.cookies.CookieDetails,
    ): Promise<chrome.cookies.CookieDetails | null>;
    set(
      details: chrome.cookies.SetDetails,
    ): Promise<chrome.cookies.Cookie | null>;
  };
  webRequest?: Partial<
    Pick<
      typeof chrome.webRequest,
      | 'handlerBehaviorChanged'
      | 'onBeforeRequest'
      | 'onBeforeSendHeaders'
      | 'onErrorOccurred'
      | 'onResponseStarted'
    >
  >;
  webNavigation: Pick<typeof chrome.webNavigation, 'onBeforeNavigate'> &
    Partial<Pick<typeof chrome.webNavigation, 'getAllFrames'>>;
};

export type ExtensionUserscriptApi = ExtensionBackgroundApi & {
  runtime: ExtensionBackgroundApi['runtime'] &
    Pick<typeof chrome.runtime, 'onUserScriptConnect'>;
  userScripts: Pick<
    typeof chrome.userScripts,
    | 'configureWorld'
    | 'execute'
    | 'getScripts'
    | 'register'
    | 'resetWorldConfiguration'
    | 'unregister'
    | 'update'
  >;
};

export const USER_SCRIPTS_API_UNAVAILABLE =
  '请在扩展详情页开启“允许运行用户脚本”，然后重新加载扩展。Chrome 默认不开放该接口。';

export function extensionApiOrNull(): ExtensionApi | null {
  try {
    const api = extensionGlobalApi();
    if (
      !api?.runtime?.id ||
      typeof api.runtime.getURL !== 'function' ||
      typeof api.runtime.connect !== 'function' ||
      typeof api.runtime.sendMessage !== 'function' ||
      !api.runtime.onMessage ||
      typeof api.runtime.onMessage.addListener !== 'function' ||
      typeof api.runtime.onMessage.removeListener !== 'function' ||
      !api.storage?.onChanged ||
      typeof api.storage.onChanged.addListener !== 'function' ||
      typeof api.storage.onChanged.removeListener !== 'function' ||
      !api.storage?.local ||
      typeof api.storage.local.get !== 'function' ||
      typeof api.storage.local.set !== 'function'
    ) {
      return null;
    }
    return api as ExtensionApi;
  } catch {
    return null;
  }
}

export function requireExtensionApi() {
  const api = extensionApiOrNull();
  if (!api) throw new Error('The browser extension API is unavailable.');
  return api;
}

export function requireExtensionBackgroundApi() {
  const api = requireExtensionApi() as ExtensionBackgroundApi;
  const requiredCapabilities = {
    'storage.local.remove': api.storage.local.remove,
    'storage.session.get': api.storage.session?.get,
    'storage.session.set': api.storage.session?.set,
    'storage.session.remove': api.storage.session?.remove,
    'runtime.onConnect.addListener': api.runtime.onConnect?.addListener,
    'runtime.onInstalled.addListener': api.runtime.onInstalled?.addListener,
    'runtime.onStartup.addListener': api.runtime.onStartup?.addListener,
    'alarms.clear': api.alarms?.clear,
    'alarms.create': api.alarms?.create,
    'alarms.onAlarm.addListener': api.alarms?.onAlarm?.addListener,
    'declarativeNetRequest.getDynamicRules':
      api.declarativeNetRequest?.getDynamicRules,
    'declarativeNetRequest.getEnabledRulesets':
      api.declarativeNetRequest?.getEnabledRulesets,
    'declarativeNetRequest.getSessionRules':
      api.declarativeNetRequest?.getSessionRules,
    'declarativeNetRequest.updateDynamicRules':
      api.declarativeNetRequest?.updateDynamicRules,
    'declarativeNetRequest.updateEnabledRulesets':
      api.declarativeNetRequest?.updateEnabledRulesets,
    'declarativeNetRequest.updateSessionRules':
      api.declarativeNetRequest?.updateSessionRules,
    'scripting.executeScript': api.scripting?.executeScript,
    'scripting.insertCSS': api.scripting?.insertCSS,
    'scripting.removeCSS': api.scripting?.removeCSS,
    'tabs.create': api.tabs?.create,
    'tabs.get': api.tabs?.get,
    'tabs.query': api.tabs?.query,
    'tabs.reload': api.tabs?.reload,
    'tabs.onRemoved.addListener': api.tabs?.onRemoved?.addListener,
    'tabs.onCreated.addListener': api.tabs?.onCreated?.addListener,
    'tabs.onUpdated.addListener': api.tabs?.onUpdated?.addListener,
    'tabs.remove': api.tabs?.remove,
    'tabs.sendMessage': api.tabs?.sendMessage,
    'tabs.update': api.tabs?.update,
    'webNavigation.onBeforeNavigate.addListener':
      api.webNavigation?.onBeforeNavigate?.addListener,
  };
  const missingRequiredCapabilities = Object.entries(requiredCapabilities)
    .filter(([, value]) => typeof value !== 'function')
    .map(([path]) => path);
  if (missingRequiredCapabilities.length > 0) {
    throw new Error(
      `The browser extension background context is missing required APIs: ${missingRequiredCapabilities.join(', ')}`,
    );
  }

  return api as ExtensionBackgroundApi;
}

export function extensionUserscriptApi(api: ExtensionBackgroundApi) {
  const chromeApi = (globalThis as { chrome?: typeof chrome }).chrome;
  const candidate = api as ExtensionBackgroundApi & {
    runtime: ExtensionBackgroundApi['runtime'] & {
      onUserScriptConnect?: typeof chrome.runtime.onUserScriptConnect;
    };
    userScripts?: typeof chrome.userScripts;
  };
  if (!candidate.userScripts && chromeApi?.userScripts) {
    candidate.userScripts = chromeApi.userScripts;
  }
  if (
    candidate.runtime &&
    !candidate.runtime.onUserScriptConnect &&
    chromeApi?.runtime?.onUserScriptConnect
  ) {
    candidate.runtime.onUserScriptConnect =
      chromeApi.runtime.onUserScriptConnect;
  }
  return candidate.userScripts && candidate.runtime?.onUserScriptConnect
    ? (candidate as ExtensionUserscriptApi)
    : null;
}

export class ExtensionMessageSubscription {
  private readonly event: ExtensionMessageEvent;
  private active = false;

  constructor(
    api: ExtensionApi,
    private readonly listener: ExtensionMessageListener,
  ) {
    const event = api.runtime.onMessage;
    if (
      !event ||
      typeof event.addListener !== 'function' ||
      typeof event.removeListener !== 'function'
    ) {
      throw new Error('The extension returned an invalid message event.');
    }
    this.event = event;
  }

  start() {
    if (this.active) return;
    try {
      this.event.addListener(this.listener);
      this.active = true;
    } catch (error) {
      notifyExtensionContextInvalidated(error);
      throw error;
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    try {
      this.event.removeListener(this.listener);
    } catch (error) {
      notifyExtensionContextInvalidated(error);
    }
  }
}

export function connectExtensionPort(api: ExtensionApi, name: string) {
  let port: ExtensionPort;
  try {
    port = api.runtime.connect({ name });
  } catch (error) {
    notifyExtensionContextInvalidated(error);
    throw error;
  }
  if (
    !port?.onMessage ||
    typeof port.onMessage.addListener !== 'function' ||
    !port.onDisconnect ||
    typeof port.onDisconnect.addListener !== 'function' ||
    typeof port.postMessage !== 'function' ||
    typeof port.disconnect !== 'function'
  ) {
    throw new Error(`The extension returned an invalid runtime port: ${name}`);
  }
  return port;
}

function extensionRuntimeContextInvalidated(api: ExtensionApi) {
  try {
    if ('id' in api.runtime && api.runtime.id === '') {
      return true;
    }
    if (typeof api.runtime.getURL === 'function') api.runtime.getURL('');
    return false;
  } catch {
    return true;
  }
}

export function sendExtensionTransportRequest<Response>(
  api: ExtensionApi,
  request: Readonly<{ type: string }> & Readonly<Record<string, unknown>>,
) {
  return sendExtensionRequest<Response>(
    api,
    request as unknown as ExtensionRequest,
  );
}

export async function sendExtensionRequest<Response>(
  api: ExtensionApi,
  request: ExtensionRequest,
) {
  const retryDelays = [60] as const;
  const maxAttempts = retryDelays.length + 1;
  const startedAt = Date.now();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (extensionRuntimeContextInvalidated(api)) {
        throw new Error('Extension context invalidated.');
      }

      const response = await new Promise<unknown>((resolve, reject) => {
        let settled = false;
        const settle = (callback: (value: unknown) => void, value: unknown) => {
          if (settled) return;
          settled = true;
          callback(value);
        };
        if (!Reflect.has(api.runtime, 'lastError')) {
          try {
            const pending = api.runtime.sendMessage(
              request,
            ) as Promise<unknown>;
            void pending.then(
              (value: unknown) => settle(resolve, value),
              (error: unknown) => settle(reject, error),
            );
          } catch (error) {
            settle(reject, error);
          }
          return;
        }
        const handleResponse = (value: unknown) => {
          let lastError: unknown;
          try {
            lastError = api.runtime.lastError;
          } catch (error) {
            lastError = error;
          }
          if (lastError) {
            settle(reject, lastError);
            return;
          }
          settle(resolve, value);
        };

        try {
          const sendMessage = api.runtime.sendMessage as unknown as (
            message: unknown,
            callback: (response: unknown) => void,
          ) => undefined | Promise<unknown>;
          const pending = sendMessage.call(
            api.runtime,
            request,
            handleResponse,
          );
          if (pending && typeof pending.then === 'function') {
            void pending.then(
              (value) => settle(resolve, value),
              (error) => settle(reject, error),
            );
          }
        } catch (error) {
          settle(reject, error);
        }
      });
      return response as Response;
    } catch (caught) {
      const rawError = extensionRuntimeContextInvalidated(api)
        ? new Error('Extension context invalidated.', { cause: caught })
        : caught;
      const errorMessage = extensionErrorMessage(rawError);
      const error = new Error(
        `Extension request "${request.type}" failed: ${errorMessage}`,
        { cause: rawError },
      );
      error.name = 'ExtensionRequestError';
      const transient = isExtensionPageLifecycleInterrupted(rawError);
      const opaque = errorMessage === 'Unknown extension runtime error.';
      const details = {
        requestType: request.type,
        attempt: attempt + 1,
        maxAttempts,
        transient,
        opaque,
        errorMessage,
        elapsedMs: Date.now() - startedAt,
        visibilityState:
          typeof document === 'undefined'
            ? 'unavailable'
            : document.visibilityState,
        readyState:
          typeof document === 'undefined' ? 'unavailable' : document.readyState,
      };
      if (notifyExtensionContextInvalidated(error)) {
        throw error;
      }

      if (transient || opaque) {
        const pageActive =
          typeof document === 'undefined' ||
          document.visibilityState !== 'hidden';
        const retryDelay = retryDelays[attempt];
        if (retryDelay !== undefined && pageActive) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }
        if (transient) {
          error.name = 'ExtensionRequestInterruptedError';
          throw error;
        }
        extensionDiagnostics.warn(
          'extension-runtime',
          'send-message-interrupted',
          error,
          details,
        );
        throw error;
      }
      extensionDiagnostics.error(
        'extension-runtime',
        'send-message-failed',
        error,
        details,
      );
      throw error;
    }
  }
  throw new Error('Extension request retry loop ended unexpectedly.');
}

import { extensionErrorMessage } from '../../lib/extension-errors';
