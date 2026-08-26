import { gsap } from '../motion/gsap';

type CardStageMotionOptions = {
  layer: HTMLElement;
  panel: HTMLElement;
  onComplete?: () => void;
};

export const CARD_STAGE_RETREAT_DISTANCE = 320;

export function playCardStageEnter({ layer, panel }: CardStageMotionOptions) {
  gsap.killTweensOf([layer, panel]);

  const timeline = gsap.timeline();
  timeline
    .fromTo(
      layer,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.24, ease: 'power2.out' },
      0,
    )
    .fromTo(
      panel,
      {
        autoAlpha: 0,
        y: CARD_STAGE_RETREAT_DISTANCE,
        rotationX: -7,
        rotationZ: -2.4,
        scale: 0.84,
        transformOrigin: '50% 100%',
      },
      {
        autoAlpha: 1,
        y: -18,
        rotationX: 1,
        rotationZ: 0.6,
        scale: 1.02,
        duration: 0.52,
        ease: 'power2.out',
      },
      0,
    )
    .to(panel, {
      y: 0,
      rotationX: 0,
      rotationZ: 0,
      scale: 1,
      duration: 0.2,
      ease: 'back.out(1.3)',
    });

  return () => {
    timeline.kill();
  };
}

export function playCardStageExit({
  layer,
  panel,
  onComplete,
}: CardStageMotionOptions) {
  gsap.killTweensOf([layer, panel]);

  const timeline = gsap.timeline({ onComplete });
  timeline
    .to(
      panel,
      {
        autoAlpha: 0,
        y: CARD_STAGE_RETREAT_DISTANCE,
        rotationX: -7,
        rotationZ: 2.6,
        scale: 0.84,
        duration: 0.46,
        ease: 'power3.in',
        transformOrigin: '50% 100%',
      },
      0,
    )
    .to(
      layer,
      {
        autoAlpha: 0,
        duration: 0.34,
        ease: 'power2.in',
      },
      0,
    );

  return () => {
    timeline.kill();
  };
}
