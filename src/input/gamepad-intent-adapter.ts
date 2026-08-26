import {
  defaultGamepadBindings,
  GAMEPAD_BUTTON_BINDING_DEFINITIONS,
  type GamepadBindingAction,
  type GamepadBindings,
  gamepadClaimedButtons,
  gamepadStickAxes,
  isGamepadContinuousButtonAction,
  normalizeGamepadBindings,
} from '../gamepad-control/domain/bindings';
import {
  GAMEPAD_BUTTON_RELEASE_THRESHOLD,
  gamepadAxis,
  gamepadStickVectorWithCurve,
  latchedGamepadButtons,
  STANDARD_GAMEPAD_BUTTON,
} from '../gamepad-control/domain/input';
import { gamepadMotionActive } from '../gamepad-control/domain/motion';
import {
  applyGamepadResponseCurve,
  cloneGamepadResponseCurve,
  DEFAULT_GAMEPAD_FEEL_PRESET,
  type GamepadResponseCurve,
} from '../gamepad-control/domain/response-curve';
import type { GamepadInputSnapshot } from '../gamepad-control/domain/types';
import type {
  InputModality,
  IntentEnvelope,
  IntentPhase,
  InteractionIntent,
  NavigationDirection,
} from './intents';

const DEFAULT_DIRECTION_REPEAT_DELAY_MS = 320;
const DEFAULT_DIRECTION_REPEAT_INTERVAL_MS = 90;
const STICK_ENTER_THRESHOLD = 0.56;
const STICK_EXIT_THRESHOLD = 0.38;
const TRIGGER_THRESHOLD = 0.15;
const MENU_HOLD_MS = 450;
const PUSH_TO_TALK_HOLD_MS = 360;

type DirectionControl = 'dpad' | 'primary-stick';
type GamepadIntentAdapterOptions = {
  repeatConfirm?: boolean;
};

const DISCRETE_BUTTON_DEFINITIONS = GAMEPAD_BUTTON_BINDING_DEFINITIONS.filter(
  ({ action }) =>
    action !== 'toggleDeck' &&
    action !== 'pushToTalk' &&
    !isGamepadContinuousButtonAction(action),
);

function envelope(
  intent: InteractionIntent,
  phase: IntentPhase,
  timestamp: number,
  deviceId: string,
  source: InputModality = 'gamepad',
): IntentEnvelope {
  return {
    intent,
    source,
    deviceId: deviceId || null,
    phase,
    timestamp,
  };
}

