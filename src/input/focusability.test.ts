import { describe, expect, it } from 'vitest';

import { visibleInteractionElement } from './focusability';

function element({
  ancestorHidden = false,
  checkVisibility = true,
  display = 'block',
  opacity = '1',
}: {
  ancestorHidden?: boolean;
  checkVisibility?: boolean;
  display?: string;
  opacity?: string;
} = {}) {
  return {
    isConnected: true,
    hidden: false,
    closest: () => (ancestorHidden ? {} : null),
    getAttribute: () => null,
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          display,
          visibility: 'visible',
          contentVisibility: 'visible',
          opacity,
        }),
      },
    },
    checkVisibility: () => checkVisibility,
    getClientRects: () => [{ width: 120, height: 32 }],
  } as unknown as HTMLElement;
}

describe('visibleInteractionElement', () => {
  it('accepts rendered interactive elements', () => {
    expect(visibleInteractionElement(element())).toBe(true);
  });

  it('rejects hidden ancestors, CSS-hidden controls, and invisible layouts', () => {
    expect(visibleInteractionElement(element({ ancestorHidden: true }))).toBe(
      false,
    );
    expect(visibleInteractionElement(element({ display: 'none' }))).toBe(false);
    expect(visibleInteractionElement(element({ opacity: '0' }))).toBe(false);
    expect(visibleInteractionElement(element({ checkVisibility: false }))).toBe(
      false,
    );
  });
});
