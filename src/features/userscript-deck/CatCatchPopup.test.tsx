import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CatCatchPopup,
  catCatchPopupBox,
  catCatchPopupOwnsPointerTarget,
  catCatchPopupPageTabId,
  catCatchPopupSource,
} from './CatCatchPopup';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CatCatchPopup', () => {
  it('keeps popup and trigger clicks inside while treating blank space as outside', () => {
    class TestNode {}
    class TestElement extends TestNode {
      constructor(private readonly trigger: boolean) {
        super();
      }

      closest(selector: string) {
        return this.trigger && selector === '.manager-media-resources-trigger'
          ? this
          : null;
      }
    }
    vi.stubGlobal('Node', TestNode);
    vi.stubGlobal('Element', TestElement);

    const popupChild = new TestNode();
    const trigger = new TestElement(true);
    const blank = new TestElement(false);
    const root = {
      contains: (target: unknown) => target === popupChild,
    } as Pick<HTMLElement, 'contains'>;

    expect(
      catCatchPopupOwnsPointerTarget(
        root,
        popupChild as unknown as EventTarget,
      ),
    ).toBe(true);
    expect(
      catCatchPopupOwnsPointerTarget(root, trigger as unknown as EventTarget),
    ).toBe(true);
    expect(
      catCatchPopupOwnsPointerTarget(root, blank as unknown as EventTarget),
    ).toBe(false);
  });

  it('lets the trigger stop pointer events before the outside-close listener', () => {
    const popupSource = readFileSync(
      new URL('./CatCatchPopup.tsx', import.meta.url),
      'utf8',
    );
    const triggerSource = readFileSync(
      new URL('./DeckTrigger.tsx', import.meta.url),
      'utf8',
    );

    expect(popupSource).toContain(
      "pageWindow.addEventListener('pointerdown', handlePointerDown);",
    );
    expect(popupSource).not.toContain(
      "pageWindow.addEventListener('pointerdown', handlePointerDown, true);",
    );
    expect(popupSource).not.toContain('onWheel=');
    expect(popupSource).not.toContain('lockDocumentScroll');
    expect(triggerSource).toContain(
      'onPointerDown={(event) => event.stopPropagation()}',
    );
  });

  it('hosts the upstream popup and passes the page tab into it', () => {
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `chrome-extension://card-master/${path}`,
      },
    });

    const markup = renderToStaticMarkup(
      <CatCatchPopup onClose={() => undefined} tabId={7} />,
    );

    expect(markup).toContain('class="cat-catch-popup-frame"');
    expect(
      readFileSync(
        new URL('./styles/cat-catch-popup.css', import.meta.url),
        'utf8',
      ),
    ).toContain('overflow-y: auto');
    expect(markup).toContain(
      'src="chrome-extension://card-master/popup.html?embedded=1&amp;tabId=7"',
    );
    expect(catCatchPopupSource()).toBe(
      'chrome-extension://card-master/popup.html?embedded=1',
    );
    expect(catCatchPopupPageTabId([{ tabId: 7 }])).toBe(7);
    expect(catCatchPopupPageTabId([])).toBeUndefined();
    expect(markup).toContain('title="顺手牵羊"');
    expect(markup).not.toContain('当前页面');
    expect(markup).not.toContain('媒体控制 / 设置');
  });

  it('keeps the original popup controls in the vendored page', () => {
    const popup = readFileSync(
      new URL('../../../vendor/cat-catch/popup.html', import.meta.url),
      'utf8',
    );

    expect(popup).toContain('id="catch"');
    expect(popup).toContain('id="recorder2"');
    expect(popup).toContain('go="downloader.html"');
    expect(popup).toContain('go="options.html"');
    expect(popup).toContain('js/media-control.js');
  });

  it('keeps the popup fully inside the viewport at the default corner', () => {
    const box = catCatchPopupBox(
      { left: 1180, right: 1220, top: 820, width: 40, height: 40 },
      { width: 1280, height: 900 },
      1600,
    );

    expect(box.left).toBeGreaterThanOrEqual(12);
    expect(box.top).toBeGreaterThanOrEqual(12);
    expect(box.left + box.width).toBeLessThanOrEqual(1268);
    expect(box.top + box.height).toBeLessThanOrEqual(888);
    expect(box.height).toBeLessThanOrEqual(876);
  });

  it('lets the embedded popup grow to content height', () => {
    const frame = readFileSync(
      new URL(
        '../../../vendor/cat-catch/js/card-master-popup-frame.js',
        import.meta.url,
      ),
      'utf8',
    );
    const init = readFileSync(
      new URL('../../../vendor/cat-catch/js/init.js', import.meta.url),
      'utf8',
    );
    const popup = readFileSync(
      new URL('../../../vendor/cat-catch/js/popup.js', import.meta.url),
      'utf8',
    );
    const background = readFileSync(
      new URL('../../../vendor/cat-catch/js/background.js', import.meta.url),
      'utf8',
    );

    expect(frame).toContain("type: 'resize'");
    expect(frame).not.toContain('preventDefault');
    expect(init).toContain('searchParams.get("tabId")');
    expect(popup).toContain('fillPopupMedia');
    expect(popup).toContain('mediaListFromResponse');
    expect(popup).toContain('_embedded');
    expect(popup).toContain('webNavigation?.getAllFrames');
    expect(background).toContain('sender.tab?.id');
  });
});
