import {
  defaultGamepadBindings,
  type GamepadBindings,
  isGamepadBindings,
  normalizeGamepadBindings,
} from './bindings';
import { GAMEPAD_CURSOR_ACCELERATION_DURATION_RANGE } from './motion';
import {
  cloneGamepadResponseCurve,
  DEFAULT_GAMEPAD_FEEL_PRESET,
  GAMEPAD_CURSOR_SPEED_RANGE,
  GAMEPAD_SCROLL_SPEED_RANGE,
  type GamepadResponseCurve,
  isGamepadResponseCurve,
  normalizeGamepadResponseCurve,
} from './response-curve';

export const GAMEPAD_CONTROL_STORAGE_KEY = 'card-master.gamepad-control.v1';

export type GamepadControlSettings = {
  version: 1;
  revision: number;
  enabled: boolean;
  showControllerIndicator: boolean;
  bindings: GamepadBindings;
  cursorSpeed: number;
  scrollSpeed: number;
  cursorRampMs: number;
  cursorResponse: GamepadResponseCurve;
  scrollResponse: GamepadResponseCurve;
  stickDeadZone: number;
  repeatDelayMs: number;
  repeatIntervalMs: number;
};

export type GamepadControlController = {
  readSettings(): Promise<GamepadControlSettings>;
  saveSettings(
    settings: GamepadControlSettings,
  ): Promise<GamepadControlSettings>;
  subscribe(listener: (settings: GamepadControlSettings) => void): () => void;
};

export function defaultGamepadControlSettings(): GamepadControlSettings {
  return {
    version: 1,
    revision: 0,
    enabled: false,
    showControllerIndicator: true,
    bindings: defaultGamepadBindings(),
    cursorSpeed: DEFAULT_GAMEPAD_FEEL_PRESET.cursorSpeed,
    scrollSpeed: DEFAULT_GAMEPAD_FEEL_PRESET.scrollSpeed,
    cursorRampMs: DEFAULT_GAMEPAD_FEEL_PRESET.cursorRampMs,
    cursorResponse: cloneGamepadResponseCurve(
      DEFAULT_GAMEPAD_FEEL_PRESET.cursorResponse,
    ),
    scrollResponse: cloneGamepadResponseCurve(
      DEFAULT_GAMEPAD_FEEL_PRESET.scrollResponse,
    ),
    stickDeadZone: 0.16,
    repeatDelayMs: 320,
    repeatIntervalMs: 90,
  };
}

function finiteRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export function isGamepadControlSettings(
  value: unknown,
): value is GamepadControlSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return (
    settings.version === 1 &&
    Number.isSafeInteger(settings.revision) &&
    Number(settings.revision) >= 0 &&
    typeof settings.enabled === 'boolean' &&
    typeof settings.showControllerIndicator === 'boolean' &&
    isGamepadBindings(settings.bindings) &&
    finiteRange(
      settings.cursorSpeed,
      GAMEPAD_CURSOR_SPEED_RANGE.minimum,
      GAMEPAD_CURSOR_SPEED_RANGE.maximum,
    ) &&
    finiteRange(
      settings.scrollSpeed,
      GAMEPAD_SCROLL_SPEED_RANGE.minimum,
      GAMEPAD_SCROLL_SPEED_RANGE.maximum,
    ) &&
    finiteRange(
      settings.cursorRampMs,
      GAMEPAD_CURSOR_ACCELERATION_DURATION_RANGE.minimum,
      GAMEPAD_CURSOR_ACCELERATION_DURATION_RANGE.maximum,
    ) &&
    isGamepadResponseCurve(settings.cursorResponse) &&
    isGamepadResponseCurve(settings.scrollResponse) &&
    finiteRange(settings.stickDeadZone, 0.05, 0.45) &&
    finiteRange(settings.repeatDelayMs, 160, 800) &&
    finiteRange(settings.repeatIntervalMs, 45, 240)
  );
}

export function normalizeGamepadControlSettings(
  value: GamepadControlSettings,
): GamepadControlSettings {
  return {
    version: 1,
    revision: Math.max(0, Math.round(value.revision)),
    enabled: value.enabled,
    showControllerIndicator: value.showControllerIndicator,
    bindings: normalizeGamepadBindings(value.bindings),
    cursorSpeed: Math.max(
      GAMEPAD_CURSOR_SPEED_RANGE.minimum,
      Math.min(
        GAMEPAD_CURSOR_SPEED_RANGE.maximum,
        Math.round(value.cursorSpeed),
      ),
    ),
    scrollSpeed: Math.max(
      GAMEPAD_SCROLL_SPEED_RANGE.minimum,
      Math.min(
        GAMEPAD_SCROLL_SPEED_RANGE.maximum,
        Math.round(value.scrollSpeed),
      ),
    ),
    cursorRampMs: Math.round(value.cursorRampMs),
    cursorResponse: normalizeGamepadResponseCurve(value.cursorResponse),
    scrollResponse: normalizeGamepadResponseCurve(value.scrollResponse),
    stickDeadZone: Math.round(value.stickDeadZone * 100) / 100,
    repeatDelayMs: Math.round(value.repeatDelayMs),
    repeatIntervalMs: Math.round(value.repeatIntervalMs),
  };
}
