import { Dice5, Skull } from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { projectAssetUrl } from '../../lib/project-assets';
import { MEDIA_SPEED_HELL_RATE } from '../../media-speed/domain/playback-rate';
import type {
  MediaSpeedSelection,
  MediaSpeedStandardSpeed,
  MediaSpeedWheelItem,
} from '../../media-speed/domain/types';
import { mediaSpeedSelectionsEqual } from '../../media-speed/domain/types';
import { gsap } from '../../motion/gsap';
import { sequencedActionHexColors } from '../manager-interaction/action-colors';
import { DECK_ENTRY_LAYOUT } from './deck-entry-layout';
import { mediaSpeedWheelItemColor } from './media-speed-option-color';
import {
  playMediaSpeedProjectileEffect,
  prepareMediaSpeedProjectileEffect,
} from './media-speed-projectile-effect';
import { mediaSpeedWheelFocusIsIntentional } from './media-speed-wheel-intent';

const ACTION_FRAME_URL = projectAssetUrl(
  'userscript-deck/visual/cards/action-frame-square.webp',
);

type RadialOption =
  | {
      id: string;
      kind: 'speed';
      speed: MediaSpeedStandardSpeed;
      label: string;
      item: Extract<MediaSpeedWheelItem, { kind: 'speed' }>;
      transient: boolean;
      colorIndex: number;
    }
  | {
      id: 'random';
      kind: 'random';
      label: string;
      item: Extract<MediaSpeedWheelItem, { kind: 'random' }>;
      transient: false;
      colorIndex: number;
    }
  | {
      id: 'hell';
      kind: 'hell';
      label: string;
      item: Extract<MediaSpeedWheelItem, { kind: 'hell' }>;
      transient: false;
      colorIndex: number;
    };

type RadialOptionStyle = CSSProperties & {
  '--media-speed-color': string;
};

export function mediaSpeedRadialOptions(
  items: readonly MediaSpeedWheelItem[],
  selection: MediaSpeedSelection,
): RadialOption[] {
  const configured = items.map<RadialOption>((item, colorIndex) =>
    item.kind === 'speed'
      ? {
          id: `speed-${item.speed}`,
          kind: 'speed',
          speed: item.speed,
          label: `${item.speed}×`,
          item,
          transient: false,
          colorIndex,
        }
      : item.kind === 'random'
        ? {
            id: 'random',
            kind: 'random',
            label: '命运投掷',
            item,
            transient: false,
            colorIndex,
          }
        : {
            id: 'hell',
            kind: 'hell',
            label: '地狱',
            item,
            transient: false,
            colorIndex,
          },
  );
  if (
    selection.mode === 'standard' &&
    !configured.some(
      (option) => option.kind === 'speed' && option.speed === selection.speed,
    )
  ) {
    configured.unshift({
      id: `native-speed-${selection.speed}`,
      kind: 'speed',
      speed: selection.speed,
      label: `${selection.speed}×`,
      item: { kind: 'speed', speed: selection.speed },
      transient: true,
      colorIndex: items.length,
    });
  }
  return configured;
}

function selectedOptionIndex(
  options: readonly RadialOption[],
  selection: MediaSpeedSelection,
) {
  return selection.mode === 'hell'
    ? options.findIndex((option) => option.kind === 'hell')
    : options.findIndex(
        (option) => option.kind === 'speed' && option.speed === selection.speed,
      );
}

function shortestRotation(current: number, target: number) {
  return current + (((target - current + 540) % 360) - 180);
}

function clockwiseSpinTarget(current: number, target: number, rounds: number) {
  const clockwiseDelta = (((target - current) % 360) + 360) % 360;
  return current + rounds * 360 + clockwiseDelta;
}

function clockwiseOrder(startIndex: number, count: number) {
  return Array.from(
    { length: count },
    (_, offset) => (startIndex + offset) % count,
  );
}

export function mediaSpeedCollapsedTranslation(x: number, y: number) {
  return { x: -x, y: -y };
}

