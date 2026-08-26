export type Point = { x: number; y: number };
export type ActionHitSample = {
  pointer: Point;
  cardCenter: Point;
};
export type CornerActionPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type ActionBounds = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

export type CentralActionRegion = {
  centerX: number;
  baselineY: number;
  radiusX: number;
  radiusY: number;
};

export const CARD_ASPECT = 3 / 4;
export const CARD_COLLECTION_LOGO_DIAMETER = 56;
export const CARD_COLLECTION_CARD_DIAMETER = 44;
export const DRAG_THRESHOLD = 8;
export const ACTION_EXIT_DISTANCE = 148;
export const ACTION_RETURN_DISTANCE = 96;
export const ACTION_TARGET_HIT_TOLERANCE = 18;
export const ACTION_TARGET_EXIT_TOLERANCE = 18;
export const ACTION_TARGET_LOCK_EXIT_TOLERANCE = 72;
export const ACTION_TARGET_FAST_RELEASE_TOLERANCE = 120;
export const ACTION_TARGET_FAST_RELEASE_GRACE_MS = 120;
export const INTERACTION_Z_INDEX = 320;
export const ACTIVE_CARD_SCALE = 1.25;
export const ACTIVE_CARD_RISE = 12;
export const CARD_DEAL_DURATION = 0.82;
export const CARD_DEAL_STAGGER = 0.06;
export const CARD_DEAL_MAX_SEQUENCE_DURATION = 1.45;
export const CARD_COLLECT_DURATION = 0.7;
export const CARD_CAST_COLLECT_DURATION = 0.5;
export const CARD_COLLECT_STAGGER = 0.072;
const CARD_HOVER_EDGE_MARGIN = 14;
const CARD_HOVER_SWITCH_HYSTERESIS = 6;
const CARD_FAN_MAX_ROTATION = 8.5;
const CARD_FAN_MAX_GAP_RATIO = 0.76;
const CARD_FAN_EDGE_DROP = 18;
const CARD_FAN_VIEWPORT_MARGIN = 12;
const CARD_FOCUSED_SHIFT_X = -22;
const CARD_FOCUS_SCALE_PROFILE = [ACTIVE_CARD_SCALE, 1.1, 1, 0.95, 0.9];
const CARD_FOCUS_SHIFT_STEP = 12;
const CARD_FOCUS_SHIFT_DISTANCE = 4;
const CARD_FOCUS_VERTICAL_BASE = 5;
const CARD_FOCUS_VERTICAL_STEP = 2;
const CORNER_ACTION_VIEWPORT_WIDTH_RATIO = 0.27;
const CORNER_ACTION_MIN_CARD_HEIGHT_RATIO = 0.58;
const CORNER_ACTION_MAX_CARD_HEIGHT_RATIO = 1.05;
const CORNER_ACTION_MAX_VIEWPORT_HEIGHT_RATIO = 0.42;

export function cardScaleInsideCircle(
  cardWidth: number,
  cardHeight: number,
  circleDiameter: number,
) {
  const diagonal = Math.hypot(cardWidth, cardHeight);
  return diagonal > 0 ? Math.max(0, circleDiameter) / diagonal : 0;
}

export function cardSequenceDuration(
  total: number,
  duration: number,
  stagger: number,
  maxDuration = Number.POSITIVE_INFINITY,
) {
  return (
    duration +
    Math.max(0, total - 1) *
      cardSequenceStagger(total, duration, stagger, maxDuration)
  );
}

export function cardSequenceStagger(
  total: number,
  duration: number,
  preferredStagger: number,
  maxDuration = Number.POSITIVE_INFINITY,
) {
  const gaps = Math.max(0, total - 1);
  if (gaps === 0) return 0;
  return Math.max(
    0,
    Math.min(preferredStagger, (maxDuration - duration) / gaps),
  );
}

export function actionRegionContains(
  point: Point,
  bounds: ActionBounds,
  corner?: CornerActionPosition,
  tolerance = 0,
) {
  const insideBounds =
    point.x >= bounds.left - tolerance &&
    point.x <= bounds.right + tolerance &&
    point.y >= bounds.top - tolerance &&
    point.y <= bounds.bottom + tolerance;
  if (!corner) return insideBounds;

  const radius = Math.min(bounds.width, bounds.height) + tolerance;
  const origin =
    corner === 'top-left'
      ? { x: bounds.left, y: bounds.top }
      : corner === 'top-right'
        ? { x: bounds.right, y: bounds.top }
        : corner === 'bottom-left'
          ? { x: bounds.left, y: bounds.bottom }
          : { x: bounds.right, y: bounds.bottom };
  const insideCornerDirection =
    corner === 'top-left'
      ? point.x <= bounds.right + tolerance &&
        point.y <= bounds.bottom + tolerance
      : corner === 'top-right'
        ? point.x >= bounds.left - tolerance &&
          point.y <= bounds.bottom + tolerance
        : corner === 'bottom-left'
          ? point.x <= bounds.right + tolerance &&
            point.y >= bounds.top - tolerance
          : point.x >= bounds.left - tolerance &&
            point.y >= bounds.top - tolerance;
  return (
    insideCornerDirection &&
    Math.hypot(point.x - origin.x, point.y - origin.y) <= radius
  );
}

