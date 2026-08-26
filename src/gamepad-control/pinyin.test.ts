import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAMEPAD_KEYBOARD_INPUT_MODE,
  gamepadPinyinCandidates,
} from './pinyin';

describe('gamepad pinyin input', () => {
  it('defaults the screen keyboard to Chinese pinyin mode', () => {
    expect(DEFAULT_GAMEPAD_KEYBOARD_INPUT_MODE).toBe('chinese');
  });

  it('ranks exact candidates by frequency and removes duplicates', () => {
    expect(
      gamepadPinyinCandidates(
        {
          nihao: [
            { w: '你号', f: 10 },
            { w: '你好', f: 100 },
            { w: '你好', f: 90 },
          ],
        },
        'NiHao',
      ),
    ).toEqual([
      { word: '你好', matchedLength: 5 },
      { word: '你号', matchedLength: 5 },
    ]);
  });

  it('uses initial-based dictionary entries such as nh', () => {
    expect(
      gamepadPinyinCandidates(
        {
          nh: [
            { w: '女孩', f: 80 },
            { w: '你好', f: 100 },
          ],
        },
        'nh',
      ),
    ).toEqual([
      { word: '你好', matchedLength: 2 },
      { word: '女孩', matchedLength: 2 },
    ]);
  });

  it('completes unfinished pinyin before falling back to a shorter prefix', () => {
    const dictionary = {
      ni: [{ w: '你', f: 1_000 }],
      nihai: [{ w: '你还', f: 80 }],
      nihao: [{ w: '你好', f: 100 }],
    };

    expect(gamepadPinyinCandidates(dictionary, 'nih')).toEqual([
      { word: '你好', matchedLength: 3 },
      { word: '你还', matchedLength: 3 },
    ]);
    expect(gamepadPinyinCandidates(dictionary, 'niha')).toEqual([
      { word: '你好', matchedLength: 4 },
      { word: '你还', matchedLength: 4 },
    ]);
  });

  it('keeps exact abbreviation results ahead of forward completions', () => {
    expect(
      gamepadPinyinCandidates(
        {
          nih: [{ w: '霓虹', f: 10 }],
          nihao: [{ w: '你好', f: 100 }],
        },
        'nih',
      ),
    ).toEqual([
      { word: '霓虹', matchedLength: 3 },
      { word: '你好', matchedLength: 3 },
    ]);
  });

  it('falls back to the longest available pinyin prefix', () => {
    expect(
      gamepadPinyinCandidates(
        {
          ni: [{ w: '你', f: 100 }],
        },
        'nihao',
      ),
    ).toEqual([{ word: '你', matchedLength: 2 }]);
  });
});
