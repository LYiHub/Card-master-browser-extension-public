import { type CSSProperties, useLayoutEffect, useRef } from 'react';

import type { AudioDirector } from '../../audio/AudioDirector';
import { FORGE_AUDIO_DURATION } from '../../audio/cues';
import { projectAssetUrl } from '../../lib/project-assets';
import { userscriptCardMedia } from '../../lib/userscript-deck-media';
import { gsap } from '../../motion/gsap';
import {
  CARD_COLLECTION_CARD_DIAMETER,
  cardScaleInsideCircle,
} from '../manager-interaction/layout';
import {
  ManagerCardFace,
  type ManagerCardMedia,
} from '../manager-interaction/ManagerCardFace';
import {
  MANAGER_CARD_GLOW_LAYER_SELECTOR,
  ManagerCardGlowEffect,
} from '../manager-interaction/ManagerCardGlowEffect';
import { cardDescription, cardTitle, type DeckCard } from './cards';
import { cardAccent, cardMedia } from './presentation';

const CARD_ASPECT = 3 / 4;
const CARD_WIDTH = 210;
const CARD_HEIGHT = CARD_WIDTH / CARD_ASPECT;
const CARD_BACK_URL = projectAssetUrl(
  'userscript-deck/visual/cards/card-master-back.webp',
);
const CARD_EDGE_URL = projectAssetUrl('userscript-deck/visual/cards/edge.webp');
const PREVIEW_MEDIA = userscriptCardMedia('01');
const PREVIEW_COVER_URL = projectAssetUrl(PREVIEW_MEDIA.poster);

export type CardCreationPreviewCard = {
  title: string;
  description: string;
  media: ManagerCardMedia;
  accent: string;
};

const DEFAULT_PREVIEW_CARD: CardCreationPreviewCard = {
  title: '新生秘术',
  description: '智能体刚刚完成的脚本卡牌',
  media: { kind: 'image', imageUrl: PREVIEW_COVER_URL },
  accent: PREVIEW_MEDIA.accent,
};

export function cardCreationPreviewCard(
  card: DeckCard,
): CardCreationPreviewCard {
  return {
    title: cardTitle(card),
    description: cardDescription(card),
    media: cardMedia(card),
    accent: cardAccent(card),
  };
}

function deckTarget(element: HTMLElement | null) {
  const logo = element?.querySelector<HTMLElement>(
    '.manager-deck-trigger__logo',
  );
  const bounds = (logo ?? element)?.getBoundingClientRect();
  const fallback = {
    x: window.innerWidth - 70,
    y: window.innerHeight - 78,
  };
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return fallback;
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) {
    return fallback;
  }
  return { x, y };
}

