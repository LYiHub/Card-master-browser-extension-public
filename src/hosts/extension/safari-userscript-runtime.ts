import {
  installExtensionContextBoundary,
  notifyExtensionContextInvalidated,
  onExtensionContextInvalidated,
  reportExtensionFailure,
} from './diagnostics';
import { EXTENSION_CHANNEL } from './extension-channel';

type SafariUserscriptRunAt =
  | 'document_start'
  | 'document_end'
  | 'document_idle';

const RUNTIME_MARKER = '__cardMasterSafariRuntimeV1';
let executionQueue = Promise.resolve();
let active = true;
let removeContextBoundary = () => {};
let removeContextInvalidation = () => {};
let removeDocumentEndSchedule = () => {};
let removeDocumentIdleSchedule = () => {};

function runtimeApi() {
  const globals = globalThis as typeof globalThis & {
    browser?: typeof chrome;
    chrome?: typeof chrome;
  };
  return (globals.browser ?? globals.chrome)?.runtime;
}

function requestPhase(runAt: SafariUserscriptRunAt) {
  if (!active) return executionQueue;
  executionQueue = executionQueue.then(async () => {
    if (!active) return;
    try {
      const runtime = runtimeApi();
      if (!runtime?.id || typeof runtime.sendMessage !== 'function') {
        const error = new Error('Extension context invalidated.');
        notifyExtensionContextInvalidated(error);
        dispose();
        return;
      }
      const response = await runtime.sendMessage({
        channel: EXTENSION_CHANNEL,
        type: 'safari-userscript-runtime-run',
        runAt,
      });
      if (
        response &&
        typeof response === 'object' &&
        typeof response.error === 'string'
      ) {
        throw new Error(response.error);
      }
    } catch (error) {
      if (notifyExtensionContextInvalidated(error)) {
        dispose();
        return;
      }
      reportExtensionFailure(
        'safari-userscript-runtime',
        `${runAt}-failed`,
        error,
      );
    }
  });
  return executionQueue;
}

function afterDocumentEnd(callback: () => void) {
  if (document.readyState !== 'loading') {
    callback();
    return () => {};
  }
  document.addEventListener('DOMContentLoaded', callback, { once: true });
  return () => document.removeEventListener('DOMContentLoaded', callback);
}

function afterDocumentIdle(callback: () => void) {
  let timer = 0;
  const schedule = () => {
    if (!active) return;
    timer = window.setTimeout(callback, 0);
  };
  const remove = () => {
    window.clearTimeout(timer);
    window.removeEventListener('load', schedule);
  };
  if (document.readyState === 'complete') {
    schedule();
    return remove;
  }
  window.addEventListener('load', schedule, { once: true });
  return remove;
}

const runtimeGlobal = globalThis as typeof globalThis & {
  [RUNTIME_MARKER]?: boolean;
};

function dispose() {
  if (!active) return;
  active = false;
  removeDocumentEndSchedule();
  removeDocumentIdleSchedule();
  removeContextInvalidation();
  removeContextBoundary();
  delete runtimeGlobal[RUNTIME_MARKER];
}

if (!runtimeGlobal[RUNTIME_MARKER]) {
  runtimeGlobal[RUNTIME_MARKER] = true;
  removeContextBoundary = installExtensionContextBoundary();
  removeContextInvalidation = onExtensionContextInvalidated(dispose);
  const initialRuntime = runtimeApi();
  if (!initialRuntime?.id || typeof initialRuntime.sendMessage !== 'function') {
    reportExtensionFailure(
      'safari-userscript-runtime',
      'bootstrap-failed',
      new Error('Safari 扩展运行时不可用。'),
    );
    dispose();
  } else {
    void requestPhase('document_start');
    removeDocumentEndSchedule = afterDocumentEnd(
      () => void requestPhase('document_end'),
    );
    removeDocumentIdleSchedule = afterDocumentIdle(
      () => void requestPhase('document_idle'),
    );
  }
}
