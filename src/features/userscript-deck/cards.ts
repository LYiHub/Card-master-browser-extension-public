import type {
  BilibiliCapabilityCard,
  BilibiliCapabilitySnapshot,
} from '../../bilibili-capabilities/domain/types';
import {
  bilibiliCapabilityCards,
  bilibiliCapabilityCardsForPage,
} from '../../bilibili-capabilities/registry';
import {
  CONTENT_BLOCKER_CARD_ID,
  type ContentBlockingCard,
  type ContentBlockingSnapshot,
  contentBlockingSiteState,
} from '../../content-blocking/domain/types';
import {
  GAMEPAD_CONTROL_CARD_ID,
  type GamepadControlCard,
} from '../../gamepad-control/domain/types';
import { t } from '../../localization/messages';
import {
  MEDIA_RESOURCES_CARD_ID,
  type MediaResourcesCard,
  type MediaResourcesSnapshot,
} from '../../media-resources/domain/types';
import {
  MEDIA_SPEED_CARD_ID,
  type MediaSpeedCard,
  type MediaSpeedSnapshot,
} from '../../media-speed/domain/types';
import {
  PAGE_THEME_CARD_ID,
  type PageThemeCard,
  type PageThemeSnapshot,
} from '../../page-theme/domain/types';
import {
  DECK_STEWARD_CARD_ID,
  NEW_TAB_CARD_ID,
  systemCardCopy,
} from '../../system-cards/domain/catalog';
import {
  userscriptDisplayDescription,
  userscriptDisplayName,
} from '../../userscript/domain/metadata';
import type { InstalledUserscript } from '../../userscript/domain/types';

export type DeckStewardCard = {
  kind: 'steward';
  id: typeof DECK_STEWARD_CARD_ID;
  title: string;
  description: string;
};

export type NewTabCard = {
  kind: 'new-tab';
  id: typeof NEW_TAB_CARD_ID;
  title: string;
  description: string;
};

export type DeckCard =
  | InstalledUserscript
  | DeckStewardCard
  | NewTabCard
  | GamepadControlCard
  | ContentBlockingCard
  | PageThemeCard
  | MediaSpeedCard
  | MediaResourcesCard
  | BilibiliCapabilityCard;

export const DECK_STEWARD_CARD: DeckStewardCard = {
  get title() {
    return systemCardCopy(DECK_STEWARD_CARD_ID).title;
  },
  get description() {
    return systemCardCopy(DECK_STEWARD_CARD_ID).description;
  },
  id: DECK_STEWARD_CARD_ID,
  kind: 'steward',
};

export const NEW_TAB_CARD: NewTabCard = {
  get title() {
    return systemCardCopy(NEW_TAB_CARD_ID).title;
  },
  get description() {
    return systemCardCopy(NEW_TAB_CARD_ID).description;
  },
  kind: 'new-tab',
  id: NEW_TAB_CARD_ID,
};

export function gamepadControlCard({
  connected = false,
  deviceName = '',
  enabled = true,
}: Partial<
  Pick<GamepadControlCard, 'connected' | 'deviceName' | 'enabled'>
> = {}): GamepadControlCard {
  const definition = systemCardCopy(GAMEPAD_CONTROL_CARD_ID);
  return {
    kind: 'gamepad-control',
    id: GAMEPAD_CONTROL_CARD_ID,
    title: definition.title,
    description: !enabled
      ? t('cm_cards_text_1')
      : connected
        ? t('cm_cards_text_2')
        : t('cm_cards_text_3'),
    enabled,
    connected,
    deviceName,
  };
}

export function contentBlockingCard(
  snapshot: ContentBlockingSnapshot,
  pageUrl: string | null,
): ContentBlockingCard {
  const definition = systemCardCopy(CONTENT_BLOCKER_CARD_ID);
  return {
    kind: 'content-blocker',
    id: CONTENT_BLOCKER_CARD_ID,
    title: definition.title,
    description: definition.description,
    snapshot,
    site: contentBlockingSiteState(snapshot.allowlist, pageUrl),
  };
}

export function pageThemeCard(snapshot: PageThemeSnapshot): PageThemeCard {
  const definition = systemCardCopy(PAGE_THEME_CARD_ID);
  return {
    kind: 'page-theme',
    id: PAGE_THEME_CARD_ID,
    title: definition.title,
    description: definition.description,
    snapshot,
  };
}

export function mediaSpeedCard(snapshot: MediaSpeedSnapshot): MediaSpeedCard {
  const definition = systemCardCopy(MEDIA_SPEED_CARD_ID);
  return {
    kind: 'media-speed',
    id: MEDIA_SPEED_CARD_ID,
    title: definition.title,
    description: definition.description,
    snapshot,
  };
}

