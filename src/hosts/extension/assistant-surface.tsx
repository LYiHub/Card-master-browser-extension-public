import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { assistantUserFacingError } from '../../ai/domain/assistant-presentation';
import type {
  AiConversationSnapshot,
  AssistantSurfaceContext,
  AssistantTabTargetState,
  AssistantWorkbenchNavigationRequest,
} from '../../ai/domain/types';
import { isAssistantSurfaceNavigationMessage } from '../../ai/domain/types';
import uiStyles from '../../components/ui/ui.css?inline';
import { AiConversationWorkbench } from '../../features/assistant/AiConversationWorkbench';
import workbenchStyles from '../../features/assistant/ai-conversation-workbench.css?inline';
import motionStyles from '../../motion/transitions.css?inline';
import type { UserscriptExecutionCapability } from '../../userscript/runtime/capabilities';
import { ExtensionAiServicesController } from './ai-services-controller';
import {
  type ExtensionApi,
  type ExtensionPort,
  requireExtensionApi,
  sendExtensionRequest,
} from './api';
import { ExtensionAssistantController } from './assistant';
import surfaceStyles from './assistant-surface.css?inline';
import {
  assistantSurfaceLifecyclePortName,
  assistantSurfaceTabId,
} from './assistant-surface-path';
import { ExtensionDeckEntryController } from './deck-entry';
import {
  installExtensionContextBoundary,
  notifyExtensionContextInvalidated,
  onExtensionContextInvalidated,
  registerExtensionListener,
  reportExtensionFailure,
} from './diagnostics';
import { EXTENSION_CHANNEL } from './protocol';
import { extensionSpeechCapability } from './speech-capability';
import {
  readUserscriptExecutionCapability,
  requestUserscriptExecutionPermission,
} from './userscript-permission';

const EMPTY_SNAPSHOT: AiConversationSnapshot = {
  activeConversationId: '',
  conversations: [],
  messages: [],
  running: false,
};

class AssistantSurfaceErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: assistantUserFacingError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportExtensionFailure('assistant-surface', 'render-failed', error, {
      componentStack: info.componentStack ?? '',
    });
  }

  render() {
    if (this.state.error) {
      return (
        <main className="assistant-surface-fatal" role="alert">
          <strong>卡牌大师智能体无法继续运行</strong>
          <p>{this.state.error}</p>
        </main>
      );
    }
    return this.props.children;
  }
}

function queryTabId() {
  return assistantSurfaceTabId(location.search);
}

function isFullPage() {
  return new URLSearchParams(location.search).get('fullPage') === '1';
}

