import { describe, expect, it } from 'vitest';

import {
  defaultPageThemeSettings,
  isPageThemeSettings,
  nextPageThemeAutomationChange,
  resolvePageTheme,
  togglePageThemeHost,
} from './types';

describe('page theme domain', () => {
  it('stays inactive for new users until globally enabled', () => {
    const settings = defaultPageThemeSettings();
    expect(settings.enabled).toBe(false);
    expect(settings.enabledByDefault).toBe(false);
    expect(
      resolvePageTheme(settings, 'https://example.com', false),
    ).toMatchObject({
      activeOnPage: false,
      inactiveReason: 'global-disabled',
    });
  });

  it('enables ordinary sites and resolves a site-specific theme override', () => {
    const settings = defaultPageThemeSettings();
    settings.enabled = true;
    settings.enabledByDefault = true;
    settings.siteOverrides['example.com'] = { brightness: 88, sepia: 12 };

    expect(
      resolvePageTheme(
        settings,
        'https://example.com/article',
        false,
        new Date('2026-07-17T12:00:00'),
      ),
    ).toMatchObject({
      activeOnPage: true,
      host: 'example.com',
      theme: {
        brightness: 88,
        sepia: 12,
        engine: 'dynamicTheme',
      },
    });
  });

  it('toggles the current host without storing full page URLs', () => {
    const disabled = togglePageThemeHost(
      {
        ...defaultPageThemeSettings(),
        enabled: true,
        enabledByDefault: true,
      },
      'https://example.com/path?query=1',
    );
    expect(disabled.disabledFor).toEqual(['example.com']);
    expect(
      resolvePageTheme(disabled, 'https://example.com/other', false),
    ).toMatchObject({
      activeOnPage: false,
      inactiveReason: 'site-disabled',
    });

    const enabled = togglePageThemeHost(disabled, 'https://example.com/');
    expect(enabled.disabledFor).toEqual([]);
    expect(enabled.enabledFor).toEqual(['example.com']);
  });

  it('supports system and overnight time automation', () => {
    const settings = defaultPageThemeSettings();
    settings.enabled = true;
    settings.enabledByDefault = true;
    settings.automation = { mode: 'system', behavior: 'on-off' };
    expect(
      resolvePageTheme(settings, 'https://example.com', false).activeOnPage,
    ).toBe(false);
    expect(
      resolvePageTheme(settings, 'https://example.com', false).inactiveReason,
    ).toBe('automation');
    expect(
      resolvePageTheme(settings, 'https://example.com', true).activeOnPage,
    ).toBe(true);

    settings.automation = { mode: 'time', behavior: 'on-off' };
    settings.time = { activation: '18:00', deactivation: '09:00' };
    expect(
      resolvePageTheme(
        settings,
        'https://example.com',
        false,
        new Date('2026-07-17T23:00:00'),
      ).activeOnPage,
    ).toBe(true);
    expect(
      resolvePageTheme(
        settings,
        'https://example.com',
        false,
        new Date('2026-07-17T12:00:00'),
      ).activeOnPage,
    ).toBe(false);
    expect(
      nextPageThemeAutomationChange(settings, new Date('2026-07-17T23:00:00')),
    ).toBe(new Date('2026-07-18T09:00:00').getTime());
    expect(
      nextPageThemeAutomationChange(settings, new Date('2026-07-17T12:00:00')),
    ).toBe(new Date('2026-07-17T18:00:00').getTime());
  });

  it('distinguishes global, site, and automation inactivity', () => {
    const globallyDisabled = defaultPageThemeSettings();
    globallyDisabled.enabled = false;
    expect(
      resolvePageTheme(globallyDisabled, 'https://example.com', false)
        .inactiveReason,
    ).toBe('global-disabled');

    const siteDisabled = defaultPageThemeSettings();
    siteDisabled.enabled = true;
    siteDisabled.enabledByDefault = true;
    siteDisabled.disabledFor = ['example.com'];
    expect(
      resolvePageTheme(siteDisabled, 'https://example.com', false)
        .inactiveReason,
    ).toBe('site-disabled');
  });

  it('rejects incomplete settings records', () => {
    expect(isPageThemeSettings(defaultPageThemeSettings())).toBe(true);
    expect(
      isPageThemeSettings({ ...defaultPageThemeSettings(), theme: {} }),
    ).toBe(false);
  });
});
