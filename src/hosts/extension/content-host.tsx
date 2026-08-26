import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { AudioDirector } from '../../audio/AudioDirector';
import { AudioDirectorProvider } from '../../audio/AudioDirectorProvider';
import { GLOBAL_LIBRARY_CLOSED_EVENT } from '../../features/global-library/lifecycle';
import type {
  DeckCreationPreviewRequest,
  DeckVisibilityRequest,
} from '../../features/userscript-deck/deck-entry';
import type { UserscriptDeckHost } from '../../features/userscript-deck/host';
import deckStyles from '../../features/userscript-deck/styles/index.css?inline';
import { UserscriptDeckOverlay } from '../../features/userscript-deck/UserscriptDeckOverlay';
import { disposeInputCoordinator } from '../../input/coordinator';
import { releaseDocumentScrollLock } from '../../lib/document-scroll-lock';
import { rewriteProjectAssetUrls } from '../../lib/project-assets';
import { UserscriptUpdateService } from '../../userscript/application/update-service';
import { BrowserUserscriptSourceExporter } from '../../userscript/infrastructure/browser-source-export';
import type { UserscriptExecutionCapability } from '../../userscript/runtime/capabilities';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { openAssistantSurface } from './assistant-surface-client';
import { ExtensionBilibiliCapabilityController } from './bilibili-capabilities';
import { CleanupScope } from './CleanupScope';
import { createExtensionPageAudioDirector } from './content-audio';
import { ExtensionContentBlockingController } from './content-blocking';
import * as contentDetail from './content-detail';
import { ExtensionDataManagementController } from './data-management';
import { ExtensionDeckEntryController } from './deck-entry';
import { reportExtensionFailure } from './diagnostics';
import { extensionUserscriptFetch } from './fetch';
import { ExtensionGamepadControlController } from './gamepad-control-settings';
import { ExtensionMediaResourcesController } from './media-resources';
import { ExtensionMediaSpeedController } from './media-speed';
import { observePageLocation } from './page-location';
import { ExtensionPageThemeController } from './page-theme';
import { extensionTarget } from './platform';
import { EXTENSION_CHANNEL } from './protocol';
import { ExtensionScriptRepository } from './repository';
import { ExtensionUserscriptRuntime } from './runtime';
import { ExtensionUserscriptCoverController } from './userscript-cover';
import { ExtensionUserscriptSettingsController } from './userscript-settings';

const HOST_ID = 'card-master-heavy-host';

export type ExtensionDeckMountOptions = {
  initialOpen: boolean;
  onReady: () => void;
  subscribeVisibilityRequest: (
    listener: (request: DeckVisibilityRequest) => void,
  ) => () => void;
  subscribeCreationPreview: (
    listener: (request: DeckCreationPreviewRequest) => void,
  ) => () => void;
  audioDirector?: AudioDirector;
};

function createExtensionServices(
  api: ExtensionApi,
  options: ExtensionDeckMountOptions,
): Omit<UserscriptDeckHost, 'runtimeContext'> {
  return {
    scrollLockOwnerId: HOST_ID,
    initialOpen: options.initialOpen,
    onReady: options.onReady,
    initialScripts: [],
    repository: new ExtensionScriptRepository(api),
    runtime: new ExtensionUserscriptRuntime(api),
    deckEntry: new ExtensionDeckEntryController(
      api,
      options.subscribeVisibilityRequest,
      options.subscribeCreationPreview,
    ),
    gamepadControl: new ExtensionGamepadControlController(api),
    updater: new UserscriptUpdateService(extensionUserscriptFetch(api)),
    userscriptSettings: new ExtensionUserscriptSettingsController(api),
    dataManagement: new ExtensionDataManagementController(api),
    sourceExporter: new BrowserUserscriptSourceExporter(),
    coverController: new ExtensionUserscriptCoverController(api),
    readExecutionCapability: () =>
      sendExtensionRequest<UserscriptExecutionCapability>(api, {
        channel: EXTENSION_CHANNEL,
        type: 'userscript-capability-read',
      }),
    openGlobalLibrary: async () => {
      let resolveClosed: () => void = () => undefined;
      const closed = new Promise<void>((resolve) => {
        resolveClosed = () => {
          document.removeEventListener(
            GLOBAL_LIBRARY_CLOSED_EVENT,
            resolveClosed,
          );
          resolve();
        };
      });
      document.addEventListener(GLOBAL_LIBRARY_CLOSED_EVENT, resolveClosed, {
        once: true,
      });
      try {
        const response = await sendExtensionRequest<{
          ok?: boolean;
          error?: string;
        }>(api, {
          channel: EXTENSION_CHANNEL,
          type: 'global-library-open',
        });
        if (response.error) throw new Error(response.error);
        if (!response.ok) {
          throw new Error('扩展未能打开全局脚本牌库。');
        }
        await closed;
      } catch (error) {
        document.removeEventListener(
          GLOBAL_LIBRARY_CLOSED_EVENT,
          resolveClosed,
        );
        throw error;
      }
    },
    openSiteScriptSearch: async () => {
      const response = await sendExtensionRequest<{
        ok?: boolean;
        error?: string;
      }>(api, {
        channel: EXTENSION_CHANNEL,
        type: 'site-script-search-open',
      });
      if (response.error) throw new Error(response.error);
      if (!response.ok) throw new Error('扩展未能打开本站脚本检索页。');
    },
    openNewTab: async () => {
      const response = await sendExtensionRequest<{
        supported?: boolean;
        reason?: string;
      }>(api, {
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-open',
      });
      if (!response.supported) {
        throw new Error(response.reason || '扩展未能打开新标签页。');
      }
    },
    openNewTabSettings: async () => {
      const response = await sendExtensionRequest<{
        supported?: boolean;
        reason?: string;
      }>(api, {
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-settings-open',
      });
      if (!response.supported) {
        throw new Error(response.reason || '扩展未能打开新标签页设置。');
      }
    },
    openAssistantPanel: (tab) => openAssistantSurface(api, tab),
    loadDetailStage: () => Promise.resolve(contentDetail),
    contentBlocking: new ExtensionContentBlockingController(api),
    pageTheme: new ExtensionPageThemeController(api),
    mediaSpeed: new ExtensionMediaSpeedController(api),
    mediaResources:
      extensionTarget() === 'safari'
        ? undefined
        : new ExtensionMediaResourcesController(api),
    bilibiliCapabilities: new ExtensionBilibiliCapabilityController(api),
    reportError: reportExtensionFailure,
  };
}

