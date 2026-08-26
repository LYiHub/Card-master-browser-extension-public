import { describe, expect, it } from 'vitest';

import { userscriptCoverCropRect } from './card-cover';

describe('userscript cover media', () => {
  it('keeps an existing 3:4 frame unchanged', () => {
    expect(userscriptCoverCropRect(600, 800)).toEqual({
      x: 0,
      y: 0,
      width: 600,
      height: 800,
    });
  });

  it('center crops landscape media to 3:4', () => {
    expect(userscriptCoverCropRect(1_200, 600)).toEqual({
      x: 375,
      y: 0,
      width: 450,
      height: 600,
    });
  });

  it('center crops tall portrait media to 3:4', () => {
    expect(userscriptCoverCropRect(600, 1_200)).toEqual({
      x: 0,
      y: 200,
      width: 600,
      height: 800,
    });
  });
});
