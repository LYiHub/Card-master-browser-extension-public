import { describe, expect, it, vi } from 'vitest';

import {
  gamepadScrollAxisHasCapacity,
  scrollPageByGamepadDelta,
} from './gamepad-scroll';

describe('gamepad scroll targeting', () => {
  it('requires overflow and remaining space in the requested direction', () => {
    expect(
      gamepadScrollAxisHasCapacity(
        { position: 0, clientSize: 600, scrollSize: 1_800 },
        40,
      ),
    ).toBe(true);
    expect(
      gamepadScrollAxisHasCapacity(
        { position: 1_200, clientSize: 600, scrollSize: 1_800 },
        40,
      ),
    ).toBe(false);
    expect(
      gamepadScrollAxisHasCapacity(
        { position: 1_200, clientSize: 600, scrollSize: 1_800 },
        -40,
      ),
    ).toBe(true);
    expect(
      gamepadScrollAxisHasCapacity(
        { position: 0, clientSize: 600, scrollSize: 600 },
        40,
      ),
    ).toBe(false);
  });

  it('uses the page viewport for root scrolling', () => {
    const scrollBy = vi.fn();
    const root = {
      clientHeight: 600,
      clientWidth: 900,
      scrollHeight: 1_800,
      scrollLeft: 0,
      scrollTop: 100,
      scrollWidth: 900,
    };
    const pageDocument = {
      body: null,
      defaultView: {
        innerHeight: 600,
        innerWidth: 900,
        scrollBy,
        scrollX: 0,
        scrollY: 100,
      },
      documentElement: root,
      scrollingElement: root,
    } as unknown as Document;

    expect(scrollPageByGamepadDelta(pageDocument, null, 0, 48)).toBe(true);
    expect(scrollBy).toHaveBeenCalledWith({
      left: 0,
      top: 48,
      behavior: 'instant',
    });
  });

  it('uses immediate scrolling for nested elements', () => {
    const scrollBy = vi.fn();
    const pageDocument = {
      body: null,
      defaultView: {
        getComputedStyle: () => ({
          overflowX: 'hidden',
          overflowY: 'auto',
        }),
      },
      documentElement: {},
      scrollingElement: {},
    } as unknown as Document;
    const target = {
      clientHeight: 200,
      clientWidth: 300,
      getRootNode: () => pageDocument,
      ownerDocument: pageDocument,
      parentElement: null,
      scrollBy,
      scrollHeight: 800,
      scrollLeft: 0,
      scrollTop: 100,
      scrollWidth: 300,
    } as unknown as Element;

    expect(scrollPageByGamepadDelta(pageDocument, target, 0, 32)).toBe(true);
    expect(scrollBy).toHaveBeenCalledWith({
      left: 0,
      top: 32,
      behavior: 'instant',
    });
  });
});
