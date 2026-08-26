import { describe, expect, it, vi } from 'vitest';

import {
  type PageElementTarget,
  pageElementPressDisposition,
  removePageElement,
} from './element-targeting';

vi.mock('../../motion/gsap', () => ({
  gsap: {
    timeline: ({ onComplete }: { onComplete: () => void }) => {
      const timeline = {
        to: () => timeline,
      };
      queueMicrotask(onComplete);
      return timeline;
    },
  },
}));

function fixture(persistentDisplay: 'block' | 'none') {
  let styleConnected = false;
  const style = {
    dataset: {},
    textContent: '',
    remove: () => {
      styleConnected = false;
    },
  };
  const styleHost = {
    append: () => {
      styleConnected = true;
    },
  };
  const element = {
    hidden: false,
    isConnected: true,
    style: {
      opacity: '',
      filter: '',
      clipPath: '',
      willChange: '',
    },
    matches: (selector: string) => selector === '#advertisement',
    ownerDocument: {
      createElement: () => style,
      head: styleHost,
      documentElement: styleHost,
      defaultView: {
        getComputedStyle: () => ({
          display: persistentDisplay,
          visibility: 'visible',
          contentVisibility: 'visible',
        }),
      },
    },
  };
  return {
    element,
    styleConnected: () => styleConnected,
    target: {
      element,
      resolving: true,
    } as unknown as PageElementTarget,
  };
}

describe('immediate page element hiding', () => {
  it('keeps the immediate rule when a cosmetic revision did not take over', async () => {
    const { element, styleConnected, target } = fixture('block');
    const lease = await removePageElement(
      target,
      'example.com###advertisement',
      'https://example.com/article',
      true,
    );

    expect(styleConnected()).toBe(true);
    expect(element.hidden).toBe(true);
    expect(lease.releaseIfCovered()).toBe(false);
    expect(styleConnected()).toBe(true);
    expect(element.hidden).toBe(true);
  });

  it('releases the immediate rule after the cosmetic layer hides the element', async () => {
    const { element, styleConnected, target } = fixture('none');
    const lease = await removePageElement(
      target,
      'example.com###advertisement',
      'https://example.com/article',
      true,
    );

    expect(lease.releaseIfCovered()).toBe(true);
    expect(styleConnected()).toBe(false);
    expect(element.hidden).toBe(false);
  });
});

describe('page element press handling', () => {
  it('ignores empty and hidden targets without ending element selection', () => {
    const hidden = { hidden: true } as HTMLElement;

    expect(pageElementPressDisposition(null, null)).toEqual({ kind: 'ignore' });
    expect(pageElementPressDisposition(hidden, {})).toEqual({
      kind: 'ignore',
    });
  });

  it('separates invalid interaction state from a resolvable target', () => {
    const visible = { hidden: false } as HTMLElement;
    const context = { actionId: 'block-element' };

    expect(pageElementPressDisposition(visible, null)).toEqual({
      kind: 'cancel',
    });
    expect(pageElementPressDisposition(visible, context)).toEqual({
      kind: 'resolve',
      element: visible,
      context,
    });
  });
});
