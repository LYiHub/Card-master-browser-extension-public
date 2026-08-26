import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';

import type { AudioDirector } from '../../audio/AudioDirector';
import { projectAssetUrl } from '../../lib/project-assets';
import { gsap } from '../../motion/gsap-motion-path';
import { matchInstalledUserscript } from '../../userscript/domain/matcher';
import type {
  InstalledUserscript,
  ScriptMatchContext,
} from '../../userscript/domain/types';
import {
  CARD_COLLECTION_CARD_DIAMETER,
  cardScaleInsideCircle,
  cardSequenceStagger,
  managerCardDimensions,
} from '../manager-interaction/layout';
import { ManagerCardFace } from '../manager-interaction/ManagerCardFace';
import { useReducedMotion } from '../manager-interaction/useReducedMotion';
import { addCommandReveal } from './action-animations';
import {
  type CardCreationPreviewCard,
  cardCreationPreviewCard,
} from './CardCreationPreview';

const DECK_CARD_DROP = 10;
const DECK_TURNOVER_HALF_DURATION = 0.13;
const DECK_TURNOVER_FINISH_DURATION = 0.15;
const FAN_RADIAL_OFFSETS = [
  0, -1.8, 1.2, -2.4, 0.8, 2.1, -1, 1.6, -2, 0.4,
] as const;

const CARD_BACK_URL = projectAssetUrl(
  'userscript-deck/visual/cards/card-master-back.webp',
);
const CARD_EDGE_URL = projectAssetUrl('userscript-deck/visual/cards/edge.webp');
const IMPORT_COVER_FALLBACK_URL = projectAssetUrl(
  'userscript-deck/card-art/userscript-cards/01.webp',
);

export type LibraryImportDestination = 'formation' | 'deck';

export type LibraryImportCelebrationItem = {
  id: string;
  enabled: boolean;
  destination: LibraryImportDestination;
  card: CardCreationPreviewCard;
};

type DeckTarget = {
  x: number;
  y: number;
};

export function libraryImportAudioIndices(total: number) {
  const count = Math.max(0, Math.trunc(total));
  if (count === 0) return new Set<number>();
  const last = count - 1;
  return new Set([
    0,
    Math.round(last * 0.25),
    Math.round(last * 0.5),
    Math.round(last * 0.75),
    last,
  ]);
}

export function libraryImportFanPositions({
  total,
  fanWidth,
  cardWidth,
  cardHeight,
  centerX,
  apexCenterY,
}: {
  total: number;
  fanWidth: number;
  cardWidth: number;
  cardHeight: number;
  centerX: number;
  apexCenterY: number;
}) {
  const count = Math.max(0, Math.trunc(total));
  if (count === 0) return [];
  const centerIndex = (count - 1) / 2;
  const maximumRotation = Math.min(24, centerIndex * 3.4);
  const maximumAngle = (maximumRotation * Math.PI) / 180;
  const radius = maximumAngle > 0 ? fanWidth / (2 * Math.sin(maximumAngle)) : 0;

  return Array.from({ length: count }, (_, index) => {
    const angle =
      centerIndex === 0
        ? 0
        : ((index - centerIndex) / centerIndex) * maximumAngle;
    const radialOffset =
      count > 1
        ? (FAN_RADIAL_OFFSETS[(index + count) % FAN_RADIAL_OFFSETS.length] ?? 0)
        : 0;
    const cardRadius = radius + radialOffset;
    return {
      x: centerX + cardRadius * Math.sin(angle) - cardWidth / 2,
      y: apexCenterY + radius - cardRadius * Math.cos(angle) - cardHeight / 2,
      rotation: (angle * 180) / Math.PI,
    };
  });
}

export function libraryImportDeckMotion(
  currentX: number,
  currentY: number,
  target: Pick<DeckTarget, 'x' | 'y'>,
  lane: number,
) {
  const distance = Math.hypot(target.x - currentX, target.y - currentY);
  const direction = target.x >= currentX ? 1 : -1;
  const laneOffset = ((lane % 5) - 2) * 9;
  return {
    duration: Math.min(1.32, Math.max(1.02, distance / 660)),
    curviness: 1.24,
    path: [
      {
        x: currentX - direction * 24,
        y: currentY - 82,
      },
      {
        x: currentX + (target.x - currentX) * 0.58 + laneOffset,
        y: Math.min(currentY, target.y) - 124 - Math.abs(laneOffset) * 0.4,
      },
      {
        x: target.x - direction * 48,
        y: target.y - 42,
      },
      { x: target.x, y: target.y },
    ],
  };
}

