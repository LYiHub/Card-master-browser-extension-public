import type { Direction } from './core/types'
import { SpatialEngine, type EngineOptions } from './core/engine'
import { InputManager } from './input/manager'
import { keyboardAdapter } from './input/keyboard'
import { gamepadAdapter } from './input/gamepad'
import type { InputAdapter, NavIntent } from './input/types'

export interface SpatialNavigationOptions extends EngineOptions {
  /**
   * Input adapters to drive navigation. Defaults to
   * [keyboardAdapter(), gamepadAdapter()]. Pass [] for a purely
   * programmatic engine.
   */
  adapters?: InputAdapter[]
  /** Focus the default/first focusable element on start(). Default false. */
  autofocus?: boolean
  /** Window used by input adapters (for iframes / test environments). */
  window?: Window
}

export interface SpatialNavigation {
  /** Begin tracking focus and listening to input devices. */
  start(): void
  /** Stop listening; focus state is kept. */
  stop(): void
  /** Stop and release everything. */
  destroy(): void
  /** Move focus in a direction. Returns true if focus moved. */
  navigate(direction: Direction): boolean
  /** Focus an element or selector. */
  focus(target: HTMLElement | string): boolean
  /** Focus the default-focus element, else the first focusable. */
  focusFirst(): boolean
  /** Currently focused element, if any. */
  getFocused(): HTMLElement | null
  /** Synthesize activation (click) on the focused element. */
  activate(): boolean
  addAdapter(adapter: InputAdapter): void
  removeAdapter(adapter: InputAdapter): void
  /** The underlying engine, for advanced use. */
  readonly engine: SpatialEngine
}

/**
 * Wire up a spatial navigation instance: engine + input adapters.
 *
 *   import { createSpatialNavigation } from 'spatial-nav-css'
 *   import 'spatial-nav-css/css'
 *
 *   const nav = createSpatialNavigation()
 *   nav.start()
 */
export function createSpatialNavigation(options: SpatialNavigationOptions = {}): SpatialNavigation {
  const engine = new SpatialEngine(options)
  const win = options.window ?? (typeof window !== 'undefined' ? window : undefined)

  const handleIntent = (intent: NavIntent): boolean => {
    switch (intent.type) {
      case 'direction': {
        if (!engine.getFocused()) {
          // Claim first focus only when nothing on the page holds focus —
          // otherwise multiple nav regions (e.g. two <spatial-nav> islands)
          // would steal focus from each other on every keypress.
          const doc = engine.root instanceof Document ? engine.root : engine.root.ownerDocument
          const active = doc.activeElement
          if (active && active !== doc.body && active !== doc.documentElement) return false
          return engine.focusFirst({ direction: intent.direction, source: intent.source })
        }
        // Consume the input even when at an edge so arrow keys / sticks
        // never scroll the page out from under the focus system. Apps react
        // to edges via the 'spatial:nofocustarget' event instead.
        engine.navigate(intent.direction, intent.source)
        return true
      }
      case 'activate':
        return engine.activate(intent.source)
      case 'release':
        return engine.activateRelease(intent.durationMs, intent.source)
      case 'back':
        return engine.back(intent.source)
    }
  }

  const manager = win ? new InputManager(handleIntent, win) : null
  const adapters = options.adapters ?? [keyboardAdapter(), gamepadAdapter()]
  for (const adapter of adapters) manager?.add(adapter)

  return {
    engine,
    start() {
      engine.start()
      manager?.start()
      if (options.autofocus && !engine.getFocused()) engine.focusFirst({ source: 'autofocus' })
    },
    stop() {
      manager?.stop()
      engine.stop()
    },
    destroy() {
      manager?.destroy()
      engine.destroy()
    },
    navigate: (direction) => engine.navigate(direction),
    focus: (target) => engine.focus(target),
    focusFirst: () => engine.focusFirst(),
    getFocused: () => engine.getFocused(),
    activate: () => engine.activate(),
    addAdapter: (adapter) => manager?.add(adapter),
    removeAdapter: (adapter) => manager?.remove(adapter),
  }
}

// Core
export { SpatialEngine } from './core/engine'
export type { EngineOptions, FocusMoveDetail } from './core/engine'
export type { Direction, NavRect, ScoringOptions, ElementNavConfig, Candidate } from './core/types'
export { DEFAULT_SCORING, DIRECTIONS } from './core/types'
export {
  findBestCandidate,
  distanceScore,
  classifyDirection,
  projectedOverlap,
  wrapOrigin,
  toNavRect,
  rectCenter,
  unionRects,
  OPPOSITE,
} from './core/geometry'
export { readNavConfig, findContainer, containerChain } from './core/config'
export { DEFAULT_FOCUSABLE_SELECTOR, getFocusables, isElementVisible, isEditable } from './core/dom'

// Events
export { dispatchSpatialEvent } from './events'
export type { SpatialEvent, SpatialEventDetail, SpatialEventType } from './events'

// Input
export { InputManager } from './input/manager'
export { keyboardAdapter, DEFAULT_KEYMAP, DEFAULT_KEYCODE_MAP } from './input/keyboard'
export type { KeyboardAdapterOptions, KeyboardAction } from './input/keyboard'
export { gamepadAdapter } from './input/gamepad'
export type { GamepadAdapterOptions, GamepadAction } from './input/gamepad'
export type { InputAdapter, AdapterContext, NavIntent } from './input/types'
