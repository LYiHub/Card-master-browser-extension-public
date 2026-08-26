import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DISCONNECTED_GAMEPAD_SNAPSHOT,
  type GamepadInputSnapshot,
} from '../../gamepad-control/domain/types';
import {
  type GamepadBridgeHost,
  publishGamepadControlState,
  publishGamepadSnapshot,
  readGamepadSnapshot,
  subscribeGamepadEasterEgg,
} from './gamepad-bridge';
import {
  mountGamepadSnapshotSource,
  normalizeGamepadSnapshot,
} from './gamepad-snapshot-runtime';

function snapshot(
  id: string,
  mapping: string,
  axes: number[],
  buttons = Array.from({ length: 17 }, () => 0),
): GamepadInputSnapshot {
  return {
    connected: true,
    index: 0,
    id,
    mapping,
    axes,
    buttons,
  };
}

describe('non-standard gamepad D-pad normalization', () => {
  it('leaves standard mappings unchanged', () => {
    const value = snapshot('DragonRise', 'standard', [0, 0, -1, 0]);
    expect(normalizeGamepadSnapshot(value)).toBe(value);
  });

  const directionCases: Array<[string, number[], number]> = [
    ['up', [0, 0, 0, -1], 12],
    ['down', [0, 0, 0, 1], 13],
    ['left', [0, 0, -1, 0], 14],
    ['right', [0, 0, 1, 0], 15],
  ];

  it.each(
    directionCases,
  )('maps DragonRise four-axis %s input to button %i', (_, axes, button) => {
    expect(
      normalizeGamepadSnapshot(snapshot('DragonRise N64', '', axes)).buttons[
        button
      ],
    ).toBe(1);
  });

  it('does not reinterpret ordinary non-standard stick axes', () => {
    const unknown = snapshot('Generic USB Controller', '', [0, 0, 1, -1]);
    const recognized = snapshot('DragonRise N64', '', [1, -1, 0, 0]);

    expect(normalizeGamepadSnapshot(unknown)).toBe(unknown);
    expect(normalizeGamepadSnapshot(recognized).buttons.slice(12, 16)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('uses the dedicated trailing axes on six-axis adapters', () => {
    expect(
      normalizeGamepadSnapshot(
        snapshot('0079 0006 Controller', '', [1, -1, 0, 0, -1, 1]),
      ).buttons.slice(12, 16),
    ).toEqual([1, 0, 0, 1]);
  });

  it('publishes normalized directions through the shared Konami bridge', () => {
    const host = {} as GamepadBridgeHost;
    const triggered = vi.fn();
    const directions = [
      [0, 0, 0, -1],
      [0, 0, 0, -1],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0, 0, -1, 0],
      [0, 0, 1, 0],
      [0, 0, -1, 0],
      [0, 0, 1, 0],
    ];
    subscribeGamepadEasterEgg(triggered, host);
    publishGamepadSnapshot(
      snapshot('DragonRise N64', '', [0, 0, 0, 0]),
      host,
      0,
    );
    directions.forEach((axes, index) => {
      publishGamepadSnapshot(
        normalizeGamepadSnapshot(snapshot('DragonRise N64', '', axes)),
        host,
        index * 100 + 100,
      );
      publishGamepadSnapshot(
        normalizeGamepadSnapshot(snapshot('DragonRise N64', '', [0, 0, 0, 0])),
        host,
        index * 100 + 140,
      );
    });
    for (const [offset, button] of [
      [900, 1],
      [1_000, 0],
    ] as const) {
      const buttons = Array.from({ length: 17 }, () => 0);
      buttons[button] = 1;
      publishGamepadSnapshot(
        snapshot('DragonRise N64', '', [0, 0, 0, 0], buttons),
        host,
        offset,
      );
      publishGamepadSnapshot(
        snapshot('DragonRise N64', '', [0, 0, 0, 0]),
        host,
        offset + 40,
      );
    }

    expect(triggered).toHaveBeenCalledOnce();
  });
});

function gamepad(index = 0, connected = true): Gamepad {
  return {
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    })),
    connected,
    hapticActuators: [],
    id: `Controller ${index}`,
    index,
    mapping: 'standard',
    timestamp: 1,
    vibrationActuator: null,
  } as unknown as Gamepad;
}

function gamepadEvent(type: string, value: Gamepad) {
  const event = new Event(type);
  Object.defineProperty(event, 'gamepad', { value });
  return event;
}

class SnapshotDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
}

