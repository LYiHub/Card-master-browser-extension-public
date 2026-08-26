import { gsap } from '../../motion/gsap-motion-path';

export type CardFormation = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
};

export function cardReturnMotion(
  currentX: number,
  currentY: number,
  layout: CardFormation,
) {
  const distance = Math.hypot(layout.x - currentX, layout.y - currentY);
  const duration = Math.min(0.9, Math.max(0.64, distance / 900));
  const extraction = Math.min(52, 28 + distance * 0.035);

  return {
    distance,
    duration,
    path: [
      {
        x: currentX - extraction,
        y: currentY + (layout.y - currentY) * 0.24,
      },
      { x: layout.x - 82, y: layout.y - 10 },
      { x: layout.x, y: layout.y },
    ],
  };
}

export function animateCardToFormation(
  root: HTMLElement,
  layout: CardFormation,
  stableZIndex: number,
  options: { direct: boolean; onComplete: () => void },
) {
  const currentX = Number(gsap.getProperty(root, 'x'));
  const currentY = Number(gsap.getProperty(root, 'y'));
  const motion = cardReturnMotion(currentX, currentY, layout);

  gsap.killTweensOf(root);
  if (options.direct) {
    return gsap.to(root, {
      x: layout.x,
      y: layout.y,
      rotation: layout.rotation,
      scale: layout.scale,
      duration: Math.min(0.72, Math.max(0.44, motion.distance / 1000)),
      ease: 'power3.out',
      overwrite: 'auto',
      onComplete: () => {
        gsap.set(root, { zIndex: stableZIndex });
        options.onComplete();
      },
    });
  }

  return gsap
    .timeline({ onComplete: options.onComplete })
    .to(
      root,
      {
        motionPath: {
          path: motion.path,
          curviness: 1.16,
          autoRotate: false,
        },
        rotation: layout.rotation,
        scale: layout.scale,
        duration: motion.duration,
        ease: 'power2.inOut',
        overwrite: 'auto',
      },
      0,
    )
    .set(root, { zIndex: stableZIndex }, motion.duration * 0.48);
}
