import { useEffect, useMemo, useState } from 'react';
import type { BilibiliCapabilitySnapshot } from '../../bilibili-capabilities/domain/types';
import type { ContentBlockingSnapshot } from '../../content-blocking/domain/types';
import {
  defaultGamepadBindings,
  type GamepadBindings,
  gamepadButtonLabel,
} from '../../gamepad-control/domain/bindings';
import type { GamepadControlCard } from '../../gamepad-control/domain/types';
import { extensionTarget } from '../../hosts/extension/platform';
import type { InputModality } from '../../input/intents';
import {
  isExtensionPageLifecycleInterrupted,
  isExtensionStorageSpaceFailure,
} from '../../lib/extension-errors';
import { t } from '../../localization/messages';
import { useLocale, useLocalizedMemo } from '../../localization/react';
import type { MediaResourcesSnapshot } from '../../media-resources/domain/types';
import type { MediaSpeedSnapshot } from '../../media-speed/domain/types';
import type { PageThemeSnapshot } from '../../page-theme/domain/types';
import {
  isSystemCardId,
  systemCardOfferedOnTarget,
} from '../../system-cards/domain/catalog';
import { systemCardVisible } from '../../system-cards/domain/state';
import {
  userscriptDisplayDescription,
  userscriptDisplayName,
} from '../../userscript/domain/metadata';
import type {
  InstalledUserscript,
  ScriptMatchContext,
} from '../../userscript/domain/types';
import { scriptVersion } from '../../userscript/domain/types';
import {
  type UserscriptExecutionCapability,
  userscriptExecutionAvailable,
} from '../../userscript/runtime/capabilities';
import type { ManagerMode } from '../manager-interaction/state';
import type { CardContextPromptContent } from './CardContextPrompt';
import {
  bilibiliIntegrationCardsForPage,
  cardDescription,
  cardStateKey,
  cardTitle,
  contentBlockingCard,
  DECK_STEWARD_CARD,
  type DeckCard,
  isBilibiliCapabilityCard,
  isContentBlockingCard,
  isGamepadControlCard,
  isInstalledUserscript,
  isMediaResourcesCard,
  isMediaSpeedCard,
  isNewTabCard,
  isPageThemeCard,
  mediaResourcesCard,
  mediaSpeedCard,
  NEW_TAB_CARD,
  pageThemeCard,
} from './cards';
import { userscriptsForPage } from './deck-card-activity';
import { userscriptStatePresentation } from './userscript-state-presentation';

type UserscriptDeckNoticeContext = {
  libraryError?: string | null;
  interactionError?: string | null;
  executionCapability?: UserscriptExecutionCapability | null;
};

export function userscriptDeckActionNotice(
  card: DeckCard,
  context: UserscriptDeckNoticeContext = {},
) {
  if (context.libraryError) {
    if (isExtensionPageLifecycleInterrupted(context.libraryError)) {
      return {
        title: t('cm_deck_view_title_1'),
        description: t('cm_deck_view_description_2'),
        tone: 'inactive' as const,
      };
    }
    return {
      title: t('cm_deck_view_title_3'),
      description: context.libraryError,
      tone: 'error' as const,
    };
  }
  if (context.interactionError) {
    return {
      title: t('cm_deck_view_title_4'),
      description: context.interactionError,
      tone: 'error' as const,
    };
  }
  if (isContentBlockingCard(card)) {
    if (!card.snapshot.rulesEnabled) {
      return {
        title: t('cm_deck_view_title_5'),
        description: t('cm_deck_view_description_6'),
        tone: 'inactive' as const,
      };
    }
    return null;
  }
  if (isGamepadControlCard(card)) return null;
  if (isPageThemeCard(card)) {
    if (card.snapshot.status === 'error') {
      return {
        title: t('cm_deck_view_title_7'),
        description: card.snapshot.error ?? t('cm_deck_view_text_8'),
        tone: 'error' as const,
      };
    }
    if (!card.snapshot.enabled) {
      return {
        title: t('cm_deck_view_title_9'),
        description: t('cm_deck_view_description_10'),
        tone: 'inactive' as const,
      };
    }
    if (card.snapshot.darkThemeDetected) {
      return {
        title: t('cm_deck_view_title_11'),
        description: t('cm_deck_view_description_12'),
        tone: 'neutral' as const,
      };
    }
    return null;
  }
  if (isMediaSpeedCard(card)) {
    if (card.snapshot.status === 'error') {
      return {
        title: t('cm_deck_view_title_13'),
        description: card.snapshot.error ?? t('cm_deck_view_text_14'),
        tone: 'error' as const,
      };
    }
    if (!card.snapshot.enabled) {
      return {
        title: t('cm_deck_view_title_15'),
        description: t('cm_deck_view_description_16'),
        tone: 'inactive' as const,
      };
    }
    if (card.snapshot.mediaCount === 0) {
      return {
        title: t('cm_deck_view_title_17'),
        description: t('cm_deck_view_description_18'),
        tone: 'neutral' as const,
      };
    }
    return null;
  }
  if (isMediaResourcesCard(card)) {
    if (card.snapshot.status === 'error') {
      return {
        title: t('cm_deck_view_title_19'),
        description:
          card.snapshot.error ??
          card.snapshot.unavailableReason ??
          t('cm_deck_view_text_20'),
        tone: 'error' as const,
      };
    }
    if (!card.snapshot.enabled) {
      return {
        title: t('cm_deck_view_title_21'),
        description: t('cm_deck_view_description_22'),
        tone: 'inactive' as const,
      };
    }
    if (card.snapshot.resources.length === 0 && !card.snapshot.captureEnabled) {
      return {
        title: t('cm_deck_view_title_23'),
        description: t('cm_deck_view_description_24'),
        tone: 'neutral' as const,
      };
    }
    return null;
  }
  if (isBilibiliCapabilityCard(card)) {
    if (!card.snapshot.enabled) {
      return {
        title: t('cm_deck_view_title_25', [String(cardTitle(card))]),
        description: t('cm_deck_view_description_26'),
        tone: 'inactive' as const,
      };
    }
    return null;
  }
  if (!isInstalledUserscript(card)) return null;
  if (
    context.executionCapability &&
    !userscriptExecutionAvailable(context.executionCapability)
  ) {
    return {
      title: t('cm_deck_view_title_27'),
      description: context.executionCapability.message,
      tone: 'error' as const,
    };
  }
  return userscriptStatePresentation(card).notice;
}

