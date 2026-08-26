import { AdguardContentBlockingEngine } from '@content-blocking-engine';
import {
  type AudioSettings,
  DEFAULT_AUDIO_SETTINGS,
  normalizeAudioSettings,
} from '../../audio/AudioDirector';
import { ContentBlockingRepository } from '../../content-blocking/application/repository';
import { ContentBlockingService } from '../../content-blocking/application/service';
import { CONTENT_BLOCKER_STATIC_FILTER_IDS } from '../../content-blocking/domain/types';
import { installAdguardBrowserApi } from '../../content-blocking/infrastructure/adguard-browser-api';
import { CacheStorageCssInjectionStorage } from '../../content-blocking/infrastructure/css-injection-storage';
import { normalizeSafariDnrUpdate } from '../../content-blocking/infrastructure/safari-dnr-compat';
import { CacheStorageSubscriptionContentStorage } from '../../content-blocking/infrastructure/subscription-content-storage';
import { WebExtensionContentBlockingRuleGate } from '../../content-blocking/infrastructure/webextension-rule-gate';
import { DataManagementService } from '../../data-management/application/service';
import { ASSISTANT_UI_PREFERENCES_STORAGE_KEY } from '../../features/assistant/assistant-ui-preferences';
import {
  DECK_ENTRY_SETTINGS_STORAGE_KEY,
  DEFAULT_DECK_ENTRY_SETTINGS,
  type DeckEntrySettings,
  normalizeDeckEntrySettings,
} from '../../features/userscript-deck/deck-entry';
import { isExtensionStorageSpaceFailure } from '../../lib/extension-errors';
import {
  NEW_TAB_PREFERENCES_STORAGE_KEY,
  normalizeNewTabPreferences,
} from '../../new-tab/application/preferences';
import {
  mergePendingPreinstalledUserscripts,
  normalizePreinstalledUserscriptState,
} from '../../userscript/application/preinstalled';
import { StorageScriptRepository } from '../../userscript/application/script-repository';
import {
  DEFAULT_USERSCRIPT_SETTINGS,
  normalizeUserscriptSettings,
  USERSCRIPT_SETTINGS_STORAGE_KEY,
  type UserscriptSettings,
  type UserscriptSettingsInput,
} from '../../userscript/application/settings';
import {
  USERSCRIPT_LIBRARY_STORAGE_KEY,
  USERSCRIPT_PREINSTALL_STATE_STORAGE_KEY,
  USERSCRIPT_VALUE_STORAGE_PREFIX,
} from '../../userscript/application/storage-keys';
import {
  applyUserscriptUpdate,
  UserscriptUpdateService,
} from '../../userscript/application/update-service';
import { isUserscriptRuleId } from '../../userscript/runtime/capabilities';
import {
  AI_MESSAGE_UNHANDLED,
  routeAiBackgroundMessage,
} from './ai-background-router';
import { ExtensionAiServices } from './ai-services';
import {
  extensionUserscriptApi,
  requireExtensionBackgroundApi,
  USER_SCRIPTS_API_UNAVAILABLE,
} from './api';
import { resolveAssistantPageAttachment } from './assistant-page-observer';
import { parseAssistantPortName } from './assistant-protocol';
import { ExtensionAssistantService } from './assistant-service';
import { AssistantSurfaceCoordinator } from './assistant-surface-background';
import { mergeAutomaticUserscriptUpdates } from './automatic-update-commit';
import { BackgroundEventBroadcaster } from './background-event-broadcaster';
import { installBackgroundLifecycle } from './background-lifecycle';
import {
  BILIBILI_RECOMMENDATION_RULE_ID,
  BilibiliCapabilityService,
} from './bilibili-capability-service';
import {
  CORE_MESSAGE_UNHANDLED,
  routeCoreBackgroundMessage,
} from './core-background-router';
import { CurrentDocumentUserscriptRunner } from './current-document-userscript-runner';
import { DailyReviewWallpaperService } from './daily-review-wallpaper-service';
import { DeckActionBadgeController } from './deck-action-badge';
import { DeckCardCountService } from './deck-card-count-service';
import {
  installExtensionDeckEntrySettingsHandler,
  mutateExtensionDeckEntrySettings,
  resetExtensionDeckEntrySettings,
} from './deck-entry-background';
import { installDeckToolbarEntry } from './deck-toolbar-entry';
import { requestDeckVisibility } from './deck-visibility';
import {
  extensionDiagnostics,
  isExtensionDiagnosticRelayMessage,
  reportRelayedExtensionDiagnostic,
} from './diagnostics';
import { GamepadBrowserCommandService } from './gamepad-browser-command';
import { ExtensionGamepadControlService } from './gamepad-control-service';
import { GlobalLibraryHostCoordinator } from './global-library-host';
import {
  INSTALL_REDIRECT_RULE_ID,
  UserscriptInstallInterceptor,
} from './installer';
import { LumnoNewTabCompatibilityService } from './lumno-new-tab-compat';
import { ExtensionMediaResourcesService } from './media-resources-service';
import { ExtensionMediaSpeedService } from './media-speed-service';
import { routeNewTabBackgroundMessage } from './new-tab-background-router';
import { ExtensionNewTabService } from './new-tab-service';
import { OffscreenAudioCoordinator } from './offscreen-audio-coordinator';
import {
  PAGE_CAPABILITY_MESSAGE_UNHANDLED,
  routePageCapabilityBackgroundMessage,
} from './page-capability-background-router';
import {
  refreshContentBlockingPageHosts,
  refreshExtensionPageHosts,
} from './page-host-refresh';
import { ExtensionPageThemeService } from './page-theme-service';
import { extensionTarget } from './platform';
import {
  audioPlaybackRequest,
  EXTENSION_CHANNEL,
  extensionRequest,
  parseUserScriptPortName,
} from './protocol';
import { RegisteredUserscriptSynchronizer } from './registration-sync';
import {
  ExtensionRuntimeBridge,
  RUNTIME_DIAGNOSTIC_STORAGE_PREFIX,
} from './runtime-bridge';
import {
  installSponsorRuntimeStorageHost,
  SponsorRuntimeStorageService,
} from './sponsor-runtime-storage';
import { ExtensionStringStorage } from './storage';
import { configureExtensionStorageAccess } from './storage-access';
import {
  UserscriptActivationCoordinator,
  type UserscriptActivationResult,
} from './userscript-activation-coordinator';
import {
  USERSCRIPT_LIBRARY_MESSAGE_UNHANDLED,
  UserscriptLibraryCoordinator,
  userscriptBackgroundErrorResponse,
} from './userscript-library-coordinator';
import {
  SPEECH_AUTHORIZATION_RULE_ID,
  VolcengineSpeechAuthorizationCoordinator,
} from './volcengine-speech-session';

