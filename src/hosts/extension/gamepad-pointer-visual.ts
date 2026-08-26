import {
  createPageTargetFrameTracker,
  type PageTargetFrameUpdate,
} from '../../components/page-target-frame';
import type { Point } from '../../gamepad-control/domain/input';
import {
  GAMEPAD_POINTER_TIMELINES,
  type GamepadPointerMotionProperty,
  type GamepadPointerTimeline,
  gamepadPointerTimelineTrack,
} from '../../gamepad-control/pointer-timeline';
import { gsap } from '../../motion/gsap';

const CURSOR_LINE_MOTION = [
  {
    placement: 'top',
    movingX: 0,
    movingY: 2,
    settledX: 0,
    settledY: -1,
  },
  {
    placement: 'right',
    movingX: -2,
    movingY: 0,
    settledX: 1,
    settledY: 0,
  },
  {
    placement: 'bottom',
    movingX: 0,
    movingY: -2,
    settledX: 0,
    settledY: 1,
  },
  {
    placement: 'left',
    movingX: 2,
    movingY: 0,
    settledX: -1,
    settledY: 0,
  },
] as const;

function motionVars(
  property: GamepadPointerMotionProperty,
  value: number,
): gsap.TweenVars {
  if (property === 'brightness') {
    return { filter: `brightness(${value})` };
  }
  if (property === 'progress') return {};
  return { [property]: value };
}

function appendTimeline(
  timeline: gsap.core.Timeline,
  target: HTMLElement,
  specification: GamepadPointerTimeline,
  applyInitialState = specification.setInitialState,
) {
  if (applyInitialState) {
    const initial: gsap.TweenVars = {};
    for (const track of specification.tracks) {
      if (track.chartOnly) continue;
      const point = track.points[0];
      if (point)
        Object.assign(initial, motionVars(track.property, point.value));
    }
    timeline.set(target, initial, 0);
  }

  for (const track of specification.tracks) {
    if (track.chartOnly) continue;
    for (let index = 1; index < track.points.length; index += 1) {
      const previous = track.points[index - 1];
      const point = track.points[index];
      if (!previous || !point) continue;
      timeline.to(
        target,
        {
          ...motionVars(track.property, point.value),
          duration: (point.timeMs - previous.timeMs) / 1_000,
          ease: point.ease ?? 'none',
        },
        previous.timeMs / 1_000,
      );
    }
  }
  return timeline;
}

function movement(specification: GamepadPointerTimeline) {
  const points =
    gamepadPointerTimelineTrack(specification, 'progress')?.points ?? [];
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || first === last) return null;
  return {
    duration: (last.timeMs - first.timeMs) / 1_000,
    ease: last.ease ?? 'none',
  };
}

export class GamepadPointerVisual {
  readonly cursor: HTMLDivElement;
  readonly targetHighlight: HTMLDivElement;

  private readonly cursorVisual: HTMLSpanElement;
  private readonly cursorRing: HTMLSpanElement;
  private readonly cursorDot: HTMLSpanElement;
  private readonly cursorLines: HTMLSpanElement[];
  private readonly cursorLocator: HTMLSpanElement;
  private readonly targetTracker: ReturnType<
    typeof createPageTargetFrameTracker
  >;
  private cursorPresenceTimeline: gsap.core.Timeline | null = null;
  private cursorLocatorTimeline: gsap.core.Timeline | null = null;
  private cursorPressTimeline: gsap.core.Timeline | null = null;
  private cursorMotionTimeline: gsap.core.Timeline | null = null;
  private targetHighlightTimeline: gsap.core.Timeline | null = null;
  private renderedCursorVisible = false;
  private cursorMoving = false;
  private targetHighlightVisible = false;

  constructor(document: Document, view: Window) {
    this.cursor = document.createElement('div');
    this.cursor.className = 'gamepad-virtual-cursor';
    this.cursor.setAttribute('aria-hidden', 'true');
    this.cursorVisual = document.createElement('span');
    this.cursorVisual.className = 'gamepad-virtual-cursor__visual';
    this.cursorRing = document.createElement('span');
    this.cursorRing.className = 'gamepad-virtual-cursor__ring';
    this.cursorDot = document.createElement('span');
    this.cursorDot.className = 'gamepad-virtual-cursor__dot';
    this.cursorLines = CURSOR_LINE_MOTION.map(({ placement }) => {
      const line = document.createElement('span');
      line.className = `gamepad-virtual-cursor__line gamepad-virtual-cursor__line--${placement}`;
      return line;
    });
    this.cursorVisual.append(
      this.cursorRing,
      this.cursorDot,
      ...this.cursorLines,
    );
    this.cursorLocator = document.createElement('span');
    this.cursorLocator.className = 'gamepad-virtual-cursor__locator';
    this.cursor.append(this.cursorVisual, this.cursorLocator);

    this.targetHighlight = document.createElement('div');
    this.targetHighlight.className =
      'page-target-frame gamepad-target-highlight';
    this.targetHighlight.setAttribute('aria-hidden', 'true');
    this.targetTracker = createPageTargetFrameTracker(view, (update) =>
      this.applyTargetHighlight(update),
    );
  }

