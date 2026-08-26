import { afterEach, describe, expect, it, vi } from 'vitest';

import { keyboardIntent } from './intents';

function keyEvent(
  key: string,
  options: {
    altKey?: boolean;
    code?: string;
    ctrlKey?: boolean;
    defaultPrevented?: boolean;
    metaKey?: boolean;
    repeat?: boolean;
    target?: Element;
  } = {},
) {
  return {
    altKey: false,
    code: options.code ?? key,
    composedPath: () => (options.target ? [options.target] : []),
    ctrlKey: false,
    defaultPrevented: false,
    key,
    metaKey: false,
    repeat: false,
    ...options,
  } as unknown as KeyboardEvent;
}

afterEach(() => vi.unstubAllGlobals());

describe('keyboardIntent', () => {
  it('normalizes navigation, confirmation, back, and audio shortcuts', () => {
    expect(keyboardIntent(keyEvent('ArrowUp'))).toEqual({
      type: 'navigate',
      direction: 'up',
      control: 'keyboard',
    });
    expect(keyboardIntent(keyEvent(' ', { code: 'Space' }))).toEqual({
      type: 'confirm',
    });
    expect(keyboardIntent(keyEvent('Escape'))).toEqual({ type: 'back' });
    expect(keyboardIntent(keyEvent('m'))).toEqual({ type: 'toggleAudio' });
  });

  it('keeps modifier combinations separate from extension navigation', () => {
    expect(keyboardIntent(keyEvent('ArrowLeft', { ctrlKey: true }))).toBeNull();
    expect(keyboardIntent(keyEvent('PageUp', { ctrlKey: true }))).toEqual({
      type: 'contextPrevious',
    });
    expect(keyboardIntent(keyEvent('PageDown', { ctrlKey: true }))).toEqual({
      type: 'contextNext',
    });
  });

  it('preserves native paging shortcuts inside editable controls', () => {
    class EditableElement {
      closest(selector: string) {
        return selector.includes('textarea') ? this : null;
      }
    }
    vi.stubGlobal('Element', EditableElement);
    const target = new EditableElement() as unknown as Element;

    expect(keyboardIntent(keyEvent('PageUp', { target }))).toBeNull();
    expect(
      keyboardIntent(keyEvent('PageDown', { ctrlKey: true, target })),
    ).toBeNull();
    expect(keyboardIntent(keyEvent('Escape', { target }))).toEqual({
      type: 'back',
    });
  });

  it('does not repeat Escape while the same physical key remains held', () => {
    expect(keyboardIntent(keyEvent('Escape', { repeat: true }))).toBeNull();
  });

  it('keeps active extension shortcuts routable after a page prevents defaults', () => {
    expect(
      keyboardIntent(keyEvent('ArrowUp', { defaultPrevented: true })),
    ).toEqual({
      type: 'navigate',
      direction: 'up',
      control: 'keyboard',
    });
    expect(
      keyboardIntent(keyEvent('Escape', { defaultPrevented: true })),
    ).toEqual({ type: 'back' });
  });
});
