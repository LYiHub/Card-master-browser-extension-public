import {
  normalizeUserscriptAiRequest,
  type UserscriptAiRequest,
} from '../../ai/domain/types';
import {
  UserscriptRequestError,
  UserscriptRequestService,
} from '../../userscript/application/request-service';
import { USERSCRIPT_VALUE_STORAGE_PREFIX } from '../../userscript/application/storage-keys';
import type {
  RuntimeMenuCommand,
  UserscriptRuntimeState,
} from '../../userscript/domain/types';
import {
  capabilityGranted,
  type UserscriptCapability,
} from '../../userscript/runtime/capabilities';
import { userscriptRunsInMainWorld } from '../../userscript/runtime/compatibility';
import type { ExtensionAiServices } from './ai-services';
import type { ExtensionBackgroundApi, ExtensionPort } from './api';
import { extensionDiagnostics } from './diagnostics';
import { extensionTarget } from './platform';
import {
  EXTENSION_CHANNEL,
  type MainWorldRuntimeMessage,
  userScriptMessage,
} from './protocol';
import type { RegisteredUserscriptSynchronizer } from './registration-sync';
import { UserscriptCapabilityService } from './userscript-capability-service';
import { ExtensionUserscriptRequestHeaderAdapter } from './userscript-request-headers';

type RuntimeInvocation = {
  resolve: (result: RuntimeCommandInvocationResult) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export type RuntimeCommandInvocationResult =
  | { ok: true; value?: unknown }
  | { ok: false; error: string };

type RuntimeEntry = {
  port: ExtensionPort;
  scriptId: string;
  tabId: number;
  frameId: number;
  documentId?: string;
  state: UserscriptRuntimeState;
  commands: Map<string, RuntimeMenuCommand>;
  invocations: Map<string, RuntimeInvocation>;
  requests: Map<string, () => void>;
  aiRequests: Map<string, AbortController>;
};

type MainWorldRuntimeEntry = {
  scriptId: string;
  tabId: number;
  frameId: number;
  documentId?: string;
  capability: string;
  state: UserscriptRuntimeState;
  commands: Map<string, RuntimeMenuCommand>;
  invocations: Map<string, RuntimeInvocation>;
};

type StaleRuntimeEntry = {
  scriptId: string;
  documentId?: string;
  state: UserscriptRuntimeState;
};

type StoredRuntimeDiagnostic = {
  scriptId: string;
  tabId: number;
  frameId: number;
  documentId?: string;
  error: string;
  commands: RuntimeMenuCommand[];
  updatedAt: number;
};

export const RUNTIME_DIAGNOSTIC_STORAGE_PREFIX =
  'userscript-runtime-diagnostic';

function runtimeKey(tabId: number, frameId: number, scriptId: string) {
  return `${tabId}:${frameId}:${scriptId}`;
}

function diagnosticKey(scriptId: string, tabId: number, frameId: number) {
  return `${RUNTIME_DIAGNOSTIC_STORAGE_PREFIX}:${encodeURIComponent(scriptId)}:${tabId}:${frameId}`;
}

function diagnosticPrefix(scriptId: string) {
  return `${RUNTIME_DIAGNOSTIC_STORAGE_PREFIX}:${encodeURIComponent(scriptId)}:`;
}

function valuesKey(scriptId: string) {
  return `${USERSCRIPT_VALUE_STORAGE_PREFIX}:${encodeURIComponent(scriptId)}`;
}

function scriptIdFromValuesKey(key: string) {
  const prefix = `${USERSCRIPT_VALUE_STORAGE_PREFIX}:`;
  if (!key.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(key.slice(prefix.length));
  } catch {
    return null;
  }
}

function storedValues(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function storedCommands(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((command): command is RuntimeMenuCommand => {
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      return false;
    }
    const candidate = command as Partial<RuntimeMenuCommand>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.title === 'string' &&
      (candidate.description === undefined ||
        typeof candidate.description === 'string') &&
      typeof candidate.autoClose === 'boolean' &&
      typeof candidate.order === 'number'
    );
  });
}

export class ExtensionRuntimeBridge {
  private readonly runtimes = new Map<string, RuntimeEntry>();
  private readonly diagnostics = new Map<string, StoredRuntimeDiagnostic>();
  private readonly mainWorldRuntimes = new Map<string, MainWorldRuntimeEntry>();
  private readonly staleRuntimes = new Map<string, StaleRuntimeEntry>();
  private readonly valueQueues = new Map<string, Promise<void>>();
  private readonly capabilities: UserscriptCapabilityService;
  private readonly requestService: UserscriptRequestService;

