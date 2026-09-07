import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  gamepadScopeUsesSemanticIntents,
  INPUT_SCOPE_PRIORITY,
  InputCoordinator,
  type InputScope,
  routeInputIntent,
  selectInputScope,
} from './coordinator';
import type { IntentEnvelope } from './intents';

function keyboardHarness(rootType: 'document' | 'shadow' = 'shadow') {
  class FakeElement {
    dataset: Record<string, string> = {};
    isContentEditable = false;
    constructor(private readonly editable = false) {}
    closest(selector: string) {
      return (this.editable || this.isContentEditable) &&
        selector.includes('textarea')
        ? this
        : null;
    }
  }
  class FakeTextArea extends FakeElement {
    constructor() {
      super(true);
    }
  }
  class FakeInput extends FakeElement {
    constructor(public type = 'text') {
      super(true);
    }
  }
  class FakeSelect extends FakeElement {
    constructor() {
      super(true);
    }
  }
  class FakeDocument extends EventTarget {
    activeElement: FakeElement | null = null;
    documentElement = new FakeElement();
    defaultView = Object.assign(new EventTarget(), {
      cancelAnimationFrame: vi.fn(),
    });
  }
  class FakeShadowRoot extends EventTarget {
    activeElement: FakeElement | null = null;
    host = new FakeElement();
    constructor(public ownerDocument: FakeDocument) {
      super();
    }
  }
  vi.stubGlobal('Element', FakeElement);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLTextAreaElement', FakeTextArea);
  vi.stubGlobal('HTMLInputElement', FakeInput);
  vi.stubGlobal('HTMLSelectElement', FakeSelect);
  vi.stubGlobal('Document', FakeDocument);
  vi.stubGlobal('ShadowRoot', FakeShadowRoot);

  const document = new FakeDocument();
  const root = rootType === 'shadow' ? new FakeShadowRoot(document) : document;
  const coordinator = new InputCoordinator(document as unknown as Document);
  const handle = vi.fn(() => true);
  coordinator.register(root as unknown as Document | ShadowRoot, {
    id: 'keyboard-test',
    priority: INPUT_SCOPE_PRIORITY.dialog,
    handle,
  });
  onTestFinished(() => {
    coordinator.dispose();
    vi.unstubAllGlobals();
  });

  return {
    coordinator,
    handle,
    elements: {
      textarea: new FakeTextArea(),
      input: new FakeInput(),
      range: new FakeInput('range'),
      select: new FakeSelect(),
      contenteditable: Object.assign(new FakeElement(), {
        isContentEditable: true,
      }),
      card: new FakeElement(),
    },
    focus(element: FakeElement | null) {
      root.activeElement = element;
      document.activeElement =
        root instanceof FakeShadowRoot ? root.host : element;
    },
    press(key: string, overrides: Partial<KeyboardEvent> = {}) {
      const event = new Event('keydown', { cancelable: true });
      for (const [name, value] of Object.entries({
        key,
        code: key,
        isTrusted: true,
        isComposing: false,
        repeat: false,
        ...overrides,
      })) {
        Object.defineProperty(event, name, { value });
      }
      // Model the same event reaching window, document, then a closed root.
      let path = [
        root instanceof FakeShadowRoot ? root.host : root.activeElement,
        document,
      ];
      event.composedPath = () => path as unknown as EventTarget[];
      document.defaultView.dispatchEvent(event);
      document.dispatchEvent(event);
      if (root instanceof FakeShadowRoot) {
        path = [root.activeElement, document];
        root.dispatchEvent(event);
      }
      return event;
    },
  };
}

