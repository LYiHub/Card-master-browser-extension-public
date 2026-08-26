import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';

import { AudioDirector } from '../../audio/AudioDirector';
import { AudioDirectorProvider } from '../../audio/AudioDirectorProvider';
import { pageAudioDirector } from '../../audio/page-audio-director';
import type { BilibiliCapabilitySnapshotListener } from '../../bilibili-capabilities/domain/types';
import {
  playCardStageEnter,
  playCardStageExit,
} from '../../components/card-stage-motion';
import type { ContentBlockingSnapshotListener } from '../../content-blocking/domain/types';
import { GlobalLibraryWorkbench } from '../../features/global-library/GlobalLibraryWorkbench';
import libraryStyles from '../../features/global-library/global-library.css?inline';
import {
  GLOBAL_LIBRARY_ALIVE_ATTRIBUTE,
  GLOBAL_LIBRARY_CARD_SETTINGS_CLOSED_EVENT,
  GLOBAL_LIBRARY_CARD_SETTINGS_REQUEST_EVENT,
  GLOBAL_LIBRARY_CLOSED_EVENT,
  GLOBAL_LIBRARY_CLOSING_EVENT,
  GLOBAL_LIBRARY_DISPOSE_EVENT,
  GLOBAL_LIBRARY_GENERATION_ATTRIBUTE,
  GLOBAL_LIBRARY_HOST_ID,
  GLOBAL_LIBRARY_OPEN_EVENT,
} from '../../features/global-library/lifecycle';
import type { DeckCard } from '../../features/userscript-deck/cards';
import { INPUT_SCOPE_PRIORITY } from '../../input/coordinator';
import { focusableElements } from '../../input/focusability';
import { useSurfaceInputInteraction } from '../../input/useSurfaceInputInteraction';
import {
  lockDocumentScroll,
  releaseDocumentScrollLock,
} from '../../lib/document-scroll-lock';
import { rewriteProjectAssetUrls } from '../../lib/project-assets';
import type { MediaResourcesSnapshotListener } from '../../media-resources/domain/types';
import type { MediaSpeedSnapshotListener } from '../../media-speed/domain/types';
import type { PageThemeSnapshotListener } from '../../page-theme/domain/types';
import { requireExtensionApi } from './api';
import { ExtensionAudioSettingsRepository } from './audio-settings';
import { ExtensionBilibiliCapabilityController } from './bilibili-capabilities';
import { ExtensionContentBlockingController } from './content-blocking';
import { ExtensionDeckEntryController } from './deck-entry';
import {
  installExtensionContextBoundary,
  onExtensionContextInvalidated,
  reportExtensionFailure,
} from './diagnostics';
import { ExtensionGamepadControlController } from './gamepad-control-settings';
import { ExtensionMediaResourcesController } from './media-resources';
import { ExtensionMediaSpeedController } from './media-speed';
import { ExtensionNewTabClient } from './new-tab-client';
import { observePageLocation } from './page-location';
import { ExtensionPageThemeController } from './page-theme';
import { ExtensionScriptRepository } from './repository';

const HOST_PENDING_OPEN_ATTRIBUTE = 'data-card-master-library-open-pending';
const GLOBAL_LIBRARY_Z_INDEX = '2147483647';
const CARD_SETTINGS_Z_INDEX = '2147483646';

const hostGeneration = document.documentElement.getAttribute(
  GLOBAL_LIBRARY_GENERATION_ATTRIBUTE,
);
document.documentElement.removeAttribute(GLOBAL_LIBRARY_GENERATION_ATTRIBUTE);
if (!hostGeneration) {
  throw new Error('全局牌库缺少当前扩展会话标识。');
}
const existingHost = document.getElementById(GLOBAL_LIBRARY_HOST_ID);
if (existingHost) {
  existingHost.dispatchEvent(new Event(GLOBAL_LIBRARY_OPEN_EVENT));
} else {
  mountGlobalLibraryHost(hostGeneration);
}

