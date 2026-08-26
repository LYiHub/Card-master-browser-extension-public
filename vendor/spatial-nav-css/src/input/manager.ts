import type { AdapterContext, InputAdapter, NavIntent } from './types'

/**
 * Owns the set of input adapters and routes their intents to a single
 * handler. Adapters added while running are started immediately.
 */
export class InputManager {
  private readonly adapters = new Set<InputAdapter>()
  private readonly context: AdapterContext
  private running = false

  constructor(handler: (intent: NavIntent) => boolean, win: Window = window) {
    this.context = {
      window: win,
      dispatch: (intent) => handler(intent),
    }
  }

  add(adapter: InputAdapter): void {
    if (this.adapters.has(adapter)) return
    this.adapters.add(adapter)
    if (this.running) adapter.start(this.context)
  }

  remove(adapter: InputAdapter): void {
    if (!this.adapters.delete(adapter)) return
    if (this.running) adapter.stop()
  }

  start(): void {
    if (this.running) return
    this.running = true
    for (const adapter of this.adapters) adapter.start(this.context)
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    for (const adapter of this.adapters) adapter.stop()
  }

  destroy(): void {
    this.stop()
    this.adapters.clear()
  }
}
