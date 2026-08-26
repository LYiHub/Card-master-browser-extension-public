import type { Direction } from './core/types'

/**
 * DOM events dispatched by the engine (all bubble and are composed):
 *
 *  - 'spatial:beforefocus'   cancelable — preventDefault() vetoes the move
 *  - 'spatial:focus'         after focus has moved
 *  - 'spatial:nofocustarget' navigation found no target (edge of UI) —
 *                            hook this to paginate, lazy-load, etc.
 *  - 'spatial:activate'      cancelable — preventDefault() suppresses the
 *                            synthetic click on the focused element
 *  - 'spatial:activaterelease' the activate control was released;
 *                            detail.durationMs enables long-press UX
 *  - 'spatial:back'          cancelable — preventDefault() marks it handled
 */
export type SpatialEventType =
  | 'spatial:beforefocus'
  | 'spatial:focus'
  | 'spatial:nofocustarget'
  | 'spatial:activate'
  | 'spatial:activaterelease'
  | 'spatial:back'

export interface SpatialEventDetail {
  direction: Direction | null
  from: HTMLElement | null
  /** Adapter id ('keyboard', 'gamepad', …) or 'api' for programmatic calls. */
  source: string
  /** How long the activate control was held, on 'spatial:activaterelease'. */
  durationMs?: number
}

export type SpatialEvent = CustomEvent<SpatialEventDetail>

/** Dispatch a spatial event. Returns false if a listener called preventDefault(). */
export function dispatchSpatialEvent(
  target: EventTarget,
  type: SpatialEventType,
  detail: SpatialEventDetail,
  cancelable = false,
): boolean {
  return target.dispatchEvent(
    new CustomEvent<SpatialEventDetail>(type, { detail, bubbles: true, composed: true, cancelable }),
  )
}
