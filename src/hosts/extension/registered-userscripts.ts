import type { UserscriptResourceBundle } from '../../userscript/application/resource-loader';
import {
  createUserscriptMatchPlan,
  matchPatternCompatibility,
  normalizeMatchPattern,
  type UserscriptMatchPlan,
  validateMatchPattern,
} from '../../userscript/domain/matcher';
import { stripUserscriptMetadata } from '../../userscript/domain/metadata';
import type { InstalledUserscript } from '../../userscript/domain/types';
import {
  runtimeCompatibilityDiagnostics,
  userscriptNeedsUnsafeWindowBridge,
  userscriptRunsInMainWorld,
} from '../../userscript/runtime/compatibility';
import { userscriptInfo } from '../../userscript/runtime/info';
import type { RegisteredUserScript } from './api';
import { CONTENT_HOST_EXCLUDE_MATCHES } from './content-host-url';
import {
  MAIN_WORLD_COMMAND_EVENT,
  MAIN_WORLD_RUNTIME_EVENT,
  MAIN_WORLD_SYNC_EVENT,
  userScriptPortName,
} from './protocol';
import { userscriptCapabilityBootstrap } from './userscript-capability-bootstrap';

export type RegistrationIdentity = {
  capability: string;
  registrationId: string;
  worldId: string;
};

function stableIdentifier(value: string) {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
  }
  return `${(left >>> 0).toString(36)}${(right >>> 0).toString(36)}`;
}

export function defaultRegistrationIdentity(
  scriptId: string,
): RegistrationIdentity {
  const id = stableIdentifier(scriptId);
  return {
    capability: `cap-${id}`,
    registrationId: `card-${id}`,
    worldId: `card-world-${id}`,
  };
}

export function unsafeWindowBridgeRegistrationId(
  identity: RegistrationIdentity,
) {
  return `${identity.registrationId}-unsafe-window`;
}

function unsafeWindowBridgeDescriptor(identity: RegistrationIdentity) {
  const channel = stableIdentifier(identity.capability);
  return {
    eventName: `card-master:unsafe-window:${channel}`,
    readyEventName: `card-master:unsafe-window-ready:${channel}`,
    markerAttribute: `data-card-master-unsafe-window-${channel}`,
    requestAttribute: 'data-card-master-unsafe-window-request',
    responseAttribute: 'data-card-master-unsafe-window-response',
  };
}

function nativeRegistrationPatterns(script: InstalledUserscript) {
  const hasManagerInclusions =
    script.manager.userMatches.length > 0 ||
    script.manager.userIncludes.length > 0;
  const inclusionPatterns = hasManagerInclusions
    ? [...script.manager.userMatches, ...script.manager.userIncludes]
    : [...script.metadata.matches, ...script.metadata.includes];
  const runtimeOnlyInclusion = inclusionPatterns.some(
    (pattern) => matchPatternCompatibility(pattern) !== 'native',
  );
  const matches = runtimeOnlyInclusion
    ? []
    : [
        ...new Set(
          inclusionPatterns
            .map(normalizeMatchPattern)
            .filter((pattern) => !validateMatchPattern(pattern)),
        ),
      ];
  const excludeMatches = [
    ...new Set(
      [
        ...CONTENT_HOST_EXCLUDE_MATCHES,
        ...script.metadata.excludeMatches,
        ...script.metadata.excludes,
        ...script.manager.userExcludeMatches,
        ...script.manager.userExcludes,
      ]
        .map(normalizeMatchPattern)
        .filter(
          (pattern) =>
            !pattern.includes('?') &&
            !pattern.includes('#') &&
            !validateMatchPattern(pattern),
        ),
    ),
  ];
  return {
    matches: matches.length > 0 ? matches : ['<all_urls>'],
    excludeMatches,
  };
}

function runAt(script: InstalledUserscript) {
  switch (script.metadata.runAt) {
    case 'document-start':
    case 'document-body':
      return 'document_start' as const;
    case 'document-end':
      return 'document_end' as const;
    case 'document-idle':
      return 'document_idle' as const;
  }
}

function eligibilityPrelude(plan: UserscriptMatchPlan) {
  return `
  const __matchPlan = ${JSON.stringify(plan)};
  const __matchesAny = (patterns, value) =>
    patterns.some(({ source, flags }) => new RegExp(source, flags).test(value));
  const __url = new URL(location.href);
  const __authority = __url.protocol === 'file:' ? '' : '//' + __url.hostname;
  const __matchTarget = __url.protocol + __authority + __url.pathname;
  const __includeUrl = new URL(__url.href);
  __includeUrl.hash = '';
  const __includeTarget = __includeUrl.href;
  const __included =
    __matchesAny(__matchPlan.inclusions.matches, __matchTarget) ||
    __matchesAny(__matchPlan.inclusions.includes, __includeTarget);
  const __excluded =
    __matchesAny(__matchPlan.exclusions.matches, __matchTarget) ||
    __matchesAny(__matchPlan.exclusions.includes, __includeTarget);
  if (!__included || __excluded) return;
`;
}

function bodyWait(script: InstalledUserscript) {
  return script.metadata.runAt === 'document-body'
    ? `
  if (!document.body) {
    await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!document.body) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }
`
    : '';
}

function commandResultSerializerBootstrap() {
  return `
  const __serializeCommandResult = (value) => {
    if (value === undefined) return undefined;
    try {
      const json = JSON.stringify(
        value,
        (_key, item) => typeof item === 'bigint' ? item.toString() : item,
      );
      if (json === undefined) return String(value).slice(0, 65536);
      if (json.length > 65536) {
        return {
          truncated: true,
          preview: json.slice(0, 65536),
        };
      }
      return JSON.parse(json);
    } catch {
      return String(value).slice(0, 65536);
    }
  };
`;
}

const INITIAL_VALUE_GRANTS = new Set([
  'GM_getValue',
  'GM_setValue',
  'GM_deleteValue',
  'GM_listValues',
  'GM_getValues',
  'GM_setValues',
  'GM_deleteValues',
  'GM_addValueChangeListener',
  'GM_removeValueChangeListener',
  'GM.getValue',
  'GM.setValue',
  'GM.deleteValue',
  'GM.listValues',
  'GM.getValues',
  'GM.setValues',
  'GM.deleteValues',
  'GM.addValueChangeListener',
  'GM.removeValueChangeListener',
]);

function initialValuesBootstrap(script: InstalledUserscript) {
  const needsInitialValues = script.metadata.grants.some((grant) =>
    INITIAL_VALUE_GRANTS.has(grant),
  );
  return needsInitialValues
    ? `
  try {
    __values = await __initialized;
  } catch (error) {
    __reportError(error);
    return;
  }
`
    : `
  void __initialized.then(
    (values) => {
      __values = values;
    },
    __reportError,
  );
`;
}

function executableSource(
  script: InstalledUserscript,
  bundle: UserscriptResourceBundle,
) {
  return [...bundle.requires, stripUserscriptMetadata(script.source.code)].join(
    '\n',
  );
}

