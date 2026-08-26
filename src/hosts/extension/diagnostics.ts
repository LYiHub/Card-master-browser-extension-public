import {
  extensionErrorDetails,
  extensionErrorMessage,
  isExtensionPageLifecycleInterrupted,
} from '../../lib/extension-errors';

export {
  extensionErrorDetails,
  extensionErrorMessage,
  isExtensionPageLifecycleInterrupted,
} from '../../lib/extension-errors';

export type ExtensionDiagnosticDetails = Readonly<Record<string, unknown>>;

export type DiagnosticLevel = 'warn' | 'error';

export type ExtensionDiagnosticRecord = Readonly<{
  level: DiagnosticLevel;
  scope: string;
  event: string;
  message: string;
  sequence: number;
  timestamp: string;
  page?: string;
  details?: ExtensionDiagnosticDetails;
  error?: Omit<ReturnType<typeof extensionErrorDetails>, 'raw'>;
}>;

export const EXTENSION_DIAGNOSTIC_RELAY_TYPE =
  'card-master-extension-diagnostic';

export type ExtensionDiagnosticRelayMessage = Readonly<{
  type: typeof EXTENSION_DIAGNOSTIC_RELAY_TYPE;
  diagnostic: ExtensionDiagnosticRecord;
}>;

const CONTEXT_INVALIDATED =
  /(?:extension context invalidated|context has been invalidated)/i;
const ORPHANED_EXTENSION_RUNTIME_FAILURE =
  /(?:browser extension API is unavailable|script should only be loaded in a browser extension|cannot read (?:properties|property) of (?:undefined|null).*(?:runtime|storage|session|onmessage|getmessage|skipkeybind)|undefined is not an object.*(?:chrome|browser)\.(?:runtime|storage|i18n)|^timeout waiting for\b)/i;
const DIAGNOSTIC_DEDUPLICATION_MS = 10_000;
const recentDiagnostics = new Map<string, number>();
const contextInvalidationListeners = new Set<() => void>();
let contextInvalidated = false;
let sequence = 0;

function pageIdentity() {
  try {
    return `${globalThis.location.origin}${globalThis.location.pathname}`;
  } catch {
    return undefined;
  }
}

function extensionRuntimeAvailable() {
  try {
    const globals = globalThis as typeof globalThis & {
      browser?: typeof chrome;
      chrome?: typeof chrome;
    };
    return Boolean((globals.browser ?? globals.chrome)?.runtime?.id);
  } catch {
    return false;
  }
}

function errorDetails(error: unknown) {
  return extensionErrorDetails(error);
}

function serializableErrorDetails(error: unknown) {
  const { raw: _raw, ...details } = errorDetails(error);
  return details;
}

function serializableDetails(details?: ExtensionDiagnosticDetails) {
  if (!details) return undefined;
  try {
    return JSON.parse(JSON.stringify(details)) as ExtensionDiagnosticDetails;
  } catch {
    return { serializationFailed: true };
  }
}

function relayDiagnostic(diagnostic: ExtensionDiagnosticRecord) {
  if (typeof document === 'undefined') return;
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.id || typeof runtime.sendMessage !== 'function') return;
  try {
    runtime.sendMessage(
      {
        type: EXTENSION_DIAGNOSTIC_RELAY_TYPE,
        diagnostic,
      } satisfies ExtensionDiagnosticRelayMessage,
      () => {
        try {
          void runtime.lastError;
        } catch {
          // The extension context disappeared before the relay completed.
        }
      },
    );
  } catch {
    // Diagnostics must never create a second failure while reporting one.
  }
}

function duplicateDiagnostic(signature: string) {
  const now = Date.now();
  const previous = recentDiagnostics.get(signature);
  if (previous !== undefined && now - previous < DIAGNOSTIC_DEDUPLICATION_MS) {
    return true;
  }
  recentDiagnostics.set(signature, now);
  if (recentDiagnostics.size > 128) {
    for (const [key, timestamp] of recentDiagnostics) {
      if (now - timestamp >= DIAGNOSTIC_DEDUPLICATION_MS) {
        recentDiagnostics.delete(key);
      }
    }
  }
  return false;
}

