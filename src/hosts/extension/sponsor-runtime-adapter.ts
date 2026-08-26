import {
  extensionDiagnostics,
  installExtensionContextBoundary,
  isExtensionPageLifecycleInterrupted,
  notifyExtensionContextInvalidated,
  onExtensionContextInvalidated,
  registerExtensionListener,
} from './diagnostics';
import { claimPageRuntime } from './page-runtime-ownership';
import {
  isSponsorRuntimeMessage,
  isSponsorStorageChangedMessage,
  SPONSOR_RUNTIME_MESSAGE,
  SPONSOR_STORAGE_REQUEST,
  type SponsorRuntimeId,
  type SponsorStorageAreaName,
  type SponsorStorageOperation,
  sponsorRuntimePortName,
} from './sponsor-runtime';

type Callback<T> = (value: T) => void;
type MessageListener = Parameters<
  typeof chrome.runtime.onMessage.addListener
>[0];
type ConnectListener = Parameters<
  typeof chrome.runtime.onConnect.addListener
>[0];
type StorageChangedListener = Parameters<
  typeof chrome.storage.onChanged.addListener
>[0];

type SponsorStorageHost = (
  runtimeId: SponsorRuntimeId,
  areaName: SponsorStorageAreaName,
  operation: SponsorStorageOperation,
  payload?: unknown,
) => Promise<unknown>;

type SponsorRuntimeScope = {
  storage: {
    local: chrome.storage.StorageArea;
    sync: chrome.storage.StorageArea;
    onChanged: Pick<
      typeof chrome.storage.onChanged,
      'addListener' | 'removeListener'
    >;
  };
  runtime: Pick<
    typeof chrome.runtime,
    | 'getManifest'
    | 'connect'
    | 'getURL'
    | 'id'
    | 'lastError'
    | 'onConnect'
    | 'onMessage'
    | 'onMessageExternal'
    | 'sendMessage'
  > & {
    sendTabMessage: typeof chrome.tabs.sendMessage;
  };
  i18n: Pick<typeof chrome.i18n, 'getMessage'>;
};

type RuntimeOptions = {
  runtimeId: SponsorRuntimeId;
  assetRoot: string;
  localePrefix: string;
  pageHosts: readonly string[];
  externalMessages?: boolean;
};

const scope = globalThis as typeof globalThis & {
  __cardMasterSponsorStorageHost?: SponsorStorageHost;
  __cardMasterSponsorRuntimes?: Partial<
    Record<SponsorRuntimeId, SponsorRuntimeScope>
  >;
};

function withCallback<T>(
  promise: Promise<T>,
  callback?: Callback<T>,
  fallback?: T,
) {
  if (callback) {
    void promise.then(callback, () => callback(fallback as T));
  }
  return promise;
}

function inertEvent() {
  return {
    addListener() {},
    removeListener() {},
    hasListener() {
      return false;
    },
    hasListeners() {
      return false;
    },
  };
}

function inertPort(name = '') {
  return {
    name,
    disconnect() {},
    onDisconnect: inertEvent(),
    onMessage: inertEvent(),
    postMessage() {},
  } as unknown as chrome.runtime.Port;
}

function pageMatches(pageHosts: readonly string[]) {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) {
    return false;
  }
  const hostname = location.hostname.toLowerCase();
  return pageHosts.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

function unscopedSponsorPageMessage(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.message === 'string' &&
    typeof message.Message !== 'string' &&
    !('channel' in message)
  );
}

function portWithName(port: chrome.runtime.Port, name: string) {
  return new Proxy(port, {
    get(target, property, receiver) {
      return property === 'name'
        ? name
        : Reflect.get(target, property, receiver);
    },
  });
}

