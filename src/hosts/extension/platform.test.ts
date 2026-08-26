import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extensionShortcutSettingsUrl,
  extensionTarget,
  microphoneSettingsUrl,
} from './platform';

afterEach(() => vi.unstubAllGlobals());

function userAgent(value: string) {
  vi.stubGlobal('navigator', { userAgent: value });
}

describe('extension platform', () => {
  it('detects Chromium and Edge settings pages', () => {
    userAgent('Mozilla/5.0 Chrome/135.0.0.0 Safari/537.36');
    expect(extensionTarget()).toBe('chromium');
    expect(extensionShortcutSettingsUrl('id', 'toggle')).toBe(
      'chrome://extensions/configureCommands#command-id-toggle',
    );
    expect(microphoneSettingsUrl()).toBe(
      'chrome://settings/content/microphone',
    );

    userAgent('Mozilla/5.0 Edg/135.0.0.0');
    expect(extensionShortcutSettingsUrl('id', 'toggle')).toBe(
      'edge://extensions/shortcuts',
    );
    expect(microphoneSettingsUrl()).toBe('edge://settings/content/microphone');
  });

  it('keeps Firefox privileged settings outside extension navigation', () => {
    userAgent('Mozilla/5.0 Firefox/153.0');
    expect(extensionTarget()).toBe('firefox');
    expect(extensionShortcutSettingsUrl('id', 'toggle')).toBeNull();
    expect(microphoneSettingsUrl()).toBeNull();
  });

  it('keeps Safari system settings outside the WebExtension surface', () => {
    userAgent('Mozilla/5.0 Version/27.0 Safari/620.1.14');
    expect(extensionTarget()).toBe('safari');
    expect(extensionShortcutSettingsUrl('id', 'toggle')).toBeNull();
    expect(microphoneSettingsUrl()).toBeNull();
  });
});
