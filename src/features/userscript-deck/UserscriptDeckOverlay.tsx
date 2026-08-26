import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { useAudioDirector } from '../../audio/AudioDirectorProvider';
import type { AudioCue } from '../../audio/cues';
import type { GamepadControlSettings } from '../../gamepad-control/domain/settings';
import { useGamepadConnection } from '../../gamepad-control/useGamepadSnapshot';
import {
  publishGamepadControlOwner,
  subscribeGamepadDeckToggle,
} from '../../hosts/extension/gamepad-bridge';
import { inputCoordinatorFor } from '../../input/coordinator';
import { useInputModality } from '../../input/useInputModality';
import { lockDocumentScroll } from '../../lib/document-scroll-lock';
import { projectAssetUrl } from '../../lib/project-assets';
import { MEDIA_RESOURCES_CARD_ID } from '../../media-resources/domain/types';
import {
  DEFAULT_MEDIA_SPEED_WHEEL_ITEMS,
  type MediaSpeedSelection,
  mediaSpeedWheelVisible,
} from '../../media-speed/domain/types';
import type { InstalledUserscript } from '../../userscript/domain/types';
import { GamepadInspection } from '../gamepad-control/GamepadInspection';
import {
  GLOBAL_LIBRARY_CARD_SETTINGS_CLOSED_EVENT,
  GLOBAL_LIBRARY_CARD_SETTINGS_REQUEST_EVENT,
  type GlobalLibraryCardSettingsRequestEvent,
} from '../global-library/lifecycle';
import { ActionAttachment } from '../manager-interaction/ActionAttachment';
import { managerActionRoot } from '../manager-interaction/action-hit-testing';
import {
  ACTIVE_CARD_RISE,
  ACTIVE_CARD_SCALE,
  managerCardDimensions,
  managerCornerActionRadius,
} from '../manager-interaction/layout';
import {
  ManagerActionField,
  type ManagerActionScene,
} from '../manager-interaction/ManagerActionField';
import {
  castingCollection,
  hoveredActionId,
  initialManagerState,
  managerStateReducer,
  detailMode as readDetailMode,
  detailReturnMode as readDetailReturnMode,
  resolvingActionId as readResolvingActionId,
  selectedCardId,
} from '../manager-interaction/state';
import { useExclusiveInteraction } from '../manager-interaction/useExclusiveInteraction';
import { useViewportSize } from '../manager-interaction/useViewportSize';
import { AimOverlay, createAimVisualController } from './AimOverlay';
import {
  actionPlacement,
  actionsFor,
  CANCEL_ACTION,
  CANCEL_ACTION_ID,
  cornerPositionForAction,
  type ManagerAction,
  type ManagerActionKind,
} from './actions';
import {
  CardContextPrompt,
  type CardContextPromptContent,
} from './CardContextPrompt';
import {
  CardCreationPreview,
  type CardCreationPreviewCard,
  cardCreationPreviewCard,
} from './CardCreationPreview';
import { CardSpread } from './CardSpread';
import { CatCatchPopup, catCatchPopupPageTabId } from './CatCatchPopup';
import {
  cardTitle,
  type DeckCard,
  gamepadControlCard,
  isContentBlockingCard,
  isGamepadControlCard,
  isMediaResourcesCard,
  isNewTabCard,
  mediaResourcesCard,
} from './cards';
import { DeckTrigger } from './DeckTrigger';
import { DetailStage } from './DetailStage';
import {
  activeBilibiliCapabilityCount,
  activeDeckCardSummary,
  contentBlockingCardActive,
  mediaResourcesCardActive,
  mediaSpeedCardActive,
  pageThemeCardActive,
} from './deck-card-activity';
import {
  type DeckVisibility,
  type DeckVisibilityRequest,
  deckTriggerHidden,
} from './deck-entry';
import {
  userscriptDeckActionNotice,
  userscriptDeckContextPrompt,
  useUserscriptDeckCards,
} from './deck-view';
import {
  settingsDetailModeForCard,
  type UserscriptDetailMode,
} from './detail-mode';
import { ElementTargetingHint } from './ElementTargetingHint';
import type { UserscriptDeckHost } from './host';
import {
  LibraryImportCelebration,
  type LibraryImportCelebrationItem,
  libraryImportCelebrationItem,
} from './LibraryImportCelebration';
import { useCardActionController } from './useCardActionController';
import { useCardReordering } from './useCardReordering';
import { useDeckDetailController } from './useDeckDetailController';
import { useDeckEntryRuntime } from './useDeckEntryRuntime';
import { useDeckInputController } from './useDeckInputController';
import {
  CARD_SPREAD_INTERACTION_CUES,
  deckMotionCardCount,
  useDeckLifecycleController,
} from './useDeckLifecycleController';
import { useScriptEditorActions } from './useScriptEditorActions';
import { useUserscriptLibrary } from './useUserscriptLibrary';

const ACTION_FRAME_URL = projectAssetUrl(
  'userscript-deck/visual/cards/action-frame.webp',
);

type GlobalLibraryPresentation = 'idle' | 'retreated';

function libraryImportContextPrompt(
  presentation: {
    items: readonly LibraryImportCelebrationItem[];
  },
  activeItem: LibraryImportCelebrationItem | null,
): CardContextPromptContent {
  if (!activeItem) {
    return {
      key: 'library-import-start',
      title: '正在整理导入卡牌',
      description: '脚本已经写入牌库，正在按当前页面的匹配结果完成落位。',
      stats: [`${presentation.items.length} 张卡牌等待落位`],
    };
  }
  return {
    key: `library-import-${activeItem.id}-${activeItem.destination}`,
    title: activeItem.card.title,
    description: activeItem.card.description || '该脚本未提供说明。',
    stats:
      activeItem.destination === 'formation'
        ? ['牌阵召唤', '当前页面立即生效']
        : ['牌库收纳', '当前页面暂不生效'],
  };
}

