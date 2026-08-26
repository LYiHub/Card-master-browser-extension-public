import { SpatialEngine } from 'spatial-nav-css/core';
import {
  DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
  DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
  DEFAULT_DECK_ENTRY_SETTINGS,
  type DeckEntrySettings,
  type DeckEntrySettingsResponse,
  isDeckEntrySettingsChangedMessage,
  normalizeDeckEntrySettings,
} from '../../features/userscript-deck/deck-entry';
import { DECK_ENTRY_LAYOUT } from '../../features/userscript-deck/deck-entry-layout';
import { pageElementTargetAt } from '../../features/userscript-deck/element-targeting';
import {
  applyControllerSnapshot,
  controllerArtworkPath,
  controllerProfile,
  createControllerSvg,
} from '../../gamepad-control/controller-artwork';
import { GamepadActionFeed } from '../../gamepad-control/domain/action-feed';
import {
  activeGamepadBindingActions,
  type GamepadBindingContext,
  gamepadButtonLabel,
  gamepadStickAxes,
} from '../../gamepad-control/domain/bindings';
import {
  applyGamepadCursorPosition,
  GAMEPAD_CURSOR_POSITION_STORAGE_KEY,
  isGamepadCursorPosition,
  viewportGamepadCursorPosition,
} from '../../gamepad-control/domain/cursor-position';
import {
  gamepadStickVectorWithCurve,
  moveGamepadCursor,
  type Point,
} from '../../gamepad-control/domain/input';
import {
  advanceGamepadMotion,
  type GamepadMotionVector,
  gamepadMotionActive,
} from '../../gamepad-control/domain/motion';
import {
  defaultGamepadControlSettings,
  type GamepadControlSettings,
  isGamepadControlSettings,
} from '../../gamepad-control/domain/settings';
import {
  gamepadPanelLayout,
  gamepadPanelPresentationReady,
} from '../../gamepad-control/panel-layout';
import type { PinyinDictionary } from '../../gamepad-control/pinyin';
import { GamepadIntentAdapter } from '../../input/gamepad-intent-adapter';
import type { IntentEnvelope, NavigationDirection } from '../../input/intents';
import { rewriteProjectAssetUrls } from '../../lib/project-assets';
import { mediaSpeedWheelVisible } from '../../media-speed/domain/types';
import {
  installExtensionContextBoundary,
  onExtensionContextInvalidated,
  registerExtensionListener,
} from './diagnostics';
import { createEditableTextComposition } from './editable-text';
import { EXTENSION_CHANNEL } from './extension-channel';
import { ExtensionSpeechRecognitionClient } from './extension-speech-recognition-client';
import {
  activateGamepadVirtualPointer,
  gamepadOwnerAllowsCommands,
  publishGamepadControlState,
  publishGamepadVirtualPointer,
  readGamepadControlOwner,
  readGamepadSnapshot,
  requestGamepadDeckToggle,
  subscribeGamepadBrowserTabSwitch,
  subscribeGamepadControlOwner,
  subscribeGamepadEasterEgg,
  subscribeGamepadSnapshot,
} from './gamepad-bridge';
import type {
  GamepadBrowserCommand,
  GamepadBrowserCommandResult,
} from './gamepad-browser-command';
import styles from './gamepad-control-content.css?inline';
import { GamepadEasterEggVisual } from './gamepad-easter-egg';
import {
  type GamepadExtensionApi,
  sendGamepadExtensionMessage,
} from './gamepad-extension-client';
import {
  activateGamepadPageTarget as activatePageTargetByMode,
  reconcileGamepadPageLifecycle,
} from './gamepad-page-runtime';
import { GamepadPointerVisual } from './gamepad-pointer-visual';
import {
  GamepadPushToTalkController,
  type GamepadPushToTalkViewState,
} from './gamepad-push-to-talk';
import {
  GAMEPAD_CONTROL_FOCUS_STYLE_ID,
  GAMEPAD_CONTROL_HOST_ID,
  isCurrentGamepadControlHost,
  removeStaleGamepadControlArtifacts,
} from './gamepad-runtime-ownership';
import {
  type GamepadKeyboardShortcuts,
  GamepadScreenKeyboard,
} from './gamepad-screen-keyboard';
import { scrollPageByGamepadDelta } from './gamepad-scroll';
import { mountGamepadSnapshotSource } from './gamepad-snapshot-runtime';
import {
  MEDIA_SPEED_SNAPSHOT_EVENT,
  readMediaSpeedSnapshot,
} from './media-speed-protocol';
import { createExtensionSpeechCapture } from './offscreen-speech-capture';
import {
  extensionSpeechCapability,
  extensionSpeechServiceConfigured,
} from './speech-capability';

type GamepadControlRuntime = {
  dispose(): void;
};

const FOCUS_CLASS = 'card-master-gamepad-focused';
const POINTER_EVENT_INTERVAL_MS = 34;
const CURSOR_LOCATOR_IDLE_MS = 4_500;
const PANEL_WIDTH = 154;
const PANEL_HEIGHT = 112;
const PANEL_MARGIN = 10;
const PANEL_POSITION_SETTLE_MS = 96;
const PINYIN_DICTIONARY_PATH =
  'vendor/pinyin-ime/google-pinyin-dictionary.json';
const GAMEPAD_EASTER_EGG_PATH =
  'userscript-deck/visual/gamepad/lin-ge-has-strength.webp';

let pinyinDictionaryPromise: Promise<PinyinDictionary> | null = null;

const PAGE_FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not(:disabled):not([tabindex="-1"])',
  'input:not(:disabled):not([type="hidden"]):not([tabindex="-1"])',
  'select:not(:disabled):not([tabindex="-1"])',
  'textarea:not(:disabled):not([tabindex="-1"])',
  'summary',
  'label[for]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="option"]',
  '[contenteditable="true"]',
  '[onclick]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function extensionCursorStore() {
  const runtime =
    (
      globalThis as typeof globalThis & {
        browser?: typeof chrome;
        chrome?: typeof chrome;
      }
    ).browser ??
    (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
  return runtime?.storage?.session ?? null;
}

function pointerEvent(
  type: string,
  point: Point,
  relatedTarget: EventTarget | null = null,
) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: point.x,
    clientY: point.y,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    relatedTarget,
  });
}

function mouseEvent(
  type: string,
  point: Point,
  relatedTarget: EventTarget | null = null,
) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: point.x,
    clientY: point.y,
    relatedTarget,
  });
}

function loadPinyinDictionary(api: GamepadExtensionApi) {
  if (pinyinDictionaryPromise) return pinyinDictionaryPromise;
  pinyinDictionaryPromise = fetch(api.runtime.getURL(PINYIN_DICTIONARY_PATH))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `拼音词库载入失败：${response.status} ${response.statusText}`,
        );
      }
      const dictionary: unknown = await response.json();
      if (
        !dictionary ||
        typeof dictionary !== 'object' ||
        Array.isArray(dictionary)
      ) {
        throw new Error('拼音词库格式无效。');
      }
      return dictionary as PinyinDictionary;
    })
    .catch((failure) => {
      pinyinDictionaryPromise = null;
      throw failure;
    });
  return pinyinDictionaryPromise;
}