const api = requireExtensionBackgroundApi();
const newTabService = new ExtensionNewTabService(api);
const lumnoNewTabCompatibility = new LumnoNewTabCompatibilityService(api);
const gamepadControlService = new ExtensionGamepadControlService(api);
const gamepadBrowserCommands = new GamepadBrowserCommandService(
  api,
  gamepadControlService,
);
const userscriptApi = extensionUserscriptApi(api);
const safariUserscriptRuntime = extensionTarget() === 'safari';
const offscreenAudio = new OffscreenAudioCoordinator(api);
const CONTENT_BLOCKING_REFRESH_ALARM = 'content-blocking.refresh-subscriptions';
const USERSCRIPT_UPDATE_ALARM = 'userscript.update-check';
const DAILY_REVIEW_WALLPAPER_ALARM = 'new-tab.daily-review-wallpaper';
const AUDIO_SETTINGS_STORAGE_KEY = 'card-master.audio-settings.v1';
type StorageRecoveryStatus = 'checking' | 'ready' | 'pending';
let storageRecoveryStatus: StorageRecoveryStatus = 'checking';
let storageRecoveryWarningReported = false;
const globalLibraryHost = new GlobalLibraryHostCoordinator(api);
const backgroundEvents = new BackgroundEventBroadcaster(api);
const repository = new StorageScriptRepository(
  new ExtensionStringStorage(api.storage.local),
  USERSCRIPT_LIBRARY_STORAGE_KEY,
  [],
);
const automaticUpdater = new UserscriptUpdateService();
const synchronizer =
  userscriptApi || safariUserscriptRuntime
    ? new RegisteredUserscriptSynchronizer(api, repository)
    : null;
