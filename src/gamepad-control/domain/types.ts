export const GAMEPAD_CONTROL_CARD_ID = 'system-gamepad-control';

export type GamepadControlCard = {
  kind: 'gamepad-control';
  id: typeof GAMEPAD_CONTROL_CARD_ID;
  title: string;
  description: string;
  enabled: boolean;
  connected: boolean;
  deviceName: string;
};

export type GamepadInputSnapshot = {
  connected: boolean;
  index: number | null;
  id: string;
  mapping: string;
  buttons: number[];
  axes: number[];
};

export const DISCONNECTED_GAMEPAD_SNAPSHOT: GamepadInputSnapshot = {
  connected: false,
  index: null,
  id: '',
  mapping: '',
  buttons: [],
  axes: [],
};

function finiteNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= 64 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

export function isGamepadInputSnapshot(
  value: unknown,
): value is GamepadInputSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.connected === 'boolean' &&
    (snapshot.index === null ||
      (Number.isSafeInteger(snapshot.index) && Number(snapshot.index) >= 0)) &&
    typeof snapshot.id === 'string' &&
    snapshot.id.length <= 512 &&
    typeof snapshot.mapping === 'string' &&
    snapshot.mapping.length <= 128 &&
    finiteNumberArray(snapshot.buttons) &&
    finiteNumberArray(snapshot.axes)
  );
}