function mountGamepadControl(api: GamepadExtensionApi): GamepadControlRuntime {
  const removeContextBoundary = installExtensionContextBoundary();
  removeStaleGamepadControlArtifacts(document);
  const speechCapability = extensionSpeechCapability();
  const runtimeSettings = (settings: GamepadControlSettings) =>
    speechCapability.available
      ? settings
      : {
          ...settings,
          bindings: {
            ...settings.bindings,
            buttons: {
              ...settings.bindings.buttons,
              pushToTalk: null,
            },
          },
        };
  const disposers: Array<() => void> = [];
  let runtime: GamepadControlRuntime | null = null;
  let disposed = false;
  let connected = false;
  let owner = readGamepadControlOwner();
  let snapshot = readGamepadSnapshot();
  let frame = 0;
  let lastFrameAt = performance.now();
  let lastPointerEventAt = Number.NEGATIVE_INFINITY;
  let pointerTarget: Element | null = null;
  let pointerHighlightTarget: HTMLElement | null = null;
  let cursorPosition = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  };
  let realPointerPosition = { ...cursorPosition };
  let cursorMoved = false;
  let storedCursorReady = !extensionCursorStore();
  let cursorNeedsPointerSync = true;
  const persistCursorPosition = () => {
    const store = extensionCursorStore();
    if (!store || disposed || (!storedCursorReady && !cursorMoved)) return;
    void store.set({
      [GAMEPAD_CURSOR_POSITION_STORAGE_KEY]: viewportGamepadCursorPosition(
        cursorPosition,
        { width: window.innerWidth, height: window.innerHeight },
      ),
    });
  };
  let lastCursorInputAt = Number.NEGATIVE_INFINITY;
  let cursorVisible = false;
  let cursorMotion: GamepadMotionVector = { x: 0, y: 0 };
  let interactionMode: 'cursor' | 'spatial' = 'cursor';
  let profile = controllerProfile(snapshot.id);
  let controlSettings: GamepadControlSettings | null = null;
  let artworkLoad = 0;
  let deckSettings: DeckEntrySettings = DEFAULT_DECK_ENTRY_SETTINGS;
  let speedWheelVisible = false;
  let pageLayoutReady = document.readyState === 'complete';
  let deckSettingsReady = false;
  let panelPositionReady = false;
  let artworkReady = false;
  let panelPositionFrame = 0;
  let panelPositionCommitFrame = 0;
  let panelPositionTimer = 0;
  let panelPositionRevision = 0;
  let actionFeedTimer = 0;
  let keyboardFocusFrame = 0;
  let indicatorVisibilityOverride: boolean | null = null;
  let speechViewState: GamepadPushToTalkViewState = {
    status: 'idle',
    text: '',
    target: null,
  };
  let speechButtonHeld = false;
  let speechRequestRevision = 0;
  let speechStartPending = false;
  let requestConfiguredSpeechInput: (requireHeld?: boolean) => boolean = () =>
    false;
  let finishConfiguredSpeechInput = () => false;
  const intentAdapter = new GamepadIntentAdapter({ repeatConfirm: true });
  const actionFeed = new GamepadActionFeed();
  const recoverySettings = defaultGamepadControlSettings();
  const navigation = (
    window as typeof window & {
      navigation?: {
        addEventListener(type: string, listener: EventListener): void;
        removeEventListener(type: string, listener: EventListener): void;
      };
    }
  ).navigation;
  const pageControlEnabled = () => controlSettings?.enabled === true;
  const resetMotion = () => {
    cursorMotion = { x: 0, y: 0 };
  };

  const snapshotSource = mountGamepadSnapshotSource(window, navigator);
  const host = document.createElement('div');
  host.id = GAMEPAD_CONTROL_HOST_ID;
  host.popover = 'manual';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = rewriteProjectAssetUrls(
    styles,
    api.runtime.getURL('project-assets/'),
  );
  const panel = document.createElement('section');
  panel.className = 'gamepad-control-panel';
  panel.setAttribute('aria-label', '手柄控制');
  const closeIndicator = document.createElement('button');
  closeIndicator.type = 'button';
  closeIndicator.className = 'gamepad-control-close';
  closeIndicator.setAttribute('aria-label', '隐藏手柄示意图');
  const artwork = document.createElement('div');
  artwork.className = 'gamepad-control-artwork';
  const activeActions = document.createElement('div');
  activeActions.className = 'gamepad-control-actions';
  activeActions.setAttribute('aria-hidden', 'true');
  panel.append(closeIndicator, artwork, activeActions);
  const pointerVisual = new GamepadPointerVisual(document, window);
  const easterEggVisual = new GamepadEasterEggVisual(
    document,
    api.runtime.getURL(`project-assets/${GAMEPAD_EASTER_EGG_PATH}`),
  );
  const speechStatus = document.createElement('section');
  speechStatus.className = 'gamepad-speech-status';
  speechStatus.setAttribute('role', 'status');
  speechStatus.setAttribute('aria-live', 'polite');
  const speechStatusPulse = document.createElement('span');
  speechStatusPulse.className = 'gamepad-speech-status__pulse';
  speechStatusPulse.setAttribute('aria-hidden', 'true');
  const speechStatusLabel = document.createElement('strong');
  speechStatusLabel.className = 'gamepad-speech-status__label';
  speechStatus.append(speechStatusPulse, speechStatusLabel);
  shadow.append(
    style,
    panel,
    pointerVisual.targetHighlight,
    pointerVisual.cursor,
    easterEggVisual.element,
  );
  if (speechCapability.available) shadow.append(speechStatus);
  let pushToTalk: GamepadPushToTalkController;
  const screenKeyboard = new GamepadScreenKeyboard(
    document,
    shadow,
    () => cursorPosition,
    () => loadPinyinDictionary(api),
    speechCapability.available
      ? {
          start: () => requestConfiguredSpeechInput(),
          finish: () => finishConfiguredSpeechInput(),
        }
      : null,
  );
  const updateKeyboardShortcuts = () => {
    const bindings = controlSettings?.bindings ?? recoverySettings.bindings;
    const label = (action: keyof typeof bindings.buttons) =>
      gamepadButtonLabel(bindings.buttons[action], snapshot.id);
    const shortcuts: GamepadKeyboardShortcuts = {
      backspace: label('browserTabPrevious'),
      candidateNext: label('contextNext'),
      candidatePrevious: label('contextPrevious'),
      enter: label('browserTabNext'),
      selectAll: label('cursorReset'),
      space: label('reload'),
      speech: label('pushToTalk'),
    };
    screenKeyboard.setShortcuts(shortcuts);
  };
  const positionSpeechStatus = (target: Element | null) => {
    const rect = target?.isConnected
      ? target.getBoundingClientRect()
      : {
          top: window.innerHeight / 2,
          bottom: window.innerHeight / 2,
          left: window.innerWidth / 2,
          width: 0,
        };
    const placeAbove = rect.top >= 58;
    const horizontalMargin = Math.min(120, Math.max(12, window.innerWidth / 2));
    const centerX = clamp(
      rect.left + rect.width / 2,
      horizontalMargin,
      window.innerWidth - horizontalMargin,
    );
    speechStatus.dataset.placement = placeAbove ? 'above' : 'below';
    speechStatus.style.left = `${centerX}px`;
    speechStatus.style.top = `${
      placeAbove
        ? Math.max(12, rect.top - 10)
        : clamp(rect.bottom + 10, 12, Math.max(12, window.innerHeight - 48))
    }px`;
  };
  const renderSpeechStatus = (state: GamepadPushToTalkViewState) => {
    speechViewState = state;
    screenKeyboard.setSpeechStatus(state.status);
    speechStatus.dataset.status = state.status;
    speechStatus.classList.toggle(
      'is-visible',
      state.status !== 'idle' &&
        (!screenKeyboard.visible || state.status === 'error'),
    );
    const label =
      state.status === 'connecting'
        ? '正在连接语音'
        : state.status === 'listening'
          ? '正在聆听'
          : state.status === 'stopping'
            ? '正在识别'
            : state.status === 'complete'
              ? state.text
                ? '已写入输入框'
                : '未识别到文本'
              : state.status === 'error'
                ? state.error || '语音输入失败'
                : '';
    if (speechStatusLabel.textContent !== label) {
      speechStatusLabel.textContent = label;
    }
    positionSpeechStatus(state.target);
    syncTopLayer();
  };
  const pulseGamepad = () => {
    if (snapshot.index === null) return;
    const gamepad = navigator.getGamepads?.()[snapshot.index] as
      | (Gamepad & {
          vibrationActuator?: {
            playEffect(
              type: string,
              parameters: {
                duration: number;
                strongMagnitude: number;
                weakMagnitude: number;
              },
            ): Promise<unknown>;
          };
        })
      | null
      | undefined;
    void gamepad?.vibrationActuator
      ?.playEffect('dual-rumble', {
        duration: 90,
        strongMagnitude: 0.18,
        weakMagnitude: 0.32,
      })
      .catch(() => undefined);
  };
  pushToTalk = new GamepadPushToTalkController({
    resolveTarget: () => screenKeyboard.resolveEditableTarget(),
    createCapture: () => createExtensionSpeechCapture(api),
    createSpeech: () => new ExtensionSpeechRecognitionClient(api),
    createComposition: createEditableTextComposition,
    publish: renderSpeechStatus,
    pulse: pulseGamepad,
  });
  const openSpeechSettings = async () => {
    const response = await sendGamepadExtensionMessage<{
      ok?: boolean;
      error?: string;
    }>(api, {
      channel: EXTENSION_CHANNEL,
      type: 'ai-assistant-surface-open',
      tab: 'settings',
    });
    if (response.error) throw new Error(response.error);
    if (!response.ok) throw new Error('扩展未能打开语音识别设置。');
  };
  const clearPendingSpeechStatus = () => {
    renderSpeechStatus({ status: 'idle', text: '', target: null });
  };
  requestConfiguredSpeechInput = (requireHeld = false) => {
    if (
      speechStartPending ||
      pushToTalk.active ||
      !screenKeyboard.visible ||
      !pageControlEnabled()
    ) {
      return false;
    }
    const revision = ++speechRequestRevision;
    speechStartPending = true;
    renderSpeechStatus({
      status: 'connecting',
      text: '',
      target: screenKeyboard.resolveEditableTarget(),
    });
    void (async () => {
      let configured = false;
      try {
        configured = extensionSpeechServiceConfigured(
          await sendGamepadExtensionMessage(api, {
            channel: EXTENSION_CHANNEL,
            type: 'ai-services-read',
          }),
        );
      } catch {
        configured = false;
      }
      const currentRequest = revision === speechRequestRevision;
      if (!configured) {
        if (currentRequest) {
          speechStartPending = false;
          clearPendingSpeechStatus();
        }
        await openSpeechSettings().catch(() => undefined);
        return;
      }
      if (
        !currentRequest ||
        (requireHeld && !speechButtonHeld) ||
        owner !== 'external-page' ||
        document.visibilityState !== 'visible' ||
        !screenKeyboard.visible ||
        !pageControlEnabled()
      ) {
        if (currentRequest) {
          speechStartPending = false;
          clearPendingSpeechStatus();
        }
        return;
      }
      speechStartPending = false;
      pushToTalk.start();
    })();
    return true;
  };
  finishConfiguredSpeechInput = () => {
    speechButtonHeld = false;
    speechRequestRevision += 1;
    if (speechStartPending) {
      speechStartPending = false;
      clearPendingSpeechStatus();
      return true;
    }
    return pushToTalk.finish();
  };
  document.documentElement.append(host);

  const pageFocusStyle = document.createElement('style');
  pageFocusStyle.id = GAMEPAD_CONTROL_FOCUS_STYLE_ID;
  pageFocusStyle.textContent = `.${FOCUS_CLASS}{outline:none!important;}#${GAMEPAD_CONTROL_HOST_ID}::backdrop{background:transparent!important;pointer-events:none!important;}`;
  (document.head ?? document.documentElement).append(pageFocusStyle);

  const spatial = new SpatialEngine({
    autoRestoreFocus: true,
    focusableSelector: PAGE_FOCUSABLE_SELECTOR,
    focusClass: FOCUS_CLASS,
    root: document,
    scrollBehavior: 'smooth',
  });
  let spatialStarted = false;
  const nav = {
    start() {
      if (spatialStarted) return;
      spatial.start();
      spatialStarted = true;
    },
    navigate(direction: NavigationDirection) {
      this.start();
      spatial.navigate(direction);
    },
    activate() {
      this.start();
      return spatial.activate();
    },
    getFocused() {
      return spatialStarted ? spatial.getFocused() : null;
    },
    destroy() {
      if (!spatialStarted) return;
      spatial.destroy();
      spatialStarted = false;
    },
  };

  const cancelPanelPositionCommit = () => {
    window.cancelAnimationFrame(panelPositionFrame);
    window.cancelAnimationFrame(panelPositionCommitFrame);
    window.clearTimeout(panelPositionTimer);
    panelPositionFrame = 0;
    panelPositionCommitFrame = 0;
    panelPositionTimer = 0;
  };

  const updatePanelPosition = ({
    stabilize = false,
  }: {
    stabilize?: boolean;
  } = {}) => {
    if (!pageLayoutReady || !deckSettingsReady) {
      panelPositionReady = false;
      updatePanelState();
      return;
    }
    const center = deckSettings.position
      ? {
          x: deckSettings.position.x * window.innerWidth,
          y: deckSettings.position.y * window.innerHeight,
        }
      : {
          x: window.innerWidth - DECK_ENTRY_LAYOUT.dock.defaultCenterOffset,
          y: window.innerHeight - DECK_ENTRY_LAYOUT.dock.defaultCenterOffset,
        };
    const layout = gamepadPanelLayout({
      anchor: center,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      speedWheelVisible,
      panel: { width: PANEL_WIDTH, height: PANEL_HEIGHT },
      margin: PANEL_MARGIN,
    });
    panel.dataset.placement = layout.placement;
    panel.style.left = `${layout.x}px`;
    panel.style.top = `${layout.y}px`;
    if (!stabilize && panelPositionReady) return;
    cancelPanelPositionCommit();
    panelPositionReady = false;
    const revision = ++panelPositionRevision;
    updatePanelState();
    panelPositionFrame = window.requestAnimationFrame(() => {
      panelPositionFrame = 0;
      panelPositionCommitFrame = window.requestAnimationFrame(() => {
        panelPositionCommitFrame = 0;
        panelPositionTimer = window.setTimeout(() => {
          panelPositionTimer = 0;
          if (
            disposed ||
            revision !== panelPositionRevision ||
            !pageLayoutReady ||
            !deckSettingsReady
          ) {
            return;
          }
          panelPositionReady = true;
          updatePanelState();
        }, PANEL_POSITION_SETTLE_MS);
      });
    });
  };

  const renderTargetHighlight = (
    target: Element | null,
    mode: 'cursor' | 'spatial',
  ) => {
    if (
      owner !== 'external-page' ||
      !target?.isConnected ||
      target === host ||
      host.contains(target)
    ) {
      pointerVisual.setTarget(null, mode);
      return;
    }
    pointerVisual.setTarget(target, mode);
  };

  const updateTargetHighlight = () => {
    if (interactionMode === 'spatial') {
      renderTargetHighlight(nav.getFocused(), 'spatial');
      return;
    }
    renderTargetHighlight(
      cursorVisible ? pointerHighlightTarget : null,
      'cursor',
    );
  };
  const hideTargetHighlight = () => pointerVisual.setTarget(null, 'cursor');
  const hidePageControlVisuals = () => {
    pointerVisual.setVisible(false);
    publishGamepadVirtualPointer(null);
    hideTargetHighlight();
  };
  const showPageControlVisuals = () => {
    updateCursor();
    updateTargetHighlight();
  };
  const reconcilePageControlLifecycle = () =>
    reconcileGamepadPageLifecycle({
      active:
        connected &&
        pageControlEnabled() &&
        owner === 'external-page' &&
        document.visibilityState === 'visible',
      requireNeutral: () => intentAdapter.requireNeutral(),
      resetMotion,
      hideVisuals: hidePageControlVisuals,
      showVisuals: showPageControlVisuals,
    });

  const navigate = (direction: NavigationDirection) => {
    interactionMode = 'spatial';
    cursorVisible = false;
    pointerHighlightTarget = null;
    updateCursor();
    publishGamepadVirtualPointer(null);
    nav.navigate(direction);
    screenKeyboard.rememberEditable(nav.getFocused());
    updateTargetHighlight();
  };

  function updateCursor() {
    pointerVisual.position(cursorPosition);
    pointerVisual.setVisible(cursorVisible && owner === 'external-page');
    syncTopLayer();
  }

  const updatePointerTarget = (now: number) => {
    if (
      !cursorVisible ||
      now - lastPointerEventAt < POINTER_EVENT_INTERVAL_MS
    ) {
      return;
    }
    lastPointerEventAt = now;
    screenKeyboard.trackPointer(cursorPosition);
    const keyboardTarget = screenKeyboard.pointerTarget(cursorPosition);
    let extensionTargetHovered = false;
    if (screenKeyboard.visible) {
      publishGamepadVirtualPointer(null);
    } else {
      extensionTargetHovered = publishGamepadVirtualPointer(cursorPosition);
    }
    const next =
      keyboardTarget ??
      (extensionTargetHovered
        ? null
        : document.elementFromPoint(cursorPosition.x, cursorPosition.y));
    pointerHighlightTarget =
      keyboardTarget || extensionTargetHovered
        ? null
        : pageElementTargetAt(cursorPosition, shadow);
    renderTargetHighlight(pointerHighlightTarget, 'cursor');
    if (next !== pointerTarget) {
      pointerTarget?.dispatchEvent(
        pointerEvent('pointerout', cursorPosition, next),
      );
      pointerTarget?.dispatchEvent(
        mouseEvent('mouseout', cursorPosition, next),
      );
      next?.dispatchEvent(
        pointerEvent('pointerover', cursorPosition, pointerTarget),
      );
      next?.dispatchEvent(
        mouseEvent('mouseover', cursorPosition, pointerTarget),
      );
      pointerTarget = next;
    }
    next?.dispatchEvent(pointerEvent('pointermove', cursorPosition));
    next?.dispatchEvent(mouseEvent('mousemove', cursorPosition));
  };

  const activatePageTarget = () => {
    if (screenKeyboard.visible) {
      screenKeyboard.activate(cursorPosition);
      return;
    }
    pointerVisual.press();
    activatePageTargetByMode({
      mode: interactionMode,
      activateSpatial: () => {
        const focused = nav.getFocused();
        if (!nav.activate()) return false;
        screenKeyboard.openFor(focused);
        return true;
      },
      activateVirtualPointer: () =>
        activateGamepadVirtualPointer(cursorPosition),
      activateCursor: () => {
        const target = document.elementFromPoint(
          cursorPosition.x,
          cursorPosition.y,
        );
        if (!(target instanceof HTMLElement)) return false;
        screenKeyboard.rememberEditable(target);
        target.focus({ preventScroll: true });
        target.click();
        screenKeyboard.openFor(target);
        return true;
      },
    });
    syncTopLayer();
  };

  const resetCursor = () => {
    interactionMode = 'cursor';
    cursorPosition = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    cursorMoved = true;
    cursorVisible = true;
    cursorNeedsPointerSync = false;
    lastPointerEventAt = Number.NEGATIVE_INFINITY;
    lastCursorInputAt = performance.now();
    updateCursor();
    pointerVisual.locate();
    updatePointerTarget(performance.now());
    persistCursorPosition();
  };

  const cancelPageInteraction = () => {
    if (screenKeyboard.visible) {
      screenKeyboard.close({ restoreFocus: false });
      syncTopLayer();
      return;
    }
    const target = nav.getFocused() ?? document.activeElement ?? document;
    const event = {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    target.dispatchEvent(new KeyboardEvent('keydown', event));
    target.dispatchEvent(new KeyboardEvent('keyup', event));
  };

  const runBrowserCommand = (
    command: GamepadBrowserCommand,
    fallback?: () => void,
  ) => {
    // Recheck at the last page-side execution boundary. The bridge performs
    // the same check so stale or duplicated callers cannot escape test mode.
    if (!gamepadOwnerAllowsCommands(readGamepadControlOwner())) return;
    void sendGamepadExtensionMessage<GamepadBrowserCommandResult>(api, {
      channel: EXTENSION_CHANNEL,
      type: 'gamepad-browser-command',
      command,
    })
      .then((result) => {
        if (result.outcome === 'unsupported') fallback?.();
      })
      .catch(() => fallback?.());
  };

  const processIntent = ({ intent, phase }: IntentEnvelope) => {
    if (!gamepadOwnerAllowsCommands(readGamepadControlOwner())) return;
    if (intent.type === 'pushToTalk') {
      if (phase === 'released') {
        finishConfiguredSpeechInput();
        return;
      }
      if (phase === 'pressed') {
        if (!screenKeyboard.visible) {
          requestGamepadDeckToggle();
          return;
        }
        if (speechCapability.available && pageControlEnabled()) {
          speechButtonHeld = true;
          requestConfiguredSpeechInput(true);
        }
      }
      return;
    }
    if (intent.type === 'toggleSpeechOrDeck') {
      if (!screenKeyboard.visible) {
        requestGamepadDeckToggle();
        return;
      }
      if (!speechCapability.available || !pageControlEnabled()) return;
      if (speechStartPending || pushToTalk.recording) {
        finishConfiguredSpeechInput();
      } else {
        requestConfiguredSpeechInput();
      }
      return;
    }
    if (pushToTalk.recording) {
      if (intent.type === 'back') pushToTalk.cancel();
      if (
        screenKeyboard.visible &&
        (intent.type === 'confirm' || intent.type === 'toggleScreenKeyboard')
      ) {
        pushToTalk.finish();
      }
      return;
    }
    if (intent.type === 'toggleDeck' && !screenKeyboard.visible) {
      requestGamepadDeckToggle();
      return;
    }
    if (
      intent.type === 'confirm' &&
      phase === 'repeated' &&
      !screenKeyboard.visible
    ) {
      return;
    }
    if (!pageControlEnabled()) return;
    if (screenKeyboard.visible) {
      switch (intent.type) {
        case 'confirm':
          activatePageTarget();
          return;
        case 'back':
          screenKeyboard.close();
          syncTopLayer();
          return;
        case 'browserTabPrevious':
          screenKeyboard.backspace();
          return;
        case 'browserTabNext':
          screenKeyboard.enter();
          return;
        case 'contextPrevious':
          if (screenKeyboard.hasCandidates) {
            screenKeyboard.selectPreviousCandidate();
          }
          return;
        case 'contextNext':
          if (screenKeyboard.hasCandidates) {
            screenKeyboard.selectNextCandidate();
          }
          return;
        case 'reload':
          screenKeyboard.space();
          return;
        case 'cursorReset':
          screenKeyboard.selectAll();
          return;
        case 'toggleScreenKeyboard':
          screenKeyboard.close();
          syncTopLayer();
          return;
        case 'navigate':
          if (intent.control === 'dpad') {
            screenKeyboard.navigate(intent.direction);
          }
          return;
        default:
          return;
      }
    }
    switch (intent.type) {
      case 'confirm':
        activatePageTarget();
        return;
      case 'back':
        cancelPageInteraction();
        return;
      case 'browserTabPrevious':
        runBrowserCommand('previous-tab');
        return;
      case 'browserTabNext':
        runBrowserCommand('next-tab');
        return;
      case 'reload':
        runBrowserCommand('reload', () => location.reload());
        return;
      case 'toggleScreenKeyboard':
        screenKeyboard.toggle();
        return;
      case 'contextPrevious':
        runBrowserCommand('back', () => history.back());
        return;
      case 'contextNext':
        runBrowserCommand('forward', () => history.forward());
        return;
      case 'newTab':
        runBrowserCommand('new-tab');
        return;
      case 'cursorReset':
        resetCursor();
        return;
      case 'navigate':
        if (intent.control !== 'dpad') return;
        if (screenKeyboard.visible) screenKeyboard.navigate(intent.direction);
        else navigate(intent.direction);
        return;
      case 'pagePrevious':
      case 'pageNext': {
        if (screenKeyboard.visible) return;
        const origin =
          document.elementFromPoint(cursorPosition.x, cursorPosition.y) ??
          nav.getFocused();
        const distance =
          intent.delta ?? window.innerHeight * 0.72 * intent.strength;
        scrollPageByGamepadDelta(
          document,
          origin,
          0,
          distance * (intent.type === 'pagePrevious' ? -1 : 1),
        );
        return;
      }
      default:
        return;
    }
  };

  const bindingContext = (): GamepadBindingContext =>
    screenKeyboard.visible
      ? screenKeyboard.candidateFocused
        ? 'keyboard-candidates'
        : 'keyboard'
      : owner === 'external-page' && !pageControlEnabled()
        ? 'paused'
        : owner === 'external-page'
          ? 'page'
          : 'extension';

  const renderActionFeed = (
    entries: ReturnType<GamepadActionFeed['visible']>,
  ) => {
    const orderedItems: HTMLElement[] = [];
    const createdItems: HTMLElement[] = [];
    const remaining = new Map(
      [...activeActions.querySelectorAll<HTMLElement>('[data-action-id]')].map(
        (node) => [Number(node.dataset.actionId), node],
      ),
    );
    for (const entry of entries) {
      let item = remaining.get(entry.id);
      if (!item) {
        item = document.createElement('span');
        item.className = 'gamepad-control-action';
        item.dataset.actionId = String(entry.id);
        const label = document.createElement('span');
        label.className = 'gamepad-control-action__label';
        const count = document.createElement('span');
        count.className = 'gamepad-control-action__count';
        item.append(label, count);
        createdItems.push(item);
      }
      remaining.delete(entry.id);
      const label = item.querySelector<HTMLElement>(
        '.gamepad-control-action__label',
      );
      const count = item.querySelector<HTMLElement>(
        '.gamepad-control-action__count',
      );
      if (label && label.textContent !== entry.label) {
        label.textContent = entry.label;
      }
      item.classList.toggle('has-count', entry.count !== null);
      if (count && entry.count === null) {
        if (!count.hidden) count.hidden = true;
        if (count.textContent) count.textContent = '';
        if (count.dataset.count !== undefined) delete count.dataset.count;
      } else if (count && count.dataset.count !== String(entry.count)) {
        count.hidden = false;
        count.dataset.count = String(entry.count);
        count.textContent = `×${entry.count}`;
        count.classList.remove('is-updating');
        void count.offsetWidth;
        count.classList.add('is-updating');
      }
      orderedItems.push(item);
    }
    for (const [index, item] of orderedItems.entries()) {
      const current = activeActions.children.item(index);
      if (current !== item) activeActions.insertBefore(item, current);
    }
    for (const item of createdItems) {
      void item.offsetWidth;
      item.classList.add('is-visible');
    }
    for (const item of remaining.values()) {
      if (item.dataset.leaving === 'true') continue;
      item.dataset.leaving = 'true';
      item.classList.remove('is-visible');
      const remove = () => item.remove();
      item.addEventListener('transitionend', remove, { once: true });
      window.setTimeout(remove, 220);
    }
  };

  const scheduleActionFeedExpiration = (now: number) => {
    window.clearTimeout(actionFeedTimer);
    actionFeedTimer = 0;
    const expiresAt = actionFeed.nextExpiration();
    if (!Number.isFinite(expiresAt)) return;
    actionFeedTimer = window.setTimeout(
      () => {
        actionFeedTimer = 0;
        const nextNow = performance.now();
        const entries = actionFeed.visible(nextNow);
        renderActionFeed(entries);
        scheduleActionFeedExpiration(nextNow);
      },
      Math.max(16, expiresAt - now + 16),
    );
  };

  const renderActiveActions = () => {
    const actions =
      connected && owner === 'external-page' && controlSettings
        ? activeGamepadBindingActions({
            snapshot,
            bindings: controlSettings.bindings,
            deadZone: controlSettings.stickDeadZone,
            context: bindingContext(),
          }).filter(
            (action) =>
              speechCapability.available || action.label !== '按住说话',
          )
        : [];
    const now = performance.now();
    const entries = actionFeed.update(actions, now);
    renderActionFeed(entries);
    scheduleActionFeedExpiration(now);
  };

  function updatePanelState() {
    updateKeyboardShortcuts();
    const indicatorVisible =
      indicatorVisibilityOverride ??
      controlSettings?.showControllerIndicator === true;
    const presentationReady = gamepadPanelPresentationReady({
      connected,
      pageReady: pageLayoutReady,
      deckSettingsReady,
      positionReady: panelPositionReady,
      artworkReady,
    });
    panel.classList.toggle('is-positioned', panelPositionReady);
    panel.classList.toggle('is-connected', presentationReady);
    panel.classList.toggle('is-user-hidden', !indicatorVisible);
    panel.classList.toggle(
      'is-control-disabled',
      owner === 'external-page' && !pageControlEnabled(),
    );
    panel.classList.toggle('is-surface-hidden', owner !== 'external-page');
    renderActiveActions();
    syncTopLayer();
  }

  function syncTopLayer() {
    const open =
      screenKeyboard.visible ||
      (cursorVisible && owner === 'external-page') ||
      interactionMode === 'spatial' ||
      easterEggVisual.element.classList.contains('is-visible') ||
      speechViewState.status !== 'idle' ||
      (panel.classList.contains('is-connected') &&
        !panel.classList.contains('is-user-hidden') &&
        !panel.classList.contains('is-surface-hidden'));
    if (open) {
      if (!host.matches(':popover-open')) host.showPopover();
      return;
    }
    if (host.matches(':popover-open')) host.hidePopover();
  }

  const handleCloseIndicator = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (indicatorVisibilityOverride !== null) return;
    indicatorVisibilityOverride = false;
    closeIndicator.disabled = true;
    updatePanelState();
    void sendGamepadExtensionMessage<
      GamepadControlSettings & { error?: string }
    >(api, {
      channel: EXTENSION_CHANNEL,
      type: 'gamepad-control-indicator-set',
      visible: false,
    })
      .then((response) => {
        if (disposed) return;
        if (response.error || !isGamepadControlSettings(response)) {
          throw new Error(response.error || '手柄示意图设置保存失败。');
        }
        controlSettings = response;
        intentAdapter.configure(runtimeSettings(response));
      })
      .catch(() => undefined)
      .finally(() => {
        if (disposed) return;
        indicatorVisibilityOverride = null;
        closeIndicator.disabled = false;
        updatePanelState();
      });
  };

  const loadArtwork = () => {
    const nextProfile = controllerProfile(snapshot.id);
    if (profile.kind === nextProfile.kind && artwork.querySelector('svg')) {
      profile = nextProfile;
      artworkReady = true;
      applyControllerSnapshot(artwork, snapshot, profile);
      updatePanelState();
      return;
    }
    profile = nextProfile;
    const load = ++artworkLoad;
    const path = controllerArtworkPath(profile.kind);
    artworkReady = false;
    updatePanelState();
    void createControllerSvg({
      kind: profile.kind,
      url: api.runtime.getURL(`project-assets/${path}`),
    }).then(
      (svg) => {
        if (disposed || load !== artworkLoad) return;
        artwork.replaceChildren(svg);
        artworkReady = true;
        applyControllerSnapshot(artwork, snapshot, profile);
        updatePanelState();
      },
      () => {
        if (disposed || load !== artworkLoad) return;
        artwork.replaceChildren();
        artworkReady = false;
        updatePanelState();
      },
    );
  };

  const syncArtwork = () => {
    if (controlSettings?.showControllerIndicator) {
      loadArtwork();
      return;
    }
    artworkLoad += 1;
    artwork.replaceChildren();
    artworkReady = false;
    updatePanelState();
  };

  const stopFrame = () => {
    window.cancelAnimationFrame(frame);
    frame = 0;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !connected) return;
    if (document.visibilityState !== 'visible') {
      intentAdapter.requireNeutral();
      resetMotion();
      return;
    }
    const elapsedMs = now - lastFrameAt;
    lastFrameAt = now;
    if (owner !== 'external-page') {
      intentAdapter.requireNeutral();
      updateTargetHighlight();
      return;
    }

    const settings = controlSettings;
    if (!settings) {
      for (const event of intentAdapter.update(snapshot, now)) {
        if (
          event.intent.type === 'toggleDeck' ||
          event.intent.type === 'toggleSpeechOrDeck'
        ) {
          requestGamepadDeckToggle();
        }
      }
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const cursorAxes = gamepadStickAxes(settings.bindings.primaryStick);
    pushToTalk.reconcileTarget();
    const controlEnabled = pageControlEnabled() && !pushToTalk.recording;
    const cursorTarget = controlEnabled
      ? gamepadStickVectorWithCurve(
          snapshot,
          cursorAxes,
          settings.stickDeadZone,
          settings.cursorResponse,
        )
      : { x: 0, y: 0 };
    cursorMotion = advanceGamepadMotion({
      current: cursorMotion,
      target: cursorTarget,
      elapsedMs,
      accelerationMs: settings.cursorRampMs,
    });
    const cursorMotionActive =
      controlEnabled && gamepadMotionActive(cursorMotion);
    pointerVisual.setMoving(cursorMotionActive);
    if (cursorMotionActive) {
      cursorMoved = true;
      interactionMode = 'cursor';
      cursorVisible = true;
      const locate =
        cursorNeedsPointerSync ||
        now - lastCursorInputAt >= CURSOR_LOCATOR_IDLE_MS;
      if (cursorNeedsPointerSync) {
        cursorPosition = { ...realPointerPosition };
        cursorNeedsPointerSync = false;
      } else {
        cursorPosition = moveGamepadCursor({
          position: cursorPosition,
          input: cursorMotion,
          elapsedMs,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          speed: settings.cursorSpeed,
        });
      }
      updateCursor();
      if (locate) pointerVisual.locate();
      lastCursorInputAt = now;
      updatePointerTarget(now);
    }

    const scrollAxes = gamepadStickAxes(settings.bindings.secondaryStick);
    const scrollTarget =
      controlEnabled && !screenKeyboard.visible
        ? gamepadStickVectorWithCurve(
            snapshot,
            scrollAxes,
            settings.stickDeadZone,
            settings.scrollResponse,
          )
        : { x: 0, y: 0 };
    if (
      controlEnabled &&
      !screenKeyboard.visible &&
      gamepadMotionActive(scrollTarget)
    ) {
      const origin =
        document.elementFromPoint(cursorPosition.x, cursorPosition.y) ??
        nav.getFocused();
      const elapsedSeconds = Math.min(40, Math.max(0, elapsedMs)) / 1_000;
      scrollPageByGamepadDelta(
        document,
        origin,
        scrollTarget.x * settings.scrollSpeed * elapsedSeconds,
        scrollTarget.y * settings.scrollSpeed * elapsedSeconds,
      );
      lastPointerEventAt = Number.NEGATIVE_INFINITY;
      updatePointerTarget(now);
    }

    for (const intent of intentAdapter.update(snapshot, now)) {
      processIntent(intent);
    }
    frame = window.requestAnimationFrame(tick);
  };

  const syncFrame = () => {
    const needed =
      connected &&
      document.visibilityState === 'visible' &&
      owner === 'external-page';
    if (!needed) {
      stopFrame();
      return;
    }
    if (!frame) {
      lastFrameAt = performance.now();
      frame = window.requestAnimationFrame(tick);
    }
  };

  const handleSnapshot = () => {
    const next = readGamepadSnapshot();
    const wasConnected = connected;
    const controllerChanged =
      snapshot.connected &&
      next.connected &&
      (snapshot.index !== next.index || snapshot.id !== next.id);
    snapshot = next;
    connected = next.connected;
    if (!connected) {
      actionFeed.clear();
      intentAdapter.reset();
      cursorVisible = false;
      pointerHighlightTarget = null;
      pointerTarget = null;
      screenKeyboard.close({ restoreFocus: false });
      pushToTalk.cancel();
      cursorNeedsPointerSync = true;
      lastCursorInputAt = Number.NEGATIVE_INFINITY;
      reconcilePageControlLifecycle();
    } else if (!wasConnected || controllerChanged) {
      pointerTarget = null;
      pointerHighlightTarget = null;
      cursorNeedsPointerSync = true;
      lastFrameAt = performance.now();
      reconcilePageControlLifecycle();
    }
    syncFrame();
    syncArtwork();
  };

  const handleOwnerChanged = () => {
    owner = readGamepadControlOwner();
    if (owner !== 'external-page') {
      screenKeyboard.close({ restoreFocus: false });
      pushToTalk.cancel();
    }
    reconcilePageControlLifecycle();
    syncFrame();
    updatePanelState();
  };

  const handleFocus = (event: FocusEvent) => {
    const target =
      event
        .composedPath()
        .find((entry): entry is Element => entry instanceof Element) ?? null;
    screenKeyboard.rememberEditable(target);
    if (screenKeyboard.visible) screenKeyboard.reconcileFocus(target);
  };

  const scheduleKeyboardFocusSync = () => {
    window.cancelAnimationFrame(keyboardFocusFrame);
    keyboardFocusFrame = window.requestAnimationFrame(() => {
      keyboardFocusFrame = 0;
      screenKeyboard.reconcileFocus(document.activeElement);
    });
  };

  const handoffToPointer = () => {
    interactionMode = 'cursor';
    cursorVisible = false;
    pointerHighlightTarget = null;
    updateCursor();
    publishGamepadVirtualPointer(null);
    hideTargetHighlight();
    pointerTarget = null;
  };

  const rememberRealPointer = (event: PointerEvent) => {
    realPointerPosition = {
      x: clamp(event.clientX, 10, window.innerWidth - 10),
      y: clamp(event.clientY, 10, window.innerHeight - 10),
    };
    cursorNeedsPointerSync = true;
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (!event.isTrusted) return;
    rememberRealPointer(event);
    if (screenKeyboard.visible && !screenKeyboard.ownsEvent(event)) {
      screenKeyboard.close({ restoreFocus: false });
    }
    handoffToPointer();
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!event.isTrusted) return;
    rememberRealPointer(event);
    if (cursorVisible) handoffToPointer();
  };

  const handleScroll = () => {
    if (
      interactionMode === 'cursor' &&
      cursorVisible &&
      owner === 'external-page'
    ) {
      lastPointerEventAt = Number.NEGATIVE_INFINITY;
      updatePointerTarget(performance.now());
      return;
    }
    updateTargetHighlight();
  };

  const handleViewportChange = () => {
    cursorPosition = {
      x: clamp(cursorPosition.x, 10, window.innerWidth - 10),
      y: clamp(cursorPosition.y, 10, window.innerHeight - 10),
    };
    realPointerPosition = {
      x: clamp(realPointerPosition.x, 10, window.innerWidth - 10),
      y: clamp(realPointerPosition.y, 10, window.innerHeight - 10),
    };
    updateCursor();
    if (cursorVisible && owner === 'external-page') {
      lastPointerEventAt = Number.NEGATIVE_INFINITY;
      updatePointerTarget(performance.now());
    } else {
      updateTargetHighlight();
    }
    updatePanelPosition();
    positionSpeechStatus(speechViewState.target);
  };

  const handlePageLoad = () => {
    pageLayoutReady = true;
    updatePanelPosition({ stabilize: true });
  };

  const handlePageNavigation = () => {
    pageLayoutReady = document.readyState === 'complete';
    updatePanelPosition({ stabilize: true });
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      persistCursorPosition();
      pushToTalk.cancel();
    }
    reconcilePageControlLifecycle();
    syncFrame();
  };

  const handleMediaSpeedSnapshot = () => {
    const snapshot = readMediaSpeedSnapshot(document);
    const nextVisible = snapshot ? mediaSpeedWheelVisible(snapshot) : false;
    if (speedWheelVisible === nextVisible) return;
    speedWheelVisible = nextVisible;
    updatePanelPosition();
  };

  const applyControlSettings = (settings: GamepadControlSettings | null) => {
    controlSettings = settings;
    if (settings) intentAdapter.configure(runtimeSettings(settings));
    intentAdapter.requireNeutral();
    if (!settings?.enabled) {
      screenKeyboard.close({ restoreFocus: false });
      pushToTalk.cancel();
    }
    reconcilePageControlLifecycle();
    syncArtwork();
    syncFrame();
  };

  const handleRuntimeMessage = (message: unknown) => {
    if (isDeckEntrySettingsChangedMessage(message)) {
      const wasReady = deckSettingsReady;
      deckSettings = normalizeDeckEntrySettings(message.settings);
      deckSettingsReady = true;
      updatePanelPosition({ stabilize: !wasReady });
      return;
    }
    if (
      !message ||
      typeof message !== 'object' ||
      Array.isArray(message) ||
      (message as { channel?: unknown }).channel !== EXTENSION_CHANNEL ||
      (message as { type?: unknown }).type !==
        'gamepad-control-settings-changed'
    ) {
      return;
    }
    const settings = (message as { settings?: unknown }).settings;
    if (!isGamepadControlSettings(settings)) return;
    applyControlSettings(settings);
  };

  const unsubscribeSnapshot = subscribeGamepadSnapshot(handleSnapshot);
  const unsubscribeEasterEgg = subscribeGamepadEasterEgg(() => {
    easterEggVisual.play(() => syncTopLayer());
    syncTopLayer();
  });
  const unsubscribeOwner = subscribeGamepadControlOwner(handleOwnerChanged);
  const unsubscribeBrowserTab = subscribeGamepadBrowserTabSwitch(
    (direction) => {
      if (!gamepadOwnerAllowsCommands(readGamepadControlOwner())) return;
      runBrowserCommand(direction === 'previous' ? 'previous-tab' : 'next-tab');
    },
  );
  document.addEventListener('focusin', handleFocus, true);
  document.addEventListener('focusout', scheduleKeyboardFocusSync, true);
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('pointermove', handlePointerMove, true);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', persistCursorPosition);
  document.addEventListener(
    MEDIA_SPEED_SNAPSHOT_EVENT,
    handleMediaSpeedSnapshot,
  );
  window.addEventListener('load', handlePageLoad);
  window.addEventListener('pageshow', handlePageNavigation);
  window.addEventListener('popstate', handlePageNavigation);
  window.addEventListener('hashchange', handlePageNavigation);
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleScroll, true);
  document.addEventListener('yt-navigate-finish', handlePageNavigation);
  document.addEventListener('yt-page-data-updated', handlePageNavigation);
  navigation?.addEventListener('currententrychange', handlePageNavigation);
  navigation?.addEventListener('navigatesuccess', handlePageNavigation);
  const removeRuntimeMessageListener = registerExtensionListener(
    api.runtime.onMessage,
    handleRuntimeMessage,
  );
  closeIndicator.addEventListener('click', handleCloseIndicator);
  disposers.push(
    unsubscribeSnapshot,
    unsubscribeEasterEgg,
    unsubscribeOwner,
    unsubscribeBrowserTab,
    () => document.removeEventListener('focusin', handleFocus, true),
    () =>
      document.removeEventListener('focusout', scheduleKeyboardFocusSync, true),
    () => window.cancelAnimationFrame(keyboardFocusFrame),
    () => document.removeEventListener('pointerdown', handlePointerDown, true),
    () => document.removeEventListener('pointermove', handlePointerMove, true),
    () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange),
    () => window.removeEventListener('pagehide', persistCursorPosition),
    () =>
      document.removeEventListener(
        MEDIA_SPEED_SNAPSHOT_EVENT,
        handleMediaSpeedSnapshot,
      ),
    () => window.removeEventListener('load', handlePageLoad),
    () => window.removeEventListener('pageshow', handlePageNavigation),
    () => window.removeEventListener('popstate', handlePageNavigation),
    () => window.removeEventListener('hashchange', handlePageNavigation),
    () => window.removeEventListener('resize', handleViewportChange),
    () => window.removeEventListener('scroll', handleScroll, true),
    () =>
      document.removeEventListener('yt-navigate-finish', handlePageNavigation),
    () =>
      document.removeEventListener(
        'yt-page-data-updated',
        handlePageNavigation,
      ),
    () =>
      navigation?.removeEventListener(
        'currententrychange',
        handlePageNavigation,
      ),
    () =>
      navigation?.removeEventListener('navigatesuccess', handlePageNavigation),
    removeRuntimeMessageListener,
    () => closeIndicator.removeEventListener('click', handleCloseIndicator),
  );

  void sendGamepadExtensionMessage<DeckEntrySettingsResponse>(api, {
    channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
    type: DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
  })
    .then((response) => {
      if (disposed) return;
      if (response.ok) {
        deckSettings = normalizeDeckEntrySettings(response.settings);
      }
      deckSettingsReady = true;
      updatePanelPosition({ stabilize: true });
    })
    .catch(() => {
      if (disposed) return;
      deckSettingsReady = true;
      updatePanelPosition({ stabilize: true });
    });
  void sendGamepadExtensionMessage<GamepadControlSettings & { error?: string }>(
    api,
    {
      channel: EXTENSION_CHANNEL,
      type: 'gamepad-control-settings-read',
    },
  )
    .then((response) => {
      if (disposed || response.error) return;
      if (!isGamepadControlSettings(response)) return;
      applyControlSettings(response);
    })
    .catch(() => {
      if (disposed) return;
      applyControlSettings(null);
    });

  const initialMediaSpeedSnapshot = readMediaSpeedSnapshot(document);
  speedWheelVisible = initialMediaSpeedSnapshot
    ? mediaSpeedWheelVisible(initialMediaSpeedSnapshot)
    : false;
  updatePanelPosition();
  updateCursor();
  publishGamepadControlState(true);
  handleSnapshot();
  const cursorStore = extensionCursorStore();
  if (cursorStore) {
    void cursorStore
      .get(GAMEPAD_CURSOR_POSITION_STORAGE_KEY)
      .then((stored) => {
        storedCursorReady = true;
        if (disposed || cursorMoved) return;
        const value = stored[GAMEPAD_CURSOR_POSITION_STORAGE_KEY];
        if (!isGamepadCursorPosition(value)) return;
        cursorPosition = applyGamepadCursorPosition(value, {
          width: window.innerWidth,
          height: window.innerHeight,
        });
        realPointerPosition = { ...cursorPosition };
        updateCursor();
      })
      .catch(() => {
        storedCursorReady = true;
      });
  }

  runtime = {
    dispose() {
      if (disposed) return;
      persistCursorPosition();
      disposed = true;
      stopFrame();
      cancelPanelPositionCommit();
      window.clearTimeout(actionFeedTimer);
      publishGamepadControlState(false);
      publishGamepadVirtualPointer(null);
      nav.destroy();
      snapshotSource.dispose();
      pushToTalk.dispose();
      screenKeyboard.dispose();
      pointerVisual.dispose();
      easterEggVisual.dispose();
      for (const dispose of disposers.splice(0).reverse()) dispose();
      host.remove();
      pageFocusStyle.remove();
    },
  };
  const removeContextInvalidation = onExtensionContextInvalidated(() =>
    runtime?.dispose(),
  );
  disposers.push(removeContextInvalidation, removeContextBoundary);
  const ownershipObserver = new MutationObserver(() => {
    if (isCurrentGamepadControlHost(document, host)) return;
    runtime?.dispose();
  });
  ownershipObserver.observe(document, { childList: true, subtree: true });
  disposers.push(() => ownershipObserver.disconnect());
  return runtime;
}

export { mountGamepadControl };
