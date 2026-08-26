import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAMEPAD_KEYBOARD_SHORTCUTS,
  gamepadKeyboardActivationTarget,
  gamepadKeyboardComposesPinyin,
  gamepadKeyboardKeyLegend,
  gamepadKeyboardRows,
  gamepadKeyboardSpeechActive,
} from './gamepad-screen-keyboard';

describe('gamepad screen keyboard legends', () => {
  it('keeps letters lowercase until Shift is active', () => {
    const key = { label: 'q', value: 'q' };

    expect(gamepadKeyboardKeyLegend(key, false)).toBe('q');
    expect(gamepadKeyboardKeyLegend(key, true)).toBe('Q');
  });

  it('matches the physical QWERTY row structure', () => {
    const rows = gamepadKeyboardRows('chinese');

    expect(rows.map((row) => row.length)).toEqual([14, 14, 13, 12, 11]);
    expect(rows[0]?.map((key) => key.label)).toEqual([
      '`',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '0',
      '-',
      '=',
      'delete',
    ]);
    expect(rows[1]?.at(0)?.action).toBe('tab');
    expect(
      rows[1]
        ?.slice(1, 11)
        .map((key) => key.label)
        .join(''),
    ).toBe('qwertyuiop');
    expect(rows[2]?.at(-1)?.action).toBe('enter');
    expect(rows[2]?.at(0)?.action).toBe('caps-lock');
    expect(rows[3]?.at(0)?.action).toBe('shift');
    expect(rows[3]?.at(-1)?.action).toBe('shift');
    expect(rows[4]?.map((key) => key.label)).toEqual([
      '中',
      'ctrl',
      '⌥',
      '⌘',
      '',
      '⌘',
      '⌥',
      '◀',
      '▼',
      '▲',
      '▶',
    ]);
    expect(rows[4]?.map((key) => key.units ?? 1)).toEqual([
      1, 1, 1, 1, 5, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it('provides shifted legends for number and punctuation keys', () => {
    const rows = gamepadKeyboardRows('chinese');

    expect(rows[0]?.at(1)).toMatchObject({
      label: '1',
      value: '1',
      shifted: '!',
    });
    expect(rows[1]?.at(-1)).toMatchObject({
      label: '\\',
      value: '\\',
      shifted: '|',
    });
    expect(rows[2]?.at(-2)).toMatchObject({
      label: "'",
      value: "'",
      shifted: '"',
    });
    expect(rows[3]?.at(-2)).toMatchObject({
      label: '/',
      value: '/',
      shifted: '?',
    });
  });

  it('shows the shifted symbol without rewriting action labels', () => {
    expect(
      gamepadKeyboardKeyLegend({ label: '1', value: '1', shifted: '!' }, true),
    ).toBe('!');
    expect(
      gamepadKeyboardKeyLegend(
        { label: 'Space', action: 'space', units: 8 },
        false,
      ),
    ).toBe('Space');
  });

  it('uses the bottom-left key to switch input languages', () => {
    expect(gamepadKeyboardRows('chinese')[4]?.at(0)).toMatchObject({
      label: '中',
      action: 'toggle-language',
    });
    expect(gamepadKeyboardRows('english')[4]?.at(0)).toMatchObject({
      label: 'EN',
      action: 'toggle-language',
    });
  });

  it('keeps mapped keyboard controls visible on their matching key caps', () => {
    const rows = gamepadKeyboardRows('chinese');
    const keys = rows.flat();

    expect(keys.find((key) => key.action === 'backspace')?.shortcut).toBe('L2');
    expect(keys.find((key) => key.action === 'enter')?.shortcut).toBe('R2');
    expect(keys.find((key) => key.action === 'space')?.shortcut).toBe('X / □');
    expect(keys.find((key) => key.action === 'select-all')?.shortcut).toBe(
      'L3',
    );
    expect(
      keys.find((key) => key.action === 'candidate-previous')?.shortcut,
    ).toBe('L1');
    expect(keys.find((key) => key.action === 'candidate-next')?.shortcut).toBe(
      'R1',
    );
  });

  it('renders remapped controls instead of preserving stale shortcut labels', () => {
    const rows = gamepadKeyboardRows('chinese', {
      ...DEFAULT_GAMEPAD_KEYBOARD_SHORTCUTS,
      backspace: 'LT',
      enter: 'RT',
      selectAll: '左摇杆',
      space: 'X 键',
    });
    const keys = rows.flat();

    expect(keys.find((key) => key.action === 'backspace')?.shortcut).toBe('LT');
    expect(keys.find((key) => key.action === 'enter')?.shortcut).toBe('RT');
    expect(keys.find((key) => key.action === 'select-all')?.shortcut).toBe(
      '左摇杆',
    );
    expect(keys.find((key) => key.action === 'space')?.shortcut).toBe('X 键');
  });

  it('keeps every row inside the 15-unit physical keyboard grid', () => {
    for (const inputMode of ['chinese', 'english'] as const) {
      for (const row of gamepadKeyboardRows(inputMode)) {
        const units = row.reduce((total, key) => total + (key.units ?? 1), 0);

        expect(units).toBeLessThanOrEqual(15);
        expect(Number.isInteger(units)).toBe(true);
        expect(Number.isInteger(units * 2)).toBe(true);
        expect(row.every((key) => Number.isInteger((key.units ?? 1) * 2))).toBe(
          true,
        );
      }
    }
  });
});

describe('gamepad screen keyboard pinyin composition', () => {
  it('composes unshifted letters only in the Chinese alpha layer', () => {
    expect(
      gamepadKeyboardComposesPinyin({
        capsLocked: false,
        inputMode: 'chinese',
        shifted: false,
        value: 'q',
      }),
    ).toBe(true);
    expect(
      gamepadKeyboardComposesPinyin({
        capsLocked: false,
        inputMode: 'chinese',
        shifted: true,
        value: 'Q',
      }),
    ).toBe(false);
    expect(
      gamepadKeyboardComposesPinyin({
        capsLocked: false,
        inputMode: 'english',
        shifted: false,
        value: 'q',
      }),
    ).toBe(false);
    expect(
      gamepadKeyboardComposesPinyin({
        capsLocked: true,
        inputMode: 'chinese',
        shifted: false,
        value: 'q',
      }),
    ).toBe(false);
  });
});

describe('gamepad screen keyboard speech entry', () => {
  it('stays active through the complete recording lifecycle', () => {
    expect(gamepadKeyboardSpeechActive('idle')).toBe(false);
    expect(gamepadKeyboardSpeechActive('connecting')).toBe(true);
    expect(gamepadKeyboardSpeechActive('listening')).toBe(true);
    expect(gamepadKeyboardSpeechActive('stopping')).toBe(true);
    expect(gamepadKeyboardSpeechActive('complete')).toBe(false);
    expect(gamepadKeyboardSpeechActive('error')).toBe(false);
  });
});

describe('gamepad screen keyboard activation ownership', () => {
  it('uses the navigated key even when a stale cursor overlaps a candidate', () => {
    expect(
      gamepadKeyboardActivationTarget({
        cursorTarget: 'candidate',
        mode: 'selection',
        selectedTarget: 'letter',
      }),
    ).toBe('letter');
  });

  it('uses only the pointed key in cursor mode without falling back', () => {
    expect(
      gamepadKeyboardActivationTarget({
        cursorTarget: 'candidate',
        mode: 'cursor',
        selectedTarget: 'letter',
      }),
    ).toBe('candidate');
    expect(
      gamepadKeyboardActivationTarget({
        cursorTarget: null,
        mode: 'cursor',
        selectedTarget: 'letter',
      }),
    ).toBeNull();
  });
});
