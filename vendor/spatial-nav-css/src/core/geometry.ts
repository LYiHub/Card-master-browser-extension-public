import type { Direction, NavRect, ScoringOptions } from './types'
import { DEFAULT_SCORING } from './types'

export const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

export function toNavRect(r: DOMRectReadOnly): NavRect {
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
}

export function rectCenter(r: NavRect): { x: number; y: number } {
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
}

export function isHorizontal(dir: Direction): boolean {
  return dir === 'left' || dir === 'right'
}

/** Length of the overlap of two rects projected onto one axis. <= 0 means no overlap. */
export function projectedOverlap(a: NavRect, b: NavRect, axis: 'x' | 'y'): number {
  return axis === 'x'
    ? Math.min(a.right, b.right) - Math.max(a.left, b.left)
    : Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
}

/**
 * Classify whether `candidate` lies in `dir` relative to `origin`.
 *
 *  - 'beyond':      the candidate's near edge is past the origin's far edge —
 *                   unambiguously in the direction of travel.
 *  - 'overlapping': the rects overlap on the navigation axis but the
 *                   candidate's center is still in the direction of travel.
 *                   Used as a fallback tier so overlapping layouts still work.
 *  - null:          not in that direction.
 */
export function classifyDirection(
  origin: NavRect,
  candidate: NavRect,
  dir: Direction,
): 'beyond' | 'overlapping' | null {
  const co = rectCenter(origin)
  const cc = rectCenter(candidate)
  switch (dir) {
    case 'left':
      if (candidate.right <= origin.left) return 'beyond'
      return cc.x < co.x ? 'overlapping' : null
    case 'right':
      if (candidate.left >= origin.right) return 'beyond'
      return cc.x > co.x ? 'overlapping' : null
    case 'up':
      if (candidate.bottom <= origin.top) return 'beyond'
      return cc.y < co.y ? 'overlapping' : null
    case 'down':
      if (candidate.top >= origin.bottom) return 'beyond'
      return cc.y > co.y ? 'overlapping' : null
  }
}

/**
 * Distance score between origin and a candidate for a given direction.
 * Lower is better.
 *
 * The model is inspired by the (discontinued) CSS Spatial Navigation Level 1
 * distance function, simplified for predictability:
 *
 *   score = euclideanGap                    // distance between closest edges
 *         + spanOffset * orthogonalWeight   // real off-axis travel needed
 *         + centerOffset * centerWeight     // mild "most in line" tie-break
 *         + (aligned ? 0 : misalignedPenalty)  // same-row/column grouping
 *
 * spanOffset is the distance from the origin's center to the candidate's
 * *span* on the orthogonal axis — zero when the origin sits laterally within
 * the candidate. This matters for zone candidates: a wide scrolled carousel
 * band that laterally contains the origin needs no off-axis travel and must
 * not be penalized for its breadth (its center can be far off to one side).
 * centerOffset (lightly weighted) then prefers the most in-line candidate
 * among otherwise-equal ones, without letting a wide zone's off-center mass
 * beat genuine proximity.
 *
 * "Aligned" means the projections on the axis orthogonal to `dir` overlap —
 * i.e. the candidate is in the same row (for left/right) or column (for
 * up/down). Aligned candidates always beat misaligned ones, which matches
 * how Panorama-style console UIs feel: pressing "right" stays in the row.
 */
export function distanceScore(
  origin: NavRect,
  candidate: NavRect,
  dir: Direction,
  scoring: ScoringOptions = DEFAULT_SCORING,
): number {
  const gapX = Math.max(candidate.left - origin.right, origin.left - candidate.right, 0)
  const gapY = Math.max(candidate.top - origin.bottom, origin.top - candidate.bottom, 0)
  const euclidean = Math.hypot(gapX, gapY)

  const co = rectCenter(origin)
  const cc = rectCenter(candidate)
  const horizontal = isHorizontal(dir)
  const spanOffset = horizontal
    ? Math.max(candidate.top - co.y, co.y - candidate.bottom, 0)
    : Math.max(candidate.left - co.x, co.x - candidate.right, 0)
  const centerOffset = horizontal ? Math.abs(cc.y - co.y) : Math.abs(cc.x - co.x)
  const overlap = projectedOverlap(origin, candidate, horizontal ? 'y' : 'x')
  // Sliver overlaps don't count as same-row/column: require the overlap to
  // be a meaningful fraction of the origin's own extent (see ScoringOptions.
  // alignedOverlapRatio). Zero-extent origins (collapsed elements, wrap
  // lines) keep the any-overlap rule.
  const originExtent = horizontal ? origin.height : origin.width
  const aligned = overlap > 0 && overlap >= originExtent * scoring.alignedOverlapRatio

  return (
    euclidean +
    spanOffset * scoring.orthogonalWeight +
    centerOffset * scoring.centerWeight +
    (aligned ? 0 : scoring.misalignedPenalty)
  )
}

export interface BestCandidateResult<T> {
  element: T
  rect: NavRect
  score: number
}

/**
 * Pick the best candidate in `dir` from `origin`. Pure function — the engine
 * feeds it DOM rects, tests feed it synthetic ones.
 *
 * Candidates classified 'beyond' are preferred as a tier over 'overlapping'
 * ones; within a tier the lowest distance score wins.
 */
export function findBestCandidate<T>(
  origin: NavRect,
  candidates: ReadonlyArray<{ element: T; rect: NavRect }>,
  dir: Direction,
  scoring: ScoringOptions = DEFAULT_SCORING,
): BestCandidateResult<T> | null {
  let best: BestCandidateResult<T> | null = null
  let bestTier = -1 // 1 = beyond, 0 = overlapping

  for (const c of candidates) {
    if (c.rect.width <= 0 && c.rect.height <= 0) continue
    const cls = classifyDirection(origin, c.rect, dir)
    if (cls === null) continue
    const tier = cls === 'beyond' ? 1 : 0
    const score = distanceScore(origin, c.rect, dir, scoring)
    if (tier > bestTier || (tier === bestTier && best !== null && score < best.score)) {
      best = { element: c.element, rect: c.rect, score }
      bestTier = tier
    }
  }
  return best
}

/** Smallest rect covering all inputs. */
export function unionRects(rects: ReadonlyArray<NavRect>): NavRect {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    if (r.left < left) left = r.left
    if (r.top < top) top = r.top
    if (r.right > right) right = r.right
    if (r.bottom > bottom) bottom = r.bottom
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

/**
 * Virtual origin used for wrap-around navigation: a zero-width/height rect
 * sitting just outside the content extent's edge *opposite* the direction of
 * travel, sharing the orthogonal extent of the previously focused rect so
 * row/column alignment is preserved.
 *
 * `container` must be the union of the candidate rects (content extent), not
 * the container element's box — in a scrollable carousel the content
 * overflows the visible box, and the origin has to clear all of it.
 */
export function wrapOrigin(container: NavRect, from: NavRect, dir: Direction): NavRect {
  switch (dir) {
    case 'right': {
      const x = container.left - 1
      return { left: x, right: x, top: from.top, bottom: from.bottom, width: 0, height: from.height }
    }
    case 'left': {
      const x = container.right + 1
      return { left: x, right: x, top: from.top, bottom: from.bottom, width: 0, height: from.height }
    }
    case 'down': {
      const y = container.top - 1
      return { left: from.left, right: from.right, top: y, bottom: y, width: from.width, height: 0 }
    }
    case 'up': {
      const y = container.bottom + 1
      return { left: from.left, right: from.right, top: y, bottom: y, width: from.width, height: 0 }
    }
  }
}
