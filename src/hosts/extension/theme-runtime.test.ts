import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultPageThemeSettings } from '../../page-theme/domain/types';

const runtime = vi.hoisted(() => ({
  create: vi.fn(),
  detect: vi.fn(),
  publish: vi.fn(),
  remove: vi.fn(),
  stopDetector: vi.fn(),
}));

vi.mock('../../../vendor/darkreader/src/inject/detector', () => ({
  runDarkThemeDetector: runtime.detect,
  stopDarkThemeDetector: runtime.stopDetector,
}));

vi.mock('../../../vendor/darkreader/src/inject/dynamic-theme/index', () => ({
  createOrUpdateDynamicTheme: runtime.create,
  removeDynamicTheme: runtime.remove,
}));

vi.mock('../../../vendor/darkreader/src/generators/css-filter', () => ({
  cssFilterStyleSheetTemplate: vi.fn(() => ''),
  getCSSFilterValue: vi.fn(() => 'none'),
}));

vi.mock('../../../vendor/darkreader/src/generators/detector-hints', () => ({
  getDetectorHintsFor: vi.fn(() => []),
}));

vi.mock('../../../vendor/darkreader/src/generators/dynamic-theme', () => ({
  getDynamicThemeFixesFor: vi.fn(() => null),
}));

vi.mock('../../../vendor/darkreader/src/generators/utils/parse', () => ({
  indexSitesFixesConfig: vi.fn(() => ({})),
}));

vi.mock('../../../vendor/darkreader/src/utils/url', () => ({
  isURLInList: vi.fn(() => false),
}));

vi.mock('./api', () => ({
  extensionApiOrNull: () => ({
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
  }),
  sendExtensionRequest: vi.fn(),
}));

