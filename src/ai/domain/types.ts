import type { AiModelProtocol } from './model-catalog';

export const AI_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type AiImageMimeType = (typeof AI_IMAGE_MIME_TYPES)[number];

export function isAiImageMimeType(value: unknown): value is AiImageMimeType {
  return (
    typeof value === 'string' &&
    AI_IMAGE_MIME_TYPES.includes(value as AiImageMimeType)
  );
}

export {
  type AiModelProtocol,
  DEFAULT_MODEL_SERVICE_MODEL,
  isAiModelProtocol,
  MODEL_SERVICE_BASE_URL_PRESETS,
  MODEL_SERVICE_PRESETS,
} from './model-catalog';

export type AiReasoningEffort = 'off' | 'low' | 'medium' | 'high' | 'max';

export type ModelServiceConfig = {
  baseUrl: string;
  model: string;
  protocol: AiModelProtocol;
  reasoningEffort: AiReasoningEffort;
  apiKey: string;
};

export type ModelServiceConfigView = Omit<ModelServiceConfig, 'apiKey'> & {
  hasCredential: boolean;
};

export type ModelServiceConfigInput = Omit<ModelServiceConfig, 'apiKey'> & {
  apiKey?: string;
};

export type ImageServiceCredentialSource = 'model-service' | 'independent';
export type ImageServiceProtocol = 'openai-images';

export type ImageServiceConfig = {
  credentialSource: ImageServiceCredentialSource;
  protocol: ImageServiceProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type ImageServiceConfigView = Omit<ImageServiceConfig, 'apiKey'> & {
  hasCredential: boolean;
};

export type ImageServiceConfigInput = Omit<ImageServiceConfig, 'apiKey'> & {
  apiKey?: string;
};

export type SpeechServiceConfig = {
  apiKey: string;
};

export type SpeechServiceConfigView = {
  hasCredential: boolean;
};

export type SpeechServiceConfigInput = {
  apiKey?: string;
};

export type AiServicesConfig = {
  modelService: ModelServiceConfig;
  imageService: ImageServiceConfig;
  speechService: SpeechServiceConfig;
};

export type AiServicesConfigView = {
  modelService: ModelServiceConfigView;
  imageService: ImageServiceConfigView;
  speechService: SpeechServiceConfigView;
};

export type ModelServiceProbe = {
  ok: boolean;
  model: string;
  durationMs: number;
  error?: string;
};

export type SpeechServiceProbe = {
  ok: boolean;
  durationMs: number;
  error?: string;
};

export type AiPageContext = {
  url: string;
  title: string;
  language: string;
  selectedText: string;
  visibleText: string;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
};

export type AiToolCallStatus = 'pending' | 'running' | 'completed' | 'error';

export type AiToolCall = {
  id: string;
  name: string;
  arguments: string;
  status: AiToolCallStatus;
  result?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
};

export type AiImageAttachment = {
  id: string;
  name: string;
  mimeType: AiImageMimeType;
  size: number;
  available: boolean;
  dataUrl?: string;
};

export type AiConversationSegment =
  | {
      id: string;
      type: 'reasoning';
      content: string;
    }
  | {
      id: string;
      type: 'text';
      content: string;
    }
  | {
      id: string;
      type: 'tool';
      call: AiToolCall;
    }
  | {
      id: string;
      type: 'image';
      attachment: AiImageAttachment;
    };

export type AiConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  segments: AiConversationSegment[];
  finalSegmentId?: string;
  model?: string;
  usage?: AiUsage;
  createdAt: number;
  status: 'complete' | 'streaming' | 'error';
  error?: string;
};

export type AiScriptExecution = {
  status: 'ready' | 'error' | 'not-matched';
  url: string;
  completedAt: number;
  error?: string;
};

export type AiConversationSummary = {
  id: string;
  title: string;
  model?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

export type AiConversationSnapshot = {
  activeConversationId: string;
  conversations: AiConversationSummary[];
  messages: AiConversationMessage[];
  running: boolean;
};

export type AiConversationListener = (snapshot: AiConversationSnapshot) => void;

export type AssistantWorkbenchTab = 'chat' | 'conversations' | 'settings';

export function isAssistantWorkbenchTab(
  value: unknown,
): value is AssistantWorkbenchTab {
  return value === 'chat' || value === 'conversations' || value === 'settings';
}

export type AssistantWorkbenchNavigationRequest = {
  requestId: number;
  tab: AssistantWorkbenchTab;
};

export type AssistantSurfaceNavigationMessage = {
  type: 'assistant-surface-navigate';
  tab: AssistantWorkbenchTab;
};

export function isAssistantSurfaceNavigationMessage(
  value: unknown,
): value is AssistantSurfaceNavigationMessage {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).type === 'assistant-surface-navigate' &&
    isAssistantWorkbenchTab((value as Record<string, unknown>).tab)
  );
}