const contentBlockingRuleGate = new WebExtensionContentBlockingRuleGate(api, {
  managedStaticRuleSetIds: CONTENT_BLOCKER_STATIC_FILTER_IDS.map(
    (filterId) => `ruleset_${filterId}`,
  ),
  cssStorage: new CacheStorageCssInjectionStorage(caches),
  canOwnDynamicRule: (rule) =>
    rule.id !== INSTALL_REDIRECT_RULE_ID && !isUserscriptRuleId(rule.id),
  canOwnSessionRule: (rule) =>
    rule.id !== SPEECH_AUTHORIZATION_RULE_ID &&
    rule.id !== BILIBILI_RECOMMENDATION_RULE_ID &&
    !(rule.id >= 8_710_000 && rule.id < 9_110_000) &&
    rule.priority !== 920372 &&
    !isUserscriptRuleId(rule.id),
  ...(safariUserscriptRuntime
    ? { normalizeRuleUpdate: normalizeSafariDnrUpdate }
    : {}),
  reportError: (event, error) =>
    extensionDiagnostics.warn('content-blocking-rule-gate', event, error),
});
installAdguardBrowserApi(contentBlockingRuleGate);
const contentBlockingRepository = new ContentBlockingRepository(
  api.storage.local,
  new CacheStorageSubscriptionContentStorage(caches),
);
const contentBlockingService = new ContentBlockingService(
  contentBlockingRepository,
  new AdguardContentBlockingEngine(
    contentBlockingRuleGate,
    Boolean(userscriptApi),
  ),
  {
    reportError: (event, error) =>
      extensionDiagnostics.error('content-blocking-service', event, error),
    onConfigurationApplied: scheduleContentBlockingPageRefresh,
    onUserRulesChanged: () => {
      void backgroundEvents
        .send(
          {
            channel: EXTENSION_CHANNEL,
            type: 'content-blocking-user-rules-changed',
          },
          'content-blocking-user-rules-broadcast-incomplete',
          '部分页面没有接收自定义规则更新。',
        )
        .catch((error) =>
          reportBackgroundError(
            'content blocking user rules broadcast failed',
            error,
          ),
        );
    },
  },
);
const pageThemeService = new ExtensionPageThemeService(api);
const mediaSpeedService = new ExtensionMediaSpeedService(api);
const mediaResourcesService = new ExtensionMediaResourcesService(api);
const sponsorRuntimeStorage = new SponsorRuntimeStorageService(api);
installSponsorRuntimeStorageHost(sponsorRuntimeStorage);
const bilibiliCapabilityService = new BilibiliCapabilityService(
  api,
  sponsorRuntimeStorage,
);

function storageRecoveryUnavailable() {
  return storageRecoveryStatus !== 'ready';
}

function markStorageRecoveryPending(error?: unknown) {
  storageRecoveryStatus = 'pending';
  if (storageRecoveryWarningReported) return;
  storageRecoveryWarningReported = true;
  extensionDiagnostics.warn(
    'background',
    'storage-recovery-pending',
    error ??
      new Error(
        'Edge 当前进程仍拒绝写入旧扩展存储。内容拦截规则所有权已转入独立缓存；请完全退出并重新打开 Edge，以完成旧数据库清理。',
      ),
  );
}

const deckCardCounts = new DeckCardCountService({
  api,
  repository,
  contentBlocking: contentBlockingService,
  pageTheme: pageThemeService,
  mediaSpeed: mediaSpeedService,
  mediaResources: mediaResourcesService,
  gamepadControl: gamepadControlService,
  platformCapabilities: bilibiliCapabilityService,
  storageAvailable: () => !storageRecoveryUnavailable(),
  onStorageFailure: markStorageRecoveryPending,
});
const deckActionBadge = new DeckActionBadgeController(api);

async function readDeckBadgeSettings() {
  try {
    const stored = await api.storage.local.get(DECK_ENTRY_SETTINGS_STORAGE_KEY);
    return normalizeDeckEntrySettings(stored[DECK_ENTRY_SETTINGS_STORAGE_KEY]);
  } catch (error) {
    if (!isExtensionStorageSpaceFailure(error)) throw error;
    markStorageRecoveryPending(error);
    return DEFAULT_DECK_ENTRY_SETTINGS;
  }
}

async function resolveDeckActionBadge(
  url: string,
  tabId: number,
  settings?: DeckEntrySettings,
) {
  const current = settings ?? (await readDeckBadgeSettings());
  const counts = await deckCardCounts.read(url, current, tabId);
  return {
    count: counts.activeCount,
    visible: current.showToolbarBadge,
  };
}

