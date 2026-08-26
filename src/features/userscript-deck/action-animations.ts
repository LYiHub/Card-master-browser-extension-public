import { gsap } from '../../motion/gsap';
import { MANAGER_CARD_GLOW_LAYER_SELECTOR } from '../manager-interaction/ManagerCardGlowEffect';

const COMMAND_CHARGE_DURATION = 1;
const COMMAND_UNDEREXPOSURE_DURATION = 0.32;
const COMMAND_BLOOM_DURATION = 0.72;
const COMMAND_RECOVERY_DURATION = 0.33;
const COMMAND_BLOOM_AT = COMMAND_UNDEREXPOSURE_DURATION;
const COMMAND_RECOVERY_AT = COMMAND_BLOOM_AT + COMMAND_BLOOM_DURATION;
const shadowCastBaseScales = new WeakMap<HTMLElement, number>();

type CommandRevealLayers = {
  face: HTMLElement | null;
  aura: HTMLElement | null;
  ring: HTMLElement | null;
  rays: HTMLElement | null;
  flash: HTMLElement | null;
};

function cardChargeLayers(element: HTMLElement) {
  const tilt = element.querySelector<HTMLElement>('.manager-card__tilt');
  const face = element.querySelector<HTMLElement>('.manager-card__face');
  const aura = element.querySelector<HTMLElement>('.manager-card__charge-aura');
  const ring = element.querySelector<HTMLElement>('.manager-card__charge-ring');
  const rays = element.querySelector<HTMLElement>('.manager-card__charge-rays');
  const flash = element.querySelector<HTMLElement>(
    '.manager-card__charge-flash',
  );
  return tilt && face && aura && ring && rays && flash
    ? { tilt, face, aura, ring, rays, flash }
    : null;
}

export function finishUpdateAction(element: HTMLElement) {
  if (!element.isConnected) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    gsap
      .timeline({
        onComplete: settle,
        onInterrupt: settle,
      })
      .to(element, {
        scale: 1.2,
        rotation: -3,
        duration: 0.26,
        ease: 'back.out(1.55)',
      })
      .to(element, {
        y: Number(gsap.getProperty(element, 'y')) - 108,
        scale: 0.7,
        rotation: 7,
        duration: 0.58,
        ease: 'power3.in',
      });
  });
}

export function waitForSceneCommit() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => resolve()),
    );
  });
}

export function addCommandReveal(
  timeline: ReturnType<typeof gsap.timeline>,
  { face, aura, ring, rays, flash }: CommandRevealLayers,
  at: number,
) {
  const recoveryAt = at + COMMAND_BLOOM_DURATION;
  const completeAt = recoveryAt + COMMAND_RECOVERY_DURATION;

  if (face) {
    timeline
      .set(
        face,
        { filter: 'brightness(0.82) saturate(1.02) contrast(1.06)' },
        at,
      )
      .to(
        face,
        {
          filter: 'brightness(2.45) saturate(1.08) contrast(0.92)',
          duration: COMMAND_BLOOM_DURATION,
          ease: 'power3.inOut',
        },
        at,
      )
      .to(
        face,
        {
          filter: 'brightness(1) saturate(1) contrast(1)',
          duration: COMMAND_RECOVERY_DURATION,
          ease: 'power2.out',
        },
        recoveryAt,
      );
  }
  if (aura) {
    timeline
      .set(aura, { opacity: 0.12, scale: 0.68 }, at)
      .to(
        aura,
        {
          opacity: 0.82,
          scale: 1.08,
          duration: COMMAND_BLOOM_DURATION,
          ease: 'power1.in',
        },
        at,
      )
      .to(
        aura,
        {
          opacity: 0,
          scale: 1.32,
          duration: COMMAND_RECOVERY_DURATION,
          ease: 'power2.out',
        },
        recoveryAt,
      );
  }
  if (ring) {
    timeline
      .set(ring, { opacity: 0.1, scale: 0.88 }, at)
      .to(
        ring,
        {
          opacity: 0.92,
          scale: 1.06,
          duration: COMMAND_BLOOM_DURATION,
          ease: 'power1.in',
        },
        at,
      )
      .to(
        ring,
        {
          opacity: 0,
          scale: 1.32,
          duration: COMMAND_RECOVERY_DURATION,
          ease: 'power2.out',
        },
        recoveryAt,
      );
  }
  if (rays) {
    timeline
      .set(rays, { opacity: 0.08, rotation: 0, scale: 0.84 }, at)
      .to(
        rays,
        {
          opacity: 0.74,
          rotation: 20,
          scale: 1.06,
          duration: COMMAND_BLOOM_DURATION,
          ease: 'power1.in',
        },
        at,
      )
      .to(
        rays,
        {
          opacity: 0,
          rotation: 38,
          scale: 1.32,
          duration: COMMAND_RECOVERY_DURATION,
          ease: 'power2.out',
        },
        recoveryAt,
      );
  }
  if (flash) {
    timeline
      .set(flash, { opacity: 0.02, scale: 0.78 }, at)
      .to(
        flash,
        {
          opacity: 1,
          scale: 1.28,
          duration: COMMAND_BLOOM_DURATION,
          ease: 'power1.in',
        },
        at,
      )
      .to(
        flash,
        {
          opacity: 0,
          scale: 1.52,
          duration: COMMAND_RECOVERY_DURATION,
          ease: 'power2.out',
        },
        recoveryAt,
      );
  }
  return completeAt;
}

