import {
  type CSSProperties,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { projectAssetUrl } from '../../lib/project-assets';
import { gsap } from '../../motion/gsap';
import { prefersReducedMotion } from '../../motion/preference';
import {
  CARD_LOCK_TRANSITION_MS,
  type CardLockPhase,
  registerCardLockTransition,
} from './card-lock-transition';

const CARD_LOCK_SEQUENCE_URL = projectAssetUrl(
  'userscript-deck/visual/cards/card-lock-chain.webp',
);

export function useCardLockPhase(enabled: boolean) {
  const previousEnabledRef = useRef(enabled);
  const [phase, setPhase] = useState<CardLockPhase>(
    enabled ? 'unlocked' : 'locked',
  );

  useLayoutEffect(() => {
    if (previousEnabledRef.current === enabled) return;
    previousEnabledRef.current = enabled;
    setPhase(enabled ? 'unlocking' : 'locking');
  }, [enabled]);

  const completeTransition = useCallback((completed: CardLockPhase) => {
    setPhase((current) => {
      if (current !== completed) return current;
      return completed === 'locking' ? 'locked' : 'unlocked';
    });
  }, []);

  return { phase, completeTransition };
}

export function CardLockEffect({
  phase,
  active,
  onTransitionComplete,
}: {
  phase: CardLockPhase;
  active: boolean;
  onTransitionComplete: (phase: CardLockPhase) => void;
}) {
  if (phase === 'unlocked') return null;
  return (
    <CardLockEffectSurface
      phase={phase}
      active={active}
      onTransitionComplete={onTransitionComplete}
    />
  );
}

function CardLockEffectSurface({
  phase,
  active,
  onTransitionComplete,
}: {
  phase: Exclude<CardLockPhase, 'unlocked'>;
  active: boolean;
  onTransitionComplete: (phase: CardLockPhase) => void;
}) {
  const effectRef = useRef<HTMLSpanElement | null>(null);
  const inspecting = phase === 'locked' && active;

  useLayoutEffect(() => {
    const effect = effectRef.current;
    const sprite = effect?.firstElementChild;
    if (!effect || !(sprite instanceof HTMLElement)) return;
    gsap.killTweensOf([effect, sprite]);
    const duration = CARD_LOCK_TRANSITION_MS / 1_000;

    if (phase === 'locked') {
      gsap.set(effect, { opacity: 1, scale: 1 });
      gsap.set(sprite, { backgroundPosition: '0% 100%' });
      if (!inspecting || prefersReducedMotion()) return;
      const timeline = gsap.timeline({ repeat: -1 }).fromTo(
        sprite,
        { backgroundPosition: '0% 0%' },
        {
          backgroundPosition: '0% 100%',
          duration,
          ease: 'steps(11)',
        },
      );
      return () => {
        timeline.kill();
        gsap.set(sprite, { backgroundPosition: '0% 100%' });
      };
    }

    let resolveTransition: () => void = () => undefined;
    const transition = new Promise<void>((resolve) => {
      resolveTransition = () => resolve();
    });
    const card = effect.closest<HTMLElement>('.manager-card');
    if (card) registerCardLockTransition(card, transition);
    let settled = false;
    const settle = (completed: boolean) => {
      if (settled) return;
      settled = true;
      resolveTransition();
      if (completed) onTransitionComplete(phase);
    };
    const timeline = gsap.timeline({
      onComplete: () => settle(true),
      onInterrupt: () => settle(false),
    });
    if (phase === 'locking') {
      timeline
        .fromTo(
          effect,
          { opacity: 0, scale: 1.08 },
          { opacity: 1, scale: 1, duration, ease: 'power3.out' },
          0,
        )
        .fromTo(
          sprite,
          { backgroundPosition: '0% 0%' },
          {
            backgroundPosition: '0% 100%',
            duration,
            ease: 'steps(11)',
          },
          0,
        );
    } else {
      timeline
        .fromTo(
          effect,
          { opacity: 1, scale: 1 },
          { opacity: 0, scale: 1.08, duration, ease: 'power2.in' },
          0,
        )
        .fromTo(
          sprite,
          { backgroundPosition: '0% 100%' },
          {
            backgroundPosition: '0% 0%',
            duration,
            ease: 'steps(11)',
          },
          0,
        );
    }
    return () => {
      timeline.kill();
      settle(false);
    };
  }, [inspecting, onTransitionComplete, phase]);

  return (
    <span
      ref={effectRef}
      className={`manager-card__lock-effect is-${phase}${inspecting ? ' is-inspecting' : ''}`}
      data-card-lock-phase={phase}
      style={
        {
          '--manager-card-lock-image': `url("${CARD_LOCK_SEQUENCE_URL}")`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <i />
    </span>
  );
}
