import type {
  ContentBlockingController,
  ContentBlockingElementSession,
  ContentBlockingGeneralSettingsInput,
  ContentBlockingSettingsView,
  ContentBlockingSnapshot,
  ContentBlockingSnapshotListener,
  ContentBlockingUserRulesListener,
} from '../../content-blocking/domain/types';
import {
  ADGUARD_COSMETIC_APPLIED_EVENT,
  ADGUARD_COSMETIC_REVISION_DATASET,
} from './adguard-cosmetic-protocol';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  ExtensionMessageSubscription,
  sendExtensionRequest,
} from './api';
import { extensionDiagnostics } from './diagnostics';
import {
  EXTENSION_CHANNEL,
  extensionContentBlockingEvent,
  extensionContentBlockingUserRulesEvent,
} from './protocol';

type SnapshotResponse = {
  settings?: ContentBlockingSettingsView;
  snapshot?: ContentBlockingSnapshot;
  error?: string;
};

type UserRulesResponse = {
  userRules?: string;
  error?: string;
};

type ConfigurationResponse = {
  source?: string;
  error?: string;
};

const USER_RULE_BATCH_DELAY_MS = 24;
const MAX_USER_RULE_BATCH_SIZE = 128;
const COSMETIC_REVISION_TIMEOUT_MS = 5_000;
const SETTINGS_CACHE_TTL_MS = 15_000;

type UserRuleRequest = {
  resolve: (snapshot: ContentBlockingSnapshot) => void;
  reject: (error: unknown) => void;
};

function snapshotResponse(response: SnapshotResponse) {
  if (response.error) throw new Error(response.error);
  if (!response.snapshot) {
    throw new Error(
      'The extension returned an invalid content blocking state.',
    );
  }
  return response.snapshot;
}

function settingsResponse(response: SnapshotResponse) {
  if (response.error) throw new Error(response.error);
  if (!response.settings) {
    throw new Error(
      'The extension returned invalid content blocking settings.',
    );
  }
  return response.settings;
}

function userRulesResponse(response: UserRulesResponse) {
  if (response.error) throw new Error(response.error);
  if (typeof response.userRules !== 'string') {
    throw new Error('The extension returned invalid content blocking rules.');
  }
  return response.userRules;
}

function configurationResponse(response: ConfigurationResponse) {
  if (response.error) throw new Error(response.error);
  if (typeof response.source !== 'string') {
    throw new Error(
      'The extension returned an invalid content blocking configuration.',
    );
  }
  return response.source;
}

