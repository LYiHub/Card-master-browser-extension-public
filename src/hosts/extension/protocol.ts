import {
  normalizeImageServiceInput,
  normalizeModelServiceInput,
  normalizeSpeechServiceInput,
} from '../../ai/domain/ai-services-schema';
import type {
  AssistantWorkbenchTab,
  ImageServiceConfigInput,
  ModelServiceConfigInput,
  SpeechServiceConfigInput,
  UserscriptAiRequest,
} from '../../ai/domain/types';
import {
  isAssistantWorkbenchTab,
  normalizeUserscriptAiRequest,
} from '../../ai/domain/types';
import type { AudioSettings } from '../../audio/AudioDirector';
import {
  type BilibiliCapabilitiesState,
  type BilibiliCapabilityCommand,
  type BilibiliCapabilityId,
  type BilibiliCapabilitySettings,
  type BilibiliCapabilitySnapshot,
  isBilibiliCapabilityCommand,
  isBilibiliCapabilityId,
  isBilibiliCapabilitySettings,
} from '../../bilibili-capabilities/domain/types';
import type {
  ContentBlockingElementSession,
  ContentBlockingGeneralSettingsInput,
  ContentBlockingSnapshot,
} from '../../content-blocking/domain/types';
import {
  type DataManagementAction,
  isDataManagementAction,
} from '../../data-management/domain/types';
import {
  type GamepadControlSettings,
  isGamepadControlSettings,
} from '../../gamepad-control/domain/settings';
import {
  isMediaResourcesSnapshot,
  type MediaResourcesSnapshot,
} from '../../media-resources/domain/types';
import {
  isMediaSpeedSelection,
  isMediaSpeedSettings,
  isMediaSpeedSnapshot,
  type MediaSpeedSelection,
  type MediaSpeedSettings,
  type MediaSpeedSnapshot,
} from '../../media-speed/domain/types';
import {
  isPageThemeSettings,
  isPageThemeSnapshot,
  type PageThemeSettings,
  type PageThemeSnapshot,
} from '../../page-theme/domain/types';
import { MAX_USERSCRIPT_COVER_PROMPT_LENGTH } from '../../userscript/application/card-cover';
import type { UserscriptRequestDetails } from '../../userscript/application/request-service';
import {
  isStoredScript,
  type StoredScript,
} from '../../userscript/application/script-repository';
import {
  normalizeUserscriptSettingsInput,
  type UserscriptSettingsInput,
} from '../../userscript/application/settings';
import {
  isUserscriptPresentation,
  type MetadataDiagnostic,
  type UserscriptPresentation,
  type UserscriptRuntimeState,
} from '../../userscript/domain/types';
import {
  isUserscriptCapability,
  type UserscriptCapability,
} from '../../userscript/runtime/capabilities';
import {
  type AudioPlaybackRequest,
  audioPlaybackRequest,
} from './audio-playback-protocol';
import { EXTENSION_CHANNEL } from './extension-channel';
import type { GamepadBrowserCommand } from './gamepad-browser-command';
import { type NewTabRequest, newTabRequest } from './new-tab-protocol';

export type {
  AudioPlaybackOptions,
  AudioPlaybackRequest,
  OffscreenAudioCommand,
  OffscreenAudioPlaybackResult,
} from './audio-playback-protocol';
export {
  audioPlaybackRequest,
  OFFSCREEN_AUDIO_CHANNEL,
  OFFSCREEN_AUDIO_PORT,
  offscreenAudioCommand,
  offscreenAudioPlaybackResult,
} from './audio-playback-protocol';
export { EXTENSION_CHANNEL } from './extension-channel';
export const MAIN_WORLD_RUNTIME_EVENT = 'card-master-main-world-runtime-state';
export const MAIN_WORLD_COMMAND_EVENT =
  'card-master-main-world-command-invocation';
export const MAIN_WORLD_SYNC_EVENT = 'card-master-main-world-sync';
export const USER_SCRIPT_PORT_PREFIX = `${EXTENSION_CHANNEL}:userscript:`;
const USER_SCRIPT_PORT_SEPARATOR = ':';