function mountGlobalLibraryHost(generation: string) {
  releaseDocumentScrollLock(document, GLOBAL_LIBRARY_HOST_ID);
  const api = requireExtensionApi();
  const repository = new ExtensionScriptRepository(api);
  const contentBlocking = new ExtensionContentBlockingController(api);
  const pageTheme = new ExtensionPageThemeController(api);
  const mediaSpeed = new ExtensionMediaSpeedController(api);
  const mediaResources = new ExtensionMediaResourcesController(api);
  const bilibiliCapabilities = new ExtensionBilibiliCapabilityController(api);
  const deckEntry = new ExtensionDeckEntryController(api);
  const gamepadControl = new ExtensionGamepadControlController(api);
  const newTab = new ExtensionNewTabClient(api);
  const refreshPlatformCapabilities = () => {
    void bilibiliCapabilities
      .read()
      .catch((error) =>
        reportExtensionFailure(
          'global-library',
          'platform-capabilities-refresh-failed',
          error,
        ),
      );
  };
  const stopLocationObserver = observePageLocation(
    window,
    refreshPlatformCapabilities,
  );
  const sharedAudioDirector = pageAudioDirector();
  const libraryAudioDirector =
    sharedAudioDirector ??
    new AudioDirector(new ExtensionAudioSettingsRepository(api));
  const hostElement = document.createElement('div');
  hostElement.id = GLOBAL_LIBRARY_HOST_ID;
  hostElement.setAttribute(GLOBAL_LIBRARY_ALIVE_ATTRIBUTE, '');
  hostElement.setAttribute(GLOBAL_LIBRARY_GENERATION_ATTRIBUTE, generation);
  hostElement.style.cssText = `all: initial !important; position: fixed !important; z-index: ${GLOBAL_LIBRARY_Z_INDEX} !important; inset: 0 !important;`;
  const shadowRoot = hostElement.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = rewriteProjectAssetUrls(
    `@import url("/project-assets/fonts/cinzel/fonts.css");\n${libraryStyles}`,
    api.runtime.getURL('project-assets/'),
  );
  const mountElement = document.createElement('div');
  shadowRoot.append(style, mountElement);
  document.documentElement.append(hostElement);

  const root = createRoot(mountElement);
  let disposed = false;
  let removeContextBoundary = () => {};
  let removeInvalidationListener = () => {};
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    removeInvalidationListener();
    removeContextBoundary();
    contentBlocking.dispose();
    pageTheme.dispose();
    mediaSpeed.dispose();
    mediaResources.dispose();
    bilibiliCapabilities.dispose();
    stopLocationObserver();
    root.unmount();
    if (!sharedAudioDirector) libraryAudioDirector.destroy();
    releaseDocumentScrollLock(document, GLOBAL_LIBRARY_HOST_ID);
    hostElement.remove();
    document.dispatchEvent(new Event(GLOBAL_LIBRARY_CLOSED_EVENT));
  };
  const acknowledgeHost = () => {
    if (!disposed) hostElement.setAttribute(GLOBAL_LIBRARY_ALIVE_ATTRIBUTE, '');
  };
  const handleOpenSignal = () => {
    acknowledgeHost();
    refreshPlatformCapabilities();
    hostElement.setAttribute(HOST_PENDING_OPEN_ATTRIBUTE, '');
  };
  hostElement.addEventListener(GLOBAL_LIBRARY_OPEN_EVENT, handleOpenSignal);
  hostElement.addEventListener(GLOBAL_LIBRARY_DISPOSE_EVENT, dispose, {
    once: true,
  });
  removeContextBoundary = installExtensionContextBoundary();
  removeInvalidationListener = onExtensionContextInvalidated(dispose);
  const readContentBlocking = () => contentBlocking.read();
  const subscribeContentBlocking = (
    listener: ContentBlockingSnapshotListener,
  ) => contentBlocking.subscribe(listener);
  const setContentBlockingEnabled = async (enabled: boolean) => {
    const snapshot = await contentBlocking.setRulesEnabled(enabled);
    if (!snapshot.rulesEnabled) window.location.reload();
    return snapshot;
  };
  const readPageTheme = () => pageTheme.read();
  const subscribePageTheme = (listener: PageThemeSnapshotListener) =>
    pageTheme.subscribe(listener);
  const setPageThemeEnabled = (enabled: boolean) =>
    pageTheme.setEnabled(enabled);
  const readMediaSpeed = () => mediaSpeed.read();
  const subscribeMediaSpeed = (listener: MediaSpeedSnapshotListener) =>
    mediaSpeed.subscribe(listener);
  const setMediaSpeedEnabled = (enabled: boolean) =>
    mediaSpeed.setEnabled(enabled);
  const readMediaResources = () => mediaResources.read();
  const subscribeMediaResources = (listener: MediaResourcesSnapshotListener) =>
    mediaResources.subscribe(listener);
  const setMediaResourcesEnabled = (enabled: boolean) =>
    mediaResources.setEnabled(enabled);
  const readBilibiliCapabilities = () => bilibiliCapabilities.read();
  const subscribeBilibiliCapabilities = (
    listener: BilibiliCapabilitySnapshotListener,
  ) => bilibiliCapabilities.subscribe(listener);
  const setBilibiliCapabilityEnabled = (
    capabilityId: Parameters<
      ExtensionBilibiliCapabilityController['setEnabled']
    >[0],
    enabled: boolean,
  ) => bilibiliCapabilities.setEnabled(capabilityId, enabled);
  const openNewTabSettings = async () => {
    const response = await newTab.openSettings();
    if (!response.supported) {
      throw new Error(response.reason || '扩展未能打开新标签页设置。');
    }
  };

  function GlobalLibraryOverlay() {
    const [open, setOpen] = useState(true);
    const [closing, setClosing] = useState(false);
    const [cardSettingsOpen, setCardSettingsOpen] = useState(false);
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const openRef = useRef(true);
    const closingRef = useRef(false);
    const cardSettingsOpenRef = useRef(false);
    const cardSettingsTriggerRef = useRef<HTMLElement | null>(null);
    cardSettingsOpenRef.current = cardSettingsOpen;
    const finishClose = useCallback(() => {
      if (!openRef.current) return;
      openRef.current = false;
      closingRef.current = false;
      dispose();
    }, []);
    const requestClose = useCallback(() => {
      if (
        !openRef.current ||
        closingRef.current ||
        cardSettingsOpenRef.current
      ) {
        return;
      }
      closingRef.current = true;
      document.dispatchEvent(new Event(GLOBAL_LIBRARY_CLOSING_EVENT));
      setClosing(true);
    }, []);
    const openCardSettings = useCallback((card: DeckCard) => {
      cardSettingsTriggerRef.current =
        shadowRoot.activeElement instanceof HTMLElement
          ? shadowRoot.activeElement
          : null;
      hostElement.style.setProperty(
        'z-index',
        CARD_SETTINGS_Z_INDEX,
        'important',
      );
      setCardSettingsOpen(true);
      document.dispatchEvent(
        new CustomEvent(GLOBAL_LIBRARY_CARD_SETTINGS_REQUEST_EVENT, {
          detail: { card },
        }),
      );
    }, []);
    useEffect(() => {
      const restoreLibrary = () => {
        hostElement.style.setProperty(
          'z-index',
          GLOBAL_LIBRARY_Z_INDEX,
          'important',
        );
        setCardSettingsOpen(false);
        const trigger = cardSettingsTriggerRef.current;
        cardSettingsTriggerRef.current = null;
        if (trigger?.isConnected) trigger.focus();
      };
      document.addEventListener(
        GLOBAL_LIBRARY_CARD_SETTINGS_CLOSED_EVENT,
        restoreLibrary,
      );
      return () =>
        document.removeEventListener(
          GLOBAL_LIBRARY_CARD_SETTINGS_CLOSED_EVENT,
          restoreLibrary,
        );
    }, []);
    useSurfaceInputInteraction({
      surfaceRef: overlayRef,
      enabled: open && !closing && !cardSettingsOpen,
      priority: INPUT_SCOPE_PRIORITY.workspace,
      id: 'global-library',
      onClose: requestClose,
    });

    useEffect(() => {
      const handleOpen = () => {
        hostElement.removeAttribute(HOST_PENDING_OPEN_ATTRIBUTE);
        openRef.current = true;
        closingRef.current = false;
        setClosing(false);
        setOpen(true);
      };
      hostElement.addEventListener(GLOBAL_LIBRARY_OPEN_EVENT, handleOpen);
      if (hostElement.hasAttribute(HOST_PENDING_OPEN_ATTRIBUTE)) handleOpen();
      return () => {
        hostElement.removeEventListener(GLOBAL_LIBRARY_OPEN_EVENT, handleOpen);
      };
    }, []);

    useEffect(() => {
      if (!open) return;
      return lockDocumentScroll(document, GLOBAL_LIBRARY_HOST_ID);
    }, [open]);

    useLayoutEffect(() => {
      if (!open) return;
      const layer = overlayRef.current;
      const panel = layer?.querySelector<HTMLElement>('.app-ui-workspace');
      if (!layer || !panel) return;
      return closing
        ? playCardStageExit({ layer, panel, onComplete: finishClose })
        : playCardStageEnter({ layer, panel });
    }, [closing, finishClose, open]);

    useEffect(() => {
      if (!closing) return;
      const timeout = window.setTimeout(finishClose, 760);
      return () => window.clearTimeout(timeout);
    }, [closing, finishClose]);

    useEffect(() => {
      if (!open) return;
      const previouslyFocused = document.activeElement;
      overlayRef.current
        ?.querySelector<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (cardSettingsOpenRef.current) return;
        if (shadowRoot.querySelector('.app-ui-dialog-layer')) return;
        if (event.key !== 'Tab') return;
        const focusable = overlayRef.current
          ? focusableElements(overlayRef.current)
          : [];
        const first = focusable[0];
        const last = focusable.at(-1);
        const activeElement = shadowRoot.activeElement;
        if (!first || !last) return;
        if (event.shiftKey && activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      window.addEventListener('keydown', handleKeyDown, true);
      return () => {
        window.removeEventListener('keydown', handleKeyDown, true);
        if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
      };
    }, [open]);

    return (
      <div
        ref={overlayRef}
        className={`app-ui-theme global-library-overlay${closing ? ' is-closing' : ''}`}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        <GlobalLibraryWorkbench
          repository={repository}
          deckEntry={deckEntry}
          gamepadControl={gamepadControl}
          readContentBlocking={readContentBlocking}
          subscribeContentBlocking={subscribeContentBlocking}
          setContentBlockingEnabled={setContentBlockingEnabled}
          readPageTheme={readPageTheme}
          subscribePageTheme={subscribePageTheme}
          setPageThemeEnabled={setPageThemeEnabled}
          readMediaSpeed={readMediaSpeed}
          subscribeMediaSpeed={subscribeMediaSpeed}
          setMediaSpeedEnabled={setMediaSpeedEnabled}
          readMediaResources={readMediaResources}
          subscribeMediaResources={subscribeMediaResources}
          setMediaResourcesEnabled={setMediaResourcesEnabled}
          readBilibiliCapabilities={readBilibiliCapabilities}
          subscribeBilibiliCapabilities={subscribeBilibiliCapabilities}
          setBilibiliCapabilityEnabled={setBilibiliCapabilityEnabled}
          openNewTabSettings={openNewTabSettings}
          onOpenCardSettings={openCardSettings}
          onClose={requestClose}
        />
      </div>
    );
  }

  root.render(
    <AudioDirectorProvider
      director={libraryAudioDirector}
      interactionRoot={shadowRoot}
    >
      <GlobalLibraryOverlay />
    </AudioDirectorProvider>,
  );
}
