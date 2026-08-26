import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react';

import type { useAudioDirector } from '../../audio/AudioDirectorProvider';
import type { BilibiliCapabilitySnapshot } from '../../bilibili-capabilities/domain/types';
import type {
  ContentBlockingElementSession,
  ContentBlockingSnapshot,
} from '../../content-blocking/domain/types';
import { createElementHidingRule } from '../../content-blocking/infrastructure/element-hiding-rule';
import { type BurnAnimator, makeBurnAnimator } from '../../lib/burn-effect';
import type { MediaResourcesSnapshot } from '../../media-resources/domain/types';
import type { MediaSpeedSnapshot } from '../../media-speed/domain/types';
import { gsap } from '../../motion/gsap';
import type { PageThemeSnapshot } from '../../page-theme/domain/types';
import type { InstalledUserscript } from '../../userscript/domain/types';
import { resolveManagerPointerAction } from '../manager-interaction/action-hit-testing';
import { waitForCardLockTransition } from '../manager-interaction/card-lock-transition';
import {
  type ActionHitSample,
  cardAvoidanceRegionContains,
  oppositeHalfViewportCenter,
  type Point,
} from '../manager-interaction/layout';
import type { ManagerEvent, ManagerState } from '../manager-interaction/state';
import type { AimVisualController } from './AimOverlay';
import {
  chargeCommand,
  chargeShadowCommand,
  finishUpdateAction,
  releaseShadowCommand,
  waitForSceneCommit,
} from './action-animations';
import { actionsFor, CANCEL_ACTION_ID, type ManagerAction } from './actions';
import { mountCardRemovalEffect } from './card-removal-effect';
import {
  type DeckCard,
  isBilibiliCapabilityCard,
  isContentBlockingCard,
  isGamepadControlCard,
  isInstalledUserscript,
  isMediaResourcesCard,
  isMediaSpeedCard,
  isNewTabCard,
  isPageThemeCard,
} from './cards';
import { type CastOperationTiming, runCastOperation } from './cast-operation';
import type { UserscriptDetailMode } from './detail-mode';
import {
  playElementBlockingImpactEffect,
  prepareElementBlockingImpactEffect,
} from './element-blocking-impact-effect';
import {
  type PageElementHideLease,
  type PageElementTarget,
  type PageTargetCardHome,
  pageElementPressDisposition,
  pageElementTarget,
  pageElementTargetAt,
  removePageElement,
} from './element-targeting';
import type { UserscriptDeckHost } from './host';
import { cardSnapshot } from './ManagerCard';

type TargetingCard = {
  item: DeckCard;
  element: HTMLElement;
};

type AudioDirector = ReturnType<typeof useAudioDirector>;

function interactionFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/storage already initialized/i.test(message)) {
    return '内容拦截引擎检测到重复的存储初始化，当前操作没有生效。扩展将继续复用已有存储状态，请重新尝试。';
  }
  return message;
}

