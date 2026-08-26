/**
 * Default selector for spatially focusable elements. Mirrors browser
 * focusability plus an opt-in `data-focusable` hook for non-interactive
 * elements (cards, tiles) that should participate in navigation.
 *
 * An explicit tabindex="-1" on a native widget means "not a stop" — e.g. a
 * slider nested inside a focusable settings row. The exception is
 * [data-focusable]: the engine itself assigns tabindex="-1" to those so they
 * can hold real focus, so the opt-in must keep matching.
 */
export const DEFAULT_FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not(:disabled):not([tabindex="-1"])',
  'input:not(:disabled):not([type="hidden"]):not([tabindex="-1"])',
  'select:not(:disabled):not([tabindex="-1"])',
  'textarea:not(:disabled):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
  '[data-focusable]',
].join(', ')

export function isElementVisible(el: HTMLElement): boolean {
  if (el.closest('[aria-hidden="true"], [inert], [hidden]')) return false
  // A native modal dialog (showModal) focus-blocks everything outside the
  // top layer without setting any attribute — only its subtree is navigable
  // while it is open. The tag-index length check keeps dialog-free pages at
  // near-zero cost on this hot path.
  const doc = el.ownerDocument
  if (doc.getElementsByTagName('dialog').length > 0) {
    try {
      const modal = doc.querySelector('dialog:modal')
      if (modal && !modal.contains(el)) return false
    } catch {
      // ':modal' unsupported (jsdom): authors fall back to explicit
      // data-spatial-container="contain" on the dialog.
    }
  }
  // Native fast path: one engine call covering display, visibility, and
  // content-visibility — much cheaper than getComputedStyle per element.
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ checkVisibilityCSS: true })
  }
  if (el.getClientRects().length === 0) return false
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  if (style && (style.visibility === 'hidden' || style.visibility === 'collapse')) return false
  return true
}

export function getFocusables(
  scope: ParentNode,
  selector: string = DEFAULT_FOCUSABLE_SELECTOR,
  visibilityFilter: (el: HTMLElement) => boolean = isElementVisible,
): HTMLElement[] {
  const all = scope.querySelectorAll<HTMLElement>(selector)
  const out: HTMLElement[] = []
  for (const el of all) {
    if (visibilityFilter(el)) out.push(el)
  }
  return out
}

/** True when key events on this element should be left alone (text entry). */
export function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(type)
  }
  return false
}

export function ownerDocumentOf(root: Document | HTMLElement): Document {
  // nodeType, not instanceof: a document from another realm (iframe) is not
  // an instance of this realm's Document, and a Document's ownerDocument is
  // null — instanceof here would yield a null doc and crash downstream.
  // (An element's ownerDocument is only null for Document nodes, excluded
  // by the nodeType branch.)
  return root.nodeType === 9 /* Node.DOCUMENT_NODE */
    ? (root as Document)
    : (root.ownerDocument as Document)
}

/**
 * Cross-realm-safe HTMLElement check (instanceof fails for elements from
 * iframes); duck-types on element nodeType plus style.
 */
export function isHTMLElementNode(value: unknown): value is HTMLElement {
  if (value instanceof HTMLElement) return true
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    'style' in value &&
    'focus' in value
  )
}