vi.mock('./page-theme-protocol', () => ({
  publishPageThemeSnapshot: runtime.publish,
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('page theme runtime', () => {
  it('uses one overlay animation while the extension surface is open', async () => {
    vi.useFakeTimers();
    let notifyMutation = () => {};
    class TestMutationObserver {
      constructor(callback: MutationCallback) {
        notifyMutation = () => callback([], this as never);
      }

      observe() {}

      disconnect() {}
    }
    vi.stubGlobal('MutationObserver', TestMutationObserver);
    const setProperty = vi.fn();
    const veilListeners = new Map<string, EventListener>();
    const fallback = {
      textContent: 'html { background: #181a1b; }',
    };
    const veil = {
      className: '',
      offsetWidth: 100,
      style: { setProperty },
      addEventListener: vi.fn(
        (type: string, listener: EventListenerOrEventListenerObject) => {
          if (typeof listener === 'function') {
            veilListeners.set(type, listener);
          }
        },
      ),
    };
    const style = {
      className: '',
      textContent: '',
    };
    const shadowAppend = vi.fn();
    const host = {
      id: '',
      remove: vi.fn(),
      setAttribute: vi.fn(),
      attachShadow: vi.fn(() => ({ append: shadowAppend })),
    };
    const root = {
      append: vi.fn(),
      getAttribute: (name: string) =>
        name === 'data-darkreader-mode'
          ? 'dynamic'
          : name === 'data-darkreader-scheme'
            ? 'dark'
            : null,
    };
    let divCount = 0;
    const pageWindow = {
      cancelAnimationFrame: (handle: number) => clearTimeout(handle),
      DarkReader: undefined,
      clearTimeout,
      requestAnimationFrame: (callback: FrameRequestCallback) =>
        setTimeout(() => callback(performance.now()), 16),
      setTimeout,
      top: null as unknown,
    };
    pageWindow.top = pageWindow;
    vi.stubGlobal('window', pageWindow);
    vi.stubGlobal('location', { href: 'https://example.com/' });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('document', {
      documentElement: root,
      visibilityState: 'visible',
      createElement: (tagName: string) => {
        if (tagName === 'style') return style;
        divCount += 1;
        return divCount === 1 ? host : veil;
      },
      getElementById: (id: string) => {
        if (id === 'card-master-heavy-host') return {};
        return null;
      },
      querySelector: (selector: string) =>
        selector === '.darkreader--fallback' ? fallback : null,
      querySelectorAll: () => [],
    });

    const { applyPageThemeSettings } = await import('./theme-runtime');
    const settings = defaultPageThemeSettings();
    settings.enabled = true;
    settings.enabledByDefault = true;
    settings.revision = 1;
    applyPageThemeSettings(settings, 1_000);

    await vi.advanceTimersByTimeAsync(179);
    expect(root.append).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(root.append).toHaveBeenCalledWith(host);
    expect(shadowAppend).toHaveBeenCalledWith(style, veil);
    expect(style.textContent).toContain(
      'animation: card-master-theme-veil-enter 202ms',
    );
    expect(runtime.create).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(202);
    veilListeners.get('animationend')?.(new Event('animationend'));
    await Promise.resolve();
    expect(runtime.create).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(host.remove).not.toHaveBeenCalled();

    fallback.textContent = '';
    notifyMutation();
    await vi.advanceTimersByTimeAsync(16);
    await vi.advanceTimersByTimeAsync(358);
    expect(host.remove).toHaveBeenCalled();
  });

  it('crossfades one page snapshot when the document is safe', async () => {
    vi.useFakeTimers();
    let resolveFinished!: () => void;
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    const transition = {
      finished,
      skipTransition: vi.fn(),
    };
    const style = {
      id: '',
      media: '',
      textContent: '',
      remove: vi.fn(),
    };
    let mountedStyle: typeof style | null = null;
    const append = vi.fn((node: typeof style) => {
      mountedStyle = node;
    });
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      return transition;
    });
    const root = {
      getAttribute: (name: string) =>
        name === 'data-darkreader-mode'
          ? 'dynamic'
          : name === 'data-darkreader-scheme'
            ? 'dark'
            : null,
    };
    const pageWindow = {
      DarkReader: undefined,
      clearTimeout,
      setTimeout,
      top: null as unknown,
    };
    pageWindow.top = pageWindow;
    vi.stubGlobal('window', pageWindow);
    vi.stubGlobal('location', { href: 'https://example.com/' });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('document', {
      documentElement: root,
      head: { append },
      visibilityState: 'visible',
      startViewTransition,
      createElement: () => style,
      getElementById: (id: string) =>
        id === 'card-master-page-theme-view-transition' ? mountedStyle : null,
      querySelector: () => null,
      querySelectorAll: () => [],
    });

    const { applyPageThemeSettings } = await import('./theme-runtime');
    const settings = defaultPageThemeSettings();
    settings.enabled = true;
    settings.enabledByDefault = true;
    settings.revision = 1;
    applyPageThemeSettings(settings, 1_000);

    await vi.advanceTimersByTimeAsync(180);
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(runtime.create).toHaveBeenCalledOnce();
    expect(style.textContent).toContain('::view-transition-old(root)');
    resolveFinished();
    await finished;
    await Promise.resolve();
    expect(style.remove).toHaveBeenCalled();
  });

  it('reapplies immediately after a global stop without waiting for a negative detector callback', async () => {
    const pageWindow = {
      DarkReader: undefined,
      clearTimeout,
      setTimeout,
      top: null as unknown,
    };
    pageWindow.top = pageWindow;
    vi.stubGlobal('window', pageWindow);
    vi.stubGlobal('location', { href: 'https://example.com/' });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('document', {
      documentElement: {
        getAttribute: (name: string) =>
          name === 'data-darkreader-mode'
            ? 'dynamic'
            : name === 'data-darkreader-scheme'
              ? 'dark'
              : null,
      },
      getElementById: () => null,
      querySelector: () => null,
    });

    const { applyPageThemeSettings } = await import('./theme-runtime');
    const enabled = defaultPageThemeSettings();
    enabled.enabled = true;
    enabled.enabledByDefault = true;
    enabled.revision = 1;
    applyPageThemeSettings(enabled);
    await Promise.resolve();

    expect(runtime.create).toHaveBeenCalledOnce();
    expect(runtime.remove).not.toHaveBeenCalled();
    expect(runtime.detect).toHaveBeenCalledOnce();
    expect(runtime.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        revision: 1,
        status: 'ready',
        activeOnPage: true,
        inactiveReason: null,
      }),
    );

    applyPageThemeSettings({
      ...enabled,
      revision: 2,
    });
    await Promise.resolve();
    expect(runtime.create).toHaveBeenCalledTimes(2);
    expect(runtime.remove).not.toHaveBeenCalled();

    applyPageThemeSettings({
      ...enabled,
      revision: 3,
      enabled: false,
    });
    expect(runtime.remove).toHaveBeenCalledOnce();
    expect(runtime.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        revision: 3,
        status: 'ready',
        activeOnPage: false,
        inactiveReason: 'global-disabled',
      }),
    );

    applyPageThemeSettings({
      ...enabled,
      revision: 4,
      enabled: true,
    });
    await Promise.resolve();
    expect(runtime.create).toHaveBeenCalledTimes(3);
    expect(runtime.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({
        revision: 4,
        status: 'ready',
        activeOnPage: true,
        inactiveReason: null,
      }),
    );
  });
});