export function CardCreationPreview({
  requestId,
  card = DEFAULT_PREVIEW_CARD,
  deckTriggerElement,
  audio,
  onComplete,
}: {
  requestId: string;
  card?: CardCreationPreviewCard;
  deckTriggerElement: HTMLElement | null;
  audio: Pick<AudioDirector, 'play' | 'prepare'>;
  onComplete: (requestId: string) => void;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const flipperRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const card = cardRef.current;
    const flipper = flipperRef.current;
    if (!layer || !card || !flipper) return;

    const target = deckTarget(deckTriggerElement);
    const centerX = window.innerWidth / 2 - CARD_WIDTH / 2;
    const centerY = window.innerHeight * 0.43 - CARD_HEIGHT / 2;
    const targetX = target.x - CARD_WIDTH / 2;
    const targetY = target.y - CARD_HEIGHT / 2;
    const arcX = centerX + (targetX - centerX) * 0.56;
    const arcY = Math.min(centerY, targetY) - 84;
    void audio.prepare(['forgeStart', 'cardFlip', 'cardCollect', 'deckClose']);
    gsap.set(layer, { opacity: 0 });
    gsap.set(card, {
      x: centerX,
      y: centerY + 36,
      rotation: -9,
      scale: 0.16,
      opacity: 0,
      transformOrigin: '50% 50%',
      '--card-glow-strength': 0,
    });
    gsap.set(flipper, { rotationY: 180 });

    let disposed = false;
    let activeTimeline: ReturnType<typeof gsap.timeline> | null = null;
    const playTimeline = (
      build: (timeline: ReturnType<typeof gsap.timeline>) => void,
    ) =>
      new Promise<void>((resolve) => {
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          activeTimeline = null;
          resolve();
        };
        const timeline = gsap.timeline({
          onComplete: settle,
          onInterrupt: settle,
        });
        activeTimeline = timeline;
        build(timeline);
      });

    void (async () => {
      const appear = FORGE_AUDIO_DURATION * (0.56 / 2.16);
      const hold = FORGE_AUDIO_DURATION * (0.16 / 2.16);
      const flip = FORGE_AUDIO_DURATION * (0.62 / 2.16);
      const collect = FORGE_AUDIO_DURATION * (0.82 / 2.16);
      const flipAt = appear + hold;
      const collectAt = flipAt + flip;
      await playTimeline((timeline) => {
        timeline
          .to(layer, { opacity: 1, duration: 0.18, ease: 'power1.out' }, 0)
          .to(
            card,
            {
              y: centerY,
              rotation: 0,
              scale: 1,
              opacity: 1,
              duration: appear,
              ease: 'power2.out',
              onStart: () =>
                audio.play('forgeStart', {
                  positionX: window.innerWidth / 2,
                }),
            },
            0,
          )
          .to(
            card,
            { '--card-glow-strength': 1, duration: appear, ease: 'power2.out' },
            0,
          )
          .to(
            flipper,
            { rotationY: 90, duration: flip / 2, ease: 'power3.in' },
            flipAt,
          )
          .call(
            () => audio.play('cardFlip', { positionX: window.innerWidth / 2 }),
            undefined,
            flipAt + flip / 2,
          )
          .to(
            flipper,
            { rotationY: 0, duration: flip / 2, ease: 'power3.out' },
            flipAt + flip / 2,
          )
          .to(
            card,
            {
              x: arcX,
              y: arcY,
              rotation: target.x < window.innerWidth / 2 ? -8 : 8,
              scale: 0.9,
              duration: collect * 0.44,
              ease: 'power2.inOut',
            },
            collectAt,
          )
          .call(
            () => audio.play('cardCollect', { positionX: target.x }),
            undefined,
            collectAt + collect * 0.4,
          )
          .to(
            card,
            {
              x: targetX,
              y: targetY,
              rotation: 0,
              scale: cardScaleInsideCircle(
                CARD_WIDTH,
                CARD_HEIGHT,
                CARD_COLLECTION_CARD_DIAMETER,
              ),
              duration: collect * 0.56,
              ease: 'power3.in',
            },
            collectAt + collect * 0.44,
          )
          .to(
            flipper,
            { rotationY: 180, duration: collect * 0.44, ease: 'power3.inOut' },
            collectAt + collect * 0.48,
          )
          .to(
            card,
            {
              '--card-glow-strength': 0,
              duration: collect,
              ease: 'none',
            },
            collectAt,
          )
          .set([card, layer], { autoAlpha: 0 }, collectAt + collect)
          .call(
            () => audio.play('deckClose', { positionX: target.x }),
            undefined,
            collectAt + collect,
          );
      });
      if (!disposed) onComplete(requestId);
    })();

    return () => {
      disposed = true;
      activeTimeline?.kill();
      gsap.killTweensOf([
        layer,
        card,
        flipper,
        ...card.querySelectorAll<HTMLElement>(MANAGER_CARD_GLOW_LAYER_SELECTOR),
      ]);
    };
  }, [audio, deckTriggerElement, onComplete, requestId]);

  return (
    <div
      ref={layerRef}
      className="manager-card-creation-preview"
      aria-hidden="true"
    >
      <div
        ref={cardRef}
        className="manager-card-creation-preview__card"
        style={{ '--manager-accent': card.accent } as CSSProperties}
      >
        <div className="manager-card-creation-preview__tilt manager-card__tilt">
          <div
            ref={flipperRef}
            className="manager-card-creation-preview__flipper manager-card__flipper"
          >
            <div className="manager-card-creation-preview__back">
              <img src={CARD_BACK_URL} alt="" />
            </div>
            <ManagerCardFace
              active
              enabled
              playing
              preloadFrame
              forge
              showForgeMark={false}
              finish="framed"
              media={card.media}
              edgeUrl={CARD_EDGE_URL}
              stateLabel="新卡已激活"
              stateTone="active"
              title={card.title}
              description={card.description}
            />
            <ManagerCardGlowEffect />
          </div>
        </div>
      </div>
    </div>
  );
}