function writeDiagnostic(
  level: DiagnosticLevel,
  scope: string,
  event: string,
  error?: unknown,
  details?: ExtensionDiagnosticDetails,
) {
  if (
    error !== undefined &&
    (isExtensionPageLifecycleInterrupted(error) ||
      notifyExtensionContextInvalidated(error))
  ) {
    return;
  }
  const page = pageIdentity();
  const serializedDetails = serializableDetails(details);
  const errorMessage =
    error === undefined ? undefined : extensionErrorMessage(error);
  const signature = JSON.stringify([
    level,
    scope,
    event,
    errorMessage,
    page,
    serializedDetails,
  ]);
  if (duplicateDiagnostic(signature)) return;
  sequence += 1;
  const message =
    errorMessage === undefined ? event : `${event}：${errorMessage}`;
  const diagnostic: ExtensionDiagnosticRecord = {
    level,
    scope,
    event,
    message,
    sequence,
    timestamp: new Date().toISOString(),
    page,
    details: serializedDetails,
    error: error === undefined ? undefined : serializableErrorDetails(error),
  };
  console[level](`[Card Master][${scope}] ${message}`, {
    timestamp: diagnostic.timestamp,
    page: diagnostic.page,
    details: diagnostic.details,
    error: diagnostic.error,
  });
  relayDiagnostic(diagnostic);
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function diagnosticRecord(value: unknown): value is ExtensionDiagnosticRecord {
  return (
    record(value) &&
    (value.level === 'warn' || value.level === 'error') &&
    typeof value.scope === 'string' &&
    typeof value.event === 'string' &&
    typeof value.message === 'string' &&
    typeof value.sequence === 'number' &&
    Number.isSafeInteger(value.sequence) &&
    typeof value.timestamp === 'string' &&
    (value.page === undefined || typeof value.page === 'string') &&
    (value.details === undefined || record(value.details)) &&
    (value.error === undefined || record(value.error))
  );
}

export function isExtensionDiagnosticRelayMessage(
  value: unknown,
): value is ExtensionDiagnosticRelayMessage {
  return (
    record(value) &&
    value.type === EXTENSION_DIAGNOSTIC_RELAY_TYPE &&
    diagnosticRecord(value.diagnostic)
  );
}

export function reportRelayedExtensionDiagnostic(
  message: ExtensionDiagnosticRelayMessage,
  source: ExtensionDiagnosticDetails,
) {
  const { diagnostic } = message;
  const signature = JSON.stringify([
    'relayed',
    diagnostic.level,
    diagnostic.scope,
    diagnostic.event,
    diagnostic.error?.message,
    diagnostic.page,
    diagnostic.details,
  ]);
  if (duplicateDiagnostic(signature)) return;
  console[diagnostic.level](
    `[Card Master][${diagnostic.scope}] ${diagnostic.message}`,
    {
      timestamp: diagnostic.timestamp,
      page: diagnostic.page,
      details: diagnostic.details,
      error: diagnostic.error,
      relayed: true,
      source,
    },
  );
}

export const extensionDiagnostics = {
  warn(
    scope: string,
    event: string,
    error: unknown,
    details?: ExtensionDiagnosticDetails,
  ) {
    writeDiagnostic('warn', scope, event, error, details);
  },
  error(
    scope: string,
    event: string,
    error: unknown,
    details?: ExtensionDiagnosticDetails,
  ) {
    writeDiagnostic('error', scope, event, error, details);
  },
};

export function isExtensionContextInvalidated(error: unknown) {
  return CONTEXT_INVALIDATED.test(extensionErrorMessage(error));
}

export function isOrphanedExtensionRuntimeFailure(error: unknown) {
  return (
    !extensionRuntimeAvailable() &&
    ORPHANED_EXTENSION_RUNTIME_FAILURE.test(extensionErrorMessage(error))
  );
}

export function notifyExtensionContextInvalidated(error: unknown) {
  if (
    !isExtensionContextInvalidated(error) &&
    !isOrphanedExtensionRuntimeFailure(error)
  ) {
    return false;
  }
  if (!contextInvalidated) {
    contextInvalidated = true;
    for (const listener of contextInvalidationListeners) {
      try {
        listener();
      } catch (listenerError) {
        if (
          !isExtensionContextInvalidated(listenerError) &&
          !isOrphanedExtensionRuntimeFailure(listenerError)
        ) {
          console.error(
            '[Card Master][extension-context] cleanup-failed',
            listenerError,
          );
        }
      }
    }
    contextInvalidationListeners.clear();
  }
  return true;
}

export function onExtensionContextInvalidated(listener: () => void) {
  if (contextInvalidated) {
    queueMicrotask(listener);
    return () => undefined;
  }
  contextInvalidationListeners.add(listener);
  return () => {
    contextInvalidationListeners.delete(listener);
  };
}

export function registerExtensionListener<Listener>(
  event: {
    addListener(listener: Listener): void;
    removeListener(listener: Listener): void;
  },
  listener: Listener,
) {
  event.addListener(listener);
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    try {
      event.removeListener(listener);
    } catch (error) {
      if (!notifyExtensionContextInvalidated(error)) throw error;
    }
  };
}

export function reportExtensionFailure(
  scope: string,
  event: string,
  error: unknown,
  details?: ExtensionDiagnosticDetails,
) {
  if (
    isExtensionPageLifecycleInterrupted(error) ||
    notifyExtensionContextInvalidated(error)
  )
    return;
  extensionDiagnostics.error(scope, event, error, details);
}

export function installExtensionContextBoundary(target: Window = window) {
  const handleRejection = (event: PromiseRejectionEvent) => {
    if (notifyExtensionContextInvalidated(event.reason)) {
      event.preventDefault();
    }
  };
  const handleError = (event: ErrorEvent) => {
    if (notifyExtensionContextInvalidated(event.error ?? event.message)) {
      event.preventDefault();
    }
  };
  target.addEventListener('unhandledrejection', handleRejection);
  target.addEventListener('error', handleError);
  return () => {
    target.removeEventListener('unhandledrejection', handleRejection);
    target.removeEventListener('error', handleError);
  };
}
