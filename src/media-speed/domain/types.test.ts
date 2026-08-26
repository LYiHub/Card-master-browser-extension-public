import { describe, expect, it } from 'vitest';

import {
  defaultMediaSpeedSettings,
  isMediaSpeedSettings,
  mediaSpeedActiveOnPage,
  mediaSpeedSelectionForSite,
  mediaSpeedSiteLockEnabled,
  mediaSpeedWheelVisible,
  normalizeMediaSpeedSettings,
  setMediaSpeedSiteEnabled,
  setMediaSpeedSiteLock,
  setMediaSpeedSiteSelection,
  startingMediaSpeedSnapshot,
} from './types';

describe('media speed settings', () => {
  it('starts with six numeric positions plus random and hell modes', () => {
    const settings = defaultMediaSpeedSettings();

    expect(settings.wheelItems).toEqual([
      { kind: 'speed', speed: 0.5 },
      { kind: 'speed', speed: 1 },
      { kind: 'speed', speed: 1.25 },
      { kind: 'speed', speed: 1.5 },
      { kind: 'speed', speed: 2 },
      { kind: 'speed', speed: 4 },
      { kind: 'random' },
      { kind: 'hell' },
    ]);
    expect(settings.siteOverrides).toEqual({});
    expect(settings.includeAudio).toBe(true);
    expect(settings.version).toBe(1);
    expect(startingMediaSpeedSnapshot('https://example.com/')).toMatchObject({
      mediaCount: 0,
      videoCount: 0,
      audioCount: 0,
      wheelItems: settings.wheelItems,
    });
  });

  it('shows the wheel whenever the page has controllable video or audio', () => {
    const ready = {
      ...startingMediaSpeedSnapshot('https://example.com/'),
      status: 'ready' as const,
      mediaCount: 1,
      videoCount: 0,
      audioCount: 1,
    };

    expect(mediaSpeedWheelVisible(ready)).toBe(true);
    expect(
      mediaSpeedWheelVisible({
        ...ready,
        mediaCount: 0,
        audioCount: 0,
      }),
    ).toBe(false);
    expect(mediaSpeedWheelVisible({ ...ready, showWheel: false })).toBe(false);
  });

  it('preserves custom order while removing duplicate wheel positions', () => {
    const settings = normalizeMediaSpeedSettings({
      ...defaultMediaSpeedSettings(),
      defaultSpeed: 1.75,
      wheelItems: [
        { kind: 'hell' },
        { kind: 'speed', speed: 1.75 },
        { kind: 'random' },
        { kind: 'speed', speed: 1.75 },
        { kind: 'hell' },
      ],
      siteOverrides: {
        'https://video.example.com/watch': {
          selection: { mode: 'standard', speed: 1.75 },
        },
      },
    });

    expect(settings.wheelItems).toEqual([
      { kind: 'hell' },
      { kind: 'speed', speed: 1.75 },
      { kind: 'random' },
    ]);
    expect(settings.defaultSpeed).toBe(1.75);
    expect(settings.siteOverrides).toEqual({
      'example.com': {
        selection: { mode: 'standard', speed: 1.75 },
      },
    });
  });

  it('persists site behavior and native speeds outside the configured wheel', () => {
    const disabled = setMediaSpeedSiteEnabled(
      defaultMediaSpeedSettings(),
      'video.example.com',
      false,
    );
    const locked = setMediaSpeedSiteLock(
      disabled,
      'https://video.example.com/watch',
      true,
    );
    const selected = setMediaSpeedSiteSelection(
      locked,
      'https://video.example.com/watch',
      { mode: 'standard', speed: 1.75 },
    );

    expect(mediaSpeedActiveOnPage(selected, 'https://video.example.com/')).toBe(
      false,
    );
    expect(
      mediaSpeedSiteLockEnabled(selected, 'https://video.example.com/'),
    ).toBe(true);
    expect(mediaSpeedSelectionForSite(selected, 'video.example.com')).toEqual({
      mode: 'standard',
      speed: 1.75,
    });
    expect(
      setMediaSpeedSiteEnabled(selected, 'video.example.com', true)
        .siteOverrides,
    ).toEqual({
      'example.com': {
        lockSpeed: true,
        selection: { mode: 'standard', speed: 1.75 },
      },
    });
  });

  it('rejects empty or oversized wheel definitions', () => {
    const settings = defaultMediaSpeedSettings();

    expect(settings.version).toBe(1);
    expect(isMediaSpeedSettings({ ...settings, version: 2 })).toBe(false);
    expect(isMediaSpeedSettings({ ...settings, wheelItems: [] })).toBe(false);
    expect(
      isMediaSpeedSettings({
        ...settings,
        wheelItems: Array.from({ length: 13 }, (_, index) => ({
          kind: 'speed',
          speed: index + 1,
        })),
      }),
    ).toBe(false);
    expect(
      isMediaSpeedSettings({
        ...settings,
        siteOverrides: { 'example.com': {} },
      }),
    ).toBe(false);
  });
});