  constructor(
    private readonly api: ExtensionBackgroundApi,
    private readonly synchronizer: RegisteredUserscriptSynchronizer,
    requestService?: UserscriptRequestService,
    private readonly aiServices?: ExtensionAiServices,
  ) {
    this.requestService =
      requestService ??
      new UserscriptRequestService(
        undefined,
        new ExtensionUserscriptRequestHeaderAdapter(api.declarativeNetRequest, {
          enabled: extensionTarget() !== 'safari',
          reportError: (event, error) =>
            extensionDiagnostics.warn(
              'userscript-request-headers',
              event,
              error,
            ),
        }),
      );
    this.capabilities = new UserscriptCapabilityService(api);
    api.tabs.onRemoved.addListener((tabId) => {
      this.removeMainWorldTab(tabId);
      this.removeStaleRuntimeTab(tabId);
      void this.removeTabDiagnostics(tabId);
    });
  }

  async connect(
    port: ExtensionPort,
    identity: { scriptId: string; capability: string },
  ) {
    const pendingMessages: unknown[] = [];
    let disconnected = false;
    let receiveMessage = (message: unknown) => {
      pendingMessages.push(message);
    };
    let disconnectRuntime = () => {
      disconnected = true;
    };
    port.onMessage.addListener((message) => receiveMessage(message));
    port.onDisconnect.addListener(() => disconnectRuntime());

    await this.synchronizer.ensureRuntimeReady();
    if (disconnected) return;
    const { scriptId, capability } = identity;
    if (!this.synchronizer.accepts(scriptId, capability)) {
      port.disconnect();
      return;
    }
    const script = this.synchronizer.getScript(scriptId);
    const tabId = port.sender?.tab?.id;
    if (
      !script?.manager.enabled ||
      script.metadata.grants.includes('none') ||
      typeof tabId !== 'number'
    ) {
      port.disconnect();
      return;
    }

    const frameId = port.sender?.frameId ?? 0;
    const key = runtimeKey(tabId, frameId, scriptId);
    const entry: RuntimeEntry = {
      port,
      scriptId,
      tabId,
      frameId,
      documentId: port.sender?.documentId,
      commands: new Map(),
      invocations: new Map(),
      requests: new Map(),
      aiRequests: new Map(),
      state: {
        tabId,
        frameId,
        instanceId: crypto.randomUUID(),
        status: 'running',
        commands: [],
        pendingRefresh: false,
      },
    };
    const previous = this.runtimes.get(key);
    this.runtimes.set(key, entry);
    this.staleRuntimes.delete(key);

    receiveMessage = (message) => {
      if (this.runtimes.get(key) !== entry) return;
      if (!userScriptMessage(message)) return;
      switch (message.type) {
        case 'ready':
          entry.state = { ...entry.state, status: 'ready', error: undefined };
          void this.clearDiagnostic(
            diagnosticKey(entry.scriptId, entry.tabId, entry.frameId),
          );
          break;
        case 'register-command':
          entry.commands.set(message.command.id, message.command);
          break;
        case 'unregister-command':
          entry.commands.delete(message.commandId);
          break;
        case 'command-result': {
          const invocation = entry.invocations.get(message.invocationId);
          if (!invocation) return;
          clearTimeout(invocation.timeout);
          entry.invocations.delete(message.invocationId);
          invocation.resolve(this.commandResult(message));
          return;
        }
        case 'set-value':
          this.mutateValue(
            entry,
            message.mutationId,
            message.key,
            false,
            message.value,
          );
          return;
        case 'delete-value':
          this.mutateValue(entry, message.mutationId, message.key, true);
          return;
        case 'http-request':
          this.request(entry, message.requestId, message.details);
          return;
        case 'fetch-request':
          this.request(entry, message.requestId, message.details);
          return;
        case 'abort-request':
          entry.requests.get(message.requestId)?.();
          entry.requests.delete(message.requestId);
          return;
        case 'ai-request':
          this.requestAi(entry, message.requestId, message.request);
          return;
        case 'abort-ai-request':
          entry.aiRequests.get(message.requestId)?.abort();
          entry.aiRequests.delete(message.requestId);
          return;
        case 'capability-request':
          this.requestCapability(
            entry,
            message.requestId,
            message.capability,
            message.payload,
          );
          return;
        case 'runtime-error':
          entry.state = {
            ...entry.state,
            status: 'error',
            error: message.error,
          };
          void this.writeDiagnostic(entry, message.error);
          break;
      }
      this.publish(entry);
    };
    disconnectRuntime = () => {
      void this.api.runtime?.lastError;
      void this.capabilities.disconnect(key);
      for (const abort of entry.requests.values()) abort();
      entry.requests.clear();
      for (const controller of entry.aiRequests.values()) controller.abort();
      entry.aiRequests.clear();
      for (const invocation of entry.invocations.values()) {
        clearTimeout(invocation.timeout);
        invocation.resolve({
          ok: false,
          error: 'The script connection closed during invocation.',
        });
      }
      entry.invocations.clear();
      if (this.runtimes.get(key)?.port !== port) return;
      this.runtimes.delete(key);
      const state = this.rememberStaleRuntime(
        key,
        entry,
        entry.state.status === 'error',
      );
      if (entry.frameId === 0) {
        this.publishState(entry.tabId, entry.scriptId, state);
      }
    };
    for (const message of pendingMessages.splice(0)) receiveMessage(message);
    if (previous && previous.port !== port) previous.port.disconnect();

    const storageKey = valuesKey(scriptId);
    const diagnosticStorageKey = diagnosticKey(scriptId, tabId, frameId);
    const [storedValuesRecord, storedDiagnosticRecord] = await Promise.all([
      this.api.storage.local.get(storageKey),
      this.api.storage.session.get(diagnosticStorageKey),
    ]);
    if (this.runtimes.get(key) !== entry) return;
    const diagnostic = this.readStoredDiagnostic(
      storedDiagnosticRecord[diagnosticStorageKey],
    );
    if (
      diagnostic &&
      (!entry.documentId ||
        !diagnostic.documentId ||
        diagnostic.documentId === entry.documentId)
    ) {
      this.diagnostics.set(diagnosticStorageKey, diagnostic);
      if (entry.state.status !== 'error') {
        entry.state = {
          ...entry.state,
          status: 'error',
          error: diagnostic.error,
        };
      }
    } else if (diagnostic) {
      void this.clearDiagnostic(diagnosticStorageKey);
    }
    port.postMessage({
      type: 'initialize',
      values: structuredClone(storedValues(storedValuesRecord[storageKey])),
    });
    this.publish(entry);
  }