export function MediaSpeedRadialMenu({
  items,
  selection,
  visible,
  expanded,
  onClosed,
  onRequestExpand,
  onSelect,
}: {
  items: readonly MediaSpeedWheelItem[];
  selection: MediaSpeedSelection;
  visible: boolean;
  expanded: boolean;
  onClosed: () => void;
  onRequestExpand: () => void;
  onSelect: (selection: MediaSpeedSelection) => void;
}) {
  const rootRef = useRef<HTMLFieldSetElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const presenceTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const selectionTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const selectionOperationRef = useRef(0);
  const currentRotationRef = useRef(0);
  const animatingRef = useRef(false);
  const enteredRef = useRef(false);
  const [selectionInProgress, setSelectionInProgress] = useState(false);
  const [visualSelectedIndex, setVisualSelectedIndex] = useState<number | null>(
    null,
  );
  const renderExpanded = expanded || selectionInProgress;
  const options = useMemo(
    () => mediaSpeedRadialOptions(items, selection),
    [items, selection],
  );
  const optionsKey = options.map((option) => option.id).join(':');
  const selectedIndex = selectedOptionIndex(options, selection);
  const renderedSelectedIndex =
    selectionInProgress && visualSelectedIndex !== null
      ? visualSelectedIndex
      : selectedIndex;
  const selectedIndexRef = useRef(renderedSelectedIndex);
  selectedIndexRef.current = renderedSelectedIndex;
  const colors = useMemo(
    () => sequencedActionHexColors(Math.max(9, options.length)),
    [options.length],
  );
  const slotAngle = 360 / options.length;
  const radius =
    options.length > 10
      ? DECK_ENTRY_LAYOUT.speed.crowdedRadius
      : DECK_ENTRY_LAYOUT.speed.radius;

  useEffect(() => {
    void prepareMediaSpeedProjectileEffect();
  }, []);

  const optionElements = useCallback(
    () =>
      rootRef.current?.querySelectorAll<HTMLElement>(
        '.manager-media-speed-radial__option',
      ) ?? [],
    [],
  );

  const plateElements = useCallback(
    () =>
      rootRef.current?.querySelectorAll<HTMLElement>(
        '.manager-media-speed-radial__plate',
      ) ?? [],
    [],
  );

  const motionElements = useCallback(
    () =>
      rootRef.current?.querySelectorAll<HTMLElement>(
        '.manager-media-speed-radial__motion',
      ) ?? [],
    [],
  );

  useLayoutEffect(() => {
    const ring = ringRef.current;
    const plates = plateElements();
    if (
      !ring ||
      plates.length === 0 ||
      renderedSelectedIndex < 0 ||
      animatingRef.current
    ) {
      return;
    }
    ring.dataset.optionSignature = optionsKey;
    const target = -(renderedSelectedIndex * slotAngle);
    currentRotationRef.current = target;
    gsap.set(ring, { rotation: target });
    gsap.set(plates, { rotation: -target });
  }, [optionsKey, plateElements, renderedSelectedIndex, slotAngle]);

  useEffect(() => {
    if (!selectionInProgress && visualSelectedIndex !== null) {
      setVisualSelectedIndex(null);
    }
  }, [selectionInProgress, visualSelectedIndex]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const ring = ringRef.current;
    const elements = optionElements();
    const motions = motionElements();
    const plates = plateElements();
    if (
      !root ||
      !ring ||
      elements.length === 0 ||
      motions.length !== elements.length ||
      plates.length !== elements.length
    ) {
      return;
    }
    const selectedElement = elements[selectedIndexRef.current] ?? elements[0];
    const selectedMotion = motions[selectedIndexRef.current] ?? motions[0];
    if (!selectedElement || !selectedMotion) return;
    const collapsedOffset = (index: number) =>
      mediaSpeedCollapsedTranslation(
        Number(elements[index]?.dataset.targetX) || 0,
        Number(elements[index]?.dataset.targetY) || 0,
      );
    const collapsedOffsets = [...motions].map((_motion, index) =>
      collapsedOffset(index),
    );
    const collapsedOffsetByMotion = new Map(
      [...motions].map((motion, index) => [
        motion,
        collapsedOffsets[index] ?? { x: 0, y: 0 },
      ]),
    );
    root.dataset.optionSignature = optionsKey;
    presenceTimelineRef.current?.kill();
    selectionOperationRef.current += 1;
    selectionTimelineRef.current?.kill();
    animatingRef.current = false;
    gsap.killTweensOf([root, ring, ...elements, ...motions, ...plates]);
    for (const element of elements) {
      element.classList.remove('is-landing');
      gsap.set(element, {
        x: Number(element.dataset.targetX) || 0,
        y: Number(element.dataset.targetY) || 0,
        opacity: 1,
        clearProps: 'filter',
      });
    }

    if (!visible) {
      enteredRef.current = false;
      setSelectionInProgress(false);
      setVisualSelectedIndex(null);
      presenceTimelineRef.current = gsap
        .timeline({ onComplete: onClosed })
        .to(motions, {
          x: (index) => collapsedOffset(index).x,
          y: (index) => collapsedOffset(index).y,
          scale: 0.42,
          opacity: 0,
          rotation: -12,
          filter: 'brightness(0.62) saturate(0.7)',
          duration: 0.38,
          stagger: { each: 0.026, from: 'end' },
          ease: 'power3.inOut',
        })
        .to(root, { opacity: 0, duration: 0.14, ease: 'power2.in' }, '<58%');
      return () => {
        presenceTimelineRef.current?.kill();
      };
    }

    gsap.set(root, { opacity: 1 });
    if (!enteredRef.current) {
      enteredRef.current = true;
      gsap.set(motions, {
        x: (index) => collapsedOffset(index).x,
        y: (index) => collapsedOffset(index).y,
        scale: 0.52,
        opacity: 0,
        rotation: -18,
        filter: 'brightness(0.62) saturate(0.72)',
      });
      gsap.set(selectedMotion, {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        rotation: 0,
        filter: 'brightness(1) saturate(1)',
      });
    }

    if (renderExpanded) {
      const timeline = gsap.timeline();
      const order = clockwiseOrder(
        Math.max(0, selectedIndexRef.current),
        elements.length,
      );
      order.forEach((optionIndex, sequenceIndex) => {
        const element = elements[optionIndex];
        const motion = motions[optionIndex];
        if (!element || !motion) return;
        const targetX = Number(element.dataset.targetX);
        const targetY = Number(element.dataset.targetY);
        const startAt = sequenceIndex * 0.052;
        timeline
          .to(
            motion,
            {
              x: targetX * 0.055,
              y: targetY * 0.055,
              scale: 1.075,
              opacity: 1,
              rotation: 4,
              filter: 'brightness(1.14) saturate(1.08)',
              duration: 0.52,
              ease: 'power3.out',
            },
            startAt,
          )
          .to(
            motion,
            {
              x: 0,
              y: 0,
              scale: 1,
              rotation: 0,
              filter: 'brightness(1) saturate(1)',
              duration: 0.26,
              ease: 'back.out(1.48)',
            },
            startAt + 0.36,
          );
      });
      presenceTimelineRef.current = timeline;
      return () => {
        timeline.kill();
      };
    }

    const collapsingMotions = [...motions].filter(
      (motion) => motion !== selectedMotion,
    );
    const collapsingOffsets = collapsingMotions.map(
      (motion) => collapsedOffsetByMotion.get(motion) ?? { x: 0, y: 0 },
    );
    presenceTimelineRef.current = gsap
      .timeline()
      .to(
        collapsingMotions,
        {
          x: (index) => collapsingOffsets[index]?.x ?? 0,
          y: (index) => collapsingOffsets[index]?.y ?? 0,
          scale: 0.62,
          opacity: 0,
          rotation: -10,
          filter: 'brightness(0.64) saturate(0.7)',
          duration: 0.46,
          stagger: { each: 0.032, from: 'end' },
          ease: 'power3.inOut',
        },
        0,
      )
      .to(
        selectedMotion,
        {
          x: 0,
          y: 0,
          scale: 1,
          opacity: 1,
          rotation: 0,
          filter: 'brightness(1) saturate(1)',
          duration: 0.46,
          ease: 'power3.inOut',
        },
        0,
      );
    return () => {
      presenceTimelineRef.current?.kill();
    };
  }, [
    motionElements,
    onClosed,
    optionElements,
    optionsKey,
    plateElements,
    renderExpanded,
    visible,
  ]);

  useEffect(
    () => () => {
      selectionOperationRef.current += 1;
      presenceTimelineRef.current?.kill();
      selectionTimelineRef.current?.kill();
      const root = rootRef.current;
      const ring = ringRef.current;
      const elements = optionElements();
      const motions = motionElements();
      if (root && ring) {
        gsap.killTweensOf([
          root,
          ring,
          ...elements,
          ...motions,
          ...plateElements(),
        ]);
      }
      for (const element of elements) element.classList.remove('is-landing');
    },
    [motionElements, optionElements, plateElements],
  );

  const settleSelection = (
    targetIndex: number,
    nextSelection: MediaSpeedSelection,
    random: boolean,
  ) => {
    const ring = ringRef.current;
    const elements = [...optionElements()];
    const motions = [...motionElements()];
    const plates = [...plateElements()];
    const target = elements[targetIndex];
    const targetMotion = motions[targetIndex];
    if (
      !ring ||
      !target ||
      !targetMotion ||
      elements.length === 0 ||
      plates.length === 0
    )
      return;
    selectionOperationRef.current += 1;
    const operation = selectionOperationRef.current;
    presenceTimelineRef.current?.kill();
    selectionTimelineRef.current?.kill();
    gsap.killTweensOf([ring, ...plates, ...elements, ...motions]);
    gsap.set(elements, { clearProps: 'filter' });
    gsap.to(motions, {
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      rotation: 0,
      filter: 'brightness(1) saturate(1)',
      duration: 0.18,
      ease: 'power2.out',
    });
    for (const element of elements) element.classList.remove('is-landing');

    const measuredRotation = Number(gsap.getProperty(ring, 'rotation'));
    const current = Number.isFinite(measuredRotation)
      ? measuredRotation
      : currentRotationRef.current;
    const baseTarget = -(targetIndex * slotAngle);
    const targetRotation = random
      ? clockwiseSpinTarget(
          current,
          baseTarget,
          3 + Math.floor(Math.random() * 2),
        )
      : shortestRotation(current, baseTarget);
    const rotationDistance = Math.abs(targetRotation - current);
    const rotationDuration = random
      ? 1.46
      : rotationDistance < 0.5
        ? 0.18
        : Math.min(0.82, 0.5 + rotationDistance / 720);
    const accelerationTarget = current + 185;
    animatingRef.current = true;
    setVisualSelectedIndex(targetIndex);
    setSelectionInProgress(true);

    const commit = () => {
      if (operation !== selectionOperationRef.current) return;
      target.classList.add('is-landing');
      onSelect(nextSelection);
    };
    const timeline = gsap.timeline({
      onComplete: () => {
        if (operation !== selectionOperationRef.current) return;
        currentRotationRef.current = targetRotation;
        animatingRef.current = false;
        target.classList.remove('is-landing');
        selectionTimelineRef.current = null;
        setSelectionInProgress(false);
      },
      onInterrupt: () => {
        target.classList.remove('is-landing');
        if (operation === selectionOperationRef.current) {
          animatingRef.current = false;
          selectionTimelineRef.current = null;
          setVisualSelectedIndex(null);
          setSelectionInProgress(false);
        }
      },
    });
    selectionTimelineRef.current = timeline;

    if (random) {
      timeline
        .to(ring, {
          rotation: accelerationTarget,
          duration: 0.22,
          ease: 'power2.in',
        })
        .to(
          plates,
          {
            rotation: -accelerationTarget,
            duration: 0.22,
            ease: 'power2.in',
          },
          '<',
        );
    }

    timeline
      .to(ring, {
        rotation: targetRotation,
        duration: rotationDuration,
        ease: random ? 'power4.out' : 'power3.inOut',
      })
      .to(
        plates,
        {
          rotation: -targetRotation,
          duration: rotationDuration,
          ease: random ? 'power4.out' : 'power3.inOut',
        },
        '<',
      )
      .add(commit)
      .to(targetMotion, {
        scale: 1.06,
        filter: 'brightness(1.38) saturate(1.12)',
        duration: 0.14,
        ease: 'power2.out',
      })
      .to(targetMotion, {
        scale: 1,
        filter: 'brightness(1) saturate(1)',
        duration: 0.3,
        ease: 'elastic.out(1, 0.52)',
      });
  };

  return (
    <fieldset
      ref={rootRef}
      className={`manager-media-speed-radial${visible ? ' is-visible' : ''}${renderExpanded ? ' is-expanded' : ' is-collapsed'}`}
      data-option-count={options.length}
      aria-hidden={!visible}
    >
      <legend>页面视频速度</legend>
      <div ref={ringRef} className="manager-media-speed-radial__ring">
        {options.map((option, index) => {
          const angle = index * slotAngle;
          const radians = (angle * Math.PI) / 180;
          const targetX = Math.sin(radians) * radius;
          const targetY = -Math.cos(radians) * radius;
          const selected = index === renderedSelectedIndex;
          const color = mediaSpeedWheelItemColor(
            option.item,
            option.colorIndex,
            colors,
          );
          return (
            <button
              key={option.id}
              type="button"
              className={`manager-media-speed-radial__option is-${option.kind}${selected ? ' is-selected' : ''}`}
              style={{ '--media-speed-color': color } as RadialOptionStyle}
              data-target-x={targetX}
              data-target-y={targetY}
              aria-pressed={selected}
              aria-hidden={!renderExpanded && !selected}
              aria-label={option.label}
              tabIndex={visible && (renderExpanded || selected) ? 0 : -1}
              aria-disabled={!visible || (!renderExpanded && !selected)}
              onPointerEnter={() => {
                void prepareMediaSpeedProjectileEffect(option.colorIndex);
              }}
              onFocus={(event) => {
                void prepareMediaSpeedProjectileEffect(option.colorIndex);
                if (
                  !renderExpanded &&
                  mediaSpeedWheelFocusIsIntentional(
                    event.relatedTarget,
                    event.currentTarget.matches(':focus-visible'),
                  )
                ) {
                  onRequestExpand();
                }
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (!renderExpanded) {
                  onRequestExpand();
                  return;
                }
                if (option.kind === 'random') {
                  const candidates = options.flatMap(
                    (candidate, candidateIndex) =>
                      candidate.kind === 'speed' &&
                      !candidate.transient &&
                      (selection.mode !== 'standard' ||
                        candidate.speed !== selection.speed)
                        ? [{ index: candidateIndex, speed: candidate.speed }]
                        : [],
                  );
                  const result =
                    candidates[Math.floor(Math.random() * candidates.length)] ??
                    options.flatMap((candidate, candidateIndex) =>
                      candidate.kind === 'speed'
                        ? [{ index: candidateIndex, speed: candidate.speed }]
                        : [],
                    )[0];
                  if (!result) return;
                  const destination = options[result.index];
                  if (!destination) return;
                  playMediaSpeedProjectileEffect(event.currentTarget, {
                    targetColor: mediaSpeedWheelItemColor(
                      destination.item,
                      destination.colorIndex,
                      colors,
                    ),
                    playbackRate: result.speed,
                    mode: 'random',
                    effectIndex: option.colorIndex,
                  });
                  settleSelection(
                    result.index,
                    { mode: 'standard', speed: result.speed },
                    true,
                  );
                  return;
                }
                const nextSelection =
                  option.kind === 'hell'
                    ? ({ mode: 'hell' } as const)
                    : ({ mode: 'standard', speed: option.speed } as const);
                if (!mediaSpeedSelectionsEqual(selection, nextSelection)) {
                  playMediaSpeedProjectileEffect(event.currentTarget, {
                    targetColor: color,
                    playbackRate:
                      nextSelection.mode === 'hell'
                        ? MEDIA_SPEED_HELL_RATE
                        : nextSelection.speed,
                    mode: nextSelection.mode,
                    effectIndex: option.colorIndex,
                  });
                }
                settleSelection(index, nextSelection, false);
              }}
            >
              <span className="manager-media-speed-radial__motion">
                <span className="manager-media-speed-radial__emphasis">
                  <span className="manager-media-speed-radial__plate manager-action-plate">
                    <span
                      className="manager-action__activation-aura"
                      aria-hidden="true"
                    />
                    <img
                      className="manager-action__frame"
                      src={ACTION_FRAME_URL}
                      alt=""
                    />
                    <span className="manager-media-speed-radial__copy">
                      {option.kind === 'random' ? (
                        <Dice5 size={18} strokeWidth={2.2} aria-hidden="true" />
                      ) : option.kind === 'hell' ? (
                        <Skull size={18} strokeWidth={2.2} aria-hidden="true" />
                      ) : (
                        <b>{option.label}</b>
                      )}
                    </span>
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