export function userScriptPortName(scriptId: string, capability: string) {
  return `${USER_SCRIPT_PORT_PREFIX}${encodeURIComponent(scriptId)}${USER_SCRIPT_PORT_SEPARATOR}${capability}`;
}

export function parseUserScriptPortName(value: string) {
  if (!value.startsWith(USER_SCRIPT_PORT_PREFIX)) return null;
  const identity = value.slice(USER_SCRIPT_PORT_PREFIX.length);
  const separator = identity.lastIndexOf(USER_SCRIPT_PORT_SEPARATOR);
  if (separator <= 0 || separator === identity.length - 1) return null;
  try {
    return {
      scriptId: decodeURIComponent(identity.slice(0, separator)),
      capability: identity.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export type ExtensionPageContext = {
  tabId: number;
  frameId: number;
};

export type UserscriptInstallPreview = {
  sourceUrl: string;
  mode: 'installed' | 'replaced';
  script: StoredScript;
  diagnostics: readonly MetadataDiagnostic[];
};

export type UserscriptInstallResult = {
  mode: 'installed' | 'replaced';
  script: StoredScript;
};

export type ExtensionRequest =
  | NewTabRequest
  | AudioPlaybackRequest
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'gamepad-browser-command';
      command: GamepadBrowserCommand;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'gamepad-control-settings-read';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'gamepad-control-settings-save';
      settings: GamepadControlSettings;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'gamepad-control-indicator-set';
      visible: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-configuration-export';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-configuration-import';
      source: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-current-site-set';
      pageUrl: string;
      enabled: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-element-batch-undo';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'fetch-update';
      url: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'get-page-context';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'userscript-capability-read';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'safari-userscript-runtime-run';
      runAt: 'document_start' | 'document_end' | 'document_idle';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'safari-main-world-injection-request';
    }
  | { channel: typeof EXTENSION_CHANNEL; type: 'ai-services-read' }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'ai-model-service-credential-clear';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'ai-model-service-save' | 'ai-model-service-test';
      config: ModelServiceConfigInput;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'ai-image-service-save';
      config: ImageServiceConfigInput;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'ai-image-service-credential-clear';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'ai-speech-service-save';
      config: SpeechServiceConfigInput;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'ai-speech-service-credential-clear';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'ai-speech-service-test';
      config?: SpeechServiceConfigInput;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'ai-assistant-surface-open';
      tab?: AssistantWorkbenchTab;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'ai-assistant-surface-context-read';
      tabId: number;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'ai-speech-authorization-open';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'ai-speech-authorization-close';
      sessionId: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'get-runtime-state';
      scriptId: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'invoke-command';
      scriptId: string;
      commandId: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'library-list';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'library-upsert';
      script: StoredScript;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'library-remove';
      scriptId: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'library-reorder';
      orderedIds: string[];
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'library-replace-all';
      scripts: StoredScript[];
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'global-library-open';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'site-script-search-open';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'userscript-settings-read';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'userscript-settings-write';
      settings: UserscriptSettingsInput;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'userscript-cover-generate';
      prompt: string;
      injectDefaultStyle: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'userscript-installer-open';
      url: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'userscript-install-preview';
      url: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'userscript-install-confirm';
      sourceUrl: string;
      source: string;
      presentation: UserscriptPresentation;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'audio-settings-read';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'audio-settings-write';
      settings: AudioSettings;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'data-management-run';
      action: DataManagementAction;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'main-world-runtime';
      scriptId: string;
      capability: string;
      message: MainWorldRuntimeMessage;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-read';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-user-rules-read';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-general-save';
      settings: ContentBlockingGeneralSettingsInput;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-set-rules-enabled';
      rulesEnabled: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-user-rules-add';
      rules: string[];
      session: ContentBlockingElementSession;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-user-rules-replace';
      userRules: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-static-filter-toggle';
      filterId: number;
      enabled: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-subscriptions-add';
      urls: string[];
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-subscription-remove';
      subscriptionId: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-subscription-toggle';
      subscriptionId: string;
      enabled: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-subscriptions-auto-update';
      enabled: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-subscription-refresh';
      subscriptionId: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-subscriptions-refresh';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'page-theme-read' | 'page-theme-settings-reset';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'page-theme-set-enabled';
      enabled: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'page-theme-toggle-current-site';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'page-theme-settings-save';
      settings: PageThemeSettings;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'page-theme-page-report';
      snapshot: PageThemeSnapshot;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'page-theme-fetch';
      request: {
        url: string;
        responseType: 'data-url' | 'text';
        mimeType?: string;
        origin: string;
      };
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-speed-read';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-speed-set-enabled';
      enabled: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-speed-selection-set';
      selection: MediaSpeedSelection;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-speed-settings-save';
      settings: MediaSpeedSettings;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-speed-frame-report';
      videoCount: number;
      audioCount: number;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-resources-read';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-resources-clear';
      targetTabId?: number;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-resources-set-enabled';
      enabled: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-resources-settings-open';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-resources-settings-update';
      presentation: {
        showPageTrigger: boolean;
        showResourceCountBadge: boolean;
      };
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type:
        | 'media-resources-download'
        | 'media-resources-inspect'
        | 'media-resources-send-aria2';
      resourceId: string;
      targetTabId: number;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-resources-download-finish';
      requestId: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-resources-capture-set';
      enabled: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-resources-capture-close';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'bilibili-capabilities-read';
      pageUrl?: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'bilibili-capability-settings-read';
      capabilityId: BilibiliCapabilityId;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'bilibili-capability-set-enabled';
      capabilityId: BilibiliCapabilityId;
      enabled: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'bilibili-capability-settings-save';
      capability: BilibiliCapabilitySettings;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'bilibili-capability-command';
      capabilityId: BilibiliCapabilityId;
      command: BilibiliCapabilityCommand;
    };

export type ExtensionRuntimeEvent =
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'runtime-state';
      scriptId: string;
      state: UserscriptRuntimeState;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'library-changed';
      orderedIds: string[];
      scripts: StoredScript[];
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-changed';
      snapshot: ContentBlockingSnapshot;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'content-blocking-user-rules-changed';
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'page-theme-settings-changed';
      settings: PageThemeSettings;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-speed-state-changed';
      settings: MediaSpeedSettings;
      selection: MediaSpeedSelection;
      activeOnPage: boolean;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-speed-page-snapshot';
      snapshot: MediaSpeedSnapshot;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'media-resources-page-snapshot';
      snapshot: MediaResourcesSnapshot;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'bilibili-capabilities-changed';
      state: BilibiliCapabilitiesState;
      snapshots: BilibiliCapabilitySnapshot[];
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'bilibili-recommendation-refresh';
      mode: string;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'audio-settings-changed';
      settings: AudioSettings;
    }
  | {
      channel: typeof EXTENSION_CHANNEL;
      type: 'main-world-command-invoke';
      scriptId: string;
      capability: string;
      commandId: string;
      invocationId: string;
    };

