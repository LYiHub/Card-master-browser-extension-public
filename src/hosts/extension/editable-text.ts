export type EditableTextTarget =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLElement;

export type EditableTextComposition = {
  update(text: string): void;
  commit(text: string): void;
  cancel(): void;
};

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

export function editableTextTarget(
  value: Element | null,
): EditableTextTarget | null {
  if (value instanceof HTMLInputElement) {
    return NON_TEXT_INPUT_TYPES.has(value.type) ? null : value;
  }
  if (value instanceof HTMLTextAreaElement) return value;
  if (!(value instanceof HTMLElement)) return null;
  if (value.isContentEditable) return value;
  const editable = value.closest<HTMLElement>('[contenteditable="true"]');
  return editable?.isContentEditable ? editable : null;
}

export function editableTextValue(target: EditableTextTarget | null) {
  if (!target) return '';
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return target.value;
  }
  return target.textContent ?? '';
}

function dispatchBeforeInput(
  target: EditableTextTarget,
  inputType: string,
  data: string | null,
  isComposing = false,
) {
  return target.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType,
      data,
      isComposing,
    }),
  );
}

function dispatchInput(
  target: EditableTextTarget,
  inputType: string,
  data: string | null,
  isComposing = false,
) {
  target.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType,
      data,
      isComposing,
    }),
  );
}

function dispatchComposition(
  target: EditableTextTarget,
  type: 'compositionstart' | 'compositionupdate' | 'compositionend',
  data: string,
) {
  target.dispatchEvent(
    new CompositionEvent(type, {
      bubbles: true,
      composed: true,
      data,
    }),
  );
}

function setFormControlValue(
  target: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(target, value);
  else target.value = value;
}

function formControlComposition(
  target: HTMLInputElement | HTMLTextAreaElement,
): EditableTextComposition {
  const selectionSupported =
    target.selectionStart !== null && target.selectionEnd !== null;
  const selectionStart = selectionSupported
    ? (target.selectionStart ?? target.value.length)
    : target.value.length;
  const selectionEnd = selectionSupported
    ? (target.selectionEnd ?? selectionStart)
    : selectionStart;
  const replacedText = target.value.slice(selectionStart, selectionEnd);
  let currentText = '';
  let started = false;
  let closed = false;

  const replace = (nextText: string) => {
    if (closed || !target.isConnected || nextText === currentText) return false;
    const rangeEnd = started
      ? selectionStart + currentText.length
      : selectionEnd;
    if (
      started &&
      target.value.slice(selectionStart, rangeEnd) !== currentText
    ) {
      return false;
    }
    target.focus({ preventScroll: true });
    if (!started) {
      dispatchComposition(target, 'compositionstart', '');
      started = true;
    }
    dispatchComposition(target, 'compositionupdate', nextText);
    if (!dispatchBeforeInput(target, 'insertCompositionText', nextText, true)) {
      return false;
    }
    const nextValue = `${target.value.slice(0, selectionStart)}${nextText}${target.value.slice(rangeEnd)}`;
    setFormControlValue(target, nextValue);
    currentText = nextText;
    const caret = selectionStart + nextText.length;
    if (selectionSupported) target.setSelectionRange(caret, caret);
    dispatchInput(target, 'insertCompositionText', nextText, true);
    return true;
  };

  return {
    update(text) {
      replace(text);
    },
    commit(text) {
      if (closed) return;
      replace(text);
      if (started) dispatchComposition(target, 'compositionend', currentText);
      closed = true;
    },
    cancel() {
      if (closed) return;
      if (started && target.isConnected) {
        target.focus({ preventScroll: true });
        const rangeEnd = selectionStart + currentText.length;
        if (
          target.value.slice(selectionStart, rangeEnd) === currentText &&
          dispatchBeforeInput(
            target,
            'insertCompositionText',
            replacedText,
            true,
          )
        ) {
          const nextValue = `${target.value.slice(0, selectionStart)}${replacedText}${target.value.slice(rangeEnd)}`;
          setFormControlValue(target, nextValue);
          if (selectionSupported) {
            target.setSelectionRange(selectionStart, selectionEnd);
          }
          dispatchInput(target, 'insertCompositionText', replacedText, true);
        }
        dispatchComposition(target, 'compositionend', '');
      }
      closed = true;
    },
  };
}

function contentEditableRange(target: HTMLElement) {
  const selection = target.ownerDocument.getSelection();
  if (
    selection?.rangeCount &&
    target.contains(selection.getRangeAt(0).commonAncestorContainer)
  ) {
    return selection.getRangeAt(0).cloneRange();
  }
  const range = target.ownerDocument.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  return range;
}