export type AiSpeechRecognitionState = {
  status: 'idle' | 'connecting' | 'listening' | 'stopping' | 'error';
  text: string;
  error?: string;
};

export type AiSpeechRecognitionListener = (
  state: AiSpeechRecognitionState,
) => void;

export type AssistantSurfaceContext = {
  tabId: number;
  title: string;
  url: string;
  initialTab?: AssistantWorkbenchTab;
};

export type AssistantTabTargetState = {
  tabId: number | null;
  windowId?: number;
  title: string;
  url: string;
  active: boolean;
  available: boolean;
  message?: string;
};

export type AssistantTabTargetListener = (
  target: AssistantTabTargetState,
) => void;

export interface AiServicesController {
  readServices(): Promise<AiServicesConfigView>;
  saveModelService(
    input: ModelServiceConfigInput,
  ): Promise<AiServicesConfigView>;
  testModelService(input: ModelServiceConfigInput): Promise<ModelServiceProbe>;
  clearModelServiceCredential(): Promise<AiServicesConfigView>;
  saveImageService(
    input: ImageServiceConfigInput,
  ): Promise<AiServicesConfigView>;
  clearImageServiceCredential(): Promise<AiServicesConfigView>;
  saveSpeechService(
    input: SpeechServiceConfigInput,
  ): Promise<AiServicesConfigView>;
  testSpeechService(
    input?: SpeechServiceConfigInput,
  ): Promise<SpeechServiceProbe>;
  clearSpeechServiceCredential(): Promise<AiServicesConfigView>;
}

export interface AiAssistantController {
  readConversation(): Promise<AiConversationSnapshot>;
  subscribe(listener: AiConversationListener): () => void;
  subscribeTarget(listener: AssistantTabTargetListener): () => void;
  createConversation(): Promise<void>;
  selectConversation(conversationId: string): Promise<void>;
  renameConversation(conversationId: string, title: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  sendMessage(
    message: string,
    images?: readonly AiImageAttachment[],
  ): Promise<void>;
  cancelConversation(): Promise<void>;
  dispose(): void;
}

export interface AiSpeechRecognitionController {
  subscribeSpeech(listener: AiSpeechRecognitionListener): () => void;
  startSpeechRecognition(): Promise<void>;
  sendSpeechAudio(pcmBase64: string): Promise<void>;
  stopSpeechRecognition(): Promise<void>;
  cancelSpeechRecognition(): Promise<void>;
}

export function aiConversationText(message: AiConversationMessage) {
  return message.segments
    .flatMap((segment) => (segment.type === 'text' ? [segment.content] : []))
    .join('\n\n');
}

export function aiConversationToolCalls(message: AiConversationMessage) {
  return message.segments.flatMap((segment) =>
    segment.type === 'tool' ? [segment.call] : [],
  );
}

export type UserscriptAiRequest = {
  input: string;
  instructions?: string;
  reasoningEffort?: AiReasoningEffort;
};

export type UserscriptAiResponse = {
  text: string;
  reasoning?: string;
  model: string;
  usage?: AiUsage;
};

export function isAiReasoningEffort(
  value: unknown,
): value is AiReasoningEffort {
  return (
    value === 'off' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'max'
  );
}

export function normalizeUserscriptAiRequest(
  value: unknown,
): UserscriptAiRequest | null {
  if (typeof value === 'string') {
    const input = value.trim();
    return input ? { input } : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.input !== 'string' ||
    !record.input.trim() ||
    record.input.length > 64_000 ||
    (record.instructions !== undefined &&
      (typeof record.instructions !== 'string' ||
        record.instructions.length > 16_000)) ||
    (record.reasoningEffort !== undefined &&
      !isAiReasoningEffort(record.reasoningEffort))
  ) {
    return null;
  }
  return {
    input: record.input.trim(),
    ...(typeof record.instructions === 'string' && record.instructions.trim()
      ? { instructions: record.instructions.trim() }
      : {}),
    ...(isAiReasoningEffort(record.reasoningEffort)
      ? { reasoningEffort: record.reasoningEffort }
      : {}),
  };
}
