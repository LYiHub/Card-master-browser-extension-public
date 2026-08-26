import type { RefObject } from 'react';
import { useLayoutEffect, useRef } from 'react';

import {
  INPUT_SCOPE_PRIORITY,
  inputCoordinatorFor,
} from '../input/coordinator';
import { handleSurfaceIntent } from '../input/dom-surface-navigation';
import { registerEscapeLayer } from '../input/escape-layer';
import {
  focusableElements,
  visibleInteractionElement,
} from '../input/focusability';

const PREFERRED_DIALOG_FOCUS_SELECTOR = [
  '[data-dialog-primary="true"]:not(:disabled)',
  '.app-ui-dialog__body button:not(:disabled)',
  '.app-ui-dialog__body input:not(:disabled)',
  '.app-ui-dialog__body textarea:not(:disabled)',
  '.app-ui-dialog__body select:not(:disabled)',
  '.app-ui-dialog__body a[href]',
  '.app-ui-dialog__footer button:not(:disabled)',
].join(', ');

type DialogRoot = Document | ShadowRoot;

type DialogStackEntry = {
  dialog: HTMLElement;
  priority: number;
  sequence: number;
  suspended: boolean;
  previousAriaHidden: string | null;
  previousInert: boolean;
};

const dialogStacks = new WeakMap<DialogRoot, DialogStackEntry[]>();
let dialogSequence = 0;

function activeElement(root: Document | ShadowRoot) {
  return root.activeElement;
}

function synchronizeDialogStack(root: DialogRoot) {
  const stack = dialogStacks.get(root) ?? [];
  const top = stack.at(-1);
  for (const entry of stack) {
    const shouldSuspend = entry !== top;
    if (shouldSuspend && !entry.suspended) {
      entry.previousAriaHidden = entry.dialog.getAttribute('aria-hidden');
      entry.previousInert = entry.dialog.inert;
      entry.dialog.setAttribute('aria-hidden', 'true');
      entry.dialog.inert = true;
      entry.suspended = true;
    } else if (!shouldSuspend && entry.suspended) {
      if (entry.previousAriaHidden === null) {
        entry.dialog.removeAttribute('aria-hidden');
      } else {
        entry.dialog.setAttribute('aria-hidden', entry.previousAriaHidden);
      }
      entry.dialog.inert = entry.previousInert;
      entry.suspended = false;
    }
  }
}

function registerDialog(
  root: DialogRoot,
  dialog: HTMLElement,
  priority: number,
) {
  const entry: DialogStackEntry = {
    dialog,
    priority,
    sequence: ++dialogSequence,
    suspended: false,
    previousAriaHidden: null,
    previousInert: false,
  };
  const stack = dialogStacks.get(root) ?? [];
  stack.push(entry);
  stack.sort(
    (left, right) =>
      left.priority - right.priority || left.sequence - right.sequence,
  );
  dialogStacks.set(root, stack);
  synchronizeDialogStack(root);
  return entry;
}

function unregisterDialog(root: DialogRoot, entry: DialogStackEntry) {
  const stack = dialogStacks.get(root);
  if (!stack) return;
  const index = stack.indexOf(entry);
  if (index >= 0) stack.splice(index, 1);
  if (entry.suspended) {
    if (entry.previousAriaHidden === null) {
      entry.dialog.removeAttribute('aria-hidden');
    } else {
      entry.dialog.setAttribute('aria-hidden', entry.previousAriaHidden);
    }
    entry.dialog.inert = entry.previousInert;
  }
  if (stack.length === 0) {
    dialogStacks.delete(root);
    return;
  }
  synchronizeDialogStack(root);
}

function isTopDialog(root: DialogRoot, entry: DialogStackEntry) {
  return dialogStacks.get(root)?.at(-1) === entry;
}

export function useDialogInteraction({
  dialogRef,
  initialFocusRef,
  enabled = true,
  priority = 0,
  onClose,
  onEnter,
}: {
  dialogRef: RefObject<HTMLElement>;
  initialFocusRef?: RefObject<HTMLElement>;
  enabled?: boolean;
  priority?: number;
  onClose: () => void;
  onEnter?: () => void;
}) {
  const onCloseRef = useRef(onClose);
  const onEnterRef = useRef(onEnter);
  const enabledRef = useRef(enabled);
  onCloseRef.current = onClose;
  onEnterRef.current = onEnter;
  enabledRef.current = enabled;

  useLayoutEffect(() => {
    if (!enabled) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const rootNode = dialog.getRootNode();
    const root =
      rootNode instanceof ShadowRoot ? rootNode : dialog.ownerDocument;
    const previouslyFocused = activeElement(root);
    const stackEntry = registerDialog(root, dialog, priority);
    const unregisterInputScope = inputCoordinatorFor(root).register(root, {
      id: `dialog:${stackEntry.sequence}`,
      priority: INPUT_SCOPE_PRIORITY.dialog + priority,
      active: () => enabledRef.current && isTopDialog(root, stackEntry),
      handle: (event) => {
        if (!isTopDialog(root, stackEntry)) return false;
        return handleSurfaceIntent({
          surface: dialog,
          event,
          onClose: () => onCloseRef.current(),
          onEnter: onEnterRef.current,
        });
      },
    });
    const unregisterEscapeLayer = registerEscapeLayer(dialog.ownerDocument, {
      id: `dialog:${stackEntry.sequence}`,
      priority: INPUT_SCOPE_PRIORITY.dialog + priority,
      active: () => enabledRef.current && isTopDialog(root, stackEntry),
      onEscape: () => onCloseRef.current(),
    });
    if (isTopDialog(root, stackEntry)) {
      const candidates = focusableElements(dialog);
      const requested = initialFocusRef?.current;
      const initial =
        requested && visibleInteractionElement(requested)
          ? requested
          : (candidates.find((candidate) =>
              candidate.matches(PREFERRED_DIALOG_FOCUS_SELECTOR),
            ) ?? candidates[0]);
      initial?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(root, stackEntry)) return;
      if (event.key !== 'Tab') return;
      const focusable = focusableElements(dialog);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        initialFocusRef?.current?.focus();
        return;
      }
      const current = activeElement(root);
      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const view = dialog.ownerDocument.defaultView;
    view?.addEventListener('keydown', handleKeyDown, true);
    return () => {
      view?.removeEventListener('keydown', handleKeyDown, true);
      unregisterEscapeLayer();
      unregisterInputScope();
      unregisterDialog(root, stackEntry);
      if (
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus();
      }
    };
  }, [dialogRef, enabled, initialFocusRef, priority]);
}
