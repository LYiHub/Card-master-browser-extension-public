import { describe, expect, it } from 'vitest';

import {
  applyGamepadCursorPosition,
  isGamepadCursorPosition,
  viewportGamepadCursorPosition,
} from './cursor-position';

describe('gamepad cursor position', () => {
  it('stores and restores a viewport-relative point', () => {
    const stored = viewportGamepadCursorPosition(
      { x: 320, y: 180 },
      { width: 1280, height: 720 },
    );
    expect(stored).toEqual({ x: 0.25, y: 0.25 });
    expect(
      applyGamepadCursorPosition(stored, { width: 1920, height: 1080 }),
    ).toEqual({ x: 480, y: 270 });
    expect(isGamepadCursorPosition(stored)).toBe(true);
    expect(isGamepadCursorPosition({ x: 1.2, y: 0.2 })).toBe(false);
  });
});