  async state(
    tabId: number,
    frameId: number,
    scriptId: string,
    documentId?: string,
  ) {
    const entry = this.runtimes.get(runtimeKey(tabId, frameId, scriptId));
    if (entry && (!documentId || entry.documentId === documentId)) {
      return this.runtimeState(entry);
    }
    const mainWorld = this.mainWorldRuntimes.get(
      runtimeKey(tabId, frameId, scriptId),
    );
    if (mainWorld && (!documentId || mainWorld.documentId === documentId)) {
      return this.mainWorldRuntimeState(mainWorld);
    }
    if (
      mainWorld &&
      documentId &&
      mainWorld.documentId &&
      mainWorld.documentId !== documentId
    ) {
      this.disposeMainWorldRuntime(
        runtimeKey(tabId, frameId, scriptId),
        mainWorld,
        'The script document was replaced during invocation.',
      );
    }
    const key = runtimeKey(tabId, frameId, scriptId);
    const stale = this.staleRuntimes.get(key);
    if (stale && (!documentId || stale.documentId === documentId)) {
      return stale.state;
    }
    if (stale && documentId && stale.documentId !== documentId) {
      this.staleRuntimes.delete(key);
    }
    const storageKey = diagnosticKey(scriptId, tabId, frameId);
    let diagnostic = this.diagnostics.get(storageKey);
    if (!diagnostic) {
      const stored = await this.api.storage.session.get(storageKey);
      diagnostic = this.readStoredDiagnostic(stored[storageKey]) ?? undefined;
      if (diagnostic) this.diagnostics.set(storageKey, diagnostic);
    }
    if (
      diagnostic &&
      documentId &&
      diagnostic.documentId &&
      diagnostic.documentId !== documentId
    ) {
      void this.clearDiagnostic(storageKey);
      return undefined;
    }
    return diagnostic
      ? {
          tabId,
          frameId,
          instanceId: null,
          status: 'error' as const,
          commands: [],
          error: diagnostic.error,
          pendingRefresh: true,
        }
      : undefined;
  }