installExtensionDeckEntrySettingsHandler(api, {
  readCardCounts: (url, settings, tabId) =>
    deckCardCounts.read(url, settings, tabId),
  updateActiveCardCount: (tabId, activeCount, visible) =>
    deckActionBadge.setTabCount(tabId, activeCount, visible),
  refreshActiveCardCounts: (settings) =>
    deckActionBadge.refreshAll((url, tabId) =>
      resolveDeckActionBadge(url, tabId, settings),
    ),
  onStorageReadFailure: markStorageRecoveryPending,
});
deckActionBadge.installNavigationSync(resolveDeckActionBadge);
function refreshDeckActionBadgeForTab(tabId: number) {
  void api.tabs
    .get(tabId)
    .then((tab) =>
      tab.url
        ? resolveDeckActionBadge(tab.url, tabId).then(({ count, visible }) =>
            deckActionBadge.setTabCount(tabId, count, visible),
          )
        : undefined,
    )
    .catch(() => undefined);
}
mediaResourcesService.subscribe(refreshDeckActionBadgeForTab);
pageThemeService.subscribe(refreshDeckActionBadgeForTab);
const aiServices = new ExtensionAiServices(api.storage.local);
const dailyReviewWallpaper = new DailyReviewWallpaperService(api, aiServices);
api.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const change = changes[NEW_TAB_PREFERENCES_STORAGE_KEY];
  if (!change) return;
  const previous = normalizeNewTabPreferences(change.oldValue);
  const next = normalizeNewTabPreferences(change.newValue);
  if (
    previous.wallpaperSource === 'daily-review' ||
    next.wallpaperSource !== 'daily-review'
  ) {
    return;
  }
  const request = dailyReviewWallpaper.start({ trigger: 'configuration' });
  void request.operation
    .then((state) =>
      !request.started && state.status === 'disabled'
        ? dailyReviewWallpaper.run('configuration')
        : undefined,
    )
    .catch((error) => reportBackgroundError('每日回顾启用后生成失败', error));
});
const speechAuthorization = new VolcengineSpeechAuthorizationCoordinator(
  api.declarativeNetRequest,
);
const runtimeBridge = synchronizer
  ? new ExtensionRuntimeBridge(api, synchronizer, undefined, aiServices)
  : null;
const installInterceptor = new UserscriptInstallInterceptor(api);
const assistantSurface = new AssistantSurfaceCoordinator(
  api,
  (event, error, details) =>
    extensionDiagnostics.warn('assistant-surface', event, error, details),
);
assistantSurface.install();
installDeckToolbarEntry(api, {
  ...(api.sidebarAction
    ? {
        openToolbarSurface: async (tab: chrome.tabs.Tab) => {
          if (typeof tab.id !== 'number') {
            throw new Error('Firefox 工具栏操作缺少当前标签页身份。');
          }
          await assistantSurface.open(tab.id);
        },
      }
    : {}),
});
const currentDocumentRunner =
  synchronizer && runtimeBridge && (userscriptApi || safariUserscriptRuntime)
    ? new CurrentDocumentUserscriptRunner(
        {
          ...(userscriptApi ? { userScripts: userscriptApi.userScripts } : {}),
          scripting: api.scripting,
        },
        synchronizer,
        runtimeBridge,
      )
    : null;