export class ExtensionContentBlockingController
  implements ContentBlockingController
{
  private readonly listeners = new Set<ContentBlockingSnapshotListener>();
  private readonly userRulesListeners =
    new Set<ContentBlockingUserRulesListener>();
  private settingsCache: ContentBlockingSettingsView | null = null;
  private currentSnapshot: ContentBlockingSnapshot | null = null;
  private settingsCachedAt = 0;
  private stateReadPromise: Promise<SnapshotResponse> | null = null;
  private userRulesCache: string | null = null;
  private userRulesReadPromise: Promise<string> | null = null;
  private userRulesGeneration = 0;
  private diagnosticFingerprint: string | null = null;
  private readonly pendingUserRules = new Set<string>();
  private pendingUserRuleRequests: UserRuleRequest[] = [];
  private pendingUserRuleSession: ContentBlockingElementSession | null = null;
  private userRuleBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private userRuleBatchPromise: Promise<ContentBlockingSnapshot> | null = null;
  private cosmeticRevision = 0;
  private readonly cosmeticWaiters = new Set<{
    revision: number;
    resolve: (applied: boolean) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private readonly handleCosmeticApplied = (event: Event) => {
    const revision =
      event instanceof CustomEvent &&
      event.detail &&
      typeof event.detail === 'object' &&
      typeof event.detail.revision === 'number'
        ? event.detail.revision
        : Number(
            this.pageDocument?.documentElement.dataset[
              ADGUARD_COSMETIC_REVISION_DATASET
            ] ?? 0,
          );
    if (!Number.isFinite(revision)) return;
    this.cosmeticRevision = Math.max(this.cosmeticRevision, revision);
    for (const waiter of [...this.cosmeticWaiters]) {
      if (waiter.revision > this.cosmeticRevision) continue;
      clearTimeout(waiter.timeout);
      this.cosmeticWaiters.delete(waiter);
      waiter.resolve(true);
    }
  };
  private readonly handleMessage: ExtensionMessageListener = (message) => {
    if (extensionContentBlockingEvent(message)) {
      const snapshot = this.inspectSnapshot(message.snapshot, 'snapshot-event');
      for (const listener of this.listeners) listener(snapshot);
      return;
    }
    if (!extensionContentBlockingUserRulesEvent(message)) return;
    this.settingsCache = null;
    this.settingsCachedAt = 0;
    this.userRulesGeneration += 1;
    this.userRulesCache = null;
    this.userRulesReadPromise = null;
    if (this.userRulesListeners.size === 0) return;
    void this.readUserRules().then(
      (userRules) => {
        for (const listener of this.userRulesListeners) listener(userRules);
      },
      (error) =>
        extensionDiagnostics.error(
          'content-blocking',
          'user-rules-refresh-failed',
          error,
        ),
    );
  };
  private readonly messageSubscription: ExtensionMessageSubscription;

  constructor(
    private readonly api: ExtensionApi,
    private readonly pageDocument: Document | null = typeof document ===
    'undefined'
      ? null
      : document,
  ) {
    this.cosmeticRevision = Number(
      pageDocument?.documentElement.dataset[
        ADGUARD_COSMETIC_REVISION_DATASET
      ] ?? 0,
    );
    this.messageSubscription = new ExtensionMessageSubscription(
      api,
      this.handleMessage,
    );
    pageDocument?.addEventListener(
      ADGUARD_COSMETIC_APPLIED_EVENT,
      this.handleCosmeticApplied,
    );
  }

  async read() {
    const response = await this.readStateResponse();
    if (response.settings) this.cacheSettings(response.settings);
    return this.inspectSnapshot(snapshotResponse(response), 'snapshot-read');
  }

  getCachedSettings() {
    return this.settingsCache;
  }

  getCachedUserRules() {
    return this.userRulesCache;
  }

  readUserRules() {
    if (this.userRulesCache !== null) {
      return Promise.resolve(this.userRulesCache);
    }
    if (this.userRulesReadPromise) return this.userRulesReadPromise;
    const generation = this.userRulesGeneration;
    const operation = sendExtensionRequest<UserRulesResponse>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-user-rules-read',
    })
      .then(userRulesResponse)
      .then((userRules) => {
        if (generation === this.userRulesGeneration) {
          this.userRulesCache = userRules;
        }
        return userRules;
      });
    this.userRulesReadPromise = operation;
    const release = () => {
      if (this.userRulesReadPromise === operation) {
        this.userRulesReadPromise = null;
      }
    };
    void operation.then(release, release);
    return operation;
  }

  async setRulesEnabled(rulesEnabled: boolean) {
    await this.flushUserRules();
    return this.inspectSnapshot(
      snapshotResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-set-rules-enabled',
          rulesEnabled,
        }),
      ),
      'snapshot-toggle',
    );
  }

  private inspectSnapshot(snapshot: ContentBlockingSnapshot, event: string) {
    if (
      this.currentSnapshot &&
      snapshot.revision < this.currentSnapshot.revision
    ) {
      return this.currentSnapshot;
    }
    this.currentSnapshot = snapshot;
    if (this.settingsCache) {
      this.settingsCache = {
        ...this.settingsCache,
        rulesEnabled: snapshot.rulesEnabled,
        allowlist: [...snapshot.allowlist],
        snapshot,
      };
    }
    const diagnostics = [...snapshot.errors, ...snapshot.limitations];
    if (diagnostics.length === 0 && snapshot.status !== 'error') {
      this.diagnosticFingerprint = null;
      return snapshot;
    }
    const fingerprint = JSON.stringify({
      status: snapshot.status,
      diagnostics,
    });
    if (fingerprint === this.diagnosticFingerprint) return snapshot;
    this.diagnosticFingerprint = fingerprint;
    const details = {
      status: snapshot.status,
      rulesEnabled: snapshot.rulesEnabled,
      loadedRuleCount: snapshot.loadedRuleCount,
      activeRuleCount: snapshot.activeRuleCount,
      userRuleCount: snapshot.userRuleCount,
      subscriptionCount: snapshot.subscriptionCount,
      diagnostics,
    };
    const error = new Error(
      diagnostics.join(' ') || '内容拦截引擎返回了错误状态。',
    );
    if (snapshot.status === 'error' || snapshot.errors.length > 0) {
      extensionDiagnostics.error('content-blocking', event, error, details);
    } else {
      extensionDiagnostics.warn('content-blocking', event, error, details);
    }
    return snapshot;
  }

  addUserRule(
    rule: string,
    session: ContentBlockingElementSession,
  ): Promise<ContentBlockingSnapshot> {
    if (
      this.pendingUserRules.size > 0 &&
      this.pendingUserRuleSession?.sessionId !== session.sessionId
    ) {
      return this.flushUserRules().then(() => this.addUserRule(rule, session));
    }
    return new Promise<ContentBlockingSnapshot>((resolve, reject) => {
      this.pendingUserRuleSession = session;
      this.pendingUserRules.add(rule);
      this.pendingUserRuleRequests.push({ resolve, reject });
      if (this.pendingUserRules.size >= MAX_USER_RULE_BATCH_SIZE) {
        void this.flushUserRules().catch(() => undefined);
        return;
      }
      if (this.userRuleBatchTimer) clearTimeout(this.userRuleBatchTimer);
      this.userRuleBatchTimer = setTimeout(() => {
        this.userRuleBatchTimer = null;
        void this.flushUserRules().catch(() => undefined);
      }, USER_RULE_BATCH_DELAY_MS);
    });
  }

  async undoLastElementBlockingBatch() {
    await this.flushUserRules();
    return this.inspectSnapshot(
      snapshotResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-element-batch-undo',
        }),
      ),
      'element-batch-undo',
    );
  }

  async setCurrentSiteFiltering(pageUrl: string, enabled: boolean) {
    await this.flushUserRules();
    return this.cacheSettings(
      settingsResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-current-site-set',
          pageUrl,
          enabled,
        }),
      ),
    );
  }

  waitForCosmeticRevision(revision: number) {
    if (revision <= this.cosmeticRevision) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let waiter: {
        revision: number;
        resolve: (applied: boolean) => void;
        timeout: ReturnType<typeof setTimeout>;
      };
      waiter = {
        revision,
        resolve,
        timeout: setTimeout(() => {
          this.cosmeticWaiters.delete(waiter);
          resolve(false);
        }, COSMETIC_REVISION_TIMEOUT_MS),
      };
      this.cosmeticWaiters.add(waiter);
    });
  }

  async readSettings() {
    await this.flushUserRules();
    if (
      this.settingsCache &&
      Date.now() - this.settingsCachedAt <= SETTINGS_CACHE_TTL_MS
    ) {
      return this.settingsCache;
    }
    return this.readStateResponse()
      .then(settingsResponse)
      .then((settings) => this.cacheSettings(settings));
  }

  async saveGeneralSettings(settings: ContentBlockingGeneralSettingsInput) {
    await this.flushUserRules();
    return this.cacheSettings(
      settingsResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-general-save',
          settings,
        }),
      ),
    );
  }

  async replaceUserRules(userRules: string) {
    return this.cacheSettings(
      settingsResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-user-rules-replace',
          userRules,
        }),
      ),
    );
  }

  async setBuiltInFilterEnabled(filterId: number, enabled: boolean) {
    return this.cacheSettings(
      settingsResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-static-filter-toggle',
          filterId,
          enabled,
        }),
      ),
    );
  }

  async addSubscriptions(urls: readonly string[]) {
    return this.cacheSettings(
      settingsResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-subscriptions-add',
          urls: [...urls],
        }),
      ),
    );
  }

  async removeSubscription(subscriptionId: string) {
    return this.cacheSettings(
      settingsResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-subscription-remove',
          subscriptionId,
        }),
      ),
    );
  }

  async setSubscriptionEnabled(subscriptionId: string, enabled: boolean) {
    return this.cacheSettings(
      settingsResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-subscription-toggle',
          subscriptionId,
          enabled,
        }),
      ),
    );
  }

  async setSubscriptionAutoUpdate(enabled: boolean) {
    return this.cacheSettings(
      settingsResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-subscriptions-auto-update',
          enabled,
        }),
      ),
    );
  }

  async refreshSubscription(subscriptionId: string) {
    return this.cacheSettings(
      settingsResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-subscription-refresh',
          subscriptionId,
        }),
      ),
    );
  }

  async refreshSubscriptions() {
    return this.cacheSettings(
      settingsResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-subscriptions-refresh',
        }),
      ),
    );
  }

  async exportConfiguration() {
    await this.flushUserRules();
    return configurationResponse(
      await sendExtensionRequest<ConfigurationResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-configuration-export',
      }),
    );
  }

  async importConfiguration(source: string) {
    await this.flushUserRules();
    return this.cacheSettings(
      settingsResponse(
        await sendExtensionRequest<SnapshotResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-configuration-import',
          source,
        }),
      ),
    );
  }

  subscribe(listener: ContentBlockingSnapshotListener) {
    this.listeners.add(listener);
    this.syncMessageSubscription();
    return () => {
      this.listeners.delete(listener);
      this.syncMessageSubscription();
    };
  }

  subscribeUserRules(listener: ContentBlockingUserRulesListener) {
    this.userRulesListeners.add(listener);
    this.syncMessageSubscription();
    return () => {
      this.userRulesListeners.delete(listener);
      this.syncMessageSubscription();
    };
  }

  dispose() {
    if (this.userRuleBatchTimer) clearTimeout(this.userRuleBatchTimer);
    this.userRuleBatchTimer = null;
    const error = new Error('内容拦截控制器已释放。');
    for (const request of this.pendingUserRuleRequests) request.reject(error);
    this.pendingUserRuleRequests = [];
    this.pendingUserRuleSession = null;
    this.pendingUserRules.clear();
    this.pageDocument?.removeEventListener(
      ADGUARD_COSMETIC_APPLIED_EVENT,
      this.handleCosmeticApplied,
    );
    for (const waiter of this.cosmeticWaiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve(false);
    }
    this.cosmeticWaiters.clear();
    this.messageSubscription.stop();
    this.listeners.clear();
    this.userRulesListeners.clear();
    this.settingsCache = null;
    this.settingsCachedAt = 0;
    this.stateReadPromise = null;
    this.userRulesCache = null;
    this.userRulesReadPromise = null;
    this.userRulesGeneration += 1;
  }

  private async flushUserRules(): Promise<ContentBlockingSnapshot | null> {
    if (this.userRuleBatchPromise) {
      const snapshot = await this.userRuleBatchPromise;
      return this.pendingUserRules.size > 0 ? this.flushUserRules() : snapshot;
    }
    if (this.userRuleBatchTimer) clearTimeout(this.userRuleBatchTimer);
    this.userRuleBatchTimer = null;
    const rules = [...this.pendingUserRules];
    if (rules.length === 0) return null;
    const requests = this.pendingUserRuleRequests;
    const session = this.pendingUserRuleSession;
    this.pendingUserRules.clear();
    this.pendingUserRuleRequests = [];
    this.pendingUserRuleSession = null;
    if (!session) {
      const error = new Error('元素过滤批次缺少会话标识。');
      for (const request of requests) request.reject(error);
      throw error;
    }
    const operation = sendExtensionRequest<SnapshotResponse>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-user-rules-add',
      rules,
      session,
    })
      .then((response) =>
        this.inspectSnapshot(snapshotResponse(response), 'user-rule-batch-add'),
      )
      .then(
        (snapshot) => {
          for (const request of requests) request.resolve(snapshot);
          return snapshot;
        },
        (error) => {
          for (const request of requests) request.reject(error);
          throw error;
        },
      )
      .finally(() => {
        this.userRuleBatchPromise = null;
        if (this.pendingUserRules.size > 0) {
          this.userRuleBatchTimer = setTimeout(() => {
            this.userRuleBatchTimer = null;
            void this.flushUserRules().catch(() => undefined);
          }, USER_RULE_BATCH_DELAY_MS);
        }
      });
    this.userRuleBatchPromise = operation;
    return operation;
  }

  private cacheSettings(settings: ContentBlockingSettingsView) {
    this.settingsCache = settings;
    this.settingsCachedAt = Date.now();
    this.userRulesCache = settings.userRules;
    return settings;
  }

  private readStateResponse() {
    if (this.stateReadPromise) return this.stateReadPromise;
    const operation = sendExtensionRequest<SnapshotResponse>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-read',
    });
    this.stateReadPromise = operation;
    const release = () => {
      if (this.stateReadPromise === operation) {
        this.stateReadPromise = null;
      }
    };
    void operation.then(release, release);
    return operation;
  }

  private syncMessageSubscription() {
    if (this.listeners.size > 0 || this.userRulesListeners.size > 0) {
      this.messageSubscription.start();
      return;
    }
    this.messageSubscription.stop();
  }
}
