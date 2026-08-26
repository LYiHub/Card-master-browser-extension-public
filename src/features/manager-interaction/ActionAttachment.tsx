import { type CSSProperties, useLayoutEffect, useRef } from 'react';
import { gsap } from '../../motion/gsap';
import {
  ACTION_ATTACHMENT_DURATION,
  ACTION_ATTACHMENT_DURATION_CSS,
} from './action-attachment-motion';

const EDGE_GAP = 18;
const CARD_GAP = 24;
const ATTACHMENT_X_PROPERTY = '--manager-action-attachment-x';
const ATTACHMENT_Y_PROPERTY = '--manager-action-attachment-y';

type Position = { x: number; y: number };

type AttachmentAction = {
  id: string;
  accent?: string;
};

type MotionStop = () => void;

function actionBadge(root: ParentNode, actionId: string) {
  return root.querySelector<HTMLElement>(
    `[data-manager-action="${CSS.escape(actionId)}"] > .manager-action__badge`,
  );
}

function elementCenter(element: HTMLElement): Position {
  const bounds = element.getBoundingClientRect();
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
}

function attachmentOffset(element: HTMLElement): Position {
  return {
    x:
      Number.parseFloat(
        element.style.getPropertyValue(ATTACHMENT_X_PROPERTY),
      ) || 0,
    y:
      Number.parseFloat(
        element.style.getPropertyValue(ATTACHMENT_Y_PROPERTY),
      ) || 0,
  };
}

function setAttachmentOffset(element: HTMLElement, position: Position) {
  element.style.setProperty(ATTACHMENT_X_PROPERTY, `${position.x}px`);
  element.style.setProperty(ATTACHMENT_Y_PROPERTY, `${position.y}px`);
}

function badgeOrigin(badge: HTMLElement) {
  const center = elementCenter(badge);
  const offset = attachmentOffset(badge);
  return {
    x: center.x - offset.x,
    y: center.y - offset.y,
  };
}

function attachedOffset(badge: HTMLElement, card: HTMLElement) {
  if (!badge.isConnected || !card.isConnected) return null;
  const origin = badgeOrigin(badge);
  const cardBounds = card.getBoundingClientRect();
  const width = badge.offsetWidth;
  const height = badge.offsetHeight;
  const target = {
    x: Math.min(
      window.innerWidth - width / 2 - EDGE_GAP,
      Math.max(width / 2 + EDGE_GAP, cardBounds.left + cardBounds.width / 2),
    ),
    y: Math.max(EDGE_GAP + height / 2, cardBounds.top - CARD_GAP - height / 2),
  };
  return {
    x: target.x - origin.x,
    y: target.y - origin.y,
  };
}

function clearTrail(trail: HTMLElement | null) {
  trail?.style.setProperty('--attachment-trail-opacity', '0');
}

function updateTrail(
  trail: HTMLElement | null,
  previous: Position,
  current: Position,
  opacity: number,
) {
  if (!trail) return;
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.1) {
    clearTrail(trail);
    return;
  }
  trail.style.setProperty('--attachment-trail-x', `${current.x}px`);
  trail.style.setProperty('--attachment-trail-y', `${current.y}px`);
  trail.style.setProperty(
    '--attachment-trail-angle',
    `${Math.atan2(dy, dx)}rad`,
  );
  trail.style.setProperty(
    '--attachment-trail-length',
    `${Math.min(88, Math.max(30, distance * 7))}px`,
  );
  trail.style.setProperty('--attachment-trail-opacity', `${opacity}`);
}

function trackAttachment(
  badge: HTMLElement,
  card: HTMLElement,
  trail: HTMLElement | null,
) {
  let previousOffset: Position | null = null;
  const update = () => {
    const target = attachedOffset(badge, card);
    if (
      !target ||
      (previousOffset &&
        previousOffset.x === target.x &&
        previousOffset.y === target.y)
    ) {
      return;
    }
    setAttachmentOffset(badge, target);
    previousOffset = target;
    clearTrail(trail);
  };
  gsap.ticker.add(update);
  update();
  return () => gsap.ticker.remove(update);
}

