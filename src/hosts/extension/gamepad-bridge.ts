import { GAMEPAD_BUTTON_RELEASE_THRESHOLD } from '../../gamepad-control/domain/input';
import { GamepadKonamiSequenceTracker } from '../../gamepad-control/domain/konami-sequence';
import {
  DISCONNECTED_GAMEPAD_SNAPSHOT,
  type GamepadInputSnapshot,
  isGamepadInputSnapshot,
} from '../../gamepad-control/domain/types';

export const GAMEPAD_CONTROL_STATE_EVENT = 'card-master:gamepad-control-state';
export const GAMEPAD_CONTROL_OWNER_EVENT = 'card-master:gamepad-control-owner';
export const GAMEPAD_DECK_TOGGLE_EVENT = 'card-master:gamepad-deck-toggle';
export const GAMEPAD_SNAPSHOT_EVENT = 'card-master:gamepad-snapshot';
export const GAMEPAD_BROWSER_TAB_EVENT = 'card-master:gamepad-browser-tab';
export const GAMEPAD_EASTER_EGG_EVENT = 'card-master:gamepad-easter-egg';

export type GamepadBrowserTabDirection = 'previous' | 'next';
export type GamepadVirtualPointerPoint = Readonly<{
  x: number;
  y: number;
}>;

export type GamepadVirtualPointerTarget = {
  contains(point: GamepadVirtualPointerPoint): boolean;
  setHovered(hovered: boolean, point: GamepadVirtualPointerPoint | null): void;
  activate(point: GamepadVirtualPointerPoint): boolean;
};

type GamepadVirtualPointerElementOptions = {
  element: HTMLElement;
  enabled?: () => boolean;
  onHoverChange?: (
    hovered: boolean,
    point: GamepadVirtualPointerPoint | null,
  ) => void;
};

export type GamepadControlOwner =
  | 'external-page'
  | 'deck'
  | 'dialog'
  | 'gamepad-test';

export function gamepadOwnerAllowsCommands(owner: GamepadControlOwner) {
  return owner !== 'gamepad-test';
}

type GamepadBridgeState = {
  active: boolean;
  owner: GamepadControlOwner;
  sourceSnapshot: GamepadInputSnapshot;
  snapshot: GamepadInputSnapshot;
  konamiSequence: GamepadKonamiSequenceTracker;
  consumedButtons: Set<number>;
  browserTabDirection: GamepadBrowserTabDirection;
  virtualPointer: GamepadVirtualPointerPoint | null;
  virtualPointerTarget: GamepadVirtualPointerTarget | null;
  virtualPointerTargets: Set<GamepadVirtualPointerTarget>;
  events: EventTarget;
};

export type GamepadBridgeHost = typeof globalThis & {
  __cardMasterGamepadBridge__?: GamepadBridgeState;
};

function bridge(host: GamepadBridgeHost = globalThis as GamepadBridgeHost) {
  const current = host.__cardMasterGamepadBridge__;
  if (current) return current;
  const state: GamepadBridgeState = {
    active: false,
    owner: 'external-page',
    sourceSnapshot: DISCONNECTED_GAMEPAD_SNAPSHOT,
    snapshot: DISCONNECTED_GAMEPAD_SNAPSHOT,
    konamiSequence: new GamepadKonamiSequenceTracker(),
    consumedButtons: new Set(),
    browserTabDirection: 'previous',
    virtualPointer: null,
    virtualPointerTarget: null,
    virtualPointerTargets: new Set(),
    events: new EventTarget(),
  };
  Object.defineProperty(host, '__cardMasterGamepadBridge__', {
    configurable: true,
    value: state,
  });
  return state;
}

function subscribe(
  type: string,
  listener: () => void,
  host?: GamepadBridgeHost,
) {
  const events = bridge(host).events;
  events.addEventListener(type, listener);
  return () => events.removeEventListener(type, listener);
}