export function chargeCommand(element: HTMLElement) {
  return new Promise<void>((resolve) => {
    const layers = cardChargeLayers(element);
    if (!layers) {
      resolve();
      return;
    }
    const { tilt, face, aura, ring, rays, flash } = layers;

    const baseScale = Number(gsap.getProperty(element, 'scale'));
    gsap.killTweensOf([element, tilt, face, aura, ring, rays, flash]);
    gsap.set([aura, ring, rays, flash], { opacity: 0 });
    gsap.set(aura, { scale: 0.58 });
    gsap.set(ring, { scale: 0.82 });
    gsap.set(rays, { rotation: -12, scale: 0.78 });
    gsap.set(flash, { scale: 0.72 });

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      gsap.set(tilt, { clearProps: 'x,y,rotation' });
      gsap.set(face, { clearProps: 'filter' });
      gsap.set([aura, ring, rays, flash], {
        clearProps: 'opacity,scale,rotation',
      });
      resolve();
    };

    const timeline = gsap
      .timeline({
        onComplete: settle,
        onInterrupt: settle,
      })
      .to(
        aura,
        {
          opacity: 0.12,
          scale: 0.68,
          duration: COMMAND_UNDEREXPOSURE_DURATION,
          ease: 'power2.inOut',
        },
        0,
      )
      .to(
        aura,
        {
          opacity: 0.82,
          scale: 1.08,
          duration: COMMAND_BLOOM_DURATION,
          ease: 'power1.in',
        },
        COMMAND_BLOOM_AT,
      )
      .to(
        aura,
        {
          opacity: 0,
          scale: 1.32,
          duration: COMMAND_RECOVERY_DURATION,
          ease: 'power2.out',
        },
        COMMAND_RECOVERY_AT,
      )
      .to(
        ring,
        {
          opacity: 0.1,
          scale: 0.88,
          duration: COMMAND_UNDEREXPOSURE_DURATION,
          ease: 'power2.inOut',
        },
        0,
      )
      .to(
        ring,
        {
          opacity: 0.92,
          scale: 1.06,
          duration: COMMAND_BLOOM_DURATION,
          ease: 'power1.in',
        },
        COMMAND_BLOOM_AT,
      )
      .to(
        ring,
        {
          opacity: 0,
          scale: 1.32,
          duration: COMMAND_RECOVERY_DURATION,
          ease: 'power2.out',
        },
        COMMAND_RECOVERY_AT,
      )
      .to(
        rays,
        {
          opacity: 0.08,
          rotation: 0,
          scale: 0.84,
          duration: COMMAND_UNDEREXPOSURE_DURATION,
          ease: 'power2.inOut',
        },
        0,
      )
      .to(
        rays,
        {
          opacity: 0.74,
          rotation: 20,
          scale: 1.06,
          duration: COMMAND_BLOOM_DURATION,
          ease: 'power1.in',
        },
        COMMAND_BLOOM_AT,
      )
      .to(
        rays,
        {
          opacity: 0,
          rotation: 38,
          scale: 1.32,
          duration: COMMAND_RECOVERY_DURATION,
          ease: 'power2.out',
        },
        COMMAND_RECOVERY_AT,
      )
      .to(
        flash,
        {
          opacity: 0.02,
          scale: 0.78,
          duration: COMMAND_UNDEREXPOSURE_DURATION,
          ease: 'power2.inOut',
        },
        0,
      )
      .to(
        flash,
        {
          opacity: 1,
          scale: 1.28,
          duration: COMMAND_BLOOM_DURATION,
          ease: 'power1.in',
        },
        COMMAND_BLOOM_AT,
      )
      .to(
        flash,
        {
          opacity: 0,
          scale: 1.52,
          duration: COMMAND_RECOVERY_DURATION,
          ease: 'power2.out',
        },
        COMMAND_RECOVERY_AT,
      )
      .to(
        face,
        {
          filter: 'brightness(0.82) saturate(1.02) contrast(1.06)',
          duration: COMMAND_UNDEREXPOSURE_DURATION,
          ease: 'power2.inOut',
        },
        0,
      )
      .to(
        face,
        {
          filter: 'brightness(2.45) saturate(1.08) contrast(0.92)',
          duration: COMMAND_BLOOM_DURATION,
          ease: 'power3.inOut',
        },
        COMMAND_BLOOM_AT,
      )
      .to(
        face,
        {
          filter: 'brightness(1) saturate(1) contrast(1)',
          duration: COMMAND_RECOVERY_DURATION,
          ease: 'power2.out',
        },
        COMMAND_RECOVERY_AT,
      )
      .to(
        element,
        {
          scale: baseScale * 1.075,
          duration: 0.78,
          ease: 'power2.inOut',
        },
        0.08,
      )
      .to(
        tilt,
        {
          keyframes: [
            { x: -0.5, y: 0.2, rotation: -0.35 },
            { x: 0.8, y: -0.35, rotation: 0.48 },
            { x: -1.05, y: 0.5, rotation: -0.62 },
            { x: 1.35, y: -0.7, rotation: 0.78 },
            { x: -1.7, y: 0.75, rotation: -0.92 },
            { x: 1.2, y: -0.5, rotation: 0.65 },
            { x: 0, y: 0, rotation: 0 },
          ],
          duration: 0.9,
          ease: 'none',
        },
        0.3,
      )
      .to(
        element,
        {
          scale: baseScale * 1.12,
          duration: 0.26,
          ease: 'back.in(1.8)',
        },
        0.88,
      );
    timeline.duration(COMMAND_CHARGE_DURATION);
  });
}

