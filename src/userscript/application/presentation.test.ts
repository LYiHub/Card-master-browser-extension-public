import { describe, expect, it } from 'vitest';

import {
  type UserscriptCardVariant,
  userscriptCardMedia,
} from '../../lib/userscript-deck-media';
import type { UserscriptPresentation } from '../domain/types';
import { allocateUserscriptPresentation } from './presentation';

function presentation(variant: UserscriptCardVariant): UserscriptPresentation {
  return {
    accent: '#abcdef',
    media: {
      kind: 'video',
      video: userscriptCardMedia(variant).video,
    },
  };
}

function appearances(variant: UserscriptCardVariant, count: number) {
  return Array.from({ length: count }, () => presentation(variant));
}

describe('userscript presentation allocation', () => {
  it('randomizes only among the least-used card presentations', () => {
    const current = [
      ...appearances('01', 6),
      ...appearances('02', 5),
      ...appearances('03', 4),
      ...appearances('04', 4),
      ...appearances('05', 6),
      ...appearances('06', 5),
    ];

    expect(allocateUserscriptPresentation(current, () => 0).media).toEqual({
      kind: 'video',
      video: userscriptCardMedia('03').video,
    });
    expect(allocateUserscriptPresentation(current, () => 0).accent).toBe(
      userscriptCardMedia('03').accent,
    );
    expect(allocateUserscriptPresentation(current, () => 0.999).media).toEqual({
      kind: 'video',
      video: userscriptCardMedia('04').video,
    });
    expect(allocateUserscriptPresentation(current, () => 0.999).accent).toBe(
      userscriptCardMedia('04').accent,
    );
  });

  it('randomizes across the full pool when every count is equal', () => {
    const current = [
      ...appearances('01', 6),
      ...appearances('02', 6),
      ...appearances('03', 6),
      ...appearances('04', 6),
      ...appearances('05', 6),
      ...appearances('06', 6),
    ];
    const first = allocateUserscriptPresentation(current, () => 0);
    const last = allocateUserscriptPresentation(current, () => 0.999);

    expect(first.media).toEqual({
      kind: 'video',
      video: userscriptCardMedia('01').video,
    });
    expect(last.media).toEqual({
      kind: 'video',
      video: userscriptCardMedia('06').video,
    });
    expect(allocateUserscriptPresentation(current, () => 0.999)).not.toBe(last);
  });

  it('excludes a card from the next draw after it moves above the minimum', () => {
    const equal = [
      ...appearances('01', 6),
      ...appearances('02', 6),
      ...appearances('03', 6),
      ...appearances('04', 6),
      ...appearances('05', 6),
      ...appearances('06', 6),
    ];
    const selected = allocateUserscriptPresentation(equal, () => 0.999);

    expect(selected.media).toEqual({
      kind: 'video',
      video: userscriptCardMedia('06').video,
    });
    expect(
      allocateUserscriptPresentation([...equal, selected], () => 0.999).media,
    ).toEqual({
      kind: 'video',
      video: userscriptCardMedia('05').video,
    });
  });

  it('ignores custom and unrelated media when counting appearances', () => {
    const current: UserscriptPresentation[] = [
      presentation('01'),
      {
        accent: '#123456',
        media: {
          kind: 'image',
          image: 'data:image/webp;base64,Y292ZXI=',
        },
      },
      {
        accent: '#654321',
        media: {
          kind: 'video',
          video: 'userscript-deck/video/preinstalled-cards/01-bilikit-core.mp4',
        },
      },
    ];

    expect(allocateUserscriptPresentation(current, () => 0).media).toEqual({
      kind: 'video',
      video: userscriptCardMedia('02').video,
    });
  });
});