export function useCardActionController({
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
  openSiteScriptSearch,
  openMediaResourcesPopup,
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
}: {
  host: Pick<
    UserscriptDeckHost,
    | 'contentBlocking'
    | 'pageTheme'
    | 'mediaSpeed'
    | 'mediaResources'
    | 'bilibiliCapabilities'
    | 'gamepadControl'
    | 'runtime'
    | 'runtimeContext'
    | 'openAssistantPanel'
    | 'openNewTab'
    | 'openNewTabSettings'
    | 'reportError'
  >;
  aimVisual: AimVisualController;
  audio: AudioDirector;
  managerState: ManagerState<UserscriptDetailMode>;
  dispatchManager: Dispatch<ManagerEvent<UserscriptDetailMode>>;
  visibleItems: readonly DeckCard[];
  viewportWidth: number;
  viewportHeight: number;
  actionRoot: ParentNode;
  deckTriggerElement: HTMLElement | null;
  openGlobalLibrary: () => Promise<void>;
  openSiteScriptSearch: () => Promise<void>;
  openMediaResourcesPopup: () => void;
  setFocusedIndex: Dispatch<SetStateAction<number | null>>;
  setCollectCycle: Dispatch<SetStateAction<number>>;
  releaseInteraction: (id: string) => void;
  contentBlockingSnapshot: ContentBlockingSnapshot | null;
  setContentBlockingSnapshot: Dispatch<
    SetStateAction<ContentBlockingSnapshot | null>
  >;
  setPageThemeSnapshot: Dispatch<SetStateAction<PageThemeSnapshot | null>>;
  setMediaSpeedSnapshot: Dispatch<SetStateAction<MediaSpeedSnapshot | null>>;
  setMediaResourcesSnapshot: Dispatch<
    SetStateAction<MediaResourcesSnapshot | null>
  >;
  setBilibiliCapabilitySnapshots: Dispatch<
    SetStateAction<readonly BilibiliCapabilitySnapshot[]>
  >;
  commitScript: (script: InstalledUserscript) => void;
  removeScript: (scriptId: string) => void;
  returnToCardSpread: () => void;
  collectCardSpreadAfterAction: () => void;
  restoreReorderSession: (cardId: string) => void;
  returnCardToSpread: (cardId: string) => void;
  setInteractionError: Dispatch<SetStateAction<string | null>>;
}) {
  const {
    contentBlocking,
    pageTheme,
    mediaSpeed,
    mediaResources,
    bilibiliCapabilities,
    runtime,
    runtimeContext,
    reportError,
  } = host;
  const {
    setOrigin: setAimOrigin,
    setPoint: setAimPoint,
    setTarget: setAimTarget,
  } = aimVisual;
  const managerStateRef = useRef(managerState);
  managerStateRef.current = managerState;
  const targetingCardRef = useRef<TargetingCard | null>(null);
  const aimFrameRef = useRef(0);
  const pendingAimPointRef = useRef<Point | null>(null);
  const actionTargetRef = useRef<string | null>(null);
  const pageTargetRef = useRef<PageElementTarget | null>(null);
  const pageTargetCardHomeRef = useRef<PageTargetCardHome | null>(null);
  const pageTargetCardEvadingRef = useRef(false);
  const suppressPageTargetClickRef = useRef(false);
  const burnAnimatorRef = useRef<BurnAnimator | null>(null);
  const burnEffectRef = useRef<HTMLCanvasElement | null>(null);
  const immediateElementHidesRef = useRef(
    new Map<string, PageElementHideLease>(),
  );
  const pageElementBlockingSessionRef =
    useRef<ContentBlockingElementSession | null>(null);
  const pageTargetOperationRef = useRef(0);
  const previousUserRuleCountRef = useRef(
    contentBlockingSnapshot?.userRuleCount ?? 0,
  );
  const mode = managerState.mode;
  const selectingPageElement = mode === 'element-targeting';
  const resolvingPageElement =
    mode === 'resolving' && pageTargetRef.current?.resolving === true;
  const pageElementInteraction = selectingPageElement || resolvingPageElement;
  const pageElementActionId =
    managerState.mode === 'element-targeting'
      ? managerState.actionId
      : managerState.mode === 'resolving' && resolvingPageElement
        ? managerState.actionId
        : null;

  const clearPageTarget = useCallback(() => {
    pageTargetRef.current = null;
    setAimTarget(null);
  }, [setAimTarget]);

  const clearImmediateElementHides = useCallback(() => {
    for (const lease of immediateElementHidesRef.current.values()) {
      lease.release();
    }
    immediateElementHidesRef.current.clear();
  }, []);

  const cancelTargeting = useCallback(() => {
    pageTargetOperationRef.current += 1;
    const targeting = targetingCardRef.current;
    const state = managerStateRef.current;
    const cardId =
      targeting?.item.id ?? ('cardId' in state ? state.cardId : null);
    if (targeting) {
      audio.play('actionCancel', { positionX: window.innerWidth / 2 });
    }
    targetingCardRef.current = null;
    pendingAimPointRef.current = null;
    actionTargetRef.current = null;
    suppressPageTargetClickRef.current = false;
    pageElementBlockingSessionRef.current = null;
    window.cancelAnimationFrame(aimFrameRef.current);
    aimFrameRef.current = 0;
    setAimOrigin(null);
    setAimPoint(null);
    clearPageTarget();
    pageTargetCardHomeRef.current = null;
    pageTargetCardEvadingRef.current = false;
    if (cardId) returnCardToSpread(cardId);
  }, [audio, clearPageTarget, returnCardToSpread, setAimOrigin, setAimPoint]);

  const activateTargeting = useCallback(
    (item: DeckCard, element: HTMLElement, point: Point) => {
      setInteractionError(null);
      const bounds = element.getBoundingClientRect();
      targetingCardRef.current = { item, element };
      actionTargetRef.current = null;
      pendingAimPointRef.current = point;
      setAimOrigin({
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      });
      setAimPoint(point);
      setFocusedIndex(
        visibleItems.findIndex((candidate) => candidate.id === item.id),
      );
      dispatchManager({ type: 'target', cardId: item.id });
    },
    [
      dispatchManager,
      setAimOrigin,
      setAimPoint,
      setFocusedIndex,
      setInteractionError,
      visibleItems,
    ],
  );

  const updateElementTargetCardAvoidance = (point: Point) => {
    const targeting = targetingCardRef.current;
    const home = pageTargetCardHomeRef.current;
    if (!targeting || !home) return;
    const evading = pageTargetCardEvadingRef.current;
    const shouldEvade = cardAvoidanceRegionContains(
      point,
      home.bounds,
      evading,
    );
    if (shouldEvade === evading) return;
    pageTargetCardEvadingRef.current = shouldEvade;

    const card = targeting.element;
    const currentBounds = card.getBoundingClientRect();
    const destination = oppositeHalfViewportCenter(
      {
        x: home.bounds.left + home.bounds.width / 2,
        y: home.bounds.top + home.bounds.height / 2,
      },
      { width: viewportWidth, height: viewportHeight },
    );
    const currentX = Number(gsap.getProperty(card, 'x'));
    const currentY = Number(gsap.getProperty(card, 'y'));
    const targetX = shouldEvade
      ? currentX +
        destination.x -
        (currentBounds.left + currentBounds.width / 2)
      : home.x;
    const targetY = shouldEvade
      ? currentY +
        destination.y -
        (currentBounds.top + currentBounds.height / 2)
      : home.y;

    gsap.to(card, {
      x: targetX,
      y: targetY,
      rotation: shouldEvade
        ? destination.x > currentBounds.left + currentBounds.width / 2
          ? 2.6
          : -2.6
        : home.rotation,
      scale: home.scale,
      duration: shouldEvade ? 0.48 : 0.56,
      ease: shouldEvade ? 'power3.inOut' : 'back.out(1.28)',
      overwrite: 'auto',
      onUpdate: () => {
        const bounds = card.getBoundingClientRect();
        aimVisual.setOrigin({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        });
      },
    });
  };

  const resolveTargetAction = (point: Point) => {
    const actionId = resolveManagerPointerAction(point, {
      root: actionRoot,
      previousActionId: actionTargetRef.current,
    });
    actionTargetRef.current = actionId;
    return actionId;
  };

  const updateAimPoint = (point: Point) => {
    pendingAimPointRef.current = point;
    if (aimFrameRef.current) return;
    aimFrameRef.current = window.requestAnimationFrame(() => {
      aimFrameRef.current = 0;
      const nextPoint = pendingAimPointRef.current;
      if (!nextPoint || !targetingCardRef.current) return;
      if (selectingPageElement) {
        updateElementTargetCardAvoidance(nextPoint);
        const element = pageElementTargetAt(nextPoint, actionRoot);
        const previous = pageTargetRef.current;
        if (element) {
          if (previous?.element === element) {
            aimVisual.setPoint(nextPoint);
            return;
          }
          const nextTarget = pageElementTarget(element);
          pageTargetRef.current = nextTarget;
          aimVisual.setTarget(nextTarget);
          aimVisual.setPoint(nextPoint);
          if (previous?.element !== element) {
            audio.play('actionAttach', { positionX: nextPoint.x });
          }
        } else {
          aimVisual.setPoint(nextPoint);
          if (previous) {
            audio.play('actionDetach', { positionX: nextPoint.x });
          }
          clearPageTarget();
        }
        return;
      }
      aimVisual.setPoint(nextPoint);
      dispatchManager({
        type: 'hoverAction',
        actionId: resolveTargetAction(nextPoint),
      });
    });
  };

  const dragPoint = (_sample: ActionHitSample, actionId: string | null) => {
    dispatchManager({
      type: 'hoverAction',
      actionId,
    });
  };

  const beginPageElementTargeting = (
    item: DeckCard,
    element: HTMLElement,
    action: ManagerAction,
  ) => {
    pageTargetOperationRef.current += 1;
    pageElementBlockingSessionRef.current =
      action.kind === 'block'
        ? {
            sessionId: crypto.randomUUID(),
            startedAt: performance.timeOrigin + performance.now(),
          }
        : null;
    const bounds = element.getBoundingClientRect();
    targetingCardRef.current = { item, element };
    pageTargetCardHomeRef.current = {
      bounds: {
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      },
      x: Number(gsap.getProperty(element, 'x')),
      y: Number(gsap.getProperty(element, 'y')),
      rotation: Number(gsap.getProperty(element, 'rotation')),
      scale: Number(gsap.getProperty(element, 'scale')),
    };
    pageTargetCardEvadingRef.current = false;
    suppressPageTargetClickRef.current = false;
    clearPageTarget();
    aimVisual.setOrigin({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });
    aimVisual.setPoint(
      pendingAimPointRef.current ?? {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      },
    );
    setFocusedIndex(null);
    audio.play('castCharge', {
      positionX: bounds.left + bounds.width / 2,
      gain: 0.56,
    });
    prepareElementBlockingImpactEffect();
    dispatchManager({
      type: 'targetElement',
      cardId: item.id,
      actionId: action.id,
    });
  };

  const runClosingCast = async (
    item: DeckCard,
    element: HTMLElement,
    action: ManagerAction,
    invoke: () => Promise<void>,
    {
      castStyle = 'radiant',
      operationTiming = 'after-charge',
    }: {
      castStyle?: 'radiant' | 'shadow';
      operationTiming?: CastOperationTiming;
    } = {},
  ) => {
    const deckBounds = deckTriggerElement?.getBoundingClientRect();
    audio.play('deckClose', {
      positionX: deckBounds
        ? deckBounds.left + deckBounds.width / 2
        : window.innerWidth,
    });
    dispatchManager({
      type: 'startCast',
      cardId: item.id,
      actionId: action.id,
    });
    setFocusedIndex(null);
    setCollectCycle((cycle) => cycle + 1);
    await waitForSceneCommit();
    const charge = async () => {
      try {
        audio.play('castCharge', { positionX: window.innerWidth / 2 });
        await (castStyle === 'shadow'
          ? chargeShadowCommand(element)
          : chargeCommand(element));
      } catch (error) {
        if (castStyle === 'shadow') releaseShadowCommand(element);
        reportError?.(
          'userscript-deck',
          'cast-charge-animation-failed',
          error,
          {
            actionId: action.id,
            cardId: item.id,
            managerMode: managerStateRef.current.mode,
          },
        );
      }
    };
    try {
      await runCastOperation(charge, invoke, operationTiming);
    } finally {
      if (castStyle === 'shadow') releaseShadowCommand(element);
    }
    audio.play('cast', { positionX: window.innerWidth / 2 });
    dispatchManager({ type: 'returnCast' });
  };

  const finishToggleAction = async (element: HTMLElement) => {
    await waitForCardLockTransition(element);
    returnToCardSpread();
  };

  const recoverFromInteractionError = (
    event: string,
    error: unknown,
    details: Readonly<Record<string, unknown>>,
  ) => {
    const state = managerStateRef.current;
    reportError?.('userscript-deck', event, error, {
      ...details,
      managerMode: state.mode,
    });
    setInteractionError(interactionFailureMessage(error));
    if (
      (state.mode === 'reordering' ||
        state.mode === 'dragging' ||
        state.mode === 'targeting' ||
        state.mode === 'element-targeting' ||
        state.mode === 'resolving' ||
        state.mode === 'detail') &&
      'cardId' in state
    ) {
      returnCardToSpread(state.cardId);
      return;
    }
    setFocusedIndex(null);
    dispatchManager({ type: 'recover' });
  };

  const resolveCardAction = (
    item: DeckCard,
    element: HTMLElement,
    actionId: string,
  ) => {
    const action = actionsFor(item).find(
      (candidate) => candidate.id === actionId,
    );
    if (!action) return false;
    dispatchManager({
      type: 'resolve',
      cardId: item.id,
      actionId: action.id,
    });
    void (async () => {
      if (item.kind === 'steward') {
        audio.play('panelOpen', { positionX: window.innerWidth / 2 });
        if (action.kind === 'library') {
          await openGlobalLibrary();
          return;
        }
        if (action.kind === 'site-search') {
          await openSiteScriptSearch();
          returnToCardSpread();
          return;
        }
        if (action.kind === 'assistant') {
          collectCardSpreadAfterAction();
          await host.openAssistantPanel();
          return;
        }
        if (action.kind !== 'manage') {
          throw new Error(`卡牌大师智能体不支持操作：${action.kind}`);
        }
        dispatchManager({
          type: 'openDetail',
          cardId: item.id,
          detail: 'global-settings',
        });
        return;
      }

      if (isNewTabCard(item)) {
        if (action.kind === 'open-new-tab') {
          audio.play('cast', { positionX: window.innerWidth / 2 });
          await host.openNewTab();
          returnToCardSpread();
          return;
        }
        if (action.kind === 'manage') {
          audio.play('panelOpen', { positionX: window.innerWidth / 2 });
          await host.openNewTabSettings();
          returnToCardSpread();
          return;
        }
        throw new Error(`新标签页不支持操作：${action.kind}`);
      }

      if (isGamepadControlCard(item)) {
        if (action.kind === 'manage') {
          audio.play('panelOpen', { positionX: window.innerWidth / 2 });
          dispatchManager({
            type: 'openDetail',
            cardId: item.id,
            detail: 'gamepad-settings',
          });
          return;
        }
        if (action.kind === 'toggle') {
          audio.play('toggle', { positionX: window.innerWidth / 2 });
          const settings = await host.gamepadControl.readSettings();
          await host.gamepadControl.saveSettings({
            ...settings,
            enabled: !item.enabled,
          });
          await finishToggleAction(element);
          return;
        }
        throw new Error(`手柄控制不支持操作：${action.kind}`);
      }

      if (isContentBlockingCard(item)) {
        if (!contentBlocking) {
          throw new Error('当前宿主没有提供原生内容拦截能力。');
        }
        if (action.kind === 'manage') {
          audio.play('panelOpen', { positionX: window.innerWidth / 2 });
          dispatchManager({
            type: 'openDetail',
            cardId: item.id,
            detail: 'content-blocking-settings',
          });
          return;
        }
        if (action.kind === 'toggle') {
          audio.play('toggle', { positionX: window.innerWidth / 2 });
          const snapshot = await contentBlocking.setRulesEnabled(
            !item.snapshot.rulesEnabled,
          );
          setContentBlockingSnapshot(snapshot);
          await finishToggleAction(element);
          return;
        }
        if (action.kind === 'site-toggle') {
          if (!item.site.hostname) {
            throw new Error('当前页面没有可配置的站点域名。');
          }
          await runClosingCast(item, element, action, async () => {
            const settings = await contentBlocking.setCurrentSiteFiltering(
              runtimeContext.url,
              !item.site.filteringEnabled,
            );
            setContentBlockingSnapshot(settings.snapshot);
          });
          return;
        }
        if (action.kind === 'undo-block') {
          const batch = item.snapshot.lastElementBlockingBatch;
          if (!batch || batch.hostname !== item.site.hostname) {
            throw new Error('当前站点没有可恢复的元素拦截批次。');
          }
          await runClosingCast(item, element, action, async () => {
            setContentBlockingSnapshot(
              await contentBlocking.undoLastElementBlockingBatch(),
            );
          });
          return;
        }
        return;
      }

      if (isPageThemeCard(item)) {
        if (!pageTheme) {
          throw new Error('当前宿主没有提供页面光影能力。');
        }
        if (action.kind === 'manage' || action.kind === 'theme-tune') {
          audio.play('panelOpen', { positionX: window.innerWidth / 2 });
          dispatchManager({
            type: 'openDetail',
            cardId: item.id,
            detail:
              action.kind === 'theme-tune'
                ? 'page-theme-site'
                : 'page-theme-settings',
          });
          return;
        }
        if (action.kind === 'theme-site-toggle') {
          await runClosingCast(
            item,
            element,
            action,
            async () => {
              setPageThemeSnapshot(await pageTheme.toggleCurrentSite());
            },
            {
              castStyle: item.snapshot.activeOnPage ? 'radiant' : 'shadow',
              operationTiming: 'during-charge',
            },
          );
          return;
        }
        if (action.kind === 'toggle') {
          audio.play('toggle', { positionX: window.innerWidth / 2 });
          setPageThemeSnapshot(
            await pageTheme.setEnabled(!item.snapshot.enabled),
          );
          await finishToggleAction(element);
          return;
        }
        return;
      }

      if (isMediaSpeedCard(item)) {
        if (!mediaSpeed) {
          throw new Error('当前宿主没有提供媒体倍速能力。');
        }
        if (action.kind === 'manage') {
          audio.play('panelOpen', { positionX: window.innerWidth / 2 });
          dispatchManager({
            type: 'openDetail',
            cardId: item.id,
            detail: 'media-speed-settings',
          });
          return;
        }
        if (action.kind === 'toggle') {
          audio.play('toggle', { positionX: window.innerWidth / 2 });
          setMediaSpeedSnapshot(
            await mediaSpeed.setEnabled(!item.snapshot.enabled),
          );
          await finishToggleAction(element);
          return;
        }
        if (action.kind === 'speed-select') {
          const speed = action.speed;
          if (!speed) throw new Error('倍速档位缺少速度值。');
          await runClosingCast(item, element, action, async () => {
            setMediaSpeedSnapshot(
              await mediaSpeed.setSelection({
                mode: 'standard',
                speed,
              }),
            );
          });
          return;
        }
        return;
      }

      if (isMediaResourcesCard(item)) {
        if (!mediaResources) {
          throw new Error('当前宿主没有提供媒体资源发现能力。');
        }
        if (action.kind === 'manage') {
          audio.play('panelOpen', { positionX: window.innerWidth / 2 });
          await mediaResources.openSettings();
          returnToCardSpread();
          return;
        }
        if (action.kind === 'toggle') {
          audio.play('toggle', { positionX: window.innerWidth / 2 });
          setMediaResourcesSnapshot(
            await mediaResources.setEnabled(!item.snapshot.enabled),
          );
          await finishToggleAction(element);
          return;
        }
        if (action.kind === 'media-resources-collect') {
          await runClosingCast(item, element, action, async () => {
            openMediaResourcesPopup();
          });
          return;
        }
        return;
      }

      if (isBilibiliCapabilityCard(item)) {
        if (!bilibiliCapabilities) {
          throw new Error('当前宿主没有提供 B 站增强能力。');
        }
        if (action.kind === 'manage') {
          audio.play('panelOpen', { positionX: window.innerWidth / 2 });
          dispatchManager({
            type: 'openDetail',
            cardId: item.id,
            detail: 'bilibili-capability-settings',
          });
          return;
        }
        if (action.kind === 'toggle') {
          audio.play('toggle', { positionX: window.innerWidth / 2 });
          setBilibiliCapabilitySnapshots(
            await bilibiliCapabilities.setEnabled(
              item.capabilityId,
              !item.snapshot.enabled,
            ),
          );
          await finishToggleAction(element);
          return;
        }
        if (action.kind === 'capability-command') {
          const command = action.command;
          if (!command) {
            throw new Error('B 站能力指令缺少命令身份。');
          }
          await runClosingCast(item, element, action, async () => {
            setBilibiliCapabilitySnapshots(
              await bilibiliCapabilities.execute(item.capabilityId, command),
            );
          });
          return;
        }
        return;
      }

      if (!isInstalledUserscript(item)) return;
      if (action.kind === 'manage') {
        audio.play('panelOpen', { positionX: window.innerWidth / 2 });
        dispatchManager({
          type: 'openDetail',
          cardId: item.id,
          detail: 'manage',
        });
        return;
      }
      if (action.kind === 'remove') {
        audio.play('cardRemove', { positionX: window.innerWidth / 2 });
        const tilt = element.querySelector<HTMLElement>('.manager-card__tilt');
        gsap.killTweensOf(tilt ? [element, tilt] : element);
        if (tilt) gsap.set(tilt, { rotationX: 0, rotationY: 0 });
        const source = await cardSnapshot(element, item);
        const effectCanvas = document.createElement('canvas');
        effectCanvas.className = 'manager-card-removal-effect';
        effectCanvas.width = source.width;
        effectCanvas.height = source.height;
        effectCanvas.setAttribute('aria-hidden', 'true');
        const context = effectCanvas.getContext('2d', { alpha: true });
        context?.clearRect(0, 0, effectCanvas.width, effectCanvas.height);
        context?.drawImage(source, 0, 0);
        mountCardRemovalEffect(element, effectCanvas);
        gsap.set(element, { zIndex: 260 });
        element.classList.add('is-burning');
        burnAnimatorRef.current?.cancel();
        burnEffectRef.current?.remove();
        const animator = makeBurnAnimator(source, effectCanvas);
        burnAnimatorRef.current = animator;
        burnEffectRef.current = effectCanvas;
        audio.play('cardBurn', { positionX: window.innerWidth / 2 });
        const burnComplete = animator
          .start()
          .finally(() => effectCanvas.remove());
        burnAnimatorRef.current = null;
        burnEffectRef.current = null;
        removeScript(item.id);
        returnToCardSpread();
        await burnComplete;
        return;
      }
      if (action.kind === 'toggle') {
        audio.play('toggle', { positionX: window.innerWidth / 2 });
        const enabled = !item.manager.enabled;
        const updated = {
          ...item,
          manager: { ...item.manager, enabled },
        };
        commitScript({
          ...updated,
          runtime: runtime.synchronizeState(updated, runtimeContext),
        });
        await finishToggleAction(element);
        return;
      }
      if (action.kind === 'command') {
        const commandId = action.commandId;
        if (!commandId) {
          throw new Error(`Missing runtime command identity for ${action.id}`);
        }
        if (action.autoClose === false) {
          await runtime.invoke(item.id, commandId);
          audio.play('cast', { positionX: window.innerWidth / 2 });
          await finishUpdateAction(element);
          returnToCardSpread();
        }
        await runClosingCast(item, element, action, async () => {
          await runtime.invoke(item.id, commandId);
        });
      }
    })().catch((error) => {
      burnAnimatorRef.current?.cancel();
      burnAnimatorRef.current = null;
      burnEffectRef.current?.remove();
      burnEffectRef.current = null;
      element.classList.remove('is-burning', 'is-casting');
      recoverFromInteractionError('action-resolution-failed', error, {
        actionId,
        cardId: item.id,
      });
    });
    return true;
  };

  const releaseCard = (
    item: DeckCard,
    element: HTMLElement,
    sample: ActionHitSample,
    actionId: string | null,
  ) => {
    restoreReorderSession(item.id);
    if (!actionId || actionId === CANCEL_ACTION_ID) {
      if (actionId === CANCEL_ACTION_ID) {
        audio.play('actionCancel', { positionX: sample.pointer.x });
      }
      returnCardToSpread(item.id);
      return 'returning' as const;
    }
    const action = actionsFor(item).find(
      (candidate) => candidate.id === actionId,
    );
    if (action?.target === 'page-element') {
      beginPageElementTargeting(item, element, action);
      return 'accepted' as const;
    }
    if (resolveCardAction(item, element, actionId)) return 'accepted' as const;
    returnCardToSpread(item.id);
    return 'returning' as const;
  };

  const chooseTargetAction = (actionId: string) => {
    if (actionId === CANCEL_ACTION_ID) {
      cancelTargeting();
      return true;
    }
    const targeting = targetingCardRef.current;
    if (!targeting) return false;
    const action = actionsFor(targeting.item).find(
      (candidate) => candidate.id === actionId,
    );
    if (action?.target === 'page-element') {
      beginPageElementTargeting(targeting.item, targeting.element, action);
      return true;
    }
    const accepted = resolveCardAction(
      targeting.item,
      targeting.element,
      actionId,
    );
    if (!accepted) return false;
    releaseInteraction(targeting.item.id);
    targetingCardRef.current = null;
    actionTargetRef.current = null;
    pendingAimPointRef.current = null;
    window.cancelAnimationFrame(aimFrameRef.current);
    aimFrameRef.current = 0;
    aimVisual.setOrigin(null);
    aimVisual.setPoint(null);
    setFocusedIndex(null);
    return true;
  };

  const chooseTargetActionAtPoint = (point: Point) => {
    if (managerStateRef.current.mode !== 'targeting') return false;
    window.cancelAnimationFrame(aimFrameRef.current);
    aimFrameRef.current = 0;
    pendingAimPointRef.current = point;
    aimVisual.setPoint(point);
    const actionId = resolveTargetAction(point);
    dispatchManager({ type: 'hoverAction', actionId });
    if (!actionId) return false;
    return chooseTargetAction(actionId);
  };

  const resolvePageElementTarget = (point: Point) => {
    if (!selectingPageElement) return;
    const currentTargeting = targetingCardRef.current;
    const candidateElement = pageElementTargetAt(point, actionRoot);
    const currentAction =
      currentTargeting && pageElementActionId
        ? actionsFor(currentTargeting.item).find(
            (candidate) => candidate.id === pageElementActionId,
          )
        : null;
    const context =
      currentTargeting &&
      currentAction?.target === 'page-element' &&
      contentBlocking &&
      isContentBlockingCard(currentTargeting.item)
        ? {
            targeting: currentTargeting,
            action: currentAction,
            blocker: contentBlocking,
          }
        : null;
    const disposition = pageElementPressDisposition(candidateElement, context);
    if (disposition.kind === 'ignore') {
      clearPageTarget();
      return;
    }
    if (disposition.kind === 'cancel') {
      cancelTargeting();
      return;
    }
    const {
      element,
      context: { targeting, action, blocker },
    } = disposition;

    const target = pageElementTarget(element);
    const targetBounds = element.getBoundingClientRect();
    const targetCenterX = targetBounds.left + targetBounds.width / 2;
    const resolvingTarget = { ...target, resolving: true };
    const operationId = ++pageTargetOperationRef.current;
    const continuous = action.targetingMode === 'continuous';
    const blockingSession =
      action.kind === 'block' ? pageElementBlockingSessionRef.current : null;
    if (action.kind === 'block' && !blockingSession) {
      recoverFromInteractionError(
        'element-targeting-session-missing',
        new Error('永久拦截会话已经结束，请重新进入点选模式。'),
        {
          actionId: action.id,
          cardId: targeting.item.id,
        },
      );
      return;
    }
    const recoverOperation = (
      event: string,
      error: unknown,
      details: Readonly<Record<string, unknown>>,
    ) => {
      if (operationId === pageTargetOperationRef.current) {
        recoverFromInteractionError(event, error, details);
        return;
      }
      reportError?.('userscript-deck', event, error, {
        ...details,
        managerMode: managerStateRef.current.mode,
      });
    };
    const releaseOperation = () => {
      if (operationId !== pageTargetOperationRef.current) return;
      pendingAimPointRef.current = null;
      window.cancelAnimationFrame(aimFrameRef.current);
      aimFrameRef.current = 0;
      clearPageTarget();
      pageTargetCardHomeRef.current = null;
      pageTargetCardEvadingRef.current = false;
      targetingCardRef.current = null;
      pageElementBlockingSessionRef.current = null;
      releaseInteraction(targeting.item.id);
      aimVisual.setOrigin(null);
      aimVisual.setPoint(null);
    };
    pageTargetRef.current = resolvingTarget;
    aimVisual.setTarget(resolvingTarget);
    aimVisual.setPoint(point);
    const { kind: impactKind } = playElementBlockingImpactEffect(element);
    audio.play(
      impactKind === 'sword'
        ? 'contentBlockSwordImpact'
        : 'contentBlockEnergyImpact',
      {
        positionX: targetCenterX,
      },
    );
    dispatchManager({
      type: 'resolve',
      cardId: targeting.item.id,
      actionId: action.id,
    });
    if (continuous) {
      clearPageTarget();
      aimVisual.setPoint(point);
      dispatchManager({
        type: 'continueTargeting',
        cardId: targeting.item.id,
        actionId: action.id,
      });
    }

    void (async () => {
      const rule = createElementHidingRule(element, runtimeContext.url);
      audio.play('cast', {
        positionX: targetCenterX,
      });
      const immediateHide = await removePageElement(
        resolvingTarget,
        rule,
        runtimeContext.url,
        continuous,
      );
      if (action.kind === 'zap') {
        return;
      }
      immediateElementHidesRef.current.get(rule)?.release();
      immediateElementHidesRef.current.set(rule, immediateHide);
      let snapshot: ContentBlockingSnapshot;
      try {
        snapshot = await blocker.addUserRule(
          rule,
          blockingSession as ContentBlockingElementSession,
        );
      } catch (error) {
        if (immediateElementHidesRef.current.get(rule) === immediateHide) {
          immediateHide.release();
          immediateElementHidesRef.current.delete(rule);
        }
        throw error;
      }
      setContentBlockingSnapshot(snapshot);
      void blocker
        .waitForCosmeticRevision(snapshot.revision)
        .then((applied) => {
          if (!applied) return;
          const activeHide = immediateElementHidesRef.current.get(rule);
          if (
            activeHide !== immediateHide ||
            !immediateHide.releaseIfCovered()
          ) {
            return;
          }
          immediateElementHidesRef.current.delete(rule);
        });
      if (continuous) return;

      releaseOperation();
      await runClosingCast(
        targeting.item,
        targeting.element,
        action,
        async () => undefined,
      );
    })().catch((error) => {
      releaseOperation();
      recoverOperation('element-targeting-failed', error, {
        actionId: action.id,
        cardId: targeting.item.id,
      });
    });
  };

  const capturePageTarget = (point: Point) => {
    if (!selectingPageElement) return false;
    suppressPageTargetClickRef.current = true;
    resolvePageElementTarget(point);
    return true;
  };

  const consumePageTargetClick = () => {
    if (!selectingPageElement && !suppressPageTargetClickRef.current) {
      return false;
    }
    suppressPageTargetClickRef.current = false;
    return true;
  };

  useEffect(() => () => window.cancelAnimationFrame(aimFrameRef.current), []);
  useEffect(() => {
    const snapshot = contentBlockingSnapshot;
    if (!snapshot) return;
    const previousUserRuleCount = previousUserRuleCountRef.current;
    previousUserRuleCountRef.current = snapshot.userRuleCount;
    if (
      !snapshot.rulesEnabled ||
      snapshot.userRuleCount < previousUserRuleCount
    ) {
      clearImmediateElementHides();
    }
  }, [clearImmediateElementHides, contentBlockingSnapshot]);
  useEffect(
    () => () => {
      burnAnimatorRef.current?.cancel();
      burnEffectRef.current?.remove();
      aimVisual.clear();
      clearImmediateElementHides();
    },
    [aimVisual, clearImmediateElementHides],
  );

  return {
    selectingPageElement,
    resolvingPageElement,
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
  };
}