export function mediaResourcesCard(
  snapshot: MediaResourcesSnapshot,
): MediaResourcesCard {
  const definition = systemCardCopy(MEDIA_RESOURCES_CARD_ID);
  return {
    kind: 'media-resources',
    id: MEDIA_RESOURCES_CARD_ID,
    title: definition.title,
    description: definition.description,
    snapshot,
  };
}

export function bilibiliIntegrationCards(
  snapshots: readonly BilibiliCapabilitySnapshot[],
) {
  return bilibiliCapabilityCards(snapshots);
}

export function bilibiliIntegrationCardsForPage(
  snapshots: readonly BilibiliCapabilitySnapshot[],
  url: string,
) {
  return bilibiliCapabilityCardsForPage(snapshots, url);
}

export function isInstalledUserscript(
  card: DeckCard,
): card is InstalledUserscript {
  return card.kind === 'userscript';
}

export function isNewTabCard(card: DeckCard): card is NewTabCard {
  return card.kind === 'new-tab';
}

export function isContentBlockingCard(
  card: DeckCard,
): card is ContentBlockingCard {
  return card.kind === 'content-blocker';
}

export function isGamepadControlCard(
  card: DeckCard,
): card is GamepadControlCard {
  return card.kind === 'gamepad-control';
}

export function isPageThemeCard(card: DeckCard): card is PageThemeCard {
  return card.kind === 'page-theme';
}

export function isMediaSpeedCard(card: DeckCard): card is MediaSpeedCard {
  return card.kind === 'media-speed';
}

export function isMediaResourcesCard(
  card: DeckCard,
): card is MediaResourcesCard {
  return card.kind === 'media-resources';
}

export function isBilibiliCapabilityCard(
  card: DeckCard,
): card is BilibiliCapabilityCard {
  return card.kind === 'bilibili-capability';
}

export function cardTitle(card: DeckCard) {
  return isInstalledUserscript(card)
    ? userscriptDisplayName(card.metadata)
    : card.title;
}

export function cardDescription(card: DeckCard) {
  return isInstalledUserscript(card)
    ? userscriptDisplayDescription(card.metadata)
    : card.description;
}

export function cardEnabled(card: DeckCard) {
  if (isInstalledUserscript(card)) return card.manager.enabled;
  if (isGamepadControlCard(card)) return card.enabled;
  if (isContentBlockingCard(card)) return card.snapshot.rulesEnabled;
  if (isPageThemeCard(card)) return card.snapshot.enabled;
  if (isMediaSpeedCard(card)) return card.snapshot.enabled;
  if (isMediaResourcesCard(card)) return card.snapshot.enabled;
  if (isBilibiliCapabilityCard(card)) return card.snapshot.enabled;
  return true;
}

export function cardStateKey(card: DeckCard) {
  if (isInstalledUserscript(card)) {
    return `${card.manager.enabled}:${card.runtime.status}:${card.runtime.commands.length}`;
  }
  if (isGamepadControlCard(card)) {
    return `${card.enabled}:${card.connected}:${card.deviceName}`;
  }
  if (isContentBlockingCard(card)) {
    const batch = card.snapshot.lastElementBlockingBatch;
    return `${card.snapshot.rulesEnabled}:${card.site.filteringEnabled}:${card.snapshot.status}:${card.snapshot.configurationPending}:${card.snapshot.revision}:${batch?.sessionId ?? ''}:${batch?.hostname ?? ''}:${batch?.rules.length ?? 0}`;
  }
  if (isPageThemeCard(card)) {
    return `${card.snapshot.enabled}:${card.snapshot.activeOnPage}:${card.snapshot.status}:${card.snapshot.revision}`;
  }
  if (isMediaSpeedCard(card)) {
    const selection =
      card.snapshot.selection.mode === 'hell'
        ? 'hell'
        : card.snapshot.selection.speed;
    return `${card.snapshot.enabled}:${card.snapshot.activeOnPage}:${card.snapshot.lockSpeed}:${card.snapshot.status}:${card.snapshot.revision}:${card.snapshot.videoCount}:${card.snapshot.audioCount}:${selection}`;
  }
  if (isMediaResourcesCard(card)) {
    return `${card.snapshot.revision}:${card.snapshot.enabled}:${card.snapshot.available}:${card.snapshot.downloadAvailable}:${card.snapshot.captureEnabled}:${card.snapshot.resources.length}:${card.snapshot.pages.length}:${card.snapshot.status}`;
  }
  if (isBilibiliCapabilityCard(card)) {
    return `${card.snapshot.enabled}:${card.snapshot.activeOnPage}:${card.snapshot.status}:${card.snapshot.revision}:${card.snapshot.stateLabel}`;
  }
  return card.kind;
}
