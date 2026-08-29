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
        title: '扩展已更新，请刷新页面',
        description: '当前网页仍在使用旧的扩展连接，牌库数据没有丢失。',
        tone: 'inactive' as const,
      };
    }
    return {
      title: '脚本仓库错误',
      description: context.libraryError,
      tone: 'error' as const,
    };
  }
  if (context.interactionError) {
    return {
      title: '当前操作未能完成',
      description: context.interactionError,
      tone: 'error' as const,
    };
  }
  if (isContentBlockingCard(card)) {
    if (!card.snapshot.rulesEnabled) {
      return {
        title: '内容拦截已停用',
        description: '拖至右上角的启用区域即可恢复所有过滤规则。',
        tone: 'inactive' as const,
      };
    }
    return null;
  }
  if (isGamepadControlCard(card)) return null;
  if (isPageThemeCard(card)) {
    if (card.snapshot.status === 'error') {
      return {
        title: '暗夜降临引擎异常',
        description: card.snapshot.error ?? '页面光影引擎没有返回错误详情。',
        tone: 'error' as const,
      };
    }
    if (!card.snapshot.enabled) {
      return {
        title: '暗夜降临已停用',
        description: '拖至右上角的启用区域即可恢复页面光影。',
        tone: 'inactive' as const,
      };
    }
    if (card.snapshot.darkThemeDetected) {
      return {
        title: '检测到站点原生暗色',
        description: '暗夜降临已避让当前站点的原生暗色主题。',
        tone: 'neutral' as const,
      };
    }
    return null;
  }
  if (isMediaSpeedCard(card)) {
    if (card.snapshot.status === 'error') {
      return {
        title: '媒体倍速引擎异常',
        description: card.snapshot.error ?? '媒体倍速引擎没有返回错误详情。',
        tone: 'error' as const,
      };
    }
    if (!card.snapshot.enabled) {
      return {
        title: '媒体倍速已停用',
        description: '拖至右上角的启用区域即可恢复媒体时间控制。',
        tone: 'inactive' as const,
      };
    }
    if (card.snapshot.mediaCount === 0) {
      return {
        title: '当前页面没有可调媒体',
        description: '检测到视频或音频后，速度法印会出现在牌库入口周围。',
        tone: 'neutral' as const,
      };
    }
    return null;
  }
  if (isMediaResourcesCard(card)) {
    if (card.snapshot.status === 'error') {
      return {
        title: '顺手牵羊异常',
        description:
          card.snapshot.error ??
          card.snapshot.unavailableReason ??
          '顺手牵羊没有返回错误详情。',
        tone: 'error' as const,
      };
    }
    if (!card.snapshot.enabled) {
      return {
        title: '顺手牵羊已停用',
        description: '拖至右上角的启用区域即可继续记录媒体请求。',
        tone: 'inactive' as const,
      };
    }
    if (card.snapshot.resources.length === 0 && !card.snapshot.captureEnabled) {
      return {
        title: '等待页面加载媒体',
        description: '播放视频或音频后，即可发动卡牌收取新发现的资源。',
        tone: 'neutral' as const,
      };
    }
    return null;
  }
  if (isBilibiliCapabilityCard(card)) {
    if (!card.snapshot.enabled) {
      return {
        title: `${cardTitle(card)}已停用`,
        description: '拖至右上角的启用区域即可恢复这项扩展能力。',
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
      title: '需要开启“允许运行用户脚本”',
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
  const hiddenCardIdSet = useMemo(
    () => new Set(hiddenCardIds),
    [hiddenCardIds],
  );
  const platformCards = useMemo(
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
              { key: '十字键', label: '选择指令' },
              { key: gamepadConfirm, label: '确认' },
              { key: gamepadBack, label: '返回' },
            ]
          : [
              { key: '十字键', label: '选择卡牌' },
              { key: `上 / ${gamepadConfirm}`, label: '激活' },
              { key: gamepadBack, label: '收起' },
            ]
        : inputModality === 'keyboard'
          ? mode === 'targeting'
            ? [
                { key: '方向键', label: '选择指令' },
                { key: '空格', label: '确认' },
                { key: 'Esc', label: '返回' },
              ]
            : [
                { key: '← →', label: '选择卡牌' },
                { key: '↑ / 空格', label: '激活' },
                { key: 'Esc', label: '收起' },
              ]
          : mode === 'targeting'
            ? [
                { key: '移动', label: '选择指令' },
                { key: '单击', label: '确认' },
                { key: 'Esc', label: '返回' },
              ]
            : [
                { key: '悬浮', label: '查看卡牌' },
                { key: '单击', label: '激活' },
                { key: 'Esc', label: '收起' },
              ];
  if (mode === 'forging' && selected && isInstalledUserscript(selected)) {
    return {
      key: `forging-${selected.id}`,
      title: userscriptDisplayName(selected.metadata),
      description:
        userscriptDisplayDescription(selected.metadata) || '该脚本未提供说明。',
      stats: [
        '标准 .user.js',
        `v${scriptVersion(selected)}`,
        selected.metadata.author || '作者未声明',
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
      description: cardDescription(active) || '该脚本未提供说明。',
      stats: installed
        ? [`v${scriptVersion(active)}`, active.metadata.author || '作者未声明']
        : [],
      shortcuts,
    };
  }
  if (libraryError) {
    if (isExtensionPageLifecycleInterrupted(libraryError)) {
      return {
        key: 'extension-page-lifecycle-interrupted',
        title: '扩展已更新，请刷新当前页面',
        description: '当前网页仍在使用更新前的扩展连接，刷新后会自动重新连接。',
        stats: ['当前牌库数据没有丢失'],
        tone: 'neutral',
      };
    }
    if (isExtensionStorageSpaceFailure(libraryError)) {
      return {
        key: 'extension-storage-space-error',
        title: '扩展本地存储写入失败',
        description:
          '浏览器返回存储空间错误，当前无法保存牌库、设置或运行状态。',
        stats: ['释放磁盘空间后重新加载扩展'],
        tone: 'error',
      };
    }
    return {
      key: 'library-error',
      title: '无法持久化当前牌库',
      description: libraryError,
      stats: ['需要处理后再继续安装或编辑'],
      tone: 'error',
    };
  }
  if (interactionError) {
    return {
      key: 'interaction-error',
      title: '当前操作未能完成',
      description: interactionError,
      stats: ['牌阵已恢复，可以重新尝试'],
      tone: 'error',
    };
  }
  if (
    executionCapability &&
    !userscriptExecutionAvailable(executionCapability)
  ) {
    return {
      key: 'userscript-capability-unavailable',
      title: '需要开启“允许运行用户脚本”',
      description: executionCapability.message,
      stats: ['已安装卡牌仍会保留', '开启后恢复页面脚本注入'],
      tone: 'error',
    };
  }
  return {
    key: 'spread-overview',
    title: '选择一张卡牌',
    description:
      '鼠标与键盘可以无缝接管牌阵，每张普通卡牌仍对应完整 `.user.js`。',
    stats: [],
    shortcuts,
  };
}
