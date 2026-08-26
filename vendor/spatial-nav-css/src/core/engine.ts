import type { Direction, NavRect, ScoringOptions } from './types'
import { DEFAULT_SCORING } from './types'
import {
  OPPOSITE,
  classifyDirection,
  findBestCandidate,
  toNavRect,
  unionRects,
  wrapOrigin,
} from './geometry'
import {
  DEFAULT_FOCUSABLE_SELECTOR,
  getFocusables,
  isElementVisible,
  isHTMLElementNode,
  ownerDocumentOf,
} from './dom'
import { containerChain, findContainer, type NavConfigCache, readNavConfig } from './config'
import { dispatchSpatialEvent } from '../events'

export interface EngineOptions {
  /** Subtree the engine operates on. Defaults to `document`. */
  root?: Document | HTMLElement
  /** Selector for focusable elements. */
  focusableSelector?: string
  /** Distance-function tunables. */
  scoring?: Partial<ScoringOptions>
  /** Rect provider — injectable for tests and virtualized layouts. */
  getRect?: (el: HTMLElement) => NavRect
  /** Visibility predicate — injectable for tests. */
  visibilityFilter?: (el: HTMLElement) => boolean
  /**
   * Scroll behavior when focus moves. `false` disables scrolling entirely.
   * Defaults to 'smooth', degraded to instant under prefers-reduced-motion.
   */
  scrollBehavior?: ScrollBehavior | false
  /** Class applied to the focused element (gamepad focus isn't :focus-visible). */
  focusClass?: string
  /**
   * When the focused element is removed from the DOM (list re-render,
   * virtualization, route change), restore focus automatically — to the
   * nearest surviving container's memory, then its default focus, then its
   * first focusable, then the root's first focusable. Debounced briefly so
   * bulk re-renders settle first, and cancelled if focus moves on its own.
   * Requires start(). Default true.
   */
  autoRestoreFocus?: boolean
}

/** Debounce for auto-restore: lets a burst of removals/re-renders settle. */
const AUTO_RESTORE_DELAY_MS = 100

export interface FocusMoveDetail {
  direction?: Direction | null
  from?: HTMLElement | null
  source?: string
}

interface ScopeCandidate {
  element: HTMLElement
  rect: NavRect
  /** True when this entry represents a nested container (zone), not the element itself. */
  isGroup: boolean
}

export class SpatialEngine {
  readonly root: Document | HTMLElement
  private readonly doc: Document
  private readonly selector: string
  private readonly scoring: ScoringOptions
  private readonly getRect: (el: HTMLElement) => NavRect
  private readonly isVisible: (el: HTMLElement) => boolean
  private readonly scrollBehavior: ScrollBehavior | false
  private readonly focusClass: string

  private current: HTMLElement | null = null
  private readonly memory = new WeakMap<HTMLElement, HTMLElement>()
  private readonly autoRestore: boolean
  /** Container chain of `current` at adopt time — survives its removal. */
  private currentChain: HTMLElement[] = []
  private restoreTimer: ReturnType<typeof setTimeout> | null = null
  private removalObserver: MutationObserver | null = null
  /** One-shot guard for the collapsed-rect dev diagnostic (see diagnoseNoTarget). */
  private warnedCollapse = false
  private readonly onFocusIn = (event: FocusEvent): void => {
    const target = event.target
    if (!isHTMLElementNode(target) || target === this.current) return
    if (!this.rootContains(target) || !target.matches(this.selector)) return
    this.adopt(target)
  }
  private started = false

  constructor(options: EngineOptions = {}) {
    this.root = options.root ?? document
    this.doc = ownerDocumentOf(this.root)
    this.selector = options.focusableSelector ?? DEFAULT_FOCUSABLE_SELECTOR
    this.scoring = { ...DEFAULT_SCORING, ...options.scoring }
    this.getRect = options.getRect ?? ((el) => toNavRect(el.getBoundingClientRect()))
    this.isVisible = options.visibilityFilter ?? isElementVisible
    this.scrollBehavior = options.scrollBehavior ?? 'smooth'
    this.focusClass = options.focusClass ?? 'spatial-focused'
    this.autoRestore = options.autoRestoreFocus ?? true
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.doc.addEventListener('focusin', this.onFocusIn)
    if (this.autoRestore && typeof MutationObserver !== 'undefined') {
      this.removalObserver = new MutationObserver(() => {
        if (this.current && !this.current.isConnected) this.scheduleRestore()
      })
      this.removalObserver.observe(this.root, { childList: true, subtree: true })
    }
    const active = this.resolveActiveElement()
    if (isHTMLElementNode(active) && this.rootContains(active) && active.matches(this.selector)) {
      this.adopt(active)
    }
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.doc.removeEventListener('focusin', this.onFocusIn)
    this.removalObserver?.disconnect()
    this.removalObserver = null
    this.cancelRestore()
  }

