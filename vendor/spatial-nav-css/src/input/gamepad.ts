import type { Direction } from '../core/types'
import type { AdapterContext, InputAdapter } from './types'

export type GamepadAction = 'activate' | 'back'

export interface GamepadAdapterOptions {
  /** Stick magnitude below which input is ignored. Default 0.5. */
  deadzone?: number
  /** Delay before a held direction starts repeating, ms. Default 400. */
  initialRepeatDelayMs?: number
  /** Interval between repeats while held, ms. Default 130. */
  repeatIntervalMs?: number
  /**
   * Standard-mapping button index → action. Defaults: 0 (A/Cross) activate,
   * 1 (B/Circle) back. Merged over the defaults.
   */
  buttonMap?: Record<number, GamepadAction>
}

/** Standard-mapping d-pad button indices (https://w3c.github.io/gamepad/#remapping). */
const DPAD: ReadonlyArray<[number, Direction]> = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
]

const DEFAULT_BUTTON_MAP: Record<number, GamepadAction> = { 0: 'activate', 1: 'back' }

interface PadState {
  direction: Direction | null
  nextRepeatAt: number
  buttons: Map<number, boolean>
  /** performance.now() when each mapped button went down (long-press UX). */
  pressedAt: Map<number, number>
}

/**
 * Gamepad API adapter.
 *
 * Covers, with zero configuration:
 *  - XInput devices (Xbox controllers — what "DirectX input" resolves to on
 *    modern Windows) — exposed by every browser with the standard mapping.
 *  - DualShock/DualSense, Switch Pro, and other HID controllers.
 *  - Steam Input: on Steam Deck / Big Picture / the Steam overlay browser,
 *    Steam Input remaps whatever the user binds to a standard gamepad before
 *    it reaches the page, so user rebinding works transparently.
 *
 * Polls via requestAnimationFrame only while at least one pad is connected.
 */
export function gamepadAdapter(options: GamepadAdapterOptions = {}): InputAdapter {
  const deadzone = options.deadzone ?? 0.5
  const initialDelay = options.initialRepeatDelayMs ?? 400
  const repeatInterval = options.repeatIntervalMs ?? 130
  const buttonMap = { ...DEFAULT_BUTTON_MAP, ...options.buttonMap }
  // Precomputed: the poll loop runs per animation frame and must not allocate.
  const buttonEntries: ReadonlyArray<[number, GamepadAction]> = Object.entries(buttonMap).map(
    ([index, action]) => [Number(index), action],
  )

  let ctx: AdapterContext | null = null
  let rafId: number | null = null
  let lastPollAt = 0
  const pads = new Map<number, PadState>()

  // alert()/confirm() freeze all page JS mid-frame; tab switches stop rAF.
  // A gap this large means held-input repeat timers are stale — reset them
  // on resume instead of firing an instant phantom repeat. Kept well above
  // worst-case jank frames so ordinary slow frames still repeat on time.
  const SUSPEND_GAP_MS = 1000

  // Flaky drivers can report NaN/Infinity axes; treat anything non-finite
  // as centered or every NaN comparison reads as "pressed".
  const finite = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

  const readDirection = (pad: Gamepad): Direction | null => {
    for (const [index, dir] of DPAD) {
      if (pad.buttons[index]?.pressed) return dir
    }
    const x = finite(pad.axes[0])
    const y = finite(pad.axes[1])
    if (Math.abs(x) < deadzone && Math.abs(y) < deadzone) return null
    if (Math.abs(x) >= Math.abs(y)) return x > 0 ? 'right' : 'left'
    return y > 0 ? 'down' : 'up'
  }

  const poll = (): void => {
    if (!ctx) return
    const win = ctx.window
    const now = win.performance.now()
    const suspended = lastPollAt > 0 && now - lastPollAt > SUSPEND_GAP_MS
    lastPollAt = now
    const list = win.navigator.getGamepads?.() ?? []
    let anyConnected = false

    for (const pad of list) {
      if (!pad?.connected) continue
      anyConnected = true
      let state = pads.get(pad.index)
      if (!state) {
        state = { direction: null, nextRepeatAt: 0, buttons: new Map(), pressedAt: new Map() }
        pads.set(pad.index, state)
      }
      if (suspended && state.direction) {
        // Resuming from a blocked period with a direction still held:
        // restart the hold as if it had just begun.
        state.nextRepeatAt = now + initialDelay
      }

      const dir = readDirection(pad)
      if (dir !== state.direction) {
        state.direction = dir
        if (dir) {
          ctx.dispatch({ type: 'direction', direction: dir, repeat: false, source: 'gamepad' })
          state.nextRepeatAt = now + initialDelay
        }
      } else if (dir && now >= state.nextRepeatAt) {
        ctx.dispatch({ type: 'direction', direction: dir, repeat: true, source: 'gamepad' })
        state.nextRepeatAt = now + repeatInterval
      }

      for (const [i, action] of buttonEntries) {
        const pressed = pad.buttons[i]?.pressed ?? false
        const wasPressed = state.buttons.get(i) ?? false
        if (pressed && !wasPressed) {
          ctx.dispatch({ type: action, source: 'gamepad' })
          state.pressedAt.set(i, now)
        } else if (!pressed && wasPressed && action === 'activate') {
          const downAt = state.pressedAt.get(i)
          if (downAt !== undefined) {
            state.pressedAt.delete(i)
            ctx.dispatch({ type: 'release', durationMs: now - downAt, source: 'gamepad' })
          }
        }
        state.buttons.set(i, pressed)
      }
    }

    rafId = anyConnected ? win.requestAnimationFrame(poll) : null
  }

  const ensurePolling = (): void => {
    if (ctx && rafId === null) rafId = ctx.window.requestAnimationFrame(poll)
  }

  const onConnected = (): void => ensurePolling()
  const onDisconnected = (event: GamepadEvent): void => {
    pads.delete(event.gamepad.index)
  }

  return {
    id: 'gamepad',
    start(context) {
      ctx = context
      context.window.addEventListener('gamepadconnected', onConnected)
      context.window.addEventListener('gamepaddisconnected', onDisconnected)
      // A pad may already be connected (no event fires for pre-existing pads
      // until an input, but poll defensively — it self-stops when none).
      ensurePolling()
    },
    stop() {
      if (ctx && rafId !== null) ctx.window.cancelAnimationFrame(rafId)
      rafId = null
      ctx?.window.removeEventListener('gamepadconnected', onConnected)
      ctx?.window.removeEventListener('gamepaddisconnected', onDisconnected)
      pads.clear()
      ctx = null
    },
  }
}