describe('input coordinator keyboard events', () => {
  it('leaves editing keys in focused controls behind a closed shadow host', () => {
    const test = keyboardHarness();
    for (const name of [
      'textarea',
      'input',
      'range',
      'select',
      'contenteditable',
    ] as const) {
      test.focus(test.elements[name]);
      for (const key of [
        'Enter',
        ' ',
        'ArrowDown',
        'ArrowLeft',
        'PageUp',
        'm',
      ]) {
        expect(test.press(key).defaultPrevented, `${name}: ${key}`).toBe(false);
      }
    }
    expect(test.handle).not.toHaveBeenCalled();
  });

  it.each([
    'document',
    'shadow',
  ] as const)('closes only the top Escape layer while editing in a %s root', (rootType) => {
    const test = keyboardHarness(rootType);
    test.focus(test.elements.textarea);
    const closeDeck = vi.fn();
    const closeDialog = vi.fn();
    let dialogActive = true;
    test.coordinator.registerEscapeLayer({
      id: 'deck',
      priority: INPUT_SCOPE_PRIORITY.deck,
      onEscape: closeDeck,
    });
    test.coordinator.registerEscapeLayer({
      id: 'dialog',
      priority: INPUT_SCOPE_PRIORITY.dialog,
      active: () => dialogActive,
      onEscape: () => {
        dialogActive = false;
        closeDialog();
      },
    });

    expect(test.press('Escape').defaultPrevented).toBe(true);
    expect(closeDialog).toHaveBeenCalledOnce();
    expect(closeDeck).not.toHaveBeenCalled();
    expect(test.press('Escape').defaultPrevented).toBe(true);
    expect(closeDialog).toHaveBeenCalledOnce();
    expect(closeDeck).toHaveBeenCalledOnce();
    expect(test.handle).not.toHaveBeenCalled();
  });

  it('ignores composing, repeated, and untrusted Escape events', () => {
    const test = keyboardHarness();
    test.focus(test.elements.textarea);
    const close = vi.fn();
    test.coordinator.registerEscapeLayer({
      id: 'dialog',
      priority: INPUT_SCOPE_PRIORITY.dialog,
      onEscape: close,
    });
    for (const options of [
      { isComposing: true },
      { repeat: true },
      { isTrusted: false },
    ]) {
      expect(test.press('Escape', options).defaultPrevented).toBe(false);
    }
    expect(test.press('Enter', { isComposing: true }).defaultPrevented).toBe(
      false,
    );
    expect(close).not.toHaveBeenCalled();
    expect(test.handle).not.toHaveBeenCalled();
  });

  it('retains the back intent when an editable scope has no Escape layer', () => {
    const test = keyboardHarness();
    test.focus(test.elements.input);
    expect(test.press('Escape').defaultPrevented).toBe(true);
    expect(test.handle).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ intent: { type: 'back' } }),
    );
  });

  it('routes navigation once after focus leaves the editable control', () => {
    const test = keyboardHarness();
    test.focus(test.elements.textarea);
    expect(test.press('ArrowDown').defaultPrevented).toBe(false);
    test.focus(test.elements.card);
    expect(test.press('ArrowDown').defaultPrevented).toBe(true);
    expect(test.handle).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        intent: { type: 'navigate', direction: 'down', control: 'keyboard' },
      }),
    );
    test.handle.mockClear();
    expect(test.press('Enter', { isTrusted: false }).defaultPrevented).toBe(
      false,
    );
    expect(test.press('Enter').defaultPrevented).toBe(true);
    expect(test.handle).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ intent: { type: 'confirm' } }),
    );
  });
});

function gamepadIntent(
  type: 'browserTabPrevious' | 'browserTabNext' | 'confirm',
): IntentEnvelope {
  return {
    intent: { type },
    source: 'gamepad',
    deviceId: 'controller',
    phase: 'pressed',
    timestamp: 1,
  };
}

