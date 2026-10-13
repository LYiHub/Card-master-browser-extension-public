import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@adguard/extended-css', () => {
  return {
    ExtendedCss: vi.fn().mockImplementation(() => ({
      apply: vi.fn(),
      dispose: vi.fn(),
    })),
  };
});

describe('adguard-cosmetic-layer', () => {
  let doc: Document;

  beforeEach(() => {
    vi.resetModules();
    const elements: HTMLElement[] = [];
    doc = {
      head: {
        append: vi.fn((node: HTMLElement) => elements.push(node)),
      },
      documentElement: {
        append: vi.fn((node: HTMLElement) => elements.push(node)),
      },
      createElement: vi.fn((tagName: string) => {
        const attributes = new Map<string, string>();
        const element = {
          tagName: tagName.toUpperCase(),
          dataset: {} as DOMStringMap,
          sheet: {
            insertRule: vi.fn(),
          },
          setAttribute: vi.fn((name: string, value: string) => {
            attributes.set(name, value);
          }),
          getAttribute: vi.fn((name: string) => attributes.get(name) ?? null),
          remove: vi.fn(),
        } as unknown as HTMLElement;
        return element;
      }),
    } as unknown as Document;
    globalThis.document = doc;
  });

  it('injects native style rules for cosmetic data', async () => {
    const { applyAdguardCosmeticData } = await import(
      './adguard-cosmetic-layer'
    );
    applyAdguardCosmeticData({
      isAppStarted: true,
      extCssRules: null,
      nativeCssSelectors: ['.ad-banner', '#sponsor-box'],
    });

    expect(doc.createElement).toHaveBeenCalledWith('style');
    expect(doc.head.append).toHaveBeenCalled();
  });

  it('tolerates elements with undefined dataset without throwing', async () => {
    (
      doc.createElement as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((tagName: string) => {
      const attributes = new Map<string, string>();
      return {
        tagName: tagName.toUpperCase(),
        dataset: undefined,
        sheet: {
          insertRule: vi.fn(),
        },
        setAttribute: vi.fn((name: string, value: string) => {
          attributes.set(name, value);
        }),
        getAttribute: vi.fn((name: string) => attributes.get(name) ?? null),
        remove: vi.fn(),
      } as unknown as HTMLElement;
    });

    const { applyAdguardCosmeticData } = await import(
      './adguard-cosmetic-layer'
    );
    expect(() => {
      applyAdguardCosmeticData({
        isAppStarted: true,
        extCssRules: null,
        nativeCssSelectors: ['.ad-banner'],
      });
    }).not.toThrow();
  });

  it('removes cosmetic elements on dispose', async () => {
    const { applyAdguardCosmeticData, disposeAdguardCosmeticLayer } =
      await import('./adguard-cosmetic-layer');
    applyAdguardCosmeticData({
      isAppStarted: true,
      extCssRules: null,
      nativeCssSelectors: ['.ad-banner'],
    });

    expect(() => disposeAdguardCosmeticLayer()).not.toThrow();
  });
});
