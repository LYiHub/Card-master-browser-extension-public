import { describe, expect, it } from 'vitest';

import {
  defaultGamepadBindings,
  setGamepadButtonBinding,
  setGamepadStickBinding,
} from '../gamepad-control/domain/bindings';
import { applyGamepadResponseCurve } from '../gamepad-control/domain/response-curve';
import { defaultGamepadControlSettings } from '../gamepad-control/domain/settings';
import type { GamepadInputSnapshot } from '../gamepad-control/domain/types';
import { GamepadIntentAdapter } from './gamepad-intent-adapter';

function snapshot({
  buttons = [],
  axes = [0, 0, 0, 0],
}: {
  buttons?: number[];
  axes?: number[];
} = {}): GamepadInputSnapshot {
  return {
    connected: true,
    index: 0,
    id: 'Wireless Controller',
    mapping: 'standard',
    buttons,
    axes,
  };
}

function intentTypes(
  adapter: GamepadIntentAdapter,
  value: GamepadInputSnapshot,
  now: number,
) {
  return adapter.update(value, now).map((event) => event.intent.type);
}

function configureAdapter(
  adapter: GamepadIntentAdapter,
  overrides: Partial<Parameters<GamepadIntentAdapter['configure']>[0]> = {},
) {
  const settings = defaultGamepadControlSettings();
  adapter.configure({
    bindings: settings.bindings,
    repeatDelayMs: settings.repeatDelayMs,
    repeatIntervalMs: settings.repeatIntervalMs,
    scrollResponse: settings.scrollResponse,
    scrollSpeed: settings.scrollSpeed,
    stickDeadZone: settings.stickDeadZone,
    ...overrides,
  });
}

