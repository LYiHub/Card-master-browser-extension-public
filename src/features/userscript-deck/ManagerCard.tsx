import { bilibiliCapabilityDefinition } from '../../bilibili-capabilities/registry';
import { CardBottomFrame } from '../../components/CardBottomFrame';
import { projectAssetUrl } from '../../lib/project-assets';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import { isCardAccent } from '../../userscript/application/card-accent';
import { managerActionRoot } from '../manager-interaction/action-hit-testing';
import type { CardStateTone } from '../manager-interaction/CardStateBadge';
import { createManagerCardSnapshot } from '../manager-interaction/card-snapshot';
import { ManagerCardFace } from '../manager-interaction/ManagerCardFace';
import {
  type ManagerCardBehaviorProps,
  ManagerCardInteraction,
} from '../manager-interaction/ManagerCardInteraction';
import type { ManagerActionKind } from './actions';
import {
  cardDescription,
  cardEnabled,
  cardTitle,
  type DeckCard,
  isBilibiliCapabilityCard,
  isContentBlockingCard,
  isGamepadControlCard,
  isInstalledUserscript,
  isMediaResourcesCard,
  isMediaSpeedCard,
  isPageThemeCard,
} from './cards';
import { cardAccent, cardMedia } from './presentation';
import { useCardAccent } from './useCardAccent';
import { userscriptStatePresentation } from './userscript-state-presentation';

const CARD_BACK_URL = projectAssetUrl(
  'userscript-deck/visual/cards/card-master-back.webp',
);
const CARD_BOTTOM_FRAME_URL = projectAssetUrl(
  'userscript-deck/visual/cards/bottom-frame.webp',
);
const CARD_EDGE_URL = projectAssetUrl('userscript-deck/visual/cards/edge.webp');
export function cardStatePresentation(
  item: DeckCard,
  executionUnavailable = false,
): { label: string | null; tone: CardStateTone } {
  const installed = isInstalledUserscript(item);
  const contentBlocking = isContentBlockingCard(item);
  const pageTheme = isPageThemeCard(item);
  const mediaSpeed = isMediaSpeedCard(item);
  const mediaResources = isMediaResourcesCard(item);
  const bilibiliCapability = isBilibiliCapabilityCard(item);
  const gamepadControl = isGamepadControlCard(item);

  if (installed) {
    return userscriptStatePresentation(item, executionUnavailable).badge;
  }

  if (contentBlocking) {
    if (
      item.snapshot.status === 'starting' ||
      item.snapshot.configurationPending
    ) {
      return { label: t('cm_manager_card_label_1'), tone: 'pending' };
    }
    if (item.snapshot.status === 'error') {
      return { label: t('cm_manager_card_label_2'), tone: 'error' };
    }
    return item.snapshot.rulesEnabled
      ? { label: t('cm_manager_card_label_3'), tone: 'active' }
      : { label: t('cm_manager_card_label_4'), tone: 'inactive' };
  }

  if (pageTheme) {
    if (!item.snapshot.enabled) {
      return { label: t('cm_manager_card_label_5'), tone: 'inactive' };
    }
    if (item.snapshot.status === 'starting') {
      return { label: t('cm_manager_card_label_6'), tone: 'pending' };
    }
    if (item.snapshot.status === 'error') {
      return { label: t('cm_manager_card_label_7'), tone: 'error' };
    }
    if (item.snapshot.darkThemeDetected) {
      return { label: t('cm_manager_card_label_8'), tone: 'inactive' };
    }
    if (item.snapshot.activeOnPage) {
      return { label: t('cm_manager_card_label_9'), tone: 'active' };
    }
    if (item.snapshot.inactiveReason === 'site-disabled') {
      return { label: t('cm_manager_card_label_10'), tone: 'inactive' };
    }
    if (item.snapshot.inactiveReason === 'automation') {
      return { label: t('cm_manager_card_label_11'), tone: 'inactive' };
    }
    return { label: t('cm_manager_card_label_12'), tone: 'inactive' };
  }

  if (mediaSpeed) {
    if (item.snapshot.status === 'starting') {
      return { label: t('cm_manager_card_label_13'), tone: 'pending' };
    }
    if (item.snapshot.status === 'error') {
      return { label: t('cm_manager_card_label_14'), tone: 'error' };
    }
    if (!item.snapshot.enabled) {
      return { label: t('cm_manager_card_label_15'), tone: 'inactive' };
    }
    if (!item.snapshot.activeOnPage) {
      return { label: t('cm_manager_card_label_16'), tone: 'inactive' };
    }
    if (item.snapshot.mediaCount === 0) {
      return { label: t('cm_manager_card_label_17'), tone: 'inactive' };
    }
    return {
      label:
        item.snapshot.selection.mode === 'hell'
          ? t('cm_manager_card_text_18')
          : `${item.snapshot.selection.speed}×`,
      tone: 'active',
    };
  }

  if (mediaResources) {
    if (!item.snapshot.available || item.snapshot.status === 'error') {
      return { label: t('cm_manager_card_label_19'), tone: 'error' };
    }
    if (!item.snapshot.enabled) {
      return { label: t('cm_manager_card_label_20'), tone: 'inactive' };
    }
    if (item.snapshot.captureEnabled) {
      return { label: t('cm_manager_card_label_21'), tone: 'active' };
    }
    return item.snapshot.resources.length > 0
      ? {
          label: t('cm_manager_card_label_22', [
            String(item.snapshot.resources.length),
          ]),
          tone: 'active',
        }
      : { label: t('cm_manager_card_label_23'), tone: 'pending' };
  }

  if (bilibiliCapability) {
    if (item.snapshot.status === 'starting') {
      return { label: t('cm_manager_card_label_24'), tone: 'pending' };
    }
    if (item.snapshot.status === 'error') {
      return { label: t('cm_manager_card_label_25'), tone: 'error' };
    }
    if (!item.snapshot.enabled) {
      return { label: t('cm_manager_card_label_26'), tone: 'inactive' };
    }
    if (!item.snapshot.activeOnPage) {
      return {
        label: bilibiliCapabilityDefinition(item.capabilityId).inactiveLabel,
        tone: 'inactive',
      };
    }
    return { label: item.snapshot.stateLabel, tone: 'active' };
  }

  if (gamepadControl) {
    if (!item.enabled) {
      return { label: t('cm_manager_card_label_27'), tone: 'inactive' };
    }
    return item.connected
      ? { label: t('cm_manager_card_label_28'), tone: 'active' }
      : { label: t('cm_manager_card_label_29'), tone: 'pending' };
  }

  return { label: null, tone: 'active' };
}

