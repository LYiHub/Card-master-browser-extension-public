import { describe, expect, it } from 'vitest';
import {
  activeGamepadBindingActions,
  defaultGamepadBindings,
  GAMEPAD_BUTTON_BINDING_DEFINITIONS,
  GAMEPAD_BUTTON_OPTIONS,
  gamepadButtonLabel,
  isGamepadBindings,
  setGamepadButtonBinding,
  setGamepadStickBinding,
} from './bindings';
import type { GamepadInputSnapshot } from './types';

function snapshot(
  buttons: number[] = [],
  axes: number[] = [],
): GamepadInputSnapshot {
  return {
    connected: true,
    index: 0,
    id: 'controller',
    mapping: 'standard',
    buttons,
    axes,
  };
}

describe('gamepad bindings', () => {
  it('reserves triggers for browser tabs without changing shoulder actions', () => {
    const bindings = defaultGamepadBindings();

    expect(isGamepadBindings(bindings)).toBe(true);
    expect(bindings.buttons.browserTabPrevious).toBe(6);
    expect(bindings.buttons.browserTabNext).toBe(7);
    expect(bindings.buttons.contextPrevious).toBe(4);
    expect(bindings.buttons.contextNext).toBe(5);
    expect(bindings.buttons.pagePrevious).toBeNull();
    expect(bindings.buttons.pageNext).toBeNull();
    expect(bindings.buttons.newTab).toBe(8);
    expect(bindings.buttons.toggleDeck).toBe(9);
    expect(bindings.buttons.pushToTalk).toBe(17);
    expect(
      isGamepadBindings({
        ...bindings,
        buttons: { ...bindings.buttons, confirm: 1 },
      }),
    ).toBe(false);
  });

  it('swaps conflicting commands without producing duplicate execution', () => {
    const bindings = setGamepadButtonBinding(
      defaultGamepadBindings(),
      'confirm',
      1,
    );

    expect(bindings.buttons.confirm).toBe(1);
    expect(bindings.buttons.back).toBe(0);
    expect(isGamepadBindings(bindings)).toBe(true);
  });

  it('moves the long-press binding when a continuous command takes its button', () => {
    const bindings = setGamepadButtonBinding(
      defaultGamepadBindings(),
      'pagePrevious',
      9,
    );

    expect(bindings.buttons.pagePrevious).toBe(9);
    expect(bindings.buttons.toggleDeck).toBeNull();
    expect(isGamepadBindings(bindings)).toBe(true);
  });

  it('does not invent a short-press command when assigning the first hold button', () => {
    const current = defaultGamepadBindings();
    current.buttons.toggleDeck = null;
    const bindings = setGamepadButtonBinding(current, 'toggleDeck', 4);

    expect(bindings.buttons.pagePrevious).toBeNull();
    expect(bindings.buttons.toggleAudio).toBeNull();
    expect(bindings.buttons.toggleDeck).toBe(4);
    expect(isGamepadBindings(bindings)).toBe(true);
  });

  it('keeps push-to-talk exclusive when hold bindings are remapped', () => {
    const bindings = setGamepadButtonBinding(
      defaultGamepadBindings(),
      'toggleDeck',
      17,
    );

    expect(bindings.buttons.toggleDeck).toBe(17);
    expect(bindings.buttons.pushToTalk).toBe(9);
    expect(isGamepadBindings(bindings)).toBe(true);
  });

  it('swaps primary and secondary stick responsibilities', () => {
    expect(
      setGamepadStickBinding(defaultGamepadBindings(), 'primaryStick', 'right'),
    ).toMatchObject({
      primaryStick: 'right',
      secondaryStick: 'left',
    });
  });

  it('uses device-specific labels for mapped prompt buttons', () => {
    expect(gamepadButtonLabel(0, 'DualSense Wireless Controller')).toBe('叉键');
    expect(gamepadButtonLabel(0, 'Xbox Wireless Controller')).toBe('A 键');
    expect(gamepadButtonLabel(0, 'Nintendo Switch Joy-Con')).toBe('B 键');
    expect(gamepadButtonLabel(0, 'Generic Controller')).toBe('叉键 / A');
  });

  it('keeps every editor assignment inside the valid binding invariant', () => {
    for (const { action } of GAMEPAD_BUTTON_BINDING_DEFINITIONS) {
      for (const button of [
        null,
        ...GAMEPAD_BUTTON_OPTIONS.map((option) => option.value),
      ]) {
        expect(
          isGamepadBindings(
            setGamepadButtonBinding(defaultGamepadBindings(), action, button),
          ),
        ).toBe(true);
      }
    }
  });

  it('describes only controls that can act in the current context', () => {
    const bindings = defaultGamepadBindings();
    const buttons = Array.from({ length: 18 }, () => 0);
    buttons[0] = 1;
    buttons[6] = 1;
    buttons[8] = 1;
    buttons[9] = 1;

    expect(
      activeGamepadBindingActions({
        snapshot: snapshot(buttons, [0.8, 0, 0, 0.7]),
        bindings,
        deadZone: 0.16,
        context: 'page',
      }),
    ).toEqual([
      { label: '移动光标', persistentWhileHeld: true },
      { label: '滚动', persistentWhileHeld: true },
      { label: '点击', persistentWhileHeld: false },
      { label: '上一个标签页', persistentWhileHeld: true },
      { label: '新建标签页', persistentWhileHeld: false },
      { label: '长按牌库', persistentWhileHeld: true },
    ]);
    expect(
      activeGamepadBindingActions({
        snapshot: snapshot(buttons),
        bindings,
        deadZone: 0.16,
        context: 'paused',
      }),
    ).toEqual([{ label: '长按牌库', persistentWhileHeld: true }]);

    expect(
      activeGamepadBindingActions({
        snapshot: snapshot(buttons),
        bindings,
        deadZone: 0.16,
        context: 'keyboard',
      }),
    ).toEqual([
      { label: '输入当前键帽', persistentWhileHeld: false },
      { label: '退格', persistentWhileHeld: true },
      { label: '长按牌库', persistentWhileHeld: true },
    ]);

    const candidateButtons = Array.from({ length: 18 }, () => 0);
    candidateButtons[0] = 1;
    candidateButtons[4] = 1;
    candidateButtons[5] = 1;
    expect(
      activeGamepadBindingActions({
        snapshot: snapshot(candidateButtons),
        bindings,
        deadZone: 0.16,
        context: 'keyboard-candidates',
      }),
    ).toEqual([
      { label: '选择候选词', persistentWhileHeld: false },
      { label: '上一个候选词', persistentWhileHeld: false },
      { label: '下一个候选词', persistentWhileHeld: false },
    ]);

    const touchpadButtons = Array.from({ length: 18 }, () => 0);
    touchpadButtons[17] = 1;
    expect(
      activeGamepadBindingActions({
        snapshot: snapshot(touchpadButtons),
        bindings,
        deadZone: 0.16,
        context: 'page',
      }),
    ).toContainEqual({ label: '按住说话', persistentWhileHeld: true });
  });
});
