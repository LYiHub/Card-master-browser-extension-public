import {
  BILIBILI_CAPABILITIES,
  bilibiliCapabilityCardId,
} from '../../bilibili-capabilities/registry';
import { CONTENT_BLOCKER_CARD_ID } from '../../content-blocking/domain/types';
import { GAMEPAD_CONTROL_CARD_ID } from '../../gamepad-control/domain/types';
import { cardMediaAccent } from '../../generated/card-media-accents.generated';
import { projectAssetUrl } from '../../lib/project-assets';
import {
  bundledCardMediaForVideo,
  type CardMedia,
  presetCardMedia,
} from '../../lib/userscript-deck-media';
import { MEDIA_RESOURCES_CARD_ID } from '../../media-resources/domain/types';
import { MEDIA_SPEED_CARD_ID } from '../../media-speed/domain/types';
import { PAGE_THEME_CARD_ID } from '../../page-theme/domain/types';
import {
  DECK_STEWARD_CARD_ID,
  NEW_TAB_CARD_ID,
} from '../../system-cards/domain/catalog';
import {
  DEFAULT_USERSCRIPT_MEDIA,
  DEFAULT_USERSCRIPT_PRESENTATION,
} from '../../userscript/application/presentation';
import {
  type InstalledUserscript,
  isUserscriptCoverVideoDataUrl,
  type UserscriptPresentationMedia,
} from '../../userscript/domain/types';
import type { DeckCard } from './cards';

type CardPresentation = {
  accent: string;
  media:
    | {
        kind: 'video';
        videoUrl: string;
        posterImageUrl?: string;
      }
    | {
        kind: 'image';
        imageUrl: string;
      };
};

function presentationMedia(media: CardMedia): CardPresentation {
  return {
    accent: media.accent,
    media: {
      kind: 'video',
      videoUrl: projectAssetUrl(media.video),
      posterImageUrl: projectAssetUrl(media.poster),
    },
  };
}

const DEFAULT_PRESENTATION = presentationMedia(DEFAULT_USERSCRIPT_MEDIA);
const GAMEPAD_CONTROL_CARD_ART =
  'userscript-deck/card-art/preset-cards/08-gamepad-control.webp';
const NEW_TAB_CARD_ART = 'userscript-deck/card-art/system-cards/new-tab.webp';

const PRESENTATIONS: Readonly<Record<string, CardPresentation>> = {
  [DECK_STEWARD_CARD_ID]: presentationMedia(presetCardMedia('04-deck-steward')),
  [GAMEPAD_CONTROL_CARD_ID]: {
    accent: cardMediaAccent(GAMEPAD_CONTROL_CARD_ART),
    media: {
      kind: 'image',
      imageUrl: projectAssetUrl(GAMEPAD_CONTROL_CARD_ART),
    },
  },
  [CONTENT_BLOCKER_CARD_ID]: presentationMedia(
    presetCardMedia('01-content-blocking'),
  ),
  [PAGE_THEME_CARD_ID]: presentationMedia(presetCardMedia('02-page-theme')),
  [MEDIA_SPEED_CARD_ID]: presentationMedia(presetCardMedia('03-media-speed')),
  [MEDIA_RESOURCES_CARD_ID]: presentationMedia(
    presetCardMedia('09-media-resources'),
  ),
  [NEW_TAB_CARD_ID]: {
    accent: cardMediaAccent(NEW_TAB_CARD_ART),
    media: {
      kind: 'image',
      imageUrl: projectAssetUrl(NEW_TAB_CARD_ART),
    },
  },
  ...Object.fromEntries(
    BILIBILI_CAPABILITIES.map((definition) => [
      bilibiliCapabilityCardId(definition.id),
      presentationMedia(presetCardMedia(definition.mediaId)),
    ]),
  ),
};

function userscriptPresentationMedia(
  media: UserscriptPresentationMedia | undefined,
) {
  if (media?.kind === 'image') {
    return {
      kind: 'image',
      imageUrl: media.image.startsWith('userscript-deck/')
        ? projectAssetUrl(media.image)
        : media.image,
    } as const;
  }
  if (media?.kind === 'video' && isUserscriptCoverVideoDataUrl(media.video)) {
    return {
      kind: 'video',
      videoUrl: media.video,
      posterImageUrl: media.poster,
    } as const;
  }
  return presentationMedia(
    bundledCardMediaForVideo(
      media?.kind === 'video' ? media.video : undefined,
    ) ?? DEFAULT_USERSCRIPT_MEDIA,
  ).media;
}

function cardPresentation(card: DeckCard) {
  if (card.kind === 'userscript') {
    const bundled =
      card.presentation?.media.kind === 'video'
        ? bundledCardMediaForVideo(card.presentation.media.video)
        : null;
    return {
      accent:
        bundled?.accent ??
        card.presentation?.accent ??
        DEFAULT_USERSCRIPT_PRESENTATION.accent,
      media: userscriptPresentationMedia(card.presentation?.media),
    };
  }
  return PRESENTATIONS[card.id] ?? DEFAULT_PRESENTATION;
}

export function cardAccent(card: DeckCard) {
  return cardPresentation(card).accent;
}

export function cardMedia(card: DeckCard) {
  return cardPresentation(card).media;
}

export function scriptPrimaryScope(card: InstalledUserscript) {
  return (
    card.manager.userMatches[0] ??
    card.manager.userIncludes[0] ??
    card.metadata.matches[0] ??
    card.metadata.includes[0] ??
    '未声明匹配范围'
  );
}