const activationCoordinator = new UserscriptActivationCoordinator(
  api,
  runtimeBridge,
  currentDocumentRunner,
  (tabId) => resolveAssistantPageAttachment(api, tabId),
  readUserscriptSettings,
  (event, error, details) =>
    extensionDiagnostics.warn('userscript-activation', event, error, details),
);
const userscriptLibrary = new UserscriptLibraryCoordinator({
  api,
  repository,
  synchronizer,
  runtimeBridge,
  activation: activationCoordinator,
  installer: installInterceptor,
  globalLibrary: globalLibraryHost,
  nativeUserscriptsAvailable: Boolean(userscriptApi),
  safariRuntime: safariUserscriptRuntime,
  scheduleActivationReload,
  reportFailure: reportBackgroundError,
});
const assistantService = new ExtensionAssistantService(
  api,
  repository,
  aiServices,
  (previous, next, tabId) =>
    userscriptLibrary.commit(previous, next, tabId).then(({ activation }) => {
      const reloadPlan = activation.reloadPlan;
      if (reloadPlan) {
        setTimeout(() => activationCoordinator.scheduleReload(reloadPlan), 500);
      }
      return activation;
    }),
  (tabId) => resolveAssistantPageAttachment(api, tabId),
  {
    readRuntimeStates: async (tabId) => {
      const [scripts, attachment] = await Promise.all([
        repository.list(),
        resolveAssistantPageAttachment(api, tabId),
      ]);
      return Promise.all(
        scripts.map(async (script) => ({
          scriptId: script.id,
          name: script.metadata.name,
          enabled: script.manager.enabled,
          runtime: runtimeBridge
            ? ((await runtimeBridge.state(
                tabId,
                0,
                script.id,
                attachment.target.documentId,
              )) ?? null)
            : null,
        })),
      );
    },
    readRuntimeState: async (tabId, scriptId) => {
      if (!runtimeBridge) return undefined;
      const attachment = await resolveAssistantPageAttachment(api, tabId);
      return runtimeBridge.state(
        tabId,
        0,
        scriptId,
        attachment.target.documentId,
      );
    },
    invokeRuntimeCommand: async (tabId, scriptId, commandId) => {
      if (!runtimeBridge) throw new Error(USER_SCRIPTS_API_UNAVAILABLE);
      const result = await runtimeBridge.invoke(tabId, 0, scriptId, commandId);
      if (result.ok) return result.value;
      const { error } = result;
      if (error === 'The script instance is not running.') {
        throw new Error('当前页面没有正在运行的脚本实例。');
      }
      if (error === 'The runtime command is no longer registered.') {
        throw new Error('该脚本指令已经失效，请重新读取运行时状态。');
      }
      throw new Error(error);
    },
    readPageUrl: async (tabId) => {
      const tab = await api.tabs.get(tabId);
      if (!tab.url) throw new Error('当前标签页没有可用地址。');
      return tab.url;
    },
    setDeckVisibility: (tabId, visibility) =>
      requestDeckVisibility(api, tabId, visibility),
  },
);
const dataManagementService = new DataManagementService({
  resetPreferences,
  removeScripts: removeAllScripts,
  clearScriptValues: clearAllScriptValues,
  clearAssistantConversations: () => assistantService.clearConversations(),
  clearAssistantConfig: async () => {
    await aiServices.clearConfig();
  },
  resetAssistantPins: async () => {
    await api.storage.local.remove(ASSISTANT_UI_PREFERENCES_STORAGE_KEY);
  },
  resetContentBlocking: async () => {
    await contentBlockingService.start();
    await contentBlockingService.reset();
  },
  resetPageTheme: async () => {
    await pageThemeService.reset();
  },
  resetMediaSpeed: () => mediaSpeedService.reset(),
  resetMediaResources: () => mediaResourcesService.reset(),
  resetGamepadControl: () => gamepadControlService.reset(),
  resetBilibiliCapabilities: async () => {
    await sponsorRuntimeStorage.reset();
    await bilibiliCapabilityService.reset();
  },
  clearDiagnostics: clearRuntimeDiagnostics,
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function scheduleActivationReload(activation: UserscriptActivationResult) {
  if (activation.reloadPlan) {
    activationCoordinator.scheduleReload(activation.reloadPlan);
  }
}

function reportBackgroundError(context: string, error: unknown) {
  extensionDiagnostics.error('background', context, error);
}

async function runBackgroundInitializationPhase<Result>(
  phase: string,
  operation: () => Promise<Result>,
) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(`后台初始化阶段“${phase}”失败：${errorMessage(error)}`, {
      cause: error,
    });
  }
}

async function readUserscriptSettings() {
  const stored = (await api.storage.local.get(USERSCRIPT_SETTINGS_STORAGE_KEY))[
    USERSCRIPT_SETTINGS_STORAGE_KEY
  ];
  return normalizeUserscriptSettings(stored);
}

async function persistUserscriptSettings(settings: UserscriptSettings) {
  await api.storage.local.set({
    [USERSCRIPT_SETTINGS_STORAGE_KEY]: settings,
  });
  return settings;
}

async function scheduleUserscriptUpdateAlarm(
  suppliedSettings?: UserscriptSettings,
) {
  const settings = suppliedSettings ?? (await readUserscriptSettings());
  await api.alarms.clear(USERSCRIPT_UPDATE_ALARM);
  if (settings.updateIntervalDays === 0) return;
  const periodInMinutes = settings.updateIntervalDays * 24 * 60;
  const elapsedMinutes = Math.max(
    0,
    (Date.now() - settings.lastUpdateCheckAt) / 60_000,
  );
  const delayInMinutes =
    settings.lastUpdateCheckAt === 0
      ? 1
      : Math.max(1, periodInMinutes - elapsedMinutes);
  await api.alarms.create(USERSCRIPT_UPDATE_ALARM, {
    delayInMinutes,
    periodInMinutes,
  });
}

async function writeUserscriptSettings(input: UserscriptSettingsInput) {
  const current = await readUserscriptSettings();
  const settings = normalizeUserscriptSettings({
    ...current,
    ...input,
  });
  await persistUserscriptSettings(settings);
  await scheduleUserscriptUpdateAlarm(settings);
  return settings;
}

async function resetPreferences() {
  const settings = await persistUserscriptSettings({
    ...DEFAULT_USERSCRIPT_SETTINGS,
  });
  await Promise.all([
    scheduleUserscriptUpdateAlarm(settings),
    resetExtensionDeckEntrySettings(api, (deckSettings) =>
      deckActionBadge.refreshAll((url, tabId) =>
        resolveDeckActionBadge(url, tabId, deckSettings),
      ),
    ),
    writeAudioSettings(DEFAULT_AUDIO_SETTINGS),
  ]);
}