function dominantStickDirection(
  snapshot: GamepadInputSnapshot,
  current: NavigationDirection | null,
  deadZone: number,
  axes: readonly [number, number],
) {
  const x = gamepadAxis(snapshot, axes[0], deadZone);
  const y = gamepadAxis(snapshot, axes[1], deadZone);
  const threshold = current ? STICK_EXIT_THRESHOLD : STICK_ENTER_THRESHOLD;
  if (Math.max(Math.abs(x), Math.abs(y)) < threshold) return null;
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

function dpadDirections(
  buttons: readonly boolean[],
  claimedButtons: ReadonlySet<number>,
) {
  const directions: NavigationDirection[] = [];
  if (
    !claimedButtons.has(STANDARD_GAMEPAD_BUTTON.dpadUp) &&
    buttons[STANDARD_GAMEPAD_BUTTON.dpadUp]
  ) {
    directions.push('up');
  }
  if (
    !claimedButtons.has(STANDARD_GAMEPAD_BUTTON.dpadDown) &&
    buttons[STANDARD_GAMEPAD_BUTTON.dpadDown]
  ) {
    directions.push('down');
  }
  if (
    !claimedButtons.has(STANDARD_GAMEPAD_BUTTON.dpadLeft) &&
    buttons[STANDARD_GAMEPAD_BUTTON.dpadLeft]
  ) {
    directions.push('left');
  }
  if (
    !claimedButtons.has(STANDARD_GAMEPAD_BUTTON.dpadRight) &&
    buttons[STANDARD_GAMEPAD_BUTTON.dpadRight]
  ) {
    directions.push('right');
  }
  return directions;
}

function actionIntent(action: GamepadBindingAction): InteractionIntent | null {
  switch (action) {
    case 'confirm':
      return { type: 'confirm' };
    case 'back':
      return { type: 'back' };
    case 'browserTabPrevious':
      return { type: 'browserTabPrevious' };
    case 'browserTabNext':
      return { type: 'browserTabNext' };
    case 'contextPrevious':
      return { type: 'contextPrevious' };
    case 'contextNext':
      return { type: 'contextNext' };
    case 'reload':
      return { type: 'reload' };
    case 'toggleScreenKeyboard':
      return { type: 'toggleScreenKeyboard' };
    case 'newTab':
      return { type: 'newTab' };
    case 'cursorReset':
      return { type: 'cursorReset' };
    case 'toggleAudio':
      return { type: 'toggleAudio' };
    case 'pushToTalk':
      return { type: 'pushToTalk' };
    case 'toggleDeck':
      return { type: 'toggleDeck' };
    case 'pagePrevious':
    case 'pageNext':
      return null;
  }
}

export class GamepadIntentAdapter {
  private previousButtons: boolean[] = [];
  private armed = false;
  private stickDirection: NavigationDirection | null = null;
  private readonly repeatAt = new Map<string, number>();
  private holdPressedAt: number | null = null;
  private holdLongFired = false;
  private speechPressedAt: number | null = null;
  private speechHoldFired = false;
  private repeatDelayMs = DEFAULT_DIRECTION_REPEAT_DELAY_MS;
  private repeatIntervalMs = DEFAULT_DIRECTION_REPEAT_INTERVAL_MS;
  private stickDeadZone = 0.16;
  private scrollSpeed = DEFAULT_GAMEPAD_FEEL_PRESET.scrollSpeed;
  private scrollResponse = cloneGamepadResponseCurve(
    DEFAULT_GAMEPAD_FEEL_PRESET.scrollResponse,
  );
  private lastUpdateAt: number | null = null;
  private bindings = defaultGamepadBindings();
  private claimedButtons = gamepadClaimedButtons(this.bindings);

  constructor(private readonly options: GamepadIntentAdapterOptions = {}) {}

  configure({
    repeatDelayMs,
    repeatIntervalMs,
    stickDeadZone,
    scrollSpeed,
    scrollResponse,
    bindings,
  }: {
    repeatDelayMs: number;
    repeatIntervalMs: number;
    stickDeadZone: number;
    scrollSpeed: number;
    scrollResponse: GamepadResponseCurve;
    bindings: GamepadBindings;
  }) {
    this.repeatDelayMs = repeatDelayMs;
    this.repeatIntervalMs = repeatIntervalMs;
    this.stickDeadZone = stickDeadZone;
    this.scrollSpeed = scrollSpeed;
    this.scrollResponse = cloneGamepadResponseCurve(scrollResponse);
    this.bindings = normalizeGamepadBindings(bindings);
    this.claimedButtons = gamepadClaimedButtons(this.bindings);
    this.repeatAt.clear();
  }

  requireNeutral() {
    this.armed = false;
    this.repeatAt.clear();
    this.stickDirection = null;
    this.holdPressedAt = null;
    this.holdLongFired = false;
    this.speechPressedAt = null;
    this.speechHoldFired = false;
  }

  reset() {
    this.previousButtons = [];
    this.lastUpdateAt = null;
    this.requireNeutral();
  }

  private directionIntents(
    directions: readonly NavigationDirection[],
    control: DirectionControl,
    newlyPressed: ReadonlySet<number>,
    timestamp: number,
    deviceId: string,
  ) {
    const result: IntentEnvelope[] = [];
    const directionButton: Record<NavigationDirection, number> = {
      up: STANDARD_GAMEPAD_BUTTON.dpadUp,
      down: STANDARD_GAMEPAD_BUTTON.dpadDown,
      left: STANDARD_GAMEPAD_BUTTON.dpadLeft,
      right: STANDARD_GAMEPAD_BUTTON.dpadRight,
    };
    const prefix = `${control}:`;
    for (const key of this.repeatAt.keys()) {
      if (
        key.startsWith(prefix) &&
        !directions.includes(key.slice(prefix.length) as NavigationDirection)
      ) {
        this.repeatAt.delete(key);
      }
    }
    for (const direction of directions) {
      const key = `${prefix}${direction}`;
      const firstPress =
        control === 'dpad'
          ? newlyPressed.has(directionButton[direction])
          : this.stickDirection !== direction;
      const nextRepeatAt = this.repeatAt.get(key);
      if (firstPress) {
        result.push(
          envelope(
            { type: 'navigate', direction, control },
            'pressed',
            timestamp,
            deviceId,
          ),
        );
        this.repeatAt.set(key, timestamp + this.repeatDelayMs);
      } else if (nextRepeatAt !== undefined && timestamp >= nextRepeatAt) {
        result.push(
          envelope(
            { type: 'navigate', direction, control },
            'repeated',
            timestamp,
            deviceId,
          ),
        );
        this.repeatAt.set(key, timestamp + this.repeatIntervalMs);
      } else if (nextRepeatAt === undefined) {
        this.repeatAt.set(key, timestamp + this.repeatDelayMs);
      }
    }
    return result;
  }

  update(snapshot: GamepadInputSnapshot, timestamp: number) {
    if (!snapshot.connected) {
      this.reset();
      return [];
    }
    const elapsedSeconds =
      this.lastUpdateAt === null
        ? 0
        : Math.min(40, Math.max(0, timestamp - this.lastUpdateAt)) / 1_000;
    this.lastUpdateAt = timestamp;

    const currentButtons = latchedGamepadButtons(
      snapshot,
      this.previousButtons,
    );
    const neutral =
      snapshot.buttons.every(
        (value) => value <= GAMEPAD_BUTTON_RELEASE_THRESHOLD,
      ) &&
      snapshot.axes.every(
        (_axis, index) =>
          Math.abs(gamepadAxis(snapshot, index, this.stickDeadZone)) <=
          STICK_EXIT_THRESHOLD,
      );
    if (!this.armed) {
      this.previousButtons = currentButtons;
      this.stickDirection = dominantStickDirection(
        snapshot,
        null,
        this.stickDeadZone,
        gamepadStickAxes(this.bindings.primaryStick),
      );
      if (neutral) this.armed = true;
      return [];
    }

    const newlyPressed = new Set(
      currentButtons.flatMap((pressed, index) =>
        pressed && !this.previousButtons[index] ? [index] : [],
      ),
    );
    const newlyReleased = new Set(
      this.previousButtons.flatMap((pressed, index) =>
        pressed && !currentButtons[index] ? [index] : [],
      ),
    );
    this.previousButtons = currentButtons;
    const result: IntentEnvelope[] = [];
    const toggleDeckButton = this.bindings.buttons.toggleDeck;
    const pushToTalkButton = this.bindings.buttons.pushToTalk;
    const emitAction = (action: GamepadBindingAction, phase: IntentPhase) => {
      const intent = actionIntent(action);
      if (intent) {
        result.push(envelope(intent, phase, timestamp, snapshot.id));
      }
    };

    for (const { action } of DISCRETE_BUTTON_DEFINITIONS) {
      const button = this.bindings.buttons[action];
      if (
        button !== null &&
        button !== toggleDeckButton &&
        newlyPressed.has(button)
      ) {
        emitAction(action, 'pressed');
      }
    }

    const confirmButton = this.bindings.buttons.confirm;
    const confirmRepeatKey = 'button:confirm';
    if (
      !this.options.repeatConfirm ||
      confirmButton === null ||
      confirmButton === toggleDeckButton
    ) {
      this.repeatAt.delete(confirmRepeatKey);
    } else if (newlyPressed.has(confirmButton)) {
      this.repeatAt.set(confirmRepeatKey, timestamp + this.repeatDelayMs);
    } else if (!currentButtons[confirmButton]) {
      this.repeatAt.delete(confirmRepeatKey);
    } else {
      const nextRepeatAt = this.repeatAt.get(confirmRepeatKey);
      if (nextRepeatAt !== undefined && timestamp >= nextRepeatAt) {
        emitAction('confirm', 'repeated');
        this.repeatAt.set(confirmRepeatKey, timestamp + this.repeatIntervalMs);
      }
    }

    if (toggleDeckButton !== null) {
      if (newlyPressed.has(toggleDeckButton)) {
        this.holdPressedAt = timestamp;
        this.holdLongFired = false;
      }
      if (
        currentButtons[toggleDeckButton] &&
        this.holdPressedAt !== null &&
        !this.holdLongFired &&
        timestamp - this.holdPressedAt >= MENU_HOLD_MS
      ) {
        this.holdLongFired = true;
        emitAction('toggleDeck', 'pressed');
      }
      if (newlyReleased.has(toggleDeckButton)) {
        if (!this.holdLongFired) {
          const shortAction = DISCRETE_BUTTON_DEFINITIONS.find(
            ({ action }) => this.bindings.buttons[action] === toggleDeckButton,
          )?.action;
          if (shortAction) emitAction(shortAction, 'released');
        }
        this.holdPressedAt = null;
        this.holdLongFired = false;
      }
    }

    if (pushToTalkButton !== null) {
      if (newlyPressed.has(pushToTalkButton)) {
        this.speechPressedAt = timestamp;
        this.speechHoldFired = false;
      }
      if (
        currentButtons[pushToTalkButton] &&
        this.speechPressedAt !== null &&
        !this.speechHoldFired &&
        timestamp - this.speechPressedAt >= PUSH_TO_TALK_HOLD_MS
      ) {
        this.speechHoldFired = true;
        emitAction('pushToTalk', 'pressed');
      }
      if (newlyReleased.has(pushToTalkButton)) {
        if (this.speechHoldFired) emitAction('pushToTalk', 'released');
        else {
          result.push(
            envelope(
              { type: 'toggleSpeechOrDeck' },
              'released',
              timestamp,
              snapshot.id,
            ),
          );
        }
        this.speechPressedAt = null;
        this.speechHoldFired = false;
      }
    }

    const continuousStrength = (action: GamepadBindingAction) => {
      const button = this.bindings.buttons[action];
      if (button === null) return 0;
      const strength = snapshot.buttons[button] ?? 0;
      if (strength <= TRIGGER_THRESHOLD) return 0;
      const normalizedStrength =
        (strength - TRIGGER_THRESHOLD) / (1 - TRIGGER_THRESHOLD);
      return applyGamepadResponseCurve(normalizedStrength, this.scrollResponse);
    };
    const pageTarget =
      continuousStrength('pageNext') - continuousStrength('pagePrevious');
    if (pageTarget !== 0 && elapsedSeconds > 0) {
      const action = pageTarget < 0 ? 'pagePrevious' : 'pageNext';
      const strength = Math.abs(pageTarget);
      result.push(
        envelope(
          {
            type: action,
            strength,
            delta: strength * this.scrollSpeed * elapsedSeconds,
          },
          'continuous',
          timestamp,
          snapshot.id,
        ),
      );
    }

    result.push(
      ...this.directionIntents(
        dpadDirections(currentButtons, this.claimedButtons),
        'dpad',
        newlyPressed,
        timestamp,
        snapshot.id,
      ),
    );
    const previousStickDirection = this.stickDirection;
    const nextStickDirection = dominantStickDirection(
      snapshot,
      previousStickDirection,
      this.stickDeadZone,
      gamepadStickAxes(this.bindings.primaryStick),
    );
    this.stickDirection = previousStickDirection;
    result.push(
      ...this.directionIntents(
        nextStickDirection ? [nextStickDirection] : [],
        'primary-stick',
        newlyPressed,
        timestamp,
        snapshot.id,
      ),
    );
    this.stickDirection = nextStickDirection;

    const scrollAxes = gamepadStickAxes(this.bindings.secondaryStick);
    const scrollTarget = gamepadStickVectorWithCurve(
      snapshot,
      scrollAxes,
      this.stickDeadZone,
      this.scrollResponse,
    );
    if (gamepadMotionActive(scrollTarget) && elapsedSeconds > 0) {
      result.push(
        envelope(
          {
            type: 'scroll',
            deltaX: scrollTarget.x * this.scrollSpeed * elapsedSeconds,
            deltaY: scrollTarget.y * this.scrollSpeed * elapsedSeconds,
          },
          'continuous',
          timestamp,
          snapshot.id,
        ),
      );
    }

    return result;
  }
}