function formatClientLogPayload(payload: unknown): string {
  if (payload === undefined) return '';
  if (typeof payload === 'string') return payload;
  if (payload instanceof Error) {
    return JSON.stringify({
      name: payload.name,
      message: payload.message,
      stack: payload.stack,
    });
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function logClientDiagnostic(tag: string, payload?: unknown) {
  const line =
    payload === undefined ? tag : `${tag} ${formatClientLogPayload(payload)}`;
  console.log(line);
  if (typeof globalThis !== 'undefined') {
    if (!globalThis.__cardMasterPopupLogs) {
      globalThis.__cardMasterPopupLogs = [];
      globalThis.dumpCardMasterLogs = () =>
        globalThis.__cardMasterPopupLogs?.join('\n') ?? 'No logs recorded.';
    }
    globalThis.__cardMasterPopupLogs.push(line);
  }
}

function warnClientDiagnostic(tag: string, errorOrPayload?: unknown) {
  const details =
    errorOrPayload instanceof Error
      ? { message: errorOrPayload.message, stack: errorOrPayload.stack }
      : errorOrPayload;
  const line = `${tag} ${formatClientLogPayload(details)}`;
  console.warn(line);
  if (typeof globalThis !== 'undefined') {
    if (!globalThis.__cardMasterPopupLogs) {
      globalThis.__cardMasterPopupLogs = [];
      globalThis.dumpCardMasterLogs = () =>
        globalThis.__cardMasterPopupLogs?.join('\n') ?? 'No logs recorded.';
    }
    globalThis.__cardMasterPopupLogs.push(`[WARN] ${line}`);
  }
}

function checkAndEnforceSize(api: ExtensionApi, reason = 'mount') {
  if (
    typeof window === 'undefined' ||
    isFullPage() ||
    !api.windows?.getCurrent
  ) {
    return;
  }
  void api.windows
    .getCurrent()
    .then(async (currentWin: chrome.windows.Window) => {
      logClientDiagnostic(
        `[CardMaster:Popup:Client] [CP-7:CurrentWindowInfo:${reason}]`,
        {
          id: currentWin?.id,
          type: currentWin?.type,
          state: currentWin?.state,
          left: currentWin?.left,
          top: currentWin?.top,
          width: currentWin?.width,
          height: currentWin?.height,
          focused: currentWin?.focused,
        },
      );

      const isOversized =
        (typeof currentWin.width === 'number' && currentWin.width > 520) ||
        currentWin.state === 'maximized' ||
        currentWin.state === 'fullscreen' ||
        window.outerWidth > 520;

      if (isOversized && currentWin.id && api.windows?.update) {
        const targetWidth = 480;
        const screenWidth = window.screen.availWidth || 1920;
        const screenHeight = window.screen.availHeight || 1080;
        const targetLeft = Math.max(0, screenWidth - targetWidth);
        const targetHeight =
          currentWin.height && currentWin.height < screenHeight
            ? currentWin.height
            : screenHeight;

        logClientDiagnostic(
          '[CardMaster:Popup:Client] [CP-8:EnforceResizeAttempt]',
          {
            id: currentWin.id,
            reason,
            targetWidth,
            targetHeight,
            targetLeft,
          },
        );

        try {
          const updated = await api.windows.update(currentWin.id, {
            state: 'normal',
            width: targetWidth,
            height: targetHeight,
            left: targetLeft,
            top: currentWin.top ?? 0,
          });
          logClientDiagnostic(
            '[CardMaster:Popup:Client] [CP-8:EnforceResizeSuccess]',
            {
              id: updated.id,
              type: updated.type,
              state: updated.state,
              left: updated.left,
              top: updated.top,
              width: updated.width,
              height: updated.height,
            },
          );
        } catch (err) {
          warnClientDiagnostic(
            '[CardMaster:Popup:Client] [CP-8:EnforceResizeError]',
            err,
          );
        }
      }
    })
    .catch((err) => {
      warnClientDiagnostic(
        '[CardMaster:Popup:Client] [CP-7:CurrentWindowQueryError]',
        err,
      );
    });
}

function enforceSidebarWindowBounds(api: ExtensionApi) {
  if (typeof window === 'undefined' || isFullPage()) return;

  logClientDiagnostic('[CardMaster:Popup:Client] [CP-6:SurfaceMount]', {
    href: location.href,
    search: location.search,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    screenWidth: window.screen?.width,
    screenHeight: window.screen?.height,
    availWidth: window.screen?.availWidth,
    availHeight: window.screen?.availHeight,
    devicePixelRatio: window.devicePixelRatio,
  });

  let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('resize', () => {
    logClientDiagnostic('[CardMaster:Popup:Client] [CP-9:WindowResizeEvent]', {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      timestamp: new Date().toISOString(),
    });
    if (window.outerWidth > 520) {
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        checkAndEnforceSize(api, 'resize-debounce');
      }, 150);
    }
  });

  checkAndEnforceSize(api, 'initial');
  setTimeout(() => checkAndEnforceSize(api, 'delayed-400ms'), 400);
}

