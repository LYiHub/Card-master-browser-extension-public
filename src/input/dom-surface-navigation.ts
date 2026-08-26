import { focusableElements, visibleInteractionElement } from './focusability';
import type { IntentEnvelope, NavigationDirection } from './intents';

export { focusableElements } from './focusability';

function surfaceActiveElement(surface: HTMLElement) {
  const root = surface.getRootNode();
  return root instanceof ShadowRoot
    ? root.activeElement
    : surface.ownerDocument.activeElement;
}

function center(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}

function directionalScore(
  origin: { x: number; y: number },
  candidate: { x: number; y: number },
  direction: NavigationDirection,
) {
  const dx = candidate.x - origin.x;
  const dy = candidate.y - origin.y;
  const primary =
    direction === 'left'
      ? -dx
      : direction === 'right'
        ? dx
        : direction === 'up'
          ? -dy
          : dy;
  if (primary <= 1) return Number.POSITIVE_INFINITY;
  const secondary =
    direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
  return primary + secondary * 1.8 + (secondary * secondary) / primary;
}

export function focusSurfaceDirection(
  surface: HTMLElement,
  direction: NavigationDirection,
) {
  const candidates = focusableElements(surface);
  if (candidates.length === 0) return false;
  const active = surfaceActiveElement(surface);
  const current =
    active instanceof HTMLElement && surface.contains(active) ? active : null;
  if (!current) {
    candidates[0]?.focus({ preventScroll: true });
    return true;
  }
  const origin = center(current);
  const next = candidates
    .filter((candidate) => candidate !== current)
    .map((candidate) => ({
      candidate,
      score: directionalScore(origin, center(candidate), direction),
    }))
    .sort((left, right) => left.score - right.score)[0];
  if (!next || !Number.isFinite(next.score)) return false;
  next.candidate.focus({ preventScroll: true });
  return true;
}

function adjustNativeControl(
  active: Element | null,
  direction: NavigationDirection,
) {
  if (active instanceof HTMLInputElement && active.type === 'range') {
    if (direction !== 'left' && direction !== 'right') return false;
    direction === 'left' ? active.stepDown() : active.stepUp();
    active.dispatchEvent(new Event('input', { bubbles: true }));
    active.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (active instanceof HTMLSelectElement) {
    if (direction !== 'up' && direction !== 'down') return false;
    const delta = direction === 'up' ? -1 : 1;
    const next = Math.min(
      active.options.length - 1,
      Math.max(0, active.selectedIndex + delta),
    );
    if (next === active.selectedIndex) return true;
    active.selectedIndex = next;
    active.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

function choiceGroup(surface: HTMLElement, contextNavigation: boolean) {
  const selector = contextNavigation
    ? '[data-app-ui-choice-group="true"][data-app-ui-context-navigation="true"]'
    : '[data-app-ui-choice-group="true"]';
  const active = surfaceActiveElement(surface);
  const activeGroup =
    active instanceof HTMLInputElement && active.type === 'radio'
      ? active.closest<HTMLElement>('[data-app-ui-choice-group="true"]')
      : null;
  if (
    activeGroup &&
    (!contextNavigation ||
      activeGroup.dataset.appUiContextNavigation === 'true')
  ) {
    return activeGroup;
  }
  return surface.querySelector<HTMLElement>(selector);
}

function switchChoice(
  surface: HTMLElement,
  direction: -1 | 1,
  contextNavigation: boolean,
) {
  const group = choiceGroup(surface, contextNavigation);
  if (!group) return false;
  const choices = Array.from(
    group.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]:not(:disabled)',
    ),
  ).filter(visibleInteractionElement);
  if (choices.length === 0) return false;
  const active = surfaceActiveElement(surface);
  const selected = group.querySelector<HTMLInputElement>(
    'input[type="radio"]:checked',
  );
  const current =
    active instanceof HTMLInputElement &&
    active.type === 'radio' &&
    group.contains(active)
      ? active
      : selected;
  const currentIndex = Math.max(0, current ? choices.indexOf(current) : 0);
  const next =
    choices[(currentIndex + direction + choices.length) % choices.length];
  next?.focus({ preventScroll: true });
  next?.click();
  return true;
}

function scrollableFrom(surface: HTMLElement, active: Element | null) {
  let current =
    active instanceof HTMLElement && surface.contains(active) ? active : null;
  while (current && current !== surface) {
    const style = getComputedStyle(current);
    if (
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return (
    surface.querySelector<HTMLElement>('.app-ui-dialog__body') ??
    surface.querySelector<HTMLElement>('.app-ui-workspace__body') ??
    surface
  );
}

function confirmSurface(surface: HTMLElement, onEnter?: () => void) {
  const active = surfaceActiveElement(surface);
  if (!(active instanceof HTMLElement) || !surface.contains(active)) {
    onEnter?.();
    return Boolean(onEnter);
  }
  if (
    active.matches(
      'button, a[href], summary, input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"], [role="button"], [role="link"], [role="menuitem"], [role="option"]',
    )
  ) {
    active.click();
    return true;
  }
  if (
    active.matches(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    )
  ) {
    return true;
  }
  onEnter?.();
  return Boolean(onEnter);
}

export function handleSurfaceIntent({
  surface,
  event,
  onClose,
  onEnter,
}: {
  surface: HTMLElement;
  event: IntentEnvelope;
  onClose: () => void;
  onEnter?: () => void;
}) {
  const { intent } = event;
  if (intent.type === 'back') {
    onClose();
    return true;
  }
  if (intent.type === 'confirm') return confirmSurface(surface, onEnter);
  if (intent.type === 'contextPrevious') {
    return switchChoice(surface, -1, true);
  }
  if (intent.type === 'contextNext') {
    return switchChoice(surface, 1, true);
  }
  if (intent.type === 'navigate') {
    const active = surfaceActiveElement(surface);
    if (adjustNativeControl(active, intent.direction)) return true;
    if (
      (intent.direction === 'left' || intent.direction === 'right') &&
      active instanceof HTMLInputElement &&
      active.type === 'radio'
    ) {
      return switchChoice(surface, intent.direction === 'left' ? -1 : 1, false);
    }
    return focusSurfaceDirection(surface, intent.direction);
  }
  if (intent.type === 'scroll') {
    const target = scrollableFrom(surface, surfaceActiveElement(surface));
    target.scrollBy({
      left: intent.deltaX,
      top: intent.deltaY,
      behavior: 'auto',
    });
    return true;
  }
  if (intent.type === 'pagePrevious' || intent.type === 'pageNext') {
    const target = scrollableFrom(surface, surfaceActiveElement(surface));
    target.scrollBy({
      top:
        (intent.delta ?? target.clientHeight * 0.72 * intent.strength) *
        (intent.type === 'pagePrevious' ? -1 : 1),
      behavior: 'auto',
    });
    return true;
  }
  return false;
}
