import type { PresetCardVariant } from '../lib/userscript-deck-media';
import { t } from '../localization/messages';
import type {
  BilibiliCapabilityCard,
  BilibiliCapabilityCommand,
  BilibiliCapabilityId,
  BilibiliCapabilitySnapshot,
  SponsorPlatform,
} from './domain/types';
import { capabilityPlatformForPage } from './domain/types';

export type BilibiliCapabilityDefinition = {
  id: BilibiliCapabilityId;
  title: string;
  description: string;
  mediaId: PresetCardVariant;
  platforms: readonly SponsorPlatform[];
  inactiveLabel: string;
  commands: readonly {
    id: BilibiliCapabilityCommand;
    label: string;
    description: string;
  }[];
};

export const BILIBILI_CAPABILITIES: readonly BilibiliCapabilityDefinition[] = [
  {
    id: 'recommendation-control',
    get title() {
      return t('cm_registry_title_1');
    },
    get description() {
      return t('cm_registry_description_2');
    },
    mediaId: '05-bilibili-recommendation',
    platforms: ['bilibili'],
    get inactiveLabel() {
      return t('cm_registry_inactive_label_3');
    },
    commands: [
      {
        id: 'mode:pure',
        get label() {
          return t('cm_registry_label_4');
        },
        get description() {
          return t('cm_registry_description_5');
        },
      },
      {
        id: 'mode:explore',
        get label() {
          return t('cm_registry_label_6');
        },
        get description() {
          return t('cm_registry_description_7');
        },
      },
      {
        id: 'mode:mixed',
        get label() {
          return t('cm_registry_label_8');
        },
        get description() {
          return t('cm_registry_description_9');
        },
      },
      {
        id: 'mode:native',
        get label() {
          return t('cm_registry_label_10');
        },
        get description() {
          return t('cm_registry_description_11');
        },
      },
    ],
  },
  {
    id: 'danmaku-compression',
    get title() {
      return t('cm_registry_title_12');
    },
    get description() {
      return t('cm_registry_description_13');
    },
    mediaId: '06-bilibili-danmaku',
    platforms: ['bilibili'],
    get inactiveLabel() {
      return t('cm_registry_inactive_label_14');
    },
    commands: [
      {
        id: 'reload',
        get label() {
          return t('cm_registry_label_15');
        },
        get description() {
          return t('cm_registry_description_16');
        },
      },
      {
        id: 'restore',
        get label() {
          return t('cm_registry_label_17');
        },
        get description() {
          return t('cm_registry_description_18');
        },
      },
    ],
  },
  {
    id: 'segment-skipping',
    get title() {
      return t('cm_registry_title_19');
    },
    get description() {
      return t('cm_registry_description_20');
    },
    mediaId: '07-bilibili-segments',
    platforms: ['bilibili', 'youtube'],
    get inactiveLabel() {
      return t('cm_registry_inactive_label_21');
    },
    commands: [
      {
        id: 'toggle-capture',
        get label() {
          return t('cm_registry_label_22');
        },
        get description() {
          return t('cm_registry_description_23');
        },
      },
      {
        id: 'refresh-segments',
        get label() {
          return t('cm_registry_label_24');
        },
        get description() {
          return t('cm_registry_description_25');
        },
      },
    ],
  },
] as const;

export function bilibiliCapabilityDefinition(id: BilibiliCapabilityId) {
  const definition = BILIBILI_CAPABILITIES.find(
    (candidate) => candidate.id === id,
  );
  if (!definition) throw new Error(`Unknown Bilibili capability: ${id}`);
  return definition;
}

export function bilibiliCapabilityCardId(
  id: BilibiliCapabilityId,
): BilibiliCapabilityCard['id'] {
  return `system-bilibili-${id}`;
}

export function bilibiliCapabilityCards(
  snapshots: readonly BilibiliCapabilitySnapshot[],
): BilibiliCapabilityCard[] {
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  return BILIBILI_CAPABILITIES.flatMap((definition) => {
    const snapshot = byId.get(definition.id);
    return snapshot
      ? [
          {
            kind: 'bilibili-capability' as const,
            id: bilibiliCapabilityCardId(definition.id),
            capabilityId: definition.id,
            title: definition.title,
            description: definition.description,
            snapshot,
          },
        ]
      : [];
  });
}

export function bilibiliCapabilityCardsForPage(
  snapshots: readonly BilibiliCapabilitySnapshot[],
  url: string,
) {
  const platform = capabilityPlatformForPage(url);
  if (!platform) return [];
  return bilibiliCapabilityCards(snapshots).filter(
    (card) =>
      card.snapshot.available &&
      bilibiliCapabilityDefinition(card.capabilityId).platforms.includes(
        platform,
      ),
  );
}
