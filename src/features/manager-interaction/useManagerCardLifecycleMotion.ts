import {
  type MutableRefObject,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

import type { AudioDirector } from '../../audio/AudioDirector';
import { CARD_STAGE_RETREAT_DISTANCE } from '../../components/card-stage-motion';
import { gsap } from '../../motion/gsap';
import { animateCardToFormation } from './animate-card-to-formation';
import { deckLaunchSourceReady } from './deck-launch-readiness';
import {
  CARD_CAST_COLLECT_DURATION,
  CARD_COLLECT_DURATION,
  CARD_COLLECT_STAGGER,
  CARD_COLLECTION_CARD_DIAMETER,
  CARD_DEAL_DURATION,
  CARD_DEAL_MAX_SEQUENCE_DURATION,
  CARD_DEAL_STAGGER,
  type cardLayout,
  cardScaleInsideCircle,
  cardSequenceStagger,
  type formationCardLayout,
  INTERACTION_Z_INDEX,
  managerCardDimensions,
} from './layout';
import {
  CARD_RETREAT_DURATION_SECONDS,
  CARD_RETREAT_STAGGER_SECONDS,
} from './motion-timing';
import type { CardCollectionRole, ManagerMode } from './state';

type CardLayout = ReturnType<typeof cardLayout>;
type CardFormation = ReturnType<typeof formationCardLayout>;

export type ManagerDeckSource =
  | RefObject<HTMLElement | null>
  | HTMLElement
  | null;

type ManagerCardLifecycleMotionOptions = {
  itemId: string;
  index: number;
  total: number;
  mode: ManagerMode;
  selected: boolean;
  selectedIndex: number;
  focused: boolean;
  dragging: boolean;
  arriving: boolean;
  interactionOwner: boolean;
  stableZIndex: number;
  dealActive: boolean;
  dealSettled: boolean;
  dealCycle: number;
  collectCycle: number;
  collectionRole: CardCollectionRole;
  layout: CardLayout;
  formation: CardFormation;
  deckSource: ManagerDeckSource;
  viewportWidth: number;
  viewportHeight: number;
  retreated: boolean;
  audio: AudioDirector;
  rootRef: RefObject<HTMLButtonElement | null>;
  flipperRef: RefObject<HTMLDivElement | null>;
  reorderSettlingRef: MutableRefObject<boolean>;
  resetGesture: () => void;
  onDealSettled: () => void;
  onDealReady: () => void;
  onDealComplete: () => void;
  onCollectAll: () => void;
  onArrivalComplete: (id: string) => void;
  onReturnComplete: (id: string) => void;
};

function deckElementFrom(source: ManagerDeckSource) {
  return source && 'current' in source ? source.current : source;
}

function submergedCardLayout(
  layoutX: number,
  layoutY: number,
  layoutRotation: number,
  index: number,
  anchorIndex: number,
) {
  const direction = Math.sign(index - anchorIndex) || (index % 2 ? 1 : -1);
  const distance = Math.abs(index - anchorIndex);
  return {
    x: layoutX + direction * (58 + Math.min(distance, 4) * 10),
    y: layoutY + CARD_STAGE_RETREAT_DISTANCE,
    rotation: layoutRotation + direction * 7,
    scale: 0.86,
    delay: distance * CARD_RETREAT_STAGGER_SECONDS,
  };
}

type SubmergedCardLayout = ReturnType<typeof submergedCardLayout>;

function cardTransform(layout: SubmergedCardLayout) {
  return {
    x: layout.x,
    y: layout.y,
    rotation: layout.rotation,
    scale: layout.scale,
  };
}

function cardSubmergeTween(
  layout: SubmergedCardLayout,
  options: { delay?: number; duration?: number; zIndex?: number } = {},
) {
  return {
    ...cardTransform(layout),
    duration: options.duration ?? CARD_RETREAT_DURATION_SECONDS,
    delay: options.delay ?? layout.delay,
    ease: 'power3.in',
    overwrite: 'auto' as const,
    ...(options.zIndex === undefined ? {} : { zIndex: options.zIndex }),
  };
}

function isBottomLaunchSource(element: HTMLElement) {
  return element.classList.contains('manager-deck-launch-anchor');
}

export function deckCardLaunchLayout(
  deck: HTMLElement,
  zIndex: number,
  viewport: { width: number; height: number },
) {
  const stableEntry = deck.closest?.<HTMLElement>(
    '.manager-deck-entry-cluster',
  );
  const logo = deck.querySelector<HTMLElement>('.manager-deck-trigger__logo');
  const deckBounds =
    stableEntry?.getBoundingClientRect() ??
    logo?.getBoundingClientRect() ??
    deck.getBoundingClientRect();
  const dimensions = managerCardDimensions(viewport.width);
  const scale = cardScaleInsideCircle(
    dimensions.width,
    dimensions.height,
    CARD_COLLECTION_CARD_DIAMETER,
  );
  const baseCenterX = viewport.width / 2;
  const baseBottomY = viewport.height - dimensions.bottom;
  return {
    x: deckBounds.left + deckBounds.width / 2 - baseCenterX,
    y:
      deckBounds.top +
      deckBounds.height / 2 +
      (dimensions.height * scale) / 2 -
      baseBottomY,
    rotation: 0,
    scale,
    zIndex,
  };
}

export function deckDealDelay(
  index: number,
  total: number,
  bottomLaunch: boolean,
) {
  const duration = bottomLaunch ? 0.72 : CARD_DEAL_DURATION;
  const stagger = cardSequenceStagger(
    total,
    duration,
    bottomLaunch ? 0.05 : CARD_DEAL_STAGGER,
    CARD_DEAL_MAX_SEQUENCE_DURATION,
  );
  return index * stagger;
}

export function deckCollectDelay(
  index: number,
  total: number,
  bottomLaunch: boolean,
  immediate: boolean,
  dealSettled: boolean,
) {
  if (immediate || !dealSettled) return 0;
  return (
    (total - 1 - index) *
    (bottomLaunch ? CARD_RETREAT_STAGGER_SECONDS : CARD_COLLECT_STAGGER)
  );
}

export function deckFlightArcY(
  deck: HTMLElement,
  startY: number,
  endY: number,
  viewportHeight: number,
  lift: number,
) {
  const bounds = deck.getBoundingClientRect();
  const deckCenterY = bounds.top + bounds.height / 2;
  return deckCenterY < viewportHeight * 0.38
    ? startY + (endY - startY) * 0.5 + lift
    : Math.min(startY, endY) - lift;
}

type DeckFlightPoint = { x: number; y: number };

const DECK_TAKEOFF_LIFT = 28;
const DECK_DEAL_FLIP_DELAY = 0.12;
const DECK_DEAL_FLIP_DURATION = 0.64;

export type DeckFlight = {
  takeoff: DeckFlightPoint;
  apex: DeckFlightPoint;
  rise: DeckFlightPoint[];
  fall: DeckFlightPoint[];
  path: DeckFlightPoint[];
};

export function deckCardSpaceMidY(
  viewportHeight: number,
  cardHeight: number,
  cardBottom: number,
) {
  return cardBottom + cardHeight / 2 - viewportHeight / 2;
}

function deckAngleDelta(from: number, to: number) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function deckCircularArc(
  start: DeckFlightPoint,
  through: DeckFlightPoint,
  end: DeckFlightPoint,
  samples = 16,
): DeckFlightPoint[] {
  const determinant =
    2 *
    (start.x * (through.y - end.y) +
      through.x * (end.y - start.y) +
      end.x * (start.y - through.y));
  if (Math.abs(determinant) < 1e-6) return [start, through, end];
  const startPower = start.x * start.x + start.y * start.y;
  const throughPower = through.x * through.x + through.y * through.y;
  const endPower = end.x * end.x + end.y * end.y;
  const cx =
    (startPower * (through.y - end.y) +
      throughPower * (end.y - start.y) +
      endPower * (start.y - through.y)) /
    determinant;
  const cy =
    (startPower * (end.x - through.x) +
      throughPower * (start.x - end.x) +
      endPower * (through.x - start.x)) /
    determinant;
  const radius = Math.hypot(start.x - cx, start.y - cy);
  if (radius < 1) return [start, through, end];
  const startAngle = Math.atan2(start.y - cy, start.x - cx);
  const throughAngle = Math.atan2(through.y - cy, through.x - cx);
  const endAngle = Math.atan2(end.y - cy, end.x - cx);
  const sweep =
    deckAngleDelta(startAngle, throughAngle) +
    deckAngleDelta(throughAngle, endAngle);
  if (Math.abs(sweep) < 1e-3) return [start, through, end];
  const count = Math.max(3, samples);
  const path = Array.from({ length: count }, (_, index) => {
    const angle = startAngle + sweep * (index / (count - 1));
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
  path[0] = start;
  path[count - 1] = end;
  return path;
}

export function deckDealFlight(
  launch: DeckFlightPoint,
  target: DeckFlightPoint,
  options: { midY: number },
): DeckFlight {
  const alreadyHigh = Math.min(launch.y, target.y) <= options.midY;
  const apex = {
    x: launch.x + (target.x - launch.x) * 0.5,
    y: alreadyHigh ? Math.min(launch.y, target.y) - 48 : options.midY,
  };
  const path = deckCircularArc(launch, apex, target);
  return {
    takeoff: path[1] ?? launch,
    apex,
    rise: path,
    fall: path,
    path,
  };
}

export function deckCollectFlight(
  launch: DeckFlightPoint,
  current: DeckFlightPoint,
): DeckFlight {
  if (Math.hypot(current.x - launch.x, current.y - launch.y) < 0.5) {
    return {
      takeoff: launch,
      apex: launch,
      rise: [current, launch],
      fall: [launch, launch],
      path: [current, launch],
    };
  }
  const mid = {
    x: current.x + (launch.x - current.x) * 0.55,
    y: current.y + (launch.y - current.y) * 0.55,
  };
  return {
    takeoff: current,
    apex: mid,
    rise: [current, mid],
    fall: [mid, launch],
    path: [current, mid, launch],
  };
}

export function deckDealFlightPath(
  launch: DeckFlightPoint,
  target: DeckFlightPoint,
  options: { midY: number },
) {
  return deckDealFlight(launch, target, options).path;
}

export function deckCollectFlightPath(
  launch: DeckFlightPoint,
  current: DeckFlightPoint,
) {
  return deckCollectFlight(launch, current).path;
}

export function deckFlightFlip(travelDuration: number) {
  return {
    delay: DECK_DEAL_FLIP_DELAY,
    duration: DECK_DEAL_FLIP_DURATION,
    ease: 'power2.inOut' as const,
    travelDuration,
  };
}

export function deckCollectTiming(duration: number, scaleUp = duration / 5) {
  return {
    scaleUp,
    flipDuration: scaleUp * 4,
    ease: 'none' as const,
  };
}

export function deckMotionPath(points: readonly DeckFlightPoint[]) {
  const path = points.filter((point, index) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    if (index === 0) return true;
    const previous = points[index - 1];
    return (
      !!previous && Math.hypot(point.x - previous.x, point.y - previous.y) > 0.5
    );
  });
  if (path.length >= 3) return path;
  if (path.length === 2) {
    return [
      path[0],
      {
        x: (path[0].x + path[1].x) / 2,
        y: Math.min(path[0].y, path[1].y) - DECK_TAKEOFF_LIFT,
      },
      path[1],
    ];
  }
  return null;
}

export function useManagerCardLifecycleMotion({
  itemId,
  index,
  total,
  mode,
  selected,
  selectedIndex,
  focused,
  dragging,
  arriving,
  interactionOwner,
  stableZIndex,
  dealActive,
  dealSettled,
  dealCycle,
  collectCycle,
  collectionRole,
  layout,
  formation,
  deckSource,
  viewportWidth,
  viewportHeight,
  retreated,
  audio,
  rootRef,
  flipperRef,
  reorderSettlingRef,
  resetGesture,
  onDealSettled,
  onDealReady,
  onDealComplete,
  onCollectAll,
  onArrivalComplete,
  onReturnComplete,
}: ManagerCardLifecycleMotionOptions) {
  const previousModeRef = useRef<ManagerMode>(mode);
  const previousRetreatedRef = useRef(retreated);
  const returnAnimationRef = useRef<gsap.core.Animation | null>(null);

  useEffect(
    () => () => {
      returnAnimationRef.current?.kill();
      const animated = [rootRef.current, flipperRef.current];
      gsap.killTweensOf(animated.filter(Boolean));
    },
    [flipperRef, rootRef],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    const flipper = flipperRef.current;
    const deck = deckElementFrom(deckSource);
    if (
      !dealActive ||
      !root ||
      !flipper ||
      !deck ||
      !deckLaunchSourceReady(deck) ||
      dealCycle === 0
    )
      return;
    reorderSettlingRef.current = false;
    const bottomLaunch = isBottomLaunchSource(deck);
    const launchLayout = bottomLaunch
      ? submergedCardLayout(0, 0, 0, index, (total - 1) / 2)
      : deckCardLaunchLayout(deck, stableZIndex, {
          width: viewportWidth,
          height: viewportHeight,
        });
    const flightDelay = deckDealDelay(index, total, bottomLaunch);
    gsap.killTweensOf([root, flipper]);
    gsap.set(root, {
      clearProps: 'opacity,visibility',
      x: launchLayout.x,
      y: launchLayout.y,
      rotation: launchLayout.rotation,
      scale: launchLayout.scale,
      zIndex: 'zIndex' in launchLayout ? launchLayout.zIndex : stableZIndex,
    });
    gsap.set(flipper, { rotationY: bottomLaunch ? 0 : 180 });
    const currentX = Number(gsap.getProperty(root, 'x'));
    const currentY = Number(gsap.getProperty(root, 'y'));
    const currentScale = Number(gsap.getProperty(root, 'scale'));
    const arcX = currentX + (layout.x - currentX) * 0.58;
    const arcY = bottomLaunch
      ? layout.y + 52
      : deckFlightArcY(deck, currentY, layout.y, viewportHeight, 72);
    const flightDuration = bottomLaunch ? 0.72 : CARD_DEAL_DURATION;
    const timeline = gsap
      .timeline({
        delay: flightDelay,
        onStart: () => {
          audio.play('cardDeal', {
            positionX: root.getBoundingClientRect().left,
          });
        },
        onComplete: () => {
          onDealSettled();
          if (index === 0) onDealReady();
          if (index === total - 1) onDealComplete();
        },
      })
      .to(
        root,
        {
          motionPath: {
            path: [
              {
                x: currentX + (bottomLaunch ? 0 : -9),
                y: currentY - 24,
              },
              { x: arcX, y: arcY },
              { x: layout.x, y: layout.y },
            ],
            curviness: 1.28,
            autoRotate: false,
          },
          duration: flightDuration,
          ease: 'power1.inOut',
        },
        0,
      )
      .to(
        root,
        {
          keyframes: [
            {
              rotation: bottomLaunch
                ? layout.rotation - 3 + (index % 3)
                : -8 + (index % 3) * 2,
              scale: bottomLaunch
                ? Math.max(0.9, currentScale * 1.04)
                : currentScale * 1.06,
              duration: bottomLaunch ? 0.14 : 0.17,
              ease: 'power2.out',
            },
            {
              rotation: layout.rotation + (bottomLaunch ? 4 : 6),
              scale: layout.scale * (bottomLaunch ? 1.055 : 1.03),
              duration: bottomLaunch ? 0.3 : 0.36,
              ease: 'sine.inOut',
            },
            {
              rotation: layout.rotation,
              scale: layout.scale,
              duration: bottomLaunch ? 0.24 : 0.29,
              ease: `back.out(${bottomLaunch ? 1.48 : 1.36})`,
            },
          ],
        },
        0,
      )
      .set(root, { zIndex: stableZIndex }, flightDuration * 0.64);
    if (!bottomLaunch) {
      timeline.to(
        flipper,
        { rotationY: 0, duration: 0.5, ease: 'back.out(1.2)' },
        0.3,
      );
    }
    return () => {
      timeline.kill();
    };
  }, [
    audio,
    dealActive,
    dealCycle,
    deckSource,
    flipperRef,
    index,
    layout.rotation,
    layout.scale,
    layout.x,
    layout.y,
    onDealSettled,
    onDealReady,
    onDealComplete,
    reorderSettlingRef,
    rootRef,
    stableZIndex,
    total,
    viewportHeight,
    viewportWidth,
  ]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const flipper = flipperRef.current;
    const deck = deckElementFrom(deckSource);
    if (
      mode !== 'collecting' ||
      !root ||
      !flipper ||
      !deck ||
      collectionRole === 'cast-deferred' ||
      collectCycle === 0
    )
      return;
    reorderSettlingRef.current = false;
    resetGesture();
    const bottomLaunch = isBottomLaunchSource(deck);
    const deckLayout = deckCardLaunchLayout(deck, stableZIndex, {
      width: viewportWidth,
      height: viewportHeight,
    });
    const collectionImmediate = collectionRole === 'cast-closer';
    const returnDelay = deckCollectDelay(
      index,
      total,
      bottomLaunch,
      collectionImmediate,
      dealSettled,
    );
    const currentX = Number(gsap.getProperty(root, 'x'));
    const currentY = Number(gsap.getProperty(root, 'y'));
    const arcX = currentX + (deckLayout.x - currentX) * 0.55;
    const arcY = deckFlightArcY(
      deck,
      currentY,
      deckLayout.y,
      viewportHeight,
      68,
    );
    gsap.killTweensOf([root, flipper]);
    if (bottomLaunch) {
      const submerged = submergedCardLayout(0, 0, 0, index, (total - 1) / 2);
      const liftDuration = collectionImmediate ? 0.1 : 0.14;
      const submergeDuration = collectionImmediate
        ? CARD_CAST_COLLECT_DURATION - liftDuration
        : CARD_RETREAT_DURATION_SECONDS;
      const timeline = gsap
        .timeline({
          delay: returnDelay,
          onStart: () => {
            gsap.set(root, {
              zIndex: collectionImmediate ? INTERACTION_Z_INDEX : stableZIndex,
            });
            audio.play('cardCollect', {
              positionX: root.getBoundingClientRect().left,
            });
          },
          onComplete: () => {
            gsap.set(root, { autoAlpha: 0 });
            if (
              collectionRole === 'dismiss-closer' ||
              collectionRole === 'cast-closer'
            ) {
              onCollectAll();
            }
          },
        })
        .to(root, {
          y: currentY - 16,
          rotation: layout.rotation,
          scale: layout.scale * 1.035,
          duration: liftDuration,
          ease: 'power2.out',
        })
        .to(
          root,
          cardSubmergeTween(submerged, {
            delay: 0,
            duration: submergeDuration,
          }),
        );
      return () => {
        timeline.kill();
      };
    }

    const flightDuration = collectionImmediate
      ? CARD_CAST_COLLECT_DURATION
      : CARD_COLLECT_DURATION;
    const timeline = gsap
      .timeline({
        delay: returnDelay,
        onStart: () => {
          gsap.set(root, {
            zIndex: collectionImmediate
              ? INTERACTION_Z_INDEX
              : deckLayout.zIndex,
          });
          audio.play('cardCollect', {
            positionX: root.getBoundingClientRect().left,
          });
        },
        onComplete: () => {
          gsap.set(root, { autoAlpha: 0 });
          if (
            collectionRole === 'dismiss-closer' ||
            collectionRole === 'cast-closer'
          ) {
            onCollectAll();
          }
        },
      })
      .to(
        root,
        {
          motionPath: {
            path: [
              {
                x: currentX + (deckLayout.x - currentX) * 0.08,
                y: currentY - 18,
              },
              { x: arcX, y: arcY },
              { x: deckLayout.x, y: deckLayout.y },
            ],
            curviness: 1.28,
            autoRotate: false,
          },
          duration: flightDuration,
          ease: 'sine.inOut',
        },
        0,
      )
      .to(
        root,
        {
          keyframes: [
            {
              scale: layout.scale * 1.05,
              rotation:
                layout.rotation + (deckLayout.x < currentX ? -2.5 : 2.5),
              duration: 0.14,
              ease: 'power2.out',
            },
            {
              scale: layout.scale * 1.02,
              rotation: -7 + (index % 3) * 2,
              duration: 0.31,
              ease: 'sine.inOut',
            },
            {
              scale: deckLayout.scale,
              rotation: deckLayout.rotation,
              duration: 0.25,
              ease: 'power3.in',
            },
          ],
        },
        0,
      )
      .to(flipper, { rotationY: 180, duration: 0.42, ease: 'power3.inOut' }, 0)
      .set(root, { zIndex: deckLayout.zIndex }, flightDuration * 0.72);
    return () => {
      timeline.kill();
    };
  }, [
    audio,
    collectCycle,
    collectionRole,
    deckSource,
    dealSettled,
    flipperRef,
    index,
    layout.rotation,
    layout.scale,
    mode,
    onCollectAll,
    reorderSettlingRef,
    resetGesture,
    rootRef,
    stableZIndex,
    total,
    viewportHeight,
    viewportWidth,
  ]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const flipper = flipperRef.current;
    if (mode !== 'forging' || !arriving || !root || !flipper) return;
    const { height, bottom } = managerCardDimensions(viewportWidth);
    const baseCenterY = viewportHeight - bottom - height / 2;
    const forgeY = viewportHeight * 0.43 - baseCenterY;
    const arcX = layout.x * 0.52;
    const arcY = Math.min(forgeY + 74, layout.y - 96);

    gsap.killTweensOf([root, flipper]);
    gsap.set(root, {
      x: 0,
      y: forgeY + 34,
      rotation: -9,
      scale: 0.18,
      zIndex: 280,
    });
    gsap.set(flipper, { rotationY: 180 });
    const timeline = gsap
      .timeline({
        delay: 0.32,
        onComplete: () => onArrivalComplete(itemId),
      })
      .to(root, {
        y: forgeY,
        rotation: -3,
        scale: 0.92,
        duration: 0.48,
        ease: 'power2.out',
      })
      .to(root, {
        x: arcX,
        y: arcY,
        rotation: layout.rotation + 7,
        scale: 1.07,
        duration: 0.46,
        ease: 'power2.inOut',
      })
      .to(root, {
        x: layout.x,
        y: layout.y,
        rotation: layout.rotation,
        scale: layout.scale,
        duration: 0.58,
        ease: 'back.out(1.4)',
      })
      .call(
        () =>
          audio.play('forgeComplete', {
            positionX: root.getBoundingClientRect().left,
          }),
        undefined,
        0.72,
      )
      .to(
        flipper,
        { rotationY: 0, duration: 0.66, ease: 'back.out(1.2)' },
        0.72,
      );
    return () => {
      timeline.kill();
    };
  }, [
    arriving,
    audio,
    flipperRef,
    itemId,
    layout.rotation,
    layout.scale,
    layout.x,
    layout.y,
    mode,
    onArrivalComplete,
    rootRef,
    viewportHeight,
    viewportWidth,
  ]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const flipper = flipperRef.current;
    const deck = deckElementFrom(deckSource);
    const deckReady = deckLaunchSourceReady(deck);
    const previousMode = previousModeRef.current;
    const previousRetreated = previousRetreatedRef.current;
    if (!root) return;
    if (mode === 'returning') {
      const enteringReturn = previousMode !== 'returning';
      previousModeRef.current = mode;
      previousRetreatedRef.current = retreated;
      if (!enteringReturn) return;
      if (!selected) {
        gsap.set(root, { zIndex: stableZIndex });
        gsap.to(root, {
          x: formation.x,
          y: formation.y,
          rotation: formation.rotation,
          scale: formation.scale,
          duration: 0.58,
          ease: 'back.out(1.28)',
          overwrite: 'auto',
        });
        return;
      }
      reorderSettlingRef.current = false;
      resetGesture();
      returnAnimationRef.current = animateCardToFormation(
        root,
        {
          x: formation.x,
          y: formation.y,
          rotation: formation.rotation,
          scale: formation.scale,
        },
        stableZIndex,
        {
          direct: false,
          onComplete: () => {
            returnAnimationRef.current = null;
            onReturnComplete(itemId);
          },
        },
      );
      return;
    }
    if (
      dragging ||
      interactionOwner ||
      reorderSettlingRef.current ||
      (dealActive && !dealSettled) ||
      mode === 'collecting' ||
      mode === 'resolving' ||
      (mode === 'forging' && arriving)
    )
      return;
    previousModeRef.current = mode;
    previousRetreatedRef.current = retreated;
    if (retreated && mode !== 'closed') {
      const retreat = submergedCardLayout(
        layout.x,
        layout.y,
        layout.rotation,
        index,
        (total - 1) / 2,
      );
      gsap.set(root, { zIndex: stableZIndex });
      gsap.to(root, cardSubmergeTween(retreat));
      return;
    }
    if (mode === 'closed' && flipper && deck && deckReady) {
      const deckLayout = deckCardLaunchLayout(deck, stableZIndex, {
        width: viewportWidth,
        height: viewportHeight,
      });
      gsap.killTweensOf([root, flipper]);
      gsap.set(root, deckLayout);
      gsap.set(flipper, { rotationY: 180 });
      return;
    }
    if (mode === 'detail') {
      if (selected) {
        const rootNode = root.getRootNode();
        const slot =
          rootNode instanceof Document || rootNode instanceof ShadowRoot
            ? rootNode.querySelector<HTMLElement>('.manager-detail-card-slot')
            : null;
        if (slot) {
          const currentBounds = root.getBoundingClientRect();
          const targetBounds = slot.getBoundingClientRect();
          const currentX = Number(gsap.getProperty(root, 'x'));
          const currentY = Number(gsap.getProperty(root, 'y'));
          gsap.to(root, {
            x:
              currentX +
              targetBounds.left +
              targetBounds.width / 2 -
              (currentBounds.left + currentBounds.width / 2),
            y: currentY + targetBounds.bottom - currentBounds.bottom,
            rotation: -2,
            scale: targetBounds.width / root.offsetWidth,
            zIndex: 190,
            duration: 0.72,
            ease: 'back.out(1.18)',
            overwrite: 'auto',
          });
          return;
        }
      }
      const submerged = submergedCardLayout(
        layout.x,
        layout.y,
        layout.rotation,
        index,
        selectedIndex,
      );
      gsap.to(root, cardSubmergeTween(submerged, { zIndex: stableZIndex }));
      return;
    }
    if (mode === 'element-targeting') {
      if (selected) return;
      const submerged = submergedCardLayout(
        layout.x,
        layout.y,
        layout.rotation,
        index,
        selectedIndex,
      );
      gsap.to(root, cardSubmergeTween(submerged));
      return;
    }
    if (mode === 'dragging' && !selected) {
      const retreat = submergedCardLayout(
        layout.x,
        layout.y,
        layout.rotation,
        index,
        selectedIndex,
      );
      gsap.to(root, cardSubmergeTween(retreat));
      return;
    }
    if (mode === 'forging') {
      const revealDistance = Math.abs(index - (total - 1) / 2);
      gsap.to(root, {
        x: layout.x,
        y: layout.y,
        rotation: layout.rotation,
        scale: layout.scale,
        zIndex: stableZIndex,
        duration: 0.72,
        delay: 0.08 + revealDistance * 0.045,
        ease: 'back.out(1.3)',
        overwrite: 'auto',
      });
      return;
    }
    if (
      mode === 'dealing' ||
      mode === 'spread' ||
      mode === 'reordering' ||
      mode === 'targeting'
    ) {
      const returningFromAction =
        previousRetreated ||
        previousMode === 'dragging' ||
        previousMode === 'targeting' ||
        previousMode === 'element-targeting' ||
        previousMode === 'resolving' ||
        previousMode === 'detail';
      const revealDistance = Math.abs(index - (total - 1) / 2);
      gsap.set(root, { zIndex: stableZIndex });
      if (
        flipper &&
        !root.hidden &&
        !root.classList.contains('is-import-revealing') &&
        Math.abs(Number(gsap.getProperty(flipper, 'rotationY'))) > 0.1
      ) {
        gsap.to(flipper, {
          rotationY: 0,
          duration: returningFromAction ? 0.48 : 0.3,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
      gsap.to(root, {
        x: formation.x,
        y: formation.y,
        rotation: formation.rotation,
        scale: formation.scale,
        duration: returningFromAction
          ? 0.78
          : mode === 'reordering'
            ? 0.58
            : 0.42 + Math.min(4, formation.distance) * 0.028,
        delay:
          returningFromAction && previousMode !== 'resolving'
            ? 0.08 + revealDistance * 0.05
            : 0,
        ease: returningFromAction
          ? 'back.out(1.3)'
          : mode === 'reordering'
            ? 'back.out(1.28)'
            : focused
              ? 'back.out(1.35)'
              : 'back.out(1.14)',
        overwrite: 'auto',
      });
    }
  }, [
    arriving,
    deckSource,
    dealActive,
    dealSettled,
    dragging,
    flipperRef,
    focused,
    formation.distance,
    formation.rotation,
    formation.scale,
    formation.x,
    formation.y,
    index,
    interactionOwner,
    itemId,
    layout.rotation,
    layout.scale,
    layout.x,
    layout.y,
    mode,
    onReturnComplete,
    reorderSettlingRef,
    resetGesture,
    retreated,
    rootRef,
    selected,
    selectedIndex,
    stableZIndex,
    total,
    viewportHeight,
    viewportWidth,
  ]);
}
