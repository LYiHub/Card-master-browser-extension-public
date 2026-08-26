import {
  applyGamepadResponseCurve,
  type GamepadResponseCurve,
} from './response-curve';
import type { GamepadInputSnapshot } from './types';

export const STANDARD_GAMEPAD_BUTTON = {
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export const STANDARD_GAMEPAD_AXIS = {
  leftX: 0,
  leftY: 1,
  rightX: 2,
  rightY: 3,
} as const;

export const GAMEPAD_BUTTON_PRESS_THRESHOLD = 0.5;
export const GAMEPAD_BUTTON_RELEASE_THRESHOLD = 0.35;
export const GAMEPAD_AXIS_DEAD_ZONE = 0.16;

export type GamepadDirection = 'up' | 'down' | 'left' | 'right';
export type Point = { x: number; y: number };
export type ViewportSize = { width: number; height: number };

export function gamepadButtonPressed(
  snapshot: GamepadInputSnapshot,
  index: number,
) {
  return (snapshot.buttons[index] ?? 0) >= GAMEPAD_BUTTON_PRESS_THRESHOLD;
}

export function latchedGamepadButtons(
  snapshot: GamepadInputSnapshot,
  previous: readonly boolean[],
) {
  const length = Math.max(snapshot.buttons.length, previous.length);
  return Array.from({ length }, (_, index) => {
    const value = snapshot.buttons[index] ?? 0;
    return previous[index]
      ? value > GAMEPAD_BUTTON_RELEASE_THRESHOLD
      : value >= GAMEPAD_BUTTON_PRESS_THRESHOLD;
  });
}

export function newlyPressedGamepadButtons(
  previous: readonly boolean[],
  snapshot: GamepadInputSnapshot,
) {
  const current = latchedGamepadButtons(snapshot, previous);
  const pressed = current.flatMap((active, index) =>
    active && !previous[index] ? [index] : [],
  );
  return { current, pressed };
}

export function gamepadAxis(
  snapshot: GamepadInputSnapshot,
  index: number,
  deadZone = GAMEPAD_AXIS_DEAD_ZONE,
) {
  const value = Math.max(-1, Math.min(1, snapshot.axes[index] ?? 0));
  const normalized = normalizedGamepadAxisMagnitude(value, deadZone);
  return Math.sign(value) * normalized ** 1.45;
}

export function normalizedGamepadAxisMagnitude(
  value: number,
  deadZone = GAMEPAD_AXIS_DEAD_ZONE,
) {
  const magnitude = Math.abs(Math.max(-1, Math.min(1, value)));
  if (magnitude <= deadZone) return 0;
  return (magnitude - deadZone) / (1 - deadZone);
}

export function gamepadAxisWithCurve(
  snapshot: GamepadInputSnapshot,
  index: number,
  deadZone: number,
  curve: GamepadResponseCurve,
) {
  const value = Math.max(-1, Math.min(1, snapshot.axes[index] ?? 0));
  const magnitude = normalizedGamepadAxisMagnitude(value, deadZone);
  return Math.sign(value) * applyGamepadResponseCurve(magnitude, curve);
}

export function normalizedGamepadStickMagnitude(
  snapshot: GamepadInputSnapshot,
  axes: readonly [number, number],
  deadZone = GAMEPAD_AXIS_DEAD_ZONE,
) {
  const x = Math.max(-1, Math.min(1, snapshot.axes[axes[0]] ?? 0));
  const y = Math.max(-1, Math.min(1, snapshot.axes[axes[1]] ?? 0));
  const magnitude = Math.min(1, Math.hypot(x, y));
  if (magnitude <= deadZone) return 0;
  return (magnitude - deadZone) / (1 - deadZone);
}

export function gamepadStickVectorWithCurve(
  snapshot: GamepadInputSnapshot,
  axes: readonly [number, number],
  deadZone: number,
  curve: GamepadResponseCurve,
) {
  const x = Math.max(-1, Math.min(1, snapshot.axes[axes[0]] ?? 0));
  const y = Math.max(-1, Math.min(1, snapshot.axes[axes[1]] ?? 0));
  const rawMagnitude = Math.hypot(x, y);
  if (rawMagnitude === 0) return { x: 0, y: 0 };
  const normalizedMagnitude = normalizedGamepadStickMagnitude(
    snapshot,
    axes,
    deadZone,
  );
  if (normalizedMagnitude === 0) return { x: 0, y: 0 };
  const outputMagnitude = applyGamepadResponseCurve(normalizedMagnitude, curve);
  return {
    x: (x / rawMagnitude) * outputMagnitude,
    y: (y / rawMagnitude) * outputMagnitude,
  };
}

export function gamepadDirections(
  snapshot: GamepadInputSnapshot,
): GamepadDirection[] {
  const directions: GamepadDirection[] = [];
  if (gamepadButtonPressed(snapshot, STANDARD_GAMEPAD_BUTTON.dpadUp)) {
    directions.push('up');
  }
  if (gamepadButtonPressed(snapshot, STANDARD_GAMEPAD_BUTTON.dpadDown)) {
    directions.push('down');
  }
  if (gamepadButtonPressed(snapshot, STANDARD_GAMEPAD_BUTTON.dpadLeft)) {
    directions.push('left');
  }
  if (gamepadButtonPressed(snapshot, STANDARD_GAMEPAD_BUTTON.dpadRight)) {
    directions.push('right');
  }
  return directions;
}

export function moveGamepadCursor({
  position,
  input,
  elapsedMs,
  viewport,
  speed = 1_560,
  inset = 10,
}: {
  position: Point;
  input: Point;
  elapsedMs: number;
  viewport: ViewportSize;
  speed?: number;
  inset?: number;
}) {
  const elapsedSeconds = Math.min(40, Math.max(0, elapsedMs)) / 1_000;
  return {
    x: Math.min(
      Math.max(inset, viewport.width - inset),
      Math.max(inset, position.x + input.x * speed * elapsedSeconds),
    ),
    y: Math.min(
      Math.max(inset, viewport.height - inset),
      Math.max(inset, position.y + input.y * speed * elapsedSeconds),
    ),
  };
}
