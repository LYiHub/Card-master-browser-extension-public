import { describe, expect, it } from 'vitest';

import {
  defaultGamepadControlSettings,
  isGamepadControlSettings,
  normalizeGamepadControlSettings,
} from './settings';

describe('gamepad control settings', () => {
  it('uses the first public browser-control schema', () => {
    const settings = defaultGamepadControlSettings();

    expect(settings.version).toBe(1);
    expect(settings.enabled).toBe(false);
    expect(settings.showControllerIndicator).toBe(true);
    expect(settings.cursorSpeed).toBe(2_600);
    expect(settings.scrollSpeed).toBe(2_250);
    expect(settings.cursorRampMs).toBe(780);
    expect(settings).not.toHaveProperty('scrollRampMs');
    expect(settings.cursorResponse.p2.y).toBe(0.03);
    expect(settings.bindings.buttons.confirm).toBe(0);
    expect(settings.bindings.buttons.pushToTalk).toBe(17);
    expect(isGamepadControlSettings(settings)).toBe(true);
  });

  it('rejects non-v1 schemas', () => {
    expect(
      isGamepadControlSettings({
        ...defaultGamepadControlSettings(),
        version: 2,
      }),
    ).toBe(false);
  });

  it('requires an explicit global controller indicator preference', () => {
    const { showControllerIndicator: _indicator, ...incomplete } =
      defaultGamepadControlSettings();

    expect(isGamepadControlSettings(incomplete)).toBe(false);
  });

  it('normalizes bindings and curves without sharing mutable records', () => {
    const settings = defaultGamepadControlSettings();
    const normalized = normalizeGamepadControlSettings(settings);

    normalized.bindings.buttons.confirm = 11;
    normalized.cursorResponse.p1.x = 0.4;
    expect(settings.bindings.buttons.confirm).toBe(0);
    expect(settings.cursorResponse.p1.x).toBe(0.88);
  });

  it('preserves explicitly configured cursor feel', () => {
    const settings = normalizeGamepadControlSettings({
      ...defaultGamepadControlSettings(),
      cursorSpeed: 2_800,
      cursorRampMs: 520,
      cursorResponse: {
        p1: { x: 0.32, y: 0.012 },
        p2: { x: 0.72, y: 0.64 },
      },
      scrollSpeed: 2_900,
    });

    expect(settings.cursorSpeed).toBe(2_800);
    expect(settings.cursorRampMs).toBe(520);
    expect(settings.cursorResponse.p2).toEqual({ x: 0.72, y: 0.64 });
    expect(settings.scrollSpeed).toBe(2_900);
  });

  it('caps scroll speed at the half-scale maximum', () => {
    const settings = normalizeGamepadControlSettings({
      ...defaultGamepadControlSettings(),
      scrollSpeed: 12_000,
    });

    expect(settings.scrollSpeed).toBe(6_000);
  });
});