class SnapshotWindow extends EventTarget {
  readonly document = new SnapshotDocument();
  readonly performance = {
    now: () => 1_000,
  };
  private nextTimerId = 1;
  private readonly animationFrames = new Map<number, FrameRequestCallback>();
  private readonly timers = new Map<number, TimerHandler>();

  requestAnimationFrame(callback: FrameRequestCallback) {
    const id = this.nextTimerId++;
    this.animationFrames.set(id, callback);
    return id;
  }

  cancelAnimationFrame(id: number) {
    this.animationFrames.delete(id);
  }

  setTimeout(handler: TimerHandler) {
    const id = this.nextTimerId++;
    this.timers.set(id, handler);
    return id;
  }

  clearTimeout(id: number) {
    this.timers.delete(id);
  }

  get scheduledWork() {
    return this.animationFrames.size + this.timers.size;
  }
}

describe('gamepad snapshot source lifecycle', () => {
  let host: SnapshotWindow;
  let runtime: ReturnType<typeof mountGamepadSnapshotSource> | null;

  beforeEach(() => {
    host = new SnapshotWindow();
    runtime = null;
  });

  afterEach(() => {
    runtime?.dispose();
    vi.restoreAllMocks();
  });

  it('disconnects immediately even while the browser returns a stale gamepad', () => {
    const stale = gamepad();
    const getGamepads = vi.fn(() => [stale] as unknown as Gamepad[]);
    publishGamepadControlState(true, host as unknown as GamepadBridgeHost);
    runtime = mountGamepadSnapshotSource(host as unknown as Window, {
      getGamepads,
    });

    expect(
      readGamepadSnapshot(host as unknown as GamepadBridgeHost),
    ).toMatchObject({
      connected: true,
      index: 0,
    });

    host.dispatchEvent(gamepadEvent('gamepaddisconnected', gamepad(0, false)));

    expect(readGamepadSnapshot(host as unknown as GamepadBridgeHost)).toEqual(
      DISCONNECTED_GAMEPAD_SNAPSHOT,
    );
  });

  it('accepts the same controller index after a real reconnect', () => {
    const current = gamepad();
    const getGamepads = vi.fn(() => [current] as unknown as Gamepad[]);
    publishGamepadControlState(true, host as unknown as GamepadBridgeHost);
    runtime = mountGamepadSnapshotSource(host as unknown as Window, {
      getGamepads,
    });

    host.dispatchEvent(gamepadEvent('gamepaddisconnected', gamepad(0, false)));
    expect(
      readGamepadSnapshot(host as unknown as GamepadBridgeHost).connected,
    ).toBe(false);

    host.dispatchEvent(gamepadEvent('gamepadconnected', current));
    expect(
      readGamepadSnapshot(host as unknown as GamepadBridgeHost).connected,
    ).toBe(true);
  });

  it('keeps a disconnected index quarantined until a real reconnect event', () => {
    const stale = gamepad();
    let available: Gamepad[] = [stale];
    publishGamepadControlState(true, host as unknown as GamepadBridgeHost);
    runtime = mountGamepadSnapshotSource(host as unknown as Window, {
      getGamepads: () => available,
    });

    host.dispatchEvent(gamepadEvent('gamepaddisconnected', gamepad(0, false)));
    expect(
      readGamepadSnapshot(host as unknown as GamepadBridgeHost).connected,
    ).toBe(false);

    available = [];
    host.dispatchEvent(new Event('focus'));
    available = [stale];
    host.dispatchEvent(new Event('focus'));

    expect(
      readGamepadSnapshot(host as unknown as GamepadBridgeHost).connected,
    ).toBe(false);

    host.dispatchEvent(gamepadEvent('gamepadconnected', stale));
    expect(
      readGamepadSnapshot(host as unknown as GamepadBridgeHost).connected,
    ).toBe(true);
  });

  it('disconnects the selected controller when an event omits its payload', () => {
    const current = gamepad();
    publishGamepadControlState(true, host as unknown as GamepadBridgeHost);
    runtime = mountGamepadSnapshotSource(host as unknown as Window, {
      getGamepads: () => [current] as unknown as Gamepad[],
    });

    host.dispatchEvent(new Event('gamepaddisconnected'));

    expect(readGamepadSnapshot(host as unknown as GamepadBridgeHost)).toEqual(
      DISCONNECTED_GAMEPAD_SNAPSHOT,
    );
  });

  it('falls through to another connected controller without hiding the panel', () => {
    const primary = gamepad(0);
    const fallback = gamepad(1);
    const getGamepads = vi.fn(
      () => [primary, fallback] as unknown as Gamepad[],
    );
    publishGamepadControlState(true, host as unknown as GamepadBridgeHost);
    runtime = mountGamepadSnapshotSource(host as unknown as Window, {
      getGamepads,
    });
    expect(
      readGamepadSnapshot(host as unknown as GamepadBridgeHost).index,
    ).toBe(0);

    host.dispatchEvent(gamepadEvent('gamepaddisconnected', gamepad(0, false)));

    expect(
      readGamepadSnapshot(host as unknown as GamepadBridgeHost),
    ).toMatchObject({
      connected: true,
      index: 1,
    });
  });

  it('rechecks hardware when the page regains focus after a missed event', () => {
    const connected = gamepad();
    let available: Gamepad[] = [connected];
    publishGamepadControlState(true, host as unknown as GamepadBridgeHost);
    runtime = mountGamepadSnapshotSource(host as unknown as Window, {
      getGamepads: () => available,
    });
    expect(
      readGamepadSnapshot(host as unknown as GamepadBridgeHost).connected,
    ).toBe(true);

    available = [];
    host.dispatchEvent(new Event('focus'));

    expect(readGamepadSnapshot(host as unknown as GamepadBridgeHost)).toEqual(
      DISCONNECTED_GAMEPAD_SNAPSHOT,
    );
  });

  it('clears a stale bridge snapshot while page control is inactive', () => {
    publishGamepadSnapshot(
      {
        ...DISCONNECTED_GAMEPAD_SNAPSHOT,
        connected: true,
        index: 2,
        id: 'Stale controller',
      } satisfies GamepadInputSnapshot,
      host as unknown as GamepadBridgeHost,
    );

    runtime = mountGamepadSnapshotSource(host as unknown as Window, {
      getGamepads: () => [],
    });

    expect(readGamepadSnapshot(host as unknown as GamepadBridgeHost)).toEqual(
      DISCONNECTED_GAMEPAD_SNAPSHOT,
    );
  });

  it('repairs a bridge snapshot changed by another runtime', () => {
    publishGamepadControlState(true, host as unknown as GamepadBridgeHost);
    runtime = mountGamepadSnapshotSource(host as unknown as Window, {
      getGamepads: () => [],
    });
    publishGamepadSnapshot(
      {
        ...DISCONNECTED_GAMEPAD_SNAPSHOT,
        connected: true,
        index: 3,
        id: 'Stale external snapshot',
      },
      host as unknown as GamepadBridgeHost,
    );

    host.dispatchEvent(new Event('focus'));

    expect(readGamepadSnapshot(host as unknown as GamepadBridgeHost)).toEqual(
      DISCONNECTED_GAMEPAD_SNAPSHOT,
    );
  });

  it('publishes a disconnected snapshot when the source is disposed', () => {
    const current = gamepad();
    publishGamepadControlState(true, host as unknown as GamepadBridgeHost);
    runtime = mountGamepadSnapshotSource(host as unknown as Window, {
      getGamepads: () => [current] as unknown as Gamepad[],
    });
    expect(
      readGamepadSnapshot(host as unknown as GamepadBridgeHost).connected,
    ).toBe(true);

    runtime.dispose();
    runtime = null;

    expect(readGamepadSnapshot(host as unknown as GamepadBridgeHost)).toEqual(
      DISCONNECTED_GAMEPAD_SNAPSHOT,
    );
  });

  it('does not poll while no controller is connected', () => {
    publishGamepadControlState(true, host as unknown as GamepadBridgeHost);
    runtime = mountGamepadSnapshotSource(host as unknown as Window, {
      getGamepads: () => [],
    });

    expect(readGamepadSnapshot(host as unknown as GamepadBridgeHost)).toEqual(
      DISCONNECTED_GAMEPAD_SNAPSHOT,
    );
    expect(host.scheduledWork).toBe(0);
  });

  it('treats an unavailable Gamepad API as disconnected', () => {
    publishGamepadControlState(true, host as unknown as GamepadBridgeHost);
    runtime = mountGamepadSnapshotSource(host as unknown as Window, {
      getGamepads: () => {
        throw new Error('Gamepad API unavailable');
      },
    });

    expect(readGamepadSnapshot(host as unknown as GamepadBridgeHost)).toEqual(
      DISCONNECTED_GAMEPAD_SNAPSHOT,
    );
  });
});