export type UserScriptMessage =
  | {
      type: 'ready';
    }
  | {
      type: 'register-command';
      command: UserscriptRuntimeState['commands'][number];
    }
  | {
      type: 'unregister-command';
      commandId: string;
    }
  | {
      type: 'command-result';
      invocationId: string;
      value?: unknown;
      error?: string;
    }
  | {
      type: 'set-value';
      mutationId: string;
      key: string;
      value: unknown;
    }
  | {
      type: 'delete-value';
      mutationId: string;
      key: string;
    }
  | {
      type: 'runtime-error';
      error: string;
    }
  | {
      type: 'http-request';
      requestId: string;
      details: UserscriptRequestDetails;
    }
  | {
      type: 'fetch-request';
      requestId: string;
      details: UserscriptRequestDetails;
    }
  | {
      type: 'abort-request';
      requestId: string;
    }
  | {
      type: 'ai-request';
      requestId: string;
      request: UserscriptAiRequest;
    }
  | {
      type: 'abort-ai-request';
      requestId: string;
    }
  | {
      type: 'capability-request';
      requestId: string;
      capability: UserscriptCapability;
      payload?: unknown;
    };

export type MainWorldRuntimeMessage = Extract<
  UserScriptMessage,
  {
    type:
      | 'ready'
      | 'register-command'
      | 'unregister-command'
      | 'command-result'
      | 'runtime-error';
  }
