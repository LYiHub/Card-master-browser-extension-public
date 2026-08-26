import type { AudioDirector } from '../../audio/AudioDirector';
import { pageAudioDirector } from '../../audio/page-audio-director';
import {
  GLOBAL_LIBRARY_DISPOSE_EVENT,
  GLOBAL_LIBRARY_HOST_ID,
} from '../../features/global-library/lifecycle';
import {
  DECK_BOOTSTRAP_READ_MESSAGE_TYPE,
  DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
  DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
  DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE,
  type DeckBootstrapResponse,
  type DeckCreationPreviewRequest,
  type DeckEntrySettings,
  type DeckEntrySettingsMutation,
  type DeckEntrySettingsResponse,
  type DeckVisibility,
  type DeckVisibilityRequest,
  isDeckCreationPreviewMessage,
  isDeckEntrySettingsChangedMessage,
  isDeckVisibilityRequestMessage,
} from '../../features/userscript-deck/deck-entry';
import {
  deckEntryBadgeCompact,
  deckEntryBadgeText,
} from '../../features/userscript-deck/deck-entry-badge';
import { DECK_ENTRY_LAYOUT } from '../../features/userscript-deck/deck-entry-layout';
import {
  createDeckEntryDragSession,
  type DeckEntryDragSession,
  updateDeckEntryDragSession,
} from '../../features/userscript-deck/deck-entry-position';
import { mediaSpeedWheelVisible } from '../../media-speed/domain/types';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  extensionApiOrNull,
  sendExtensionRequest,
  sendExtensionTransportRequest,
} from './api';
import { createExtensionPageAudioDirector } from './content-audio';
import { mountExtensionDeck } from './content-host';
import {
  extensionContentHostUrl,
  extensionOwnedDeckHostUrl,
} from './content-host-url';
import { isExtensionPageDeckDeliveryMessage } from './deck-visibility';
import {
  extensionErrorMessage,
  installExtensionContextBoundary,
  onExtensionContextInvalidated,
  reportExtensionFailure,
} from './diagnostics';
import { registerGamepadVirtualPointerElement } from './gamepad-bridge';
import { interceptUserscriptInstallLinks } from './installer';
import {
  MEDIA_SPEED_SNAPSHOT_EVENT,
  readMediaSpeedSnapshot,
} from './media-speed-protocol';
import { observePageLocation } from './page-location';
import { claimPageRuntime } from './page-runtime-ownership';
import {
  EXTENSION_CHANNEL,
  extensionContentBlockingEvent,
  extensionLibraryEvent,
  extensionMediaResourcesPageSnapshotEvent,
  extensionPageThemeEvent,
  MAIN_WORLD_COMMAND_EVENT,
  MAIN_WORLD_RUNTIME_EVENT,
  MAIN_WORLD_SYNC_EVENT,
  mainWorldCommandInvocation,
  mainWorldRuntimeMessage,
} from './protocol';

const HOST_ID = 'card-master-host';
const HEAVY_HOST_ID = 'card-master-heavy-host';
const CARD_MASTER_LOGO_PATH =
  'project-assets/userscript-deck/visual/action-icons/card-master-logo.png';
type PageAudio = ReturnType<typeof createExtensionPageAudioDirector>;

