import { describe, expect, it, vi } from 'vitest';

import { EscapeLayerStack } from './escape-layer';

function escapeEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    key: 'Escape',
    repeat: false,
    isComposing: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    ...overrides,
  };
}

describe('Escape layer ownership', () => {
  it('only closes the highest-priority visible layer and consumes the event', () => {
    const stack = new EscapeLayerStack();
    const closeDeck = vi.fn();
    const closeDialog = vi.fn();
    const removeDeck = stack.register({
      id: 'deck',
      priority: 500,
      onEscape: closeDeck,
    });
    const removeDialog = stack.register({
      id: 'dialog',
      priority: 1_000,
      onEscape: closeDialog,
    });
    const event = escapeEvent();

    expect(stack.handle(event as KeyboardEvent)).toBe(true);

    expect(closeDialog).toHaveBeenCalledOnce();
    expect(closeDeck).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();

    removeDialog();
    removeDeck();
  });

  it('closes one same-priority layer per distinct Escape press', () => {
    const stack = new EscapeLayerStack();
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    const removeFirst = stack.register({
      id: 'first-dialog',
      priority: 1_000,
      onEscape: closeFirst,
    });
    const removeSecond = stack.register({
      id: 'second-dialog',
      priority: 1_000,
      onEscape: closeSecond,
    });

    stack.handle(escapeEvent() as KeyboardEvent);
    expect(closeSecond).toHaveBeenCalledOnce();
    expect(closeFirst).not.toHaveBeenCalled();

    removeSecond();
    stack.handle(escapeEvent() as KeyboardEvent);
    expect(closeFirst).toHaveBeenCalledOnce();

    removeFirst();
    expect(stack.handle(escapeEvent() as KeyboardEvent)).toBe(false);
  });

  it('routes the next Escape past a layer that has started closing', () => {
    const stack = new EscapeLayerStack();
    let dialogActive = true;
    const closeDeck = vi.fn();
    const closeDialog = vi.fn(() => {
      dialogActive = false;
    });
    stack.register({
      id: 'deck',
      priority: 500,
      onEscape: closeDeck,
    });
    stack.register({
      id: 'dialog',
      priority: 1_000,
      active: () => dialogActive,
      onEscape: closeDialog,
    });

    expect(stack.handle(escapeEvent() as KeyboardEvent)).toBe(true);
    expect(closeDialog).toHaveBeenCalledOnce();
    expect(closeDeck).not.toHaveBeenCalled();

    expect(stack.handle(escapeEvent() as KeyboardEvent)).toBe(true);
    expect(closeDeck).toHaveBeenCalledOnce();
  });

  it('ignores Escape repeats and IME composition cancellation', () => {
    const stack = new EscapeLayerStack();
    const close = vi.fn();
    const remove = stack.register({
      id: 'dialog',
      priority: 1_000,
      onEscape: close,
    });

    expect(stack.handle(escapeEvent({ repeat: true }) as KeyboardEvent)).toBe(
      false,
    );
    expect(
      stack.handle(escapeEvent({ isComposing: true }) as KeyboardEvent),
    ).toBe(false);

    expect(close).not.toHaveBeenCalled();
    remove();
  });
});