function mainWorldCode(
  script: InstalledUserscript,
  bundle: UserscriptResourceBundle,
  plan: UserscriptMatchPlan,
  identity: RegistrationIdentity,
) {
  const grants = new Set(script.metadata.grants);
  const apiNames: string[] = [];
  const apiValues: string[] = [];
  if (grants.has('unsafeWindow')) {
    apiNames.push('unsafeWindow');
    apiValues.push('window');
  }
  if (grants.has('GM_info')) {
    apiNames.push('GM_info');
    apiValues.push(JSON.stringify(userscriptInfo(script, bundle)));
  }
  if (grants.has('GM_registerMenuCommand')) {
    apiNames.push('GM_registerMenuCommand');
    apiValues.push('__register');
  }
  if (grants.has('GM_unregisterMenuCommand')) {
    apiNames.push('GM_unregisterMenuCommand');
    apiValues.push('__unregister');
  }
  const modernApi: string[] = [];
  if (grants.has('GM.info')) {
    modernApi.push(`info: ${JSON.stringify(userscriptInfo(script, bundle))}`);
  }
  if (grants.has('GM.registerMenuCommand')) {
    modernApi.push(
      'registerMenuCommand: async (...args) => __register(...args)',
    );
  }
  if (grants.has('GM.unregisterMenuCommand')) {
    modernApi.push('unregisterMenuCommand: async (id) => __unregister(id)');
  }
  if (modernApi.length > 0) {
    apiNames.push('GM');
    apiValues.push(`{ ${modernApi.join(', ')} }`);
  }
  const installUrlChange = grants.has('window.onurlchange')
    ? `
  const __notifyUrlChange = (sourceEvent) => {
    const detail = sourceEvent?.detail || {};
    const event = new Event('urlchange');
    Object.defineProperties(event, {
      oldURL: { value: detail.oldURL || location.href, enumerable: true },
      url: { value: detail.url || location.href, enumerable: true },
    });
    window.dispatchEvent(event);
  };
  document.addEventListener(
    'card-master:url-change',
    __notifyUrlChange,
  );
`
    : '';
  const removeUrlChange = grants.has('window.onurlchange')
    ? `
    document.removeEventListener(
      'card-master:url-change',
      __notifyUrlChange,
    );`
    : '';
  return `(async () => {
${eligibilityPrelude(plan)}
${bodyWait(script)}
${installUrlChange}
  const __scriptId = ${JSON.stringify(script.id)};
  const __capability = ${JSON.stringify(identity.capability)};
  const __replacementEvent =
    'card-master:replace-main-world-userscript:' + __scriptId;
  document.dispatchEvent(new Event(__replacementEvent));
  const __callbacks = new Map();
  const __commands = new Map();
  const __orders = new Map();
  let __owned = true;
  let __runtimeState = null;
  let __sequence = 0;
  let __orderSequence = 0;
${commandResultSerializerBootstrap()}
  const __formatError = (error) => (
    error instanceof Error && typeof error.stack === 'string' && error.stack
      ? error.stack
      : error instanceof Error
        ? error.name + ': ' + error.message
        : String(error)
  ).slice(0, 65536);
  const __report = (message) => setTimeout(() => {
    if (!__owned) return;
    document.dispatchEvent(new CustomEvent(${JSON.stringify(MAIN_WORLD_RUNTIME_EVENT)}, {
      detail: { scriptId: __scriptId, capability: __capability, message },
    }));
  }, 0);
  const __reportRuntimeState = (message) => {
    __runtimeState = message;
    __report(message);
  };
  const __register = (title, callback, options = {}) => {
    if (typeof callback !== 'function') {
      throw new TypeError('GM_registerMenuCommand requires a callback.');
    }
    const normalized = typeof options === 'string' ? {} : options;
    let id;
    if (normalized.id !== undefined) {
      id = String(normalized.id);
    } else {
      do {
        id = 'command-' + (++__sequence);
      } while (__callbacks.has(id));
    }
    const order = __orders.has(id) ? __orders.get(id) : __orderSequence++;
    __orders.set(id, order);
    __callbacks.set(id, callback);
    const command = {
      id,
      title: String(title),
      description: typeof normalized.title === 'string' ? normalized.title : undefined,
      autoClose: normalized.autoClose !== false,
      order,
    };
    __commands.set(id, command);
    __report({ type: 'register-command', command });
    return id;
  };
  const __unregister = (commandId) => {
    const id = String(commandId);
    __callbacks.delete(id);
    __commands.delete(id);
    __orders.delete(id);
    __report({ type: 'unregister-command', commandId: id });
  };
  const __replayRuntimeState = () => {
    if (!__owned) return;
    for (const command of __commands.values()) {
      __report({ type: 'register-command', command });
    }
    if (__runtimeState) __report(__runtimeState);
  };
  document.addEventListener(
    ${JSON.stringify(MAIN_WORLD_SYNC_EVENT)},
    __replayRuntimeState,
  );
  const __handleCommandInvocation = (event) => {
    if (!__owned) return;
    const detail =
      event && event.detail && typeof event.detail === 'object'
        ? event.detail
        : null;
    if (
      !detail ||
      detail.scriptId !== __scriptId ||
      detail.capability !== __capability ||
      typeof detail.commandId !== 'string' ||
      typeof detail.invocationId !== 'string'
    ) {
      return;
    }
    const callback = __callbacks.get(detail.commandId);
    if (!callback) {
      __report({
        type: 'command-result',
        invocationId: detail.invocationId,
        error: 'The runtime command is no longer registered.',
      });
      return;
    }
    Promise.resolve()
      .then(() => callback())
      .then(
        (value) => __report({
          type: 'command-result',
          invocationId: detail.invocationId,
          value: __serializeCommandResult(value),
        }),
        (error) => {
          const runtimeError = __formatError(error);
          __reportRuntimeState({ type: 'runtime-error', error: runtimeError });
          __report({
            type: 'command-result',
            invocationId: detail.invocationId,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
  };
  const __disposeRuntime = () => {
    if (!__owned) return;
    __owned = false;
    document.removeEventListener(
      ${JSON.stringify(MAIN_WORLD_SYNC_EVENT)},
      __replayRuntimeState,
    );
    document.removeEventListener(
      ${JSON.stringify(MAIN_WORLD_COMMAND_EVENT)},
      __handleCommandInvocation,
    );
    __callbacks.clear();
    __commands.clear();
    __orders.clear();
    __runtimeState = null;
${removeUrlChange}
  };
  document.addEventListener(__replacementEvent, __disposeRuntime, {
    once: true,
  });
  document.addEventListener(
    ${JSON.stringify(MAIN_WORLD_COMMAND_EVENT)},
    __handleCommandInvocation,
  );
  try {
    await (async (${apiNames.join(', ')}) => {
${executableSource(script, bundle)}
    })(${apiValues.join(', ')});
    __reportRuntimeState({ type: 'ready' });
  } catch (error) {
    __reportRuntimeState({
      type: 'runtime-error',
      error: __formatError(error),
    });
    console.error('[Userscript:${script.id}]', error);
  }
})();`;
}