function lightStyles(pointerCursorUrl: string) {
  const { core, dock, drag } = DECK_ENTRY_LAYOUT;
  return `
    :host {
      --app-ui-cursor-pointer: url("${pointerCursorUrl}") 2 1, pointer;
      position: fixed;
      z-index: 2147483647;
      inset: 0;
      display: block;
      pointer-events: none;
      contain: strict;
    }
    .entry {
      --deck-entry-width: ${core.buttonWidth}px;
      --deck-entry-height: ${core.buttonHeight}px;
      --deck-entry-half-width: ${core.buttonWidth / 2}px;
      --deck-entry-half-height: ${core.buttonHeight / 2}px;
      --deck-entry-anchor-x: ${dock.defaultCenterOffset}px;
      --deck-entry-anchor-y: ${dock.defaultCenterOffset}px;
      --deck-entry-left-inset: ${drag.insets.left}px;
      --deck-entry-right-inset: ${drag.insets.right}px;
      --deck-entry-top-inset: ${drag.insets.top}px;
      --deck-entry-bottom-inset: ${drag.insets.bottom}px;
      position: absolute;
      right: calc(var(--deck-entry-anchor-x) - var(--deck-entry-half-width));
      bottom: calc(var(--deck-entry-anchor-y) - var(--deck-entry-half-height));
      width: var(--deck-entry-width);
      height: var(--deck-entry-height);
      padding: 0;
      color: #ead6a5;
      background: none;
      border: 0;
      cursor: var(--app-ui-cursor-pointer);
      pointer-events: auto;
      touch-action: none;
    }
    .entry[hidden] { display: none; }
    .entry.has-custom-position {
      top: clamp(
        var(--deck-entry-top-inset),
        var(--deck-entry-y),
        calc(100% - var(--deck-entry-bottom-inset))
      );
      right: auto;
      bottom: auto;
      left: clamp(
        var(--deck-entry-left-inset),
        var(--deck-entry-x),
        calc(100% - var(--deck-entry-right-inset))
      );
      translate: -50% -50%;
    }
    .logo-anchor {
      position: absolute;
      z-index: 2;
      top: 50%;
      left: 50%;
      width: ${core.logoSize}px;
      height: ${core.logoSize}px;
      translate: -50% -50%;
    }
    .logo {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
      user-select: none;
      -webkit-user-drag: none;
      filter:
        drop-shadow(0 4px 8px rgb(0 0 0 / 0.38))
        drop-shadow(0 0 10px rgb(225 181 77 / 0.18));
      transition:
        filter 260ms ease,
        scale 180ms cubic-bezier(0.16, 0.84, 0.22, 1);
    }
    .entry:is(:hover, .is-gamepad-hovered) .logo {
      filter:
        drop-shadow(0 5px 9px rgb(0 0 0 / 0.42))
        drop-shadow(0 0 14px rgb(237 198 101 / 0.48));
      scale: 1.06;
    }
    .entry.is-gamepad-pressing .logo {
      scale: 0.92;
    }
    .entry.is-dragging {
      cursor: var(--app-ui-cursor-pointer);
    }
    .badge {
      position: absolute;
      z-index: 3;
      right: 0;
      bottom: 0;
      display: grid;
      width: auto;
      height: 18px;
      min-width: 18px;
      padding: 0 4px;
      box-sizing: border-box;
      color: #171006;
      font:
        900 11px / 1 ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
      font-variant-numeric: proportional-nums;
      letter-spacing: 0;
      text-align: center;
      white-space: nowrap;
      background: #edc760;
      border: 1px solid rgb(255 244 207 / 0.98);
      border-radius: 999px;
      box-shadow:
        0 3px 8px rgb(0 0 0 / 0.38),
        inset 0 1px rgb(255 255 255 / 0.62),
        inset 0 -2px 3px rgb(107 72 12 / 0.18);
      text-shadow: 0 1px rgb(255 245 211 / 0.62);
      place-items: center;
    }
    .badge[data-compact="true"] {
      font-size: 10px;
    }
    @media (prefers-reduced-motion: reduce) {
      .logo { transition-duration: 80ms; }
    }
  `;
}

function installPersistentBridge(api: ExtensionApi, dispose: (() => void)[]) {
  dispose.push(interceptUserscriptInstallLinks(api));
  const handleMainWorldRuntime = (event: Event) => {
    const detail =
      event instanceof CustomEvent &&
      event.detail &&
      typeof event.detail === 'object'
        ? (event.detail as Record<string, unknown>)
        : null;
    if (
      !detail ||
      typeof detail.scriptId !== 'string' ||
      typeof detail.capability !== 'string' ||
      !mainWorldRuntimeMessage(detail.message)
    ) {
      return;
    }
    void sendExtensionRequest(api, {
      channel: EXTENSION_CHANNEL,
      type: 'main-world-runtime',
      scriptId: detail.scriptId,
      capability: detail.capability,
      message: detail.message,
    }).catch((error) =>
      reportExtensionFailure(
        'content-bridge',
        'main-world-runtime-report-failed',
        error,
      ),
    );
  };
  document.addEventListener(MAIN_WORLD_RUNTIME_EVENT, handleMainWorldRuntime);
  dispose.push(() =>
    document.removeEventListener(
      MAIN_WORLD_RUNTIME_EVENT,
      handleMainWorldRuntime,
    ),
  );
  document.dispatchEvent(new Event(MAIN_WORLD_SYNC_EVENT));

  const handleMainWorldCommandInvocation = (message: unknown) => {
    if (!mainWorldCommandInvocation(message)) return;
    document.dispatchEvent(
      new CustomEvent(MAIN_WORLD_COMMAND_EVENT, {
        detail: {
          scriptId: message.scriptId,
          capability: message.capability,
          commandId: message.commandId,
          invocationId: message.invocationId,
        },
      }),
    );
  };
  api.runtime.onMessage.addListener(handleMainWorldCommandInvocation);
  dispose.push(() =>
    api.runtime.onMessage.removeListener(handleMainWorldCommandInvocation),
  );
}

