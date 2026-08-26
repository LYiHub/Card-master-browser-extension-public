import { describe, expect, it } from 'vitest';

import {
  appleKeyboardPlatform,
  installAndCloseShortcutLabel,
  isInstallAndCloseShortcut,
} from './install-shortcut';

const enter = {
  key: 'Enter',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

describe('install shortcut', () => {
  it('uses Command on Apple keyboards and Ctrl elsewhere', () => {
    expect(appleKeyboardPlatform('macOS')).toBe(true);
    expect(appleKeyboardPlatform('MacIntel')).toBe(true);
    expect(appleKeyboardPlatform('Windows')).toBe(false);
    expect(installAndCloseShortcutLabel(true)).toBe('⌘+Enter');
    expect(installAndCloseShortcutLabel(false)).toBe('Ctrl+Enter');
    expect(isInstallAndCloseShortcut({ ...enter, metaKey: true }, true)).toBe(
      true,
    );
    expect(isInstallAndCloseShortcut({ ...enter, ctrlKey: true }, true)).toBe(
      false,
    );
    expect(isInstallAndCloseShortcut({ ...enter, ctrlKey: true }, false)).toBe(
      true,
    );
    expect(isInstallAndCloseShortcut({ ...enter, metaKey: true }, false)).toBe(
      false,
    );
  });
});