export function centralActionRegionContains(
  point: Point,
  region: CentralActionRegion,
  tolerance = 0,
) {
  const radiusX = region.radiusX + tolerance;
  const radiusY = region.radiusY + tolerance;
  if (point.y > region.baselineY + tolerance || radiusX <= 0 || radiusY <= 0)
    return false;
  const x = (point.x - region.centerX) / radiusX;
  const y = (region.baselineY - point.y) / radiusY;
  return x * x + y * y <= 1;
}

export function actionModeForOffset(
  active: boolean,
  offset: Point,
  insideAction: boolean,
  exitDistance: number,
  returnDistance: number,
) {
  if (insideAction) return true;
  return active ? offset.y < -returnDistance : offset.y <= -exitDistance;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type CardTransformGeometry = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

export function cardTransformBounds({
  x,
  y,
  rotation,
  scale,
  left,
  top,
  width,
  height,
}: CardTransformGeometry): ActionBounds {
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const originX = left + width / 2 + x;
  const originY = top + height + y;
  const corners = [
    { x: -width / 2, y: -height },
    { x: width / 2, y: -height },
    { x: width / 2, y: 0 },
    { x: -width / 2, y: 0 },
  ].map((point) => ({
    x: originX + (point.x * cosine - point.y * sine) * scale,
    y: originY + (point.x * sine + point.y * cosine) * scale,
  }));
  const horizontal = corners.map((point) => point.x);
  const vertical = corners.map((point) => point.y);
  const boundLeft = Math.min(...horizontal);
  const boundRight = Math.max(...horizontal);
  const boundTop = Math.min(...vertical);
  const boundBottom = Math.max(...vertical);
  return {
    top: boundTop,
    right: boundRight,
    bottom: boundBottom,
    left: boundLeft,
    width: boundRight - boundLeft,
    height: boundBottom - boundTop,
  };
}

export function cardTransformContainsPoint(
  point: Point,
  { x, y, rotation, scale, left, top, width, height }: CardTransformGeometry,
  margin = 0,
) {
  if (scale <= 0 || width <= 0 || height <= 0) return false;
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const originX = left + width / 2 + x;
  const originY = top + height + y;
  const deltaX = point.x - originX;
  const deltaY = point.y - originY;
  const localX = (deltaX * cosine + deltaY * sine) / scale;
  const localY = (-deltaX * sine + deltaY * cosine) / scale;
  const localMargin = Math.max(0, margin) / scale;
  return (
    localX >= -width / 2 - localMargin &&
    localX <= width / 2 + localMargin &&
    localY >= -height - localMargin &&
    localY <= localMargin
  );
}

export function constrainCardTransformToViewport({
  viewportWidth,
  viewportHeight,
  margin,
  ...geometry
}: CardTransformGeometry & {
  viewportWidth: number;
  viewportHeight: number;
  margin: number;
}) {
  const bounds = cardTransformBounds(geometry);
  const availableWidth = Math.max(0, viewportWidth - margin * 2);
  const availableHeight = Math.max(0, viewportHeight - margin * 2);
  const correctionX =
    bounds.width > availableWidth
      ? viewportWidth / 2 - (bounds.left + bounds.right) / 2
      : bounds.left < margin
        ? margin - bounds.left
        : bounds.right > viewportWidth - margin
          ? viewportWidth - margin - bounds.right
          : 0;
  const correctionY =
    bounds.height > availableHeight
      ? viewportHeight / 2 - (bounds.top + bounds.bottom) / 2
      : bounds.top < margin
        ? margin - bounds.top
        : bounds.bottom > viewportHeight - margin
          ? viewportHeight - margin - bounds.bottom
          : 0;
  const radians = (geometry.rotation * Math.PI) / 180;
  const centerOffset = {
    x: (Math.sin(radians) * geometry.height * geometry.scale) / 2,
    y: (-Math.cos(radians) * geometry.height * geometry.scale) / 2,
  };
  return {
    x: geometry.x + correctionX,
    y: geometry.y + correctionY,
    cardCenter: {
      x:
        geometry.left +
        geometry.width / 2 +
        geometry.x +
        correctionX +
        centerOffset.x,
      y:
        geometry.top +
        geometry.height +
        geometry.y +
        correctionY +
        centerOffset.y,
    },
  };
}

export function cardAvoidanceRegionContains(
  point: Point,
  bounds: Pick<ActionBounds, 'top' | 'left' | 'width' | 'height'>,
  evading: boolean,
) {
  const enterPaddingX = Math.max(148, bounds.width * 0.9);
  const enterPaddingY = Math.max(116, bounds.height * 0.55);
  const exitPaddingX = evading ? Math.max(88, bounds.width * 0.5) : 0;
  const exitPaddingY = evading ? Math.max(84, bounds.height * 0.38) : 0;
  const paddingX = enterPaddingX + exitPaddingX;
  const paddingY = enterPaddingY + exitPaddingY;

  return (
    point.x >= bounds.left - paddingX &&
    point.x <= bounds.left + bounds.width + paddingX &&
    point.y >= bounds.top - paddingY &&
    point.y <= bounds.top + bounds.height + paddingY
  );
}

export function oppositeHalfViewportCenter(
  cardCenter: Point,
  viewport: { width: number; height: number },
) {
  return {
    x: viewport.width * (cardCenter.x < viewport.width / 2 ? 0.75 : 0.25),
    y: viewport.height * 0.5,
  };
}

function cardFanMetrics(
  total: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  // Responsive density is horizontal only. Every card keeps the same fan
  // baseline while overlap increases as the available width contracts.
  const dimensions = managerCardDimensions(viewportWidth);
  const count = Math.max(1, Math.trunc(total));
  const gaps = Math.max(0, count - 1);

  const maximumRotation = (CARD_FAN_MAX_ROTATION * Math.PI) / 180;
  const outerExtent =
    dimensions.width * Math.cos(maximumRotation) * 0.5 +
    dimensions.height * Math.sin(maximumRotation);
  const safeRadius = managerCornerActionRadius(viewportWidth, viewportHeight);
  const maximumCenterSpan = Math.max(
    0,
    viewportWidth - 2 * (outerExtent + CARD_FAN_VIEWPORT_MARGIN),
  );
  const maximumFanSpan = Math.min(
    maximumCenterSpan,
    dimensions.width * CARD_FAN_MAX_GAP_RATIO * gaps,
  );
  const cornerSafeSpan = Math.max(
    0,
    viewportWidth - 2 * (outerExtent + safeRadius),
  );
  return {
    gap: gaps === 0 ? 0 : Math.min(maximumFanSpan, cornerSafeSpan) / gaps,
  };
}

export function cardLayout(
  index: number,
  total: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const center = (Math.max(1, total) - 1) / 2;
  const relative = index - center;
  const normalized = center === 0 ? 0 : relative / center;
  const rotation = normalized * CARD_FAN_MAX_ROTATION;
  const { gap } = cardFanMetrics(total, viewportWidth, viewportHeight);
  const edgeProgress = Math.abs(normalized) ** 1.45;
  return {
    x: relative * gap,
    y: edgeProgress * CARD_FAN_EDGE_DROP,
    rotation,
    scale: 1,
  };
}

export function managerCornerActionRadius(
  viewportWidth: number,
  viewportHeight: number,
) {
  const cardHeight = managerCardDimensions(viewportWidth).height;
  const maximum = Math.min(
    cardHeight * CORNER_ACTION_MAX_CARD_HEIGHT_RATIO,
    viewportHeight * CORNER_ACTION_MAX_VIEWPORT_HEIGHT_RATIO,
  );
  const minimum = Math.min(
    cardHeight * CORNER_ACTION_MIN_CARD_HEIGHT_RATIO,
    maximum,
  );
  return clamp(
    viewportWidth * CORNER_ACTION_VIEWPORT_WIDTH_RATIO,
    minimum,
    maximum,
  );
}

export function managerCardDimensions(viewportWidth: number) {
  const compact = viewportWidth <= 900;
  const width = compact ? 126 : 150;
  return {
    compact,
    width,
    height: width / CARD_ASPECT,
    bottom: compact ? 30 : 38,
  };
}

export function cardHoverIndexAtPoint({
  point,
  total,
  viewportWidth,
  viewportHeight,
  currentIndex = null,
}: {
  point: Point;
  total: number;
  viewportWidth: number;
  viewportHeight: number;
  currentIndex?: number | null;
}) {
  const count = Math.max(0, Math.trunc(total));
  if (count === 0) return null;

  const dimensions = managerCardDimensions(viewportWidth);
  const layouts = Array.from({ length: count }, (_, index) =>
    cardLayout(index, count, viewportWidth, viewportHeight),
  );
  const validCurrentIndex =
    currentIndex !== null && currentIndex >= 0 && currentIndex < count
      ? currentIndex
      : null;
  const cardOrigin = {
    left: viewportWidth / 2 - dimensions.width / 2,
    top: viewportHeight - dimensions.bottom - dimensions.height,
    width: dimensions.width,
    height: dimensions.height,
  };
  const contains = (transform: ReturnType<typeof cardLayout>, margin = 0) =>
    cardTransformContainsPoint(
      point,
      {
        ...cardOrigin,
        ...transform,
      },
      margin,
    );
  const topmostBaseCard = (margin = 0) => {
    for (let index = count - 1; index >= 0; index -= 1) {
      if (contains(layouts[index], margin)) return index;
    }
    return null;
  };
  const baseOwner = topmostBaseCard();

  if (validCurrentIndex !== null) {
    const focusedTransform = formationCardLayout(
      layouts[validCurrentIndex],
      validCurrentIndex,
      validCurrentIndex,
    );
    if (
      (baseOwner === null || validCurrentIndex >= baseOwner) &&
      contains(focusedTransform, CARD_HOVER_SWITCH_HYSTERESIS)
    )
      return validCurrentIndex;
  }

  return baseOwner ?? topmostBaseCard(CARD_HOVER_EDGE_MARGIN);
}

export function actionFanLayout(
  index: number,
  total: number,
  viewportWidth: number,
) {
  const compact = viewportWidth <= 720;
  const inset = clamp(viewportWidth * 0.036, compact ? 18 : 28, 72);
  const span = Math.max(260, viewportWidth - inset * 2);
  const zoneWidth = span / Math.max(1, total);
  const normalized = total <= 1 ? 0 : (index / (total - 1)) * 2 - 1;
  const badgeWidth = Math.min(
    compact ? 168 : 190,
    Math.max(64, zoneWidth * 0.96),
    zoneWidth * 0.98,
  );
  const arcDepth = compact ? 44 : 64;
  const baseline = compact ? 12 : 18;
  return {
    x: -span / 2 + zoneWidth * (index + 0.5),
    y: baseline - (1 - normalized * normalized) * arcDepth,
    span,
    zoneWidth,
    left: -span / 2 + zoneWidth * index,
    badgeWidth,
    labelFontSize: clamp(badgeWidth / 9.4, 14, 20),
    descriptionFontSize: clamp(badgeWidth / 14, 13, 14),
  };
}

export function centerOutSlotIndex(index: number, total: number) {
  const count = Math.max(1, Math.trunc(total));
  const order = Math.min(count - 1, Math.max(0, Math.trunc(index)));
  if (count % 2 === 1) {
    const center = Math.floor(count / 2);
    if (order === 0) return center;
    const offset = Math.ceil(order / 2);
    return center + (order % 2 === 1 ? -offset : offset);
  }
  const centerLeft = count / 2 - 1;
  const offset = Math.floor(order / 2);
  return order % 2 === 0 ? centerLeft - offset : centerLeft + 1 + offset;
}

export function actionArcHeight(viewportHeight: number) {
  return Math.min(520, viewportHeight * 0.54);
}

function dockCardState(index: number, focusedIndex: number | null) {
  if (focusedIndex === null) return { scale: 1, shift: 0, distance: 0 };
  const distance = Math.abs(index - focusedIndex);
  const scale =
    CARD_FOCUS_SCALE_PROFILE[Math.min(distance, CARD_FOCUS_SHIFT_DISTANCE)];
  const direction = Math.sign(index - focusedIndex);
  return {
    scale,
    shift:
      direction *
      Math.max(0, CARD_FOCUS_SHIFT_DISTANCE - distance) *
      CARD_FOCUS_SHIFT_STEP,
    distance,
  };
}

export function formationCardLayout(
  layout: ReturnType<typeof cardLayout>,
  index: number,
  focusedIndex: number | null,
) {
  const focused = focusedIndex === index;
  const dock = dockCardState(index, focusedIndex);
  return {
    x: layout.x + dock.shift + (focused ? CARD_FOCUSED_SHIFT_X : 0),
    y:
      layout.y +
      (focused
        ? -ACTIVE_CARD_RISE
        : focusedIndex === null
          ? 0
          : Math.min(
              14,
              CARD_FOCUS_VERTICAL_BASE +
                dock.distance * CARD_FOCUS_VERTICAL_STEP,
            )),
    rotation: focused ? 0 : layout.rotation,
    scale: dock.scale,
    distance: dock.distance,
  };
}

export function magicAimPath(origin: Point, target: Point) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const lift = Math.min(184, 58 + distance * 0.18);
  return `M ${origin.x} ${origin.y} C ${origin.x + dx * 0.28} ${origin.y + dy * 0.26 - lift}, ${origin.x + dx * 0.72} ${origin.y + dy * 0.74 - lift * 0.58}, ${target.x} ${target.y}`;
}
