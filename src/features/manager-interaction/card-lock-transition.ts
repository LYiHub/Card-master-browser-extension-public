export const CARD_LOCK_TRANSITION_MS = 720;
export type CardLockPhase = 'unlocked' | 'locking' | 'locked' | 'unlocking';
const activeTransitions = new WeakMap<HTMLElement, Promise<void>>();

function nextFrame(view: Window) {
  return new Promise<void>((resolve) => {
    view.requestAnimationFrame(() => resolve());
  });
}

export function registerCardLockTransition(
  card: HTMLElement,
  transition: Promise<void>,
) {
  activeTransitions.set(card, transition);
  void transition.finally(() => {
    if (activeTransitions.get(card) === transition) {
      activeTransitions.delete(card);
    }
  });
}

export async function waitForCardLockTransition(card: HTMLElement) {
  if (!card.isConnected) return;
  const view = card.ownerDocument.defaultView;
  if (!view) return;
  await nextFrame(view);
  await activeTransitions.get(card);
}