async function readAudioSettings() {
  const stored = (await api.storage.local.get(AUDIO_SETTINGS_STORAGE_KEY))[
    AUDIO_SETTINGS_STORAGE_KEY
  ];
  return normalizeAudioSettings(stored) ?? { ...DEFAULT_AUDIO_SETTINGS };
}

async function writeAudioSettings(input: AudioSettings) {
  const settings = normalizeAudioSettings(input);
  if (!settings) throw new Error('声音设置无效。');
  await api.storage.local.set({
    [AUDIO_SETTINGS_STORAGE_KEY]: settings,
  });
  await backgroundEvents.send(
    {
      channel: EXTENSION_CHANNEL,
      type: 'audio-settings-changed',
      settings,
    },
    'audio-settings-broadcast-incomplete',
    '部分页面没有接收声音设置更新。',
  );
  return settings;
}

async function removeAllScripts() {
  return userscriptLibrary.removeAll();
}

async function installPendingPreinstalledUserscripts() {
  const stored = (
    await api.storage.local.get(USERSCRIPT_PREINSTALL_STATE_STORAGE_KEY)
  )[USERSCRIPT_PREINSTALL_STATE_STORAGE_KEY];
  const state = normalizePreinstalledUserscriptState(stored);
  const committed = await repository.transact((current) => {
    const merged = mergePendingPreinstalledUserscripts(current, state);
    return {
      scripts: merged.changedIds.length > 0 ? merged.scripts : current,
      result: {
        state: merged.state,
        changedIds: merged.changedIds,
        hideCardIds: merged.hideCardIds,
      },
    };
  });
  for (const cardId of committed.result.hideCardIds) {
    await mutateExtensionDeckEntrySettings(api, {
      kind: 'set-card-hidden',
      cardId,
      hidden: true,
    });
  }
  if (JSON.stringify(stored) === JSON.stringify(committed.result.state)) {
    return;
  }
  await api.storage.local.set({
    [USERSCRIPT_PREINSTALL_STATE_STORAGE_KEY]: committed.result.state,
  });
}

async function clearAllScriptValues() {
  if (runtimeBridge) return runtimeBridge.clearValues();
  const stored = await api.storage.local.get(null);
  const keys = Object.keys(stored).filter((key) =>
    key.startsWith(`${USERSCRIPT_VALUE_STORAGE_PREFIX}:`),
  );
  if (keys.length > 0) await api.storage.local.remove(keys);
  return keys.length;
}

async function clearRuntimeDiagnostics() {
  if (runtimeBridge) {
    await runtimeBridge.clearDiagnostics();
    return;
  }
  const stored = await api.storage.session.get(null);
  const keys = Object.keys(stored).filter((key) =>
    key.startsWith(`${RUNTIME_DIAGNOSTIC_STORAGE_PREFIX}:`),
  );
  if (keys.length > 0) await api.storage.session.remove(keys);
}

let automaticUpdatePromise: Promise<void> | null = null;

function runAutomaticUserscriptUpdates() {
  if (automaticUpdatePromise) return automaticUpdatePromise;
  const operation = (async () => {
    const settings = await readUserscriptSettings();
    if (settings.updateIntervalDays === 0) return;
    const scripts = await repository.list();
    const candidates = new Map<
      string,
      { previousSource: string; script: (typeof scripts)[number] }
    >();
    for (const script of scripts) {
      if (settings.updateEnabledOnly && !script.manager.enabled) continue;
      try {
        const result = await automaticUpdater.check(script, 'automatic');
        if (result.status !== 'available') continue;
        const downloaded = await automaticUpdater.download(result);
        const updated = applyUserscriptUpdate(script, downloaded, {
          now: Date.now,
        });
        candidates.set(script.id, {
          previousSource: script.source.code,
          script: updated,
        });
      } catch (error) {
        extensionDiagnostics.warn(
          'userscript-auto-update',
          'script-update-failed',
          error,
          { scriptId: script.id },
        );
      }
    }
    if (candidates.size > 0) {
      const commitSettings = await readUserscriptSettings();
      const committed = await repository.transact((current) => {
        const merged = mergeAutomaticUserscriptUpdates(
          current,
          candidates,
          commitSettings,
        );
        return {
          scripts: merged.scripts,
          result: {
            changedIds: merged.changedIds,
            previous: [...current],
          },
        };
      });
      if (committed.result.changedIds.length > 0) {
        await userscriptLibrary.commit(
          committed.result.previous,
          committed.scripts,
        );
      }
    }
    const latest = await readUserscriptSettings();
    await persistUserscriptSettings({
      ...latest,
      lastUpdateCheckAt: Date.now(),
    });
  })();
  automaticUpdatePromise = operation;
  void operation.then(
    () => {
      if (automaticUpdatePromise === operation) automaticUpdatePromise = null;
    },
    () => {
      if (automaticUpdatePromise === operation) automaticUpdatePromise = null;
    },
  );
  return operation;
}

