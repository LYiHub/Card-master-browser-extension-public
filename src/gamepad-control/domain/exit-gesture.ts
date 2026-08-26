import type { GamepadInputSnapshot } from './types';

const EXIT_GESTURE_THRESHOLD = 0.55;
const EXIT_GESTURE_HOLD_MS = 900;
const EXIT_GESTURE_DROPOUT_GRACE_MS = 180;

function rangeProgress(value: number, start: number, end: number) {
  return Math.min(1, Math.max(0, (value - start) / (end - start)));
}

export function gamepadExitGestureStrength(snapshot: GamepadInputSnapshot) {
  const [leftX = 0, leftY = 0, rightX = 0, rightY = 0] = snapshot.axes;
  const downward = Math.min(
    rangeProgress(leftY, 0.28, 0.72),
    rangeProgress(rightY, 0.28, 0.72),
  );
  const stickMagnitude = Math.min(
    rangeProgress(Math.hypot(leftX, leftY), 0.46, 0.82),
    rangeProgress(Math.hypot(rightX, rightY), 0.46, 0.82),
  );
  const combinedInward = rangeProgress(leftX - rightX, 0.15, 0.85);
  return Math.min(downward, stickMagnitude, combinedInward);
}

export class GamepadExitGestureTracker {
  private startedAt: number | null = null;
  private lastMatchedAt: number | null = null;

  update(snapshot: GamepadInputSnapshot, now: number) {
    const strength = gamepadExitGestureStrength(snapshot);
    if (strength >= EXIT_GESTURE_THRESHOLD) {
      if (
        this.startedAt !== null &&
        this.lastMatchedAt !== null &&
        now - this.lastMatchedAt > EXIT_GESTURE_DROPOUT_GRACE_MS
      ) {
        this.startedAt = now;
      } else {
        this.startedAt ??= now;
      }
      this.lastMatchedAt = now;
    } else if (
      this.startedAt !== null &&
      this.lastMatchedAt !== null &&
      now - this.lastMatchedAt <= EXIT_GESTURE_DROPOUT_GRACE_MS
    ) {
      // Preserve progress through small involuntary stick deviations.
    } else {
      this.reset();
    }

    const progress =
      this.startedAt === null
        ? 0
        : Math.min(
            1,
            Math.max(0, (now - this.startedAt) / EXIT_GESTURE_HOLD_MS),
          );
    return {
      strength,
      progress,
      complete: progress >= 1,
    };
  }

  reset() {
    this.startedAt = null;
    this.lastMatchedAt = null;
  }
}
