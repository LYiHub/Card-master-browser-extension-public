import type { Direction } from '../core/types'
import { isEditable } from '../core/dom'
import type { AdapterContext, InputAdapter } from './types'

export type KeyboardAction = Direction | 'activate' | 'back'

export interface KeyboardAdapterOptions {
  /** Map of KeyboardEvent.key values to actions. Replaces the default map. */
  keymap?: Record<string, KeyboardAction>
  /**
   * Map of legacy KeyboardEvent.keyCode values to actions, merged over the
   * defaults. TV / IR remote platforms (webOS, Tizen, HbbTV) report remote
   * buttons through keyCode, often without a useful `key`.
   */
  keyCodeMap?: Record<number, KeyboardAction>
  /** Don't react while focus is in a text input / textarea / contenteditable. Default true. */
  ignoreEditable?: boolean
  /**
   * Minimum milliseconds between direction intents. Time-based (not
   * `event.repeat`-based — many TV platforms fire held-key repeats without
   * the flag), so it tames both key repeat and remote-control event floods
   * on slow hardware. Releasing the key resets the gate, so a deliberate
   * fresh press is never delayed. Default 0 (off).
   */
  throttleMs?: number
}

export const DEFAULT_KEYMAP: Record<string, KeyboardAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'activate',
  Escape: 'back',
}

/**
 * Legacy keyCodes used by TV and set-top-box remotes (delivered to the page
 * as keyboard events by the platform's IR stack):
 *   37–40  directional pad        13  OK / Enter
 *   461    webOS BACK             10009  Tizen RETURN
 *   8      HbbTV/STB back (only honored outside editable fields)
 */
export const DEFAULT_KEYCODE_MAP: Record<number, KeyboardAction> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'activate',
  27: 'back',
  461: 'back',
  10009: 'back',
}

/**
 * Keyboard adapter. Also the path through which IR remotes work today:
 * webOS / Tizen / HbbTV deliver remote-control buttons as keyboard events.
 */
export function keyboardAdapter(options: KeyboardAdapterOptions = {}): InputAdapter {
  const keymap = options.keymap ?? DEFAULT_KEYMAP
  const keyCodeMap = { ...DEFAULT_KEYCODE_MAP, ...options.keyCodeMap }
  const ignoreEditable = options.ignoreEditable ?? true
  const throttleMs = options.throttleMs ?? 0

  let ctx: AdapterContext | null = null
  // -Infinity = gate open (leading edge): the first press always fires —
  // performance.now() starts near 0, so initializing to 0 would gate the
  // first throttleMs of page lifetime.
  let lastDirectionAt = Number.NEGATIVE_INFINITY
  // Set while an activate press we dispatched is being held; release fires
  // 'spatial:activaterelease' with the hold duration (long-press UX).
  let activateDownAt: number | null = null

  const resolveAction = (event: KeyboardEvent): KeyboardAction | undefined =>
    keymap[event.key] ?? keyCodeMap[event.keyCode]

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!ctx || event.defaultPrevented) return
    if (ignoreEditable && isEditable(event.target)) return

    const action = resolveAction(event)
    if (!action) return

    // Range sliders: leave the slider's own axis to the browser (arrows
    // adjust the value), navigate away on the orthogonal axis.
    if (ignoreEditable && event.target instanceof HTMLInputElement && event.target.type === 'range') {
      const vertical = event.target.getAttribute('aria-orientation') === 'vertical'
      if (!vertical && (action === 'left' || action === 'right')) return
      if (vertical && (action === 'up' || action === 'down')) return
    }

    if (action === 'activate' || action === 'back') {
      // One intent per physical press: a held Enter must not machine-gun
      // clicks (matches the gamepad adapter's edge detection). Still consume
      // the repeats so the browser doesn't fire its own repeated default.
      if (event.repeat) {
        event.preventDefault()
        return
      }
      const consumed = ctx.dispatch({ type: action, source: 'keyboard', originalEvent: event })
      if (consumed) {
        if (action === 'activate') activateDownAt = ctx.window.performance.now()
        event.preventDefault()
      }
      return
    }

    // Direction: optional time-based gate. Dropped events are still
    // consumed so a flood doesn't leak into page scrolling.
    if (throttleMs > 0) {
      const now = ctx.window.performance.now()
      if (now - lastDirectionAt < throttleMs) {
        event.preventDefault()
        return
      }
      lastDirectionAt = now
    }
    const consumed = ctx.dispatch({
      type: 'direction',
      direction: action,
      repeat: event.repeat,
      source: 'keyboard',
      originalEvent: event,
    })
    if (consumed) event.preventDefault()
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!ctx) return
    const action = resolveAction(event)
    if (!action) return
    if (action === 'activate') {
      if (activateDownAt !== null) {
        const durationMs = ctx.window.performance.now() - activateDownAt
        activateDownAt = null
        ctx.dispatch({ type: 'release', durationMs, source: 'keyboard', originalEvent: event })
      }
      return
    }
    // Releasing a direction key resets the throttle gate: a deliberate
    // fresh press is never delayed.
    if (action !== 'back') lastDirectionAt = Number.NEGATIVE_INFINITY
  }

  return {
    id: 'keyboard',
    start(context) {
      ctx = context
      context.window.addEventListener('keydown', onKeyDown)
      context.window.addEventListener('keyup', onKeyUp)
    },
    stop() {
      ctx?.window.removeEventListener('keydown', onKeyDown)
      ctx?.window.removeEventListener('keyup', onKeyUp)
      ctx = null
      lastDirectionAt = Number.NEGATIVE_INFINITY
      activateDownAt = null
    },
  }
}