function scheduleContentBlockingPageRefresh() {
  void refreshContentBlockingPageHosts(api).catch((error) =>
    reportBackgroundError('content blocking page refresh failed', error),
  );
}

if (userscriptApi && runtimeBridge) {
  userscriptApi.runtime.onUserScriptConnect.addListener((port) => {
    const identity = parseUserScriptPortName(port.name);
    if (!identity) {
      port.disconnect();
      return;
    }
    void runtimeBridge.connect(port, identity).catch(() => port.disconnect());
  });
}

api.runtime.onConnect.addListener((port) => {
  if (!userscriptApi && runtimeBridge) {
    const identity = parseUserScriptPortName(port.name);
    if (identity) {
      void runtimeBridge.connect(port, identity).catch(() => port.disconnect());
      return;
    }
  }
  if (
    offscreenAudio.connect(port) ||
    offscreenAudio.connectSpeechClient(port) ||
    offscreenAudio.connectSpeechRecognitionClient(
      port,
      aiServices,
      speechAuthorization,
    )
  ) {
    return;
  }
  const tabId = parseAssistantPortName(port.name);
  if (tabId !== null) assistantService.connect(port, tabId);
});

contentBlockingService.subscribe((snapshot) => {
  void backgroundEvents
    .send(
      {
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-changed',
        snapshot,
      },
      'content-blocking-broadcast-incomplete',
      '部分页面没有接收内容拦截状态更新。',
    )
    .catch((error) =>
      reportBackgroundError('content blocking broadcast failed', error),
    );
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sponsorRuntimeStorage.handlesMessage(message, sender, sendResponse)) {
    return true;
  }
  if (isExtensionDiagnosticRelayMessage(message)) {
    reportRelayedExtensionDiagnostic(message, {
      tabId: sender.tab?.id,
      frameId: sender.frameId,
      documentId: sender.documentId,
      url: sender.url,
    });
    sendResponse({ ok: true });
    return;
  }
  if (audioPlaybackRequest(message)) {
    void offscreenAudio
      .handle(message)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          supported: true,
          error: errorMessage(error),
        }),
      );
    return true;
  }
  if (
    bilibiliCapabilityService.handlesPakkuMessage(message, sender, sendResponse)
  ) {
    return true;
  }
  if (contentBlockingService.handlesMessage(message)) {
    void initialize()
      .then(() => contentBlockingService.handleMessage(message, sender))
      .then(sendResponse)
      .catch((error) => sendResponse({ error: errorMessage(error) }));
    return true;
  }
  if (
    routeNewTabBackgroundMessage(message, sender, sendResponse, {
      compatibility: lumnoNewTabCompatibility,
      service: newTabService,
      dailyReview: dailyReviewWallpaper,
      reportFailure: reportBackgroundError,
    })
  ) {
    return true;
  }
  if (!extensionRequest(message)) return;
  if (message.type === 'content-blocking-user-rules-read') {
    void contentBlockingRepository
      .readUserRules()
      .then((userRules) => sendResponse({ userRules }))
      .catch((error) => sendResponse({ error: errorMessage(error) }));
    return true;
  }
  if (message.type === 'ai-assistant-surface-open') {
    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number') {
      sendResponse(
        userscriptBackgroundErrorResponse(
          new Error('卡牌大师智能体请求缺少当前标签页身份。'),
        ),
      );
      return true;
    }
    void assistantSurface
      .open(tabId, message.tab)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse(userscriptBackgroundErrorResponse(error)));
    return true;
  }
  void (async () => {
    await initialize();
    const pageCapabilityResponse = await routePageCapabilityBackgroundMessage(
      message,
      sender,
      {
        api,
        contentBlocking: contentBlockingService,
        pageTheme: pageThemeService,
        mediaSpeed: mediaSpeedService,
        mediaResources: mediaResourcesService,
        platformCapabilities: bilibiliCapabilityService,
        refreshContentBlockingPages: scheduleContentBlockingPageRefresh,
      },
    );
    if (pageCapabilityResponse !== PAGE_CAPABILITY_MESSAGE_UNHANDLED) {
      return pageCapabilityResponse;
    }
    const aiResponse = await routeAiBackgroundMessage(message, {
      services: aiServices,
      assistantSurface,
      dailyReview: dailyReviewWallpaper,
      offscreenAudio,
      speechAuthorization,
      reportFailure: reportBackgroundError,
    });
    if (aiResponse !== AI_MESSAGE_UNHANDLED) return aiResponse;
    const userscriptResponse = await userscriptLibrary.route(message, sender);
    if (userscriptResponse !== USERSCRIPT_LIBRARY_MESSAGE_UNHANDLED) {
      return userscriptResponse;
    }
    const coreResponse = await routeCoreBackgroundMessage(message, sender, {
      gamepadCommands: gamepadBrowserCommands,
      gamepad: gamepadControlService,
      readUserscriptSettings,
      writeUserscriptSettings,
      readAudioSettings,
      writeAudioSettings,
      dataManagement: dataManagementService,
    });
    return coreResponse === CORE_MESSAGE_UNHANDLED ? undefined : coreResponse;
  })()
    .then(sendResponse)
    .catch((error) => sendResponse(userscriptBackgroundErrorResponse(error)));
  return true;
});

