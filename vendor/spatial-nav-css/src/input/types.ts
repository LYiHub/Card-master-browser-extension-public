import type { Direction } from '../core/types'

/**
 * Semantic navigation intent, decoupled from the physical device.
 * Adapters translate device events into intents; the engine consumes them.
 */
export type NavIntent =
  | { type: 'direction'; direction: Direction; repeat: boolean; source: string; originalEvent?: Event }
  | { type: 'activate'; source: string; originalEvent?: Event }
  | { type: 'release'; durationMs: number; source: string; originalEvent?: Event }
  | { type: 'back'; source: string; originalEvent?: Event }

export interface AdapterContext {
  /**
   * Deliver an intent. Returns true if it was consumed (adapters typically
   * preventDefault() the originating event when so).
   */
  dispatch(intent: NavIntent): boolean
  readonly window: Window
}

/**
 * A physical input source. Implement this to add new devices —
 * Steamworks action sets, dedicated IR receivers, Kinect, MIDI, whatever.
 */
export interface InputAdapter {
  /** Stable identifier, surfaced as `source` on intents and spatial events. */
  readonly id: string
  start(context: AdapterContext): void
  stop(): void
}