export function libraryImportDestination(
  script: InstalledUserscript,
  runtimeContext: ScriptMatchContext,
): LibraryImportDestination {
  return script.manager.enabled &&
    matchInstalledUserscript(script, runtimeContext).eligible
    ? 'formation'
    : 'deck';
}

export function libraryImportCelebrationItem(
  script: InstalledUserscript,
  runtimeContext: ScriptMatchContext,
): LibraryImportCelebrationItem {
  return {
    id: script.id,
    enabled: script.manager.enabled,
    destination: libraryImportDestination(script, runtimeContext),
    card: cardCreationPreviewCard(script),
  };
}

function formationCard(root: HTMLElement, cardId: string) {
  return [...root.querySelectorAll<HTMLElement>('.manager-card')].find(
    (card) => card.dataset.managerCardId === cardId,
  );
}

function deckTarget(element: HTMLElement | null): DeckTarget {
  const logo = element?.querySelector<HTMLElement>(
    '.manager-deck-trigger__logo',
  );
  const bounds = (logo ?? element)?.getBoundingClientRect();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return {
      x: window.innerWidth - 70,
      y: window.innerHeight - 78,
    };
  }
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) {
    return {
      x: window.innerWidth - 70,
      y: window.innerHeight - 78,
    };
  }
  return { x, y };
}

