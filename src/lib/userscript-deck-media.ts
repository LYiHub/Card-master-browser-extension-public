import { cardMediaAccent } from '../generated/card-media-accents.generated';

const USERSCRIPT_CARD_COLLECTION = 'userscript-cards';
const PRESET_CARD_COLLECTION = 'preset-cards';
const PREINSTALLED_CARD_COLLECTION = 'preinstalled-cards';

export const PRESET_CARD_VARIANTS = [
  '01-content-blocking',
  '02-page-theme',
  '03-media-speed',
  '04-deck-steward',
  '05-bilibili-recommendation',
  '06-bilibili-danmaku',
  '07-bilibili-segments',
  '08-gamepad-control',
  '09-media-resources',
] as const;

export type PresetCardVariant = (typeof PRESET_CARD_VARIANTS)[number];

export const PREINSTALLED_CARD_VARIANTS = [
  '01-bilikit-core',
  '02-bilikit-feed',
  '03-bilibili-favorites-fix',
  '04-copying-lifted',
] as const;

export type PreinstalledCardVariant =
  (typeof PREINSTALLED_CARD_VARIANTS)[number];

export const USERSCRIPT_CARD_VARIANTS = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
] as const;

export type UserscriptCardVariant = (typeof USERSCRIPT_CARD_VARIANTS)[number];

export type CardMedia = Readonly<{
  video: string;
  poster: string;
  accent: string;
}>;

function cardMedia(collection: string, variant: string): CardMedia {
  const poster = `userscript-deck/card-art/${collection}/${variant}.webp`;
  return {
    video: `userscript-deck/video/${collection}/${variant}.mp4`,
    poster,
    accent: cardMediaAccent(poster),
  };
}

export function userscriptCardMedia(variant: UserscriptCardVariant): CardMedia {
  return cardMedia(USERSCRIPT_CARD_COLLECTION, variant);
}

export function presetCardMedia(variant: PresetCardVariant): CardMedia {
  return cardMedia(PRESET_CARD_COLLECTION, variant);
}

export function preinstalledCardMedia(
  variant: PreinstalledCardVariant,
): CardMedia {
  return cardMedia(PREINSTALLED_CARD_COLLECTION, variant);
}

const BUNDLED_CARD_MEDIA_BY_VIDEO = new Map(
  [
    ...USERSCRIPT_CARD_VARIANTS.map(userscriptCardMedia),
    ...PRESET_CARD_VARIANTS.map(presetCardMedia),
    ...PREINSTALLED_CARD_VARIANTS.map(preinstalledCardMedia),
  ].map((media) => [media.video, media] as const),
);

export function bundledCardMediaForVideo(
  video: string | null | undefined,
): CardMedia | null {
  if (!video) return null;
  return BUNDLED_CARD_MEDIA_BY_VIDEO.get(video) ?? null;
}