async function resolveTabId(api: ExtensionApi) {
  const supplied = queryTabId();
  if (supplied !== null) return supplied;
  const [active] =
    (await api.tabs?.query({
      active: true,
      currentWindow: true,
    })) ?? [];
  if (typeof active?.id !== 'number') {
    throw new Error('卡牌大师智能体无法确定当前标签页。');
  }
  return active.id;
}

function AssistantSurfaceApp({
  api,
  context,
  lifecyclePort,
}: {
  api: ExtensionApi;
  context: AssistantSurfaceContext;
  lifecyclePort: ExtensionPort | null;
}) {
  const assistant = useMemo(
    () =>
      new ExtensionAssistantController(api, context.tabId, {
        tabId: context.tabId,
        title: context.title,
        url: context.url,
        active: false,
        available: true,
      }),
    [api, context.tabId, context.title, context.url],
  );
  const services = useMemo(() => new ExtensionAiServicesController(api), [api]);
  const deckEntry = useMemo(() => new ExtensionDeckEntryController(api), [api]);
  const speechCapability = useMemo(extensionSpeechCapability, []);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [shortcut, setShortcut] = useState('');
  const [userscriptCapability, setUserscriptCapability] =
    useState<UserscriptExecutionCapability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [navigationRequest, setNavigationRequest] =
    useState<AssistantWorkbenchNavigationRequest | null>(null);
  const [attachedPage, setAttachedPage] = useState<AssistantTabTargetState>({
    tabId: context.tabId,
    title: context.title,
    url: context.url,
    active: false,
    available: true,
  });

  useEffect(() => {
    const unsubscribe = assistant.subscribe(setSnapshot);
    const unsubscribeTarget = assistant.subscribeTarget(setAttachedPage);
    void assistant.readConversation().then(setSnapshot, (failure) => {
      setError(assistantUserFacingError(failure));
    });
    return () => {
      unsubscribe();
      unsubscribeTarget();
      assistant.dispose();
    };
  }, [assistant]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void deckEntry.readShortcut().then(
        (state) => {
          if (active) setShortcut(state.shortcut);
        },
        () => {
          if (active) setShortcut('');
        },
      );
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [deckEntry]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void readUserscriptExecutionCapability(api).then(
        (capability) => {
          if (active) setUserscriptCapability(capability);
        },
        (failure) => {
          if (!active) return;
          setUserscriptCapability({
            status: 'unavailable',
            message: assistantUserFacingError(failure),
          });
        },
      );
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [api]);

  useEffect(() => {
    if (!lifecyclePort) return;
    const navigate = (message: unknown) => {
      if (!isAssistantSurfaceNavigationMessage(message)) return;
      setNavigationRequest((current) => ({
        requestId: (current?.requestId ?? 0) + 1,
        tab: message.tab,
      }));
    };
    return registerExtensionListener(lifecyclePort.onMessage, navigate);
  }, [lifecyclePort]);

  const perform = async (action: () => void | Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(assistantUserFacingError(failure));
    }
  };

  return (
    <AiConversationWorkbench
      snapshot={snapshot}
      error={error}
      className="ai-conversation-workbench--surface"
      attachedPage={attachedPage}
      services={services}
      speech={speechCapability.available ? assistant : undefined}
      speechCapability={speechCapability}
      shortcut={shortcut}
      userscriptCapability={userscriptCapability}
      initialTab={context.initialTab}
      navigationRequest={navigationRequest}
      onOpenShortcuts={
        deckEntry.shortcutSettingsAvailable()
          ? async () => {
              await deckEntry.openShortcutSettings();
            }
          : undefined
      }
      onOpenMicrophonePermission={
        speechCapability.available
          ? async () => {
              await api.tabs?.create({
                url: api.runtime.getURL('microphone-permission.html'),
              });
            }
          : undefined
      }
      onRequestUserscriptPermission={() =>
        perform(() => requestUserscriptExecutionPermission(api))
      }
      onSend={async (message, images) => {
        setError(null);
        try {
          await assistant.sendMessage(message, images);
        } catch (failure) {
          setError(assistantUserFacingError(failure));
          throw failure;
        }
      }}
      onCancel={() => perform(() => assistant.cancelConversation())}
      onCreateConversation={() => perform(() => assistant.createConversation())}
      onSelectConversation={(conversationId) =>
        perform(() => assistant.selectConversation(conversationId))
      }
      onRenameConversation={(conversationId, title) =>
        perform(() => assistant.renameConversation(conversationId, title))
      }
      onDeleteConversation={(conversationId) =>
        perform(() => assistant.deleteConversation(conversationId))
      }
    />
  );
}

