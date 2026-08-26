export type GamepadMotionVector = {
  x: number;
  y: number;
};

export const GAMEPAD_CURSOR_ACCELERATION_DURATION_RANGE = {
  minimum: 240,
  maximum: 1_800,
} as const;

const MOTION_SETTLE_EPSILON = 0.0005;
const MINIMUM_ACCELERATION_SCALE = 0.18;
const BRAKING_DURATION_RATIO = 0.3;
const MINIMUM_BRAKING_DURATION_MS = 80;
const MAXIMUM_BRAKING_DURATION_MS = 260;

function motionMagnitude(vector: GamepadMotionVector) {
  return Math.hypot(vector.x, vector.y);
}

function approachVector(
  current: GamepadMotionVector,
  target: GamepadMotionVector,
  maximumDelta: number,
) {
  const delta = {
    x: target.x - current.x,
    y: target.y - current.y,
  };
  const distance = motionMagnitude(delta);
  if (distance <= maximumDelta || distance === 0) return target;
  const ratio = maximumDelta / distance;
  return {
    x: current.x + delta.x * ratio,
    y: current.y + delta.y * ratio,
  };
}

export function advanceGamepadMotion({
  current,
  target,
  elapsedMs,
  accelerationMs,
}: {
  current: GamepadMotionVector;
  target: GamepadMotionVector;
  elapsedMs: number;
  accelerationMs: number;
}): GamepadMotionVector {
  const elapsed = Math.min(50, Math.max(0, elapsedMs));
  if (elapsed === 0) return current;
  const currentMagnitude = motionMagnitude(current);
  const targetMagnitude = motionMagnitude(target);
  const sameDirection = current.x * target.x + current.y * target.y >= 0;
  const braking =
    targetMagnitude === 0 ||
    !sameDirection ||
    targetMagnitude < currentMagnitude;
  const duration = braking
    ? Math.max(
        MINIMUM_BRAKING_DURATION_MS,
        Math.min(
          MAXIMUM_BRAKING_DURATION_MS,
          accelerationMs * BRAKING_DURATION_RATIO,
        ),
      )
    : Math.max(
        GAMEPAD_CURSOR_ACCELERATION_DURATION_RANGE.minimum,
        accelerationMs,
      );
  const accelerationScale = braking
    ? 1
    : MINIMUM_ACCELERATION_SCALE +
      (1 - MINIMUM_ACCELERATION_SCALE) * targetMagnitude;
  const next = approachVector(
    current,
    target,
    (elapsed / duration) * accelerationScale,
  );
  return {
    x: Math.abs(next.x) < MOTION_SETTLE_EPSILON ? 0 : next.x,
    y: Math.abs(next.y) < MOTION_SETTLE_EPSILON ? 0 : next.y,
  };
}

export function gamepadMotionActive(vector: GamepadMotionVector) {
  return vector.x !== 0 || vector.y !== 0;
}
