import { describe, expect, it, vi } from 'vitest';

import {
  activateGamepadVirtualPointer,
  type GamepadBridgeHost,
  gamepadOwnerAllowsCommands,
  publishGamepadControlOwner,
  publishGamepadControlState,
  publishGamepadSnapshot,
  publishGamepadVirtualPointer,
  readGamepadControlOwner,
  readGamepadControlState,
  readGamepadSnapshot,
  registerGamepadVirtualPointerTarget,
  requestGamepadBrowserTabSwitch,
  subscribeGamepadBrowserTabSwitch,
  subscribeGamepadEasterEgg,
  subscribeGamepadSnapshot,
} from './gamepad-bridge';

function bridgeHost() {
  return {} as GamepadBridgeHost;
}

function gamepadSnapshot(id: string, pressed: number[] = []) {
  const buttons = Array.from({ length: 18 }, () => 0);
  for (const index of pressed) buttons[index] = 1;
  return {
    connected: true,
    index: 0,
    id,
    mapping: 'standard',
    buttons,
    axes: [],
  };
}

describe('gamepad extension-world bridge', () => {
  it('publishes independent runtime and input ownership states', () => {
    const host = bridgeHost();

    publishGamepadControlState(true, host);
    publishGamepadControlOwner('dialog', host);

    expect(readGamepadControlState(host)).toBe(true);
    expect(readGamepadControlOwner(host)).toBe('dialog');
  });

  it('keeps page-world state outside the extension bridge', () => {
    const extensionHost = bridgeHost();
    const pageHost = bridgeHost();

    publishGamepadControlOwner('dialog', pageHost);
    publishGamepadSnapshot(
      {
        connected: true,
        index: 0,
        id: 'forged',
        mapping: 'standard',
        buttons: [1],
        axes: [],
      },
      pageHost,
    );

    expect(readGamepadControlOwner(extensionHost)).toBe('external-page');
    expect(readGamepadSnapshot(extensionHost).connected).toBe(false);
  });

  it('rejects malformed snapshots before notifying subscribers', () => {
    const host = bridgeHost();
    const listener = vi.fn();
    subscribeGamepadSnapshot(listener, host);

    publishGamepadSnapshot(
      {
        connected: true,
        buttons: ['pressed'],
      } as never,
      host,
    );

    expect(listener).not.toHaveBeenCalled();
    expect(readGamepadSnapshot(host).connected).toBe(false);
  });

  it('allows browser tab requests for ordinary input owners', () => {
    const host = bridgeHost();
    const listener = vi.fn();
    subscribeGamepadBrowserTabSwitch(listener, host);

    expect(requestGamepadBrowserTabSwitch('previous', host)).toBe(true);
    publishGamepadControlOwner('deck', host);
    expect(requestGamepadBrowserTabSwitch('next', host)).toBe(true);

    expect(listener.mock.calls).toEqual([['previous'], ['next']]);
  });

  it('blocks browser tab requests while testing the gamepad', () => {
    const host = bridgeHost();
    const listener = vi.fn();
    subscribeGamepadBrowserTabSwitch(listener, host);
    publishGamepadControlOwner('gamepad-test', host);

    expect(gamepadOwnerAllowsCommands('gamepad-test')).toBe(false);
    expect(requestGamepadBrowserTabSwitch('previous', host)).toBe(false);
    expect(requestGamepadBrowserTabSwitch('next', host)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('rechecks ownership independently for every browser command subscriber', () => {
    const host = bridgeHost();
    const listener = vi.fn();
    subscribeGamepadBrowserTabSwitch(
      () => publishGamepadControlOwner('gamepad-test', host),
      host,
    );
    subscribeGamepadBrowserTabSwitch(listener, host);

    expect(requestGamepadBrowserTabSwitch('previous', host)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('consumes only the final A press when the global easter egg matches', () => {
    const host = bridgeHost();
    const listener = vi.fn();
    const id = 'Xbox Wireless Controller';
    const prefix = [12, 12, 13, 13, 14, 15, 14, 15, 1];
    subscribeGamepadEasterEgg(listener, host);
    publishGamepadSnapshot(gamepadSnapshot(id), host, 0);
    prefix.forEach((button, index) => {
      const timestamp = (index + 1) * 100;
      publishGamepadSnapshot(gamepadSnapshot(id, [button]), host, timestamp);
      publishGamepadSnapshot(gamepadSnapshot(id), host, timestamp + 40);
    });

    publishGamepadSnapshot(gamepadSnapshot(id, [0]), host, 1_000);

    expect(listener).toHaveBeenCalledOnce();
    expect(readGamepadSnapshot(host).buttons[0]).toBe(0);

    publishGamepadSnapshot(gamepadSnapshot(id, [0]), host, 1_020);
    expect(listener).toHaveBeenCalledOnce();
    expect(readGamepadSnapshot(host).buttons[0]).toBe(0);

    publishGamepadSnapshot(gamepadSnapshot(id), host, 1_060);
    publishGamepadSnapshot(gamepadSnapshot(id, [0]), host, 1_100);
    expect(listener).toHaveBeenCalledOnce();
    expect(readGamepadSnapshot(host).buttons[0]).toBe(1);
  });

  it('excludes gamepad inspection input from the global easter egg', () => {
    const host = bridgeHost();
    const listener = vi.fn();
    const id = 'Xbox Wireless Controller';
    const inputs = [12, 12, 13, 13, 14, 15, 14, 15, 1, 0];
    subscribeGamepadEasterEgg(listener, host);
    publishGamepadControlOwner('gamepad-test', host);
    publishGamepadSnapshot(gamepadSnapshot(id), host, 0);
    inputs.forEach((button, index) => {
      const timestamp = (index + 1) * 100;
      publishGamepadSnapshot(gamepadSnapshot(id, [button]), host, timestamp);
      publishGamepadSnapshot(gamepadSnapshot(id), host, timestamp + 40);
    });

    expect(listener).not.toHaveBeenCalled();
    expect(readGamepadSnapshot(host).buttons[0]).toBe(0);
  });

  it('routes the virtual pointer to only the topmost matching extension target', () => {
    const host = bridgeHost();
    const lowerHovered = vi.fn();
    const upperHovered = vi.fn();
    const lower = {
      contains: () => true,
      setHovered: lowerHovered,
      activate: vi.fn(() => true),
    };
    const upper = {
      contains: () => true,
      setHovered: upperHovered,
      activate: vi.fn(() => true),
    };
    const releaseLower = registerGamepadVirtualPointerTarget(lower, host);

    expect(publishGamepadVirtualPointer({ x: 20, y: 30 }, host)).toBe(true);
    expect(lowerHovered).toHaveBeenLastCalledWith(true, { x: 20, y: 30 });

    const releaseUpper = registerGamepadVirtualPointerTarget(upper, host);
    expect(lowerHovered).toHaveBeenLastCalledWith(false, null);
    expect(upperHovered).toHaveBeenLastCalledWith(true, { x: 20, y: 30 });

    expect(activateGamepadVirtualPointer({ x: 20, y: 30 }, host)).toBe(true);
    expect(upper.activate).toHaveBeenCalledOnce();
    expect(lower.activate).not.toHaveBeenCalled();

    releaseUpper();
    expect(upperHovered).toHaveBeenLastCalledWith(false, null);
    expect(lowerHovered).toHaveBeenLastCalledWith(true, { x: 20, y: 30 });

    releaseLower();
  });

  it('clears extension hover when the virtual pointer leaves or becomes invalid', () => {
    const host = bridgeHost();
    const setHovered = vi.fn();
    registerGamepadVirtualPointerTarget(
      {
        contains: ({ x, y }) => x >= 0 && x <= 40 && y >= 0 && y <= 40,
        setHovered,
        activate: vi.fn(() => true),
      },
      host,
    );

    publishGamepadVirtualPointer({ x: 20, y: 20 }, host);
    publishGamepadVirtualPointer({ x: 80, y: 80 }, host);
    publishGamepadVirtualPointer({ x: Number.NaN, y: 20 }, host);

    expect(setHovered.mock.calls).toEqual([
      [true, { x: 20, y: 20 }],
      [false, null],
    ]);
    expect(activateGamepadVirtualPointer({ x: 80, y: 80 }, host)).toBe(false);
  });
});
