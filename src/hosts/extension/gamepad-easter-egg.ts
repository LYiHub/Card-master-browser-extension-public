import { gsap } from '../../motion/gsap';

export class GamepadEasterEggVisual {
  readonly element: HTMLDivElement;

  private readonly burst: HTMLSpanElement;
  private readonly shockwaves: HTMLSpanElement[];
  private readonly imageShell: HTMLSpanElement;
  private readonly image: HTMLImageElement;
  private timeline: gsap.core.Timeline | null = null;

  constructor(document: Document, imageUrl: string) {
    this.element = document.createElement('div');
    this.element.className = 'gamepad-easter-egg';
    this.element.setAttribute('aria-hidden', 'true');
    this.burst = document.createElement('span');
    this.burst.className = 'gamepad-easter-egg__burst';
    this.shockwaves = [0, 1].map((index) => {
      const wave = document.createElement('span');
      wave.className = `gamepad-easter-egg__shockwave gamepad-easter-egg__shockwave--${index + 1}`;
      return wave;
    });
    this.imageShell = document.createElement('span');
    this.imageShell.className = 'gamepad-easter-egg__image-shell';
    this.image = document.createElement('img');
    this.image.className = 'gamepad-easter-egg__image';
    this.image.src = imageUrl;
    this.image.alt = '';
    this.image.decoding = 'async';
    this.image.loading = 'eager';
    this.imageShell.append(this.image);
    this.element.append(this.burst, ...this.shockwaves, this.imageShell);
  }

  play(onComplete?: () => void) {
    const restart = this.timeline !== null;
    this.timeline?.kill();
    gsap.killTweensOf([
      this.element,
      this.burst,
      this.imageShell,
      this.image,
      ...this.shockwaves,
    ]);
    const timeline = gsap.timeline({
      onComplete: () => {
        this.element.classList.remove('is-visible');
        this.timeline = null;
        onComplete?.();
      },
    });
    this.timeline = timeline;
    const entranceAt = restart ? 0.12 : 0;

    if (restart) {
      timeline.to(
        [this.imageShell, this.burst, ...this.shockwaves],
        {
          opacity: 0,
          scale: 0.72,
          duration: 0.12,
          ease: 'power3.in',
        },
        0,
      );
    }

    timeline
      .set(this.element, { opacity: 0 }, entranceAt)
      .set(this.burst, { opacity: 0, scale: 0.28, rotation: -18 }, entranceAt)
      .set(this.shockwaves, { opacity: 0, scale: 0.36 }, entranceAt)
      .set(
        this.imageShell,
        {
          opacity: 0,
          scale: 0.34,
          rotation: -8,
          y: 72,
          transformOrigin: '50% 50%',
        },
        entranceAt,
      )
      .set(
        this.image,
        { filter: 'brightness(2.5) saturate(1.45) blur(12px)' },
        entranceAt,
      )
      .add(() => this.element.classList.add('is-visible'), entranceAt)
      .to(
        this.element,
        {
          opacity: 1,
          duration: 0.18,
          ease: 'power2.out',
        },
        entranceAt,
      )
      .to(
        this.burst,
        {
          opacity: 0.92,
          scale: 1.22,
          rotation: 6,
          duration: 0.34,
          ease: 'power4.out',
        },
        entranceAt,
      )
      .to(
        this.shockwaves[0],
        {
          opacity: 0.78,
          scale: 1.18,
          duration: 0.46,
          ease: 'power4.out',
        },
        entranceAt + 0.04,
      )
      .to(
        this.shockwaves[1],
        {
          opacity: 0.5,
          scale: 1.42,
          duration: 0.62,
          ease: 'power3.out',
        },
        entranceAt + 0.1,
      )
      .to(
        this.imageShell,
        {
          opacity: 1,
          scale: 1.13,
          rotation: 1.6,
          y: -10,
          duration: 0.38,
          ease: 'power4.out',
        },
        entranceAt + 0.04,
      )
      .to(
        this.image,
        {
          filter: 'brightness(1.22) saturate(1.12) blur(0px)',
          duration: 0.38,
          ease: 'power4.out',
        },
        entranceAt + 0.04,
      )
      .to(
        this.imageShell,
        {
          scale: 0.965,
          rotation: -0.7,
          y: 4,
          duration: 0.16,
          ease: 'power2.inOut',
        },
        entranceAt + 0.42,
      )
      .to(
        this.imageShell,
        {
          scale: 1,
          rotation: 0,
          y: 0,
          duration: 0.34,
          ease: 'back.out(2.8)',
        },
        entranceAt + 0.58,
      )
      .to(
        this.image,
        {
          filter: 'brightness(1) saturate(1)',
          duration: 0.34,
          ease: 'back.out(2.8)',
        },
        entranceAt + 0.58,
      )
      .to(
        this.burst,
        {
          opacity: 0.32,
          scale: 1.04,
          rotation: 0,
          duration: 0.54,
          ease: 'power2.out',
        },
        entranceAt + 0.34,
      )
      .to(
        this.shockwaves,
        {
          opacity: 0,
          scale: 1.74,
          duration: 0.58,
          ease: 'power2.out',
          stagger: 0.08,
        },
        entranceAt + 0.34,
      )
      .to(
        this.imageShell,
        {
          scale: 1.035,
          duration: 0.7,
          ease: 'sine.inOut',
        },
        entranceAt + 1.12,
      )
      .to(
        this.image,
        {
          filter: 'brightness(1.08) saturate(1.06)',
          duration: 0.7,
          ease: 'sine.inOut',
        },
        entranceAt + 1.12,
      )
      .to(
        this.imageShell,
        {
          scale: 1,
          duration: 0.7,
          ease: 'sine.inOut',
        },
        entranceAt + 1.82,
      )
      .to(
        this.image,
        {
          filter: 'brightness(1) saturate(1)',
          duration: 0.7,
          ease: 'sine.inOut',
        },
        entranceAt + 1.82,
      )
      .to(
        this.imageShell,
        {
          opacity: 0,
          scale: 0.68,
          rotation: 5,
          y: -86,
          duration: 0.42,
          ease: 'power3.in',
        },
        entranceAt + 2.72,
      )
      .to(
        this.image,
        {
          filter: 'brightness(1.8) saturate(0.72) blur(9px)',
          duration: 0.42,
          ease: 'power3.in',
        },
        entranceAt + 2.72,
      )
      .to(
        this.burst,
        {
          opacity: 0,
          scale: 1.34,
          duration: 0.38,
          ease: 'power2.in',
        },
        entranceAt + 2.72,
      )
      .to(
        this.element,
        {
          opacity: 0,
          duration: 0.22,
          ease: 'power2.in',
        },
        entranceAt + 2.94,
      );
  }

  dispose() {
    this.timeline?.kill();
    this.timeline = null;
    gsap.killTweensOf([
      this.element,
      this.burst,
      this.imageShell,
      this.image,
      ...this.shockwaves,
    ]);
  }
}
