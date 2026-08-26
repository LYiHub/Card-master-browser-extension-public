export function appleKeyboardPlatform(platform: string) {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function currentKeyboardPlatform() {
  if (typeof navigator === 'undefined') return '';
  const userAgentData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  return typeof userAgentData?.platform === 'string'
    ? userAgentData.platform
    : navigator.platform;
}

export function installAndCloseShortcutLabel(
  apple = appleKeyboardPlatform(currentKeyboardPlatform()),
) {
  return apple ? '⌘+Enter' : 'Ctrl+Enter';
}

export function isInstallAndCloseShortcut(
  event: Pick<
    KeyboardEvent,
    'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
  >,
  apple = appleKeyboardPlatform(currentKeyboardPlatform()),
) {
  return (
    event.key === 'Enter' &&
    !event.altKey &&
    !event.shiftKey &&
    (apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
  );
}
