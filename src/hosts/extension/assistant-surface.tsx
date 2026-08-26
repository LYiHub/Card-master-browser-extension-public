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
