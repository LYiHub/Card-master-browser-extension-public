export type GamepadResponseCurvePoint = {
  x: number;
  y: number;
};

export type GamepadResponseCurve = {
  p1: GamepadResponseCurvePoint;
  p2: GamepadResponseCurvePoint;
};

export type GamepadFeelPresetId = 'precision' | 'balanced' | 'rapid';

export type GamepadFeelPreset = {
  id: GamepadFeelPresetId;
  label: string;
  description: string;
  cursorSpeed: number;
  scrollSpeed: number;
  cursorRampMs: number;
  cursorResponse: GamepadResponseCurve;
  scrollResponse: GamepadResponseCurve;
};

export const GAMEPAD_CURSOR_SPEED_RANGE = {
  minimum: 120,
  maximum: 3_600,
} as const;

export const GAMEPAD_SCROLL_SPEED_RANGE = {
  minimum: 120,
  maximum: 6_000,
} as const;

export const GAMEPAD_FEEL_PRESETS: readonly GamepadFeelPreset[] = [
  {
    id: 'precision',
    label: '精准',
    description: '光标缓启动，滚动保持低速精确',
    cursorSpeed: 1_300,
    scrollSpeed: 1_100,
    cursorRampMs: 900,
    cursorResponse: {
      p1: { x: 0.9, y: 0 },
      p2: { x: 1, y: 0.015 },
    },
    scrollResponse: {
      p1: { x: 0.3, y: 0.01 },
      p2: { x: 0.72, y: 0.5 },
    },
  },
  {
    id: 'balanced',
    label: '均衡',
    description: '光标平顺加速，滚动即时响应',
    cursorSpeed: 2_600,
    scrollSpeed: 2_250,
    cursorRampMs: 780,
    cursorResponse: {
      p1: { x: 0.88, y: 0.001 },
      p2: { x: 0.995, y: 0.03 },
    },
    scrollResponse: {
      p1: { x: 0.24, y: 0.015 },
      p2: { x: 0.58, y: 0.84 },
    },
  },
  {
    id: 'rapid',
    label: '疾驰',
    description: '光标快速响应，滚动保持较高上限',
    cursorSpeed: 3_600,
    scrollSpeed: 4_800,
    cursorRampMs: 520,
    cursorResponse: {
      p1: { x: 0.8, y: 0.002 },
      p2: { x: 0.98, y: 0.08 },
    },
    scrollResponse: {
      p1: { x: 0.16, y: 0.01 },
      p2: { x: 0.4, y: 0.97 },
    },
  },
] as const;

export const DEFAULT_GAMEPAD_FEEL_PRESET = GAMEPAD_FEEL_PRESETS[1];

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function roundCurveValue(value: number) {
  return Math.round(clampUnit(value) * 1_000) / 1_000;
}

function cubicBezierCoordinate(
  parameter: number,
  firstControl: number,
  secondControl: number,
) {
  const inverse = 1 - parameter;
  return (
    3 * inverse * inverse * parameter * firstControl +
    3 * inverse * parameter * parameter * secondControl +
    parameter * parameter * parameter
  );
}

export function isGamepadResponseCurve(
  value: unknown,
): value is GamepadResponseCurve {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const curve = value as Record<string, unknown>;
  if (
    !curve.p1 ||
    typeof curve.p1 !== 'object' ||
    Array.isArray(curve.p1) ||
    !curve.p2 ||
    typeof curve.p2 !== 'object' ||
    Array.isArray(curve.p2)
  ) {
    return false;
  }
  const p1 = curve.p1 as Record<string, unknown>;
  const p2 = curve.p2 as Record<string, unknown>;
  const values = [p1.x, p1.y, p2.x, p2.y];
  return (
    values.every(
      (entry) =>
        typeof entry === 'number' &&
        Number.isFinite(entry) &&
        entry >= 0 &&
        entry <= 1,
    ) &&
    Number(p1.x) <= Number(p2.x) &&
    Number(p1.y) <= Number(p2.y)
  );
}

export function normalizeGamepadResponseCurve(
  curve: GamepadResponseCurve,
): GamepadResponseCurve {
  const first = {
    x: roundCurveValue(curve.p1.x),
    y: roundCurveValue(curve.p1.y),
  };
  const second = {
    x: roundCurveValue(curve.p2.x),
    y: roundCurveValue(curve.p2.y),
  };
  return {
    p1: {
      x: Math.min(first.x, second.x),
      y: Math.min(first.y, second.y),
    },
    p2: {
      x: Math.max(first.x, second.x),
      y: Math.max(first.y, second.y),
    },
  };
}

export function cloneGamepadResponseCurve(
  curve: GamepadResponseCurve,
): GamepadResponseCurve {
  return {
    p1: { ...curve.p1 },
    p2: { ...curve.p2 },
  };
}

export function applyGamepadResponseCurve(
  input: number,
  curve: GamepadResponseCurve,
) {
  const target = clampUnit(input);
  if (target === 0 || target === 1) return target;
  const firstX = Math.min(clampUnit(curve.p1.x), clampUnit(curve.p2.x));
  const secondX = Math.max(clampUnit(curve.p1.x), clampUnit(curve.p2.x));
  const firstY = Math.min(clampUnit(curve.p1.y), clampUnit(curve.p2.y));
  const secondY = Math.max(clampUnit(curve.p1.y), clampUnit(curve.p2.y));
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const parameter = (lower + upper) / 2;
    const x = cubicBezierCoordinate(parameter, firstX, secondX);
    if (x < target) lower = parameter;
    else upper = parameter;
  }
  return cubicBezierCoordinate((lower + upper) / 2, firstY, secondY);
}

function curvesEqual(left: GamepadResponseCurve, right: GamepadResponseCurve) {
  return (
    left.p1.x === right.p1.x &&
    left.p1.y === right.p1.y &&
    left.p2.x === right.p2.x &&
    left.p2.y === right.p2.y
  );
}

export function matchingGamepadFeelPreset(settings: {
  cursorSpeed: number;
  scrollSpeed: number;
  cursorRampMs: number;
  cursorResponse: GamepadResponseCurve;
  scrollResponse: GamepadResponseCurve;
}) {
  return (
    GAMEPAD_FEEL_PRESETS.find(
      (preset) =>
        settings.cursorSpeed === preset.cursorSpeed &&
        settings.scrollSpeed === preset.scrollSpeed &&
        settings.cursorRampMs === preset.cursorRampMs &&
        curvesEqual(settings.cursorResponse, preset.cursorResponse) &&
        curvesEqual(settings.scrollResponse, preset.scrollResponse),
    )?.id ?? null
  );
}