>;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function requestDetails(value: unknown): value is UserscriptRequestDetails {
  return (
    record(value) &&
    Object.values(value).every((entry) => typeof entry !== 'function') &&
    typeof value.url === 'string' &&
    (value.method === undefined || typeof value.method === 'string') &&
    (value.data === undefined ||
      typeof value.data === 'string' ||
      value.data instanceof ArrayBuffer ||
      (typeof Blob === 'function' && value.data instanceof Blob)) &&
    (value.timeout === undefined || typeof value.timeout === 'number') &&
    (value.anonymous === undefined || typeof value.anonymous === 'boolean') &&
    (value.responseType === undefined ||
      value.responseType === '' ||
      value.responseType === 'text' ||
      value.responseType === 'json' ||
      value.responseType === 'arraybuffer' ||
      value.responseType === 'blob' ||
      value.responseType === 'document' ||
      value.responseType === 'stream') &&
    (value.cookie === undefined || typeof value.cookie === 'string') &&
    (value.headers === undefined ||
      (record(value.headers) &&
        Object.values(value.headers).every(
          (header) => typeof header === 'string',
        )))
  );
}

function contentBlockingSettings(
  value: unknown,
): value is ContentBlockingGeneralSettingsInput {
  return (
    record(value) &&
    typeof value.rulesEnabled === 'boolean' &&
    Array.isArray(value.allowlist) &&
    value.allowlist.every((entry) => typeof entry === 'string')
  );
}