function unsafeWindowMainBridgeCode(
  plan: UserscriptMatchPlan,
  identity: RegistrationIdentity,
) {
  const descriptor = unsafeWindowBridgeDescriptor(identity);
  return `(() => {
${eligibilityPrelude(plan)}
  const __eventName = ${JSON.stringify(descriptor.eventName)};
  const __readyEventName = ${JSON.stringify(descriptor.readyEventName)};
  const __replacementEvent = __eventName + ':replace';
  document.dispatchEvent(new Event(__replacementEvent));
  const __markerAttribute = ${JSON.stringify(descriptor.markerAttribute)};
  const __requestAttribute = ${JSON.stringify(descriptor.requestAttribute)};
  const __responseAttribute = ${JSON.stringify(descriptor.responseAttribute)};
  const __references = new Map([['window', window]]);
  const __referenceIds = new WeakMap([[window, 'window']]);
  let __referenceSequence = 0;
  const __storeReference = (value) => {
    const existing = __referenceIds.get(value);
    if (existing) return existing;
    const id = 'page-' + (++__referenceSequence);
    __referenceIds.set(value, id);
    __references.set(id, value);
    return id;
  };
  const __encode = (value, owner) => {
    if (value === undefined) return { kind: 'undefined' };
    if (value === null) return { kind: 'value', value: null };
    const type = typeof value;
    if (type === 'bigint') return { kind: 'bigint', value: String(value) };
    if (type === 'number' && !Number.isFinite(value)) {
      return { kind: 'number', value: String(value) };
    }
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return { kind: 'value', value };
    }
    if (type === 'object' || type === 'function') {
      return {
        kind: 'reference',
        id: __storeReference(value),
        ownerId:
          type === 'function' && owner && (typeof owner === 'object' || typeof owner === 'function')
            ? __storeReference(owner)
            : undefined,
        callable: type === 'function',
      };
    }
    throw new TypeError('unsafeWindow cannot transfer values of type ' + type + '.');
  };
  const __decode = (value) => {
    if (!value || typeof value !== 'object') return value;
    if (value.kind === 'undefined') return undefined;
    if (value.kind === 'bigint') return BigInt(value.value);
    if (value.kind === 'number') return Number(value.value);
    if (value.kind === 'value') return value.value;
    if (value.kind === 'reference') {
      if (!__references.has(value.id)) {
        throw new ReferenceError('unsafeWindow reference is no longer available.');
      }
      return __references.get(value.id);
    }
    if (value.kind === 'array') return value.items.map(__decode);
    if (value.kind === 'record') {
      return Object.fromEntries(
        value.entries.map(([key, entry]) => [key, __decode(entry)]),
      );
    }
    throw new TypeError('Invalid unsafeWindow bridge value.');
  };
  const __target = (request) => {
    const id =
      typeof request.referenceId === 'string' ? request.referenceId : 'window';
    if (!__references.has(id)) {
      throw new ReferenceError('unsafeWindow reference is no longer available.');
    }
    return __references.get(id);
  };
  const __handle = (event) => {
    const node = event.target;
    if (
      !(node instanceof Element) ||
      node.getAttribute(__markerAttribute) !== '1'
    ) {
      return;
    }
    let response;
    try {
      const request = JSON.parse(node.getAttribute(__requestAttribute) || '{}');
      if (request.operation === 'ping') {
        response = { kind: 'value', value: true };
      } else if (request.operation === 'get') {
        const target = __target(request);
        response = __encode(
          Reflect.get(target, String(request.property), target),
          target,
        );
      } else if (request.operation === 'set') {
        const target = __target(request);
        if (
          !Reflect.set(
            target,
            String(request.property),
            __decode(request.value),
            target,
          )
        ) {
          throw new TypeError('unsafeWindow property assignment failed.');
        }
        response = { kind: 'value', value: true };
      } else if (request.operation === 'delete') {
        response = {
          kind: 'value',
          value: Reflect.deleteProperty(
            __target(request),
            String(request.property),
          ),
        };
      } else if (request.operation === 'has') {
        response = {
          kind: 'value',
          value: Reflect.has(__target(request), String(request.property)),
        };
      } else if (request.operation === 'own-keys') {
        response = {
          kind: 'array',
          items: Reflect.ownKeys(__target(request))
            .filter((key) => typeof key === 'string')
            .map((key) => ({ kind: 'value', value: key })),
        };
      } else if (request.operation === 'call') {
        const target = __target(request);
        if (typeof target !== 'function') {
          throw new TypeError('unsafeWindow target is not callable.');
        }
        response = __encode(
          Reflect.apply(
            target,
            typeof request.ownerId === 'string' &&
              __references.has(request.ownerId)
              ? __references.get(request.ownerId)
              : window,
            Array.isArray(request.args) ? request.args.map(__decode) : [],
          ),
          undefined,
        );
      } else if (request.operation === 'construct') {
        const target = __target(request);
        if (typeof target !== 'function') {
          throw new TypeError('unsafeWindow target is not constructable.');
        }
        response = __encode(
          Reflect.construct(
            target,
            Array.isArray(request.args) ? request.args.map(__decode) : [],
          ),
          undefined,
        );
      } else if (request.operation === 'primitive') {
        const value = __target(request);
        response = __encode(
          request.hint === 'number' ? Number(value) : String(value),
          undefined,
        );
      } else {
        throw new TypeError('Unknown unsafeWindow bridge operation.');
      }
    } catch (error) {
      response = {
        kind: 'error',
        message:
          error instanceof Error
            ? error.name + ': ' + error.message
            : String(error),
      };
    }
    node.setAttribute(__responseAttribute, JSON.stringify(response));
  };
  document.addEventListener(__eventName, __handle, true);
  document.addEventListener(
    __replacementEvent,
    () => document.removeEventListener(__eventName, __handle, true),
    { once: true },
  );
  document.dispatchEvent(new Event(__readyEventName));
})();`;
}

