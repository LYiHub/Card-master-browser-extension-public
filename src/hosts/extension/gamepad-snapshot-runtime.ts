import {
  DISCONNECTED_GAMEPAD_SNAPSHOT,
  type GamepadInputSnapshot,
} from '../../gamepad-control/domain/types';
import {
  type GamepadBridgeHost,
  publishGamepadSnapshot,
  readGamepadControlState,
  readGamepadSourceSnapshot,
  subscribeGamepadControlState,
} from './gamepad-bridge';

export type GamepadSnapshotSourceRuntime = {
  dispose(): void;
};

const CONNECTED_FRAME_INTERVAL_MS = 1_000 / 60;
const AXIS_DEAD_ZONE = 0.12;
const BUTTON_DEAD_ZONE = 0.08;
const NON_STANDARD_DPAD_THRESHOLD = 0.8;
const NON_STANDARD_DPAD_DEVICE = /0079.*0006|dragonrise|n64|dragon rise/i;

function roundInput(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

export function normalizeGamepadSnapshot(
  snapshot: GamepadInputSnapshot,
): GamepadInputSnapshot {
  if (
    snapshot.mapping === 'standard' ||
    !NON_STANDARD_DPAD_DEVICE.test(snapshot.id)
  ) {
    return snapshot;
  }
  const axes =
    snapshot.axes.length >= 6
      ? { horizontal: snapshot.axes[5] ?? 0, vertical: snapshot.axes[4] ?? 0 }
      : snapshot.axes.length >= 4
        ? { horizontal: snapshot.axes[2] ?? 0, vertical: snapshot.axes[3] ?? 0 }
        : null;
  if (!axes) return snapshot;
  const buttons = [...snapshot.buttons];
  while (buttons.length < 16) buttons.push(0);
  buttons[12] = Math.max(
    buttons[12] ?? 0,
    axes.vertical <= -NON_STANDARD_DPAD_THRESHOLD ? 1 : 0,
  );
  buttons[13] = Math.max(
    buttons[13] ?? 0,
    axes.vertical >= NON_STANDARD_DPAD_THRESHOLD ? 1 : 0,
  );
  buttons[14] = Math.max(
    buttons[14] ?? 0,
    axes.horizontal <= -NON_STANDARD_DPAD_THRESHOLD ? 1 : 0,
  );
  buttons[15] = Math.max(
    buttons[15] ?? 0,
    axes.horizontal >= NON_STANDARD_DPAD_THRESHOLD ? 1 : 0,
  );
  return { ...snapshot, buttons };
}

function gamepadSnapshot(gamepad: Gamepad): GamepadInputSnapshot {
  return normalizeGamepadSnapshot({
    connected: gamepad.connected,
    index: gamepad.index,
    id: gamepad.id,
    mapping: gamepad.mapping,
    buttons: Array.from(gamepad.buttons, (button) => roundInput(button.value)),
    axes: Array.from(gamepad.axes, roundInput),
  });
}

function snapshotKey(snapshot: GamepadInputSnapshot) {
  return JSON.stringify(snapshot);
}

function inputMagnitude(gamepad: Gamepad) {
  const buttonMagnitude = Array.from(gamepad.buttons).reduce(
    (maximum, button) =>
      Math.max(maximum, button.pressed ? 1 : Math.abs(button.value)),
    0,
  );
  const axisMagnitude = Array.from(gamepad.axes).reduce(
    (maximum, axis) => Math.max(maximum, Math.abs(axis)),
    0,
  );
  return Math.max(buttonMagnitude, axisMagnitude);
}

function inputActive(gamepad: Gamepad) {
  return (
    Array.from(gamepad.buttons).some(
      (button) => button.pressed || button.value > BUTTON_DEAD_ZONE,
    ) ||
    Array.from(gamepad.axes).some((axis) => Math.abs(axis) > AXIS_DEAD_ZONE)
  );
}

function eventGamepadIndex(event: Event) {
  const gamepad = (event as Event & { gamepad?: unknown }).gamepad;
  if (!gamepad || typeof gamepad !== 'object' || !('index' in gamepad)) {
    return null;
  }
  const index = (gamepad as { index?: unknown }).index;
  return typeof index === 'number' && Number.isSafeInteger(index) && index >= 0
    ? index
    : null;
}

export function mountGamepadSnapshotSource(
  hostWindow: Window,
  hostNavigator: Pick<Navigator, 'getGamepads'>,
): GamepadSnapshotSourceRuntime {
  const bridgeHost = hostWindow as unknown as GamepadBridgeHost;
  let disposed = false;
  let active = false;
  let frame = 0;
  let lastFrameAt = 0;
  let selectedIndex: number | null = null;
  const disconnectedIndices = new Set<number>();
  const lastInputAt = new Map<number, number>();

  const publish = (snapshot: GamepadInputSnapshot, timestamp: number) => {
    if (disposed) return;
    const key = snapshotKey(snapshot);
    if (key === snapshotKey(readGamepadSourceSnapshot(bridgeHost))) return;
    publishGamepadSnapshot(snapshot, bridgeHost, timestamp);
  };

  const connectedGamepads = () => {
    let gamepads: Array<Gamepad | null>;
    try {
      gamepads = Array.from(hostNavigator.getGamepads());
    } catch {
      gamepads = [];
    }
    return gamepads.filter((gamepad): gamepad is Gamepad =>
      Boolean(gamepad?.connected && !disconnectedIndices.has(gamepad.index)),
    );
  };

  const selectGamepad = (gamepads: readonly Gamepad[], now: number) => {
    for (const gamepad of gamepads) {
      if (inputActive(gamepad)) lastInputAt.set(gamepad.index, now);
    }
    const current = gamepads.find((gamepad) => gamepad.index === selectedIndex);
    const recent = [...gamepads].sort((left, right) => {
      const timeDifference =
        (lastInputAt.get(right.index) ?? Number.NEGATIVE_INFINITY) -
        (lastInputAt.get(left.index) ?? Number.NEGATIVE_INFINITY);
      return timeDifference || inputMagnitude(right) - inputMagnitude(left);
    })[0];
    const recentInputAt = recent
      ? (lastInputAt.get(recent.index) ?? Number.NEGATIVE_INFINITY)
      : Number.NEGATIVE_INFINITY;
    const currentInputAt = current
      ? (lastInputAt.get(current.index) ?? Number.NEGATIVE_INFINITY)
      : Number.NEGATIVE_INFINITY;
    return recent && (!current || recentInputAt > currentInputAt)
      ? recent
      : (current ?? recent ?? null);
  };

  const cancelScheduledPoll = () => {
    hostWindow.cancelAnimationFrame(frame);
    frame = 0;
  };

  const schedulePoll = (connected: boolean) => {
    if (!active || disposed || frame || !connected) return;
    frame = hostWindow.requestAnimationFrame(poll);
  };

  const poll = (timestamp: number) => {
    frame = 0;
    if (!active || disposed) return;
    const gamepads = connectedGamepads();
    const selected = selectGamepad(gamepads, timestamp);
    if (timestamp - lastFrameAt >= CONNECTED_FRAME_INTERVAL_MS || !selected) {
      lastFrameAt = timestamp;
      selectedIndex = selected?.index ?? null;
      publish(
        selected ? gamepadSnapshot(selected) : DISCONNECTED_GAMEPAD_SNAPSHOT,
        timestamp,
      );
    }
    schedulePoll(selected !== null);
  };

  const rescan = () => {
    if (!active || disposed) return;
    lastFrameAt = Number.NEGATIVE_INFINITY;
    cancelScheduledPoll();
    poll(hostWindow.performance.now());
  };

  const syncState = () => {
    const nextActive = readGamepadControlState(bridgeHost);
    if (nextActive === active) {
      if (!active) {
        publish(DISCONNECTED_GAMEPAD_SNAPSHOT, hostWindow.performance.now());
      }
      return;
    }
    active = nextActive;
    cancelScheduledPoll();
    if (active) {
      rescan();
    } else {
      selectedIndex = null;
      publish(DISCONNECTED_GAMEPAD_SNAPSHOT, hostWindow.performance.now());
    }
  };

  const handleConnected = (event: Event) => {
    const index = eventGamepadIndex(event);
    if (index !== null) {
      disconnectedIndices.delete(index);
      lastInputAt.delete(index);
    }
    rescan();
  };

  const handleDisconnected = (event: Event) => {
    const index = eventGamepadIndex(event) ?? selectedIndex;
    if (index !== null) {
      disconnectedIndices.add(index);
      lastInputAt.delete(index);
      if (selectedIndex === index) selectedIndex = null;
    }
    rescan();
  };

  const handleVisibilityRecovery = () => {
    if (hostWindow.document.visibilityState !== 'hidden') rescan();
  };

  const unsubscribeState = subscribeGamepadControlState(syncState, bridgeHost);
  hostWindow.addEventListener('gamepadconnected', handleConnected);
  hostWindow.addEventListener('gamepaddisconnected', handleDisconnected);
  hostWindow.addEventListener('focus', rescan);
  hostWindow.addEventListener('pageshow', rescan);
  hostWindow.document.addEventListener(
    'visibilitychange',
    handleVisibilityRecovery,
  );
  syncState();

  return {
    dispose() {
      if (disposed) return;
      active = false;
      cancelScheduledPoll();
      publishGamepadSnapshot(DISCONNECTED_GAMEPAD_SNAPSHOT, bridgeHost);
      disposed = true;
      unsubscribeState();
      hostWindow.removeEventListener('gamepadconnected', handleConnected);
      hostWindow.removeEventListener('gamepaddisconnected', handleDisconnected);
      hostWindow.removeEventListener('focus', rescan);
      hostWindow.removeEventListener('pageshow', rescan);
      hostWindow.document.removeEventListener(
        'visibilitychange',
        handleVisibilityRecovery,
      );
    },
  };
}