function actionAudioCues(kind: ManagerActionKind): readonly AudioCue[] {
  switch (kind) {
    case 'command':
    case 'site-toggle':
    case 'undo-block':
    case 'theme-site-toggle':
    case 'speed-select':
    case 'capability-command':
    case 'media-resources-collect':
    case 'open-new-tab':
      return ['castCharge', 'cast'];
    case 'block':
    case 'zap':
      return [
        'castCharge',
        'cast',
        'contentBlockEnergyImpact',
        'contentBlockSwordImpact',
      ];
    case 'assistant':
    case 'library':
    case 'site-search':
    case 'theme-tune':
      return ['panelOpen', 'panelClose'];
    case 'toggle':
      return ['toggle'];
    case 'manage':
      return ['panelOpen', 'panelClose'];
    case 'remove':
      return ['cardRemove', 'cardBurn'];
    case 'cancel':
      return ['actionCancel'];
  }
}

export function UserscriptDeckOverlay({ host }: { host: UserscriptDeckHost }) {
  const audio = useAudioDirector();
  const { runtimeContext } = host;
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const {
    items,
    setItems,
    libraryError,
    libraryReady,
    executionCapability,
    contentBlockingSnapshot,
    setContentBlockingSnapshot,
    pageThemeSnapshot,
    setPageThemeSnapshot,
    mediaSpeedSnapshot,
    setMediaSpeedSnapshot,
    mediaResourcesSnapshot,
    setMediaResourcesSnapshot,
    bilibiliCapabilitySnapshots,
    setBilibiliCapabilitySnapshots,
    commitScript,
    removeScript,
    persistOrder,
    checkScriptUpdate,
    installScriptUpdate,
    exportScriptSource,
  } = useUserscriptLibrary(host, setInteractionError);
  const {
    deckTriggerElement,
    setDeckTriggerElement,
    deckLaunchReady,
    deckEntrySettings,
    resolvedDeckEntrySettings,
    updateDeckEntrySettings,
    previewDeckEntryPosition,
    commitDeckEntryPosition,
  } = useDeckEntryRuntime({
    host,
    libraryReady,
    setInteractionError,
  });
  const [managerState, dispatchManager] = useReducer(
    managerStateReducer<UserscriptDetailMode>,
    initialManagerState<UserscriptDetailMode>(),
  );
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [mediaResourcesPopupOpen, setMediaResourcesPopupOpen] = useState(false);
  const [mediaResourcesPopupRequested, setMediaResourcesPopupRequested] =
    useState(false);
  const requestMediaResourcesPopup = useCallback(
    () => setMediaResourcesPopupRequested(true),
    [],
  );
  const {
    ownerId: interactionId,
    claim: claimInteraction,
    release: releaseInteraction,
    hasOwner: hasInteractionOwner,
    cancelActive: cancelActiveInteraction,
  } = useExclusiveInteraction();
  const { width: viewportWidth, height: viewportHeight } = useViewportSize();
  const cardDimensions = managerCardDimensions(viewportWidth);
  const [audioMuted, setAudioMuted] = useState(() => audio.getSettings().muted);
  const [requestedVisibility, setRequestedVisibility] =
    useState<DeckVisibility | null>(host.initialOpen ? 'open' : null);
  const [gamepadSettings, setGamepadSettings] =
    useState<GamepadControlSettings | null>(null);
  const [creationPreview, setCreationPreview] = useState<{
    requestId: string;
    card?: CardCreationPreviewCard;
  } | null>(null);
  const [pendingImportCelebration, setPendingImportCelebration] = useState<{
    requestId: string;
    items: LibraryImportCelebrationItem[];
  } | null>(null);
  const [importCelebration, setImportCelebration] = useState<{
    requestId: string;
    items: LibraryImportCelebrationItem[];
  } | null>(null);
  const [activeImportCelebrationItem, setActiveImportCelebrationItem] =
    useState<LibraryImportCelebrationItem | null>(null);
  const [globalLibraryPresentation, setGlobalLibraryPresentation] =
    useState<GlobalLibraryPresentation>('idle');
  const [globalLibrarySettingsRequest, setGlobalLibrarySettingsRequest] =
    useState<{
      card: DeckCard;
      status: 'pending' | 'open';
    } | null>(null);
  const audioAttachmentRef = useRef<string | null>(null);
  const globalLibraryOpenRef = useRef(false);
  const creationPreviewLoadRef = useRef(0);
  const aimVisual = useMemo(createAimVisualController, []);
  const mode = managerState.mode;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const importPresentationActive =
    pendingImportCelebration !== null || importCelebration !== null;
  const pendingImportCardIds = useMemo(
    () => new Set(pendingImportCelebration?.items.map((item) => item.id) ?? []),
    [pendingImportCelebration],
  );
  const actionRoot = managerActionRoot(deckTriggerElement, document);
  const inputRoot =
    actionRoot instanceof Document || actionRoot instanceof ShadowRoot
      ? actionRoot
      : document;
  const inputModality = useInputModality(inputRoot);
  useEffect(() => {
    let active = true;
    const applySettings = (settings: GamepadControlSettings) => {
      if (!active) return;
      setGamepadSettings(settings);
      inputCoordinatorFor(inputRoot).configureGamepad(settings);
    };
    const stop = host.gamepadControl.subscribe(applySettings);
    void host.gamepadControl.readSettings().catch((failure) => {
      host.reportError?.('gamepad-control', 'settings-read-failed', failure, {
        url: window.location.href,
      });
    });
    return () => {
      active = false;
      stop();
    };
  }, [host.gamepadControl, host.reportError, inputRoot]);
  const gamepadConnection = useGamepadConnection();
  const gamepadCard = useMemo(
    () =>
      gamepadControlCard({
        connected: gamepadConnection.connected,
        deviceName: gamepadConnection.id,
        enabled: gamepadSettings?.enabled ?? false,
      }),
    [gamepadSettings, gamepadConnection.connected, gamepadConnection.id],
  );
  const selectedId = selectedCardId(managerState);
  const hoveredAction = hoveredActionId(managerState);
  const resolvingActionId = readResolvingActionId(managerState);
  const emphasizedActionId = hoveredAction ?? resolvingActionId;
  const castingAction = castingCollection(managerState);
  const detailMode = readDetailMode(managerState);
  const detailReturnMode = readDetailReturnMode(managerState);
  const {
    matchingItemIds,
    systemCards,
    visibleItems,
    renderedItems,
    scriptStartIndex,
    setLayerOrder,
  } = useUserscriptDeckCards({
    items,
    contentBlockingSnapshot,
    pageThemeSnapshot,
    mediaSpeedSnapshot,
    mediaResourcesSnapshot,
    gamepadControl: gamepadCard,
    bilibiliCapabilitySnapshots,
    hiddenCardIds: resolvedDeckEntrySettings.hiddenCardIds,
    runtimeContext,
    mode,
  });
  const visibleCardCount = visibleItems.length;
  const activeCardCount = useMemo(
    () =>
      activeDeckCardSummary({
        scripts: items,
        runtimeContext,
        contentBlockingActive: contentBlockingCardActive(
          contentBlockingSnapshot,
          runtimeContext.url,
        ),
        pageThemeActive: pageThemeCardActive(pageThemeSnapshot),
        gamepadControlActive: gamepadSettings?.enabled === true,
        mediaSpeedActive: mediaSpeedCardActive(mediaSpeedSnapshot),
        mediaResourcesActive: mediaResourcesCardActive(mediaResourcesSnapshot),
        bilibiliCapabilityCount: activeBilibiliCapabilityCount(
          bilibiliCapabilitySnapshots,
          resolvedDeckEntrySettings.hiddenCardIds,
        ),
        hiddenCardIds: resolvedDeckEntrySettings.hiddenCardIds,
      }).count,
    [
      bilibiliCapabilitySnapshots,
      contentBlockingSnapshot,
      gamepadSettings?.enabled,
      items,
      mediaResourcesSnapshot,
      mediaSpeedSnapshot,
      pageThemeSnapshot,
      resolvedDeckEntrySettings.hiddenCardIds,
      runtimeContext,
    ],
  );
  const {
    arrivingId,
    collectionCardCount,
    collectCycle,
    dealActive,
    dealCycle,
    setCollectCycle,
    dealCardSpread,
    collectCardSpread,
    collectCardSpreadAfterAction,
    handleDealReady,
    handleDealComplete,
    handleCollectAll,
    completeArrival,
  } = useDeckLifecycleController({
    audio,
    mode,
    cardCount: visibleCardCount,
    libraryReady,
    deckTriggerElement,
    hasInteractionOwner,
    dispatchManager,
    setFocusedIndex,
  });
  const motionCardCount = deckMotionCardCount(
    mode,
    visibleCardCount,
    collectionCardCount,
  );

  useEffect(() => {
    void host.deckEntry
      .updateActiveCardCount(activeCardCount)
      .catch((failure) => {
        host.reportError?.(
          'deck-action-badge',
          'active-card-count-update-failed',
          failure,
          { activeCount: activeCardCount },
        );
      });
  }, [activeCardCount, host.deckEntry, host.reportError]);

  const returnToCardSpread = useCallback(() => {
    setFocusedIndex(null);
    dispatchManager({ type: 'showSpread' });
  }, []);
  const returnCardToSpread = useCallback(
    (cardId: string) => {
      setFocusedIndex(null);
      if (
        globalLibraryPresentation !== 'idle' ||
        !visibleItems.some((item) => item.id === cardId)
      ) {
        dispatchManager({ type: 'showSpread' });
        return;
      }
      dispatchManager({ type: 'returnCard', cardId });
    },
    [globalLibraryPresentation, visibleItems],
  );
  const completeCardReturn = useCallback(
    (cardId: string) => {
      releaseInteraction(cardId);
      dispatchManager({ type: 'completeReturn', cardId });
    },
    [releaseInteraction],
  );
  const closeDetailState = useCallback(() => {
    setFocusedIndex(null);
    dispatchManager({ type: 'closeDetail' });
  }, []);
  const openGlobalLibrary = useCallback(async () => {
    if (globalLibraryOpenRef.current) return;
    globalLibraryOpenRef.current = true;
    returnToCardSpread();
    setGlobalLibraryPresentation('retreated');
    try {
      await host.openGlobalLibrary();
    } finally {
      audio.play('panelClose', { positionX: window.innerWidth / 2 });
      setGlobalLibraryPresentation('idle');
      globalLibraryOpenRef.current = false;
    }
  }, [audio, host, returnToCardSpread]);
  useEffect(() => {
    const handleSettingsRequest = (event: Event) => {
      const request = event as GlobalLibraryCardSettingsRequestEvent;
      if (!request.detail?.card) return;
      setGlobalLibrarySettingsRequest({
        card: request.detail.card,
        status: 'pending',
      });
    };
    document.addEventListener(
      GLOBAL_LIBRARY_CARD_SETTINGS_REQUEST_EVENT,
      handleSettingsRequest,
    );
    return () =>
      document.removeEventListener(
        GLOBAL_LIBRARY_CARD_SETTINGS_REQUEST_EVENT,
        handleSettingsRequest,
      );
  }, []);
  useEffect(() => {
    if (
      globalLibraryPresentation !== 'retreated' ||
      globalLibrarySettingsRequest?.status !== 'pending' ||
      (mode !== 'closed' && mode !== 'spread')
    ) {
      return;
    }
    const card = globalLibrarySettingsRequest.card;
    if (isMediaResourcesCard(card)) {
      setGlobalLibrarySettingsRequest(null);
      document.dispatchEvent(
        new Event(GLOBAL_LIBRARY_CARD_SETTINGS_CLOSED_EVENT),
      );
      if (!host.mediaResources) {
        setInteractionError('当前宿主没有提供顺手牵羊设置。');
        return;
      }
      audio.play('panelOpen', { positionX: window.innerWidth / 2 });
      void host.mediaResources.openSettings().catch((failure) => {
        setInteractionError(
          failure instanceof Error ? failure.message : String(failure),
        );
      });
      return;
    }
    if (isNewTabCard(card)) {
      setGlobalLibrarySettingsRequest(null);
      document.dispatchEvent(
        new Event(GLOBAL_LIBRARY_CARD_SETTINGS_CLOSED_EVENT),
      );
      audio.play('panelOpen', { positionX: window.innerWidth / 2 });
      void host.openNewTabSettings().catch((failure) => {
        setInteractionError(
          failure instanceof Error ? failure.message : String(failure),
        );
      });
      return;
    }
    const detail = settingsDetailModeForCard(card);
    if (!detail) {
      setGlobalLibrarySettingsRequest(null);
      document.dispatchEvent(
        new Event(GLOBAL_LIBRARY_CARD_SETTINGS_CLOSED_EVENT),
      );
      setInteractionError(`${cardTitle(card)}没有独立设置窗口。`);
      return;
    }
    audio.play('panelOpen', { positionX: window.innerWidth / 2 });
    dispatchManager({ type: 'openDetail', cardId: card.id, detail });
    setGlobalLibrarySettingsRequest({ card, status: 'open' });
  }, [
    audio,
    globalLibraryPresentation,
    globalLibrarySettingsRequest,
    host,
    mode,
  ]);
  const {
    beginReorder,
    beginAction: beginReorderAction,
    cancelAction: cancelReorderAction,
    updateReorder: reorderItem,
    releaseReorder,
    restoreSession: restoreReorderSession,
  } = useCardReordering({
    items,
    setItems,
    visibleItems,
    systemCards,
    matchingItemIds,
    scriptStartIndex,
    viewportWidth,
    viewportHeight,
    deckTriggerElement,
    setLayerOrder,
    setFocusedIndex,
    playReorder: (positionX) => audio.play('cardReorder', { positionX }),
    persistOrder,
    onBeginReorder: (cardId) => dispatchManager({ type: 'reorder', cardId }),
    onBeginAction: (cardId) => dispatchManager({ type: 'dragAction', cardId }),
    onShowCardSpread: () => dispatchManager({ type: 'showSpread' }),
  });
  const {
    selectingPageElement,
    pageElementInteraction,
    cancelTargeting,
    activateTargeting,
    updateAimPoint,
    dragPoint,
    releaseCard,
    chooseTargetAction,
    chooseTargetActionAtPoint,
    capturePageTarget,
    consumePageTargetClick,
  } = useCardActionController({
    host,
    aimVisual,
    audio,
    managerState,
    dispatchManager,
    visibleItems,
    viewportWidth,
    viewportHeight,
    actionRoot,
    deckTriggerElement,
    openGlobalLibrary,
    openSiteScriptSearch: host.openSiteScriptSearch,
    openMediaResourcesPopup: requestMediaResourcesPopup,
    setFocusedIndex,
    setCollectCycle,
    releaseInteraction,
    contentBlockingSnapshot,
    setContentBlockingSnapshot,
    setPageThemeSnapshot,
    setMediaSpeedSnapshot,
    setMediaResourcesSnapshot,
    setBilibiliCapabilitySnapshots,
    commitScript,
    removeScript,
    returnToCardSpread,
    collectCardSpreadAfterAction,
    restoreReorderSession,
    returnCardToSpread,
    setInteractionError,
  });
  const directMediaResourcesCard =
    mediaResourcesSnapshot?.available && selectedId === MEDIA_RESOURCES_CARD_ID
      ? mediaResourcesCard(mediaResourcesSnapshot)
      : null;
  const selected =
    visibleItems.find((item) => item.id === selectedId) ??
    directMediaResourcesCard ??
    (globalLibrarySettingsRequest?.status === 'open' &&
    globalLibrarySettingsRequest.card.id === selectedId
      ? globalLibrarySettingsRequest.card
      : null);
  const selectedIndex = selectedId
    ? visibleItems.findIndex((item) => item.id === selectedId)
    : -1;
  const focusedItem =
    focusedIndex === null ? null : (visibleItems[focusedIndex] ?? null);
  const libraryActionFocus =
    mode === 'spread' && !selected && focusedItem !== null;
  const actionPreview = libraryActionFocus && !interactionId;
  const actionSubject = selected ?? (libraryActionFocus ? focusedItem : null);
  const gamepadInspectionVisible =
    actionSubject !== null &&
    isGamepadControlCard(actionSubject) &&
    (libraryActionFocus || mode === 'targeting');
  const gamepadInspectionActive =
    mode === 'targeting' && selected !== null && isGamepadControlCard(selected);
  const actions = useMemo(() => {
    if (!actionSubject) return [];
    const available = [...actionsFor(actionSubject)];
    if (!isContentBlockingCard(actionSubject)) return available;
    const elementSelection = available.find(
      (action) => action.id === 'block-element',
    );
    return elementSelection
      ? [
          elementSelection,
          ...available.filter((action) => action !== elementSelection),
        ]
      : available;
  }, [actionSubject]);
  const actionSlots = useMemo(() => [...actions, CANCEL_ACTION], [actions]);
  const hoveredActionEntry = hoveredAction
    ? (actionSlots.find((action) => action.id === hoveredAction) ?? null)
    : null;
  const resolvingActionEntry = resolvingActionId
    ? (actionSlots.find((action) => action.id === resolvingActionId) ?? null)
    : null;
  const centralActionCount = actions.filter(
    (action) => actionPlacement(action.kind) === 'center',
  ).length;
  const elementTargetingAction =
    selectingPageElement && resolvingActionEntry?.target === 'page-element'
      ? resolvingActionEntry
      : null;
  const attachedAction: ManagerAction | null =
    resolvingActionEntry &&
    actionPlacement(resolvingActionEntry.kind) === 'center'
      ? resolvingActionEntry
      : mode === 'dragging' &&
          hoveredActionEntry &&
          actionPlacement(hoveredActionEntry.kind) === 'center'
        ? hoveredActionEntry
        : null;
  const actionStageVisible = Boolean(
    !castingAction &&
      !pageElementInteraction &&
      actionSubject &&
      (libraryActionFocus ||
        mode === 'reordering' ||
        mode === 'dragging' ||
        mode === 'targeting' ||
        mode === 'resolving'),
  );
  const actionScene = useMemo<ManagerActionScene<ManagerAction> | null>(() => {
    if (!actionStageVisible || !actionSubject) return null;
    return {
      key: actionSubject.id,
      title: cardTitle(actionSubject),
      actions,
      notice:
        userscriptDeckActionNotice(actionSubject, {
          libraryError,
          interactionError,
          executionCapability,
        }) ?? undefined,
    };
  }, [
    actionStageVisible,
    actionSubject,
    actions,
    executionCapability,
    interactionError,
    libraryError,
  ]);
  const atmosphereDuration =
    mode === 'collecting' ? 0.22 : dealActive ? 0.24 : 0.32;
  const contextPrompt = userscriptDeckContextPrompt({
    libraryError,
    interactionError,
    mode,
    selected,
    focusedItem,
    executionCapability,
    inputModality,
    gamepadBindings: gamepadSettings?.bindings,
    gamepadDeviceId: gamepadConnection.id,
  });
  const importContextPrompt = importCelebration
    ? libraryImportContextPrompt(importCelebration, activeImportCelebrationItem)
    : null;

  useEffect(
    () => audio.subscribeSettings((settings) => setAudioMuted(settings.muted)),
    [audio],
  );

  useEffect(() => {
    if (
      mode === 'closed' &&
      globalLibraryPresentation === 'idle' &&
      !creationPreview &&
      !pendingImportCelebration &&
      !importCelebration
    ) {
      return;
    }
    return lockDocumentScroll(document, host.scrollLockOwnerId);
  }, [
    creationPreview,
    globalLibraryPresentation,
    host.scrollLockOwnerId,
    importCelebration,
    mode,
    pendingImportCelebration,
  ]);

  useEffect(() => {
    if (
      mode === 'closed' &&
      !creationPreview &&
      !pendingImportCelebration &&
      !importCelebration
    ) {
      void audio.suspend();
    } else void audio.resume();
  }, [
    audio,
    creationPreview,
    importCelebration,
    mode,
    pendingImportCelebration,
  ]);

  const gamepadControlOwner = gamepadInspectionActive
    ? 'gamepad-test'
    : mode !== 'closed' ||
        globalLibraryPresentation !== 'idle' ||
        creationPreview !== null ||
        pendingImportCelebration !== null ||
        importCelebration !== null
      ? mode === 'detail'
        ? 'dialog'
        : 'deck'
      : 'external-page';
  useLayoutEffect(() => {
    publishGamepadControlOwner(gamepadControlOwner);
  }, [gamepadControlOwner]);
  useLayoutEffect(() => () => publishGamepadControlOwner('external-page'), []);

  useEffect(() => {
    const canAttach = mode === 'dragging' || mode === 'targeting';
    const nextAction = canAttach ? hoveredAction : null;
    const previousAction = audioAttachmentRef.current;
    if (nextAction === previousAction) return;

    if (nextAction) {
      const target = actionRoot.querySelector<HTMLElement>(
        `[data-manager-action="${CSS.escape(nextAction)}"]`,
      );
      const bounds = target?.getBoundingClientRect();
      audio.play('actionAttach', {
        positionX: bounds
          ? bounds.left + bounds.width / 2
          : window.innerWidth / 2,
      });
    } else if (previousAction && canAttach) {
      audio.play('actionDetach', { positionX: window.innerWidth / 2 });
    }
    audioAttachmentRef.current = nextAction;
  }, [actionRoot, audio, hoveredAction, mode]);

  useEffect(() => {
    if (!actionSubject) return;
    const cues = [
      ...new Set(actionSlots.flatMap((action) => actionAudioCues(action.kind))),
    ];
    void audio.prepare(cues);
  }, [actionSlots, actionSubject, audio]);

  const {
    activeDetail,
    closing: detailClosing,
    closeDetail,
    completeDetailClose,
  } = useDeckDetailController({
    audio,
    mode,
    selected,
    detailMode,
    returnMode: detailReturnMode,
    returnCardToSpread,
    closeDetailState,
  });
  const completeDetailCloseAndClearRequest = useCallback(() => {
    completeDetailClose();
    setGlobalLibrarySettingsRequest(null);
    document.dispatchEvent(
      new Event(GLOBAL_LIBRARY_CARD_SETTINGS_CLOSED_EVENT),
    );
  }, [completeDetailClose]);

  const requestImportCelebration = useCallback(
    (scripts: readonly InstalledUserscript[]) => {
      const celebrationItems = scripts.map((script) =>
        libraryImportCelebrationItem(script, runtimeContext),
      );
      if (celebrationItems.length === 0) return null;
      const requestId = crypto.randomUUID();
      setFocusedIndex(null);
      setActiveImportCelebrationItem(null);
      setPendingImportCelebration({
        requestId,
        items: celebrationItems,
      });
      return requestId;
    },
    [runtimeContext],
  );

  const cancelImportCelebration = useCallback((requestId: string) => {
    setPendingImportCelebration((current) =>
      current?.requestId === requestId ? null : current,
    );
    setActiveImportCelebrationItem(null);
  }, []);

  useLayoutEffect(() => {
    if (
      !pendingImportCelebration ||
      activeDetail ||
      mode !== 'spread' ||
      importCelebration ||
      !deckTriggerElement?.classList.contains('manager-deck-trigger')
    ) {
      return;
    }
    const installedIds = new Set(items.map((item) => item.id));
    if (
      pendingImportCelebration.items.some((item) => !installedIds.has(item.id))
    ) {
      return;
    }
    setImportCelebration(pendingImportCelebration);
    setPendingImportCelebration(null);
  }, [
    activeDetail,
    deckTriggerElement,
    importCelebration,
    items,
    mode,
    pendingImportCelebration,
  ]);

  const completeImportCelebration = useCallback((requestId: string) => {
    setImportCelebration((current) =>
      current?.requestId === requestId ? null : current,
    );
    setActiveImportCelebrationItem(null);
  }, []);

  const requestDeckVisibility = useCallback(
    (request: DeckVisibilityRequest) => {
      setRequestedVisibility(
        request === 'toggle'
          ? modeRef.current === 'closed'
            ? 'open'
            : 'closed'
          : request,
      );
    },
    [],
  );

  useEffect(
    () => host.deckEntry.subscribeVisibilityRequest(requestDeckVisibility),
    [host.deckEntry, requestDeckVisibility],
  );
  useEffect(() => {
    const toggleFromGamepad = () => requestDeckVisibility('toggle');
    return subscribeGamepadDeckToggle(toggleFromGamepad);
  }, [requestDeckVisibility]);

  useEffect(
    () =>
      host.deckEntry.subscribeCreationPreview(({ requestId, scriptId }) => {
        const loadId = ++creationPreviewLoadRef.current;
        setFocusedIndex(null);
        if (!scriptId) {
          setCreationPreview({ requestId });
          return;
        }
        void (async () => {
          const script = await host.repository.get(scriptId);
          if (!script) {
            throw new Error('找不到刚刚创建的脚本卡牌，无法播放入库动画。');
          }
          if (creationPreviewLoadRef.current !== loadId) return;
          setCreationPreview({
            requestId,
            card: cardCreationPreviewCard(script),
          });
        })().catch((failure) => {
          if (creationPreviewLoadRef.current !== loadId) return;
          const message =
            failure instanceof Error ? failure.message : String(failure);
          setInteractionError(message);
          host.reportError?.(
            'deck-creation-preview',
            'created-card-load-failed',
            failure,
            { requestId, scriptId },
          );
        });
      }),
    [host.deckEntry, host.reportError, host.repository],
  );

  const completeCreationPreview = useCallback((requestId: string) => {
    setCreationPreview((current) =>
      current?.requestId === requestId ? null : current,
    );
  }, []);

  useEffect(() => {
    if (!requestedVisibility) return;
    if (requestedVisibility === 'open') {
      if (mode === 'collecting') return;
      if (mode !== 'closed') {
        setRequestedVisibility(null);
        return;
      }
      if (!libraryReady || !deckEntrySettings) return;
      if (!deckLaunchReady) return;
      dealCardSpread();
      return;
    }

    if (mode === 'closed') {
      setRequestedVisibility(null);
      return;
    }
    if (
      mode === 'targeting' ||
      mode === 'element-targeting' ||
      pageElementInteraction
    ) {
      cancelTargeting();
      return;
    }
    if (mode === 'detail') {
      closeDetail();
      return;
    }
    if (
      (mode === 'reordering' || mode === 'dragging') &&
      cancelActiveInteraction()
    ) {
      return;
    }
    if (
      mode === 'dealing' ||
      mode === 'spread' ||
      mode === 'reordering' ||
      mode === 'dragging'
    ) {
      collectCardSpread();
    }
  }, [
    cancelActiveInteraction,
    cancelTargeting,
    closeDetail,
    collectCardSpread,
    dealCardSpread,
    deckEntrySettings,
    deckLaunchReady,
    libraryReady,
    mode,
    pageElementInteraction,
    requestedVisibility,
  ]);

  const toggleAudio = useCallback(() => {
    void audio.unlock();
    if (audioMuted) {
      audio.setMuted(false);
      audio.play('uiConfirm', { positionX: window.innerWidth - 48 });
    } else {
      audio.play('uiPress', { positionX: window.innerWidth - 48 });
      audio.setMuted(true);
    }
  }, [audio, audioMuted]);

  const selectMediaSpeed = useCallback(
    (selection: MediaSpeedSelection) => {
      if (!host.mediaSpeed) return;
      void host.mediaSpeed.setSelection(selection).then(
        (snapshot) => {
          setMediaSpeedSnapshot(snapshot);
          setInteractionError(null);
        },
        (failure) => {
          host.reportError?.(
            'media-speed-wheel',
            'selection-apply-failed',
            failure,
            { selection },
          );
          setInteractionError(
            failure instanceof Error ? failure.message : String(failure),
          );
          void host.mediaSpeed
            ?.read()
            .then(setMediaSpeedSnapshot)
            .catch(() => undefined);
        },
      );
    },
    [host.mediaSpeed, host.reportError, setMediaSpeedSnapshot],
  );

  const toggleMediaResourcesPopup = useCallback(() => {
    if (
      modeRef.current !== 'closed' ||
      !host.mediaResources ||
      !mediaResourcesSnapshot?.available
    ) {
      return;
    }
    setInteractionError(null);
    setMediaResourcesPopupOpen((current) => !current);
  }, [host.mediaResources, mediaResourcesSnapshot]);
  const closeMediaResourcesPopup = useCallback(
    () => setMediaResourcesPopupOpen(false),
    [],
  );

  useEffect(() => {
    if (!mediaResourcesPopupRequested || mode !== 'closed') return;
    setMediaResourcesPopupRequested(false);
    if (!host.mediaResources || !mediaResourcesSnapshot?.available) return;
    setInteractionError(null);
    setMediaResourcesPopupOpen(true);
  }, [
    host.mediaResources,
    mediaResourcesPopupRequested,
    mediaResourcesSnapshot?.available,
    mode,
  ]);

  useEffect(() => {
    if (
      mode === 'closed' &&
      host.mediaResources &&
      mediaResourcesSnapshot?.available
    ) {
      return;
    }
    setMediaResourcesPopupOpen(false);
  }, [host.mediaResources, mediaResourcesSnapshot, mode]);

  const { saveManagement } = useScriptEditorActions({
    host,
    items,
    selected,
    commitScript,
  });

  useDeckInputController({
    actionRoot,
    actions,
    actionSlots,
    audio,
    enabled:
      globalLibraryPresentation === 'idle' &&
      creationPreview === null &&
      !importPresentationActive &&
      !mediaResourcesPopupOpen,
    mode: dealActive ? 'dealing' : mode,
    pageElementInteraction,
    visibleItems,
    focusedIndex,
    setFocusedIndex,
    focusedActionId: hoveredAction,
    interactionId,
    hasInteractionOwner,
    claimInteraction,
    activateTargeting,
    dispatchManager,
    cancelTargeting,
    closeDetail,
    cancelActiveInteraction,
    collectCardSpread: () => collectCardSpread('input-cancel'),
    chooseTargetAction,
    toggleAudio,
  });

  return (
    <main
      className={`app-ui-theme userscript-deck host-extension mode-${mode} input-${inputModality}${dealActive ? ' is-dealing' : ''}${castingAction ? ' is-casting' : ''}${pageElementInteraction ? ' has-page-element-target' : ''}${creationPreview ? ' is-card-creation-preview' : ''}${pendingImportCelebration ? ' is-library-import-pending' : ''}${importCelebration ? ' is-library-import-celebration' : ''}${globalLibraryPresentation !== 'idle' ? ` is-global-library-${globalLibraryPresentation}` : ''}${globalLibrarySettingsRequest?.status === 'open' ? ' is-global-library-card-settings' : ''}`}
      style={
        {
          '--manager-atmosphere-duration': `${atmosphereDuration}s`,
          '--manager-corner-action-radius': `${managerCornerActionRadius(viewportWidth, viewportHeight)}px`,
          '--manager-card-width': `${cardDimensions.width}px`,
          '--manager-card-half-width': `${cardDimensions.width / 2}px`,
          '--manager-card-bottom': `${cardDimensions.bottom}px`,
          '--manager-card-active-height': `${cardDimensions.height * ACTIVE_CARD_SCALE + ACTIVE_CARD_RISE}px`,
        } as CSSProperties
      }
      onDragStart={(event) => event.preventDefault()}
      onPointerMove={(event) => {
        if (mode === 'targeting' || selectingPageElement) {
          updateAimPoint({ x: event.clientX, y: event.clientY });
        }
      }}
      onPointerDownCapture={(event) => {
        const point = { x: event.clientX, y: event.clientY };
        if (!capturePageTarget(point)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
      }}
      onClickCapture={(event) => {
        if (
          mode === 'targeting' &&
          event.detail > 0 &&
          chooseTargetActionAtPoint({
            x: event.clientX,
            y: event.clientY,
          })
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!consumePageTargetClick()) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="manager-stage-atmosphere">
        <div className="manager-shade" aria-hidden="true" />
        <div className="manager-stage-light" aria-hidden="true" />
        {!importContextPrompt && (
          <CardContextPrompt
            info={contextPrompt}
            mode={mode}
            preview={libraryActionFocus}
            audioMuted={audioMuted}
            onToggleAudio={toggleAudio}
          />
        )}
      </div>
      {importContextPrompt && (
        <CardContextPrompt
          info={importContextPrompt}
          mode={mode}
          preview={false}
          importPresentation
          audioMuted={audioMuted}
          onToggleAudio={toggleAudio}
        />
      )}
      <GamepadInspection
        visible={gamepadInspectionVisible}
        active={gamepadInspectionActive}
        onExit={cancelTargeting}
      />
      <AimOverlay
        controller={aimVisual}
        mode={mode}
        pageElementInteraction={pageElementInteraction}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
      />
      <ElementTargetingHint
        visible={elementTargetingAction !== null}
        cardId={selectedId}
        action={elementTargetingAction}
        centralActionCount={centralActionCount}
        viewportWidth={viewportWidth}
        actionRoot={actionRoot}
        actionFrameUrl={ACTION_FRAME_URL}
      />
      <button
        type="button"
        className="manager-dismiss-layer"
        data-audio-managed="true"
        tabIndex={-1}
        aria-label={
          mode === 'targeting'
            ? '取消卡牌施法'
            : selectingPageElement
              ? '选择页面元素'
              : '收起脚本牌阵'
        }
        onClick={
          mode === 'targeting'
            ? cancelTargeting
            : selectingPageElement
              ? undefined
              : () => collectCardSpread('dismiss-layer')
        }
      />
      <ManagerActionField
        scene={actionScene}
        preview={actionPreview}
        mode={mode}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
        hoveredAction={emphasizedActionId}
        cancelAction={CANCEL_ACTION}
        actionFrameUrl={ACTION_FRAME_URL}
        cornerActionsLabel="脚本管理操作"
        actionPlacement={actionPlacement}
        cornerPositionForAction={cornerPositionForAction}
        onHoverAction={(actionId) =>
          dispatchManager({ type: 'hoverAction', actionId })
        }
        onChooseAction={(actionId) => {
          if (actionId === CANCEL_ACTION_ID) cancelTargeting();
          else chooseTargetAction(actionId);
        }}
      />

      <ActionAttachment action={attachedAction} cardId={selectedId} />

      <CardSpread
        renderedItems={renderedItems}
        visibleItems={visibleItems}
        managerState={managerState}
        actionSlots={actionSlots}
        selectedId={selectedId}
        selectedIndex={selectedIndex}
        focusedIndex={focusedIndex}
        emphasizedActionId={emphasizedActionId}
        castingAction={castingAction}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
        motionCardCount={motionCardCount}
        retreated={globalLibraryPresentation === 'retreated'}
        dealActive={dealActive}
        dealCycle={dealCycle}
        collectCycle={collectCycle}
        arrivingId={arrivingId}
        deckTriggerElement={deckTriggerElement}
        suppressedCardIds={pendingImportCardIds}
        interactionId={interactionId}
        executionUnavailable={
          executionCapability !== null &&
          executionCapability?.status !== 'available'
        }
        onFocus={setFocusedIndex}
        onDealReady={handleDealReady}
        onDealComplete={handleDealComplete}
        onCollectAll={handleCollectAll}
        onArrivalComplete={completeArrival}
        onReturnComplete={completeCardReturn}
        onInteractionClaim={claimInteraction}
        onInteractionRelease={releaseInteraction}
        onDragStart={beginReorder}
        onActionStart={beginReorderAction}
        onActionCancel={cancelReorderAction}
        onActivate={activateTargeting}
        onReorderPoint={reorderItem}
        onReorderRelease={releaseReorder}
        onDragPoint={dragPoint}
        onRelease={releaseCard}
      />

      {activeDetail && (
        <DetailStage
          selected={activeDetail.selected}
          detailMode={activeDetail.detailMode}
          centered={activeDetail.returnMode === 'closed'}
          closing={detailClosing}
          onRequestClose={closeDetail}
          onCloseComplete={completeDetailCloseAndClearRequest}
          manageBoardProps={{
            executionCapability,
            coverController: host.coverController,
            onSave: saveManagement,
            onCheckUpdate: checkScriptUpdate,
            onInstallUpdate: installScriptUpdate,
            onExport: exportScriptSource,
            onOpenAiSettings: () => host.openAssistantPanel('settings'),
            onClose: closeDetail,
          }}
          settingsBoardProps={{
            repository: host.repository,
            userscriptSettings: host.userscriptSettings,
            dataManagement: host.dataManagement,
            deckEntry: host.deckEntry,
            deckEntrySettings: resolvedDeckEntrySettings,
            onDeckEntrySettingsChange: updateDeckEntrySettings,
            reportError: host.reportError,
            onImportPrepare: requestImportCelebration,
            onImportCancel: cancelImportCelebration,
            onClose: closeDetail,
          }}
          contentBlockingBoardProps={
            host.contentBlocking
              ? {
                  controller: host.contentBlocking,
                  onSnapshot: setContentBlockingSnapshot,
                  onClose: closeDetail,
                }
              : undefined
          }
          pageThemeBoardProps={
            host.pageTheme
              ? {
                  controller: host.pageTheme,
                  onSnapshot: setPageThemeSnapshot,
                  onClose: closeDetail,
                }
              : undefined
          }
          mediaSpeedBoardProps={
            host.mediaSpeed
              ? {
                  controller: host.mediaSpeed,
                  onSnapshot: setMediaSpeedSnapshot,
                  onClose: closeDetail,
                }
              : undefined
          }
          bilibiliCapabilityBoardProps={
            host.bilibiliCapabilities
              ? {
                  controller: host.bilibiliCapabilities,
                  onSnapshots: setBilibiliCapabilitySnapshots,
                  onClose: closeDetail,
                }
              : undefined
          }
          gamepadSettingsDialogProps={{
            controller: host.gamepadControl,
          }}
        />
      )}

      {creationPreview && (
        <CardCreationPreview
          key={creationPreview.requestId}
          requestId={creationPreview.requestId}
          {...(creationPreview.card ? { card: creationPreview.card } : {})}
          deckTriggerElement={deckTriggerElement}
          audio={audio}
          onComplete={completeCreationPreview}
        />
      )}

      {importCelebration && (
        <LibraryImportCelebration
          key={importCelebration.requestId}
          requestId={importCelebration.requestId}
          items={importCelebration.items}
          deckTriggerElement={deckTriggerElement}
          audio={audio}
          onActiveItemChange={setActiveImportCelebrationItem}
          onComplete={completeImportCelebration}
        />
      )}

      <DeckTrigger
        mode={mode}
        visibleCount={visibleCardCount}
        activeCount={activeCardCount}
        showDeckTriggerBadge={resolvedDeckEntrySettings.showDeckTriggerBadge}
        ready={libraryReady}
        hidden={
          importPresentationActive
            ? false
            : deckTriggerHidden(deckEntrySettings)
        }
        receiving={importPresentationActive}
        position={resolvedDeckEntrySettings.position}
        speedWheelVisible={
          !importPresentationActive &&
          Boolean(
            mediaSpeedSnapshot && mediaSpeedWheelVisible(mediaSpeedSnapshot),
          )
        }
        speedSelection={
          mediaSpeedSnapshot?.selection ?? { mode: 'standard', speed: 1 }
        }
        speedWheelItems={
          mediaSpeedSnapshot?.wheelItems ?? DEFAULT_MEDIA_SPEED_WHEEL_ITEMS
        }
        mediaResourcesCount={mediaResourcesSnapshot?.resources.length ?? 0}
        showMediaResourcesTrigger={
          mediaResourcesSnapshot?.showPageTrigger ?? true
        }
        showMediaResourcesBadge={
          mediaResourcesSnapshot?.showResourceCountBadge ?? true
        }
        triggerRef={setDeckTriggerElement}
        onHover={(positionX) => {
          if (mode !== 'closed') return;
          void audio.prepare(CARD_SPREAD_INTERACTION_CUES);
          audio.play('deckHover', { positionX });
        }}
        onLeave={() => undefined}
        onPositionChange={previewDeckEntryPosition}
        onPositionCommit={(position) => {
          void commitDeckEntryPosition(position);
        }}
        onSpeedSelection={selectMediaSpeed}
        onOpenMediaResources={toggleMediaResourcesPopup}
        mediaResourcesPopup={
          mediaResourcesPopupOpen &&
          host.mediaResources &&
          mediaResourcesSnapshot ? (
            <CatCatchPopup
              onClose={closeMediaResourcesPopup}
              tabId={catCatchPopupPageTabId([
                ...mediaResourcesSnapshot.resources,
                ...mediaResourcesSnapshot.pages,
              ])}
            />
          ) : undefined
        }
        onActivate={() => {
          if (modeRef.current === 'closed') {
            setRequestedVisibility('open');
            return;
          }
          requestDeckVisibility('closed');
        }}
      />
    </main>
  );
}