function ExtensionDeckRoot({
  api,
  options,
}: {
  api: ExtensionApi;
  options: ExtensionDeckMountOptions;
}) {
  const services = useMemo(
    () => createExtensionServices(api, options),
    [api, options],
  );
  const [runtimeContext, setRuntimeContext] = useState(() => ({
    url: window.location.href,
    frameId: 0,
    topFrame: window.top === window,
    softNavigation: false,
  }));
  useEffect(
    () =>
      observePageLocation(window, (url) => {
        setRuntimeContext((current) =>
          current.url === url
            ? current
            : {
                ...current,
                url,
                softNavigation: true,
              },
        );
      }),
    [],
  );
  const host = useMemo<UserscriptDeckHost>(
    () => ({
      ...services,
      runtimeContext,
    }),
    [runtimeContext, services],
  );

  return <UserscriptDeckOverlay host={host} />;
}

export function mountExtensionDeck(
  api: ExtensionApi,
  options: ExtensionDeckMountOptions,
) {
  const existingHost = document.getElementById(HOST_ID);
  existingHost?.remove();
  releaseDocumentScrollLock(document, HOST_ID);
  const cleanupScope = new CleanupScope((error) =>
    reportExtensionFailure('content-host', 'cleanup-failed', error),
  );
  const dispose = cleanupScope.dispose;

  try {
    const hostElement = document.createElement('div');
    hostElement.id = HOST_ID;
    hostElement.dataset.cardMasterBuildTarget =
      __EXTENSION_BUILD_TARGET_MARKER__;
    hostElement.style.visibility = 'hidden';
    hostElement.style.pointerEvents = 'none';
    let audioDirector = options.audioDirector;
    if (!audioDirector) {
      const ownedAudio = createExtensionPageAudioDirector(api);
      cleanupScope.add(() => ownedAudio.dispose());
      audioDirector = ownedAudio.director;
    }
    const shadowRoot = hostElement.attachShadow({ mode: 'closed' });
    const fontStyles = document.createElement('link');
    fontStyles.rel = 'stylesheet';
    fontStyles.href = api.runtime.getURL(
      'project-assets/fonts/cinzel/fonts.css',
    );
    const style = document.createElement('style');
    style.dataset.userscriptDeck = 'styles';
    style.textContent = rewriteProjectAssetUrls(
      `${deckStyles}\n${contentBlockingBoardStyles}\n${pageThemeBoardStyles}\n${mediaSpeedBoardStyles}\n${mediaResourcesBoardStyles}\n${bilibiliCapabilityBoardStyles}`,
      api.runtime.getURL('project-assets/'),
    );
    const mountElement = document.createElement('div');
    shadowRoot.append(fontStyles, style, mountElement);
    document.documentElement.append(hostElement);
    cleanupScope.add(() => hostElement.remove());

    const root = createRoot(mountElement);
    cleanupScope.add(() => disposeInputCoordinator(document));
    cleanupScope.add(() => root.unmount());

    let revealed = false;
    const mountedOptions: ExtensionDeckMountOptions = {
      ...options,
      onReady: () => {
        if (revealed) return;
        revealed = true;
        hostElement.style.visibility = '';
        hostElement.style.pointerEvents = '';
        options.onReady();
      },
    };

    root.render(
      <AudioDirectorProvider
        director={audioDirector}
        interactionRoot={shadowRoot}
      >
        <ExtensionDeckRoot api={api} options={mountedOptions} />
      </AudioDirectorProvider>,
    );
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}

import bilibiliCapabilityBoardStyles from '../../features/userscript-deck/bilibili-capabilities.css?inline';
import contentBlockingBoardStyles from '../../features/userscript-deck/content-blocking.css?inline';
import mediaResourcesBoardStyles from '../../features/userscript-deck/media-resources.css?inline';
import mediaSpeedBoardStyles from '../../features/userscript-deck/media-speed.css?inline';
import pageThemeBoardStyles from '../../features/userscript-deck/page-theme.css?inline';
