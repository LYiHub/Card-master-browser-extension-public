import { describe, expect, it, vi } from 'vitest';

import { mountCardRemovalEffect } from './card-removal-effect';

describe('card removal effect layer', () => {
  it('mounts inside the deck stacking context', () => {
    const appendToDeck = vi.fn();
    const appendToBody = vi.fn();
    const deckRoot = { append: appendToDeck } as unknown as HTMLElement;
    const spread = {
      offsetLeft: 0,
      offsetTop: 0,
      offsetParent: deckRoot,
    } as unknown as HTMLElement;
    const effect = { style: {} } as unknown as HTMLCanvasElement;
    const card = {
      closest: () => deckRoot,
      offsetLeft: 425,
      offsetTop: 644,
      offsetWidth: 150,
      offsetHeight: 218,
      offsetParent: spread,
      ownerDocument: {
        defaultView: {
          getComputedStyle: () => ({
            transform: 'matrix(1.2, 0.2, -0.2, 1.2, 40, -80)',
            transformOrigin: '75px 218px',
          }),
        },
        body: { append: appendToBody },
      },
    } as unknown as HTMLElement;

    mountCardRemovalEffect(card, effect);

    expect(appendToDeck).toHaveBeenCalledWith(effect);
    expect(appendToBody).not.toHaveBeenCalled();
    expect(effect.style).toMatchObject({
      position: 'absolute',
      left: '425px',
      top: '644px',
      width: '150px',
      height: '218px',
      transform: 'matrix(1.2, 0.2, -0.2, 1.2, 40, -80)',
      transformOrigin: '75px 218px',
    });
  });

  it('falls back to the document body outside the deck', () => {
    const appendToBody = vi.fn();
    const effect = { style: {} } as unknown as HTMLCanvasElement;
    const card = {
      closest: () => null,
      getBoundingClientRect: () => ({
        left: 12,
        top: 24,
        width: 150,
        height: 218,
      }),
      ownerDocument: {
        body: { append: appendToBody },
      },
    } as unknown as HTMLElement;

    mountCardRemovalEffect(card, effect);

    expect(appendToBody).toHaveBeenCalledWith(effect);
    expect(effect.style).toMatchObject({
      position: 'fixed',
      left: '12px',
      top: '24px',
      width: '150px',
      height: '218px',
      transform: 'none',
    });
  });
});
