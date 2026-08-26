export const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'textarea:not(:disabled)',
  'select:not(:disabled)',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function visibleInteractionElement(element: HTMLElement) {
  if (
    !element.isConnected ||
    element.hidden ||
    element.closest('[hidden], [inert], [aria-hidden="true"]') ||
    element.getAttribute('aria-disabled') === 'true'
  ) {
    return false;
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (
    !style ||
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse' ||
    style.contentVisibility === 'hidden' ||
    Number(style.opacity) === 0
  ) {
    return false;
  }
  if (
    typeof element.checkVisibility === 'function' &&
    !element.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
    })
  ) {
    return false;
  }
  return [...element.getClientRects()].some(
    (bounds) => bounds.width > 0 && bounds.height > 0,
  );
}

export function focusableElements(root: ParentNode) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(visibleInteractionElement);
}