function selectAfter(node: Node) {
  const document = node.ownerDocument;
  const selection = document?.getSelection();
  if (!document || !selection) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function contentEditableComposition(
  target: HTMLElement,
): EditableTextComposition {
  const initialRange = contentEditableRange(target);
  let originalContents: DocumentFragment | null = null;
  let textNode: Text | null = null;
  let currentText = '';
  let composing = false;
  let started = false;
  let closed = false;

  const replace = (nextText: string) => {
    if (closed || !target.isConnected || nextText === currentText) return false;
    target.focus({ preventScroll: true });
    if (!started) {
      if (!composing) {
        dispatchComposition(target, 'compositionstart', '');
        composing = true;
      }
      dispatchComposition(target, 'compositionupdate', nextText);
      if (
        !dispatchBeforeInput(target, 'insertCompositionText', nextText, true)
      ) {
        return false;
      }
      const range = initialRange.cloneRange();
      originalContents = range.extractContents();
      textNode = target.ownerDocument.createTextNode(nextText);
      range.insertNode(textNode);
      started = true;
    } else {
      if (!textNode?.isConnected || !target.contains(textNode)) return false;
      dispatchComposition(target, 'compositionupdate', nextText);
      if (
        !dispatchBeforeInput(target, 'insertCompositionText', nextText, true)
      ) {
        return false;
      }
      textNode.data = nextText;
    }
    currentText = nextText;
    if (textNode) selectAfter(textNode);
    dispatchInput(target, 'insertCompositionText', nextText, true);
    return true;
  };

  return {
    update(text) {
      replace(text);
    },
    commit(text) {
      if (closed) return;
      replace(text);
      if (composing) dispatchComposition(target, 'compositionend', currentText);
      closed = true;
      originalContents = null;
      textNode = null;
    },
    cancel() {
      if (closed) return;
      if (started && textNode?.isConnected && target.contains(textNode)) {
        target.focus({ preventScroll: true });
        const range = target.ownerDocument.createRange();
        range.selectNode(textNode);
        if (
          dispatchBeforeInput(
            target,
            'insertCompositionText',
            originalContents?.textContent ?? '',
            true,
          )
        ) {
          const restoredText = originalContents?.textContent ?? '';
          range.deleteContents();
          if (originalContents) range.insertNode(originalContents);
          range.collapse(true);
          const selection = target.ownerDocument.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          dispatchInput(target, 'insertCompositionText', restoredText, true);
        }
      }
      if (composing) dispatchComposition(target, 'compositionend', '');
      closed = true;
      originalContents = null;
      textNode = null;
    },
  };
}

export function createEditableTextComposition(
  target: EditableTextTarget,
): EditableTextComposition {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
    ? formControlComposition(target)
    : contentEditableComposition(target);
}

export function insertEditableText(target: EditableTextTarget, text: string) {
  target.focus({ preventScroll: true });
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (start !== null && end !== null) {
      const next = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`;
      setFormControlValue(target, next);
      const caret = start + text.length;
      target.setSelectionRange(caret, caret);
    } else {
      setFormControlValue(target, `${target.value}${text}`);
    }
    dispatchInput(target, 'insertText', text);
    return;
  }
  const selection = target.ownerDocument.getSelection();
  const range =
    selection?.rangeCount && target.contains(selection.anchorNode)
      ? selection.getRangeAt(0)
      : target.ownerDocument.createRange();
  if (!selection?.rangeCount || !target.contains(selection.anchorNode)) {
    range.selectNodeContents(target);
    range.collapse(false);
  }
  range.deleteContents();
  const node = target.ownerDocument.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  dispatchInput(target, 'insertText', text);
}

export function removeEditableText(target: EditableTextTarget) {
  target.focus({ preventScroll: true });
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (start !== null && end !== null) {
      const deletionStart = start === end ? Math.max(0, start - 1) : start;
      setFormControlValue(
        target,
        `${target.value.slice(0, deletionStart)}${target.value.slice(end)}`,
      );
      target.setSelectionRange(deletionStart, deletionStart);
    } else {
      setFormControlValue(target, target.value.slice(0, -1));
    }
    dispatchInput(target, 'deleteContentBackward', null);
    return;
  }
  const selection = target.ownerDocument.getSelection();
  if (!selection?.rangeCount || !target.contains(selection.anchorNode)) return;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) {
    range.deleteContents();
  } else {
    range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
    range.deleteContents();
  }
  dispatchInput(target, 'deleteContentBackward', null);
}