export function chargeShadowCommand(element: HTMLElement) {
  return new Promise<void>((resolve) => {
    const layers = cardChargeLayers(element);
    if (!layers) {
      resolve();
      return;
    }
    const { tilt, face, aura, ring, rays, flash } = layers;

    const baseScale = Number(gsap.getProperty(element, 'scale'));
    shadowCastBaseScales.set(element, baseScale);
    element.classList.add('is-shadow-casting');
    gsap.killTweensOf([element, tilt, face, aura, ring, rays, flash]);
    gsap.set([aura, ring, rays, flash], { opacity: 0 });
    gsap.set(aura, { scale: 1.24 });

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timeline = gsap
      .timeline({ onComplete: settle, onInterrupt: settle })
      .to(
        aura,
        {
          opacity: 0.58,
          scale: 0.68,
          duration: 0.78,
          ease: 'power3.inOut',
        },
        0,
      )
      .to(
        face,
        {
          filter: 'brightness(0.56) saturate(0.7) contrast(1.12)',
          duration: 0.82,
          ease: 'power2.inOut',
        },
        0,
      )
      .to(
        element,
        {
          scale: baseScale * 0.965,
          duration: 0.76,
          ease: 'power2.inOut',
        },
        0.04,
      )
      .to(
        tilt,
        {
          keyframes: [
            { x: -0.4, y: 0.25, rotation: -0.24 },
            { x: 0.55, y: -0.3, rotation: 0.32 },
            { x: -0.35, y: 0.2, rotation: -0.18 },
            { x: 0, y: 0, rotation: 0 },
          ],
          duration: 0.72,
          ease: 'none',
        },
        0.18,
      )
      .to(
        aura,
        {
          opacity: 0.34,
          scale: 0.48,
          duration: 0.28,
          ease: 'power2.in',
        },
        0.72,
      );
    timeline.duration(COMMAND_CHARGE_DURATION);
  });
}

export function releaseShadowCommand(element: HTMLElement) {
  const animatedLayers = [
    element,
    element.querySelector<HTMLElement>('.manager-card__tilt'),
    element.querySelector<HTMLElement>('.manager-card__face'),
    ...element.querySelectorAll<HTMLElement>(MANAGER_CARD_GLOW_LAYER_SELECTOR),
  ].filter((layer): layer is HTMLElement => layer !== null);

  gsap.killTweensOf(animatedLayers);
  gsap.set(element, {
    scale: shadowCastBaseScales.get(element) ?? 1,
  });
  shadowCastBaseScales.delete(element);
  for (const layer of animatedLayers.slice(1)) {
    gsap.set(layer, {
      clearProps: 'filter,opacity,rotation,scale,x,y',
    });
  }
  element.classList.remove('is-shadow-casting');
}