function flyBadge(
  badge: HTMLElement,
  readTarget: () => Position | null,
  trail: HTMLElement | null,
  options: {
    direction: 'attach' | 'detach';
    arc: number;
    ease: string;
    onComplete: () => void;
  },
) {
  const from = attachmentOffset(badge);
  const progress = { value: 0 };
  let previousPosition = elementCenter(badge);
  const update = () => {
    const target = readTarget();
    if (!target) return;
    const value = progress.value;
    const pulse = Math.sin(value * Math.PI);
    const offset = {
      x: from.x + (target.x - from.x) * value,
      y: from.y + (target.y - from.y) * value + pulse * options.arc,
    };
    setAttachmentOffset(badge, offset);
    const origin = badgeOrigin(badge);
    const currentPosition = {
      x: origin.x + offset.x,
      y: origin.y + offset.y,
    };
    updateTrail(
      trail,
      previousPosition,
      currentPosition,
      pulse * (options.direction === 'attach' ? 0.72 : 0.58),
    );
    previousPosition = currentPosition;
  };
  gsap.ticker.add(update);
  update();
  const tween = gsap.to(progress, {
    value: 1,
    duration: ACTION_ATTACHMENT_DURATION,
    ease: options.ease,
    onComplete: () => {
      gsap.ticker.remove(update);
      const target = readTarget();
      if (target) {
        setAttachmentOffset(badge, target);
      }
      clearTrail(trail);
      options.onComplete();
    },
  });
  return () => {
    gsap.ticker.remove(update);
    tween.kill();
    clearTrail(trail);
  };
}

export function ActionAttachment({
  action,
  cardId,
}: {
  action: AttachmentAction | null;
  cardId: string | null;
}) {
  const trailRef = useRef<HTMLDivElement | null>(null);
  const activeSourceRef = useRef<HTMLElement | null>(null);
  const motionsRef = useRef(new Map<HTMLElement, MotionStop>());

  useLayoutEffect(() => {
    const trail = trailRef.current;
    const queryRoot = trail?.getRootNode() as ParentNode | undefined;
    const card =
      queryRoot && cardId
        ? queryRoot.querySelector<HTMLElement>(
            `[data-manager-card-id="${CSS.escape(cardId)}"]`,
          )
        : null;
    const nextSource =
      queryRoot && action ? actionBadge(queryRoot, action.id) : null;
    const previousSource = activeSourceRef.current;
    if (previousSource === nextSource) return;

    const stopMotion = (source: HTMLElement) => {
      motionsRef.current.get(source)?.();
      motionsRef.current.delete(source);
    };
    const registerMotion = (source: HTMLElement, stop: MotionStop) => {
      motionsRef.current.set(source, stop);
    };

    if (previousSource) {
      stopMotion(previousSource);
      const stop = flyBadge(
        previousSource,
        () => ({ x: 0, y: 0 }),
        nextSource ? null : trail,
        {
          direction: 'detach',
          arc: 14,
          ease: 'power2.inOut',
          onComplete: () => {
            if (motionsRef.current.get(previousSource) !== stop) return;
            motionsRef.current.delete(previousSource);
            previousSource.classList.remove('is-attachment-source');
            setAttachmentOffset(previousSource, { x: 0, y: 0 });
          },
        },
      );
      registerMotion(previousSource, stop);
    }

    activeSourceRef.current = nextSource;
    if (!nextSource || !card) return;

    stopMotion(nextSource);
    nextSource.style.setProperty(
      '--manager-action-attachment-duration',
      ACTION_ATTACHMENT_DURATION_CSS,
    );
    nextSource.classList.add('is-attachment-source');
    if (trail && action?.accent) {
      trail.style.setProperty('--action-color', action.accent);
    }
    let stop: MotionStop = () => undefined;
    stop = flyBadge(nextSource, () => attachedOffset(nextSource, card), trail, {
      direction: 'attach',
      arc: -18,
      ease: 'power3.out',
      onComplete: () => {
        if (motionsRef.current.get(nextSource) !== stop) return;
        stop();
        const stopTracking = trackAttachment(nextSource, card, trail);
        motionsRef.current.set(nextSource, stopTracking);
      },
    });
    registerMotion(nextSource, stop);
  }, [action, cardId]);

  useLayoutEffect(
    () => () => {
      for (const [source, stop] of motionsRef.current) {
        stop();
        source.classList.remove('is-attachment-source');
        setAttachmentOffset(source, { x: 0, y: 0 });
      }
      motionsRef.current.clear();
      activeSourceRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={trailRef}
      className="manager-action-flight"
      style={
        {
          '--manager-action-attachment-duration':
            ACTION_ATTACHMENT_DURATION_CSS,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="manager-action-flight__trail" />
    </div>
  );
}
