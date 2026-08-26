import { describe, expect, it } from 'vitest';

import {
  exportDarkReaderSettings,
  importDarkReaderSettings,
} from './dark-reader-settings';
import { defaultPageThemeSettings } from './types';

describe('Dark Reader settings migration', () => {
  it('imports supported settings and skips patterns that cannot be exact hosts', () => {
    const result = importDarkReaderSettings(
      {
        schemeVersion: 2,
        enabled: true,
        enabledByDefault: false,
        enabledFor: ['example.com', '*.wildcard.test'],
        disabledFor: ['https://disabled.test/'],
        detectDarkTheme: true,
        automation: {
          enabled: false,
          mode: 'system',
          behavior: 'Scheme',
        },
        time: {
          activation: '18:00',
          deactivation: '9:00',
        },
        theme: {
          ...defaultPageThemeSettings().theme,
          brightness: 115,
          engine: 'svgFilter',
        },
        customThemes: [
          {
            url: ['custom.test'],
            theme: {
              ...defaultPageThemeSettings().theme,
              contrast: 112,
            },
          },
          {
            url: ['custom.test/path'],
            theme: defaultPageThemeSettings().theme,
          },
        ],
        presets: [],
      },
      7,
    );

    expect(result.settings).toMatchObject({
      revision: 7,
      enabledByDefault: false,
      enabledFor: ['example.com'],
      disabledFor: ['disabled.test'],
      automation: { mode: 'none', behavior: 'scheme' },
      time: { activation: '18:00', deactivation: '09:00' },
      theme: { brightness: 115, engine: 'cssFilter' },
      siteOverrides: {
        'custom.test': { contrast: 112 },
      },
    });
    expect(result.importedSiteOverrides).toBe(1);
    expect(result.skippedSitePatterns).toBe(2);
  });

  it('exports a Dark Reader-compatible record that can be imported again', () => {
    const settings = defaultPageThemeSettings();
    settings.enabledFor = ['example.com'];
    settings.automation = { mode: 'system', behavior: 'on-off' };
    settings.siteOverrides['example.com'] = { brightness: 82 };

    const exported = exportDarkReaderSettings(settings);
    expect(exported).toMatchObject({
      schemeVersion: 2,
      enabledFor: ['example.com'],
      automation: {
        enabled: true,
        mode: 'system',
        behavior: 'OnOff',
      },
      customThemes: [
        {
          url: ['example.com'],
          theme: { brightness: 82 },
        },
      ],
    });
    expect(importDarkReaderSettings(exported, 3).settings).toMatchObject({
      revision: 3,
      enabledFor: ['example.com'],
      siteOverrides: {
        'example.com': { brightness: 82 },
      },
    });
  });
});
