function hasUsableBounds(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  return (
    Number.isFinite(bounds.left) &&
    Number.isFinite(bounds.top) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

export function deckLaunchSourceReady(element: HTMLElement | null) {
  if (!element?.isConnected) return false;
  if (element.classList.contains('manager-deck-launch-anchor')) {
    return hasUsableBounds(element);
  }
  const logo = element.querySelector<HTMLElement>(
    '.manager-deck-trigger__logo',
  );
  return Boolean(logo?.isConnected && hasUsableBounds(logo));
}
