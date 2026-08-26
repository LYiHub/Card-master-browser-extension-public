import { CARD_COLLECTION_LOGO_DIAMETER } from '../manager-interaction/layout';

const SPEED_OPTION_EMPHASIS_SCALE = 1.28;
const MEDIA_RESOURCES_SIZE = 42;
const MEDIA_RESOURCES_COMBINED_OFFSET = 126;
const CORE = {
  buttonWidth: 84,
  buttonHeight: 100,
  logoSize: CARD_COLLECTION_LOGO_DIAMETER,
} as const;
const SPEED = {
  radius: 68,
  crowdedRadius: 72,
  optionWidth: 47,
  optionHeight: 39,
  crowdedOptionWidth: 42,
  crowdedOptionHeight: 35,
  optionEmphasisScale: SPEED_OPTION_EMPHASIS_SCALE,
} as const;
const WHEEL_HALF_WIDTH = Math.ceil(
  Math.max(
    CORE.buttonWidth / 2,
    SPEED.radius + SPEED.optionWidth / 2,
    SPEED.crowdedRadius + SPEED.crowdedOptionWidth / 2,
  ),
);
const WHEEL_HALF_HEIGHT = Math.ceil(
  Math.max(
    CORE.buttonHeight / 2,
    SPEED.radius + SPEED.optionHeight / 2,
    SPEED.crowdedRadius + SPEED.crowdedOptionHeight / 2,
  ),
);
const MEDIA_RESOURCES_COMBINED_TOP_INSET =
  MEDIA_RESOURCES_COMBINED_OFFSET + MEDIA_RESOURCES_SIZE / 2;

export type DeckEntryInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const BASE_ENTRY_INSETS = {
  left: WHEEL_HALF_WIDTH,
  right: WHEEL_HALF_WIDTH,
  top: WHEEL_HALF_HEIGHT,
  bottom: WHEEL_HALF_HEIGHT,
} satisfies DeckEntryInsets;

export function resolveDeckEntryInsets(speedResourcesVisible: boolean) {
  return {
    ...BASE_ENTRY_INSETS,
    top: speedResourcesVisible
      ? MEDIA_RESOURCES_COMBINED_TOP_INSET
      : BASE_ENTRY_INSETS.top,
  };
}

export const DECK_ENTRY_LAYOUT = {
  dock: {
    width: WHEEL_HALF_WIDTH * 2,
    height: WHEEL_HALF_HEIGHT * 2,
    defaultCenterOffset: 124,
  },
  core: CORE,
  speed: SPEED,
  drag: {
    insets: BASE_ENTRY_INSETS,
  },
  resources: {
    size: MEDIA_RESOURCES_SIZE,
    standaloneOffset: 68,
    combinedOffset: MEDIA_RESOURCES_COMBINED_OFFSET,
    combinedTopInset: MEDIA_RESOURCES_COMBINED_TOP_INSET,
  },
} as const;