function cardVisibleInDeck(cardId: string, hiddenCardIds: ReadonlySet<string>) {
  return isSystemCardId(cardId)
    ? systemCardVisible(cardId, hiddenCardIds)
    : !hiddenCardIds.has(cardId);
}

export function useUserscriptDeckCards({
  items,
  contentBlockingSnapshot,
  pageThemeSnapshot,
  mediaSpeedSnapshot,
  mediaResourcesSnapshot,
  gamepadControl,
  bilibiliCapabilitySnapshots,
  hiddenCardIds,
  runtimeContext,
  mode,
}: {
  items: readonly InstalledUserscript[];
  contentBlockingSnapshot: ContentBlockingSnapshot | null;
  pageThemeSnapshot: PageThemeSnapshot | null;
  mediaSpeedSnapshot: MediaSpeedSnapshot | null;
  mediaResourcesSnapshot: MediaResourcesSnapshot | null;
  gamepadControl: GamepadControlCard;
  bilibiliCapabilitySnapshots: readonly BilibiliCapabilitySnapshot[];
  hiddenCardIds: readonly string[];
  runtimeContext: ScriptMatchContext;
  mode: ManagerMode;
}) {
  useLocale();

  const hiddenCardIdSet = useMemo(
    () => new Set(hiddenCardIds),
    [hiddenCardIds],
  );
  const platformCards = useLocalizedMemo(
    () =>
      bilibiliIntegrationCardsForPage(
        bilibiliCapabilitySnapshots,
        runtimeContext.url,
      ),
    [bilibiliCapabilitySnapshots, runtimeContext.url],
  );
  const [layerOrder, setLayerOrder] = useState<string[]>(() => [
    DECK_STEWARD_CARD.id,
    ...[NEW_TAB_CARD.id].filter(
      (cardId) =>
        systemCardOfferedOnTarget(cardId, extensionTarget()) &&
        cardVisibleInDeck(cardId, hiddenCardIdSet),
    ),
    ...[gamepadControl.id].filter((cardId) =>
      cardVisibleInDeck(cardId, hiddenCardIdSet),
    ),
    ...(contentBlockingSnapshot
      ? [
          contentBlockingCard(contentBlockingSnapshot, runtimeContext.url).id,
        ].filter((cardId) => cardVisibleInDeck(cardId, hiddenCardIdSet))
      : []),
    ...(pageThemeSnapshot
      ? [pageThemeCard(pageThemeSnapshot).id].filter((cardId) =>
          cardVisibleInDeck(cardId, hiddenCardIdSet),
        )
      : []),
    ...(mediaSpeedSnapshot
      ? [mediaSpeedCard(mediaSpeedSnapshot).id].filter((cardId) =>
          cardVisibleInDeck(cardId, hiddenCardIdSet),
        )
      : []),
    ...(mediaResourcesSnapshot?.available
      ? [mediaResourcesCard(mediaResourcesSnapshot).id].filter((cardId) =>
          cardVisibleInDeck(cardId, hiddenCardIdSet),
        )
      : []),
    ...platformCards
      .map((card) => card.id)
      .filter((cardId) => cardVisibleInDeck(cardId, hiddenCardIdSet)),
    ...items
      .map((item) => item.id)
      .filter((cardId) => cardVisibleInDeck(cardId, hiddenCardIdSet)),
  ]);
  const matchingItems = useMemo(
    () =>
      userscriptsForPage(items, runtimeContext).filter((script) =>
        cardVisibleInDeck(script.id, hiddenCardIdSet),
      ),
    [hiddenCardIdSet, items, runtimeContext],
  );
  const matchingItemIds = useMemo(
    () => matchingItems.map((item) => item.id),
    [matchingItems],
  );
  const systemCards = useMemo<DeckCard[]>(
    () =>
      [
        DECK_STEWARD_CARD,
        ...(systemCardOfferedOnTarget(NEW_TAB_CARD.id, extensionTarget())
          ? [NEW_TAB_CARD]
          : []),
        gamepadControl,
        ...(contentBlockingSnapshot
          ? [contentBlockingCard(contentBlockingSnapshot, runtimeContext.url)]
          : []),
        ...(pageThemeSnapshot ? [pageThemeCard(pageThemeSnapshot)] : []),
        ...(mediaSpeedSnapshot ? [mediaSpeedCard(mediaSpeedSnapshot)] : []),
        ...(mediaResourcesSnapshot?.available
          ? [mediaResourcesCard(mediaResourcesSnapshot)]
          : []),
        ...platformCards,
      ].filter((card) => cardVisibleInDeck(card.id, hiddenCardIdSet)),
    [
      contentBlockingSnapshot,
      gamepadControl,
      hiddenCardIdSet,
      mediaSpeedSnapshot,
      mediaResourcesSnapshot,
      pageThemeSnapshot,
      platformCards,
      runtimeContext.url,
    ],
  );
  const visibleItems = useMemo(
    () => [...systemCards, ...matchingItems],
    [matchingItems, systemCards],
  );
  const renderedItems = useMemo(() => {
    const byId = new Map(visibleItems.map((item) => [item.id, item]));
    const stableIds = [
      ...layerOrder,
      ...visibleItems.map((item) => item.id),
    ].filter((id, index, ids) => ids.indexOf(id) === index && byId.has(id));
    return stableIds.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
  }, [layerOrder, visibleItems]);

  useEffect(() => {
    const next = visibleItems.map((item) => item.id);
    setLayerOrder((current) => {
      if (mode === 'closed') {
        return current.length === next.length &&
          current.every((id, index) => id === next[index])
          ? current
          : next;
      }
      const retained = current.filter((id) => next.includes(id));
      const added = next.filter((id) => !retained.includes(id));
      const synced = [...retained, ...added];
      return current.length === synced.length &&
        current.every((id, index) => id === synced[index])
        ? current
        : synced;
    });
  }, [mode, visibleItems]);

  return {
    matchingItemIds,
    systemCards,
    visibleItems,
    renderedItems,
    scriptStartIndex: systemCards.length,
    setLayerOrder,
  };
}