function unsafeWindowProxyBootstrap(
  script: InstalledUserscript,
  identity: RegistrationIdentity,
) {
  if (!userscriptNeedsUnsafeWindowBridge(script)) return '';
  const descriptor = unsafeWindowBridgeDescriptor(identity);
  return `
  if (!document.documentElement) {
    await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!document.documentElement) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document, { childList: true, subtree: true });
    });
  }
  const __unsafeBridgeNode = document.createElement('span');
  __unsafeBridgeNode.setAttribute(${JSON.stringify(descriptor.markerAttribute)}, '1');
  __unsafeBridgeNode.style.cssText = 'display:none!important';
  document.documentElement.append(__unsafeBridgeNode);
  const __dispatchUnsafeRequest = (request) => {
    __unsafeBridgeNode.setAttribute(
      ${JSON.stringify(descriptor.requestAttribute)},
      JSON.stringify(request),
    );
    __unsafeBridgeNode.removeAttribute(${JSON.stringify(descriptor.responseAttribute)});
    __unsafeBridgeNode.dispatchEvent(new Event(${JSON.stringify(descriptor.eventName)}));
    const serialized = __unsafeBridgeNode.getAttribute(
      ${JSON.stringify(descriptor.responseAttribute)},
    );
    __unsafeBridgeNode.removeAttribute(${JSON.stringify(descriptor.requestAttribute)});
    __unsafeBridgeNode.removeAttribute(${JSON.stringify(descriptor.responseAttribute)});
    return serialized ? JSON.parse(serialized) : null;
  };
  let __unsafeBridgeReady = false;
  const __checkUnsafeBridge = () => {
    __unsafeBridgeReady =
      __dispatchUnsafeRequest({ operation: 'ping', path: [] })?.value === true;
  };
  const __handleUnsafeBridgeReady = () => {
    __checkUnsafeBridge();
  };
  document.addEventListener(
    ${JSON.stringify(descriptor.readyEventName)},
    __handleUnsafeBridgeReady,
  );
  __checkUnsafeBridge();
  for (let attempt = 0; attempt < 40 && !__unsafeBridgeReady; attempt += 1) {
    if (!__unsafeBridgeReady) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      __checkUnsafeBridge();
    }
  }
  document.removeEventListener(
    ${JSON.stringify(descriptor.readyEventName)},
    __handleUnsafeBridgeReady,
  );
  if (!__unsafeBridgeReady) {
    __unsafeBridgeNode.remove();
    __reportError(new Error('The unsafeWindow page bridge is unavailable.'));
    return;
  }
  const __unsafeRequest = (request) => {
    const response = __dispatchUnsafeRequest(request);
    if (!response) throw new Error('The unsafeWindow page bridge disconnected.');
    if (response.kind === 'error') throw new Error(response.message);
    return response;
  };
  const __unsafeProxyMetadata = new WeakMap();
  const __encodeUnsafeValue = (value, seen = new WeakSet()) => {
    if (value === undefined) return { kind: 'undefined' };
    if (value === null) return { kind: 'value', value: null };
    const type = typeof value;
    if (type === 'bigint') return { kind: 'bigint', value: String(value) };
    if (type === 'number' && !Number.isFinite(value)) {
      return { kind: 'number', value: String(value) };
    }
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return { kind: 'value', value };
    }
    if (type === 'function') {
      const metadata = __unsafeProxyMetadata.get(value);
      if (metadata) return { kind: 'reference', id: metadata.id };
      throw new TypeError(
        'unsafeWindow cannot transfer an isolated-world function to the page.',
      );
    }
    const metadata = __unsafeProxyMetadata.get(value);
    if (metadata) return { kind: 'reference', id: metadata.id };
    if (value instanceof Node) {
      throw new TypeError(
        'unsafeWindow cannot transfer an isolated-world DOM wrapper to the page.',
      );
    }
    if (seen.has(value)) {
      throw new TypeError('unsafeWindow cannot transfer a cyclic local value.');
    }
    seen.add(value);
    if (Array.isArray(value)) {
      const encoded = {
        kind: 'array',
        items: value.map((entry) => __encodeUnsafeValue(entry, seen)),
      };
      seen.delete(value);
      return encoded;
    }
    const encoded = {
      kind: 'record',
      entries: Object.entries(value).map(([key, entry]) => [
        key,
        __encodeUnsafeValue(entry, seen),
      ]),
    };
    seen.delete(value);
    return encoded;
  };
  let __unsafeReference;
  const __decodeUnsafeValue = (response) => {
    if (response.kind === 'undefined') return undefined;
    if (response.kind === 'bigint') return BigInt(response.value);
    if (response.kind === 'number') return Number(response.value);
    if (response.kind === 'array') {
      return response.items.map(__decodeUnsafeValue);
    }
    if (response.kind === 'reference') {
      return __unsafeReference(
        response.id,
        response.callable,
        response.ownerId,
      );
    }
    return response.value;
  };
  __unsafeReference = (referenceId, callable = false, ownerId) => {
    const target = callable ? function () {} : Object.create(null);
    const proxy = new Proxy(target, {
      get: (_target, property) => {
        if (property === Symbol.toStringTag) {
          return referenceId === 'window' ? 'Window' : 'Object';
        }
        if (property === Symbol.toPrimitive) {
          return (hint) =>
            __decodeUnsafeValue(
              __unsafeRequest({
                operation: 'primitive',
                referenceId,
                hint,
              }),
            );
        }
        if (property === 'then' || typeof property === 'symbol') return undefined;
        return __decodeUnsafeValue(
          __unsafeRequest({
            operation: 'get',
            referenceId,
            property: String(property),
          }),
        );
      },
      set: (_target, property, value) =>
        Boolean(
          __decodeUnsafeValue(
            __unsafeRequest({
              operation: 'set',
              referenceId,
              property: String(property),
              value: __encodeUnsafeValue(value),
            }),
          ),
        ),
      deleteProperty: (_target, property) =>
        Boolean(
          __decodeUnsafeValue(
            __unsafeRequest({
              operation: 'delete',
              referenceId,
              property: String(property),
            }),
          ),
        ),
      has: (_target, property) =>
        Boolean(
          __decodeUnsafeValue(
            __unsafeRequest({
              operation: 'has',
              referenceId,
              property: String(property),
            }),
          ),
        ),
      ownKeys: (localTarget) => [
        ...new Set([
          ...Reflect.ownKeys(localTarget),
          ...__decodeUnsafeValue(
            __unsafeRequest({ operation: 'own-keys', referenceId }),
          ),
        ]),
      ],
      getOwnPropertyDescriptor: (localTarget, property) =>
        Reflect.getOwnPropertyDescriptor(localTarget, property) || {
          configurable: true,
          enumerable: true,
        },
      apply: (_target, _thisArg, args) =>
        __decodeUnsafeValue(
          __unsafeRequest({
            operation: 'call',
            referenceId,
            ownerId,
            args: args.map((value) => __encodeUnsafeValue(value)),
          }),
        ),
      construct: (_target, args) =>
        __decodeUnsafeValue(
          __unsafeRequest({
            operation: 'construct',
            referenceId,
            args: args.map((value) => __encodeUnsafeValue(value)),
          }),
        ),
    });
    __unsafeProxyMetadata.set(proxy, { id: referenceId, ownerId });
    return proxy;
  };
  const __unsafeWindow = __unsafeReference('window');
`;
}