export function installSponsorRuntimeAdapter(options: RuntimeOptions) {
  const nativeRuntime = chrome.runtime;
  const nativeTabs = chrome.tabs;
  const nativeI18n = chrome.i18n;
  const nativeOnMessage = nativeRuntime.onMessage;
  const nativeOnMessageExternal = nativeRuntime.onMessageExternal;
  const nativeOnConnect = nativeRuntime.onConnect;
  const extensionId = nativeRuntime.id;
  const extensionManifest = nativeRuntime.getManifest();
  const extensionRoot = nativeRuntime.getURL('');
  const storageListeners = new Set<StorageChangedListener>();
  const localListeners = new Set<StorageChangedListener>();
  const syncListeners = new Set<StorageChangedListener>();
  const messageListeners = new Map<MessageListener, MessageListener>();
  const externalMessageListeners = new Map<MessageListener, MessageListener>();
  const connectListeners = new Map<ConnectListener, ConnectListener>();
  let active = true;
  let releaseOwnership = () => {};
  let removeContextBoundary = () => {};
  let removeContextInvalidation = () => {};
  let removeStorageChangeListener = () => {};

  const nativeRuntimeAvailable = () => {
    try {
      return Boolean(nativeRuntime.id);
    } catch {
      return false;
    }
  };

  const removeNativeListeners = <Listener>(
    event: { removeListener(listener: Listener): void },
    listeners: Map<Listener, Listener>,
  ) => {
    for (const wrapped of listeners.values()) {
      try {
        event.removeListener(wrapped);
      } catch (error) {
        notifyExtensionContextInvalidated(error);
      }
    }
    listeners.clear();
  };

  const observeCallbackLastError = (
    args: readonly unknown[],
    operation: string,
  ) => {
    const observed = [...args];
    const callbackIndex = observed.length - 1;
    const callback = observed[callbackIndex];
    if (typeof callback !== 'function') return observed;
    observed[callbackIndex] = (...values: unknown[]) => {
      let lastError: unknown;
      try {
        lastError = nativeRuntime.lastError;
      } catch {
        lastError = undefined;
      }
      if (
        lastError &&
        !isExtensionPageLifecycleInterrupted(lastError) &&
        !notifyExtensionContextInvalidated(lastError)
      ) {
        extensionDiagnostics.warn(
          'sponsor-runtime-adapter',
          'callback-failed',
          lastError,
          { runtimeId: options.runtimeId, operation },
        );
      }
      return Reflect.apply(callback, undefined, values);
    };
    return observed;
  };

  const deactivate = (contextLost = false) => {
    if (!active) return;
    active = false;
    releaseOwnership();
    removeContextInvalidation();
    removeStorageChangeListener();
    removeNativeListeners(nativeOnMessage, messageListeners);
    removeNativeListeners(nativeOnMessageExternal, externalMessageListeners);
    removeNativeListeners(nativeOnConnect, connectListeners);
    storageListeners.clear();
    localListeners.clear();
    syncListeners.clear();
    if (!contextLost && nativeRuntimeAvailable()) removeContextBoundary();
  };

  if (typeof window !== 'undefined') {
    removeContextBoundary = installExtensionContextBoundary(window);
    removeContextInvalidation = onExtensionContextInvalidated(() =>
      deactivate(true),
    );
  }

  async function storageRequest<T>(
    areaName: SponsorStorageAreaName,
    operation: SponsorStorageOperation,
    payload?: unknown,
  ) {
    if (!active) {
      return (operation === 'get' ? {} : undefined) as T;
    }
    const host = scope.__cardMasterSponsorStorageHost;
    const operationPromise = (
      host
        ? host(options.runtimeId, areaName, operation, payload)
        : nativeRuntime
            .sendMessage({
              type: SPONSOR_STORAGE_REQUEST,
              runtimeId: options.runtimeId,
              areaName,
              operation,
              ...(payload === undefined ? {} : { payload }),
            })
            .then(
              (response: { result?: unknown; error?: string } | undefined) => {
                if (response?.error) throw new Error(response.error);
                return response?.result;
              },
            )
    ).catch((error) => {
      if (notifyExtensionContextInvalidated(error)) {
        return operation === 'get' ? {} : undefined;
      }
      throw error;
    });
    return operationPromise as Promise<T>;
  }

  function storageArea(areaName: SponsorStorageAreaName) {
    const listeners = areaName === 'local' ? localListeners : syncListeners;
    return {
      get(
        keys?: null | string | string[] | Record<string, unknown>,
        callback?: Callback<Record<string, unknown>>,
      ) {
        return withCallback(
          storageRequest<Record<string, unknown>>(
            areaName,
            'get',
            keys ?? null,
          ),
          callback,
          {},
        );
      },
      set(items: Record<string, unknown>, callback?: Callback<void>) {
        return withCallback(
          storageRequest<void>(areaName, 'set', items),
          callback,
          undefined,
        );
      },
      remove(keys: string | string[], callback?: Callback<void>) {
        return withCallback(
          storageRequest<void>(areaName, 'remove', keys),
          callback,
          undefined,
        );
      },
      clear(callback?: Callback<void>) {
        return withCallback(
          storageRequest<void>(areaName, 'clear'),
          callback,
          undefined,
        );
      },
      setAccessLevel() {
        return Promise.resolve();
      },
      onChanged: {
        addListener(listener: StorageChangedListener) {
          listeners.add(listener);
        },
        removeListener(listener: StorageChangedListener) {
          listeners.delete(listener);
        },
      },
    } as unknown as chrome.storage.StorageArea;
  }

  function scopedMessageEvent(
    target: Map<MessageListener, MessageListener>,
    external: boolean,
  ) {
    const nativeEvent = external ? nativeOnMessageExternal : nativeOnMessage;
    return {
      addListener(listener: MessageListener) {
        if (target.has(listener)) return;
        const wrapped: MessageListener = (message, sender, sendResponse) => {
          if (!active) return;
          if (external) {
            if (!options.externalMessages) return;
            return listener(message, sender, sendResponse);
          }
          if (isSponsorRuntimeMessage(message)) {
            if (message.runtimeId !== options.runtimeId) return;
            return listener(message.payload, sender, sendResponse);
          }
          if (isSponsorStorageChangedMessage(message)) return;
          if (!pageMatches(options.pageHosts)) return;
          if (!unscopedSponsorPageMessage(message)) return;
          return listener(message, sender, sendResponse);
        };
        target.set(listener, wrapped);
        if (active) nativeEvent.addListener(wrapped);
      },
      removeListener(listener: MessageListener) {
        const wrapped = target.get(listener);
        if (!wrapped) return;
        target.delete(listener);
        try {
          nativeEvent.removeListener(wrapped);
        } catch (error) {
          if (!notifyExtensionContextInvalidated(error)) throw error;
        }
      },
    };
  }

  const onConnect = {
    addListener(listener: ConnectListener) {
      if (connectListeners.has(listener)) return;
      const wrapped: ConnectListener = (port) => {
        if (!active) return;
        const prefix = sponsorRuntimePortName(options.runtimeId, '');
        if (!port.name.startsWith(prefix)) return;
        listener(portWithName(port, port.name.slice(prefix.length)));
      };
      connectListeners.set(listener, wrapped);
      if (active) nativeOnConnect.addListener(wrapped);
    },
    removeListener(listener: ConnectListener) {
      const wrapped = connectListeners.get(listener);
      if (!wrapped) return;
      connectListeners.delete(listener);
      try {
        nativeOnConnect.removeListener(wrapped);
      } catch (error) {
        if (!notifyExtensionContextInvalidated(error)) throw error;
      }
    },
  };

  const runtime = {
    id: extensionId,
    get lastError() {
      try {
        return active ? nativeRuntime.lastError : undefined;
      } catch {
        return undefined;
      }
    },
    getManifest() {
      return extensionManifest;
    },
    getURL(path: string) {
      if (/^[a-z][a-z\d+.-]*:/i.test(path)) return path;
      const normalized = path.replace(/^(?:\.{0,2}\/)+/, '');
      const vendorPath = normalized.startsWith(`${options.assetRoot}/`)
        ? normalized
        : `${options.assetRoot}/${normalized}`;
      if (!active) return new URL(vendorPath, extensionRoot).href;
      try {
        return nativeRuntime.getURL(vendorPath);
      } catch (error) {
        if (!notifyExtensionContextInvalidated(error)) throw error;
        return new URL(vendorPath, extensionRoot).href;
      }
    },
    sendMessage(...args: unknown[]) {
      if (!active) {
        const callback = [...args]
          .reverse()
          .find(
            (value): value is (response: unknown) => void =>
              typeof value === 'function',
          );
        if (callback) queueMicrotask(() => callback({}));
        return Promise.resolve({});
      }
      let result: unknown;
      try {
        if (typeof args[0] === 'string') {
          result = Reflect.apply(
            nativeRuntime.sendMessage,
            nativeRuntime,
            observeCallbackLastError(args, 'runtime.sendMessage'),
          );
        } else {
          const [message, ...rest] = args;
          result = Reflect.apply(nativeRuntime.sendMessage, nativeRuntime, [
            {
              type: SPONSOR_RUNTIME_MESSAGE,
              runtimeId: options.runtimeId,
              payload: message,
            },
            ...observeCallbackLastError(rest, 'runtime.sendMessage'),
          ]);
        }
      } catch (error) {
        if (!notifyExtensionContextInvalidated(error)) throw error;
        return Promise.resolve({});
      }
      return result instanceof Promise
        ? result.catch((error) => {
            if (notifyExtensionContextInvalidated(error)) return {};
            throw error;
          })
        : result;
    },
    sendTabMessage(tabId: number, message: unknown, ...rest: unknown[]) {
      if (!active || typeof nativeTabs?.sendMessage !== 'function') {
        const callback = [...rest]
          .reverse()
          .find(
            (value): value is (response: unknown) => void =>
              typeof value === 'function',
          );
        if (callback) queueMicrotask(() => callback({}));
        return Promise.resolve({});
      }
      try {
        const result = Reflect.apply(nativeTabs.sendMessage, nativeTabs, [
          tabId,
          {
            type: SPONSOR_RUNTIME_MESSAGE,
            runtimeId: options.runtimeId,
            payload: message,
          },
          ...observeCallbackLastError(rest, 'tabs.sendMessage'),
        ]);
        return result instanceof Promise
          ? result.catch((error) => {
              if (notifyExtensionContextInvalidated(error)) return {};
              throw error;
            })
          : result;
      } catch (error) {
        if (!notifyExtensionContextInvalidated(error)) throw error;
        return Promise.resolve({});
      }
    },
    connect(...args: unknown[]) {
      if (!active) {
        const first = args[0];
        const name =
          first && typeof first === 'object'
            ? String((first as chrome.runtime.ConnectInfo).name ?? '')
            : '';
        return inertPort(name);
      }
      const [first, second] = args;
      if (typeof first === 'string') {
        try {
          return Reflect.apply(nativeRuntime.connect, nativeRuntime, args);
        } catch (error) {
          if (!notifyExtensionContextInvalidated(error)) throw error;
          return inertPort();
        }
      }
      const connectInfo =
        first && typeof first === 'object'
          ? (first as chrome.runtime.ConnectInfo)
          : undefined;
      try {
        return nativeRuntime.connect({
          ...connectInfo,
          name: sponsorRuntimePortName(
            options.runtimeId,
            connectInfo?.name ?? '',
          ),
          ...(second && typeof second === 'object' ? second : {}),
        });
      } catch (error) {
        if (!notifyExtensionContextInvalidated(error)) throw error;
        return inertPort(connectInfo?.name);
      }
    },
    onMessage: scopedMessageEvent(messageListeners, false),
    onMessageExternal: scopedMessageEvent(externalMessageListeners, true),
    onConnect,
  } as SponsorRuntimeScope['runtime'];

  const handleStorageChange = (message: unknown) => {
    if (!active) return;
    if (
      !isSponsorStorageChangedMessage(message) ||
      message.runtimeId !== options.runtimeId
    ) {
      return;
    }
    for (const listener of storageListeners) {
      listener(message.changes, message.areaName);
    }
    const areaListeners =
      message.areaName === 'local' ? localListeners : syncListeners;
    for (const listener of areaListeners) {
      listener(message.changes, message.areaName);
    }
  };
  removeStorageChangeListener = registerExtensionListener(
    nativeOnMessage,
    handleStorageChange,
  );

  const getMessage: typeof chrome.i18n.getMessage = (name, substitutions) => {
    if (!active) return name;
    try {
      return nativeI18n.getMessage(
        `${options.localePrefix}${name}`,
        substitutions,
      );
    } catch (error) {
      if (!notifyExtensionContextInvalidated(error)) throw error;
      return name;
    }
  };

  scope.__cardMasterSponsorRuntimes ??= {};
  scope.__cardMasterSponsorRuntimes[options.runtimeId] = {
    storage: {
      local: storageArea('local'),
      sync: storageArea('sync'),
      onChanged: {
        addListener(listener) {
          storageListeners.add(listener);
        },
        removeListener(listener) {
          storageListeners.delete(listener);
        },
      },
    },
    runtime,
    i18n: { getMessage },
  };

  if (typeof document !== 'undefined') {
    releaseOwnership = claimPageRuntime(
      `sponsor-runtime-${options.runtimeId}`,
      deactivate,
    ).release;
  }
  return deactivate;
}