  reportMainWorld(
    tabId: number,
    frameId: number,
    documentId: string | undefined,
    scriptId: string,
    capability: string,
    message: MainWorldRuntimeMessage,
  ) {
    const script = this.synchronizer.getScript(scriptId);
    if (
      !script?.manager.enabled ||
      !userscriptRunsInMainWorld(script) ||
      !this.synchronizer.accepts(scriptId, capability)
    ) {
      return;
    }
    const key = runtimeKey(tabId, frameId, scriptId);
    this.staleRuntimes.delete(key);
    let entry = this.mainWorldRuntimes.get(key);
    if (
      entry &&
      (entry.capability !== capability ||
        (documentId && entry.documentId && entry.documentId !== documentId))
    ) {
      this.disposeMainWorldRuntime(
        key,
        entry,
        'The script document was replaced during invocation.',
      );
      entry = undefined;
    }
    if (!entry) {
      entry = {
        scriptId,
        tabId,
        frameId,
        documentId,
        capability,
        commands: new Map(),
        invocations: new Map(),
        state: {
          tabId,
          frameId,
          instanceId: documentId ?? crypto.randomUUID(),
          status: 'running',
          commands: [],
          pendingRefresh: false,
        },
      };
      this.mainWorldRuntimes.set(key, entry);
    } else if (!entry.documentId && documentId) {
      entry.documentId = documentId;
      entry.state = { ...entry.state, instanceId: documentId };
    }
    switch (message.type) {
      case 'ready':
        entry.state = { ...entry.state, status: 'ready', error: undefined };
        void this.clearDiagnostic(diagnosticKey(scriptId, tabId, frameId));
        break;
      case 'register-command':
        entry.commands.set(message.command.id, message.command);
        break;
      case 'unregister-command':
        entry.commands.delete(message.commandId);
        break;
      case 'command-result': {
        const invocation = entry.invocations.get(message.invocationId);
        if (!invocation) return;
        clearTimeout(invocation.timeout);
        entry.invocations.delete(message.invocationId);
        invocation.resolve(this.commandResult(message));
        return;
      }
      case 'runtime-error':
        entry.state = {
          ...entry.state,
          status: 'error',
          error: message.error,
        };
        void this.writeDiagnostic(entry, message.error);
        break;
    }
    entry.state = this.mainWorldRuntimeState(entry);
    if (frameId === 0) this.publishState(tabId, scriptId, entry.state);
  }

  async invoke(
    tabId: number,
    frameId: number,
    scriptId: string,
    commandId: string,
  ) {
    const entry = this.runtimes.get(runtimeKey(tabId, frameId, scriptId));
    if (entry) {
      if (!entry.commands.has(commandId)) {
        return {
          ok: false as const,
          error: 'The runtime command is no longer registered.',
        };
      }
      return await this.invokeIsolatedWorld(entry, commandId);
    }
    const mainWorld = this.mainWorldRuntimes.get(
      runtimeKey(tabId, frameId, scriptId),
    );
    if (!mainWorld) {
      return {
        ok: false as const,
        error: 'The script instance is not running.',
      };
    }
    if (!mainWorld.commands.has(commandId)) {
      return {
        ok: false as const,
        error: 'The runtime command is no longer registered.',
      };
    }
    return await this.invokeMainWorld(mainWorld, commandId);
  }

  invalidate(scriptIds: ReadonlySet<string>) {
    for (const [key, entry] of [...this.runtimes]) {
      if (!scriptIds.has(entry.scriptId)) continue;
      this.runtimes.delete(key);
      void this.capabilities.disconnect(key);
      for (const abort of entry.requests.values()) abort();
      entry.requests.clear();
      for (const controller of entry.aiRequests.values()) controller.abort();
      entry.aiRequests.clear();
      for (const invocation of entry.invocations.values()) {
        clearTimeout(invocation.timeout);
        invocation.resolve({
          ok: false,
          error: 'The script instance was replaced.',
        });
      }
      entry.invocations.clear();
      entry.port.disconnect();
      const state = this.rememberStaleRuntime(key, entry);
      if (entry.frameId === 0) {
        this.publishState(entry.tabId, entry.scriptId, state);
      }
    }
    for (const [key, entry] of [...this.mainWorldRuntimes]) {
      if (!scriptIds.has(entry.scriptId)) continue;
      this.disposeMainWorldRuntime(
        key,
        entry,
        'The script instance was replaced.',
      );
      const state = this.rememberStaleRuntime(key, entry);
      if (entry.frameId === 0) {
        this.publishState(entry.tabId, entry.scriptId, state);
      }
    }
  }