type ContentBootstrapOptions = {
  extensionPageTabId?: number;
};

function mountBootstrap(
  api: ExtensionApi,
  options: ContentBootstrapOptions = {},
) {
  const disposers: Array<() => void> = [];
  let disposeHeavy: (() => void) | null = null;
  let mounting: Promise<void> | null = null;
  let disposed = false;
  let bootstrapReady = false;
  let settingsReady = false;
  const { release: releaseOwnership } = claimPageRuntime(
    'content-host',
    dispose,
  );
  let audio: PageAudio | null = null;
  let currentSettings: DeckEntrySettings = {
    showDeckTrigger: true,
    showToolbarBadge: true,
    showDeckTriggerBadge: true,
    position: null,
    hiddenCardIds: [],
  };
  let dragSession: DeckEntryDragSession | null = null;
  let suppressClick = false;
  let pendingVisibility: DeckVisibility = 'closed';
  let pendingCreationPreview: DeckCreationPreviewRequest | null = null;
  const visibilityListeners = new Set<
    (request: DeckVisibilityRequest) => void
  >();
  const creationPreviewListeners = new Set<
    (request: DeckCreationPreviewRequest) => void
  >();
  const audioDirector = () => {
    if (audio) return Promise.resolve(audio.director);
    const instance = createExtensionPageAudioDirector(api);
    if (disposed) {
      instance.dispose();
      return Promise.reject(new Error('页面音频宿主已卸载。'));
    }
    audio = instance;
    return Promise.resolve(instance.director);
  };
  let audioUnlockPending = false;
  let audioUnlockListening = true;
  const removeAudioUnlockListeners = () => {
    if (!audioUnlockListening) return;
    audioUnlockListening = false;
    document.removeEventListener(
      'pointerdown',
      unlockAudioFromPageInteraction,
      true,
    );
    document.removeEventListener(
      'keydown',
      unlockAudioFromPageInteraction,
      true,
    );
  };
  const unlockPageAudio = () => {
    if (audioUnlockPending) return;
    audioUnlockPending = true;
    void audioDirector()
      .then((director) => director.unlock())
      .then((unlocked) => {
        if (unlocked) removeAudioUnlockListeners();
      })
      .catch((error) =>
        reportExtensionFailure(
          'content-bootstrap',
          'audio-unlock-failed',
          error,
        ),
      )
      .finally(() => {
        audioUnlockPending = false;
      });
  };
  const unlockAudioFromPageInteraction = (event: Event) => {
    if (event.isTrusted) unlockPageAudio();
  };
  document.addEventListener(
    'pointerdown',
    unlockAudioFromPageInteraction,
    true,
  );
  document.addEventListener('keydown', unlockAudioFromPageInteraction, true);
  disposers.push(removeAudioUnlockListeners);

  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.dataset.cardMasterBuildTarget = __EXTENSION_BUILD_TARGET_MARKER__;
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = lightStyles(
    api.runtime.getURL(
      'project-assets/userscript-deck/visual/cursors/pointer.png',
    ),
  );
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.className = 'entry';
  entry.style.visibility = 'hidden';
  entry.dataset.coreState = 'hidden';
  entry.setAttribute('aria-busy', 'true');
  entry.setAttribute('aria-label', '展开当前页面的卡牌');
  const logo = document.createElement('img');
  logo.className = 'logo';
  logo.src = api.runtime.getURL(CARD_MASTER_LOGO_PATH);
  logo.alt = '';
  logo.draggable = false;
  logo.setAttribute('aria-hidden', 'true');
  const count = document.createElement('span');
  count.className = 'badge';
  count.setAttribute('aria-hidden', 'true');
  const logoAnchor = document.createElement('span');
  logoAnchor.className = 'logo-anchor';
  logoAnchor.append(logo, count);
  entry.append(logoAnchor);
  shadow.append(style, entry);
  document.documentElement.append(host);

  const revealLightEntryWhenReady = () => {
    entry.style.visibility = bootstrapReady && settingsReady ? '' : 'hidden';
  };

  const applySettings = (settings: DeckEntrySettings) => {
    currentSettings = settings;
    entry.hidden = !currentSettings.showDeckTrigger;
    count.hidden = !currentSettings.showDeckTriggerBadge;
    host.dataset.deckEntryVisible = entry.hidden ? 'false' : 'true';
    host.dataset.deckEntryPosition = settings.position ? 'custom' : 'default';
    entry.classList.toggle('has-custom-position', settings.position !== null);
    if (settings.position) {
      entry.style.setProperty(
        '--deck-entry-x',
        `${settings.position.x * 100}%`,
      );
      entry.style.setProperty(
        '--deck-entry-y',
        `${settings.position.y * 100}%`,
      );
    } else {
      entry.style.removeProperty('--deck-entry-x');
      entry.style.removeProperty('--deck-entry-y');
    }
  };

  const updateSettings = async (mutation: DeckEntrySettingsMutation) => {
    const response =
      await sendExtensionTransportRequest<DeckEntrySettingsResponse>(api, {
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE,
        mutation,
      });
    if (!response.ok) {
      throw new Error(extensionErrorMessage(response.error ?? response));
    }
    applySettings(response.settings);
    return response.settings;
  };

  const updateDragPosition = (event: PointerEvent) => {
    if (!dragSession || dragSession.pointerId !== event.pointerId) return;
    const update = updateDeckEntryDragSession(dragSession, {
      pointerX: event.clientX,
      pointerY: event.clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    if (!update) return;
    if (update.started) entry.classList.add('is-dragging');
    event.preventDefault();
    applySettings({
      ...currentSettings,
      position: update.position,
    });
  };

  const finishDrag = (event: PointerEvent) => {
    const session = dragSession;
    if (!session || session.pointerId !== event.pointerId) return;
    updateDragPosition(event);
    dragSession = null;
    if (entry.hasPointerCapture(event.pointerId)) {
      entry.releasePointerCapture(event.pointerId);
    }
    if (!session.moved) return;
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
    entry.classList.remove('is-dragging');
    void updateSettings({
      kind: 'set-position',
      position: session.position,
    }).catch((error) => {
      reportExtensionFailure(
        'content-bootstrap',
        'deck-entry-position-update-failed',
        error,
      );
      refreshBootstrap();
    });
  };

  const readBootstrap = async () => {
    const response = await sendExtensionTransportRequest<DeckBootstrapResponse>(
      api,
      {
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_BOOTSTRAP_READ_MESSAGE_TYPE,
        url: location.href,
        tabId: options.extensionPageTabId ?? null,
      },
    );
    if (!response.ok) {
      throw new Error(extensionErrorMessage(response.error ?? response));
    }
    count.textContent = deckEntryBadgeText(response.activeCount);
    if (deckEntryBadgeCompact(response.activeCount)) {
      count.dataset.compact = 'true';
    } else {
      delete count.dataset.compact;
    }
    entry.dataset.coreState = 'closed';
    entry.setAttribute('aria-busy', 'false');
    bootstrapReady = true;
    revealLightEntryWhenReady();
  };

  const readSettings = async () => {
    const response =
      await sendExtensionTransportRequest<DeckEntrySettingsResponse>(api, {
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_ENTRY_SETTINGS_READ_MESSAGE_TYPE,
      });
    if (!response.ok) {
      throw new Error(extensionErrorMessage(response.error ?? response));
    }
    applySettings(response.settings);
    settingsReady = true;
    revealLightEntryWhenReady();
  };

  const refreshSettings = () => {
    void readSettings().catch((error) => {
      applySettings(currentSettings);
      settingsReady = true;
      revealLightEntryWhenReady();
      reportExtensionFailure(
        'content-bootstrap',
        'deck-entry-settings-read-failed',
        error,
      );
    });
  };

  const refreshBootstrap = () => {
    void readBootstrap().catch((error) => {
      reportExtensionFailure('content-bootstrap', 'state-read-failed', error);
    });
  };

  const subscribeVisibilityRequest = (
    listener: (request: DeckVisibilityRequest) => void,
  ) => {
    visibilityListeners.add(listener);
    if (pendingVisibility === 'open') {
      pendingVisibility = 'closed';
      queueMicrotask(() => listener('open'));
    }
    return () => visibilityListeners.delete(listener);
  };

  const subscribeCreationPreview = (
    listener: (request: DeckCreationPreviewRequest) => void,
  ) => {
    creationPreviewListeners.add(listener);
    if (pendingCreationPreview) {
      const request = pendingCreationPreview;
      pendingCreationPreview = null;
      queueMicrotask(() => listener(request));
    }
    return () => creationPreviewListeners.delete(listener);
  };

  const mountHeavy = () => {
    if (disposed || disposeHeavy || document.getElementById(HEAVY_HOST_ID)) {
      return Promise.resolve();
    }
    if (mounting) return mounting;
    mounting = Promise.resolve()
      .then(() => {
        if (disposed || disposeHeavy) return;
        const initialOpen = pendingVisibility === 'open';
        if (initialOpen) pendingVisibility = 'closed';
        disposeHeavy = mountExtensionDeck(api, {
          initialOpen,
          subscribeVisibilityRequest,
          subscribeCreationPreview,
          onReady: () => {
            host.style.display = 'none';
          },
        });
      })
      .finally(() => {
        mounting = null;
      });
    return mounting;
  };

  const requestDeckVisibility = (request: DeckVisibilityRequest) => {
    if (visibilityListeners.size === 0) {
      pendingVisibility =
        request === 'toggle'
          ? pendingVisibility === 'open'
            ? 'closed'
            : 'open'
          : request;
    } else {
      for (const listener of visibilityListeners) listener(request);
    }
    if (request !== 'closed') void mountHeavy().catch(() => undefined);
  };

  const requestCreationPreview = (request: DeckCreationPreviewRequest) => {
    if (creationPreviewListeners.size === 0) {
      pendingCreationPreview = request;
    } else {
      for (const listener of creationPreviewListeners) listener(request);
    }
    void mountHeavy().catch(() => undefined);
  };

  const handleMediaSpeedSnapshot = () => {
    const snapshot = readMediaSpeedSnapshot(document);
    if (!snapshot) return;
    refreshBootstrap();
    const shouldMount = mediaSpeedWheelVisible(snapshot);
    if (!shouldMount) return;
    const startedAt = performance.now();
    void mountHeavy().catch((error) =>
      reportExtensionFailure(
        'content-bootstrap',
        'media-speed-heavy-host-mount-failed',
        error,
        {
          mediaCount: snapshot.mediaCount,
          videoCount: snapshot.videoCount,
          audioCount: snapshot.audioCount,
          durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        },
      ),
    );
  };

  const hoverDeckEntry = (positionX: number) => {
    const play = (director: AudioDirector) => {
      void director.prepare(['deckHover']);
      director.play('deckHover', { positionX });
    };
    const existing = pageAudioDirector();
    if (existing) {
      play(existing);
      return;
    }
    void audioDirector()
      .then(play)
      .catch(() => undefined);
  };
  entry.addEventListener('pointerenter', (event) => {
    hoverDeckEntry(event.clientX);
  });
  entry.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const bounds = entry.getBoundingClientRect();
    const session = createDeckEntryDragSession({
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      centerX: bounds.left + bounds.width / 2,
      centerY: bounds.top + bounds.height / 2,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      position: currentSettings.position,
      insets: DECK_ENTRY_LAYOUT.drag.insets,
    });
    dragSession = session;
    try {
      entry.setPointerCapture(event.pointerId);
    } catch {}
  });
  entry.addEventListener('dragstart', (event) => {
    event.preventDefault();
  });
  window.addEventListener('pointermove', updateDragPosition, true);
  window.addEventListener('pointerup', finishDrag, true);
  window.addEventListener('pointercancel', finishDrag, true);
  disposers.push(() => {
    window.removeEventListener('pointermove', updateDragPosition, true);
    window.removeEventListener('pointerup', finishDrag, true);
    window.removeEventListener('pointercancel', finishDrag, true);
  });
  entry.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    requestDeckVisibility('toggle');
  });
  disposers.push(
    registerGamepadVirtualPointerElement({
      element: entry,
      enabled: () =>
        entry.style.visibility !== 'hidden' && host.style.display !== 'none',
      onHoverChange(hovered, point) {
        if (hovered && point) hoverDeckEntry(point.x);
      },
    }),
  );

  const routeMessage = (message: unknown) => {
    if (isDeckEntrySettingsChangedMessage(message)) {
      applySettings(message.settings);
    } else if (isDeckVisibilityRequestMessage(message)) {
      if (visibilityListeners.size === 0) {
        requestDeckVisibility(message.visibility);
      }
    } else if (isDeckCreationPreviewMessage(message)) {
      if (creationPreviewListeners.size === 0) {
        requestCreationPreview({
          requestId: message.requestId,
          ...(message.scriptId ? { scriptId: message.scriptId } : {}),
        });
      }
    } else if (extensionMediaResourcesPageSnapshotEvent(message)) {
      refreshBootstrap();
      const { snapshot } = message;
      if (
        snapshot.available &&
        snapshot.enabled &&
        snapshot.showPageTrigger &&
        snapshot.activeOnPage &&
        (snapshot.resources.length > 0 || snapshot.captureEnabled)
      ) {
        void mountHeavy().catch((error) =>
          reportExtensionFailure(
            'content-bootstrap',
            'media-resources-heavy-host-mount-failed',
            error,
            {
              resourceCount: snapshot.resources.length,
              captureEnabled: snapshot.captureEnabled,
            },
          ),
        );
      }
    } else if (
      extensionLibraryEvent(message) ||
      extensionContentBlockingEvent(message) ||
      extensionPageThemeEvent(message)
    ) {
      refreshBootstrap();
    }
  };
  const handleMessage: ExtensionMessageListener = (
    message,
    _sender,
    sendResponse,
  ) => {
    if (isExtensionPageDeckDeliveryMessage(message)) {
      if (message.tabId !== options.extensionPageTabId) return undefined;
      routeMessage(message.message);
      sendResponse({ handled: true });
      return undefined;
    }
    routeMessage(message);
    return undefined;
  };
  api.runtime.onMessage.addListener(handleMessage);
  disposers.push(() => api.runtime.onMessage.removeListener(handleMessage));
  installPersistentBridge(api, disposers);
  disposers.push(installExtensionContextBoundary());
  disposers.push(
    onExtensionContextInvalidated(() => {
      dispose();
    }),
  );
  disposers.push(observePageLocation(window, refreshBootstrap));
  document.addEventListener(
    MEDIA_SPEED_SNAPSHOT_EVENT,
    handleMediaSpeedSnapshot,
  );
  disposers.push(() =>
    document.removeEventListener(
      MEDIA_SPEED_SNAPSHOT_EVENT,
      handleMediaSpeedSnapshot,
    ),
  );
  const handlePageShow = () => refreshBootstrap();
  window.addEventListener('pageshow', handlePageShow);
  disposers.push(() => window.removeEventListener('pageshow', handlePageShow));

  function dispose() {
    if (disposed) return;
    disposed = true;
    document
      .getElementById(GLOBAL_LIBRARY_HOST_ID)
      ?.dispatchEvent(new Event(GLOBAL_LIBRARY_DISPOSE_EVENT));
    releaseOwnership();
    disposeHeavy?.();
    audio?.dispose();
    for (const release of disposers.splice(0).reverse()) {
      try {
        release();
      } catch {
        // Best-effort cleanup after extension reload.
      }
    }
    host.remove();
  }

  const prepareHeavyHost = () => {
    const start = () => {
      if (disposed || document.visibilityState === 'hidden') return;
      void mountHeavy().catch(() => undefined);
    };
    if (document.visibilityState !== 'hidden') {
      start();
      return;
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisible);
      start();
    };
    document.addEventListener('visibilitychange', onVisible);
    disposers.push(() =>
      document.removeEventListener('visibilitychange', onVisible),
    );
  };

  refreshSettings();
  refreshBootstrap();
  queueMicrotask(handleMediaSpeedSnapshot);
  prepareHeavyHost();
}

const api = extensionApiOrNull();
if (api && extensionContentHostUrl(window.location.href)) {
  mountBootstrap(api);
} else if (
  api &&
  extensionOwnedDeckHostUrl(window.location.href, [
    api.runtime.getURL('new-tab.html'),
    api.runtime.getURL('install.html'),
  ])
) {
  void (async () => {
    let extensionPageTabId: number | undefined;
    try {
      extensionPageTabId = (await api.tabs?.getCurrent?.())?.id;
    } catch {
      // The entry can still mount; background requests will use no tab context.
    }
    mountBootstrap(api, { extensionPageTabId });
  })();
}
