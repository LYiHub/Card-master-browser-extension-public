import { describe, expect, it, vi } from 'vitest';
import { reportExtensionFailure } from './diagnostics';
import {
  FULLSCREEN_ENTRY_ATTRIBUTE,
  FULLSCREEN_ENTRY_STYLES,
  installFullscreenEntryVisibility,
} from './fullscreen-entry';

vi.mock('./diagnostics', () => ({ reportExtensionFailure: vi.fn() }));

function page() {
  const window = new EventTarget();
  const backdrop = { textContent: '', remove: vi.fn() };
  const document = Object.assign(new EventTarget(), {
    fullscreenElement: null as Element | null,
    webkitFullscreenElement: null as Element | null,
    defaultView: window,
    createElement: vi.fn(() => backdrop),
    documentElement: { append: vi.fn() },
  });
  const attributes = new Map<string, string>();
  let popoverOpen = false;
  const host = {
    id: 'card-master-test-host',
    hidden: false,
    toggleAttribute(name: string, force: boolean) {
      if (force) attributes.set(name, '');
      else attributes.delete(name);
      return force;
    },
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    hasAttribute: (name: string) => attributes.has(name),
    getAttribute: (name: string) => attributes.get(name),
    removeAttribute(name: string) {
      attributes.delete(name);
      if (name === 'popover') popoverOpen = false;
    },
    matches: vi.fn(() => popoverOpen),
    showPopover: vi.fn(() => {
      popoverOpen = true;
    }),
    hidePopover: vi.fn(() => {
      popoverOpen = false;
    }),
  };
  const start = () =>
    installFullscreenEntryVisibility(
      document as unknown as Document,
      host as unknown as HTMLElement,
    );
  return {
    document,
    window,
    host,
    backdrop,
    start,
    active: () => attributes.has(FULLSCREEN_ENTRY_ATTRIBUTE),
    inTopLayer: () => popoverOpen,
  };
}

describe('player fullscreen entry visibility', () => {
  it('does not hide entries for browser-window resize or fullscreen events', () => {
    const state = page();
    const stop = state.start();
    state.window.dispatchEvent(new Event('resize'));
    state.window.dispatchEvent(new Event('fullscreenchange'));
    state.document.dispatchEvent(new Event('fullscreenchange'));
    expect(state.active()).toBe(false);
    expect(state.host.showPopover).not.toHaveBeenCalled();
    expect(state.host.hasAttribute('popover')).toBe(false);
    stop();
  });

  it.each([
    ['fullscreenElement', 'fullscreenchange'],
    ['webkitFullscreenElement', 'webkitfullscreenchange'],
  ] as const)('elevates the entry host above %s and restores it on exit', (key, event) => {
    const state = page();
    const stop = state.start();
    state.document[key] = { tagName: 'VIDEO' } as Element;
    state.document.dispatchEvent(new Event(event));
    expect(state.active()).toBe(true);
    expect(state.inTopLayer()).toBe(true);
    expect(state.host.getAttribute('popover')).toBe('manual');
    state.document[key] = null;
    state.document.dispatchEvent(new Event(event));
    expect(state.active()).toBe(false);
    expect(state.inTopLayer()).toBe(false);
    expect(state.host.hasAttribute('popover')).toBe(false);
    stop();
  });

  it('supports mounting while a cross-origin iframe player is already fullscreen', () => {
    const state = page();
    state.document.fullscreenElement = { tagName: 'IFRAME' } as Element;
    const stop = state.start();
    expect(state.inTopLayer()).toBe(true);
    expect(state.host.showPopover).toHaveBeenCalledTimes(1);
    stop();
  });

  it('reorders above a new fullscreen element without repeating work for duplicate events', () => {
    const state = page();
    state.document.fullscreenElement = {} as Element;
    const stop = state.start();
    state.document.dispatchEvent(new Event('fullscreenchange'));
    expect(state.host.showPopover).toHaveBeenCalledTimes(1);
    state.document.fullscreenElement = {} as Element;
    state.document.dispatchEvent(new Event('fullscreenchange'));
    expect(state.host.hidePopover).toHaveBeenCalledTimes(1);
    expect(state.host.showPopover).toHaveBeenCalledTimes(2);
    stop();
  });

  it('preserves the existing user-hidden choice through player fullscreen', () => {
    const state = page();
    state.host.hidden = true;
    const stop = state.start();
    state.document.fullscreenElement = {} as Element;
    state.document.dispatchEvent(new Event('fullscreenchange'));
    state.document.fullscreenElement = null;
    state.document.dispatchEvent(new Event('fullscreenchange'));
    expect(state.host.hidden).toBe(true);
    stop();
  });

  it('restores a dismissed top-layer entry when the fullscreen page is restored', () => {
    const state = page();
    state.document.fullscreenElement = {} as Element;
    const stop = state.start();
    state.host.hidePopover();
    state.window.dispatchEvent(new Event('pageshow'));
    expect(state.inTopLayer()).toBe(true);
    stop();
  });

  it('keeps the player clickable with a transparent host-scoped backdrop', () => {
    const state = page();
    const stop = state.start();
    expect(state.document.documentElement.append).toHaveBeenCalledWith(
      state.backdrop,
    );
    expect(state.backdrop.textContent).toBe(
      '#card-master-test-host::backdrop{background:transparent!important;pointer-events:none!important;}',
    );
    const topLayer = FULLSCREEN_ENTRY_STYLES.match(
      /:host\(\[popover\]\)\s*\{([^}]+)\}/,
    )?.[1];
    expect(topLayer).toContain('pointer-events: none');
    expect(topLayer).toContain('background: transparent');
    expect(topLayer).toContain('padding: 0');
    expect(topLayer).toContain('margin: 0');
    expect(FULLSCREEN_ENTRY_STYLES).toContain(
      ':not([data-fullscreen-auto-hide="false"])',
    );
    stop();
  });

  it('removes the popover attribute after an API failure so normal entry display can recover', () => {
    const state = page();
    state.document.fullscreenElement = {} as Element;
    const error = new Error('popover unavailable');
    state.host.showPopover.mockImplementationOnce(() => {
      throw error;
    });
    const stop = state.start();
    expect(state.host.hasAttribute('popover')).toBe(false);
    expect(reportExtensionFailure).toHaveBeenCalledWith(
      'fullscreen-entry',
      'top-layer-open-failed',
      error,
    );
    stop();
  });

  it('cleans up listeners, fullscreen flags and the open top layer on disposal', () => {
    const state = page();
    state.document.fullscreenElement = {} as Element;
    const removeDocument = vi.spyOn(state.document, 'removeEventListener');
    const removeWindow = vi.spyOn(state.window, 'removeEventListener');
    const stop = state.start();
    stop();
    expect(state.active()).toBe(false);
    expect(state.inTopLayer()).toBe(false);
    expect(state.backdrop.remove).toHaveBeenCalledOnce();
    expect(removeDocument).toHaveBeenCalledTimes(2);
    expect(removeWindow).toHaveBeenCalledTimes(1);
    state.document.dispatchEvent(new Event('fullscreenchange'));
    expect(state.active()).toBe(false);
  });
});
