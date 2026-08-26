import {
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import type { AudioDirector } from '../../audio/AudioDirector';
import { gsap } from '../../motion/gsap';
import { ACTION_ATTACHMENT_DURATION } from './action-attachment-motion';
import { resolveManagerActionLock } from './action-hit-testing';
import { animateCardToFormation } from './animate-card-to-formation';
import { shouldReturnDirectly } from './card-return';
import {
  ACTION_EXIT_DISTANCE,
  ACTION_RETURN_DISTANCE,
  ACTIVE_CARD_SCALE,
  type ActionHitSample,
  actionModeForOffset,
  constrainCardTransformToViewport,
  DRAG_THRESHOLD,
  type formationCardLayout,
  INTERACTION_Z_INDEX,
  managerCardDimensions,
  type Point,
} from './layout';
import type { ManagerMode } from './state';
import { useReducedMotion } from './useReducedMotion';

type Gesture = {
  pointerId: number;
  start: Point;
  baseX: number;
  baseY: number;
  dragging: boolean;
  actionMode: boolean;
  actionId: string | null;
  actionLastDirectHitAt: number;
  lastX: number;
  lastY: number;
  lastAt: number;
  cardCenter: Point;
};

type PointerSample = Point & {
  pointerId: number;
  timeStamp: number;
};

type CardFormation = ReturnType<typeof formationCardLayout>;

const HOVER_TILT_X = 20;
const HOVER_TILT_Y = 18;

const TARGETING_WIGGLE_POSES = [
  { x: -0.35, y: 0.1, rotationZ: -1.05 },
  { x: 0.45, y: 0.35, rotationZ: 1.1 },
  { x: 0, y: -0.2, rotationZ: -1 },
  { x: -0.45, y: -0.4, rotationZ: 1.05 },
  { x: 0.15, y: 0, rotationZ: -1.1 },
  { x: 0.45, y: 0.4, rotationZ: 1 },
  { x: 0.35, y: -0.15, rotationZ: -1.05 },
  { x: -0.1, y: -0.35, rotationZ: 1.1 },
  { x: -0.4, y: 0.25, rotationZ: -1 },
  { x: 0.3, y: 0.45, rotationZ: 1.05 },
] as const;
const TARGETING_WIGGLE_SEQUENCE = [
  ...TARGETING_WIGGLE_POSES.slice(1),
  TARGETING_WIGGLE_POSES[0],
];

export type ManagerCardReleaseDisposition = 'accepted' | 'returning';

type ManagerCardGestureOptions<Item extends { id: string }> = {
  item: Item;
  index: number;
  total: number;
  mode: ManagerMode;
  targeting: boolean;
  viewportWidth: number;
  viewportHeight: number;
  actionRoot: ParentNode;
  audio: AudioDirector;
  rootRef: RefObject<HTMLButtonElement | null>;
  tiltRef: RefObject<HTMLDivElement | null>;
  formationRef: MutableRefObject<CardFormation>;
  stableZIndexRef: MutableRefObject<number>;
  reorderSettlingRef: MutableRefObject<boolean>;
  onFocus: (index: number | null) => void;
  onInteractionClaim: (id: string, cancelGesture?: () => void) => boolean;
  onInteractionRelease: (id: string) => void;
  onDragStart: (id: string) => void;
  onActionStart: (id: string) => void;
  onActionCancel: (id: string) => void;
  onActivate: (item: Item, element: HTMLElement, point: Point) => void;
  onReorderPoint: (id: string, point: Point) => void;
  onReorderRelease: (point: Point | null) => void;
  onDragPoint: (sample: ActionHitSample, actionId: string | null) => void;
  onRelease: (
    item: Item,
    element: HTMLElement,
    sample: ActionHitSample,
    actionId: string | null,
  ) => ManagerCardReleaseDisposition;
};

function setCardPointer(element: HTMLElement, point: Point) {
  const rect = element.getBoundingClientRect();
  const x = Math.min(
    100,
    Math.max(0, ((point.x - rect.left) / rect.width) * 100),
  );
  const y = Math.min(
    100,
    Math.max(0, ((point.y - rect.top) / rect.height) * 100),
  );
  element.style.setProperty('--manager-holo-x', `${x}%`);
  element.style.setProperty('--manager-holo-y', `${y}%`);
}

function actionTargetCenter(root: ParentNode, actionId: string) {
  const target = root.querySelector<HTMLElement>(
    `[data-manager-action="${CSS.escape(actionId)}"] > .manager-action__badge`,
  );
  if (!target) return null;
  const bounds = target.getBoundingClientRect();
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}

export function useManagerCardGesture<Item extends { id: string }>({
  item,
  index,
  total,
  mode,
  targeting,
  viewportWidth,
  viewportHeight,
  actionRoot,
  audio,
  rootRef,
  tiltRef,
  formationRef,
  stableZIndexRef,
  reorderSettlingRef,
  onFocus,
  onInteractionClaim,
  onInteractionRelease,
  onDragStart,
  onActionStart,
  onActionCancel,
  onActivate,
  onReorderPoint,
  onReorderRelease,
  onDragPoint,
  onRelease,
}: ManagerCardGestureOptions<Item>) {
  const gestureRef = useRef<Gesture | null>(null);
  const dragFrameRef = useRef(0);
  const pendingPointerRef = useRef<PointerSample | null>(null);
  const raiseTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const cancelGestureHandlerRef = useRef<() => void>(() => undefined);
  const raisedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const compact = managerCardDimensions(viewportWidth).compact;
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const tilt = tiltRef.current;
    if (!tilt || !targeting || reducedMotion) return;
    gsap.killTweensOf(tilt);
    gsap.set(tilt, TARGETING_WIGGLE_POSES[0]);
    const timeline = gsap.timeline({ repeat: -1 });
    for (const pose of TARGETING_WIGGLE_SEQUENCE) {
      timeline.to(tilt, { ...pose, duration: 0.094, ease: 'none' });
    }
    return () => {
      timeline.kill();
      gsap.set(tilt, { x: 0, y: 0, rotationZ: 0 });
    };
  }, [reducedMotion, targeting, tiltRef]);

  const resetGesture = useCallback(() => {
    window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = 0;
    pendingPointerRef.current = null;
    gestureRef.current = null;
    raiseTimelineRef.current?.kill();
    raiseTimelineRef.current = null;
    setDragging(false);
  }, []);

  useEffect(
    () => () => {
      window.cancelAnimationFrame(dragFrameRef.current);
      pendingPointerRef.current = null;
      gestureRef.current = null;
      raiseTimelineRef.current?.kill();
      if (tiltRef.current) gsap.killTweensOf(tiltRef.current);
    },
    [tiltRef],
  );

  const settleTilt = useCallback(() => {
    if (!tiltRef.current || !rootRef.current) return;
    rootRef.current.style.setProperty('--manager-holo-x', '50%');
    rootRef.current.style.setProperty('--manager-holo-y', '50%');
    gsap.to(tiltRef.current, {
      rotationX: 0,
      rotationY: 0,
      x: 0,
      y: 0,
      scale: 1,
      duration: ACTION_ATTACHMENT_DURATION,
      ease: 'elastic.out(1, 0.72)',
    });
  }, [rootRef, tiltRef]);

  const returnToFormation = (onComplete: () => void) => {
    const root = rootRef.current;
    if (!root) return;
    animateCardToFormation(
      root,
      formationRef.current,
      stableZIndexRef.current,
      { direct: shouldReturnDirectly(index, total), onComplete },
    );
  };

  const cancelActiveGesture = () => {
    const gesture = gestureRef.current;
    const root = rootRef.current;
    if (!gesture || !root) return;

    resetGesture();
    settleTilt();
    if (root.hasPointerCapture(gesture.pointerId)) {
      root.releasePointerCapture(gesture.pointerId);
    }

    if (!gesture.dragging) {
      audio.play('cardReturn', { positionX: gesture.lastX });
      onInteractionRelease(item.id);
      onFocus(index);
      return;
    }

    audio.play('cardReturn', { positionX: gesture.lastX });
    const disposition = onRelease(
      item,
      root,
      {
        pointer: { x: gesture.lastX, y: gesture.lastY },
        cardCenter: gesture.cardCenter,
      },
      null,
    );
    raisedRef.current = false;
    onFocus(null);
    if (disposition === 'accepted') {
      onInteractionRelease(item.id);
    }
  };

  cancelGestureHandlerRef.current = cancelActiveGesture;
  const cancelCurrentGesture = useCallback(
    () => cancelGestureHandlerRef.current(),
    [],
  );

  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (!root || mode !== 'spread') return;
    if (!onInteractionClaim(item.id, cancelCurrentGesture)) return;
    event.preventDefault();
    event.stopPropagation();
    audio.play('cardPress', { positionX: event.clientX });
    reorderSettlingRef.current = false;
    raisedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    const baseX = Number(gsap.getProperty(root, 'x'));
    const baseY = Number(gsap.getProperty(root, 'y'));
    const baseRotation = Number(gsap.getProperty(root, 'rotation'));
    const bounds = root.getBoundingClientRect();
    gestureRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      baseX,
      baseY,
      dragging: false,
      actionMode: false,
      actionId: null,
      actionLastDirectHitAt: Number.NEGATIVE_INFINITY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastAt: event.timeStamp,
      cardCenter: {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      },
    };
    onFocus(index);
    gsap.killTweensOf(root);
    raiseTimelineRef.current?.kill();
    gsap.set(root, { zIndex: INTERACTION_Z_INDEX });
    raisedRef.current = true;
    raiseTimelineRef.current = gsap
      .timeline({
        onComplete: () => {
          raiseTimelineRef.current = null;
        },
      })
      .to(root, {
        x: baseX - (compact ? 30 : 44),
        y: baseY - 5,
        rotation: baseRotation - 2.4,
        scale: ACTIVE_CARD_SCALE,
        duration: 0.16,
        ease: 'power2.out',
      })
      .to(root, {
        x: baseX,
        y: baseY,
        rotation: baseRotation,
        scale: ACTIVE_CARD_SCALE,
        duration: 0.22,
        ease: 'back.out(1.32)',
      });
  };

  const processPointerMove = (
    { x, y, pointerId, timeStamp }: PointerSample,
    immediate = false,
  ) => {
    const root = rootRef.current;
    const tilt = tiltRef.current;
    if (!root || !tilt) return null;
    const point = { x, y };
    setCardPointer(root, point);
    const bounds = root.getBoundingClientRect();
    const ratioX = Math.max(
      -1,
      Math.min(1, ((x - bounds.left) / bounds.width - 0.5) * 2),
    );
    const ratioY = Math.max(
      -1,
      Math.min(1, ((y - bounds.top) / bounds.height - 0.5) * 2),
    );
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) {
      if (!reducedMotion) {
        gsap.to(tilt, {
          rotationX: -ratioY * HOVER_TILT_X,
          rotationY: ratioX * HOVER_TILT_Y,
          duration: 0.12,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
      return null;
    }
    const dx = x - gesture.start.x;
    const dy = y - gesture.start.y;
    if (!gesture.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      gesture.dragging = true;
      raiseTimelineRef.current?.kill();
      raiseTimelineRef.current = null;
      if (!raisedRef.current) {
        gsap.set(root, { zIndex: INTERACTION_Z_INDEX });
        raisedRef.current = true;
      }
      setDragging(true);
      audio.play('cardLift', { positionX: x });
      onDragStart(item.id);
    }
    if (!gesture.dragging) return null;
    const elapsed = Math.max(4, timeStamp - gesture.lastAt);
    const velocityX = (x - gesture.lastX) / (elapsed / 16.667);
    const velocityY = (y - gesture.lastY) / (elapsed / 16.667);
    gesture.lastX = x;
    gesture.lastY = y;
    gesture.lastAt = timeStamp;
    const pose = {
      rotation: Math.max(-14, Math.min(14, dx * 0.014 + velocityX * 0.7)),
      tiltX: Math.max(-13, Math.min(13, -ratioY * 7 - velocityY * 0.34)),
      tiltY: Math.max(-15, Math.min(15, ratioX * 9 + velocityX * 0.5)),
    };
    const constrained = constrainCardTransformToViewport({
      x: gesture.baseX + dx,
      y: gesture.baseY + dy - 15,
      rotation: pose.rotation,
      scale: ACTIVE_CARD_SCALE,
      left: root.offsetLeft,
      top: root.offsetTop,
      width: root.offsetWidth,
      height: root.offsetHeight,
      viewportWidth,
      viewportHeight,
      margin: 12,
    });
    gesture.cardCenter = constrained.cardCenter;
    const exitDistance = compact ? 116 : ACTION_EXIT_DISTANCE;
    const returnDistance = compact ? 76 : ACTION_RETURN_DISTANCE;
    const actionSample = {
      pointer: point,
      cardCenter: constrained.cardCenter,
    };
    const actionLock = resolveManagerActionLock(actionSample, {
      root: actionRoot,
      previousActionId: gesture.actionId,
      lastDirectHitAt: gesture.actionLastDirectHitAt,
      now: timeStamp,
    });
    const actionId = actionLock.actionId;
    gesture.actionLastDirectHitAt = actionLock.lastDirectHitAt;
    const nextActionMode = actionModeForOffset(
      gesture.actionMode,
      { x: dx, y: dy },
      actionId !== null,
      exitDistance,
      returnDistance,
    );
    const previousActionId = gesture.actionId;
    if (nextActionMode && !gesture.actionMode) {
      audio.play('actionOpen', { positionX: x });
      onActionStart(item.id);
    } else if (!nextActionMode && gesture.actionMode) {
      audio.play('actionDetach', { positionX: x });
      onActionCancel(item.id);
    }
    gesture.actionMode = nextActionMode;
    gesture.actionId = nextActionMode ? actionId : null;
    if (!nextActionMode) {
      gesture.actionLastDirectHitAt = Number.NEGATIVE_INFINITY;
    }
    if (gesture.actionId !== previousActionId) {
      const target = gesture.actionId
        ? actionTargetCenter(actionRoot, gesture.actionId)
        : null;
      const dx = target ? target.x - constrained.cardCenter.x : 0;
      const dy = target ? target.y - constrained.cardCenter.y : 0;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const pull = target ? Math.min(compact ? 20 : 30, distance * 0.2) : 0;
      gsap.to(tilt, {
        x: (dx / distance) * pull,
        y: (dy / distance) * pull,
        scale: target ? 1.022 : 1,
        duration: ACTION_ATTACHMENT_DURATION,
        ease: target ? 'back.out(1.32)' : 'power3.out',
        overwrite: 'auto',
      });
    }
    if (gesture.actionMode) {
      onDragPoint(actionSample, gesture.actionId);
    } else onReorderPoint(item.id, point);
    const rootPose = {
      x: constrained.x,
      y: constrained.y,
      rotation: pose.rotation,
      scale: ACTIVE_CARD_SCALE,
    };
    const tiltPose = {
      rotationX: pose.tiltX,
      rotationY: pose.tiltY,
    };
    if (immediate) {
      gsap.set(root, rootPose);
      gsap.set(tilt, tiltPose);
    } else {
      gsap.set(root, {
        x: rootPose.x,
        y: rootPose.y,
        scale: rootPose.scale,
      });
      gsap.to(root, {
        rotation: rootPose.rotation,
        duration: 0.06,
        ease: 'power3.out',
        overwrite: 'auto',
      });
      gsap.to(tilt, {
        ...tiltPose,
        duration: 0.08,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    }
    return { sample: actionSample, actionId: gesture.actionId };
  };

  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    pendingPointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      timeStamp: event.timeStamp,
    };
    if (dragFrameRef.current) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = 0;
      const sample = pendingPointerRef.current;
      if (sample) processPointerMove(sample);
    });
  };

  const finish = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    const root = rootRef.current;
    if (!gesture || !root || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = 0;
    pendingPointerRef.current = null;
    const finalPointer = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      timeStamp: event.timeStamp,
    };
    const finalHit = processPointerMove(finalPointer, true);
    gestureRef.current = null;
    setDragging(false);
    settleTilt();
    const point = { x: event.clientX, y: event.clientY };
    if (gesture.dragging && gesture.actionMode) {
      const sample = finalHit?.sample ?? {
        pointer: point,
        cardCenter: gesture.cardCenter,
      };
      const disposition = onRelease(
        item,
        root,
        sample,
        finalHit ? finalHit.actionId : gesture.actionId,
      );
      if (disposition === 'returning') {
        audio.play('cardReturn', { positionX: point.x });
        raisedRef.current = false;
        onFocus(null);
      } else {
        onFocus(null);
        raiseTimelineRef.current?.kill();
        raiseTimelineRef.current = null;
        onInteractionRelease(item.id);
      }
    } else if (gesture.dragging) {
      audio.play('cardPlace', { positionX: point.x });
      reorderSettlingRef.current = true;
      raiseTimelineRef.current?.kill();
      raiseTimelineRef.current = null;
      returnToFormation(() => {
        raisedRef.current = false;
        reorderSettlingRef.current = false;
        onInteractionRelease(item.id);
        onReorderRelease(point);
      });
    } else {
      raiseTimelineRef.current?.progress(1);
      raiseTimelineRef.current?.kill();
      raiseTimelineRef.current = null;
      raisedRef.current = true;
      audio.play('cardFlip', { positionX: point.x });
      onActivate(item, root, point);
    }
  };

  const cancelGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    cancelActiveGesture();
  };

  return {
    dragging,
    hasActiveGesture: () => gestureRef.current !== null,
    resetGesture,
    settleTilt,
    pointerDown,
    pointerMove,
    finish,
    cancelGesture,
  };
}