describe('input coordinator routing', () => {
  it('places expanded workspace views above their workspace but below dialogs', () => {
    expect(INPUT_SCOPE_PRIORITY.expandedView).toBeGreaterThan(
      INPUT_SCOPE_PRIORITY.workspace,
    );
    expect(INPUT_SCOPE_PRIORITY.expandedView).toBeLessThan(
      INPUT_SCOPE_PRIORITY.dialog,
    );

    const workspace: InputScope = {
      id: 'workspace',
      priority: INPUT_SCOPE_PRIORITY.workspace,
      handle: () => true,
    };
    const expandedView: InputScope = {
      id: 'expanded-view',
      priority: INPUT_SCOPE_PRIORITY.expandedView,
      handle: () => true,
    };
    const dialog: InputScope = {
      id: 'dialog',
      priority: INPUT_SCOPE_PRIORITY.dialog,
      handle: () => true,
    };

    expect(selectInputScope([workspace, expandedView], 'keyboard')).toBe(
      expandedView,
    );
    expect(
      selectInputScope([workspace, expandedView, dialog], 'keyboard'),
    ).toBe(dialog);
  });

  it('selects the highest scope that accepts the current input modality', () => {
    const deck: InputScope = {
      id: 'deck',
      priority: 500,
      handle: () => true,
    };
    const gamepadInspection: InputScope = {
      id: 'gamepad-inspection',
      priority: 2_000,
      modalities: ['gamepad'],
      handle: () => true,
    };
    const scopes = [deck, gamepadInspection];

    expect(selectInputScope(scopes, 'gamepad')).toBe(gamepadInspection);
    expect(selectInputScope(scopes, 'keyboard')).toBe(deck);
    expect(selectInputScope(scopes, 'pointer')).toBe(deck);
  });

  it('falls through a closing scope to the next active owner', () => {
    const deck: InputScope = {
      id: 'deck',
      priority: INPUT_SCOPE_PRIORITY.deck,
      handle: () => true,
    };
    const dialog: InputScope = {
      id: 'dialog',
      priority: INPUT_SCOPE_PRIORITY.dialog,
      active: () => false,
      handle: () => true,
    };

    expect(selectInputScope([deck, dialog], 'keyboard')).toBe(deck);
  });

  it('does not translate snapshots owned by an exclusive scope', () => {
    expect(gamepadScopeUsesSemanticIntents({ exclusive: true })).toBe(false);
    expect(gamepadScopeUsesSemanticIntents({ exclusive: false })).toBe(true);
    expect(gamepadScopeUsesSemanticIntents({})).toBe(true);
  });

  it('lets an exclusive scope consume L2 and R2 before browser tab fallback', () => {
    const handle = vi.fn(() => false);
    const switchBrowserTab = vi.fn();

    expect(
      routeInputIntent(
        gamepadIntent('browserTabPrevious'),
        { exclusive: true, handle },
        switchBrowserTab,
      ),
    ).toBe(true);
    expect(
      routeInputIntent(
        gamepadIntent('browserTabNext'),
        { exclusive: true, handle },
        switchBrowserTab,
      ),
    ).toBe(true);
    expect(handle).toHaveBeenCalledTimes(2);
    expect(switchBrowserTab).not.toHaveBeenCalled();
  });

  it('preserves browser tab fallback when the active scope declines the intent', () => {
    const handle = vi.fn(() => false);
    const switchBrowserTab = vi.fn();

    expect(
      routeInputIntent(
        gamepadIntent('browserTabPrevious'),
        { handle },
        switchBrowserTab,
      ),
    ).toBe(true);
    expect(
      routeInputIntent(
        gamepadIntent('browserTabNext'),
        { handle },
        switchBrowserTab,
      ),
    ).toBe(true);
    expect(switchBrowserTab.mock.calls).toEqual([['previous'], ['next']]);
  });

  it('returns the active scope result for ordinary intents', () => {
    const switchBrowserTab = vi.fn();

    expect(
      routeInputIntent(
        gamepadIntent('confirm'),
        { handle: () => true },
        switchBrowserTab,
      ),
    ).toBe(true);
    expect(
      routeInputIntent(
        gamepadIntent('confirm'),
        { handle: () => false },
        switchBrowserTab,
      ),
    ).toBe(false);
    expect(switchBrowserTab).not.toHaveBeenCalled();
  });
});
