import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CARD_BOTTOM_FRAME_FIT,
  CARD_BOTTOM_FRAME_SOURCE,
  CardBottomFrame,
  cardBottomFrameVariables,
} from './CardBottomFrame';

describe('card bottom frame contract', () => {
  it('shares the confirmed material and fit across every card surface', () => {
    expect(
      CARD_BOTTOM_FRAME_SOURCE.endsWith('bottom-frame-square-gold.webp'),
    ).toBe(true);
    expect(CARD_BOTTOM_FRAME_FIT).toEqual({ width: 104, bottomOutset: 4 });
    expect(cardBottomFrameVariables()).toMatchObject({
      '--card-bottom-frame-aspect': '525 / 363',
      '--card-bottom-frame-bottom': '-4%',
      '--card-bottom-frame-scale': 1.04,
    });
  });

  it('keeps experimental values local to the supplied fit', () => {
    expect(
      cardBottomFrameVariables({ width: 112, bottomOutset: 7 }),
    ).toMatchObject({
      '--card-bottom-frame-bottom': '-7%',
      '--card-bottom-frame-scale': 1.12,
    });
    expect(CARD_BOTTOM_FRAME_FIT).toEqual({ width: 104, bottomOutset: 4 });
  });

  it('allows a host-specific material without duplicating frame geometry', () => {
    const markup = renderToStaticMarkup(
      createElement(CardBottomFrame, {
        className: 'frame',
        imageClassName: 'image',
        source: '/extension/bottom-frame.png',
      }),
    );

    expect(markup).toContain('src="/extension/bottom-frame.png"');
    expect(markup).toContain('--card-bottom-frame-scale:1.04');
  });
});
