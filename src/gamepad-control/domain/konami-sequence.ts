import {
  latchedGamepadButtons,
  newlyPressedGamepadButtons,
  STANDARD_GAMEPAD_BUTTON,
} from './input';
import type { GamepadInputSnapshot } from './types';

type KonamiInput = 'up' | 'down' | 'left' | 'right' | 'b' | 'a';

const KONAMI_SEQUENCE: readonly KonamiInput[] = [
  'up',
  'up',
  'down',
  'down',
  'left',
  'right',
  'left',
  'right',
  'b',
  'a',
];

const INPUT_TIMEOUT_MS = 3_000;

function nintendoController(id: string) {
  return /nintendo|switch|joy-con|vendor[:=]\s*057e/i.test(id);
}

export function konamiFaceButtonIndices(id: string) {
  return nintendoController(id) ? { b: 0, a: 1 } : { b: 1, a: 0 };
}

function inputForButton(index: number, id: string): KonamiInput | null {
  if (index === STANDARD_GAMEPAD_BUTTON.dpadUp) return 'up';
  if (index === STANDARD_GAMEPAD_BUTTON.dpadDown) return 'down';
  if (index === STANDARD_GAMEPAD_BUTTON.dpadLeft) return 'left';
  if (index === STANDARD_GAMEPAD_BUTTON.dpadRight) return 'right';
  const faceButtons = konamiFaceButtonIndices(id);
  if (index === faceButtons.b) return 'b';
  if (index === faceButtons.a) return 'a';
  return null;
}

export class GamepadKonamiSequenceTracker {
  private buttons: boolean[] = [];
  private progress = 0;
  private lastInputAt = Number.NEGATIVE_INFINITY;
  private deviceId = '';

  update(snapshot: GamepadInputSnapshot, timestamp: number): number | null {
    if (!snapshot.connected) {
      this.reset();
      return null;
    }
    if (snapshot.id !== this.deviceId) {
      this.deviceId = snapshot.id;
      this.buttons = latchedGamepadButtons(snapshot, []);
      this.progress = 0;
      return null;
    }

    const next = newlyPressedGamepadButtons(this.buttons, snapshot);
    this.buttons = next.current;
    if (next.pressed.length === 0) return null;
    if (
      next.pressed.length > 1 ||
      timestamp - this.lastInputAt > INPUT_TIMEOUT_MS
    ) {
      this.progress = 0;
    }
    this.lastInputAt = timestamp;
    if (next.pressed.length !== 1) return null;

    const pressedButton = next.pressed[0] as number;
    const input = inputForButton(pressedButton, snapshot.id);
    if (!input) {
      this.progress = 0;
      return null;
    }
    if (input === KONAMI_SEQUENCE[this.progress]) {
      this.progress += 1;
      if (this.progress < KONAMI_SEQUENCE.length) return null;
      this.progress = 0;
      return pressedButton;
    }
    this.progress = input === KONAMI_SEQUENCE[0] ? 1 : 0;
    return null;
  }

  reset(snapshot?: GamepadInputSnapshot) {
    this.buttons = snapshot ? latchedGamepadButtons(snapshot, []) : [];
    this.progress = 0;
    this.lastInputAt = Number.NEGATIVE_INFINITY;
    this.deviceId = snapshot?.id ?? '';
  }
}