export function publishGamepadControlState(
  active: boolean,
  host?: GamepadBridgeHost,
) {
  const state = bridge(host);
  if (state.active === active) return;
  state.active = active;
  state.events.dispatchEvent(new Event(GAMEPAD_CONTROL_STATE_EVENT));
}

export function readGamepadControlState(host?: GamepadBridgeHost) {
  return bridge(host).active;
}

export function subscribeGamepadControlState(
  listener: () => void,
  host?: GamepadBridgeHost,
) {
  return subscribe(GAMEPAD_CONTROL_STATE_EVENT, listener, host);
}

export function publishGamepadControlOwner(
  owner: GamepadControlOwner,
  host?: GamepadBridgeHost,
) {
  const state = bridge(host);
  if (state.owner === owner) return;
  const inspectionBoundary =
    state.owner === 'gamepad-test' || owner === 'gamepad-test';
  if (inspectionBoundary) {
    state.konamiSequence.reset(state.sourceSnapshot);
    state.consumedButtons.clear();
    state.snapshot = state.sourceSnapshot;
  }
  state.owner = owner;
  state.events.dispatchEvent(new Event(GAMEPAD_CONTROL_OWNER_EVENT));
  if (inspectionBoundary) {
    state.events.dispatchEvent(new Event(GAMEPAD_SNAPSHOT_EVENT));
  }
}

export function readGamepadControlOwner(host?: GamepadBridgeHost) {
  return bridge(host).owner;
}

export function subscribeGamepadControlOwner(
  listener: () => void,
  host?: GamepadBridgeHost,
) {
  return subscribe(GAMEPAD_CONTROL_OWNER_EVENT, listener, host);
}

export function requestGamepadDeckToggle(host?: GamepadBridgeHost) {
  bridge(host).events.dispatchEvent(new Event(GAMEPAD_DECK_TOGGLE_EVENT));
}

export function subscribeGamepadDeckToggle(
  listener: () => void,
  host?: GamepadBridgeHost,
) {
  return subscribe(GAMEPAD_DECK_TOGGLE_EVENT, listener, host);
}

function syncGamepadVirtualPointerTarget(state: GamepadBridgeState) {
  const point = state.virtualPointer;
  const next = point
    ? ([...state.virtualPointerTargets]
        .reverse()
        .find((target) => target.contains(point)) ?? null)
    : null;
  if (next === state.virtualPointerTarget) return next !== null;
  state.virtualPointerTarget?.setHovered(false, null);
  state.virtualPointerTarget = next;
  next?.setHovered(true, point);
  return next !== null;
}

export function registerGamepadVirtualPointerTarget(
  target: GamepadVirtualPointerTarget,
  host?: GamepadBridgeHost,
) {
  const state = bridge(host);
  state.virtualPointerTargets.add(target);
  syncGamepadVirtualPointerTarget(state);
  return () => {
    if (!state.virtualPointerTargets.delete(target)) return;
    if (state.virtualPointerTarget === target) {
      target.setHovered(false, null);
      state.virtualPointerTarget = null;
    }
    syncGamepadVirtualPointerTarget(state);
  };
}

export function publishGamepadVirtualPointer(
  point: GamepadVirtualPointerPoint | null,
  host?: GamepadBridgeHost,
) {
  const state = bridge(host);
  state.virtualPointer =
    point && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? { x: point.x, y: point.y }
      : null;
  return syncGamepadVirtualPointerTarget(state);
}

export function activateGamepadVirtualPointer(
  point: GamepadVirtualPointerPoint,
  host?: GamepadBridgeHost,
) {
  const state = bridge(host);
  if (!publishGamepadVirtualPointer(point, host)) return false;
  return state.virtualPointerTarget?.activate(point) ?? false;
}