  destroy(): void {
    this.stop()
    this.current?.classList.remove(this.focusClass)
    this.current = null
    this.currentChain = []
  }

  private cancelRestore(): void {
    if (this.restoreTimer !== null) {
      clearTimeout(this.restoreTimer)
      this.restoreTimer = null
    }
  }

  private scheduleRestore(): void {
    this.cancelRestore()
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null
      // Reconnected, or focus already landed somewhere on its own — stand down.
      if (this.current?.isConnected || this.getFocused()) return
      this.restoreFocus()
    }, AUTO_RESTORE_DELAY_MS)
  }

  /**
   * The focused element is gone: bring focus back to the nearest surviving
   * ancestor container — its memory, then its declared default focus, then
   * its first focusable — falling back to the root's entry point. The
   * Panorama/TV rule: the focus ring never just vanishes.
   */
  private restoreFocus(): void {
    const detail: FocusMoveDetail = { source: 'restore' }
    for (const container of this.currentChain) {
      if (!container.isConnected || !this.rootContains(container)) continue
      const remembered = this.memory.get(container)
      if (
        remembered?.isConnected &&
        container.contains(remembered) &&
        this.isVisible(remembered) &&
        this.focus(remembered, detail)
      ) {
        return
      }
      const preferred = this.findDefaultFocus(container, new Map())
      if (preferred && this.focus(preferred, detail)) return
      const first = this.collectFocusables(container)[0]
      if (first && this.focus(first, detail)) return
    }
    this.focusFirst(detail)
  }

  /**
   * document.activeElement retargeted through open shadow roots — inside a
   * shadow tree the document only reports the host.
   */
  private resolveActiveElement(): Element | null {
    let active = this.doc.activeElement
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    return active
  }

  getFocused(): HTMLElement | null {
    const active = this.resolveActiveElement()
    if (isHTMLElementNode(active) && active !== this.doc.body && active !== this.doc.documentElement) {
      if (this.rootContains(active) && (active === this.current || active.matches(this.selector))) {
        // Real DOM focus is the source of truth. Resync if we missed the
        // focusin (focus events don't fire in unfocused/hidden windows).
        if (active !== this.current) this.adopt(active)
        return active
      }
      if (this.rootContains(active)) {
        // Focus is inside our root on something we don't recognize (another
        // library's focus management) — keep our last known position.
        return this.validCurrent()
      }
      // Focus genuinely lives outside this root (another region, an input):
      // this engine doesn't own focus right now.
      return null
    }
    // Nothing holds focus (body): the spatial position persists.
    return this.validCurrent()
  }

  private validCurrent(): HTMLElement | null {
    return this.current?.isConnected && this.isVisible(this.current) ? this.current : null
  }

  /** Move focus in a direction. Returns true if focus moved. */
  navigate(dir: Direction, source = 'api'): boolean {
    const origin = this.getFocused()
    if (!origin) return this.focusFirst({ direction: dir, source })
    const target = this.findTarget(dir, origin)
    if (!target) {
      this.diagnoseNoTarget()
      dispatchSpatialEvent(origin, 'spatial:nofocustarget', { direction: dir, from: origin, source })
      return false
    }
    return this.focus(target, { direction: dir, from: origin, source })
  }

  /**
   * Dev-only, one-time diagnostic for a silent-death failure mode surfaced by
   * real embeddings (CEF / preview iframes reporting a 0 or unknown viewport):
   * when focusables are sized or animated with raw vw/vh they can all collapse
   * to the same ~0px rect, so every candidate classifies as "nowhere" and a
   * navigation finds nothing — with no error and no event payload to explain
   * it. The engine can't fix the host's layout, but it can refuse to fail
   * silently. Skipped in production builds and after it has fired once.
   */
  private diagnoseNoTarget(): void {
    if (this.warnedCollapse) return
    // Guard `process` for the browser, where it is usually undefined.
    if (
      typeof process !== 'undefined' &&
      (process as { env?: { NODE_ENV?: string } }).env?.NODE_ENV === 'production'
    ) {
      return
    }
    const focusables = this.collectFocusables(this.root)
    if (focusables.length < 3) return // a genuine edge of a small UI, not a collapse
    let collapsed = 0
    for (const el of focusables) {
      const r = this.getRect(el)
      if (r.width <= 1 && r.height <= 1) collapsed++
    }
    if (collapsed >= focusables.length * 0.8) {
      this.warnedCollapse = true
      console.warn(
        `[spatial-nav-css] navigation found no target: ${collapsed}/${focusables.length} focusables ` +
          'have a ~0px rect (likely a 0 or unknown viewport — e.g. CEF or a preview iframe). ' +
          'Avoid sizing or animating focusables with raw vw/vh that can collapse to 0; ' +
          'use clamp(min, vw, max) instead.',
      )
    }
  }

  /**
   * Resolve the element navigation would move to, without moving.
   *
   * Search is scoped the way css-nav-1 scoped it: within the current
   * container, sibling containers compete as single candidates (one rect per
   * zone — a sidebar, a header, a carousel). Once a zone wins, the search
   * descends into it. This is what keeps "right from the sidebar" landing in
   * the content area rather than on whatever stray element is diagonally
   * nearest.
   */
  findTarget(dir: Direction, from: HTMLElement): HTMLElement | null {
    // One config cache per navigation pass: getComputedStyle dominates the
    // engine's cost, so each element is read at most once per keypress.
    const cache: NavConfigCache = new Map()

    const config = readNavConfig(from, cache)
    const override = config.explicit[dir]
    if (override !== undefined) {
      if (override === 'none') return null
      let el: HTMLElement | null = null
      try {
        el = (this.root instanceof Document ? this.root : this.root).querySelector<HTMLElement>(override)
      } catch {
        // A malformed selector blocks the direction rather than throwing —
        // a loudly-broken override must not crash the input path.
        return null
      }
      // An override resolving to the origin itself is a no-op, not a move.
      return el && el !== from && this.isVisible(el) ? el : null
    }

    const fromRect = this.getRect(from)
    let scope: HTMLElement | null = findContainer(from, this.root, cache)

    for (;;) {
      const scopeNode: ParentNode = scope ?? this.root
      const candidates = this.collectScopeCandidates(scopeNode, from, cache)
      const picked = this.pickBest(candidates, fromRect, dir, from, cache)
      if (picked) return this.resolveEntry(picked, from, cache)

      if (!scope) return null
      const scopeConfig = readNavConfig(scope, cache)
      // Wrap only when the container actually has items behind us on this
      // axis — i.e. we're at the end of a row/column, not merely pressing
      // orthogonally to the container's layout direction.
      if (
        scopeConfig.wrap &&
        candidates.some((c) => classifyDirection(fromRect, c.rect, OPPOSITE[dir]) !== null)
      ) {
        const extent = unionRects([fromRect, ...candidates.map((c) => c.rect)])
        const origin = wrapOrigin(extent, fromRect, dir)
        const wrapped = this.pickBest(candidates, origin, dir, from, cache)
        if (wrapped) return this.resolveEntry(wrapped, from, cache)
      }
      if (scopeConfig.trap) return null
      scope = findContainer(scope, this.root, cache)
    }
  }

  /** Focus an element (or selector). Returns true if focus moved. */
  focus(target: HTMLElement | string, detail: FocusMoveDetail = {}): boolean {
    const el =
      typeof target === 'string'
        ? (this.root instanceof Document ? this.root : this.root).querySelector<HTMLElement>(target)
        : target
    if (!el || !this.isVisible(el)) return false

    const eventDetail = {
      direction: detail.direction ?? null,
      from: detail.from ?? this.current,
      source: detail.source ?? 'api',
    }
    if (!dispatchSpatialEvent(el, 'spatial:beforefocus', eventDetail, true)) return false

    this.adopt(el)
    if (this.doc.activeElement !== el) {
      // Let opt-in elements (data-focusable cards) receive real DOM focus.
      if (!el.hasAttribute('tabindex') && !el.matches('a[href], button, input, select, textarea')) {
        el.setAttribute('tabindex', '-1')
      }
      el.focus({ preventScroll: true })
    }
    this.scrollTo(el)
    dispatchSpatialEvent(el, 'spatial:focus', eventDetail)
    return true
  }

  /** Focus the root's default-focus element, else the first focusable. */
  focusFirst(detail: FocusMoveDetail = {}): boolean {
    const preferred = this.findDefaultFocus(this.root, new Map())
    if (preferred && this.focus(preferred, detail)) return true
    const first = this.collectFocusables(this.root)[0]
    return first ? this.focus(first, detail) : false
  }

  /** Synthesize activation (click) on the focused element. */
  activate(source = 'api'): boolean {
    const el = this.getFocused()
    if (!el) return false
    const proceed = dispatchSpatialEvent(
      el,
      'spatial:activate',
      { direction: null, from: el, source },
      true,
    )
    if (proceed) el.click()
    return true
  }

  /**
   * Announce release of the activate control (long-press detection lives in
   * the app: check detail.durationMs on 'spatial:activaterelease').
   */
  activateRelease(durationMs: number, source = 'api'): boolean {
    const el = this.getFocused()
    if (!el) return false
    dispatchSpatialEvent(el, 'spatial:activaterelease', {
      direction: null,
      from: el,
      source,
      durationMs,
    })
    return true
  }

  /**
   * Announce a back/cancel intent. Returns true if a listener handled it
   * (called preventDefault()).
   */
  back(source = 'api'): boolean {
    const target = this.getFocused() ?? this.doc
    return !dispatchSpatialEvent(
      target,
      'spatial:back',
      { direction: null, from: this.getFocused(), source },
      true,
    )
  }

  // --- internals ---

  private rootContains(el: HTMLElement): boolean {
    return this.root instanceof Document ? this.root.contains(el) : this.root.contains(el)
  }

  private adopt(el: HTMLElement): void {
    this.cancelRestore() // focus moved legitimately; no restore needed
    if (this.current !== el) {
      this.current?.classList.remove(this.focusClass)
      this.current = el
    }
    el.classList.add(this.focusClass)
    const cache: NavConfigCache = new Map()
    this.currentChain = containerChain(el, this.root, cache)
    for (const container of this.currentChain) {
      if (readNavConfig(container, cache).remember) this.memory.set(container, el)
    }
  }

  private collectFocusables(scope: ParentNode): HTMLElement[] {
    return getFocusables(scope, this.selector, this.isVisible)
  }

  /**
   * Candidates at one scope level: focusables that live directly in the
   * scope, plus one group candidate per nested container (zone). Elements in
   * a zone are represented by the zone's rect until the zone is entered.
   *
   * Container resolution is path-compressed: siblings share their ancestors'
   * answers, so the walk is O(distinct ancestors), not O(candidates × depth).
   */
  private collectScopeCandidates(
    scopeNode: ParentNode,
    from: HTMLElement,
    cache: NavConfigCache,
  ): ScopeCandidate[] {
    const candidates: ScopeCandidate[] = []
    const groupRects = new Map<HTMLElement, NavRect[]>()

    // topmostUnder(node) = outermost container among node and its ancestors,
    // strictly inside scopeNode. Memoized per ancestor; iterative (climb to a
    // memo hit or the boundary, then fill the path back down) so arbitrarily
    // deep DOMs cannot overflow the stack.
    const topmostMemo = new Map<HTMLElement, HTMLElement | null>()
    const topmostUnder = (start: HTMLElement | null): HTMLElement | null => {
      const path: HTMLElement[] = []
      let node = start
      let result: HTMLElement | null = null
      while (node && node !== scopeNode) {
        const hit = topmostMemo.get(node)
        if (hit !== undefined) {
          result = hit
          break
        }
        path.push(node)
        node = node.parentElement
      }
      for (let i = path.length - 1; i >= 0; i--) {
        const n = path[i]!
        result = result ?? (readNavConfig(n, cache).isContainer ? n : null)
        topmostMemo.set(n, result)
      }
      return result
    }

    for (const el of this.collectFocusables(scopeNode)) {
      if (el === from || el.contains(from) || from.contains(el)) continue
      const container = topmostUnder(el.parentElement)
      if (container) {
        if (container.contains(from)) continue
        let rects = groupRects.get(container)
        if (!rects) {
          rects = []
          groupRects.set(container, rects)
        }
        rects.push(this.getRect(el))
      } else {
        // Note: an element can appear both here (it is itself focusable) and
        // below as a zone (it contains focusables) — the isGroup flag keeps
        // the two candidacies distinct.
        candidates.push({ element: el, rect: this.getRect(el), isGroup: false })
      }
    }
    for (const [container, rects] of groupRects) {
      // The zone is the container's box extended over its content extent: a
      // scrollable carousel is conceptually a full band, and items scrolled
      // past its visible box must still count as part of it for alignment.
      const box = this.getRect(container)
      const content = unionRects(rects)
      const rect = box.width <= 0 && box.height <= 0 ? content : unionRects([box, content])
      candidates.push({ element: container, rect, isGroup: true })
    }
    return candidates
  }

  /** Best candidate at this level, descending into group (zone) winners. */
  private pickBest(
    candidates: ScopeCandidate[],
    origin: NavRect,
    dir: Direction,
    from: HTMLElement,
    cache: NavConfigCache,
  ): HTMLElement | null {
    const remaining = [...candidates]
    for (;;) {
      const best = findBestCandidate(origin, remaining, dir, this.scoring)
      if (!best) return null
      // Rect identity resolves the winning entry — an element that is both
      // focusable and a zone appears twice with distinct rects.
      const entry = remaining.find((c) => c.rect === best.rect)!
      if (!entry.isGroup) return entry.element
      const descended = this.descendInto(entry.element, origin, dir, from, cache)
      if (descended) return descended
      remaining.splice(remaining.indexOf(entry), 1)
    }
  }

  private descendInto(
    container: HTMLElement,
    origin: NavRect,
    dir: Direction,
    from: HTMLElement,
    cache: NavConfigCache,
  ): HTMLElement | null {
    const candidates = this.collectScopeCandidates(container, from, cache)
    const found = this.pickBest(candidates, origin, dir, from, cache)
    if (found) return found
    // The zone won geometrically but none of its content classifies in the
    // direction from outside (scrolled away, exotic layout) — fall back to
    // its preferred entry, then to any focusable.
    const preferred = this.findDefaultFocus(container, cache)
    if (preferred && preferred !== from) return preferred
    for (const el of this.collectFocusables(container)) {
      if (el !== from && !el.contains(from) && !from.contains(el)) return el
    }
    return null
  }

  /**
   * When navigation crosses into a container, honor the container's focus
   * memory (`remember`) or its declared default-focus child instead of the
   * geometrically nearest element — the Panorama "sections restore where
   * you left off" behavior.
   */
  private resolveEntry(target: HTMLElement, from: HTMLElement, cache: NavConfigCache): HTMLElement {
    const crossed = containerChain(target, this.root, cache).filter((c) => !c.contains(from))
    for (let i = crossed.length - 1; i >= 0; i--) {
      const container = crossed[i]!
      if (readNavConfig(container, cache).remember) {
        const remembered = this.memory.get(container)
        // Valid memory settles entry outright — even when it equals the
        // geometric target, returning it prevents the default-focus redirect
        // below from hijacking a correct re-entry.
        if (remembered?.isConnected && container.contains(remembered) && this.isVisible(remembered)) {
          return remembered
        }
      }
      const preferred = this.findDefaultFocus(container, cache)
      if (preferred && preferred !== target) return preferred
    }
    return target
  }

  private findDefaultFocus(scope: ParentNode, cache?: NavConfigCache): HTMLElement | null {
    const byAttr = scope.querySelector<HTMLElement>('[data-spatial-autofocus]')
    if (byAttr && this.isVisible(byAttr)) return byAttr
    for (const el of this.collectFocusables(scope)) {
      if (readNavConfig(el, cache).defaultFocus) return el
    }
    return null
  }

  private scrollTo(el: HTMLElement): void {
    if (this.scrollBehavior === false || typeof el.scrollIntoView !== 'function') return
    let behavior: ScrollBehavior = this.scrollBehavior
    if (behavior === 'smooth') {
      const view = this.doc.defaultView
      if (view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) behavior = 'auto'
    }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior })
  }
}
