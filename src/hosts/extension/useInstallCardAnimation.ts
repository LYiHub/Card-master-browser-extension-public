import { useLayoutEffect, useRef } from 'react';
import { FORGE_AUDIO_DURATION } from '../../audio/cues';
import {
  CARD_COLLECTION_CARD_DIAMETER,
  cardScaleInsideCircle,
} from '../../features/manager-interaction/layout';
import { useAmbientCardMotion } from '../../features/manager-interaction/useAmbientCardMotion';
import { useReducedMotion } from '../../features/manager-interaction/useReducedMotion';
import { gsap } from '../../motion/gsap';

export type InstallPhase = 'preview' | 'installing' | 'stowing' | 'complete';

export function useInstallCardAnimation(
  phase: InstallPhase,
  onStowComplete: () => void,
  interactive = true,
) {
  const cardMotionRef = useRef<HTMLDivElement>(null);
  const decisionRef = useRef<HTMLElement>(null);
  const deckLandingRef = useRef<HTMLDivElement>(null);
  const decisionBeforeCenterRef = useRef<DOMRect | null>(null);
  const reducedMotion = useReducedMotion();
  useAmbientCardMotion(
    cardMotionRef,
    interactive && phase !== 'stowing' && phase !== 'complete',
    { maxRotateX: 20, maxRotateY: 18 },
  );

  useLayoutEffect(() => {
    if (!interactive || phase !== 'preview') return;
    const motion = cardMotionRef.current;
    if (!motion) return;
    gsap.killTweensOf(motion);
    const tween = gsap.fromTo(
      motion,
      {
        autoAlpha: 0,
        y: reducedMotion ? 8 : 26,
        rotationY: reducedMotion ? 0 : 9,
        rotationX: reducedMotion ? 0 : 2,
        scale: reducedMotion ? 0.98 : 0.94,
      },
      {
        autoAlpha: 1,
        y: 0,
        rotationY: 0,
        rotationX: 0,
        scale: 1,
        duration: reducedMotion ? 0.32 : 0.62,
        ease: 'power3.out',
      },
    );
    return () => {
      tween.kill();
    };
  }, [interactive, phase, reducedMotion]);

  useLayoutEffect(() => {
    if (phase !== 'stowing') return;
    const motion = cardMotionRef.current;
    const flipper = motion?.querySelector<HTMLElement>('.install-card');
    const landing = deckLandingRef.current;
    const slot = landing?.querySelector<HTMLElement>(
      '.install-deck-landing__slot',
    );
    if (!motion || !flipper || !landing || !slot) return;
    const cardBounds = motion.getBoundingClientRect();
    const slotBounds = slot.getBoundingClientRect();
    const destination = {
      x:
        slotBounds.left +
        slotBounds.width / 2 -
        (cardBounds.left + cardBounds.width / 2),
      y:
        slotBounds.top +
        slotBounds.height / 2 -
        (cardBounds.top + cardBounds.height / 2),
      scale: cardScaleInsideCircle(
        cardBounds.width,
        cardBounds.height,
        CARD_COLLECTION_CARD_DIAMETER,
      ),
    };
    gsap.killTweensOf([motion, flipper, landing]);
    gsap.set(landing, { opacity: 1 });
    const lift = FORGE_AUDIO_DURATION * (0.2 / 1.18);
    const arc = FORGE_AUDIO_DURATION * (0.42 / 1.18);
    const slotDuration = FORGE_AUDIO_DURATION * (0.56 / 1.18);
    const arrive = lift + arc + slotDuration - 0.18;
    motion.classList.add('is-forging');
    gsap.set(motion, { '--card-glow-strength': 1 });
    const timeline = gsap
      .timeline({
        onComplete: () => {
          decisionBeforeCenterRef.current =
            decisionRef.current?.getBoundingClientRect() ?? null;
          onStowComplete();
        },
      })
      .to(
        motion,
        {
          '--card-glow-strength': 0,
          duration: arrive,
          ease: 'none',
        },
        0,
      )
      .to(
        motion,
        {
          y: -28,
          rotation: -3,
          scale: 0.95,
          duration: lift,
          ease: 'power2.out',
        },
        0,
      )
      .to(
        motion,
        {
          x: destination.x * 0.58,
          y: Math.min(-118, destination.y * 0.44),
          rotation: 9,
          scale: 0.76,
          duration: arc,
          ease: 'power2.inOut',
        },
        '>',
      )
      .to(
        flipper,
        {
          rotationY: 180,
          duration: Math.min(0.7, arc),
          ease: 'power3.inOut',
        },
        '<0.04',
      )
      .addLabel('card-stow', '>-0.18')
      .to(
        motion,
        {
          x: destination.x,
          y: destination.y,
          rotation: -7,
          scale: destination.scale,
          duration: slotDuration,
          ease: 'power3.in',
        },
        'card-stow',
      )
      .to(
        landing,
        {
          scale: 1.08,
          filter: 'brightness(1.42)',
          duration: 0.16,
          ease: 'power2.out',
        },
        `card-stow+=${Math.max(0, slotDuration - 0.36)}`,
      )
      .to(
        landing,
        {
          scale: 1,
          filter: 'brightness(1)',
          duration: 0.2,
          ease: 'back.out(1.8)',
        },
        `card-stow+=${Math.max(0, slotDuration - 0.2)}`,
      )
      .set(motion, { autoAlpha: 0 }, `card-stow+=${slotDuration}`);
    return () => {
      motion.classList.remove('is-forging');
      timeline.kill();
    };
  }, [onStowComplete, phase]);

  useLayoutEffect(() => {
    if (phase !== 'complete') return;
    const decision = decisionRef.current;
    const previous = decisionBeforeCenterRef.current;
    if (!decision || !previous) return;
    const current = decision.getBoundingClientRect();
    gsap.fromTo(
      decision,
      { x: previous.left - current.left, opacity: 0.72 },
      { x: 0, opacity: 1, duration: 0.58, ease: 'power3.out' },
    );
    return () => {
      gsap.killTweensOf(decision);
    };
  }, [phase]);

  return {
    cardMotionRef,
    decisionRef,
    deckLandingRef,
    reducedMotion,
  };
}
