import {
  CircleAlert,
  CircleStop,
  FileImage,
  List,
  Loader2,
  MessageCircle,
  Mic,
  Plus,
  Send,
  Settings,
  SquareMousePointer,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  assistantTargetStatus,
  assistantUserFacingError,
} from '../../ai/domain/assistant-presentation';
import {
  assistantReadinessIssues,
  type MicrophonePermissionState,
  speechReadinessIssues,
} from '../../ai/domain/assistant-readiness';
import type {
  AiConversationSnapshot,
  AiImageAttachment,
  AiServicesConfigView,
  AiServicesController,
  AiSpeechRecognitionController,
  AssistantTabTargetState,
  AssistantWorkbenchNavigationRequest,
  AssistantWorkbenchTab,
} from '../../ai/domain/types';
import {
  microphonePermissionErrorMessage,
  readMicrophonePermissionState,
} from '../../ai/infrastructure/microphone-permission';
import { SpeechAudioCapture } from '../../ai/infrastructure/speech-audio-capture';
import { MotionIconSwap } from '../../components/ui/MotionIconSwap';
import { UiSegmentedControl } from '../../components/ui/Ui';
import { extensionApiOrNull } from '../../hosts/extension/api';
import type { ExtensionSpeechCapability } from '../../hosts/extension/speech-capability';
import type { UserscriptExecutionCapability } from '../../userscript/runtime/capabilities';
import { MoreMenu, RenameDialog } from './AssistantConversationMenus';
import {
  ConversationMessage,
  conversationMessageParts,
} from './AssistantConversationMessage';
import { AssistantConversationsPanel } from './AssistantConversationsPanel';
import { AssistantSettingsPanel } from './AssistantSettingsPanel';
import { prepareAiImageAttachment } from './assistant-image-attachments';
import {
  defaultAssistantUiPreferences,
  readAssistantUiPreferences,
  writeAssistantUiPreferences,
} from './assistant-ui-preferences';

type AwaitableAction = void | Promise<void>;

const CHAT_SUGGESTIONS = [
  '把这个网站的字号调大一些',
  '把当前页面调整为暗色模式',
  '隐藏当前页面的侧边栏',
  '移除当前页面中的广告',
  '让页面文字更容易阅读',
  '增加段落之间的间距',
  '让链接颜色更加醒目',
  '隐藏 Cookie 提示横幅',
  '让页面主要内容居中显示',
] as const;

const WORKBENCH_SECTIONS = [
  {
    value: 'chat',
    label: '对话',
    icon: <MessageCircle size={14} aria-hidden="true" />,
    controls: 'chatPanel',
  },
  {
    value: 'conversations',
    label: '全部会话',
    icon: <List size={14} aria-hidden="true" />,
    controls: 'conversationsPanel',
  },
  {
    value: 'settings',
    label: '设置',
    icon: <Settings size={14} aria-hidden="true" />,
    controls: 'settingsPanel',
  },
] as const;

export { conversationMessageParts } from './AssistantConversationMessage';