  position(point: Point) {
    this.cursor.style.left = `${point.x}px`;
    this.cursor.style.top = `${point.y}px`;
  }

  setTarget(target: Element | null, mode: 'cursor' | 'spatial') {
    this.cursor.classList.toggle(
      'has-target',
      Boolean(target && mode === 'cursor'),
    );
    this.targetTracker.setTarget(target);
  }

  setMoving(moving: boolean) {
    if (this.cursorMoving === moving) return;
    this.cursorMoving = moving;
    this.cursorMotionTimeline?.kill();
    gsap.killTweensOf([this.cursorRing, this.cursorDot, ...this.cursorLines]);
    this.cursor.classList.toggle('is-moving', moving);
    this.cursor.classList.toggle('is-settled', !moving);

    this.cursorMotionTimeline = gsap.timeline({
      onComplete: () => {
        this.cursorMotionTimeline = null;
      },
    });
    if (moving) {
      this.cursorMotionTimeline
        .to(
          this.cursorRing,
          { scale: 0.9, duration: 0.16, ease: 'power2.out' },
          0,
        )
        .to(
          this.cursorDot,
          { scale: 0.74, duration: 0.14, ease: 'power2.out' },
          0,
        )
        .to(
          this.cursorLines,
          {
            x: (index) => CURSOR_LINE_MOTION[index]?.movingX ?? 0,
            y: (index) => CURSOR_LINE_MOTION[index]?.movingY ?? 0,
            opacity: 0.78,
            duration: 0.18,
            ease: 'power2.out',
            stagger: 0.018,
          },
          0,
        );
      return;
    }

    this.cursorMotionTimeline
      .to(
        this.cursorRing,
        { scale: 1.1, duration: 0.11, ease: 'power2.out' },
        0,
      )
      .to(
        this.cursorRing,
        { scale: 1, duration: 0.22, ease: 'back.out(2.2)' },
        0.11,
      )
      .to(
        this.cursorDot,
        { scale: 1.24, duration: 0.1, ease: 'power2.out' },
        0.02,
      )
      .to(
        this.cursorDot,
        { scale: 1, duration: 0.2, ease: 'back.out(2.4)' },
        0.12,
      )
      .to(
        this.cursorLines,
        {
          x: (index) => CURSOR_LINE_MOTION[index]?.settledX ?? 0,
          y: (index) => CURSOR_LINE_MOTION[index]?.settledY ?? 0,
          opacity: 1,
          duration: 0.12,
          ease: 'power2.out',
          stagger: 0.024,
        },
        0,
      )
      .to(
        this.cursorLines,
        {
          x: 0,
          y: 0,
          duration: 0.2,
          ease: 'back.out(2.2)',
          stagger: 0.018,
        },
        0.1,
      );
  }

  setVisible(visible: boolean) {
    if (visible === this.renderedCursorVisible) return;
    const resumingFromExit = visible && this.cursorPresenceTimeline !== null;
    this.renderedCursorVisible = visible;
    this.cursorPresenceTimeline?.kill();
    this.cursorLocatorTimeline?.kill();
    this.cursorPressTimeline?.kill();
    this.cursorMotionTimeline?.kill();
    gsap.killTweensOf([
      this.cursorVisual,
      this.cursorLocator,
      this.cursorRing,
      this.cursorDot,
      ...this.cursorLines,
    ]);

    if (visible) {
      this.cursor.classList.add('is-visible');
      this.cursorPresenceTimeline = appendTimeline(
        gsap.timeline({
          onComplete: () => {
            this.cursorPresenceTimeline = null;
          },
        }),
        this.cursorVisual,
        GAMEPAD_POINTER_TIMELINES.cursorEntrance,
        !resumingFromExit,
      );
      return;
    }

    this.cursorMoving = false;
    this.cursor.classList.remove('has-target', 'is-pressing', 'is-moving');
    this.cursor.classList.add('is-settled');
    gsap.to(this.cursorRing, {
      scale: 1,
      duration: 0.14,
      ease: 'power2.inOut',
    });
    gsap.to(this.cursorDot, {
      scale: 1,
      duration: 0.14,
      ease: 'power2.inOut',
    });
    gsap.to(this.cursorLines, {
      x: 0,
      y: 0,
      opacity: 1,
      duration: 0.14,
      ease: 'power2.inOut',
      stagger: 0.012,
    });
    this.cursorPresenceTimeline = appendTimeline(
      gsap.timeline({
        onComplete: () => {
          this.cursor.classList.remove('is-visible');
          this.cursorPresenceTimeline = null;
        },
      }),
      this.cursorVisual,
      GAMEPAD_POINTER_TIMELINES.cursorExit,
    );
    const opacity = gamepadPointerTimelineTrack(
      GAMEPAD_POINTER_TIMELINES.cursorExit,
      'opacity',
    )?.points.at(-1);
    if (opacity) {
      this.cursorPresenceTimeline.to(
        this.cursorLocator,
        {
          opacity: opacity.value,
          duration: opacity.timeMs / 1_000,
          ease: opacity.ease ?? 'none',
        },
        0,
      );
    }
  }

