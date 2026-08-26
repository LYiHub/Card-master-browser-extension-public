import { describe, expect, it } from 'vitest';

import {
  findKeyboardNavigationTarget,
  horizontalNavigationGeometry,
  horizontalRevealPosition,
  type KeyboardNavigationTarget,
} from './keyboard-navigation';

type Target = KeyboardNavigationTarget & { id: string };

function target(id: string, row: number, column: number): Target {
  return { id, row, column };
}

function targetAt(targets: readonly Target[], index: number) {
  const value = targets[index];
  if (!value) throw new Error(`Missing keyboard target at index ${index}.`);
  return value;
}

describe('gamepad keyboard row navigation', () => {
  it('keeps left and right movement inside the current row', () => {
    const q = target('q', 0, 0);
    const w = target('w', 0, 1);
    const a = target('a', 1, 0);
    const keys = [q, w, a];

    expect(findKeyboardNavigationTarget(keys, q, 'right')).toBe(w);
    expect(findKeyboardNavigationTarget(keys, q, 'left')).toBeNull();
    expect(findKeyboardNavigationTarget(keys, w, 'right')).toBeNull();
  });

  it('moves exactly one available row vertically', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, column) =>
        target(`top-${column}`, 0, column),
      ),
      ...Array.from({ length: 9 }, (_, column) =>
        target(`middle-${column}`, 1, column),
      ),
      ...Array.from({ length: 10 }, (_, column) =>
        target(`bottom-${column}`, 2, column),
      ),
    ];

    expect(
      findKeyboardNavigationTarget(rows, targetAt(rows, 5), 'down')?.row,
    ).toBe(1);
    expect(
      findKeyboardNavigationTarget(rows, targetAt(rows, 14), 'down')?.row,
    ).toBe(2);
    expect(
      findKeyboardNavigationTarget(rows, targetAt(rows, 23), 'up')?.row,
    ).toBe(1);
  });

  it('enters and leaves the candidate row without skipping row zero', () => {
    const candidates = Array.from({ length: 5 }, (_, column) =>
      target(`candidate-${column}`, -1, column),
    );
    const firstRow = Array.from({ length: 10 }, (_, column) =>
      target(`key-${column}`, 0, column),
    );
    const keys = [...candidates, ...firstRow];

    expect(
      findKeyboardNavigationTarget(keys, targetAt(candidates, 2), 'down')?.row,
    ).toBe(0);
    expect(
      findKeyboardNavigationTarget(keys, targetAt(firstRow, 5), 'up')?.row,
    ).toBe(-1);
    expect(
      findKeyboardNavigationTarget(firstRow, targetAt(firstRow, 5), 'up'),
    ).toBeNull();
  });

  it('uses visual key centers when rows contain differently sized keys', () => {
    const top = [
      { ...target('tab', 0, 0), x: 0.08 },
      { ...target('q', 0, 1), x: 0.2 },
      { ...target('p', 0, 2), x: 0.8 },
      { ...target('backslash', 0, 3), x: 0.94 },
    ];
    const bottom = [
      { ...target('shift', 1, 0), x: 0.12 },
      { ...target('z', 1, 1), x: 0.28 },
      { ...target('m', 1, 2), x: 0.72 },
      { ...target('right-shift', 1, 3), x: 0.9 },
    ];

    expect(
      findKeyboardNavigationTarget([...top, ...bottom], top[2], 'down'),
    ).toBe(bottom[2]);
    expect(
      findKeyboardNavigationTarget([...top, ...bottom], bottom[0], 'up'),
    ).toBe(top[0]);
  });

  it('resolves the visual center when selection state is a row-column copy', () => {
    const top = [
      { ...target('wide-left', 0, 0), x: 0.18 },
      { ...target('right', 0, 1), x: 0.82 },
    ];
    const bottom = [
      { ...target('left', 1, 0), x: 0.12 },
      { ...target('middle', 1, 1), x: 0.52 },
      { ...target('wide-right', 1, 2), x: 0.86 },
    ];

    expect(
      findKeyboardNavigationTarget(
        [...top, ...bottom],
        { row: 0, column: 1 },
        'down',
      ),
    ).toBe(bottom[2]);
  });

  it('enters a wide candidate by its visible horizontal span', () => {
    const candidates = [
      {
        ...target('long-candidate', -1, 0),
        x: 0.34,
        startX: 0,
        endX: 0.68,
      },
      {
        ...target('short-candidate', -1, 1),
        x: 0.76,
        startX: 0.72,
        endX: 0.8,
      },
    ];
    const key = { ...target('key', 0, 0), x: 0.66 };

    expect(findKeyboardNavigationTarget([...candidates, key], key, 'up')).toBe(
      candidates[0],
    );
  });

  it('does not enter candidates outside the visible candidate viewport', () => {
    const candidates = [
      {
        ...target('visible-left', -1, 0),
        x: 0.2,
        startX: 0.1,
        endX: 0.3,
        verticalNavigationEligible: true,
      },
      {
        ...target('hidden-right', -1, 1),
        x: 1,
        startX: 1,
        endX: 1,
        verticalNavigationEligible: false,
      },
    ];
    const key = { ...target('right-key', 0, 0), x: 0.92 };

    expect(findKeyboardNavigationTarget([...candidates, key], key, 'up')).toBe(
      candidates[0],
    );
  });

  it('keeps horizontal candidate navigation sequential across the viewport', () => {
    const candidates = [
      {
        ...target('visible', -1, 0),
        x: 0.8,
        verticalNavigationEligible: true,
      },
      {
        ...target('hidden', -1, 1),
        x: 1,
        verticalNavigationEligible: false,
      },
    ];

    expect(
      findKeyboardNavigationTarget(candidates, candidates[0], 'right'),
    ).toBe(candidates[1]);
  });
});

describe('gamepad keyboard horizontal geometry', () => {
  it('uses the visible intersection of an oversized candidate', () => {
    expect(
      horizontalNavigationGeometry(
        { left: -300, right: 900 },
        { left: 0, right: 600 },
      ),
    ).toEqual({
      x: 0.5,
      startX: 0,
      endX: 1,
      visible: true,
    });
  });

  it('uses the visible part of a partially clipped candidate', () => {
    expect(
      horizontalNavigationGeometry(
        { left: 500, right: 760 },
        { left: 100, right: 600 },
      ),
    ).toEqual({
      x: 0.9,
      startX: 0.8,
      endX: 1,
      visible: true,
    });
  });

  it('marks offscreen candidates as vertically ineligible', () => {
    expect(
      horizontalNavigationGeometry(
        { left: 700, right: 800 },
        { left: 100, right: 600 },
      ),
    ).toEqual({
      x: 1,
      startX: 1,
      endX: 1,
      visible: false,
    });
  });

  it('does not scroll an oversized candidate that is already visible', () => {
    expect(
      horizontalRevealPosition(
        { left: 80, right: 900 },
        { left: 100, right: 600 },
      ),
    ).toBeNull();
  });

  it('reveals the nearest edge of an offscreen oversized candidate', () => {
    expect(
      horizontalRevealPosition(
        { left: 700, right: 1_400 },
        { left: 100, right: 600 },
      ),
    ).toBe(700);
    expect(
      horizontalRevealPosition(
        { left: -700, right: 0 },
        { left: 100, right: 600 },
      ),
    ).toBe(-500);
  });
});