const removeContextBoundary = installExtensionContextBoundary();
let surfaceRoot: Root | null = null;
let surfaceLifecyclePort: ExtensionPort | null = null;
let surfaceStyle: HTMLStyleElement | null = null;
let disposed = false;
let removeContextInvalidation = () => {};
let removeLifecycleDisconnect = () => {};

function disposeAssistantSurface() {
  if (disposed) return;
  disposed = true;
  removeContextInvalidation();
  removeLifecycleDisconnect();
  try {
    surfaceLifecyclePort?.disconnect();
  } catch (error) {
    notifyExtensionContextInvalidated(error);
  }
  surfaceLifecyclePort = null;
  surfaceRoot?.unmount();
  surfaceRoot = null;
  surfaceStyle?.remove();
  surfaceStyle = null;
  removeContextBoundary();
}

removeContextInvalidation = onExtensionContextInvalidated(
  disposeAssistantSurface,
);
window.addEventListener('pagehide', disposeAssistantSurface, { once: true });

async function bootstrap() {
  const api = requireExtensionApi();
  enforceSidebarWindowBounds(api);
  const tabId = await resolveTabId(api);
  if (disposed) return;
  surfaceLifecyclePort = isFullPage()
    ? null
    : api.runtime.connect({
        name: assistantSurfaceLifecyclePortName(tabId),
      });
  if (surfaceLifecyclePort) {
    const handleDisconnect = () => {
      try {
        void api.runtime.lastError;
        if (!api.runtime.id) {
          notifyExtensionContextInvalidated(
            new Error('Extension context invalidated.'),
          );
        } else {
          api.runtime.getURL('');
        }
      } catch (error) {
        notifyExtensionContextInvalidated(error);
      }
    };
    removeLifecycleDisconnect = registerExtensionListener(
      surfaceLifecyclePort.onDisconnect,
      handleDisconnect,
    );
  }
  const response = await sendExtensionRequest<{
    context?: AssistantSurfaceContext;
    error?: string;
  }>(api, {
    channel: EXTENSION_CHANNEL,
    type: 'ai-assistant-surface-context-read',
    tabId,
  });
  if (disposed) return;
  if (response.error) throw new Error(response.error);
  if (!response.context) throw new Error('扩展未返回当前页面绑定信息。');

  surfaceStyle = document.createElement('style');
  surfaceStyle.textContent = [
    motionStyles,
    uiStyles,
    workbenchStyles,
    surfaceStyles,
  ].join('\n');
  document.head.append(surfaceStyle);
  const root = document.getElementById('assistant-surface-root');
  if (!root) throw new Error('卡牌大师智能体缺少挂载节点。');
  surfaceRoot = createRoot(root);
  surfaceRoot.render(
    <AssistantSurfaceErrorBoundary>
      <AssistantSurfaceApp
        api={api}
        context={response.context}
        lifecyclePort={surfaceLifecyclePort}
      />
    </AssistantSurfaceErrorBoundary>,
  );
}

void bootstrap().catch((error) => {
  if (notifyExtensionContextInvalidated(error) || disposed) return;
  reportExtensionFailure('assistant-surface', 'bootstrap-failed', error);
  const root = document.getElementById('assistant-surface-root');
  if (root) {
    root.textContent = `卡牌大师智能体启动失败：${assistantUserFacingError(error)}`;
    root.dataset.error = 'true';
  }
});