  locate() {
    if (!this.cursor.classList.contains('is-visible')) return;
    this.cursorLocatorTimeline?.kill();
    gsap.killTweensOf(this.cursorLocator);
    this.cursorLocatorTimeline = appendTimeline(
      gsap.timeline({
        onComplete: () => {
          this.cursorLocatorTimeline = null;
        },
      }),
      this.cursorLocator,
      GAMEPAD_POINTER_TIMELINES.cursorLocator,
    );
  }

  press() {
    this.cursorPresenceTimeline?.kill();
    this.cursorPressTimeline?.kill();
    gsap.killTweensOf(this.cursorVisual);
    this.cursor.classList.add('is-pressing');
    this.cursorPressTimeline = appendTimeline(
      gsap.timeline({
        onComplete: () => {
          this.cursor.classList.remove('is-pressing');
          this.cursorPressTimeline = null;
        },
      }),
      this.cursorVisual,
      GAMEPAD_POINTER_TIMELINES.cursorPress,
    );
  }

  dispose() {
    this.targetTracker.dispose();
    this.cursorPresenceTimeline?.kill();
    this.cursorLocatorTimeline?.kill();
    this.cursorPressTimeline?.kill();
    this.cursorMotionTimeline?.kill();
    this.targetHighlightTimeline?.kill();
    gsap.killTweensOf([
      this.cursorVisual,
      this.cursorLocator,
      this.cursorRing,
      this.cursorDot,
      ...this.cursorLines,
      this.targetHighlight,
    ]);
  }

  private hideTargetHighlight() {
    this.cursor.classList.remove('has-target');
    if (!this.targetHighlightVisible) {
      if (!this.targetHighlightTimeline) {
        this.targetHighlight.classList.remove('is-visible');
      }
      return;
    }
    this.targetHighlightVisible = false;
    this.targetHighlightTimeline?.kill();
    gsap.killTweensOf(this.targetHighlight);
    this.targetHighlightTimeline = appendTimeline(
      gsap.timeline({
        onComplete: () => {
          this.targetHighlight.classList.remove('is-visible');
          this.targetHighlightTimeline = null;
        },
      }),
      this.targetHighlight,
      GAMEPAD_POINTER_TIMELINES.targetExit,
    );
  }

  private applyTargetHighlight({
    target,
    geometry,
    targetChanged,
  }: PageTargetFrameUpdate) {
    if (!target || !geometry) {
      this.hideTargetHighlight();
      return;
    }

    const alreadyVisible = this.targetHighlightVisible;
    const resumingFromExit =
      !alreadyVisible && this.targetHighlightTimeline !== null;
    this.targetHighlightVisible = true;
    if (alreadyVisible && !targetChanged) {
      const track = movement(GAMEPAD_POINTER_TIMELINES.targetTrack);
      this.targetHighlightTimeline?.kill();
      gsap.killTweensOf(this.targetHighlight);
      this.targetHighlightTimeline = gsap.timeline({
        onComplete: () => {
          this.targetHighlightTimeline = null;
        },
      });
      if (track) {
        this.targetHighlightTimeline.to(this.targetHighlight, {
          ...geometry,
          duration: track.duration,
          ease: track.ease,
        });
      }
      return;
    }

    this.targetHighlightTimeline?.kill();
    gsap.killTweensOf(this.targetHighlight);
    this.targetHighlight.classList.add('is-visible');
    this.targetHighlightTimeline = gsap.timeline({
      onComplete: () => {
        this.targetHighlightTimeline = null;
      },
    });
    if (!alreadyVisible) {
      if (resumingFromExit) {
        const track = movement(GAMEPAD_POINTER_TIMELINES.targetChange);
        if (track) {
          this.targetHighlightTimeline.to(this.targetHighlight, {
            ...geometry,
            transformOrigin: '50% 50%',
            duration: track.duration,
            ease: track.ease,
          });
        }
      } else {
        this.targetHighlightTimeline.set(this.targetHighlight, {
          ...geometry,
          transformOrigin: '50% 50%',
        });
      }
      appendTimeline(
        this.targetHighlightTimeline,
        this.targetHighlight,
        GAMEPAD_POINTER_TIMELINES.targetEntrance,
        !resumingFromExit,
      );
      return;
    }

    const track = movement(GAMEPAD_POINTER_TIMELINES.targetChange);
    if (track) {
      this.targetHighlightTimeline.to(this.targetHighlight, {
        ...geometry,
        duration: track.duration,
        ease: track.ease,
      });
    }
    appendTimeline(
      this.targetHighlightTimeline,
      this.targetHighlight,
      GAMEPAD_POINTER_TIMELINES.targetChange,
    );
  }
}
