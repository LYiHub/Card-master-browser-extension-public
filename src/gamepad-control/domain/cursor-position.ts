import type { Point, ViewportSize } from './input';

export const GAMEPAD_CURSOR_POSITION_STORAGE_KEY =
  'card-master.gamepad-cursor-position.v1';

export type GamepadCursorPosition = {
  x: number;
  y: number;
};

export function isGamepadCursorPosition(
  value: unknown,
): value is GamepadCursorPosition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const position = value as Record<string, unknown>;
  return (
    typeof position.x === 'number' &&
    Number.isFinite(position.x) &&
    position.x >= 0 &&
    position.x <= 1 &&
    typeof position.y === 'number' &&
    Number.isFinite(position.y) &&
    position.y >= 0 &&
    position.y <= 1
  );
}

export function viewportGamepadCursorPosition(
  position: Point,
  viewport: ViewportSize,
  inset = 10,
): GamepadCursorPosition {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  return {
    x:
      Math.min(Math.max(inset, width - inset), Math.max(inset, position.x)) /
      width,
    y:
      Math.min(Math.max(inset, height - inset), Math.max(inset, position.y)) /
      height,
  };
}

export function applyGamepadCursorPosition(
  stored: GamepadCursorPosition,
  viewport: ViewportSize,
  inset = 10,
): Point {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  return {
    x: Math.min(Math.max(inset, width - inset), stored.x * width),
    y: Math.min(Math.max(inset, height - inset), stored.y * height),
  };
}