export function extensionRequest(value: unknown): value is ExtensionRequest {
  if (!record(value) || value.channel !== EXTENSION_CHANNEL) return false;
  if (newTabRequest(value)) return true;
  switch (value.type) {
    case 'audio-playback-prepare':
    case 'audio-playback-play':
    case 'audio-playback-settings-sync':
      return audioPlaybackRequest(value);
    case 'fetch-update':
      return typeof value.url === 'string';
    case 'get-page-context':
    case 'userscript-capability-read':
    case 'safari-main-world-injection-request':
      return true;
    case 'safari-userscript-runtime-run':
      return (
        value.runAt === 'document_start' ||
        value.runAt === 'document_end' ||
        value.runAt === 'document_idle'
      );
    case 'ai-services-read':
    case 'ai-model-service-credential-clear':
    case 'ai-image-service-credential-clear':
    case 'ai-speech-service-credential-clear':
      return true;
    case 'ai-speech-service-test':
      return (
        value.config === undefined ||
        normalizeSpeechServiceInput(value.config) !== null
      );
    case 'ai-model-service-save':
    case 'ai-model-service-test':
      return normalizeModelServiceInput(value.config) !== null;
    case 'ai-image-service-save':
      return normalizeImageServiceInput(value.config) !== null;
    case 'ai-speech-service-save':
      return normalizeSpeechServiceInput(value.config) !== null;
    case 'ai-assistant-surface-open':
      return value.tab === undefined || isAssistantWorkbenchTab(value.tab);
    case 'ai-assistant-surface-context-read':
      return (
        typeof value.tabId === 'number' &&
        Number.isSafeInteger(value.tabId) &&
        value.tabId >= 0
      );
    case 'ai-speech-authorization-open':
      return true;
    case 'ai-speech-authorization-close':
      return (
        typeof value.sessionId === 'string' &&
        value.sessionId.length > 0 &&
        value.sessionId.length <= 256
      );
    case 'get-runtime-state':
      return typeof value.scriptId === 'string';
    case 'gamepad-browser-command':
      return (
        value.command === 'back' ||
        value.command === 'forward' ||
        value.command === 'reload' ||
        value.command === 'new-tab' ||
        value.command === 'previous-tab' ||
        value.command === 'next-tab'
      );
    case 'invoke-command':
      return (
        typeof value.scriptId === 'string' &&
        typeof value.commandId === 'string'
      );
    case 'library-list':
    case 'global-library-open':
    case 'userscript-settings-read':
    case 'site-script-search-open':
      return true;
    case 'userscript-settings-write':
      return normalizeUserscriptSettingsInput(value.settings) !== null;
    case 'userscript-cover-generate':
      return (
        typeof value.prompt === 'string' &&
        value.prompt.trim().length > 0 &&
        value.prompt.length <= MAX_USERSCRIPT_COVER_PROMPT_LENGTH &&
        typeof value.injectDefaultStyle === 'boolean'
      );
    case 'library-upsert':
      return isStoredScript(value.script);
    case 'library-remove':
      return typeof value.scriptId === 'string';
    case 'library-reorder':
      return (
        Array.isArray(value.orderedIds) &&
        value.orderedIds.every((id) => typeof id === 'string')
      );
    case 'library-replace-all':
      return (
        Array.isArray(value.scripts) &&
        value.scripts.length <= 2_048 &&
        value.scripts.every(isStoredScript) &&
        value.scripts.reduce(
          (total, script) => total + script.source.code.length,
          0,
        ) <=
          48 * 1024 * 1024
      );
    case 'userscript-installer-open':
    case 'userscript-install-preview':
      return typeof value.url === 'string';
    case 'userscript-install-confirm':
      return (
        typeof value.sourceUrl === 'string' &&
        typeof value.source === 'string' &&
        isUserscriptPresentation(value.presentation)
      );
    case 'audio-settings-read':
      return true;
    case 'audio-settings-write':
      return (
        record(value.settings) &&
        typeof value.settings.muted === 'boolean' &&
        typeof value.settings.volume === 'number' &&
        Number.isFinite(value.settings.volume)
      );
    case 'data-management-run':
      return isDataManagementAction(value.action);
    case 'main-world-runtime':
      return (
        typeof value.scriptId === 'string' &&
        typeof value.capability === 'string' &&
        mainWorldRuntimeMessage(value.message)
      );
    case 'content-blocking-read':
    case 'content-blocking-user-rules-read':
    case 'content-blocking-subscriptions-refresh':
    case 'content-blocking-configuration-export':
      return true;
    case 'content-blocking-user-rules-add':
      return (
        Array.isArray(value.rules) &&
        value.rules.length > 0 &&
        value.rules.length <= 128 &&
        value.rules.every(
          (rule) => typeof rule === 'string' && rule.length <= 16_384,
        ) &&
        record(value.session) &&
        typeof value.session.sessionId === 'string' &&
        value.session.sessionId.length > 0 &&
        value.session.sessionId.length <= 128 &&
        typeof value.session.startedAt === 'number' &&
        Number.isFinite(value.session.startedAt) &&
        value.session.startedAt > 0
      );
    case 'content-blocking-element-batch-undo':
      return true;
    case 'content-blocking-general-save':
      return contentBlockingSettings(value.settings);
    case 'content-blocking-current-site-set':
      return (
        typeof value.pageUrl === 'string' &&
        value.pageUrl.length <= 8_192 &&
        typeof value.enabled === 'boolean'
      );
    case 'content-blocking-configuration-import':
      return (
        typeof value.source === 'string' &&
        value.source.length <= 32 * 1024 * 1024
      );
    case 'content-blocking-set-rules-enabled':
      return typeof value.rulesEnabled === 'boolean';
    case 'content-blocking-user-rules-replace':
      return (
        typeof value.userRules === 'string' &&
        value.userRules.length <= 4 * 1024 * 1024
      );
    case 'content-blocking-static-filter-toggle':
      return (
        typeof value.filterId === 'number' &&
        Number.isSafeInteger(value.filterId) &&
        value.filterId > 0 &&
        typeof value.enabled === 'boolean'
      );
    case 'content-blocking-subscriptions-add':
      return (
        Array.isArray(value.urls) &&
        value.urls.length > 0 &&
        value.urls.length <= 16 &&
        value.urls.every(
          (url) => typeof url === 'string' && url.length <= 2_048,
        )
      );
    case 'content-blocking-subscription-remove':
    case 'content-blocking-subscription-refresh':
      return typeof value.subscriptionId === 'string';
    case 'content-blocking-subscription-toggle':
      return (
        typeof value.subscriptionId === 'string' &&
        typeof value.enabled === 'boolean'
      );
    case 'content-blocking-subscriptions-auto-update':
      return typeof value.enabled === 'boolean';
    case 'page-theme-read':
    case 'page-theme-settings-reset':
    case 'page-theme-toggle-current-site':
      return true;
    case 'page-theme-set-enabled':
      return typeof value.enabled === 'boolean';
    case 'page-theme-settings-save':
      return isPageThemeSettings(value.settings);
    case 'page-theme-page-report':
      return isPageThemeSnapshot(value.snapshot);
    case 'page-theme-fetch':
      return (
        record(value.request) &&
        typeof value.request.url === 'string' &&
        value.request.url.length <= 8_192 &&
        (value.request.responseType === 'data-url' ||
          value.request.responseType === 'text') &&
        (value.request.mimeType === undefined ||
          (typeof value.request.mimeType === 'string' &&
            value.request.mimeType.length <= 256)) &&
        typeof value.request.origin === 'string' &&
        value.request.origin.length <= 2_048
      );
    case 'media-speed-read':
      return true;
    case 'media-speed-set-enabled':
      return typeof value.enabled === 'boolean';
    case 'media-speed-selection-set':
      return isMediaSpeedSelection(value.selection);
    case 'media-speed-settings-save':
      return isMediaSpeedSettings(value.settings);
    case 'media-speed-frame-report':
      return (
        typeof value.videoCount === 'number' &&
        Number.isSafeInteger(value.videoCount) &&
        value.videoCount >= 0 &&
        value.videoCount <= 10_000 &&
        typeof value.audioCount === 'number' &&
        Number.isSafeInteger(value.audioCount) &&
        value.audioCount >= 0 &&
        value.audioCount <= 10_000
      );
    case 'media-resources-read':
    case 'media-resources-settings-open':
    case 'media-resources-capture-close':
      return true;
    case 'media-resources-clear':
      return (
        value.targetTabId === undefined ||
        (typeof value.targetTabId === 'number' &&
          Number.isSafeInteger(value.targetTabId) &&
          value.targetTabId >= 0)
      );
    case 'media-resources-set-enabled':
    case 'media-resources-capture-set':
      return typeof value.enabled === 'boolean';
    case 'media-resources-settings-update':
      return (
        Boolean(value.presentation) &&
        typeof value.presentation === 'object' &&
        !Array.isArray(value.presentation) &&
        typeof (value.presentation as Record<string, unknown>)
          .showPageTrigger === 'boolean' &&
        typeof (value.presentation as Record<string, unknown>)
          .showResourceCountBadge === 'boolean'
      );
    case 'media-resources-download':
    case 'media-resources-inspect':
    case 'media-resources-send-aria2':
      return (
        typeof value.resourceId === 'string' &&
        value.resourceId.length > 0 &&
        value.resourceId.length <= 256 &&
        typeof value.targetTabId === 'number' &&
        Number.isSafeInteger(value.targetTabId) &&
        value.targetTabId >= 0
      );
    case 'media-resources-download-finish':
      return (
        typeof value.requestId === 'string' &&
        value.requestId.length > 0 &&
        value.requestId.length <= 256
      );
    case 'gamepad-control-settings-read':
      return true;
    case 'gamepad-control-settings-save':
      return isGamepadControlSettings(value.settings);
    case 'gamepad-control-indicator-set':
      return typeof value.visible === 'boolean';
    case 'bilibili-capabilities-read':
      return (
        value.pageUrl === undefined ||
        (typeof value.pageUrl === 'string' &&
          value.pageUrl.length > 0 &&
          value.pageUrl.length <= 8_192)
      );
    case 'bilibili-capability-settings-read':
      return isBilibiliCapabilityId(value.capabilityId);
    case 'bilibili-capability-set-enabled':
      return (
        isBilibiliCapabilityId(value.capabilityId) &&
        typeof value.enabled === 'boolean'
      );
    case 'bilibili-capability-settings-save':
      return isBilibiliCapabilitySettings(value.capability);
    case 'bilibili-capability-command':
      return (
        isBilibiliCapabilityId(value.capabilityId) &&
        isBilibiliCapabilityCommand(value.capabilityId, value.command)
      );
    default:
      return false;
  }
}