export function cardSnapshot(element: HTMLElement, item: DeckCard) {
  const installed = isInstalledUserscript(item);
  const contentBlocking = isContentBlockingCard(item);
  const pageTheme = isPageThemeCard(item);
  const mediaSpeed = isMediaSpeedCard(item);
  const mediaResources = isMediaResourcesCard(item);
  const gamepadControl = isGamepadControlCard(item);
  const bilibiliCapability = isBilibiliCapabilityCard(item);
  const enabled = cardEnabled(item);
  const renderedAccent = getComputedStyle(element)
    .getPropertyValue('--manager-accent')
    .trim();

  return createManagerCardSnapshot(element, {
    title: cardTitle(item),
    accent: isCardAccent(renderedAccent) ? renderedAccent : cardAccent(item),
    state:
      installed ||
      contentBlocking ||
      pageTheme ||
      mediaSpeed ||
      mediaResources ||
      gamepadControl ||
      bilibiliCapability
        ? {
            enabled,
            enabledLabel: contentBlocking
              ? t('cm_manager_card_text_30')
              : pageTheme
                ? t('cm_manager_card_text_31')
                : mediaSpeed
                  ? t('cm_manager_card_text_32')
                  : mediaResources
                    ? t('cm_manager_card_text_33')
                    : bilibiliCapability
                      ? t('cm_manager_card_text_34')
                      : gamepadControl
                        ? t('cm_manager_card_text_35')
                        : t('cm_manager_card_text_36'),
            disabledLabel: contentBlocking
              ? t('cm_manager_card_text_37')
              : pageTheme
                ? t('cm_manager_card_text_38')
                : mediaSpeed
                  ? t('cm_manager_card_text_39')
                  : mediaResources
                    ? t('cm_manager_card_text_40')
                    : bilibiliCapability
                      ? t('cm_manager_card_text_41')
                      : gamepadControl
                        ? t('cm_manager_card_text_42')
                        : t('cm_manager_card_text_43'),
          }
        : undefined,
  });
}