describe('GamepadIntentAdapter', () => {
  it('requires a neutral frame before emitting a digital edge', () => {
    const adapter = new GamepadIntentAdapter();

    expect(intentTypes(adapter, snapshot(), 0)).toEqual([]);
    expect(intentTypes(adapter, snapshot({ buttons: [1] }), 16)).toEqual([
      'confirm',
    ]);
    expect(intentTypes(adapter, snapshot({ buttons: [1] }), 32)).toEqual([]);
    expect(intentTypes(adapter, snapshot({ buttons: [1] }), 340)).toEqual([]);
  });

  it('repeats keyboard confirmation while held and re-arms after release', () => {
    const adapter = new GamepadIntentAdapter({ repeatConfirm: true });
    const confirm = snapshot({ buttons: [1] });
    adapter.update(snapshot(), 0);

    expect(adapter.update(confirm, 10)).toEqual([
      expect.objectContaining({
        phase: 'pressed',
        intent: { type: 'confirm' },
      }),
    ]);
    expect(adapter.update(confirm, 340)).toEqual([
      expect.objectContaining({
        phase: 'repeated',
        intent: { type: 'confirm' },
      }),
    ]);
    expect(adapter.update(snapshot(), 360)).toEqual([]);
    expect(adapter.update(confirm, 380)).toEqual([
      expect.objectContaining({
        phase: 'pressed',
        intent: { type: 'confirm' },
      }),
    ]);
  });

  it('reserves a short menu press and recognizes the deck hold gesture', () => {
    const shortPress = new GamepadIntentAdapter();
    shortPress.update(snapshot(), 0);
    expect(
      intentTypes(
        shortPress,
        snapshot({
          buttons: Array.from({ length: 10 }, (_, index) =>
            Number(index === 9),
          ),
        }),
        20,
      ),
    ).toEqual([]);
    expect(intentTypes(shortPress, snapshot(), 180)).toEqual([]);

    const longPress = new GamepadIntentAdapter();
    const menuHeld = snapshot({
      buttons: Array.from({ length: 10 }, (_, index) => Number(index === 9)),
    });
    longPress.update(snapshot(), 0);
    longPress.update(menuHeld, 20);
    expect(intentTypes(longPress, menuHeld, 480)).toEqual(['toggleDeck']);
    expect(intentTypes(longPress, snapshot(), 520)).toEqual([]);
  });

  it('starts push-to-talk once after the hold threshold and releases once', () => {
    const adapter = new GamepadIntentAdapter();
    const touchpadHeld = snapshot({
      buttons: Array.from({ length: 18 }, (_, index) => Number(index === 17)),
    });
    adapter.update(snapshot(), 0);

    expect(adapter.update(touchpadHeld, 20)).toEqual([]);
    expect(adapter.update(touchpadHeld, 360)).toEqual([]);
    expect(adapter.update(touchpadHeld, 380)).toEqual([
      expect.objectContaining({
        phase: 'pressed',
        intent: { type: 'pushToTalk' },
      }),
    ]);
    expect(adapter.update(touchpadHeld, 520)).toEqual([]);
    expect(adapter.update(snapshot(), 540)).toEqual([
      expect.objectContaining({
        phase: 'released',
        intent: { type: 'pushToTalk' },
      }),
    ]);
  });

  it('uses a short push-to-talk press as the contextual deck toggle', () => {
    const adapter = new GamepadIntentAdapter();
    const touchpadHeld = snapshot({
      buttons: Array.from({ length: 18 }, (_, index) => Number(index === 17)),
    });
    adapter.update(snapshot(), 0);

    expect(adapter.update(touchpadHeld, 20)).toEqual([]);
    expect(adapter.update(snapshot(), 250)).toEqual([
      expect.objectContaining({
        phase: 'released',
        intent: { type: 'toggleSpeechOrDeck' },
      }),
    ]);
  });

  it('fires browser tab navigation once per trigger press above 50%', () => {
    const adapter = new GamepadIntentAdapter();
    adapter.update(snapshot(), 0);

    expect(
      intentTypes(
        adapter,
        snapshot({
          buttons: Array.from({ length: 8 }, (_, index) =>
            index === 6 ? 0.49 : 0,
          ),
        }),
        16,
      ),
    ).toEqual([]);
    expect(
      intentTypes(
        adapter,
        snapshot({
          buttons: Array.from({ length: 8 }, (_, index) =>
            index === 6 ? 0.5 : 0,
          ),
        }),
        32,
      ),
    ).toEqual(['browserTabPrevious']);
    expect(
      intentTypes(
        adapter,
        snapshot({
          buttons: Array.from({ length: 8 }, (_, index) =>
            index === 6 ? 1 : 0,
          ),
        }),
        48,
      ),
    ).toEqual([]);
    expect(
      intentTypes(
        adapter,
        snapshot({
          buttons: Array.from({ length: 8 }, (_, index) =>
            index === 6 ? 0.49 : 0,
          ),
        }),
        64,
      ),
    ).toEqual([]);
    expect(
      intentTypes(
        adapter,
        snapshot({
          buttons: Array.from({ length: 8 }, (_, index) =>
            index === 6 ? 0.51 : 0,
          ),
        }),
        80,
      ),
    ).toEqual([]);
    adapter.update(
      snapshot({
        buttons: Array.from({ length: 8 }, (_, index) =>
          index === 6 ? 0.35 : 0,
        ),
      }),
      96,
    );
    expect(
      intentTypes(
        adapter,
        snapshot({
          buttons: Array.from({ length: 8 }, (_, index) =>
            index === 7 ? 0.5 : 0,
          ),
        }),
        112,
      ),
    ).toEqual(['browserTabNext']);
  });

  it('does not repeat history navigation while a shoulder button is held', () => {
    const adapter = new GamepadIntentAdapter();
    adapter.update(snapshot(), 0);
    const shoulder = (buttonIndex: 4 | 5, value: number) =>
      snapshot({
        buttons: Array.from({ length: 6 }, (_, index) =>
          index === buttonIndex ? value : 0,
        ),
      });

    expect(intentTypes(adapter, shoulder(4, 1), 16)).toEqual([
      'contextPrevious',
    ]);
    expect(intentTypes(adapter, shoulder(4, 1), 32)).toEqual([]);
    expect(intentTypes(adapter, shoulder(4, 0.49), 48)).toEqual([]);
    expect(intentTypes(adapter, shoulder(4, 0.51), 64)).toEqual([]);
    expect(intentTypes(adapter, shoulder(4, 0), 80)).toEqual([]);
    expect(intentTypes(adapter, shoulder(5, 1), 96)).toEqual(['contextNext']);
    expect(intentTypes(adapter, shoulder(5, 1), 112)).toEqual([]);
  });

  it('requires a full trigger release after input ownership changes', () => {
    const adapter = new GamepadIntentAdapter();
    adapter.update(snapshot(), 0);
    const l2 = (value: number) =>
      snapshot({
        buttons: Array.from({ length: 8 }, (_, index) =>
          index === 6 ? value : 0,
        ),
      });

    expect(intentTypes(adapter, l2(0.5), 16)).toEqual(['browserTabPrevious']);
    adapter.requireNeutral();
    expect(intentTypes(adapter, l2(0.49), 32)).toEqual([]);
    expect(intentTypes(adapter, l2(0.51), 48)).toEqual([]);
    expect(intentTypes(adapter, l2(0.35), 64)).toEqual([]);
    expect(intentTypes(adapter, l2(0.5), 80)).toEqual(['browserTabPrevious']);
  });

  it('repeats directional navigation after the shared delay', () => {
    const adapter = new GamepadIntentAdapter();
    const dpadRight = snapshot({
      buttons: Array.from({ length: 16 }, (_, index) => Number(index === 15)),
    });
    adapter.update(snapshot(), 0);

    expect(adapter.update(dpadRight, 10)).toEqual([
      expect.objectContaining({
        phase: 'pressed',
        intent: {
          type: 'navigate',
          direction: 'right',
          control: 'dpad',
        },
      }),
    ]);
    expect(adapter.update(dpadRight, 200)).toEqual([]);
    expect(adapter.update(dpadRight, 340)).toEqual([
      expect.objectContaining({
        phase: 'repeated',
        intent: {
          type: 'navigate',
          direction: 'right',
          control: 'dpad',
        },
      }),
    ]);
  });

  it('combines held shoulder buttons into one immediate page movement', () => {
    const adapter = new GamepadIntentAdapter();
    configureAdapter(adapter, {
      bindings: setGamepadButtonBinding(
        setGamepadButtonBinding(defaultGamepadBindings(), 'pagePrevious', 4),
        'pageNext',
        5,
      ),
    });
    adapter.update(snapshot(), 0);
    const events = adapter.update(
      snapshot({
        buttons: [0, 0, 0, 0, 0.35, 0.72],
      }),
      16,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        phase: 'continuous',
        intent: expect.objectContaining({
          type: 'pageNext',
          strength: expect.any(Number),
          delta: expect.any(Number),
        }),
      }),
    );
    if (events[0]?.intent.type === 'pageNext') {
      expect(events[0].intent.strength).toBeCloseTo(
        applyGamepadResponseCurve(
          (0.72 - 0.15) / 0.85,
          defaultGamepadControlSettings().scrollResponse,
        ) -
          applyGamepadResponseCurve(
            (0.35 - 0.15) / 0.85,
            defaultGamepadControlSettings().scrollResponse,
          ),
        6,
      );
      expect(events[0].intent.delta).toBeGreaterThan(0);
    }
  });

  it('applies the configured stick dead zone to navigation and scrolling', () => {
    const adapter = new GamepadIntentAdapter();
    configureAdapter(adapter, {
      stickDeadZone: 0.45,
    });
    adapter.update(snapshot(), 0);

    expect(adapter.update(snapshot({ axes: [0.4, 0, 0.4, 0] }), 16)).toEqual(
      [],
    );
    expect(adapter.update(snapshot({ axes: [1, 0, 1, 0] }), 32)).toEqual([
      expect.objectContaining({
        intent: {
          type: 'navigate',
          direction: 'right',
          control: 'primary-stick',
        },
      }),
      expect.objectContaining({
        intent: expect.objectContaining({
          type: 'scroll',
          deltaX: expect.any(Number),
          deltaY: 0,
        }),
      }),
    ]);
    const scroll = adapter
      .update(snapshot({ axes: [0, 0, 1, 0] }), 48)
      .find((event) => event.intent.type === 'scroll');
    if (scroll?.intent.type === 'scroll') {
      expect(scroll.intent.deltaX).toBeCloseTo(
        defaultGamepadControlSettings().scrollSpeed * 0.016,
        6,
      );
    }
  });

  it('uses editable button mappings without preserving the old hardcoded action', () => {
    const adapter = new GamepadIntentAdapter();
    configureAdapter(adapter, {
      bindings: setGamepadButtonBinding(
        defaultGamepadBindings(),
        'confirm',
        11,
      ),
    });
    adapter.update(snapshot(), 0);

    expect(intentTypes(adapter, snapshot({ buttons: [1] }), 16)).toEqual([]);
    expect(
      intentTypes(
        adapter,
        snapshot({
          buttons: Array.from({ length: 12 }, (_, index) =>
            Number(index === 11),
          ),
        }),
        32,
      ),
    ).toEqual(['confirm']);
  });

  it('stops d-pad navigation when that button is assigned to a command', () => {
    const adapter = new GamepadIntentAdapter();
    configureAdapter(adapter, {
      bindings: setGamepadButtonBinding(
        defaultGamepadBindings(),
        'confirm',
        12,
      ),
    });
    adapter.update(snapshot(), 0);

    expect(
      intentTypes(
        adapter,
        snapshot({
          buttons: Array.from({ length: 16 }, (_, index) =>
            Number(index === 12),
          ),
        }),
        16,
      ),
    ).toEqual(['confirm']);
  });

  it('uses the configured primary and secondary sticks', () => {
    const adapter = new GamepadIntentAdapter();
    configureAdapter(adapter, {
      bindings: setGamepadStickBinding(
        defaultGamepadBindings(),
        'primaryStick',
        'right',
      ),
    });
    adapter.update(snapshot(), 0);

    const events = adapter.update(snapshot({ axes: [1, 0, 1, 0] }), 16);
    expect(events).toEqual([
      expect.objectContaining({
        intent: {
          type: 'navigate',
          direction: 'right',
          control: 'primary-stick',
        },
      }),
      expect.objectContaining({
        intent: expect.objectContaining({
          type: 'scroll',
          deltaX: expect.any(Number),
          deltaY: 0,
        }),
      }),
    ]);
  });

  it('uses the configured scroll curve and speed for continuous deltas', () => {
    const precision = new GamepadIntentAdapter();
    const rapid = new GamepadIntentAdapter();
    configureAdapter(precision, {
      scrollResponse: {
        p1: { x: 0.32, y: 0.08 },
        p2: { x: 0.76, y: 0.62 },
      },
      scrollSpeed: 1_200,
    });
    configureAdapter(rapid, {
      scrollResponse: {
        p1: { x: 0.1, y: 0.05 },
        p2: { x: 0.38, y: 0.96 },
      },
      scrollSpeed: 4_800,
    });
    precision.update(snapshot(), 0);
    rapid.update(snapshot(), 0);

    const precisionEvent = precision
      .update(snapshot({ axes: [0, 0, 0.68, 0] }), 16)
      .find((event) => event.intent.type === 'scroll');
    const rapidEvent = rapid
      .update(snapshot({ axes: [0, 0, 0.68, 0] }), 16)
      .find((event) => event.intent.type === 'scroll');

    expect(precisionEvent?.intent.type).toBe('scroll');
    expect(rapidEvent?.intent.type).toBe('scroll');
    if (
      precisionEvent?.intent.type === 'scroll' &&
      rapidEvent?.intent.type === 'scroll'
    ) {
      expect(rapidEvent.intent.deltaX).toBeGreaterThan(
        precisionEvent.intent.deltaX * 2,
      );
      expect(rapidEvent.intent.deltaX).toBeCloseTo(
        applyGamepadResponseCurve(
          (0.68 - defaultGamepadControlSettings().stickDeadZone) /
            (1 - defaultGamepadControlSettings().stickDeadZone),
          {
            p1: { x: 0.1, y: 0.05 },
            p2: { x: 0.38, y: 0.96 },
          },
        ) *
          4_800 *
          0.016,
        6,
      );
    }
  });
});