export function AiConversationWorkbench({
  snapshot,
  error,
  className,
  attachedPage,
  services,
  speech,
  speechCapability,
  initialTab,
  navigationRequest,
  onOpenShortcuts,
  shortcut,
  userscriptCapability,
  onOpenMicrophonePermission,
  onRequestUserscriptPermission,
  onSend,
  onCancel,
  onCreateConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
}: {
  snapshot: AiConversationSnapshot;
  error?: string | null;
  className?: string;
  attachedPage?: AssistantTabTargetState;
  services?: AiServicesController;
  speech?: AiSpeechRecognitionController;
  speechCapability: ExtensionSpeechCapability;
  initialTab?: AssistantWorkbenchTab;
  navigationRequest?: AssistantWorkbenchNavigationRequest | null;
  onOpenShortcuts?: () => AwaitableAction;
  shortcut?: string;
  userscriptCapability: UserscriptExecutionCapability | null;
  onOpenMicrophonePermission?: () => AwaitableAction;
  onRequestUserscriptPermission?: () => AwaitableAction;
  onSend: (
    message: string,
    images: readonly AiImageAttachment[],
  ) => AwaitableAction;
  onCancel: () => AwaitableAction;
  onCreateConversation: () => AwaitableAction;
  onSelectConversation: (conversationId: string) => AwaitableAction;
  onRenameConversation: (
    conversationId: string,
    title: string,
  ) => AwaitableAction;
  onDeleteConversation: (conversationId: string) => AwaitableAction;
}) {
  const [activeTab, setActiveTab] = useState<AssistantWorkbenchTab>(
    initialTab ?? 'chat',
  );
  const [draft, setDraft] = useState('');
  const [images, setImages] = useState<AiImageAttachment[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [attachingImages, setAttachingImages] = useState(false);
  const [draggingImages, setDraggingImages] = useState(false);
  const [sending, setSending] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());
  const [servicesConfig, setServicesConfig] =
    useState<AiServicesConfigView | null>(null);
  const [servicesConfigError, setServicesConfigError] = useState<string | null>(
    null,
  );
  const [speechRuntimeError, setSpeechRuntimeError] = useState<string | null>(
    null,
  );
  const [microphonePermission, setMicrophonePermission] =
    useState<MicrophonePermissionState>('unavailable');
  const [speechState, setSpeechState] = useState<
    import('../../ai/domain/types').AiSpeechRecognitionState
  >({
    status: 'idle',
    text: '',
  });
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composerFocusedRef = useRef(false);
  const composerComposingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const followStreamRef = useRef(true);
  const pinningScrollRef = useRef(false);
  const followConversationIdRef = useRef(snapshot.activeConversationId);
  if (followConversationIdRef.current !== snapshot.activeConversationId) {
    followConversationIdRef.current = snapshot.activeConversationId;
    followStreamRef.current = true;
  }
  const speechCaptureRef = useRef<SpeechAudioCapture | null>(null);
  const speechDraftPrefixRef = useRef('');

  const activeConversation = snapshot.conversations.find(
    (conversation) => conversation.id === snapshot.activeConversationId,
  );
  const latestAssistantModel = [...snapshot.messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.model?.trim())
    ?.model?.trim();
  const activeModelId =
    latestAssistantModel ||
    activeConversation?.model?.trim() ||
    servicesConfig?.modelService.model.trim() ||
    '';
  const readinessLoading =
    Boolean(services) && !servicesConfig && !servicesConfigError;
  const readinessIssues = useMemo(
    () =>
      assistantReadinessIssues({
        servicesAvailable: Boolean(services),
        servicesConfig,
        servicesError: servicesConfigError,
        speechSupported: speechCapability.available,
        speechControllerAvailable: Boolean(speech),
        speechRuntimeError,
        microphoneAvailable: Boolean(navigator.mediaDevices?.getUserMedia),
        microphonePermission,
      }),
    [
      microphonePermission,
      services,
      servicesConfig,
      servicesConfigError,
      speech,
      speechCapability.available,
      speechRuntimeError,
    ],
  );
  const aiCredentialIssue = readinessIssues.find(
    (issue) => issue.id === 'model-api-key',
  );
  const showSpeechInput = speechCapability.available && Boolean(speech);

  useEffect(() => {
    if (navigationRequest) setActiveTab(navigationRequest.tab);
  }, [navigationRequest]);

  useEffect(() => {
    const api = extensionApiOrNull();
    if (!api) return;
    let active = true;
    void readAssistantUiPreferences(api).then((preferences) => {
      if (!active) return;
      setPinnedIds(new Set(preferences.pinnedConversationIds));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!services) return;
    let active = true;
    setServicesConfigError(null);
    void services.readServices().then(
      (next) => {
        if (!active) return;
        setServicesConfig(next);
      },
      (failure) => {
        if (active) {
          setServicesConfigError(assistantUserFacingError(failure));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [services]);

  useEffect(() => {
    if (!speechCapability.available) {
      setMicrophonePermission('unavailable');
      return;
    }
    let active = true;
    const refresh = () => {
      void readMicrophonePermissionState().then((next) => {
        if (!active) return;
        setMicrophonePermission(next);
        if (next === 'granted') setSpeechRuntimeError(null);
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [speechCapability.available]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (composerFocusedRef.current || composerComposingRef.current) return;
      setSuggestionIndex((current) => (current + 1) % CHAT_SUGGESTIONS.length);
    }, 6_000);
    return () => window.clearInterval(timer);
  }, []);

  const releaseSpeechCapture = useCallback(async () => {
    const capture = speechCaptureRef.current;
    if (!capture) return;
    speechCaptureRef.current = null;
    await capture.close();
  }, []);

  useEffect(() => {
    if (!speech) return;
    return speech.subscribeSpeech((next) => {
      setSpeechState(next);
      setSpeechRuntimeError(next.error ?? null);
      if (next.text) {
        const prefix = speechDraftPrefixRef.current.trimEnd();
        setDraft(prefix ? `${prefix} ${next.text}` : next.text);
      }
      if (next.status === 'idle' || next.status === 'error') {
        void releaseSpeechCapture();
      }
    });
  }, [speech, releaseSpeechCapture]);

  useEffect(
    () => () => {
      void speech?.cancelSpeechRecognition();
      void releaseSpeechCapture();
    },
    [speech, releaseSpeechCapture],
  );

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (
      !container ||
      snapshot.messages.length === 0 ||
      !followStreamRef.current
    ) {
      return;
    }
    pinningScrollRef.current = true;
    container.scrollTop = container.scrollHeight;
    requestAnimationFrame(() => {
      pinningScrollRef.current = false;
    });
  }, [snapshot.messages]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '44px';
    textarea.style.height = `${
      draft ? Math.min(200, Math.max(44, textarea.scrollHeight)) : 44
    }px`;
  }, [draft]);

  const send = async () => {
    const submittedDraft = draft;
    const submittedImages = images;
    const message =
      draft.trim() || (submittedImages.length > 0 ? '请分析这些图片。' : '');
    if (!message || snapshot.running || sending || attachingImages) return;
    followStreamRef.current = true;
    setSending(true);
    setComposerError(null);
    try {
      await onSend(message, submittedImages);
      setDraft((current) => (current === submittedDraft ? '' : current));
      setImages((current) => (current === submittedImages ? [] : current));
    } catch {
      // The host owns the visible error; preserve the draft for retry.
    } finally {
      setSending(false);
    }
  };

  const attachImages = async (files: readonly File[]) => {
    if (files.length === 0 || attachingImages) return;
    setComposerError(null);
    setAttachingImages(true);
    try {
      const attachments = await Promise.all(
        files.map(prepareAiImageAttachment),
      );
      setImages((current) => [...current, ...attachments]);
    } catch (failure) {
      setComposerError(
        failure instanceof Error ? failure.message : String(failure),
      );
    } finally {
      setAttachingImages(false);
    }
  };

  const startSpeechInput = async () => {
    if (!showSpeechInput) return;
    setSpeechRuntimeError(null);
    const permissionState = await readMicrophonePermissionState();
    setMicrophonePermission(permissionState);
    let nextConfig = servicesConfig;
    let nextConfigError: string | null = null;
    if (services) {
      try {
        nextConfig = await services.readServices();
        setServicesConfig(nextConfig);
        setServicesConfigError(null);
      } catch (failure) {
        nextConfigError = assistantUserFacingError(failure);
        setServicesConfigError(nextConfigError);
      }
    }
    const issues = speechReadinessIssues(
      assistantReadinessIssues({
        servicesAvailable: Boolean(services),
        servicesConfig: nextConfig,
        servicesError: nextConfigError,
        speechSupported: speechCapability.available,
        speechControllerAvailable: Boolean(speech),
        microphoneAvailable: Boolean(navigator.mediaDevices?.getUserMedia),
        microphonePermission: permissionState,
      }),
    );
    if (issues.length > 0) {
      setActiveTab('settings');
      setSpeechState({
        status: 'error',
        text: '',
        error: `语音输入尚未就绪：${issues
          .map((issue) => issue.title)
          .join('；')}`,
      });
      return;
    }
    if (!speech || !navigator.mediaDevices?.getUserMedia) return;
    speechDraftPrefixRef.current = draft;
    setSpeechState({ status: 'connecting', text: '' });
    let sessionStarted = false;
    try {
      const capture = await SpeechAudioCapture.create();
      speechCaptureRef.current = capture;
      sessionStarted = true;
      await speech.startSpeechRecognition();
      capture.start(
        (pcmBase64) => speech.sendSpeechAudio(pcmBase64),
        async (failure) => {
          const error = microphonePermissionErrorMessage(failure);
          setSpeechRuntimeError(error);
          await speech.cancelSpeechRecognition().catch(() => undefined);
          setSpeechState({
            status: 'error',
            text: '',
            error,
          });
          await releaseSpeechCapture();
        },
      );
    } catch (failure) {
      if (sessionStarted) {
        await speech.cancelSpeechRecognition().catch(() => undefined);
      }
      await releaseSpeechCapture();
      const error = microphonePermissionErrorMessage(failure);
      setSpeechRuntimeError(error);
      setSpeechState({
        status: 'error',
        text: '',
        error,
      });
      setActiveTab('settings');
    }
  };

  const stopSpeechInput = async () => {
    if (!speech) return;
    try {
      const capture = speechCaptureRef.current;
      speechCaptureRef.current = null;
      await capture?.finish();
      await speech.stopSpeechRecognition();
    } catch (failure) {
      await speech.cancelSpeechRecognition().catch(() => undefined);
      await releaseSpeechCapture();
      const error = microphonePermissionErrorMessage(failure);
      setSpeechRuntimeError(error);
      setSpeechState({
        status: 'error',
        text: speechState.text,
        error,
      });
      setActiveTab('settings');
    }
  };

  const exportConversation = (conversationId: string) => {
    const conversation = snapshot.conversations.find(
      (candidate) => candidate.id === conversationId,
    );
    if (!conversation) return;
    const messages =
      conversationId === snapshot.activeConversationId ? snapshot.messages : [];
    const transcript = messages.flatMap((item) => {
      const visibleSegments =
        item.role === 'user'
          ? item.segments
          : conversationMessageParts(item).finalSegments;
      const text = visibleSegments
        .flatMap((segment) =>
          segment.type === 'text' ? [segment.content.trim()] : [],
        )
        .filter(Boolean)
        .join('\n\n');
      const imageCount = visibleSegments.filter(
        (segment) => segment.type === 'image',
      ).length;
      const content = [
        text,
        ...(imageCount > 0 ? [`已附加 ${imageCount} 张参考图片。`] : []),
      ]
        .filter(Boolean)
        .join('\n\n');
      return content
        ? [`## ${item.role === 'user' ? '你' : '智能体'}\n\n${content}`]
        : [];
    });
    const content = [`# ${conversation.title}`, ...transcript].join('\n\n');
    const url = URL.createObjectURL(
      new Blob([content], { type: 'text/markdown;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${conversation.title || '会话'}.md`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const togglePinned = (conversationId: string) => {
    setPinnedIds((current) => {
      const next = new Set(current);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      const api = extensionApiOrNull();
      if (api) {
        void writeAssistantUiPreferences(api, {
          ...defaultAssistantUiPreferences(),
          pinnedConversationIds: [...next],
        });
      }
      return next;
    });
  };

  const renameConversation = snapshot.conversations.find(
    (conversation) => conversation.id === renameTarget,
  );
  const openRenameDialog = (conversationId: string) => {
    setRenameTarget(conversationId);
    setRenameOpen(true);
  };

  return (
    <section
      className={`app-ui-theme cm-assistant-surface${className ? ` ${className}` : ''}`}
      aria-label="卡牌大师智能体"
    >
      {renameConversation && (
        <RenameDialog
          open={renameOpen}
          title={renameConversation.title}
          onClose={() => setRenameOpen(false)}
          onExitComplete={() => setRenameTarget(null)}
          onSave={(title) => onRenameConversation(renameConversation.id, title)}
        />
      )}

      <UiSegmentedControl
        className="cm-assistant-tabs"
        label="工作台导航"
        value={activeTab}
        options={WORKBENCH_SECTIONS}
        contextNavigation
        onChange={setActiveTab}
      />

      <div
        className="cm-assistant-panel"
        id="chatPanel"
        hidden={activeTab !== 'chat'}
      >
        <header className="cm-assistant-chat-toolbar">
          <span className="cm-assistant-model-button" title={activeModelId}>
            {activeModelId}
          </span>
          <span className="cm-assistant-chat-title">
            {activeConversation?.title ?? ''}
          </span>
          <div className="cm-assistant-chat-actions">
            <button
              type="button"
              className="cm-assistant-icon-button"
              title="新建会话"
              disabled={snapshot.running}
              onClick={() => void onCreateConversation()}
            >
              <Plus size={16} />
            </button>
            {activeConversation && (
              <MoreMenu
                pinned={pinnedIds.has(activeConversation.id)}
                onTogglePin={() => togglePinned(activeConversation.id)}
                onRename={() => openRenameDialog(activeConversation.id)}
                onExport={() => exportConversation(activeConversation.id)}
                onDelete={() =>
                  void onDeleteConversation(activeConversation.id)
                }
              />
            )}
          </div>
        </header>

        <div
          className={`cm-assistant-target-bar${
            attachedPage?.available ? '' : ' is-unavailable'
          }`}
          title={
            attachedPage?.available
              ? '当前操作页面'
              : assistantTargetStatus(attachedPage)
          }
        >
          <SquareMousePointer size={13} aria-hidden="true" />
          <span>{assistantTargetStatus(attachedPage)}</span>
        </div>

        {aiCredentialIssue && (
          <button
            type="button"
            className="cm-assistant-model-service-alert"
            onClick={() => setActiveTab('settings')}
          >
            <CircleAlert size={16} aria-hidden="true" />
            <span>
              <strong>{aiCredentialIssue.title}</strong>
              <small>{aiCredentialIssue.detail}</small>
            </span>
            <Settings size={15} aria-hidden="true" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="chat-messages"
          onWheel={(event) => {
            if (event.deltaY < 0) followStreamRef.current = false;
          }}
          onScroll={(event) => {
            if (pinningScrollRef.current) return;
            const container = event.currentTarget;
            followStreamRef.current =
              container.scrollHeight -
                container.scrollTop -
                container.clientHeight <
              80;
          }}
        >
          {error && (
            <div className="cm-assistant-inline-error">
              <strong className="cm-assistant-inline-error__title">错误</strong>
              <p className="cm-assistant-inline-error__text">
                {assistantUserFacingError(error)}
              </p>
            </div>
          )}
          {snapshot.messages.map((message) => (
            <ConversationMessage key={message.id} message={message} />
          ))}
          {snapshot.running &&
            snapshot.messages.at(-1)?.status !== 'streaming' && (
              <div className="cm-assistant-response-loader-row" role="status">
                <Loader2
                  className="cm-assistant-response-loader"
                  size={14}
                  aria-hidden="true"
                />
                <span>正在响应</span>
              </div>
            )}
        </div>

        <fieldset
          aria-label="消息编辑器"
          className={`cm-assistant-chat-composer${
            showSpeechInput ? ' cm-assistant-chat-composer--speech' : ''
          }${draggingImages ? ' is-dragging-images' : ''}`}
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            setDraggingImages(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              event.currentTarget.contains(event.relatedTarget)
            ) {
              return;
            }
            setDraggingImages(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDraggingImages(false);
            void attachImages([...event.dataTransfer.files]);
          }}
        >
          {showSpeechInput &&
            (speechState.status !== 'idle' || speechState.error) && (
              <div
                className={`cm-assistant-speech-status${
                  speechState.status === 'error' ? ' is-error' : ''
                }`}
                role="status"
              >
                {speechState.error ??
                  (speechState.status === 'connecting'
                    ? '正在连接语音识别…'
                    : speechState.status === 'stopping'
                      ? '正在整理识别结果…'
                      : '正在聆听…')}
              </div>
            )}
          {composerError && (
            <div className="cm-assistant-composer-error" role="alert">
              <CircleAlert size={14} aria-hidden="true" />
              <span>{composerError}</span>
              <button
                type="button"
                title="关闭"
                aria-label="关闭图片错误"
                onClick={() => setComposerError(null)}
              >
                <X size={13} />
              </button>
            </div>
          )}
          {images.length > 0 && (
            <div className="cm-assistant-composer-images">
              {images.map((image, index) => (
                <figure key={image.id}>
                  <img src={image.dataUrl} alt={`参考图片 ${index + 1}`} />
                  <figcaption>参考图片 {index + 1}</figcaption>
                  <button
                    type="button"
                    title={`移除参考图片 ${index + 1}`}
                    aria-label={`移除参考图片 ${index + 1}`}
                    onClick={() =>
                      setImages((current) =>
                        current.filter((item) => item.id !== image.id),
                      )
                    }
                  >
                    <X size={12} />
                  </button>
                </figure>
              ))}
            </div>
          )}
          <div className="cm-assistant-composer-row">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={draft}
              aria-label="对话内容"
              placeholder={
                snapshot.messages.length === 0
                  ? CHAT_SUGGESTIONS[suggestionIndex]
                  : ''
              }
              spellCheck={false}
              disabled={sending}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => {
                composerFocusedRef.current = true;
              }}
              onBlur={() => {
                composerFocusedRef.current = false;
                composerComposingRef.current = false;
              }}
              onCompositionStart={() => {
                composerComposingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                composerComposingRef.current = false;
                setDraft(event.currentTarget.value);
              }}
              onPaste={(event) => {
                const pastedImages = [...event.clipboardData.files].filter(
                  (file) => file.type.startsWith('image/'),
                );
                if (pastedImages.length === 0) return;
                event.preventDefault();
                void attachImages(pastedImages);
              }}
              onKeyDown={(event) => {
                if (
                  event.key !== 'Enter' ||
                  event.shiftKey ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.altKey ||
                  composerComposingRef.current ||
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229
                ) {
                  return;
                }
                event.preventDefault();
                if (!snapshot.running && !attachingImages) void send();
              }}
            />
            <button
              type="button"
              className="cm-assistant-composer-button"
              title={attachingImages ? '正在处理图片' : '附加参考图片'}
              aria-label={attachingImages ? '正在处理图片' : '附加参考图片'}
              disabled={attachingImages || sending || snapshot.running}
              onClick={() => fileInputRef.current?.click()}
            >
              {attachingImages ? (
                <Loader2 className="cm-assistant-response-loader" size={20} />
              ) : (
                <FileImage size={20} />
              )}
            </button>
            {showSpeechInput && (
              <button
                type="button"
                className={`cm-assistant-composer-button${
                  speechState.status === 'listening' ? ' is-recording' : ''
                }`}
                title={
                  speechState.status === 'listening'
                    ? '停止语音输入'
                    : '开始语音输入'
                }
                aria-label={
                  speechState.status === 'listening'
                    ? '停止语音输入'
                    : '开始语音输入'
                }
                aria-pressed={speechState.status === 'listening'}
                disabled={
                  sending ||
                  snapshot.running ||
                  speechState.status === 'connecting' ||
                  speechState.status === 'stopping'
                }
                onClick={() => {
                  if (speechState.status === 'listening') {
                    void stopSpeechInput();
                  } else {
                    void startSpeechInput();
                  }
                }}
              >
                <MotionIconSwap
                  className="cm-assistant-composer-icon-swap"
                  state={
                    speechState.status === 'listening' ? 'listening' : 'idle'
                  }
                  items={[
                    { state: 'idle', icon: <Mic size={20} /> },
                    { state: 'listening', icon: <CircleStop size={20} /> },
                  ]}
                />
              </button>
            )}
            <button
              type="button"
              className={`cm-assistant-composer-button cm-assistant-composer-submit${
                snapshot.running ? ' is-stop' : ''
              }`}
              title={snapshot.running ? '停止回复' : '发送'}
              aria-label={snapshot.running ? '停止回复' : '发送'}
              disabled={
                snapshot.running
                  ? false
                  : attachingImages ||
                    sending ||
                    (!draft.trim() && images.length === 0)
              }
              onClick={() => {
                if (snapshot.running) void onCancel();
                else void send();
              }}
            >
              <MotionIconSwap
                className="cm-assistant-composer-icon-swap"
                state={
                  snapshot.running ? 'running' : sending ? 'sending' : 'idle'
                }
                items={[
                  { state: 'idle', icon: <Send size={18} /> },
                  {
                    state: 'sending',
                    icon: (
                      <Loader2
                        className="cm-assistant-response-loader"
                        size={18}
                      />
                    ),
                  },
                  { state: 'running', icon: <CircleStop size={20} /> },
                ]}
              />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            disabled={attachingImages || sending || snapshot.running}
            onChange={(event) => {
              void attachImages([...(event.currentTarget.files ?? [])]);
              event.currentTarget.value = '';
            }}
          />
        </fieldset>
      </div>

      <AssistantConversationsPanel
        visible={activeTab === 'conversations'}
        snapshot={snapshot}
        pinnedIds={pinnedIds}
        onCreateConversation={async () => {
          await onCreateConversation();
          setActiveTab('chat');
        }}
        onSelectConversation={async (conversationId) => {
          await onSelectConversation(conversationId);
          setActiveTab('chat');
        }}
        onTogglePin={togglePinned}
        onRenameConversation={openRenameDialog}
        onExportConversation={exportConversation}
        onDeleteConversation={onDeleteConversation}
      />

      <AssistantSettingsPanel
        visible={activeTab === 'settings'}
        readinessIssues={readinessIssues}
        readinessLoading={readinessLoading}
        services={services}
        servicesConfig={servicesConfig}
        speechCapability={speechCapability}
        shortcut={shortcut}
        attachedPage={attachedPage}
        microphonePermission={microphonePermission}
        userscriptCapability={userscriptCapability}
        onConfigChange={(next) => {
          setServicesConfig(next);
          setServicesConfigError(null);
          setSpeechRuntimeError(null);
        }}
        onOpenShortcuts={onOpenShortcuts}
        onOpenMicrophonePermission={onOpenMicrophonePermission}
        onRequestUserscriptPermission={onRequestUserscriptPermission}
      />
    </section>
  );
}
