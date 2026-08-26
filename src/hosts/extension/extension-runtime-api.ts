export type ExtensionRuntimeApi = Pick<typeof chrome.runtime, 'connect' | 'id'>;

export function extensionGlobalApi() {
  const globals = globalThis as typeof globalThis & {
    browser?: typeof chrome;
    chrome?: typeof chrome;
  };
  return globals.browser ?? globals.chrome;
}

export function requireExtensionRuntimeApi(): ExtensionRuntimeApi {
  const runtime = extensionGlobalApi()?.runtime;
  if (!runtime?.id || typeof runtime.connect !== 'function') {
    throw new Error('The browser extension runtime API is unavailable.');
  }
  return runtime;
}