function bilibiliCapabilitySnapshot(
  value: unknown,
): value is BilibiliCapabilitySnapshot {
  return (
    record(value) &&
    isBilibiliCapabilityId(value.id) &&
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    (value.status === 'starting' ||
      value.status === 'ready' ||
      value.status === 'error') &&
    typeof value.available === 'boolean' &&
    (value.unavailableReason === undefined ||
      typeof value.unavailableReason === 'string') &&
    typeof value.enabled === 'boolean' &&
    typeof value.activeOnPage === 'boolean' &&
    typeof value.currentHost === 'string' &&
    (value.temporaryMode === 'default' ||
      value.temporaryMode === 'original-danmaku') &&
    typeof value.stateLabel === 'string' &&
    Array.isArray(value.metrics) &&
    value.metrics.every(
      (metric) =>
        record(metric) &&
        typeof metric.label === 'string' &&
        typeof metric.value === 'string',
    ) &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

export function extensionBilibiliCapabilitiesEvent(
  value: unknown,
): value is Extract<
  ExtensionRuntimeEvent,
  { type: 'bilibili-capabilities-changed' }
> {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'bilibili-capabilities-changed' &&
    record(value.state) &&
    Array.isArray(value.snapshots) &&
    value.snapshots.every(bilibiliCapabilitySnapshot)
  );
}

function contentBlockingSnapshot(
  value: unknown,
): value is ContentBlockingSnapshot {
  const batch = record(value) ? value.lastElementBlockingBatch : undefined;
  const validBatch =
    batch === null ||
    (record(batch) &&
      typeof batch.sessionId === 'string' &&
      batch.sessionId.length > 0 &&
      batch.sessionId.length <= 128 &&
      typeof batch.startedAt === 'number' &&
      Number.isFinite(batch.startedAt) &&
      batch.startedAt > 0 &&
      typeof batch.hostname === 'string' &&
      batch.hostname.length > 0 &&
      Array.isArray(batch.rules) &&
      batch.rules.length > 0 &&
      batch.rules.every((rule) => typeof rule === 'string'));
  return (
    record(value) &&
    typeof value.revision === 'number' &&
    Number.isInteger(value.revision) &&
    value.revision >= 0 &&
    typeof value.rulesEnabled === 'boolean' &&
    (value.status === 'starting' ||
      value.status === 'ready' ||
      value.status === 'error') &&
    typeof value.configurationPending === 'boolean' &&
    typeof value.loadedRuleCount === 'number' &&
    typeof value.activeRuleCount === 'number' &&
    typeof value.userRuleCount === 'number' &&
    typeof value.enabledSubscriptionCount === 'number' &&
    typeof value.subscriptionCount === 'number' &&
    typeof value.rejectedRuleCount === 'number' &&
    Array.isArray(value.allowlist) &&
    value.allowlist.every((entry) => typeof entry === 'string') &&
    validBatch &&
    Array.isArray(value.errors) &&
    value.errors.every((entry) => typeof entry === 'string') &&
    Array.isArray(value.limitations) &&
    value.limitations.every((entry) => typeof entry === 'string')
  );
}

export function extensionContentBlockingEvent(
  value: unknown,
): value is Extract<
  ExtensionRuntimeEvent,
  { type: 'content-blocking-changed' }
> {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'content-blocking-changed' &&
    contentBlockingSnapshot(value.snapshot)
  );
}

