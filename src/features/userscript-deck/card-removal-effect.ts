type CardRemovalEffectPose = {
  position: 'absolute' | 'fixed';
  left: number;
  top: number;
  width: number;
  height: number;
  transform: string;
  transformOrigin: string;
};

function offsetWithinDeck(card: HTMLElement, deck: HTMLElement) {
  let left = 0;
  let top = 0;
  let current: HTMLElement | null = card;
  while (current && current !== deck) {
    left += current.offsetLeft;
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return current === deck ? { left, top } : null;
}

export function readCardRemovalEffectPose(
  card: HTMLElement,
): CardRemovalEffectPose {
  const deck = card.closest<HTMLElement>('.userscript-deck');
  const offset = deck ? offsetWithinDeck(card, deck) : null;
  const computed = card.ownerDocument.defaultView?.getComputedStyle(card);
  if (deck && offset) {
    return {
      position: 'absolute',
      left: offset.left,
      top: offset.top,
      width: card.offsetWidth,
      height: card.offsetHeight,
      transform: computed?.transform ?? 'none',
      transformOrigin: computed?.transformOrigin ?? '50% 100%',
    };
  }

  const bounds = card.getBoundingClientRect();
  return {
    position: 'fixed',
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
    transform: 'none',
    transformOrigin: '50% 50%',
  };
}

export function mountCardRemovalEffect(
  card: HTMLElement,
  effect: HTMLCanvasElement,
) {
  const deckRoot = card.closest<HTMLElement>('.userscript-deck');
  const pose = readCardRemovalEffectPose(card);
  effect.style.position = pose.position;
  effect.style.left = `${pose.left}px`;
  effect.style.top = `${pose.top}px`;
  effect.style.width = `${pose.width}px`;
  effect.style.height = `${pose.height}px`;
  effect.style.transform = pose.transform;
  effect.style.transformOrigin = pose.transformOrigin;
  (deckRoot ?? card.ownerDocument.body).append(effect);
}
