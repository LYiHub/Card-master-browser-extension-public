import { type RefObject, useLayoutEffect } from 'react';
import { gsap } from '../../motion/gsap';
import { useReducedMotion } from './useReducedMotion';

type AmbientCardMotionOptions = {
  maxRotateX?: number;
  maxRotateY?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function useAmbientCardMotion(
  rootRef: RefObject<HTMLElement | null>,
  enabled = true,
  { maxRotateX = 26, maxRotateY = 22 }: AmbientCardMotionOptions = {},
) {
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const root = rootRef.current;
    const tilt = root?.querySelector<HTMLElement>('[data-card-local-tilt]');
    if (!root || !tilt || !enabled || reducedMotion) return;

    let frame = 0;
    let bounds = root.getBoundingClientRect();
    let nextPoint = { x: 0, y: 0 };
    let leaveTween: ReturnType<typeof gsap.to> | undefined;
    const rotateX = gsap.quickTo(tilt, 'rotationX', {
      duration: 0.16,
      ease: 'power3.out',
    });
    const rotateY = gsap.quickTo(tilt, 'rotationY', {
      duration: 0.16,
      ease: 'power3.out',
    });
    const render = () => {
      frame = 0;
      const percentX = clamp(
        ((nextPoint.x - bounds.left) / bounds.width) * 100,
        0,
        100,
      );
      const percentY = clamp(
        ((nextPoint.y - bounds.top) / bounds.height) * 100,
        0,
        100,
      );
      root.style.setProperty('--card-holo-x', `${percentX}%`);
      root.style.setProperty('--card-holo-y', `${percentY}%`);
      rotateX((0.5 - percentY / 100) * maxRotateX);
      rotateY((percentX / 100 - 0.5) * maxRotateY);
    };
    const handlePointerEnter = () => {
      leaveTween?.kill();
      bounds = root.getBoundingClientRect();
      root.classList.add('is-card-pointer-active');
    };
    const handlePointerMove = (event: PointerEvent) => {
      nextPoint = { x: event.clientX, y: event.clientY };
      if (!frame) frame = window.requestAnimationFrame(render);
    };
    const handlePointerLeave = () => {
      root.classList.remove('is-card-pointer-active');
      root.style.setProperty('--card-holo-x', '50%');
      root.style.setProperty('--card-holo-y', '50%');
      leaveTween = gsap.to(tilt, {
        rotationX: 0,
        rotationY: 0,
        duration: 0.68,
        ease: 'elastic.out(1, 0.72)',
      });
    };
    const resizeObserver = new ResizeObserver(() => {
      bounds = root.getBoundingClientRect();
    });

    root.addEventListener('pointerenter', handlePointerEnter);
    root.addEventListener('pointermove', handlePointerMove, { passive: true });
    root.addEventListener('pointerleave', handlePointerLeave);
    resizeObserver.observe(root);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      root.removeEventListener('pointerenter', handlePointerEnter);
      root.removeEventListener('pointermove', handlePointerMove);
      root.removeEventListener('pointerleave', handlePointerLeave);
      root.classList.remove('is-card-pointer-active');
      root.style.setProperty('--card-holo-x', '50%');
      root.style.setProperty('--card-holo-y', '50%');
      gsap.killTweensOf(tilt);
      gsap.set(tilt, { clearProps: 'transform' });
    };
  }, [enabled, maxRotateX, maxRotateY, reducedMotion, rootRef]);
}
