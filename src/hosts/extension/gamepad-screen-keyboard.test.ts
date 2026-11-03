import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguagePreference } from '../../localization/locale';

import {
  DEFAULT_GAMEPAD_KEYBOARD_SHORTCUTS,
  type GamepadKeyboardKey,
  GamepadScreenKeyboard,
  gamepadKeyboardActivationTarget,
  gamepadKeyboardComposesPinyin,
  gamepadKeyboardKeyLegend,
  gamepadKeyboardRows,
  gamepadKeyboardSpeechActive,
} from './gamepad-screen-keyboard';

afterEach(() => setLanguagePreference('auto'));

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

describe('screen keyboard language updates', () => {
  it('updates existing key labels and shortcuts without replacing keys or clearing composition', () => {
    setLanguagePreference('zh-CN');
    const makeText = (textContent = '') => ({
      textContent,
      className: '',
      remove: vi.fn(),
    });
    const makeButton = (
      row: number,
      column: number,
      label: string,
      shortcut?: string,
    ) => {
      const legend = makeText(label);
      const shortcutElement = shortcut ? makeText(shortcut) : null;
      return {
        dataset: {
          row: String(row),
          column: String(column),
          candidateIndex: row === -1 ? '0' : '',
        },
        attributes: new Map<string, string>(),
        title: '',
        classList: { toggle: vi.fn() },
        setAttribute(key: string, value: string) {
          this.attributes.set(key, value);
        },
        removeAttribute(key: string) {
          this.attributes.delete(key);
        },
        querySelector(selector: string) {
          return selector === '.gamepad-keyboard__legend'
            ? legend
            : shortcutElement;
        },
        append: vi.fn(),
        legend,
      };
    };
    const caps = makeButton(2, 0, 'caps lock');
    const backspace = makeButton(0, 13, 'delete', 'L2');
    const candidate = makeButton(-1, 0, '1 时光');
    const keys = [caps, backspace, candidate];
    const speech = makeButton(-1, 1, '');
    const word = { word: '时光', matchedLength: 8 };
    const originalRows = gamepadKeyboardRows('chinese');
    const definitions = new Map<string, GamepadKeyboardKey>([
      ['2:0', originalRows[2][0]],
      ['0:13', originalRows[0][13]],
      [
        '-1:0',
        {
          label: '1 时光',
          name: '候选词 时光',
          action: 'candidate',
          candidate: word,
        },
      ],
    ]);
    const grid = { replaceChildren: vi.fn() };
    const selection = { row: -1, column: 0 };
    const state = {
      element: {
        lang: '',
        setAttribute: vi.fn(),
        querySelectorAll: () => keys,
      },
      candidateBar: { setAttribute: vi.fn() },
      candidateList: { querySelector: () => null },
      notice: { lang: '' },
      pageDocument: { defaultView: null, createElement: () => makeText() },
      grid,
      keyDefinitions: definitions,
      selection,
      lastKeyboardSelection: { row: 2, column: 0 },
      activationMode: 'selection',
      inputMode: 'chinese',
      capsLocked: true,
      shifted: false,
      activeCandidateIndex: 0,
      pinyinInput: 'shiguang',
      pinyinCandidates: [word],
      pinyinStatus: 'ready',
      shortcuts: { ...DEFAULT_GAMEPAD_KEYBOARD_SHORTCUTS },
      speechStatus: 'listening',
      speechControl: {},
      speechButton: speech,
      speechLabel: makeText(),
      speechShortcut: makeText(),
      buttons: () => [...keys, speech],
    };
    const keyboard = Object.assign(
      Object.create(GamepadScreenKeyboard.prototype),
      state,
    ) as GamepadScreenKeyboard;
    setLanguagePreference('zh-TW');
    keyboard.setShortcuts({
      ...DEFAULT_GAMEPAD_KEYBOARD_SHORTCUTS,
      speech: '觸控板',
    });
    expect(grid.replaceChildren).not.toHaveBeenCalled();
    expect(state.element.querySelectorAll()).toEqual(keys);
    expect(caps.attributes.get('aria-label')).toContain('大寫');
    expect(candidate.attributes.get('aria-label')).toBe('候選詞 时光');
    expect(candidate.legend.textContent).toBe('1 时光');
    expect(Reflect.get(keyboard, 'pinyinInput')).toBe('shiguang');
    expect(Reflect.get(keyboard, 'pinyinCandidates')).toBe(
      state.pinyinCandidates,
    );
    expect(state.pinyinCandidates[0]).toBe(word);
    expect(Reflect.get(keyboard, 'selection')).toBe(selection);
    expect(Reflect.get(keyboard, 'capsLocked')).toBe(true);
    expect(state.element.lang).toBe('zh-TW');
    expect(state.speechShortcut.textContent).toContain('觸控板');
    expect(speech.attributes.get('aria-pressed')).toBe('true');
  });
});
