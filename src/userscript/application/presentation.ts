import { cardMediaAccent } from '../../generated/card-media-accents.generated';
import {
  bundledCardMediaForVideo,
  USERSCRIPT_CARD_VARIANTS,
  userscriptCardMedia,
} from '../../lib/userscript-deck-media';
import type { UserscriptPresentation } from '../domain/types';

export const DEFAULT_USERSCRIPT_MEDIA = userscriptCardMedia('01');

export const DEFAULT_USERSCRIPT_PRESENTATION = {
  accent: DEFAULT_USERSCRIPT_MEDIA.accent,
  media: {
    kind: 'video',
    video: DEFAULT_USERSCRIPT_MEDIA.video,
  },
} as const satisfies UserscriptPresentation;

const USERSCRIPT_PRESENTATION_POOL = USERSCRIPT_CARD_VARIANTS.map(
  (variant): UserscriptPresentation => {
    const media = userscriptCardMedia(variant);
    return {
      accent: media.accent,
      media: {
        kind: 'video',
        video: media.video,
      },
    };
  },
);

function presentationVideo(presentation: UserscriptPresentation) {
  return presentation.media.kind === 'video'
    ? bundledCardMediaForVideo(presentation.media.video)?.video
    : null;
}

export function resolveUserscriptPresentation(
  presentation: UserscriptPresentation,
): UserscriptPresentation {
  const bundled =
    presentation.media.kind === 'video'
      ? bundledCardMediaForVideo(presentation.media.video)
      : null;
  const posterAccent =
    presentation.media.kind === 'image' &&
    presentation.media.image.startsWith('userscript-deck/card-art/')
      ? cardMediaAccent(presentation.media.image)
      : null;
  return {
    ...structuredClone(presentation),
    accent: bundled?.accent ?? posterAccent ?? presentation.accent,
  };
}

export function allocateUserscriptPresentation(
  current: readonly UserscriptPresentation[] = [],
  random: () => number = Math.random,
): UserscriptPresentation {
  const usage = new Map<string, number>(
    USERSCRIPT_CARD_VARIANTS.map(
      (variant) => [userscriptCardMedia(variant).video, 0] as const,
    ),
  );
  for (const presentation of current) {
    const video = presentationVideo(presentation);
    if (video && usage.has(video)) {
      usage.set(video, (usage.get(video) ?? 0) + 1);
    }
  }
  const minimum = Math.min(...usage.values());
  const candidates = USERSCRIPT_PRESENTATION_POOL.filter(
    (presentation) =>
      presentation.media.kind === 'video' &&
      usage.get(presentation.media.video) === minimum,
  );
  const index = Math.max(
    0,
    Math.min(candidates.length - 1, Math.floor(random() * candidates.length)),
  );
  return resolveUserscriptPresentation(candidates[index]);
}
