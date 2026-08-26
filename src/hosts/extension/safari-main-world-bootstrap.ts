import { EXTENSION_CHANNEL } from './extension-channel';
import { SAFARI_MAIN_WORLD_INJECTION_REQUEST } from './safari-main-world';

const RUNTIME_MARKER = '__cardMasterSafariMainWorldBootstrapV2';

function runtimeApi() {
  const globals = globalThis as typeof globalThis & {
    browser?: typeof chrome;
    chrome?: typeof chrome;
  };
  return (globals.browser ?? globals.chrome)?.runtime;
}

const runtimeGlobal = globalThis as typeof globalThis & {
  [RUNTIME_MARKER]?: boolean;
};

if (!runtimeGlobal[RUNTIME_MARKER]) {
  runtimeGlobal[RUNTIME_MARKER] = true;
  try {
    const pending = runtimeApi()?.sendMessage({
      channel: EXTENSION_CHANNEL,
      type: SAFARI_MAIN_WORLD_INJECTION_REQUEST,
    });
    if (pending && typeof pending.then === 'function') {
      void pending.catch(() => undefined);
    }
  } catch {
    // Isolated-world proxies remain active when native injection is unavailable.
  }
}