  private async invokeIsolatedWorld(entry: RuntimeEntry, commandId: string) {
    const { invocationId, result } = this.createInvocation(entry.invocations);
    try {
      entry.port.postMessage({
        type: 'invoke-command',
        commandId,
        invocationId,
      });
    } catch (error) {
      const invocation = entry.invocations.get(invocationId);
      if (invocation) {
        clearTimeout(invocation.timeout);
        entry.invocations.delete(invocationId);
        invocation.resolve({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return await result;
  }

  private async invokeMainWorld(
    entry: MainWorldRuntimeEntry,
    commandId: string,
  ) {
    const { invocationId, result } = this.createInvocation(entry.invocations);
    try {
      await this.api.tabs.sendMessage(
        entry.tabId,
        {
          channel: EXTENSION_CHANNEL,
          type: 'main-world-command-invoke',
          scriptId: entry.scriptId,
          capability: entry.capability,
          commandId,
          invocationId,
        },
        { frameId: entry.frameId },
      );
    } catch (error) {
      this.resolveInvocation(
        entry.invocations,
        invocationId,
        error instanceof Error ? error.message : String(error),
      );
    }
    return await result;
  }

  private createInvocation(invocations: Map<string, RuntimeInvocation>) {
    const invocationId = crypto.randomUUID();
    const result = new Promise<RuntimeCommandInvocationResult>((resolve) => {
      const timeout = setTimeout(() => {
        invocations.delete(invocationId);
        resolve({ ok: false, error: 'The runtime command timed out.' });
      }, 30_000);
      invocations.set(invocationId, { resolve, timeout });
    });
    return { invocationId, result };
  }

  private resolveInvocation(
    invocations: Map<string, RuntimeInvocation>,
    invocationId: string,
    error: string,
  ) {
    const invocation = invocations.get(invocationId);
    if (!invocation) return;
    clearTimeout(invocation.timeout);
    invocations.delete(invocationId);
    invocation.resolve({ ok: false, error });
  }

  private commandResult(message: {
    value?: unknown;
    error?: string;
  }): RuntimeCommandInvocationResult {
    return message.error
      ? { ok: false, error: message.error }
      : message.value === undefined
        ? { ok: true }
        : { ok: true, value: message.value };
  }

  async removeValues(scriptId: string) {
    await this.resetValues(scriptId);
    for (const [key, runtime] of this.staleRuntimes) {
      if (runtime.scriptId === scriptId) this.staleRuntimes.delete(key);
    }
    const prefix = diagnosticPrefix(scriptId);
    for (const key of [...this.diagnostics.keys()]) {
      if (key.startsWith(prefix)) this.diagnostics.delete(key);
    }
    const storedDiagnostics = await this.api.storage.session.get(null);
    const diagnosticKeys = Object.keys(storedDiagnostics).filter((key) =>
      key.startsWith(prefix),
    );
    if (diagnosticKeys.length > 0) {
      await this.api.storage.session.remove(diagnosticKeys);
    }
  }

  async clearValues() {
    const stored = await this.api.storage.local.get(null);
    const keys = Object.keys(stored).filter((key) =>
      key.startsWith(`${USERSCRIPT_VALUE_STORAGE_PREFIX}:`),
    );
    const scriptIds = new Set(
      keys
        .map(scriptIdFromValuesKey)
        .filter((scriptId): scriptId is string => scriptId !== null),
    );
    for (const runtime of this.runtimes.values()) {
      scriptIds.add(runtime.scriptId);
    }
    for (const scriptId of this.valueQueues.keys()) scriptIds.add(scriptId);
    await Promise.all(
      [...scriptIds].map((scriptId) => this.resetValues(scriptId)),
    );
    return keys.length;
  }

  async clearDiagnostics() {
    this.clearResidentErrors();
    this.diagnostics.clear();
    const stored = await this.api.storage.session.get(null);
    const keys = Object.keys(stored).filter((key) =>
      key.startsWith(`${RUNTIME_DIAGNOSTIC_STORAGE_PREFIX}:`),
    );
    if (keys.length > 0) await this.api.storage.session.remove(keys);
  }

  private async removeTabDiagnostics(tabId: number) {
    for (const [key, diagnostic] of [...this.diagnostics]) {
      if (diagnostic.tabId === tabId) this.diagnostics.delete(key);
    }
    const storedDiagnostics = await this.api.storage.session
      .get(null)
      .catch(() => ({}));
    const diagnosticKeys = Object.entries(storedDiagnostics).flatMap(
      ([key, value]) => {
        const diagnostic = this.readStoredDiagnostic(value);
        return diagnostic?.tabId === tabId ? [key] : [];
      },
    );
    if (diagnosticKeys.length > 0) {
      await this.api.storage.session
        .remove(diagnosticKeys)
        .catch(() => undefined);
    }
  }

  private removeMainWorldTab(tabId: number) {
    for (const [key, runtime] of this.mainWorldRuntimes) {
      if (runtime.tabId !== tabId) continue;
      this.disposeMainWorldRuntime(
        key,
        runtime,
        'The script tab closed during invocation.',
      );
    }
  }

  private removeStaleRuntimeTab(tabId: number) {
    for (const [key, runtime] of this.staleRuntimes) {
      if (runtime.state.tabId === tabId) this.staleRuntimes.delete(key);
    }
  }

  private rememberStaleRuntime(
    key: string,
    runtime: Pick<
      RuntimeEntry | MainWorldRuntimeEntry,
      'scriptId' | 'documentId' | 'state'
    >,
    preserveError = false,
  ) {
    const state: UserscriptRuntimeState = {
      ...runtime.state,
      instanceId: null,
      status: preserveError ? 'error' : 'idle',
      commands: [],
      error: preserveError ? runtime.state.error : undefined,
      pendingRefresh: true,
    };
    this.staleRuntimes.set(key, {
      scriptId: runtime.scriptId,
      documentId: runtime.documentId,
      state,
    });
    return state;
  }

  private disposeMainWorldRuntime(
    key: string,
    runtime: MainWorldRuntimeEntry,
    error: string,
  ) {
    if (this.mainWorldRuntimes.get(key) !== runtime) return;
    this.mainWorldRuntimes.delete(key);
    for (const invocation of runtime.invocations.values()) {
      clearTimeout(invocation.timeout);
      invocation.resolve({ ok: false, error });
    }
    runtime.invocations.clear();
  }

  private runtimeState(entry: RuntimeEntry) {
    return {
      ...entry.state,
      commands: [...entry.commands.values()].sort(
        (left, right) => left.order - right.order,
      ),
    };
  }

  private mainWorldRuntimeState(entry: MainWorldRuntimeEntry) {
    return {
      ...entry.state,
      commands: [...entry.commands.values()].sort(
        (left, right) => left.order - right.order,
      ),
    };
  }

  private publish(entry: RuntimeEntry) {
    if (
      this.runtimes.get(
        runtimeKey(entry.tabId, entry.frameId, entry.scriptId),
      ) !== entry
    ) {
      return;
    }
    entry.state = this.runtimeState(entry);
    if (entry.frameId !== 0) return;
    this.publishState(entry.tabId, entry.scriptId, entry.state);
  }

  private post(entry: RuntimeEntry, message: unknown) {
    if (
      this.runtimes.get(
        runtimeKey(entry.tabId, entry.frameId, entry.scriptId),
      ) !== entry
    ) {
      return false;
    }
    try {
      entry.port.postMessage(message);
      return true;
    } catch {
      return false;
    }
  }

  private publishState(
    tabId: number,
    scriptId: string,
    state: UserscriptRuntimeState,
  ) {
    void this.api.tabs
      .sendMessage(
        tabId,
        {
          channel: EXTENSION_CHANNEL,
          type: 'runtime-state',
          scriptId,
          state,
        },
        { frameId: 0 },
      )
      .catch(() => undefined);
  }

  private readStoredDiagnostic(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const candidate = value as Partial<StoredRuntimeDiagnostic>;
    return typeof candidate.error === 'string' &&
      candidate.error.trim() &&
      typeof candidate.updatedAt === 'number' &&
      typeof candidate.scriptId === 'string' &&
      typeof candidate.tabId === 'number' &&
      typeof candidate.frameId === 'number'
      ? {
          scriptId: candidate.scriptId,
          tabId: candidate.tabId,
          frameId: candidate.frameId,
          documentId: candidate.documentId,
          error: candidate.error,
          commands: storedCommands(candidate.commands),
          updatedAt: candidate.updatedAt,
        }
      : null;
  }

  private async writeDiagnostic(
    runtime: Pick<
      RuntimeEntry,
      'scriptId' | 'tabId' | 'frameId' | 'documentId'
    > &
      Partial<Pick<RuntimeEntry, 'commands'>>,
    error: string,
  ) {
    const key = diagnosticKey(runtime.scriptId, runtime.tabId, runtime.frameId);
    const diagnostic: StoredRuntimeDiagnostic = {
      scriptId: runtime.scriptId,
      tabId: runtime.tabId,
      frameId: runtime.frameId,
      documentId: runtime.documentId,
      error,
      commands: runtime.commands ? [...runtime.commands.values()] : [],
      updatedAt: Date.now(),
    };
    this.diagnostics.set(key, diagnostic);
    await this.api.storage.session
      .set({
        [key]: diagnostic,
      })
      .catch(() => undefined);
  }

  private async clearDiagnostic(key: string) {
    this.diagnostics.delete(key);
    await this.api.storage.session.remove(key).catch(() => undefined);
  }

  private clearResidentErrors(scriptId?: string) {
    for (const entry of this.runtimes.values()) {
      if (
        (scriptId && entry.scriptId !== scriptId) ||
        entry.state.status !== 'error'
      ) {
        continue;
      }
      entry.state = {
        ...entry.state,
        status: 'ready',
        error: undefined,
      };
      this.publish(entry);
    }
    for (const entry of this.mainWorldRuntimes.values()) {
      if (
        (scriptId && entry.scriptId !== scriptId) ||
        entry.state.status !== 'error'
      ) {
        continue;
      }
      entry.state = {
        ...entry.state,
        status: 'ready',
        error: undefined,
      };
      entry.state = this.mainWorldRuntimeState(entry);
      if (entry.frameId === 0) {
        this.publishState(entry.tabId, entry.scriptId, entry.state);
      }
    }
  }

  private enqueueValueOperation<T>(
    scriptId: string,
    operation: () => Promise<T>,
  ) {
    const previous = this.valueQueues.get(scriptId) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.valueQueues.set(scriptId, tail);
    void tail.finally(() => {
      if (this.valueQueues.get(scriptId) === tail) {
        this.valueQueues.delete(scriptId);
      }
    });
    return result;
  }

  private resetValues(scriptId: string) {
    return this.enqueueValueOperation(scriptId, async () => {
      await this.api.storage.local.remove(valuesKey(scriptId));
      for (const runtime of this.runtimes.values()) {
        if (runtime.scriptId !== scriptId) continue;
        this.post(runtime, {
          type: 'values-reset',
          values: {},
        });
      }
    });
  }

  private mutateValue(
    entry: RuntimeEntry,
    mutationId: string,
    key: string,
    deleted: boolean,
    value?: unknown,
  ) {
    void this.enqueueValueOperation(entry.scriptId, async () => {
      const storageKey = valuesKey(entry.scriptId);
      const current = storedValues(
        (await this.api.storage.local.get(storageKey))[storageKey],
      );
      if (deleted) delete current[key];
      else current[key] = structuredClone(value);
      await this.api.storage.local.set({ [storageKey]: current });
      for (const runtime of this.runtimes.values()) {
        if (runtime.scriptId !== entry.scriptId) continue;
        this.post(runtime, {
          type: 'value-changed',
          key,
          deleted,
          value: deleted ? undefined : structuredClone(value),
          ...(runtime.port === entry.port ? { mutationId } : {}),
        });
      }
    }).catch(async (error) => {
      let currentDeleted = deleted;
      let currentValue = value;
      try {
        const storageKey = valuesKey(entry.scriptId);
        const current = storedValues(
          (await this.api.storage.local.get(storageKey))[storageKey],
        );
        currentDeleted = !Object.hasOwn(current, key);
        currentValue = current[key];
      } catch {
        // The mutation error remains authoritative when storage is unavailable.
      }
      this.post(entry, {
        type: 'value-changed',
        key,
        mutationId,
        deleted: currentDeleted,
        value: currentDeleted ? undefined : structuredClone(currentValue),
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private request(
    entry: RuntimeEntry,
    requestId: string,
    details: Parameters<UserscriptRequestService['request']>[2],
  ) {
    const script = this.synchronizer.getScript(entry.scriptId);
    const sourceUrl = entry.port.sender?.url ?? entry.port.sender?.tab?.url;
    if (!script || !sourceUrl) {
      this.post(entry, {
        type: 'http-response',
        requestId,
        error: {
          kind: 'network',
          message: '用户脚本请求上下文不可用。',
        },
      });
      return;
    }
    try {
      const request = this.requestService.request(script, sourceUrl, details, {
        enforceConnect: false,
        onEvent: (event) => {
          this.post(entry, {
            type: 'http-event',
            requestId,
            event,
          });
        },
      });
      entry.requests.set(requestId, request.abort);
      void request.promise
        .then(
          (response) =>
            this.post(entry, {
              type: 'http-response',
              requestId,
              response,
            }),
          (error) =>
            this.post(entry, {
              type: 'http-response',
              requestId,
              error: {
                kind:
                  error instanceof UserscriptRequestError
                    ? error.kind
                    : 'network',
                message: error instanceof Error ? error.message : String(error),
              },
            }),
        )
        .finally(() => entry.requests.delete(requestId));
    } catch (error) {
      this.post(entry, {
        type: 'http-response',
        requestId,
        error: {
          kind: 'network',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private requestAi(
    entry: RuntimeEntry,
    requestId: string,
    request: UserscriptAiRequest,
  ) {
    const script = this.synchronizer.getScript(entry.scriptId);
    const normalized = normalizeUserscriptAiRequest(request);
    if (
      !script ||
      !normalized ||
      (!script.metadata.grants.includes('CM_ai') &&
        !script.metadata.grants.includes('CM.ai'))
    ) {
      this.post(entry, {
        type: 'ai-response',
        requestId,
        error: '用户脚本 AI 请求无效或未获授权。',
      });
      return;
    }
    if (!this.aiServices) {
      this.post(entry, {
        type: 'ai-response',
        requestId,
        error: 'The global AI model service is unavailable.',
      });
      return;
    }
    if (entry.aiRequests.size >= 2) {
      this.post(entry, {
        type: 'ai-response',
        requestId,
        error: '这个用户脚本已有两个正在进行的 AI 请求。',
      });
      return;
    }
    const controller = new AbortController();
    entry.aiRequests.set(requestId, controller);
    void this.aiServices
      .complete(normalized, controller.signal)
      .then(
        (response) =>
          this.post(entry, {
            type: 'ai-response',
            requestId,
            response,
          }),
        (error) =>
          this.post(entry, {
            type: 'ai-response',
            requestId,
            error: error instanceof Error ? error.message : String(error),
          }),
      )
      .finally(() => entry.aiRequests.delete(requestId));
  }

  private requestCapability(
    entry: RuntimeEntry,
    requestId: string,
    capability: UserscriptCapability,
    payload: unknown,
  ) {
    const script = this.synchronizer.getScript(entry.scriptId);
    if (!script || !capabilityGranted(capability, script.metadata.grants)) {
      this.post(entry, {
        type: 'capability-response',
        requestId,
        error: `用户脚本能力未获授权：${capability}`,
      });
      return;
    }
    const sourceUrl = entry.port.sender?.url ?? entry.port.sender?.tab?.url;
    if (!sourceUrl) {
      this.post(entry, {
        type: 'capability-response',
        requestId,
        error: '用户脚本页面上下文不可用。',
      });
      return;
    }
    void this.capabilities
      .request(
        {
          runtimeId: runtimeKey(entry.tabId, entry.frameId, entry.scriptId),
          scriptId: entry.scriptId,
          tabId: entry.tabId,
          frameId: entry.frameId,
          sourceUrl,
          post: (event) =>
            this.post(entry, {
              type: 'capability-event',
              ...event,
            }),
        },
        capability,
        payload,
      )
      .then(
        (result) =>
          this.post(entry, {
            type: 'capability-response',
            requestId,
            result,
          }),
        (error) =>
          this.post(entry, {
            type: 'capability-response',
            requestId,
            error: error instanceof Error ? error.message : String(error),
          }),
      );
  }
}
