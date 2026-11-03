import {
  BILIBILI_CAPABILITIES,
  bilibiliCapabilityCardId,
} from '../../bilibili-capabilities/registry';
import { CONTENT_BLOCKER_CARD_ID } from '../../content-blocking/domain/types';
import { GAMEPAD_CONTROL_CARD_ID } from '../../gamepad-control/domain/types';
import { t } from '../../localization/messages';
import { MEDIA_RESOURCES_CARD_ID } from '../../media-resources/domain/types';
import { MEDIA_SPEED_CARD_ID } from '../../media-speed/domain/types';
import { PAGE_THEME_CARD_ID } from '../../page-theme/domain/types';

export const DECK_STEWARD_CARD_ID = 'system-deck-steward' as const;
export const NEW_TAB_CARD_ID = 'system-new-tab' as const;

export type SystemCardKind =
  | 'steward'
  | 'new-tab'
  | 'gamepad-control'
  | 'content-blocker'
  | 'page-theme'
  | 'media-speed'
  | 'media-resources'
  | 'bilibili-capability';

export type SystemCardDefinition = Readonly<{
  id: string;
  kind: SystemCardKind;
  title: string;
  description: string;
  hideable: boolean;
  order: number;
}>;

const CORE_SYSTEM_CARDS: readonly SystemCardDefinition[] = [
  {
    id: DECK_STEWARD_CARD_ID,
    kind: 'steward',
    get title() {
      return t('cm_catalog_title_1');
    },
    get description() {
      return t('cm_catalog_description_2');
    },
    hideable: true,
    order: 0,
  },
  {
    id: NEW_TAB_CARD_ID,
    kind: 'new-tab',
    get title() {
      return t('cm_catalog_title_3');
    },
    get description() {
      return t('cm_catalog_description_4');
    },
    hideable: true,
    order: 10,
  },
  {
    id: GAMEPAD_CONTROL_CARD_ID,
    kind: 'gamepad-control',
    get title() {
      return t('cm_catalog_title_5');
    },
    get description() {
      return t('cm_catalog_description_6');
    },
    hideable: true,
    order: 20,
  },
  {
    id: CONTENT_BLOCKER_CARD_ID,
    kind: 'content-blocker',
    get title() {
      return t('cm_catalog_title_7');
    },
    get description() {
      return t('cm_catalog_description_8');
    },
    hideable: true,
    order: 30,
  },
  {
    id: PAGE_THEME_CARD_ID,
    kind: 'page-theme',
    get title() {
      return t('cm_catalog_title_9');
    },
    get description() {
      return t('cm_catalog_description_10');
    },
    hideable: true,
    order: 40,
  },
  {
    id: MEDIA_SPEED_CARD_ID,
    kind: 'media-speed',
    get title() {
      return t('cm_catalog_title_11');
    },
    get description() {
      return t('cm_catalog_description_12');
    },
    hideable: true,
    order: 50,
  },
  {
    id: MEDIA_RESOURCES_CARD_ID,
    kind: 'media-resources',
    get title() {
      return t('cm_catalog_title_13');
    },
    get description() {
      return t('cm_catalog_description_14');
    },
    hideable: true,
    order: 60,
  },
];

const PLATFORM_SYSTEM_CARDS: readonly SystemCardDefinition[] =
  BILIBILI_CAPABILITIES.map((capability, index) => ({
    id: bilibiliCapabilityCardId(capability.id),
    kind: 'bilibili-capability',
    get title() {
      return capability.title;
    },
    get description() {
      return capability.description;
    },
    hideable: true,
    order: 100 + index,
  }));

export const SYSTEM_CARD_CATALOG: readonly SystemCardDefinition[] = [
  ...CORE_SYSTEM_CARDS,
  ...PLATFORM_SYSTEM_CARDS,
];

const SYSTEM_CARD_BY_ID = new Map(
  SYSTEM_CARD_CATALOG.map((definition) => [definition.id, definition]),
);

export function systemCardDefinition(cardId: string) {
  const definition = SYSTEM_CARD_BY_ID.get(cardId);
  if (!definition) throw new Error(`Unknown system card: ${cardId}`);
  return definition;
}

export function systemCardCopy(cardId: string) {
  const { title, description } = systemCardDefinition(cardId);
  return { title, description };
}

export function isSystemCardId(cardId: string) {
  return SYSTEM_CARD_BY_ID.has(cardId);
}

const SAFARI_EXCLUDED_SYSTEM_CARD_IDS = new Set<string>([
  MEDIA_RESOURCES_CARD_ID,
  NEW_TAB_CARD_ID,
]);

export function systemCardOfferedOnTarget(
  cardId: string,
  target: 'chromium' | 'firefox' | 'safari',
) {
  return target !== 'safari' || !SAFARI_EXCLUDED_SYSTEM_CARD_IDS.has(cardId);
}