function userScriptWorldCode(
  script: InstalledUserscript,
  bundle: UserscriptResourceBundle,
  plan: UserscriptMatchPlan,
  identity: RegistrationIdentity,
) {
  const source = executableSource(script, bundle);
  const info = userscriptInfo(script, bundle);
  return `(async () => {
${eligibilityPrelude(plan)}
${bodyWait(script)}
  const __runtime = globalThis.browser?.runtime ?? globalThis.chrome?.runtime;
  if (!__runtime?.connect) {
    throw new Error('用户脚本管理运行环境不可用。');
  }
  const __port = __runtime.connect({
    name: ${JSON.stringify(userScriptPortName(script.id, identity.capability))},
  });
  const __connectionError = () => new Error('用户脚本管理连接已关闭。');
  const __send = (message) => {
    try {
      __port.postMessage(message);
      return true;
    } catch {
      return false;
    }
  };
  const __formatError = (error) => {
    if (!(error instanceof Error)) return String(error);
    const text = typeof error.stack === 'string' && error.stack
      ? error.stack
      : error.name + ': ' + error.message;
    return text.slice(0, 65536);
  };
  const __reportError = (error) => __send({
    type: 'runtime-error',
    error: __formatError(error),
  });
${commandResultSerializerBootstrap()}
  const __callbacks = new Map();
  const __orders = new Map();
  const __requests = new Map();
  const __aiRequests = new Map();
  const __mutations = new Map();
  const __valueListeners = new Map();
  const __capabilityRequests = new Map();
  const __capabilityListeners = new Map();
  let __sequence = 0;
  let __orderSequence = 0;
  let __requestSequence = 0;
  let __aiRequestSequence = 0;
  let __mutationSequence = 0;
  let __valueListenerSequence = 0;
  let __capabilitySequence = 0;
  let __initialize;
  let __rejectInitialize;
  const __initialized = new Promise((resolve, reject) => {
    __initialize = resolve;
    __rejectInitialize = reject;
  });
  let __values = {};
  __port.onMessage.addListener((message) => {
    if (message?.type === 'initialize') {
      __initialize(message.values || {});
    }
    if (message?.type === 'invoke-command') {
      const callback = __callbacks.get(String(message.commandId));
      if (!callback) {
        __send({
          type: 'command-result',
          invocationId: message.invocationId,
          error: 'The runtime command is no longer registered.',
        });
        return;
      }
      Promise.resolve()
        .then(() => callback())
        .then(
          (value) => __send({
            type: 'command-result',
            invocationId: message.invocationId,
            value: __serializeCommandResult(value),
          }),
          (error) => {
            const runtimeError = error instanceof Error ? error.message : String(error);
            __reportError(error);
            __send({
              type: 'command-result',
              invocationId: message.invocationId,
              error: runtimeError,
            });
          },
        );
    }
    if (message?.type === 'value-changed') {
      const oldValue = Object.hasOwn(__values, message.key)
        ? structuredClone(__values[message.key])
        : undefined;
      if (message.deleted) delete __values[message.key];
      else __values[message.key] = structuredClone(message.value);
      const mutation = message.mutationId
        ? __mutations.get(String(message.mutationId))
        : undefined;
      if (mutation) {
        __mutations.delete(String(message.mutationId));
        message.error ? mutation.reject(new Error(message.error)) : mutation.resolve();
      }
      if (!mutation || message.error) {
        const newValue = message.deleted
          ? undefined
          : structuredClone(message.value);
        for (const listener of __valueListeners.values()) {
          if (listener.key !== message.key) continue;
          try {
            listener.callback(
              message.key,
              oldValue,
              newValue,
              !message.mutationId,
            );
          } catch (error) {
            __reportError(error);
          }
        }
      }
    }
    if (message?.type === 'values-reset') {
      const previousValues = __values;
      __values =
        message.values && typeof message.values === 'object'
          ? structuredClone(message.values)
          : {};
      const keys = new Set([
        ...Object.keys(previousValues),
        ...Object.keys(__values),
      ]);
      for (const key of keys) {
        const oldValue = Object.hasOwn(previousValues, key)
          ? previousValues[key]
          : undefined;
        const newValue = Object.hasOwn(__values, key)
          ? __values[key]
          : undefined;
        __notifyValueListeners(key, oldValue, newValue, true);
      }
    }
    if (message?.type === 'http-response') {
      const pending = __requests.get(String(message.requestId));
      if (!pending) return;
      __requests.delete(String(message.requestId));
      if (message.error) {
        const error = Object.assign(new Error(message.error.message), { kind: message.error.kind });
        pending.reject(error);
      } else {
        pending.resolve(message.response);
      }
    }
    if (message?.type === 'http-event') {
      const pending = __requests.get(String(message.requestId));
      if (!pending) return;
      pending.dispatch?.(message.event);
    }
    if (message?.type === 'ai-response') {
      const pending = __aiRequests.get(String(message.requestId));
      if (!pending) return;
      __aiRequests.delete(String(message.requestId));
      message.error
        ? pending.reject(new Error(message.error))
        : pending.resolve(message.response);
    }
    if (message?.type === 'capability-response') {
      const pending = __capabilityRequests.get(String(message.requestId));
      if (!pending) return;
      __capabilityRequests.delete(String(message.requestId));
      message.error
        ? pending.reject(new Error(message.error))
        : pending.resolve(message.result);
    }
    if (message?.type === 'capability-event') {
      const listener = __capabilityListeners.get(String(message.eventId));
      if (!listener) return;
      try {
        listener(message);
      } catch (error) {
        __reportError(error);
      }
    }
  });
  __port.onDisconnect.addListener(() => {
    void __runtime.lastError;
    __rejectInitialize(__connectionError());
    for (const mutation of __mutations.values()) mutation.reject(__connectionError());
    __mutations.clear();
    for (const request of __requests.values()) {
      request.reject(Object.assign(__connectionError(), { kind: 'network' }));
    }
    __requests.clear();
    for (const request of __aiRequests.values()) {
      request.reject(__connectionError());
    }
    __aiRequests.clear();
    for (const request of __capabilityRequests.values()) {
      request.reject(__connectionError());
    }
    __capabilityRequests.clear();
    __capabilityListeners.clear();
    __valueListeners.clear();
  });
${initialValuesBootstrap(script)}
${unsafeWindowProxyBootstrap(script, identity)}
  const __grants = new Set(${JSON.stringify(script.metadata.grants)});
  const __granted = (...names) =>
    !__grants.has('none') && names.some((name) => __grants.has(name));
  const __installUrlChange = () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'onurlchange');
    let assignedHandler = null;
    if (!originalDescriptor || originalDescriptor.configurable) {
      Object.defineProperty(window, 'onurlchange', {
        configurable: true,
        enumerable: true,
        get: () => assignedHandler,
        set: (value) => {
          if (assignedHandler) window.removeEventListener('urlchange', assignedHandler);
          assignedHandler = typeof value === 'function' ? value : null;
          if (assignedHandler) window.addEventListener('urlchange', assignedHandler);
        },
      });
    }
    const notify = (sourceEvent) => {
      const detail = sourceEvent?.detail || {};
      const event = new Event('urlchange');
      Object.defineProperties(event, {
        oldURL: { value: detail.oldURL || location.href, enumerable: true },
        url: { value: detail.url || location.href, enumerable: true },
      });
      window.dispatchEvent(event);
    };
    document.addEventListener('card-master:url-change', notify);
    return () => {
      document.removeEventListener('card-master:url-change', notify);
      if (assignedHandler) window.removeEventListener('urlchange', assignedHandler);
      if (originalDescriptor) {
        Object.defineProperty(window, 'onurlchange', originalDescriptor);
      } else {
        delete window.onurlchange;
      }
    };
  };
  if (__granted('window.onurlchange')) {
    __installUrlChange();
  }
  const __register = (title, callback, options = {}) => {
    if (typeof callback !== 'function') {
      throw new TypeError('GM_registerMenuCommand requires a callback.');
    }
    const normalized = typeof options === 'string' ? {} : options;
    let id;
    if (normalized.id !== undefined) {
      id = String(normalized.id);
    } else {
      do {
        id = 'command-' + (++__sequence);
      } while (__callbacks.has(id));
    }
    const order = __orders.has(id) ? __orders.get(id) : __orderSequence++;
    __orders.set(id, order);
    __callbacks.set(id, callback);
    if (!__send({
      type: 'register-command',
      command: {
        id,
        title: String(title),
        description: typeof normalized.title === 'string' ? normalized.title : undefined,
        autoClose: normalized.autoClose !== false,
        order,
      },
    })) {
      throw __connectionError();
    }
    return id;
  };
  const __unregister = (commandId) => {
    const id = String(commandId);
    __callbacks.delete(id);
    __orders.delete(id);
    __send({ type: 'unregister-command', commandId: id });
  };
  const __getValue = (key, fallback) =>
    Object.hasOwn(__values, key) ? structuredClone(__values[key]) : fallback;
  const __notifyValueListeners = (key, oldValue, newValue, remote) => {
    for (const listener of __valueListeners.values()) {
      if (listener.key !== key) continue;
      try {
        listener.callback(
          key,
          structuredClone(oldValue),
          structuredClone(newValue),
          remote,
        );
      } catch (error) {
        __reportError(error);
      }
    }
  };
  const __mutateValue = (type, key, value) => {
    const mutationId = 'mutation-' + (++__mutationSequence);
    const promise = new Promise((resolve, reject) => {
      __mutations.set(mutationId, { resolve, reject });
    });
    if (!__send({ type, mutationId, key, value })) {
      const mutation = __mutations.get(mutationId);
      __mutations.delete(mutationId);
      mutation?.reject(__connectionError());
    }
    return promise;
  };
  const __setValue = (key, value) => {
    const name = String(key);
    const oldValue = Object.hasOwn(__values, name)
      ? structuredClone(__values[name])
      : undefined;
    const clone = structuredClone(value);
    __values[name] = clone;
    __notifyValueListeners(name, oldValue, clone, false);
    return __mutateValue('set-value', name, clone);
  };
  const __deleteValue = (key) => {
    const name = String(key);
    const oldValue = Object.hasOwn(__values, name)
      ? structuredClone(__values[name])
      : undefined;
    delete __values[name];
    __notifyValueListeners(name, oldValue, undefined, false);
    return __mutateValue('delete-value', name);
  };
  const __listValues = () => Object.keys(__values);
  const __getValues = (keysOrDefaults) => {
    const result = {};
    if (Array.isArray(keysOrDefaults)) {
      for (const key of keysOrDefaults) {
        const name = String(key);
        if (Object.hasOwn(__values, name)) {
          result[name] = structuredClone(__values[name]);
        }
      }
      return result;
    }
    if (keysOrDefaults && typeof keysOrDefaults === 'object') {
      for (const [key, fallback] of Object.entries(keysOrDefaults)) {
        result[key] = __getValue(key, fallback);
      }
      return result;
    }
    for (const [key, value] of Object.entries(__values)) {
      result[key] = structuredClone(value);
    }
    return result;
  };
  const __setValues = (values) => {
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      return Promise.reject(new TypeError('GM_setValues requires an object.'));
    }
    return Promise.all(
      Object.entries(values).map(([key, value]) => __setValue(key, value)),
    ).then(() => undefined);
  };
  const __deleteValues = (keys) => {
    if (!Array.isArray(keys)) {
      return Promise.reject(new TypeError('GM_deleteValues requires an array.'));
    }
    return Promise.all(keys.map((key) => __deleteValue(String(key)))).then(
      () => undefined,
    );
  };
  const __addValueChangeListener = (key, callback) => {
    if (typeof callback !== 'function') {
      throw new TypeError('GM_addValueChangeListener requires a callback.');
    }
    const listenerId = 'value-listener-' + (++__valueListenerSequence);
    __valueListeners.set(listenerId, { key: String(key), callback });
    return listenerId;
  };
  const __removeValueChangeListener = (listenerId) =>
    __valueListeners.delete(String(listenerId));
  const __requestCapability = (capability, payload) => {
    const requestId = 'capability-' + (++__capabilitySequence);
    const promise = new Promise((resolve, reject) => {
      __capabilityRequests.set(requestId, { resolve, reject });
      if (!__send({
        type: 'capability-request',
        requestId,
        capability,
        payload,
      })) {
        __capabilityRequests.delete(requestId);
        reject(__connectionError());
      }
    });
    return promise;
  };
  const __eventId = (prefix) => prefix + '-' + (++__capabilitySequence);
  const __resources = ${JSON.stringify(bundle.resources)};
  const __getResourceText = (name) => __resources[name]?.text;
  const __getResourceUrl = (name) => __resources[name]?.dataUrl;
  const __callRequestHandler = (callback, event) => {
    if (typeof callback !== 'function') return;
    try {
      callback(event);
    } catch (error) {
      __reportError(error);
    }
  };
  const __startRequest = (details, requestType = 'http-request') => {
    const {
      onabort,
      onerror,
      onload,
      ontimeout,
      onloadstart,
      onprogress,
      onreadystatechange,
      onloadend,
      ...requestDetails
    } = details;
    const requestId = 'request-' + (++__requestSequence);
    const promise = new Promise((resolve, reject) => {
      __requests.set(requestId, {
        resolve,
        reject,
        dispatch(event) {
          if (!event || typeof event !== 'object') return;
          if (event.type === 'loadstart') {
            __callRequestHandler(onloadstart, event);
          }
          if (event.type === 'progress') {
            __callRequestHandler(onprogress, event);
          }
          if (event.type === 'readystatechange') {
            __callRequestHandler(onreadystatechange, event);
          }
        },
      });
      if (!__send({ type: requestType, requestId, details: requestDetails })) {
        __requests.delete(requestId);
        reject(Object.assign(__connectionError(), { kind: 'network' }));
      }
    });
    void promise
      .then(
        (response) => {
          if (requestDetails.responseType === 'document') {
            try {
              response.response = new DOMParser().parseFromString(
                response.responseText,
                response.responseHeaders
                  ?.toLowerCase()
                  .includes('application/xhtml+xml')
                  ? 'application/xhtml+xml'
                  : 'text/html',
              );
            } catch (error) {
              __reportError(error);
            }
          }
          __callRequestHandler(onreadystatechange, {
            ...response,
            type: 'readystatechange',
          });
          __callRequestHandler(onload, response);
          __callRequestHandler(onloadend, {
            ...response,
            type: 'loadend',
          });
          return response;
        },
        (error) => {
          const terminalError = Object.assign(
            error instanceof Error ? error : new Error(String(error)),
            {
              readyState: 4,
              status: 0,
              statusText: '',
              responseHeaders: '',
              response: null,
              responseText: '',
            },
          );
          __callRequestHandler(onreadystatechange, {
            ...terminalError,
            message: terminalError.message,
            name: terminalError.name,
            type: 'readystatechange',
          });
          if (terminalError.kind === 'timeout') {
            __callRequestHandler(ontimeout, terminalError);
          } else if (terminalError.kind === 'abort') {
            __callRequestHandler(onabort, terminalError);
          } else {
            __callRequestHandler(onerror, terminalError);
          }
          __callRequestHandler(onloadend, {
            ...terminalError,
            message: terminalError.message,
            name: terminalError.name,
            type: 'loadend',
          });
        },
      )
      .catch(__reportError);
    return {
      promise,
      abort: () => __send({ type: 'abort-request', requestId }),
    };
  };
  const __xmlHttpRequest = (details) => {
    const request = __startRequest(details);
    return { abort: request.abort };
  };
  const __modernXmlHttpRequest = (details) => {
    const request = __startRequest(details);
    return Object.assign(request.promise, { abort: request.abort });
  };
  const __clipboardMimeType = (info) => {
    const declared =
      typeof info === 'string'
        ? info
        : info?.mimetype || info?.type || 'text/plain';
    if (declared === 'text') return 'text/plain';
    if (declared === 'html') return 'text/html';
    return declared || 'text/plain';
  };
  const __writeClipboard = async (data, info) => {
    const text = String(data);
    const mimeType = __clipboardMimeType(info);
    if (mimeType === 'text/plain' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {}
    }
    if (navigator.clipboard?.write && typeof ClipboardItem === 'function') {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            [mimeType]: new Blob([text], { type: mimeType }),
          }),
        ]);
        return;
      } catch {}
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText =
      'position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;';
    const handleCopy = (event) => {
      if (!event.clipboardData) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.clipboardData.setData(mimeType, text);
    };
    document.addEventListener('copy', handleCopy, true);
    document.documentElement.append(textarea);
    textarea.focus();
    textarea.select();
    try {
      if (!document.execCommand('copy')) {
        throw new Error('The browser rejected the clipboard write.');
      }
    } finally {
      document.removeEventListener('copy', handleCopy, true);
      textarea.remove();
    }
  };
  const __legacySetClipboard = (data, info, callback) => {
    const promise = __writeClipboard(data, info);
    if (typeof callback === 'function') {
      void promise.then(callback, callback);
    } else {
      void promise.catch(__reportError);
    }
    return promise;
  };
${userscriptCapabilityBootstrap(script.id)}
  const __ai = (request) => {
    const normalized = typeof request === 'string' ? { input: request } : request;
    if (
      !normalized ||
      typeof normalized !== 'object' ||
      typeof normalized.input !== 'string' ||
      !normalized.input.trim() ||
      normalized.input.length > 64000 ||
      (normalized.instructions !== undefined &&
        (typeof normalized.instructions !== 'string' ||
          normalized.instructions.length > 16000)) ||
      (normalized.reasoningEffort !== undefined &&
        !['off', 'low', 'medium', 'high', 'max'].includes(
          normalized.reasoningEffort,
        ))
    ) {
      const rejected = Promise.reject(
        new TypeError('Card Master AI request is invalid.'),
      );
      return Object.assign(rejected, { abort: () => undefined });
    }
    const requestId = 'ai-request-' + (++__aiRequestSequence);
    const promise = new Promise((resolve, reject) => {
      __aiRequests.set(requestId, { resolve, reject });
      if (!__send({ type: 'ai-request', requestId, request: normalized })) {
        __aiRequests.delete(requestId);
        reject(__connectionError());
      }
    });
    return Object.assign(promise, {
      abort: () => __send({ type: 'abort-ai-request', requestId }),
    });
  };
  const __addStyle = (css) => {
    const style = document.createElement('style');
    style.dataset.userscriptOwner = ${JSON.stringify(script.id)};
    style.textContent = String(css);
    document.documentElement.append(style);
    return style;
  };
  const __apiNames = [];
  const __apiValues = [];
  const __provide = (name, value) => {
    __apiNames.push(name);
    __apiValues.push(value);
  };
  const __boundFetch = globalThis.fetch.bind(globalThis);
  const __fetchResponseHeaders = (value) => {
    const headers = new Headers();
    for (const line of String(value || '').split(/\\r?\\n/)) {
      const separator = line.indexOf(':');
      if (separator <= 0) continue;
      headers.append(
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      );
    }
    return headers;
  };
  const __privilegedFetch = async (input, init) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(new URL(String(input), location.href), init);
    const target = new URL(request.url);
    if (
      (target.protocol !== 'http:' && target.protocol !== 'https:') ||
      target.origin === location.origin
    ) {
      return __boundFetch(input, init);
    }
    if (request.signal.aborted) {
      throw request.signal.reason || new DOMException('Aborted', 'AbortError');
    }
    const data =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.clone().arrayBuffer();
    if (request.signal.aborted) {
      throw request.signal.reason || new DOMException('Aborted', 'AbortError');
    }
    const operation = __startRequest(
      {
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(request.headers.entries()),
        data,
        responseType: 'arraybuffer',
        anonymous: request.credentials !== 'include',
      },
      'fetch-request',
    );
    const abort = () => operation.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    try {
      const response = await operation.promise;
      const body =
        request.method === 'HEAD' ||
        response.status === 204 ||
        response.status === 205 ||
        response.status === 304
          ? null
          : response.response;
      const result = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: __fetchResponseHeaders(response.responseHeaders),
      });
      try {
        Object.defineProperties(result, {
          redirected: {
            configurable: true,
            value: response.finalUrl !== request.url,
          },
          url: { configurable: true, value: response.finalUrl },
        });
      } catch {}
      return result;
    } finally {
      request.signal.removeEventListener('abort', abort);
    }
  };
  try {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: __grants.has('none') ? __boundFetch : __privilegedFetch,
    });
  } catch {
    globalThis.fetch = __grants.has('none') ? __boundFetch : __privilegedFetch;
  }
  if (!__grants.has('none')) __provide('fetch', __privilegedFetch);
  if (!__grants.has('none')) __provide('unsafeWindow', __unsafeWindow);
  if (__granted('GM_info')) __provide('GM_info', ${JSON.stringify(info)});
  if (__granted('GM_addElement')) __provide('GM_addElement', __addElement);
  if (__granted('GM_addStyle')) __provide('GM_addStyle', __addStyle);
  if (__granted('GM_log')) __provide('GM_log', __log);
  if (__granted('GM_getValue')) __provide('GM_getValue', __getValue);
  if (__granted('GM_setValue')) __provide('GM_setValue', (key, value) => { void __setValue(key, value).catch(__reportError); });
  if (__granted('GM_deleteValue')) __provide('GM_deleteValue', (key) => { void __deleteValue(key).catch(__reportError); });
  if (__granted('GM_listValues')) __provide('GM_listValues', __listValues);
  if (__granted('GM_getValues')) __provide('GM_getValues', __getValues);
  if (__granted('GM_setValues')) __provide('GM_setValues', (values) => { void __setValues(values).catch(__reportError); });
  if (__granted('GM_deleteValues')) __provide('GM_deleteValues', (keys) => { void __deleteValues(keys).catch(__reportError); });
  if (__granted('GM_addValueChangeListener')) __provide('GM_addValueChangeListener', __addValueChangeListener);
  if (__granted('GM_removeValueChangeListener')) __provide('GM_removeValueChangeListener', __removeValueChangeListener);
  if (__granted('GM_getResourceText')) __provide('GM_getResourceText', __getResourceText);
  if (__granted('GM_getResourceURL')) __provide('GM_getResourceURL', __getResourceUrl);
  if (__granted('GM_download')) __provide('GM_download', __legacyDownload);
  if (__granted('GM_xmlhttpRequest')) __provide('GM_xmlhttpRequest', __xmlHttpRequest);
  if (__granted('GM_notification')) __provide('GM_notification', __notification);
  if (__granted('GM_openInTab')) __provide('GM_openInTab', __openInTab);
  if (__granted('GM_setClipboard')) __provide('GM_setClipboard', __legacySetClipboard);
  if (__granted('GM_getTab')) __provide('GM_getTab', __getTab);
  if (__granted('GM_saveTab')) __provide('GM_saveTab', __saveTab);
  if (__granted('GM_getTabs')) __provide('GM_getTabs', __getTabs);
  if (__granted('GM_registerMenuCommand')) __provide('GM_registerMenuCommand', __register);
  if (__granted('GM_unregisterMenuCommand')) __provide('GM_unregisterMenuCommand', __unregister);
  if (__granted('GM_webRequest')) __provide('GM_webRequest', __webRequest);
  if (__granted('GM_cookie')) __provide('GM_cookie', __legacyCookie);
  if (__granted('GM_audio')) __provide('GM_audio', __audio);
  if (__granted('CM_ai')) __provide('CM_ai', __ai);
  if ([...__grants].some((grant) => grant.startsWith('GM.'))) {
    __provide('GM', {
      info: __granted('GM.info') ? ${JSON.stringify(info)} : undefined,
      addElement: __granted('GM.addElement') ? __addElement : undefined,
      addStyle: __granted('GM.addStyle') ? __addStyle : undefined,
      log: __granted('GM.log') ? __log : undefined,
      getValue: __granted('GM.getValue') ? async (key, fallback) => __getValue(key, fallback) : undefined,
      setValue: __granted('GM.setValue') ? __setValue : undefined,
      deleteValue: __granted('GM.deleteValue') ? __deleteValue : undefined,
      listValues: __granted('GM.listValues') ? async () => __listValues() : undefined,
      getValues: __granted('GM.getValues') ? async (keysOrDefaults) => __getValues(keysOrDefaults) : undefined,
      setValues: __granted('GM.setValues') ? __setValues : undefined,
      deleteValues: __granted('GM.deleteValues') ? __deleteValues : undefined,
      addValueChangeListener: __granted('GM.addValueChangeListener') ? async (key, callback) => __addValueChangeListener(key, callback) : undefined,
      removeValueChangeListener: __granted('GM.removeValueChangeListener') ? async (id) => __removeValueChangeListener(id) : undefined,
      getResourceText: __granted('GM.getResourceText') ? async (name) => __getResourceText(name) : undefined,
      getResourceUrl: __granted('GM.getResourceUrl', 'GM.getResourceURL') ? async (name) => __getResourceUrl(name) : undefined,
      download: __granted('GM.download') ? __modernDownload : undefined,
      xmlHttpRequest: __granted('GM.xmlHttpRequest') ? __modernXmlHttpRequest : undefined,
      notification: __granted('GM.notification') ? __notification : undefined,
      openInTab: __granted('GM.openInTab') ? async (...args) => __openInTab(...args) : undefined,
      setClipboard: __granted('GM.setClipboard') ? __writeClipboard : undefined,
      getTab: __granted('GM.getTab') ? () => __requestCapability('tab-data-get') : undefined,
      saveTab: __granted('GM.saveTab') ? (data) => __requestCapability('tab-data-save', structuredClone(data)) : undefined,
      getTabs: __granted('GM.getTabs') ? () => __requestCapability('tab-data-list') : undefined,
      registerMenuCommand: __granted('GM.registerMenuCommand') ? async (...args) => __register(...args) : undefined,
      unregisterMenuCommand: __granted('GM.unregisterMenuCommand') ? async (id) => __unregister(id) : undefined,
      webRequest: __granted('GM.webRequest') ? __webRequest : undefined,
      cookie: __granted('GM.cookie')
        ? {
            list: (details) => __cookie('list', details),
            set: (details) => __cookie('set', details),
            delete: (details) => __cookie('delete', details),
          }
        : undefined,
      audio: __granted('GM.audio')
        ? {
            setMute: (details) => __requestCapability('audio-set-muted', typeof details === 'boolean' ? { muted: details } : details || {}),
            getState: () => __requestCapability('audio-get-state'),
            addStateChangeListener: async (listener) => __audio.addStateChangeListener(listener),
            removeStateChangeListener: async (id) => __audio.removeStateChangeListener(id),
          }
        : undefined,
    });
  }
  if (__granted('CM.ai')) {
    __provide('CM', { ai: __ai });
  }
  try {
    const __execute = new Function(
      ...__apiNames,
      ${JSON.stringify(source)} + "\\n//# sourceURL=card-master-${identity.registrationId}.user.js",
    );
    await __execute.call(globalThis, ...__apiValues);
    __send({ type: 'ready' });
  } catch (error) {
    __reportError(error);
  }
})();`;
}