export function LibraryImportCelebration({
  requestId,
  items,
  deckTriggerElement,
  audio,
  onActiveItemChange,
  onComplete,
}: {
  requestId: string;
  items: readonly LibraryImportCelebrationItem[];
  deckTriggerElement: HTMLElement | null;
  audio: Pick<AudioDirector, 'play' | 'prepare'>;
  onActiveItemChange?: (item: LibraryImportCelebrationItem | null) => void;
  onComplete: (requestId: string) => void;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [collectedCardIds, setCollectedCardIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const root = layer?.parentElement;
    if (!layer || !root) {
      onComplete(requestId);
      return;
    }
    const importPlaque = root.querySelector<HTMLElement>(
      '.context-plaque.is-import-presentation',
    );
    const restoreImportPlaque = () => {
      if (importPlaque) {
        gsap.set(importPlaque, { clearProps: 'opacity,transform' });
      }
    };

    const { width: cardWidth, height: cardHeight } = managerCardDimensions(
      window.innerWidth,
    );
    layer.style.setProperty('--manager-import-card-width', `${cardWidth}px`);
    const formationEntries = items.flatMap((item) => {
      if (item.destination !== 'formation') return [];
      const card = formationCard(root, item.id);
      const glow = card?.querySelector<HTMLElement>(
        '.manager-card-glow-effect',
      );
      if (!card || !glow) return [];
      const bounds = card.getBoundingClientRect();
      return [
        {
          item,
          card,
          flipper: card.querySelector<HTMLElement>('.manager-card__flipper'),
          face: card.querySelector<HTMLElement>('.manager-card__face'),
          glow,
          aura: glow.querySelector<HTMLElement>('.manager-card__charge-aura'),
          ring: glow.querySelector<HTMLElement>('.manager-card__charge-ring'),
          rays: glow.querySelector<HTMLElement>('.manager-card__charge-rays'),
          flash: glow.querySelector<HTMLElement>('.manager-card__charge-flash'),
          baseY: Number(gsap.getProperty(card, 'y')) || 0,
          positionX: bounds.left + bounds.width / 2,
        },
      ];
    });
    const deckEntries = items.flatMap((item) => {
      if (item.destination !== 'deck') return [];
      const card = cardRefs.current.get(item.id);
      if (!card) return [];
      return [
        {
          item,
          card,
          tilt: card.querySelector<HTMLElement>(
            '.manager-card-creation-preview__tilt',
          ),
          flipper: card.querySelector<HTMLElement>(
            '.manager-card-creation-preview__flipper',
          ),
        },
      ];
    });
    const deckCards = deckEntries.map((entry) => entry.card);
    if (formationEntries.length === 0 && deckEntries.length === 0) {
      onActiveItemChange?.(null);
      onComplete(requestId);
      return;
    }

    if (reducedMotion) {
      gsap.set(layer, { opacity: 0 });
      if (importPlaque) gsap.set(importPlaque, { opacity: 0, y: 12 });
      const timeline = gsap.timeline({
        onComplete: () => {
          restoreImportPlaque();
          onActiveItemChange?.(null);
          onComplete(requestId);
        },
      });
      timeline.to(layer, { opacity: 1, duration: 0.24, ease: 'power2.out' }, 0);
      if (importPlaque) {
        timeline.to(
          importPlaque,
          { opacity: 1, y: 0, duration: 0.24, ease: 'power2.out' },
          0,
        );
      }
      timeline.to(
        layer,
        { opacity: 0, duration: 0.24, ease: 'power2.in' },
        0.24,
      );
      return () => {
        timeline.kill();
        restoreImportPlaque();
      };
    }

    const formationStagger = cardSequenceStagger(
      formationEntries.length,
      0,
      0.085,
      0.72,
    );
    const fanStagger = cardSequenceStagger(deckEntries.length, 0, 0.055, 0.86);
    const fanStepDuration = Math.max(0.045, fanStagger);
    const turnoverStagger = cardSequenceStagger(
      deckEntries.length,
      DECK_TURNOVER_HALF_DURATION + DECK_TURNOVER_FINISH_DURATION,
      0.04,
      0.92,
    );
    const routingStagger = cardSequenceStagger(
      deckEntries.length,
      1.32,
      0.06,
      2,
    );
    const formationAudioIndices = libraryImportAudioIndices(
      formationEntries.length,
    );
    const deckAudioIndices = libraryImportAudioIndices(deckEntries.length);
    const playbackRate = (index: number, total: number) =>
      0.96 + (Math.max(0, index) / Math.max(1, total - 1)) * 0.12;

    const restoreFormationCard = (entry: (typeof formationEntries)[number]) => {
      gsap.set(entry.card, {
        y: entry.baseY,
        clearProps: 'opacity,visibility',
      });
      if (entry.flipper) gsap.set(entry.flipper, { clearProps: 'transform' });
      if (entry.face) gsap.set(entry.face, { clearProps: 'filter' });
      entry.glow.style.removeProperty('--action-color');
      gsap.set(
        [entry.aura, entry.ring, entry.rays, entry.flash].filter(
          (element): element is HTMLElement => element !== null,
        ),
        { clearProps: 'opacity,transform,visibility' },
      );
      entry.card.classList.remove('is-import-revealing');
    };
    const restoreFormationCards = () => {
      formationEntries.forEach(restoreFormationCard);
    };

    formationEntries.forEach(
      ({ item, card, flipper, glow, aura, ring, rays, flash, baseY }) => {
        card.classList.add('is-import-revealing');
        gsap.set(card, {
          y: baseY,
          opacity: 0,
          visibility: 'visible',
        });
        if (flipper) gsap.set(flipper, { rotationY: 180 });
        glow.style.setProperty('--action-color', item.card.accent);
        if (aura) {
          gsap.set(aura, { opacity: 0, scale: 0.58, visibility: 'visible' });
        }
        if (ring) {
          gsap.set(ring, { opacity: 0, scale: 0.82, visibility: 'visible' });
        }
        if (rays) {
          gsap.set(rays, {
            opacity: 0,
            scale: 0.78,
            rotation: -12,
            visibility: 'visible',
          });
        }
        if (flash) {
          gsap.set(flash, {
            opacity: 0,
            scale: 0.72,
            visibility: 'visible',
          });
        }
      },
    );

    const deckDestination = deckTarget(deckTriggerElement);
    const stageCenterX = window.innerWidth / 2;
    const stageCenterY = window.innerHeight * 0.42;
    const centerX = stageCenterX - cardWidth / 2;
    const centerY = stageCenterY - cardHeight / 2;
    const fanWidth = Math.min(
      window.innerWidth * 0.62,
      Math.max(0, (deckCards.length - 1) * cardWidth * 0.42),
    );
    const fanPositions = libraryImportFanPositions({
      total: deckCards.length,
      fanWidth,
      cardWidth,
      cardHeight,
      centerX: stageCenterX,
      apexCenterY: stageCenterY,
    });
    const spreadStart = fanPositions[0] ?? {
      x: centerX,
      y: centerY,
      rotation: 0,
    };
    const deckFlippers = deckEntries.flatMap(({ flipper }) =>
      flipper ? [flipper] : [],
    );
    const deckTilts = deckEntries.flatMap(({ tilt }) => (tilt ? [tilt] : []));
    const stageLine =
      deckCards.length > 0
        ? layer.querySelector<HTMLElement>(
            '.manager-library-import-celebration__stage-line',
          )
        : null;
    gsap.set(layer, { opacity: 0 });
    if (importPlaque) gsap.set(importPlaque, { opacity: 0, y: 28 });
    if (stageLine) {
      gsap.set(stageLine, { opacity: 0, scaleX: 0.16 });
    }
    deckCards.forEach((card, index) => {
      gsap.set(card, {
        x: spreadStart.x,
        y: spreadStart.y - DECK_CARD_DROP + 44,
        zIndex: 20 + index,
        rotation: spreadStart.rotation,
        scale: 0.9,
        opacity: 0,
        visibility: 'visible',
        transformOrigin: '50% 50%',
      });
      const tilt = deckEntries[index]?.tilt;
      if (tilt) {
        gsap.set(tilt, {
          rotationX: 0,
          rotationY: 0,
          transformPerspective: 900,
        });
      }
    });
    gsap.set(deckFlippers, {
      rotationY: 180,
      scaleX: 1,
      transformOrigin: '50% 50%',
    });

    let disposed = false;
    const timeline = gsap.timeline({
      paused: true,
      onComplete: () => {
        restoreFormationCards();
        restoreImportPlaque();
        onActiveItemChange?.(null);
        onComplete(requestId);
      },
      onInterrupt: () => {
        restoreFormationCards();
        restoreImportPlaque();
        onActiveItemChange?.(null);
      },
    });
    timeline.to(layer, { opacity: 1, duration: 0.12, ease: 'power1.out' }, 0);
    if (importPlaque) {
      timeline.to(
        importPlaque,
        {
          opacity: 1,
          y: 0,
          duration: 0.52,
          ease: 'power3.out',
        },
        0,
      );
    }
    if (stageLine) {
      timeline.to(
        stageLine,
        {
          opacity: 0.72,
          scaleX: 1,
          duration: 0.36,
          ease: 'power3.out',
        },
        0.04,
      );
    }

    let finishAt = 0;
    formationEntries.forEach((entry, index) => {
      const {
        item,
        card,
        flipper,
        face,
        aura,
        ring,
        rays,
        flash,
        baseY,
        positionX,
      } = entry;
      const start = 0.05 + index * formationStagger;
      const riseAt = start + 0.05;
      const apexAt = riseAt + 0.28;
      const landingAt = apexAt + 0.22;
      const flipAt = start + 0.12;
      const revealAt = flipAt + 0.18;

      timeline
        .call(() => onActiveItemChange?.(item), undefined, start)
        .to(
          card,
          {
            opacity: 1,
            duration: 0.1,
            ease: 'power2.out',
          },
          start,
        )
        .to(
          card,
          {
            y: baseY - 56,
            duration: 0.28,
            ease: 'power3.out',
          },
          riseAt,
        )
        .to(
          card,
          {
            y: baseY + 6,
            duration: 0.22,
            ease: 'power2.in',
          },
          apexAt,
        )
        .to(
          card,
          {
            y: baseY,
            duration: 0.16,
            ease: 'back.out(2.4)',
          },
          landingAt,
        );
      if (formationAudioIndices.has(index)) {
        timeline
          .call(
            () =>
              audio.play('cardFlip', {
                positionX,
                gain: 0.72,
                playbackRate: playbackRate(index, formationEntries.length),
              }),
            undefined,
            flipAt,
          )
          .call(
            () =>
              audio.play('cardPlace', {
                positionX,
                gain: 0.62,
                playbackRate: playbackRate(
                  formationEntries.length - 1 - index,
                  formationEntries.length,
                ),
              }),
            undefined,
            landingAt,
          );
      }
      if (flipper) {
        timeline
          .to(
            flipper,
            {
              rotationY: 90,
              duration: 0.18,
              ease: 'power3.in',
            },
            flipAt,
          )
          .to(
            flipper,
            {
              rotationY: 0,
              duration: 0.22,
              ease: 'power3.out',
            },
            revealAt,
          );
      }
      const revealFinish = addCommandReveal(
        timeline,
        { face, aura, ring, rays, flash },
        revealAt,
      );
      const finish = Math.max(landingAt + 0.16, revealFinish + 0.04);
      timeline.call(() => restoreFormationCard(entry), undefined, finish);
      finishAt = Math.max(finishAt, finish);
    });

    const stackAt = 0.08;
    const fanAt = stackAt + 0.24;
    if (deckEntries[0]) {
      timeline.call(
        () => onActiveItemChange?.(deckEntries[0]?.item ?? null),
        undefined,
        stackAt,
      );
      timeline.call(
        () =>
          audio.play('deckOpen', {
            positionX: window.innerWidth / 2,
            gain: 0.72,
            playbackRate: 1.06,
          }),
        undefined,
        stackAt,
      );
    }
    if (deckCards.length > 0) {
      timeline.to(
        deckCards,
        {
          y: spreadStart.y - DECK_CARD_DROP,
          scale: 1,
          opacity: 1,
          duration: 0.2,
          ease: 'power3.out',
        },
        stackAt,
      );
    }

    deckEntries.forEach(({ card }, index) => {
      const start = fanAt + index * fanStagger;
      const fan = fanPositions[index] ?? { x: centerX, y: centerY };
      const remainingCards = deckCards.slice(index);

      timeline
        .to(
          remainingCards,
          {
            x: fan.x,
            y: fan.y - DECK_CARD_DROP,
            rotation: fan.rotation,
            scale: 1,
            duration: fanStepDuration,
            ease: 'power1.inOut',
          },
          start,
        )
        .to(
          card,
          {
            y: fan.y,
            duration: 0.08,
            ease: 'power2.out',
          },
          start + fanStepDuration,
        );
      if (deckAudioIndices.has(index)) {
        timeline.call(
          () =>
            audio.play('cardDeal', {
              positionX: fan.x + cardWidth / 2,
              gain: 0.68,
              playbackRate: playbackRate(index, deckEntries.length),
            }),
          undefined,
          start + fanStepDuration,
        );
      }
    });

    const spreadFinishAt =
      fanAt +
      Math.max(0, deckEntries.length - 1) * fanStagger +
      fanStepDuration +
      0.08;
    const turnoverAt = fanAt + (spreadFinishAt - fanAt) * (2 / 3);
    deckEntries.forEach(({ item, card, flipper }, index) => {
      const start = turnoverAt + index * turnoverStagger;

      timeline.call(() => onActiveItemChange?.(item), undefined, start);
      if (deckAudioIndices.has(index)) {
        timeline.call(
          () =>
            audio.play('cardFlip', {
              positionX: (fanPositions[index]?.x ?? centerX) + cardWidth / 2,
              gain: 0.76,
              playbackRate: playbackRate(index, deckEntries.length),
            }),
          undefined,
          start,
        );
      }
      timeline.set(
        card,
        {
          zIndex: 20 + deckEntries.length + (deckEntries.length - 1 - index),
        },
        start + DECK_TURNOVER_HALF_DURATION,
      );
      if (flipper) {
        timeline
          .to(
            flipper,
            {
              scaleX: 0.08,
              duration: DECK_TURNOVER_HALF_DURATION,
              ease: 'power2.in',
            },
            start,
          )
          .set(flipper, { rotationY: 0 }, start + DECK_TURNOVER_HALF_DURATION)
          .to(
            flipper,
            {
              scaleX: 1,
              duration: DECK_TURNOVER_FINISH_DURATION,
              ease: 'power2.out',
            },
            start + DECK_TURNOVER_HALF_DURATION,
          );
      }
    });

    const turnoverFinishAt =
      turnoverAt +
      Math.max(0, deckEntries.length - 1) * turnoverStagger +
      DECK_TURNOVER_HALF_DURATION +
      DECK_TURNOVER_FINISH_DURATION;
    const routingBase = turnoverAt + (turnoverFinishAt - turnoverAt) * (2 / 3);
    deckEntries.forEach(({ item, card }, index) => {
      const cardTurnoverFinishAt =
        turnoverAt +
        index * turnoverStagger +
        DECK_TURNOVER_HALF_DURATION +
        DECK_TURNOVER_FINISH_DURATION;
      const start = Math.max(
        routingBase + index * routingStagger,
        cardTurnoverFinishAt,
      );
      const fan = fanPositions[index] ?? { x: centerX, y: centerY };
      const target = {
        x: deckDestination.x - cardWidth / 2,
        y: deckDestination.y - cardHeight / 2,
      };
      const motion = libraryImportDeckMotion(fan.x, fan.y, target, index);
      const landingAt = start + motion.duration;

      timeline
        .set(card, { zIndex: 100 + (deckEntries.length - 1 - index) }, start)
        .to(
          card,
          {
            motionPath: {
              path: motion.path,
              curviness: motion.curviness,
              autoRotate: false,
            },
            rotation: 0,
            scale: cardScaleInsideCircle(
              cardWidth,
              cardHeight,
              CARD_COLLECTION_CARD_DIAMETER,
            ),
            duration: motion.duration,
            ease: 'power2.inOut',
            overwrite: 'auto',
          },
          start,
        );
      if (deckAudioIndices.has(index)) {
        timeline.call(
          () =>
            audio.play('cardCollect', {
              positionX: fan.x + cardWidth / 2,
              gain: 0.66,
              playbackRate: playbackRate(
                deckEntries.length - 1 - index,
                deckEntries.length,
              ),
            }),
          undefined,
          start + motion.duration * 0.72,
        );
      }
      timeline.call(
        () => {
          gsap.set(card, { autoAlpha: 0 });
          setCollectedCardIds((current) => {
            if (current.has(item.id)) return current;
            const next = new Set(current);
            next.add(item.id);
            return next;
          });
        },
        undefined,
        landingAt,
      );
      finishAt = Math.max(finishAt, landingAt);
    });
    if (deckCards.length > 0) {
      timeline.call(
        () =>
          audio.play('deckClose', {
            positionX: deckDestination.x,
            gain: 0.68,
            playbackRate: 1.05,
          }),
        undefined,
        finishAt,
      );
    }

    if (stageLine) {
      timeline.to(
        stageLine,
        { opacity: 0, scaleX: 0.72, duration: 0.32, ease: 'power2.in' },
        routingBase,
      );
    }
    timeline.to(
      layer,
      { opacity: 0, duration: 0.16, ease: 'power1.in' },
      finishAt + 0.02,
    );

    void audio
      .prepare([
        'deckOpen',
        'deckClose',
        'cardDeal',
        'cardFlip',
        'cardPlace',
        'cardCollect',
      ])
      .finally(() => {
        if (!disposed) timeline.play(0);
      });

    return () => {
      disposed = true;
      restoreFormationCards();
      timeline.kill();
      gsap.killTweensOf([
        layer,
        ...deckCards,
        ...deckTilts,
        ...deckFlippers,
        ...formationEntries.map(({ card }) => card),
        ...formationEntries.flatMap(
          ({ glow, flipper, face, aura, ring, rays, flash }) =>
            [glow, flipper, face, aura, ring, rays, flash].filter(
              (element): element is HTMLElement => element !== null,
            ),
        ),
        ...(stageLine ? [stageLine] : []),
        ...(importPlaque ? [importPlaque] : []),
      ]);
      restoreImportPlaque();
    };
  }, [
    audio,
    deckTriggerElement,
    items,
    onActiveItemChange,
    onComplete,
    reducedMotion,
    requestId,
  ]);

  return (
    <div
      ref={layerRef}
      className="manager-library-import-celebration"
      aria-hidden="true"
    >
      <div className="manager-library-import-celebration__stage-line" />

      {items
        .filter(
          (item) =>
            item.destination === 'deck' && !collectedCardIds.has(item.id),
        )
        .map((item) => (
          <div
            key={item.id}
            ref={(element) => {
              if (element) cardRefs.current.set(item.id, element);
              else cardRefs.current.delete(item.id);
            }}
            className="manager-card-creation-preview__card manager-library-import-celebration__card"
            data-import-destination={item.destination}
            style={{ '--manager-accent': item.card.accent } as CSSProperties}
          >
            <div className="manager-card-creation-preview__tilt manager-card__tilt">
              <div className="manager-card-creation-preview__flipper manager-card__flipper">
                <div className="manager-card-creation-preview__back">
                  <img src={CARD_BACK_URL} alt="" />
                </div>
                <ManagerCardFace
                  active
                  enabled={item.enabled}
                  playing={false}
                  forge
                  showForgeMark={false}
                  finish="framed"
                  media={
                    item.card.media.kind === 'video'
                      ? {
                          kind: 'image',
                          imageUrl:
                            item.card.media.posterImageUrl ??
                            IMPORT_COVER_FALLBACK_URL,
                        }
                      : item.card.media
                  }
                  edgeUrl={CARD_EDGE_URL}
                  stateLabel="收入牌库"
                  stateTone="inactive"
                  title={item.card.title}
                  description={item.card.description}
                />
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