async function initializeBackground() {
  await runBackgroundInitializationPhase('配置扩展存储访问', () =>
    configureExtensionStorageAccess(api.storage),
  );
  await runBackgroundInitializationPhase('恢复内容拦截规则所有权', () =>
    contentBlockingRuleGate.initializeOwnership(),
  );
  storageRecoveryStatus = 'ready';
  await runBackgroundInitializationPhase('启动脚本安装拦截', () =>
    installInterceptor.start(),
  );
  if (!storageRecoveryUnavailable()) {
    try {
      await runBackgroundInitializationPhase('同步预装脚本', () =>
        installPendingPreinstalledUserscripts(),
      );
    } catch (error) {
      if (!isExtensionStorageSpaceFailure(error)) throw error;
      markStorageRecoveryPending(error);
    }
  }
  if (!storageRecoveryUnavailable()) {
    await bilibiliCapabilityService.readState().catch((error) => {
      if (isExtensionStorageSpaceFailure(error)) {
        markStorageRecoveryPending(error);
        return;
      }
      reportBackgroundError('平台能力初始化失败', error);
    });
  }
  const storageDependentPhases: ReadonlyArray<
    readonly [string, () => Promise<unknown>]
  > = [
    [
      '同步用户脚本运行时',
      async () => {
        await synchronizer?.schedule();
      },
    ],
    ['读取页面光影设置', () => pageThemeService.read()],
    ['读取媒体倍速设置', () => mediaSpeedService.readSettings()],
    ['读取媒体资源设置', () => mediaResourcesService.readSettings()],
    ['读取手柄设置', () => gamepadControlService.readSettings()],
    ['安排脚本更新检查', () => scheduleUserscriptUpdateAlarm()],
  ];
  for (const [phase, operation] of storageDependentPhases) {
    if (storageRecoveryUnavailable()) break;
    try {
      await runBackgroundInitializationPhase(phase, operation);
    } catch (error) {
      if (!isExtensionStorageSpaceFailure(error)) throw error;
      markStorageRecoveryPending(error);
    }
  }
  await api.alarms.create(CONTENT_BLOCKING_REFRESH_ALARM, {
    delayInMinutes: 15,
    periodInMinutes: 24 * 60,
  });
  await api.alarms.create(DAILY_REVIEW_WALLPAPER_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: 60,
  });
  await runBackgroundInitializationPhase('刷新工具栏卡牌数量', async () => {
    await deckActionBadge.initialize();
    await deckActionBadge.refreshAll(resolveDeckActionBadge);
  });
}

let initializationPromise: Promise<void> | null = null;

function initialize() {
  if (!initializationPromise) {
    initializationPromise = initializeBackground().catch((error) => {
      initializationPromise = null;
      reportBackgroundError('initialization failed', error);
      throw error;
    });
  }
  return initializationPromise;
}

installBackgroundLifecycle({
  api,
  alarms: {
    contentBlocking: CONTENT_BLOCKING_REFRESH_ALARM,
    userscriptUpdates: USERSCRIPT_UPDATE_ALARM,
    dailyReview: DAILY_REVIEW_WALLPAPER_ALARM,
  },
  initialize,
  storageAvailable: () => !storageRecoveryUnavailable(),
  refreshContentBlocking: async () => {
    const settings = await contentBlockingService.readSettings();
    if (settings.autoUpdateSubscriptions && settings.subscriptions.length > 0) {
      await contentBlockingService.refreshSubscriptions();
    }
  },
  runUserscriptUpdates: runAutomaticUserscriptUpdates,
  runDailyReview: (trigger) => dailyReviewWallpaper.run(trigger),
  refreshExistingPages: () => refreshExtensionPageHosts(api),
  reportFailure: reportBackgroundError,
});