export function CardFace({
  item,
  active,
  playing = false,
  audioActive = active,
  executionUnavailable = false,
  loadMedia = true,
  preloadFrame = false,
  resetPlayback = false,
}: {
  item: DeckCard;
  active: boolean;
  playing?: boolean;
  audioActive?: boolean;
  executionUnavailable?: boolean;
  loadMedia?: boolean;
  preloadFrame?: boolean;
  resetPlayback?: boolean;
}) {
  useLocale();

  const contentBlocking = isContentBlockingCard(item);
  const pageTheme = isPageThemeCard(item);
  const mediaSpeed = isMediaSpeedCard(item);
  const mediaResources = isMediaResourcesCard(item);
  const gamepadControl = isGamepadControlCard(item);
  const enabled = cardEnabled(item);
  const state = cardStatePresentation(item, executionUnavailable);
  const modifiers = contentBlocking
    ? state.tone === 'error'
      ? ['is-content-blocker', 'is-error']
      : ['is-content-blocker']
    : pageTheme
      ? state.tone === 'error'
        ? ['is-page-theme', 'is-error']
        : ['is-page-theme']
      : mediaSpeed
        ? state.tone === 'error'
          ? ['is-media-speed', 'is-error']
          : ['is-media-speed']
        : mediaResources
          ? state.tone === 'error'
            ? ['is-media-resources', 'is-error']
            : ['is-media-resources']
          : gamepadControl
            ? ['is-gamepad-control']
            : state.tone === 'error'
              ? ['is-error']
              : [];

  return (
    <ManagerCardFace
      active={active}
      enabled={enabled}
      playing={playing}
      loadMedia={loadMedia}
      preloadFrame={preloadFrame}
      resetPlayback={resetPlayback}
      videoAudio
      videoAudioActive={audioActive}
      forge={false}
      finish="framed"
      modifiers={modifiers}
      media={cardMedia(item)}
      edgeUrl={CARD_EDGE_URL}
      stateLabel={state.label}
      stateTone={state.tone}
      title={cardTitle(item)}
      description={cardDescription(item)}
    />
  );
}

type UserscriptManagerCardProps = Omit<
  ManagerCardBehaviorProps<DeckCard, ManagerActionKind>,
  'deckSource'
> & {
  deckTriggerElement: HTMLElement | null;
  executionUnavailable: boolean;
};

export function ManagerCard({
  item,
  deckTriggerElement,
  executionUnavailable,
  ...props
}: UserscriptManagerCardProps) {
  useLocale();

  const title = cardTitle(item);
  const accent = useCardAccent(item);
  const resetPlayback = props.mode === 'closed';
  return (
    <ManagerCardInteraction
      {...props}
      item={item}
      deckSource={deckTriggerElement}
      actionRoot={managerActionRoot(deckTriggerElement, document)}
      accent={accent}
      ariaLabel={`${title}，${item.kind === 'steward' ? t('cm_manager_card_text_44') : item.kind === 'gamepad-control' ? t('cm_manager_card_text_45') : item.kind === 'content-blocker' ? t('cm_manager_card_text_46') : item.kind === 'page-theme' ? t('cm_manager_card_text_47') : item.kind === 'media-speed' ? t('cm_manager_card_text_48') : item.kind === 'media-resources' ? t('cm_manager_card_text_49') : item.kind === 'bilibili-capability' ? t('cm_manager_card_text_50') : t('cm_manager_card_text_51')}`}
      backImageUrl={CARD_BACK_URL}
      cardKindDataAttribute="data-deck-card-kind"
      renderFace={(active, playing, audioActive) => (
        <CardFace
          item={item}
          active={active}
          playing={playing}
          audioActive={audioActive}
          executionUnavailable={executionUnavailable}
          resetPlayback={resetPlayback}
        />
      )}
      renderActionFrame={(className, style) => (
        <CardBottomFrame
          className={className}
          imageClassName="manager-card__action-frame-image"
          source={CARD_BOTTOM_FRAME_URL}
          style={style}
        />
      )}
    />
  );
}
