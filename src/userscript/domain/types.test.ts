import { describe, expect, it } from 'vitest';

import { INITIAL_USERSCRIPTS } from '../fixtures';
import {
  isUserscriptPresentation,
  reorderInstalledScriptSubset,
  restoreInstalledScriptOrder,
} from './types';

describe('Userscript domain helpers', () => {
  it('restores a transient drag preview to its original order', () => {
    const original = INITIAL_USERSCRIPTS.slice(0, 3);
    const preview = [original[2], original[0], original[1]];

    expect(
      restoreInstalledScriptOrder(
        preview,
        original.map((item) => item.id),
      ),
    ).toEqual(original);
  });

  it('keeps newly installed scripts when restoring an existing order', () => {
    const original = INITIAL_USERSCRIPTS.slice(0, 2);
    const created = INITIAL_USERSCRIPTS[2];

    expect(
      restoreInstalledScriptOrder(
        [original[1], created, original[0]],
        original.map((item) => item.id),
      ),
    ).toEqual([...original, created]);
  });

  it('reorders only visible scripts without moving hidden library entries', () => {
    const [first, hidden, third] = INITIAL_USERSCRIPTS.slice(0, 3);

    expect(
      reorderInstalledScriptSubset(
        [first, hidden, third],
        [first.id, third.id],
        third.id,
        0,
      ),
    ).toEqual([third, hidden, first]);
  });

  it('accepts exactly one card media source and rejects the removed schema', () => {
    expect(
      isUserscriptPresentation({
        accent: '#df9850',
        media: {
          kind: 'image',
          image: 'data:image/webp;base64,Y292ZXI=',
        },
      }),
    ).toBe(true);
    expect(
      isUserscriptPresentation({
        accent: '#df9850',
        media: {
          kind: 'image',
          image:
            'userscript-deck/card-art/preinstalled-cards/04-copying-lifted.webp',
        },
      }),
    ).toBe(true);
    expect(
      isUserscriptPresentation({
        accent: '#df9850',
        media: {
          kind: 'video',
          video: 'data:video/mp4;base64,dmlkZW8=',
          poster: 'data:image/webp;base64,Y292ZXI=',
        },
      }),
    ).toBe(true);
    expect(
      isUserscriptPresentation({
        accent: '#df9850',
        media: {
          kind: 'video',
          video: 'data:text/plain;base64,dmlkZW8=',
        },
      }),
    ).toBe(false);
    expect(
      isUserscriptPresentation({
        accent: '#df9850',
        media: {
          kind: 'video',
          video: 'userscript-deck/video/card.mp4',
        },
      }),
    ).toBe(true);
    expect(
      isUserscriptPresentation({
        accent: '#df9850',
        video: 'userscript-deck/video/card.mp4',
        coverImage: 'data:image/webp;base64,Y292ZXI=',
      }),
    ).toBe(false);
    expect(
      isUserscriptPresentation({
        accent: 'color-mix(in srgb, red 50%, blue)',
        media: {
          kind: 'video',
          video: 'userscript-deck/video/card.mp4',
        },
      }),
    ).toBe(false);
  });
});
