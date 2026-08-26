import { bilibiliCapabilityDefinition } from '../../bilibili-capabilities/registry';
import { CardBottomFrame } from '../../components/CardBottomFrame';
import { projectAssetUrl } from '../../lib/project-assets';
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
      return { label: '正在部署', tone: 'pending' };
    }
    if (item.snapshot.status === 'error') {
      return { label: '引擎异常', tone: 'error' };
    }
    return item.snapshot.rulesEnabled
      ? { label: '规则生效', tone: 'active' }
      : { label: '规则停用', tone: 'inactive' };
  }

  if (pageTheme) {
    if (!item.snapshot.enabled) {
      return { label: '停用', tone: 'inactive' };
    }
    if (item.snapshot.status === 'starting') {
      return { label: '正在启用', tone: 'pending' };
    }
    if (item.snapshot.status === 'error') {
      return { label: '引擎异常', tone: 'error' };
    }
    if (item.snapshot.darkThemeDetected) {
      return { label: '原生暗色', tone: 'inactive' };
    }
    if (item.snapshot.activeOnPage) {
      return { label: '本站生效', tone: 'active' };
    }
    if (item.snapshot.inactiveReason === 'site-disabled') {
      return { label: '本站停用', tone: 'inactive' };
    }
    if (item.snapshot.inactiveReason === 'automation') {
      return { label: '自动休眠', tone: 'inactive' };
    }
    return { label: '本站未生效', tone: 'inactive' };
  }

  if (mediaSpeed) {
    if (item.snapshot.status === 'starting') {
      return { label: '正在校时', tone: 'pending' };
    }
    if (item.snapshot.status === 'error') {
      return { label: '引擎异常', tone: 'error' };
    }
    if (!item.snapshot.enabled) {
      return { label: '全局停用', tone: 'inactive' };
    }
    if (!item.snapshot.activeOnPage) {
      return { label: '本站停用', tone: 'inactive' };
    }
    if (item.snapshot.mediaCount === 0) {
      return { label: '等待媒体', tone: 'inactive' };
    }
    return {
      label:
        item.snapshot.selection.mode === 'hell'
          ? '地狱'
          : `${item.snapshot.selection.speed}×`,
      tone: 'active',
    };
  }

  if (mediaResources) {
    if (!item.snapshot.available || item.snapshot.status === 'error') {
      return { label: '平台不可用', tone: 'error' };
    }
    if (!item.snapshot.enabled) {
      return { label: '全局停用', tone: 'inactive' };
    }
    if (item.snapshot.captureEnabled) {
      return { label: '缓存捕捉中', tone: 'active' };
    }
    return item.snapshot.resources.length > 0
      ? {
          label: `${item.snapshot.resources.length} 项资源`,
          tone: 'active',
        }
      : { label: '等待媒体', tone: 'pending' };
  }

  if (bilibiliCapability) {
    if (item.snapshot.status === 'starting') {
      return { label: '正在接入', tone: 'pending' };
    }
    if (item.snapshot.status === 'error') {
      return { label: '能力异常', tone: 'error' };
    }
    if (!item.snapshot.enabled) {
      return { label: '已停用', tone: 'inactive' };
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
      return { label: '全局停用', tone: 'inactive' };
    }
    return item.connected
      ? { label: '手柄已连接', tone: 'active' }
      : { label: '等待手柄', tone: 'pending' };
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
              ? '规则生效'
              : pageTheme
                ? '暗夜降临启用'
                : mediaSpeed
                  ? '媒体倍速启用'
                  : mediaResources
                    ? '顺手牵羊启用'
                    : bilibiliCapability
                      ? '扩展能力启用'
                      : gamepadControl
                        ? '手柄输入监听'
                        : '已启用',
            disabledLabel: contentBlocking
              ? '规则停用'
              : pageTheme
                ? '暗夜降临停用'
                : mediaSpeed
                  ? '媒体倍速停用'
                  : mediaResources
                    ? '顺手牵羊停用'
                    : bilibiliCapability
                      ? '扩展能力停用'
                      : gamepadControl
                        ? '手柄输入停止'
                        : '已停用',
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
      ariaLabel={`${title}，${item.kind === 'steward' ? '打开脚本管理与生成' : item.kind === 'gamepad-control' ? '查看手柄网页控制' : item.kind === 'content-blocker' ? '设置内容拦截' : item.kind === 'page-theme' ? '设置暗夜降临' : item.kind === 'media-speed' ? '设置媒体倍速' : item.kind === 'media-resources' ? '查看媒体资源' : item.kind === 'bilibili-capability' ? '设置扩展能力' : '设置脚本'}`}
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