export function extensionContentBlockingUserRulesEvent(
  value: unknown,
): value is Extract<
  ExtensionRuntimeEvent,
  { type: 'content-blocking-user-rules-changed' }
> {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'content-blocking-user-rules-changed'
  );
}

export function extensionPageThemeEvent(
  value: unknown,
): value is Extract<
  ExtensionRuntimeEvent,
  { type: 'page-theme-settings-changed' }
> {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'page-theme-settings-changed' &&
    isPageThemeSettings(value.settings)
  );
}

export function extensionMediaSpeedStateEvent(
  value: unknown,
): value is Extract<
  ExtensionRuntimeEvent,
  { type: 'media-speed-state-changed' }
> {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'media-speed-state-changed' &&
    isMediaSpeedSettings(value.settings) &&
    isMediaSpeedSelection(value.selection) &&
    typeof value.activeOnPage === 'boolean'
  );
}

export function extensionMediaSpeedPageSnapshotEvent(
  value: unknown,
): value is Extract<
  ExtensionRuntimeEvent,
  { type: 'media-speed-page-snapshot' }
> {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'media-speed-page-snapshot' &&
    isMediaSpeedSnapshot(value.snapshot)
  );
}

export function extensionMediaResourcesPageSnapshotEvent(
  value: unknown,
): value is Extract<
  ExtensionRuntimeEvent,
  { type: 'media-resources-page-snapshot' }