export function userscriptDeckContextPrompt({
  libraryError,
  interactionError,
  mode,
  selected,
  focusedItem,
  executionCapability,
  inputModality,
  gamepadBindings = defaultGamepadBindings(),
  gamepadDeviceId = '',
}: {
  libraryError: string | null;
  interactionError: string | null;
  mode: ManagerMode;
  selected: DeckCard | null;
  focusedItem: DeckCard | null;
  executionCapability: UserscriptExecutionCapability | null;
  inputModality: InputModality;
  gamepadBindings?: GamepadBindings;
  gamepadDeviceId?: string;
}): CardContextPromptContent {
  const active = selected ?? focusedItem;
  const gamepadConfirm = gamepadButtonLabel(
    gamepadBindings.buttons.confirm,
    gamepadDeviceId,
  );
  const gamepadBack = gamepadButtonLabel(
    gamepadBindings.buttons.back,
    gamepadDeviceId,
  );
  const shortcuts =
    mode === 'returning'
      ? []
      : inputModality === 'gamepad'
        ? mode === 'targeting'
          ? [
              {
                key: t('cm_deck_view_key_1'),
                label: t('cm_deck_view_label_28'),
              },
              { key: gamepadConfirm, label: t('cm_deck_view_label_29') },
              { key: gamepadBack, label: t('cm_deck_view_label_30') },
            ]
          : [
              {
                key: t('cm_deck_view_key_2'),
                label: t('cm_deck_view_label_31'),
              },
              {
                key: t('cm_deck_view_key_3', [String(gamepadConfirm)]),
                label: t('cm_deck_view_label_32'),
              },
              { key: gamepadBack, label: t('cm_deck_view_label_33') },
            ]
        : inputModality === 'keyboard'
          ? mode === 'targeting'
            ? [
                {
                  key: t('cm_deck_view_key_4'),
                  label: t('cm_deck_view_label_34'),
                },
                {
                  key: t('cm_deck_view_key_5'),
                  label: t('cm_deck_view_label_35'),
                },
                { key: 'Esc', label: t('cm_deck_view_label_36') },
              ]
            : [
                { key: '← →', label: t('cm_deck_view_label_37') },
                {
                  key: t('cm_deck_view_key_6'),
                  label: t('cm_deck_view_label_38'),
                },
                { key: 'Esc', label: t('cm_deck_view_label_39') },
              ]
          : mode === 'targeting'
            ? [
                {
                  key: t('cm_deck_view_key_7'),
                  label: t('cm_deck_view_label_40'),
                },
                {
                  key: t('cm_deck_view_key_8'),
                  label: t('cm_deck_view_label_41'),
                },
                { key: 'Esc', label: t('cm_deck_view_label_42') },
              ]
            : [
                {
                  key: t('cm_deck_view_key_9'),
                  label: t('cm_deck_view_label_43'),
                },
                {
                  key: t('cm_deck_view_key_10'),
                  label: t('cm_deck_view_label_44'),
                },
                { key: 'Esc', label: t('cm_deck_view_label_45') },
              ];
  if (mode === 'forging' && selected && isInstalledUserscript(selected)) {
    return {
      key: `forging-${selected.id}`,
      title: userscriptDisplayName(selected.metadata),
      description:
        userscriptDisplayDescription(selected.metadata) ||
        t('cm_deck_view_text_46'),
      stats: [
        t('cm_deck_view_text_47'),
        `v${scriptVersion(selected)}`,
        selected.metadata.author || t('cm_deck_view_text_48'),
      ],
    };
  }
  if (active) {
    const installed = isInstalledUserscript(active);
    if (
      isContentBlockingCard(active) ||
      isGamepadControlCard(active) ||
      isPageThemeCard(active) ||
      isMediaSpeedCard(active) ||
      isMediaResourcesCard(active) ||
      isNewTabCard(active) ||
      isBilibiliCapabilityCard(active)
    ) {
      return {
        key: `${mode}-${active.id}-${cardStateKey(active)}`,
        title: cardTitle(active),
        description: cardDescription(active),
        stats: [],
        shortcuts,
      };
    }
    return {
      key: `${mode}-${active.id}-${installed ? active.manager.enabled : 'forge'}`,
      title: cardTitle(active),
      description: cardDescription(active) || t('cm_deck_view_text_49'),
      stats: installed
        ? [
            `v${scriptVersion(active)}`,
            active.metadata.author || t('cm_deck_view_text_50'),
          ]
        : [],
      shortcuts,
    };
  }
  if (libraryError) {
    if (isExtensionPageLifecycleInterrupted(libraryError)) {
      return {
        key: 'extension-page-lifecycle-interrupted',
        title: t('cm_deck_view_title_51'),
        description: t('cm_deck_view_description_52'),
        stats: [t('cm_deck_view_text_53')],
        tone: 'neutral',
      };
    }
    if (isExtensionStorageSpaceFailure(libraryError)) {
      return {
        key: 'extension-storage-space-error',
        title: t('cm_deck_view_title_54'),
        description: t('cm_deck_view_description_55'),
        stats: [t('cm_deck_view_text_56')],
        tone: 'error',
      };
    }
    return {
      key: 'library-error',
      title: t('cm_deck_view_title_57'),
      description: libraryError,
      stats: [t('cm_deck_view_text_58')],
      tone: 'error',
    };
  }
  if (interactionError) {
    return {
      key: 'interaction-error',
      title: t('cm_deck_view_title_59'),
      description: interactionError,
      stats: [t('cm_deck_view_text_60')],
      tone: 'error',
    };
  }
  if (
    executionCapability &&
    !userscriptExecutionAvailable(executionCapability)
  ) {
    return {
      key: 'userscript-capability-unavailable',
      title: t('cm_deck_view_title_61'),
      description: executionCapability.message,
      stats: [t('cm_deck_view_text_62'), t('cm_deck_view_text_63')],
      tone: 'error',
    };
  }
  return {
    key: 'spread-overview',
    title: t('cm_deck_view_title_64'),
    description: t('cm_deck_view_description_65'),
    stats: [],
    shortcuts,
  };
}
