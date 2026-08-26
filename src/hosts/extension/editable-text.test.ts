import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createEditableTextComposition,
  type EditableTextTarget,
} from './editable-text';

class TestInputEvent extends Event {
  readonly data: string | null;
  readonly inputType: string;
  readonly isComposing: boolean;

  constructor(type: string, init: InputEventInit = {}) {
    super(type, init);
    this.data = init.data ?? null;
    this.inputType = init.inputType ?? '';
    this.isComposing = init.isComposing ?? false;
  }
}

class TestCompositionEvent extends Event {
  readonly data: string;

  constructor(type: string, init: CompositionEventInit = {}) {
    super(type, init);
    this.data = init.data ?? '';
  }
}

class TestInputElement extends EventTarget {
  private currentValue = '';
  isConnected = true;
  selectionStart = 0;
  selectionEnd = 0;
  readonly type = 'text';
  readonly focus = vi.fn();

  get value() {
    return this.currentValue;
  }

  set value(value: string) {
    this.currentValue = value;
  }

  setSelectionRange(start: number, end: number) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

class TestTextAreaElement extends TestInputElement {}

function input(value: string, start: number, end: number) {
  const target = new TestInputElement();
  target.value = value;
  target.setSelectionRange(start, end);
  return target as unknown as EditableTextTarget;
}

beforeEach(() => {
  vi.stubGlobal('HTMLInputElement', TestInputElement);
  vi.stubGlobal('HTMLTextAreaElement', TestTextAreaElement);
  vi.stubGlobal('InputEvent', TestInputEvent);
  vi.stubGlobal('CompositionEvent', TestCompositionEvent);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editable text speech composition', () => {
  it('replaces cumulative interim text instead of appending it', () => {
    const target = input('搜索旧词', 2, 4) as unknown as TestInputElement;
    const events: string[] = [];
    for (const type of [
      'compositionstart',
      'compositionupdate',
      'input',
      'compositionend',
    ]) {
      target.addEventListener(type, () => events.push(type));
    }
    const composition = createEditableTextComposition(
      target as unknown as EditableTextTarget,
    );

    composition.update('ni');
    expect(target.value).toBe('搜索ni');
    composition.update('你好');
    expect(target.value).toBe('搜索你好');
    composition.commit('你好。');

    expect(target.value).toBe('搜索你好。');
    expect(target.selectionStart).toBe(5);
    expect(events.filter((type) => type === 'compositionstart')).toHaveLength(
      1,
    );
    expect(events.filter((type) => type === 'compositionend')).toHaveLength(1);
    expect(events.filter((type) => type === 'input')).toHaveLength(3);
  });

  it('restores the original selection when speech input is cancelled', () => {
    const target = input('hello world', 6, 11) as unknown as TestInputElement;
    const composition = createEditableTextComposition(
      target as unknown as EditableTextTarget,
    );

    composition.update('你好');
    expect(target.value).toBe('hello 你好');
    composition.cancel();

    expect(target.value).toBe('hello world');
    expect(target.selectionStart).toBe(6);
    expect(target.selectionEnd).toBe(11);
  });
});