> {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'media-resources-page-snapshot' &&
    isMediaResourcesSnapshot(value.snapshot)
  );
}

export function extensionAudioSettingsEvent(
  value: unknown,
): value is Extract<ExtensionRuntimeEvent, { type: 'audio-settings-changed' }> {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'audio-settings-changed' &&
    record(value.settings) &&
    typeof value.settings.muted === 'boolean' &&
    typeof value.settings.volume === 'number' &&
    Number.isFinite(value.settings.volume)
  );
}

export function extensionRuntimeEvent(
  value: unknown,
): value is Extract<ExtensionRuntimeEvent, { type: 'runtime-state' }> {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'runtime-state' &&
    typeof value.scriptId === 'string' &&
    record(value.state) &&
    Array.isArray(value.state.commands)
  );
}

export function mainWorldCommandInvocation(
  value: unknown,
): value is Extract<
  ExtensionRuntimeEvent,
  { type: 'main-world-command-invoke' }
> {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'main-world-command-invoke' &&
    typeof value.scriptId === 'string' &&
    typeof value.capability === 'string' &&
    typeof value.commandId === 'string' &&
    typeof value.invocationId === 'string'
  );
}

export function extensionLibraryEvent(
  value: unknown,
): value is Extract<ExtensionRuntimeEvent, { type: 'library-changed' }> {
  return (
    record(value) &&
    value.channel === EXTENSION_CHANNEL &&
    value.type === 'library-changed' &&
    Array.isArray(value.orderedIds) &&
    value.orderedIds.every((id) => typeof id === 'string') &&
    Array.isArray(value.scripts) &&
    value.scripts.every(isStoredScript)
  );
}

export function userScriptMessage(value: unknown): value is UserScriptMessage {
  if (!record(value)) return false;
  switch (value.type) {
    case 'ready':
      return true;
    case 'register-command':
      return record(value.command) && typeof value.command.id === 'string';
    case 'unregister-command':
      return typeof value.commandId === 'string';
    case 'command-result':
      return (
        typeof value.invocationId === 'string' &&
        (value.error === undefined || typeof value.error === 'string')
      );
    case 'delete-value':
      return (
        typeof value.mutationId === 'string' && typeof value.key === 'string'
      );
    case 'set-value':
      return (
        typeof value.mutationId === 'string' && typeof value.key === 'string'
      );
    case 'runtime-error':
      return typeof value.error === 'string';
    case 'http-request':
    case 'fetch-request':
      return (
        typeof value.requestId === 'string' && requestDetails(value.details)
      );
    case 'abort-request':
      return typeof value.requestId === 'string';
    case 'ai-request':
      return (
        typeof value.requestId === 'string' &&
        normalizeUserscriptAiRequest(value.request) !== null
      );
    case 'abort-ai-request':
      return typeof value.requestId === 'string';
    case 'capability-request':
      return (
        typeof value.requestId === 'string' &&
        isUserscriptCapability(value.capability)
      );
    default:
      return false;
  }
}

export function mainWorldRuntimeMessage(
  value: unknown,
): value is MainWorldRuntimeMessage {
  return (
    userScriptMessage(value) &&
    (value.type === 'ready' ||
      value.type === 'register-command' ||
      value.type === 'unregister-command' ||
      value.type === 'command-result' ||
      value.type === 'runtime-error')
  );
}