export function registerGamepadVirtualPointerElement(
  {
    element,
    enabled = () => true,
    onHoverChange,
  }: GamepadVirtualPointerElementOptions,
  host?: GamepadBridgeHost,
) {
  let hovered = false;
  let pressTimer = 0;
  const contains = (point: GamepadVirtualPointerPoint) => {
    if (
      !element.isConnected ||
      element.hidden ||
      element.matches(':disabled') ||
      !enabled()
    ) {
      return false;
    }
    const bounds = element.getBoundingClientRect();
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    );
  };
  const release = registerGamepadVirtualPointerTarget(
    {
      contains,
      setHovered(next, point) {
        if (hovered === next) return;
        hovered = next;
        element.classList.toggle('is-gamepad-hovered', next);
        onHoverChange?.(next, point);
      },
      activate(point) {
        if (!contains(point)) return false;
        window.clearTimeout(pressTimer);
        element.classList.add('is-gamepad-pressing');
        pressTimer = window.setTimeout(() => {
          pressTimer = 0;
          element.classList.remove('is-gamepad-pressing');
        }, 150);
        element.focus({ preventScroll: true });
        element.click();
        return true;
      },
    },
    host,
  );
  return () => {
    release();
    window.clearTimeout(pressTimer);
    element.classList.remove('is-gamepad-hovered', 'is-gamepad-pressing');
  };
}

export function publishGamepadSnapshot(
  snapshot: GamepadInputSnapshot,
  host?: GamepadBridgeHost,
  timestamp = globalThis.performance.now(),
) {
  if (!isGamepadInputSnapshot(snapshot)) return;
  const state = bridge(host);
  state.sourceSnapshot = snapshot;
  for (const button of state.consumedButtons) {
    if ((snapshot.buttons[button] ?? 0) <= GAMEPAD_BUTTON_RELEASE_THRESHOLD) {
      state.consumedButtons.delete(button);
    }
  }
  let consumedButton: number | null = null;
  if (state.owner === 'gamepad-test') {
    state.konamiSequence.reset(snapshot);
  } else {
    consumedButton = state.konamiSequence.update(snapshot, timestamp);
  }
  if (consumedButton !== null) {
    state.consumedButtons.add(consumedButton);
  }
  state.snapshot =
    state.consumedButtons.size === 0
      ? snapshot
      : {
          ...snapshot,
          buttons: snapshot.buttons.map((value, index) =>
            state.consumedButtons.has(index) ? 0 : value,
          ),
        };
  state.events.dispatchEvent(new Event(GAMEPAD_SNAPSHOT_EVENT));
  if (consumedButton !== null) {
    state.events.dispatchEvent(new Event(GAMEPAD_EASTER_EGG_EVENT));
  }
}

export function readGamepadSnapshot(host?: GamepadBridgeHost) {
  return bridge(host).snapshot;
}

export function readGamepadSourceSnapshot(host?: GamepadBridgeHost) {
  return bridge(host).sourceSnapshot;
}

export function subscribeGamepadSnapshot(
  listener: () => void,
  host?: GamepadBridgeHost,
) {
  return subscribe(GAMEPAD_SNAPSHOT_EVENT, listener, host);
}

export function subscribeGamepadEasterEgg(
  listener: () => void,
  host?: GamepadBridgeHost,
) {
  return subscribe(GAMEPAD_EASTER_EGG_EVENT, listener, host);
}

export function requestGamepadBrowserTabSwitch(
  direction: GamepadBrowserTabDirection,
  host?: GamepadBridgeHost,
) {
  const state = bridge(host);
  // The bridge is a privileged boundary: inspection mode must not be able to
  // publish a browser side effect even if an upstream input scope regresses.
  if (!gamepadOwnerAllowsCommands(state.owner)) return false;
  state.browserTabDirection = direction;
  state.events.dispatchEvent(new Event(GAMEPAD_BROWSER_TAB_EVENT));
  return true;
}

export function subscribeGamepadBrowserTabSwitch(
  listener: (direction: GamepadBrowserTabDirection) => void,
  host?: GamepadBridgeHost,
) {
  return subscribe(
    GAMEPAD_BROWSER_TAB_EVENT,
    () => {
      const state = bridge(host);
      if (!gamepadOwnerAllowsCommands(state.owner)) return;
      listener(state.browserTabDirection);
    },
    host,
  );
}
