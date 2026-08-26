export type ExtensionTarget = 'chromium' | 'firefox' | 'safari';

export function extensionTarget(): ExtensionTarget {
  if (typeof __EXTENSION_TARGET__ === 'string') return __EXTENSION_TARGET__;
  const userAgent = globalThis.navigator?.userAgent ?? '';
  if (/Firefox|FxiOS/i.test(userAgent)) return 'firefox';
  if (
    /Safari/i.test(userAgent) &&
    !/Chrome|Chromium|CriOS|Edg/i.test(userAgent)
  ) {
    return 'safari';
  }
  return 'chromium';
}

export function extensionShortcutSettingsUrl(
  runtimeId: string,
  command: string,
) {
  const userAgent = globalThis.navigator?.userAgent ?? '';
  if (extensionTarget() !== 'chromium') return null;
  return userAgent.includes('Edg/')
    ? 'edge://extensions/shortcuts'
    : `chrome://extensions/configureCommands#command-${runtimeId}-${command}`;
}

export function microphoneSettingsUrl() {
  if (extensionTarget() !== 'chromium') return null;
  const userAgent = globalThis.navigator?.userAgent ?? '';
  return userAgent.includes('Edg/')
    ? 'edge://settings/content/microphone'
    : 'chrome://settings/content/microphone';
}
