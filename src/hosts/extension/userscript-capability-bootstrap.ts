export function userscriptCapabilityBootstrap(scriptId: string) {
  return `
  const __html = (value) => {
    const html = String(value ?? '');
    return globalThis.trustedTypes?.defaultPolicy?.createHTML?.(html) ?? html;
  };
  const __addElement = (...args) => {
    const hasParent = args[0] instanceof Node;
    const parent = hasParent
      ? args[0]
      : document.head || document.body || document.documentElement;
    const tagName = hasParent ? args[1] : args[0];
    const attributes = hasParent ? args[2] : args[1];
    if (typeof tagName !== 'string' || !tagName) {
      throw new TypeError('GM_addElement requires a tag name.');
    }
    if (
      attributes !== undefined &&
      (!attributes || typeof attributes !== 'object' || Array.isArray(attributes))
    ) {
      throw new TypeError('GM_addElement attributes must be an object.');
    }
    const element = document.createElement(tagName);
    for (const [name, value] of Object.entries(attributes || {})) {
      if (name === 'textContent') {
        element.textContent = String(value ?? '');
      } else if (name === 'innerHTML') {
        element.innerHTML = __html(value);
      } else if (name === 'style' && value && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (name.startsWith('on') && typeof value === 'function') {
        element[name.toLowerCase()] = value;
      } else if (value === true) {
        element.setAttribute(name, '');
      } else if (value !== false && value != null) {
        element.setAttribute(name, String(value));
      }
    }
    parent.append(element);
    return element;
  };
  const __log = (...values) =>
    console.log(${JSON.stringify(`[Userscript:${scriptId}]`)}, ...values);
  const __openInTab = (url, options = {}) => {
    const normalized =
      typeof options === 'boolean'
        ? { active: !options, loadInBackground: options }
        : options || {};
    const eventId = __eventId('tab');
    let tabId = null;
    let closeRequested = false;
    const handle = {
      closed: false,
      onclose: null,
      close() {
        closeRequested = true;
        if (typeof tabId === 'number' && !handle.closed) {
          void __requestCapability('close-tab', { tabId }).catch(__reportError);
        }
      },
    };
    __capabilityListeners.set(eventId, (message) => {
      if (message.event !== 'closed') return;
      handle.closed = true;
      __capabilityListeners.delete(eventId);
      if (typeof handle.onclose === 'function') handle.onclose();
    });
    void __requestCapability('open-tab', {
      url: String(url),
      options: normalized,
      eventId,
    }).then(
      (result) => {
        tabId = result?.tabId ?? null;
        if (closeRequested && typeof tabId === 'number') {
          void __requestCapability('close-tab', { tabId }).catch(__reportError);
        }
        if (tabId === null) {
          handle.closed = true;
          __capabilityListeners.delete(eventId);
          if (typeof handle.onclose === 'function') handle.onclose();
        }
      },
      (error) => {
        handle.closed = true;
        __capabilityListeners.delete(eventId);
        __reportError(error);
        if (typeof handle.onclose === 'function') handle.onclose();
      },
    );
    return handle;
  };
  const __notificationDetails = (details, title, image, onclick) =>
    details && typeof details === 'object'
      ? details
      : {
          text: String(details ?? ''),
          title: title === undefined ? undefined : String(title),
          image: image === undefined ? undefined : String(image),
          onclick,
        };
  const __notification = (details, ondone, image, onclick) => {
    const normalized = __notificationDetails(details, ondone, image, onclick);
    const requestDetails = {
      text: normalized.text,
      title: normalized.title,
      image: normalized.image,
      silent: normalized.silent === true,
      timeout: normalized.timeout,
      url: normalized.url,
    };
    const eventId = __eventId('notification');
    __capabilityListeners.set(eventId, (message) => {
      if (message.event === 'clicked') {
        normalized.onclick?.();
        return;
      }
      if (message.event === 'closed') {
        __capabilityListeners.delete(eventId);
        normalized.ondone?.();
        if (
          typeof ondone === 'function' &&
          details &&
          typeof details === 'object'
        ) {
          ondone();
        }
      }
    });
    const promise = __requestCapability('notification-create', {
      details: requestDetails,
      eventId,
    });
    void promise.catch((error) => {
      __capabilityListeners.delete(eventId);
      __reportError(error);
    });
    return promise;
  };
  const __blobDataUrl = (value) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(reader.error || new Error('Unable to read the download data.'));
      reader.readAsDataURL(value);
    });
  const __download = (details, name) => {
    const normalized =
      typeof details === 'string'
        ? { url: details, name }
        : { ...(details || {}) };
    const requestDetails = {
      name: normalized.name,
      saveAs: normalized.saveAs === true,
      conflictAction: normalized.conflictAction,
    };
    const requiresRequest =
      normalized.method !== undefined ||
      normalized.data !== undefined ||
      normalized.headers !== undefined ||
      normalized.timeout !== undefined ||
      normalized.cookie !== undefined ||
      normalized.anonymous === true;
    const eventId = __eventId('download');
    let downloadId = null;
    let requestAbort = null;
    let abortRequested = false;
    let settled = false;
    let resolveTask;
    let rejectTask;
    const promise = new Promise((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    const finish = (callback, value, reject = false) => {
      if (settled) return;
      settled = true;
      __capabilityListeners.delete(eventId);
      try {
        callback?.(value);
      } catch (error) {
        __reportError(error);
      }
      reject ? rejectTask(value) : resolveTask(value);
    };
    __capabilityListeners.set(eventId, (message) => {
      const data = message.data || {};
      __callRequestHandler(normalized.onprogress, {
        loaded: data.bytesReceived ?? 0,
        total: data.totalBytes ?? 0,
      });
      if (data.state === 'complete') {
        finish(normalized.onload, {
          loaded: data.bytesReceived ?? data.totalBytes ?? 0,
          total: data.totalBytes ?? data.bytesReceived ?? 0,
        });
      } else if (data.state === 'interrupted') {
        finish(
          normalized.onerror,
          new Error(data.error || 'The download was interrupted.'),
          true,
        );
      }
    });
    void Promise.resolve().then(async () => {
      if (abortRequested) {
        throw Object.assign(new Error('The download was aborted.'), {
          kind: 'abort',
          name: 'AbortError',
        });
      }
      if (normalized.url instanceof Blob) {
        return __blobDataUrl(normalized.url);
      }
      const url = String(normalized.url ?? '');
      if (!requiresRequest) return url;
      const request = __startRequest({
        method: normalized.method || 'GET',
        url,
        headers: normalized.headers,
        data: normalized.data,
        timeout: normalized.timeout,
        cookie: normalized.cookie,
        anonymous: normalized.anonymous,
        responseType: 'blob',
        onprogress: normalized.onprogress,
      });
      requestAbort = request.abort;
      if (abortRequested) request.abort();
      const response = await request.promise;
      const blob =
        response.response instanceof Blob
          ? response.response
          : new Blob([response.response], {
              type: 'application/octet-stream',
            });
      return __blobDataUrl(blob);
    })
      .then((url) => {
        if (abortRequested) {
          throw Object.assign(new Error('The download was aborted.'), {
            kind: 'abort',
            name: 'AbortError',
          });
        }
        return __requestCapability('download-start', {
          details: { ...requestDetails, url },
          eventId,
        });
      })
      .then(
        (result) => {
          downloadId = result?.downloadId ?? null;
          if (abortRequested && typeof downloadId === 'number') {
            void __requestCapability('download-cancel', { downloadId }).catch(
              __reportError,
            );
          }
        },
        (error) =>
          finish(
            error?.kind === 'timeout'
              ? normalized.ontimeout
              : error?.kind === 'abort'
                ? normalized.onabort
                : normalized.onerror,
            error,
            true,
          ),
      );
    return {
      promise,
      abort() {
        abortRequested = true;
        requestAbort?.();
        if (typeof downloadId === 'number') {
          void __requestCapability('download-cancel', { downloadId }).catch(
            __reportError,
          );
        }
        finish(
          normalized.onabort,
          Object.assign(new Error('The download was aborted.'), {
            name: 'AbortError',
          }),
          true,
        );
      },
    };
  };
  const __legacyDownload = (details, name) => {
    const task = __download(details, name);
    void task.promise.catch(() => undefined);
    return { abort: task.abort };
  };
  const __modernDownload = (details, name) => {
    const task = __download(details, name);
    return Object.assign(task.promise, { abort: task.abort });
  };
  const __getTab = (callback) => {
    void __requestCapability('tab-data-get').then(
      (data) => callback?.(data || {}),
      __reportError,
    );
  };
  const __saveTab = (data) => {
    void __requestCapability('tab-data-save', structuredClone(data)).catch(
      __reportError,
    );
  };
  const __getTabs = (callback) => {
    void __requestCapability('tab-data-list').then(
      (data) => callback?.(data || {}),
      __reportError,
    );
  };
  const __cookie = (action, details, callback) => {
    const capability =
      action === 'list'
        ? 'cookie-list'
        : action === 'set'
          ? 'cookie-set'
          : 'cookie-delete';
    const promise = __requestCapability(capability, details || {});
    if (typeof callback === 'function') {
      void promise.then(
        (result) =>
          action === 'delete'
            ? callback(undefined)
            : callback(result, undefined),
        (error) =>
          action === 'delete'
            ? callback(error.message)
            : callback(undefined, error.message),
      );
    }
    return promise;
  };
  const __legacyCookie = {
    list: (details, callback) => {
      void __cookie('list', details, callback);
    },
    set: (details, callback) => {
      void __cookie('set', details, callback);
    },
    delete: (details, callback) => {
      void __cookie('delete', details, callback);
    },
  };
  const __audioListeners = new Map();
  const __audio = {
    setMute(details, callback) {
      const normalized =
        typeof details === 'boolean' ? { muted: details } : details || {};
      void __requestCapability('audio-set-muted', normalized).then(
        (state) => callback?.(state),
        __reportError,
      );
    },
    getState(callback) {
      void __requestCapability('audio-get-state').then(
        (state) => callback?.(state),
        __reportError,
      );
    },
    addStateChangeListener(listener, callback) {
      if (typeof listener !== 'function') {
        throw new TypeError('GM_audio.addStateChangeListener needs a listener.');
      }
      const eventId = __eventId('audio');
      __audioListeners.set(eventId, listener);
      __capabilityListeners.set(eventId, (message) =>
        listener(message.data),
      );
      void __requestCapability('audio-subscribe', { eventId }).then(
        () => callback?.(eventId),
        __reportError,
      );
      return eventId;
    },
    removeStateChangeListener(listenerId, callback) {
      const eventId = String(listenerId);
      __audioListeners.delete(eventId);
      __capabilityListeners.delete(eventId);
      void __requestCapability('audio-unsubscribe', { eventId }).then(
        () => callback?.(),
        __reportError,
      );
    },
  };
  let __webRequestEventId = null;
  const __webRequest = (rules, listener) => {
    if (__webRequestEventId) {
      const previous = __webRequestEventId;
      __capabilityListeners.delete(previous);
      void __requestCapability('web-request-unregister', {
        eventId: previous,
      }).catch(__reportError);
    }
    const eventId = __eventId('web-request');
    __webRequestEventId = eventId;
    if (typeof listener === 'function') {
      __capabilityListeners.set(eventId, (message) => {
        const detail = message.data || {};
        const rule = Array.isArray(rules) ? rules[detail.ruleIndex] : undefined;
        const action =
          typeof rule?.action === 'string'
            ? rule.action
            : rule?.action?.cancel
              ? 'cancel'
              : 'redirect';
        const redirect = rule?.action?.redirect;
        listener(action, 'ok', {
          rule,
          url: detail.request?.url,
          redirect_url:
            typeof redirect === 'string'
              ? redirect
              : redirect?.url ?? redirect?.to,
        });
      });
    }
    void __requestCapability('web-request-register', {
      rules,
      eventId,
    }).catch((error) => {
      __capabilityListeners.delete(eventId);
      __reportError(error);
      listener?.('cancel', 'error', { description: error.message });
    });
  };
`;
}
