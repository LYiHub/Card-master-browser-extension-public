export type InputModality = 'pointer' | 'keyboard' | 'gamepad';

export type NavigationDirection = 'up' | 'down' | 'left' | 'right';

export type InteractionIntent =
  | {
      type: 'navigate';
      direction: NavigationDirection;
      control?: 'keyboard' | 'dpad' | 'primary-stick';
    }
  | { type: 'confirm' }
  | { type: 'back' }
  | { type: 'browserTabPrevious' }
  | { type: 'browserTabNext' }
  | { type: 'contextPrevious' }
  | { type: 'contextNext' }
  | { type: 'scroll'; deltaX: number; deltaY: number }
  | { type: 'pagePrevious'; strength: number; delta?: number }
  | { type: 'pageNext'; strength: number; delta?: number }
  | { type: 'cursorReset' }
  | { type: 'toggleScreenKeyboard' }
  | { type: 'toggleAudio' }
  | { type: 'newTab' }
  | { type: 'reload' }
  | { type: 'pushToTalk' }
  | { type: 'toggleSpeechOrDeck' }
  | { type: 'toggleDeck' };

export type IntentPhase = 'pressed' | 'repeated' | 'released' | 'continuous';

export type IntentEnvelope = {
  intent: InteractionIntent;
  source: InputModality;
  deviceId: string | null;
  phase: IntentPhase;
  timestamp: number;
};

function eventElement(event: KeyboardEvent) {
  if (typeof Element === 'undefined') return undefined;
  return event
    .composedPath()
    .find((entry): entry is Element => entry instanceof Element);
}

function editableElement(element: Element | undefined) {
  return Boolean(
    element?.closest(
      'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable]:not([contenteditable="false"])',
    ),
  );
}

function nativeActivationElement(element: Element | undefined) {
  return Boolean(
    element?.closest(
      'button:not(.manager-card), a[href], summary, [role="button"], [role="link"], [role="menuitem"], [role="option"]',
    ),
  );
}

export function keyboardIntent(event: KeyboardEvent): InteractionIntent | null {
  if (event.isComposing || event.metaKey || event.altKey) {
    return null;
  }
  const element = eventElement(event);
  const editable = editableElement(element);

  if (event.key === 'Escape') {
    return event.repeat ? null : { type: 'back' };
  }
  if (editable) return null;

  if (event.ctrlKey) {
    if (event.key === 'PageUp') return { type: 'contextPrevious' };
    if (event.key === 'PageDown') return { type: 'contextNext' };
    return null;
  }

  if (event.key.toLowerCase() === 'm' && !event.repeat) {
    return { type: 'toggleAudio' };
  }
  if (event.key === 'PageUp') return { type: 'pagePrevious', strength: 1 };
  if (event.key === 'PageDown') return { type: 'pageNext', strength: 1 };

  const direction: NavigationDirection | null =
    event.key === 'ArrowUp'
      ? 'up'
      : event.key === 'ArrowDown'
        ? 'down'
        : event.key === 'ArrowLeft'
          ? 'left'
          : event.key === 'ArrowRight'
            ? 'right'
            : null;
  if (direction) {
    return { type: 'navigate', direction, control: 'keyboard' };
  }

  if (
    !event.repeat &&
    (event.key === 'Enter' || event.code === 'Space' || event.key === ' ') &&
    (!nativeActivationElement(element) ||
      Boolean(element?.closest('.manager-card')))
  ) {
    return { type: 'confirm' };
  }
  return null;
}