export function registeredUserscript(
  script: InstalledUserscript,
  bundle: UserscriptResourceBundle = { requires: [], resources: {} },
  identity: RegistrationIdentity = defaultRegistrationIdentity(script.id),
): RegisteredUserScript | null {
  if (!script.manager.enabled) return null;
  const compatibilityError = runtimeCompatibilityDiagnostics(script).find(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (compatibilityError) throw new Error(compatibilityError.message);
  const mainWorld = userscriptRunsInMainWorld(script);
  const plan = createUserscriptMatchPlan(script.metadata, script.manager);
  const nativePatterns = nativeRegistrationPatterns(script);
  return {
    id: identity.registrationId,
    js: [
      {
        code: mainWorld
          ? mainWorldCode(script, bundle, plan, identity)
          : userScriptWorldCode(script, bundle, plan, identity),
      },
    ],
    matches: nativePatterns.matches,
    ...(nativePatterns.excludeMatches.length > 0
      ? { excludeMatches: nativePatterns.excludeMatches }
      : {}),
    allFrames: !script.metadata.noframes,
    runAt: runAt(script),
    world: mainWorld ? 'MAIN' : 'USER_SCRIPT',
    ...(mainWorld ? {} : { worldId: identity.worldId }),
  };
}

export function registeredUnsafeWindowBridge(
  script: InstalledUserscript,
  identity: RegistrationIdentity = defaultRegistrationIdentity(script.id),
): RegisteredUserScript | null {
  if (!script.manager.enabled || !userscriptNeedsUnsafeWindowBridge(script)) {
    return null;
  }
  const compatibilityError = runtimeCompatibilityDiagnostics(script).find(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (compatibilityError) throw new Error(compatibilityError.message);
  const plan = createUserscriptMatchPlan(script.metadata, script.manager);
  const nativePatterns = nativeRegistrationPatterns(script);
  return {
    id: unsafeWindowBridgeRegistrationId(identity),
    js: [{ code: unsafeWindowMainBridgeCode(plan, identity) }],
    matches: nativePatterns.matches,
    ...(nativePatterns.excludeMatches.length > 0
      ? { excludeMatches: nativePatterns.excludeMatches }
      : {}),
    allFrames: !script.metadata.noframes,
    runAt: runAt(script),
    world: 'MAIN',
  };
}
