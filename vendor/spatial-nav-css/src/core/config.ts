import type { Direction, ElementNavConfig } from './types'
import { DIRECTIONS } from './types'

/**
 * Per-element configuration, the "spatial CSS" surface of the library.
 *
 * Everything can be expressed two ways, and they cascade together:
 *
 *  CSS custom properties (participate in the cascade, media queries, etc.):
 *    --nav-up / --nav-down / --nav-left / --nav-right: <selector> | none
 *    --spatial-container: contain | wrap | remember (space-separated tokens,
 *                         or just `container` / `normal` for a plain group)
 *    --spatial-default-focus: auto
 *
 *  Data attributes (override CSS when both are present):
 *    data-nav-up / data-nav-down / data-nav-left / data-nav-right
 *    data-spatial-container="contain wrap remember"  (value optional)
 *    data-spatial-autofocus
 *
 * The custom-property names intentionally echo the old CSS3 UI `nav-up`/
 * `nav-right` properties and the discontinued css-nav-1 draft.
 *
 * Performance: one navigation pass reads config for many elements (origin,
 * candidates, ancestor containers), and `getComputedStyle` is the dominant
 * cost of the whole engine. Two mitigations live here: a single
 * getComputedStyle call serves all six properties of an element, and all
 * read functions accept a per-pass `NavConfigCache` so each element is read
 * at most once per navigation.
 */

/** Per-pass memo for readNavConfig — create one per navigation. */
export type NavConfigCache = Map<HTMLElement, ElementNavConfig>

function unquote(value: string): string {
  const v = value.trim()
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  ) {
    return v.slice(1, -1)
  }
  return v
}

const CONTAINER_TOKENS = ['contain', 'wrap', 'remember'] as const

export function readNavConfig(el: HTMLElement, cache?: NavConfigCache): ElementNavConfig {
  const hit = cache?.get(el)
  if (hit) return hit

  // One computed-style object serves every property below.
  let style: CSSStyleDeclaration | null = null
  const view = el.ownerDocument.defaultView
  if (view) {
    try {
      style = view.getComputedStyle(el)
    } catch {
      style = null
    }
  }
  const readProp = (prop: string): string => (style ? unquote(style.getPropertyValue(prop)) : '')

  const explicit: Partial<Record<Direction, string>> = {}
  for (const dir of DIRECTIONS) {
    const fromData = el.getAttribute(`data-nav-${dir}`)
    const value = fromData ?? readProp(`--nav-${dir}`)
    if (value && value !== 'auto') explicit[dir] = value
  }

  const dataContainer = el.getAttribute('data-spatial-container')
  const cssContainer = readProp('--spatial-container')
  const isContainer =
    dataContainer !== null ||
    (cssContainer !== '' && cssContainer !== 'none' && cssContainer !== 'normal')

  const tokens = new Set(
    `${cssContainer} ${dataContainer ?? ''}`
      .split(/\s+/)
      .map((t) => t.toLowerCase())
      .filter((t): t is (typeof CONTAINER_TOKENS)[number] =>
        (CONTAINER_TOKENS as readonly string[]).includes(t),
      ),
  )

  const defaultFocus =
    el.hasAttribute('data-spatial-autofocus') || readProp('--spatial-default-focus') === 'auto'

  const config: ElementNavConfig = {
    explicit,
    isContainer,
    trap: tokens.has('contain'),
    wrap: tokens.has('wrap'),
    remember: tokens.has('remember'),
    defaultFocus,
  }
  cache?.set(el, config)
  return config
}

/** Nearest ancestor (exclusive) that is a spatial container, else null. */
export function findContainer(
  el: HTMLElement,
  root: Document | HTMLElement,
  cache?: NavConfigCache,
): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    if (node === root) return null
    if (readNavConfig(node, cache).isContainer) return node
    node = node.parentElement
  }
  return null
}

/** Chain of containers from the innermost (nearest to `el`) outward, ending inside `root`. */
export function containerChain(
  el: HTMLElement,
  root: Document | HTMLElement,
  cache?: NavConfigCache,
): HTMLElement[] {
  const chain: HTMLElement[] = []
  let current = findContainer(el, root, cache)
  while (current) {
    chain.push(current)
    current = findContainer(current, root, cache)
  }
  return chain
}
