import { extensionErrorMessage as errorMessage } from '../../lib/extension-errors';
import { resolveSiteScope } from '../../lib/site-scope';
import {
  CONTENT_BLOCKER_BUILTIN_FILTERS,
  CONTENT_BLOCKER_FIRST_CUSTOM_FILTER_ID,
  CONTENT_BLOCKING_EXPORT_KIND,
  type ContentBlockingConfigurationExport,
  type ContentBlockingElementBatch,
  type ContentBlockingElementSession,
  type ContentBlockingEngineReport,
  type ContentBlockingGeneralSettingsInput,
  type ContentBlockingSettingsView,
  type ContentBlockingSnapshot,
  type ContentBlockingSnapshotListener,
  type ContentBlockingState,
  type ContentBlockingSubscription,
  type ContentBlockingSubscriptionView,
  defaultContentBlockingState,
  startingContentBlockingSnapshot,
} from '../domain/types';
import {
  type ContentBlockingRepository,
  parseContentBlockingState,
} from './repository';
import {
  ContentBlockingSubscriptionFetcher,
  normalizeSubscriptionUrl,
  type SubscriptionDownload,
  sanitizeSubscription,
  subscriptionNameFromSource,
} from './subscriptions';

export interface ContentBlockingEngine {
  start(state: ContentBlockingState): Promise<ContentBlockingEngineReport>;
  configure(state: ContentBlockingState): Promise<ContentBlockingEngineReport>;
  setRulesEnabled(rulesEnabled: boolean): Promise<ContentBlockingEngineReport>;
  handlesMessage(message: unknown): boolean;
  handleMessage(message: unknown, sender: unknown): Promise<unknown>;
}

export type ContentBlockingDiagnosticReporter = (
  event: string,
  error: unknown,
) => void;

export type ContentBlockingServiceOptions = {
  subscriptionFetcher?: ContentBlockingSubscriptionFetcher;
  reportError?: ContentBlockingDiagnosticReporter;
  onConfigurationApplied?: () => void;
  onUserRulesChanged?: () => void;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function ruleCount(source: string) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('!') && !line.startsWith('['))
    .length;
}

function normalizeDomain(value: string) {
  const source = value.trim().toLowerCase();
  if (!source) return null;
  const scope = resolveSiteScope(
    source.includes('://') ? source : `https://${source}`,
  );
  if (!scope) {
    throw new Error(`无效的白名单域名：${value}`);
  }
  return scope.host;
}

function normalizeAllowlist(values: readonly string[]) {
  return [
    ...new Set(
      values
        .map(normalizeDomain)
        .filter((value): value is string => value !== null),
    ),
  ];
}

function elementRuleHostname(rule: string) {
  const separator = rule.indexOf('##');
  const hostname = separator > 0 ? rule.slice(0, separator).toLowerCase() : '';
  if (!hostname) {
    throw new Error('元素过滤规则缺少有效的站点域名。');
  }
  try {
    if (new URL(`https://${hostname}`).hostname !== hostname) {
      throw new Error();
    }
  } catch {
    throw new Error('元素过滤规则包含无效的站点域名。');
  }
  return hostname;
}

function subscriptionView(
  subscription: ContentBlockingSubscription,
): ContentBlockingSubscriptionView {
  const {
    content: _content,
    etag: _etag,
    lastModified: _lastModified,
    ...view
  } = subscription;
  return structuredClone(view);
}

function assertApplicable(report: ContentBlockingEngineReport) {
  const diagnostics = [...report.errors, ...report.limitations];
  if (diagnostics.length > 0) {
    throw new Error(`过滤规则无法完整应用：${diagnostics.join(' ')}`);
  }
}

export class ContentBlockingService {
  private state: ContentBlockingState | null = null;
  private report: ContentBlockingEngineReport = {
    revision: 0,
    loadedRuleCount: 0,
    errors: [],
    limitations: [],
  };
  private status: ContentBlockingSnapshot['status'] = 'starting';
  private startError: string | null = null;
  private startPromise: Promise<void> | null = null;
  private operationQueue = Promise.resolve();
  private configurationQueue = Promise.resolve();
  private pendingConfiguration: ContentBlockingState | null = null;
  private backgroundConfiguration: Promise<void> | null = null;
  private appliedState: ContentBlockingState | null = null;
  private engineReady = false;
  private configurationPending = false;
  private lastElementBlockingBatch: ContentBlockingElementBatch | null = null;
  private readonly listeners = new Set<ContentBlockingSnapshotListener>();
  private readonly subscriptionFetcher: ContentBlockingSubscriptionFetcher;
  private readonly reportError: ContentBlockingDiagnosticReporter;
  private readonly onConfigurationApplied: () => void;
  private readonly onUserRulesChanged: () => void;

  constructor(
    private readonly repository: ContentBlockingRepository,
    private readonly engine: ContentBlockingEngine,
    options: ContentBlockingServiceOptions = {},
  ) {
    this.subscriptionFetcher =
      options.subscriptionFetcher ?? new ContentBlockingSubscriptionFetcher();
    this.reportError = options.reportError ?? (() => undefined);
    this.onConfigurationApplied =
      options.onConfigurationApplied ?? (() => undefined);
    this.onUserRulesChanged = options.onUserRulesChanged ?? (() => undefined);
  }

  start() {
    if (this.startPromise) return this.startPromise;
    this.status = 'starting';
    this.startError = null;
    const operation = (async () => {
      try {
        const [state, batch] = await Promise.all([
          this.repository.read(),
          this.repository.readElementBlockingBatch(),
        ]);
        this.state = state;
        this.lastElementBlockingBatch = batch;
        this.report = await this.engine.start(this.state);
        assertApplicable(this.report);
        this.appliedState = structuredClone(this.state);
        this.engineReady = true;
        this.status = 'ready';
      } catch (error) {
        this.reportError('start-failed', error);
        this.startError = errorMessage(error);
        this.status = 'error';
      }
      this.publish();
    })();
    this.startPromise = operation;
    return operation;
  }

  async readSettings(): Promise<ContentBlockingSettingsView> {
    await this.start();
    const state = this.requireState();
    return {
      rulesEnabled: state.rulesEnabled,
      autoUpdateSubscriptions: state.autoUpdateSubscriptions,
      builtInFilters: CONTENT_BLOCKER_BUILTIN_FILTERS.map((filter) => ({
        ...filter,
        enabled: state.enabledStaticFilterIds.includes(filter.filterId),
      })),
      userRules: state.userRules,
      allowlist: [...state.allowlist],
      subscriptions: state.subscriptions.map(subscriptionView),
      snapshot: this.snapshot(),
    };
  }

  snapshot() {
    const state = this.state;
    if (!state) {
      const snapshot = startingContentBlockingSnapshot();
      if (this.startError) {
        snapshot.status = 'error';
        snapshot.errors = [this.startError];
      }
      return snapshot;
    }
    return {
      revision: this.report.revision,
      rulesEnabled: state.rulesEnabled,
      status: this.status,
      configurationPending: this.configurationPending,
      loadedRuleCount: this.report.loadedRuleCount,
      activeRuleCount: state.rulesEnabled ? this.report.loadedRuleCount : 0,
      userRuleCount: ruleCount(state.userRules),
      enabledSubscriptionCount: state.subscriptions.filter(
        (subscription) => subscription.enabled,
      ).length,
      subscriptionCount: state.subscriptions.length,
      rejectedRuleCount: state.subscriptions.reduce(
        (total, subscription) => total + subscription.rejectedRuleCount,
        0,
      ),
      allowlist: [...state.allowlist],
      lastElementBlockingBatch: this.lastElementBlockingBatch
        ? structuredClone(this.lastElementBlockingBatch)
        : null,
      errors: [
        ...(this.startError ? [this.startError] : []),
        ...this.report.errors,
      ],
      limitations: [...this.report.limitations],
    } satisfies ContentBlockingSnapshot;
  }

  subscribe(listener: ContentBlockingSnapshotListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setRulesEnabled(rulesEnabled: boolean) {
    return this.enqueue(async () => {
      const state = this.requireReadyState();
      if (state.rulesEnabled === rulesEnabled) return this.snapshot();
      await this.applyRuleActivation(rulesEnabled);
      return this.snapshot();
    });
  }

  async reset() {
    return this.enqueue(async () => {
      this.requireReadyState();
      const next = defaultContentBlockingState();
      await this.apply(next, null);
      this.notifyUserRulesChanged();
      return this.readSettings();
    });
  }

  async addUserRules(
    input: readonly string[],
    session: ContentBlockingElementSession,
  ) {
    return this.enqueue(async () => {
      if (input.length === 0 || input.length > 128) {
        throw new Error('元素过滤规则批次必须包含 1 到 128 条规则。');
      }
      const normalizedSessionId = session.sessionId.trim();
      if (
        !normalizedSessionId ||
        normalizedSessionId.length > 128 ||
        !Number.isFinite(session.startedAt) ||
        session.startedAt <= 0
      ) {
        throw new Error('元素过滤会话标识无效。');
      }
      const normalizedRules = [
        ...new Set(
          input.map((rule) => {
            const normalizedRule = rule.trim();
            if (!normalizedRule || /[\r\n]/.test(normalizedRule)) {
              throw new Error('元素过滤规则必须是单条非空规则。');
            }
            return normalizedRule;
          }),
        ),
      ];
      const state = this.requireReadyState();
      const existingRules = state.userRules
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const existing = new Set(existingRules);
      const addedRules = normalizedRules.filter((rule) => !existing.has(rule));
      if (addedRules.length === 0) return this.snapshot();
      const hostnames = new Set(addedRules.map(elementRuleHostname));
      if (hostnames.size !== 1) {
        throw new Error('同一次元素过滤会话只能处理一个站点。');
      }
      const hostname = [...hostnames][0];
      const previousBatch = this.lastElementBlockingBatch;
      if (
        previousBatch?.sessionId === normalizedSessionId &&
        previousBatch.hostname !== hostname
      ) {
        throw new Error('元素过滤会话不能跨站点继续。');
      }
      const nextBatch: ContentBlockingElementBatch | null =
        previousBatch?.sessionId === normalizedSessionId
          ? {
              ...previousBatch,
              rules: [...new Set([...previousBatch.rules, ...addedRules])],
            }
          : !previousBatch || session.startedAt >= previousBatch.startedAt
            ? {
                sessionId: normalizedSessionId,
                startedAt: session.startedAt,
                hostname,
                rules: addedRules,
              }
            : previousBatch;
      await this.apply(
        {
          ...state,
          userRules: [...existingRules, ...addedRules].join('\n'),
        },
        nextBatch,
      );
      this.notifyUserRulesChanged();
      return this.snapshot();
    });
  }

  async undoLastElementBlockingBatch() {
    return this.enqueue(async () => {
      const batch = this.lastElementBlockingBatch;
      if (!batch) throw new Error('当前没有可恢复的元素拦截批次。');
      const state = this.requireReadyState();
      const lines = state.userRules.split(/\r?\n/);
      const batchRules = new Set(batch.rules);
      const remaining = lines.filter((line) => !batchRules.has(line.trim()));
      if (remaining.length === lines.length) {
        await this.repository.write(state, null);
        this.lastElementBlockingBatch = null;
        this.publish();
      } else {
        await this.apply(
          {
            ...state,
            userRules: remaining.join('\n').trim(),
          },
          null,
        );
        this.notifyUserRulesChanged();
      }
      return this.snapshot();
    });
  }

  private retainedElementBlockingBatch(userRules: string) {
    const batch = this.lastElementBlockingBatch;
    if (!batch) return null;
    const presentRules = new Set(
      userRules
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    );
    const rules = batch.rules.filter((rule) => presentRules.has(rule));
    return rules.length > 0 ? { ...batch, rules } : null;
  }

  async setCurrentSiteFiltering(pageUrl: string, enabled: boolean) {
    return this.enqueue(async () => {
      const state = this.requireReadyState();
      const hostname = normalizeDomain(pageUrl);
      if (!hostname) throw new Error('当前页面没有可配置的站点域名。');
      const allowlist = enabled
        ? state.allowlist.filter((entry) => entry !== hostname)
        : normalizeAllowlist([...state.allowlist, hostname]);
      if (
        allowlist.length === state.allowlist.length &&
        allowlist.every((entry, index) => entry === state.allowlist[index])
      ) {
        return this.readSettings();
      }
      await this.apply({ ...state, allowlist });
      return this.readSettings();
    });
  }

  async saveGeneralSettings(input: ContentBlockingGeneralSettingsInput) {
    return this.enqueue(async () => {
      const state = this.requireReadyState();
      const next = {
        ...state,
        rulesEnabled: input.rulesEnabled,
        allowlist: normalizeAllowlist(input.allowlist),
      };
      const configurationChanged =
        state.allowlist.length !== next.allowlist.length ||
        state.allowlist.some(
          (hostname, index) => hostname !== next.allowlist[index],
        );
      if (configurationChanged) {
        await this.apply(next);
      } else if (state.rulesEnabled !== next.rulesEnabled) {
        await this.applyRuleActivation(next.rulesEnabled);
      }
      return this.readSettings();
    });
  }

  async replaceUserRules(userRules: string) {
    return this.enqueue(async () => {
      const state = this.requireReadyState();
      const normalized = userRules.replace(/\r\n?/g, '\n').trim();
      if (normalized === state.userRules) {
        if (this.status === 'error') {
          this.status = 'ready';
          this.startError = null;
          this.scheduleConfiguration(state);
        }
        return this.readSettings();
      }
      const next = { ...state, userRules: normalized };
      const nextBatch = this.retainedElementBlockingBatch(normalized);
      await this.repository.write(next, nextBatch);
      this.state = structuredClone(next);
      this.lastElementBlockingBatch = nextBatch
        ? structuredClone(nextBatch)
        : null;
      this.status = 'ready';
      this.startError = null;
      this.scheduleConfiguration(next);
      this.notifyUserRulesChanged();
      return this.readSettings();
    });
  }

  async setBuiltInFilterEnabled(filterId: number, enabled: boolean) {
    return this.enqueue(async () => {
      const state = this.requireReadyState();
      if (
        !CONTENT_BLOCKER_BUILTIN_FILTERS.some(
          (filter) => filter.filterId === filterId,
        )
      ) {
        throw new Error('找不到需要更新的内置过滤列表。');
      }
      const selected = new Set(state.enabledStaticFilterIds);
      if (enabled) selected.add(filterId);
      else selected.delete(filterId);
      const enabledStaticFilterIds = CONTENT_BLOCKER_BUILTIN_FILTERS.flatMap(
        (filter) => (selected.has(filter.filterId) ? [filter.filterId] : []),
      );
      if (
        enabledStaticFilterIds.length === state.enabledStaticFilterIds.length &&
        enabledStaticFilterIds.every(
          (selectedFilterId, index) =>
            selectedFilterId === state.enabledStaticFilterIds[index],
        )
      ) {
        return this.readSettings();
      }
      await this.apply({ ...state, enabledStaticFilterIds });
      return this.readSettings();
    });
  }

  async addSubscriptions(urls: readonly string[]) {
    return this.enqueue(async () => {
      if (urls.length === 0 || urls.length > 16) {
        throw new Error('每次可以导入 1 到 16 个过滤列表地址。');
      }
      const state = this.requireReadyState();
      const normalizedUrls = [...new Set(urls.map(normalizeSubscriptionUrl))];
      const installedUrls = new Set(
        state.subscriptions.map((subscription) => subscription.url),
      );
      const pendingUrls = normalizedUrls.filter(
        (url) => !installedUrls.has(url),
      );
      if (pendingUrls.length === 0) {
        throw new Error('这些过滤列表已经全部导入。');
      }
      const firstFilterId =
        Math.max(
          CONTENT_BLOCKER_FIRST_CUSTOM_FILTER_ID - 1,
          ...state.subscriptions.map((subscription) => subscription.filterId),
        ) + 1;
      const bases = pendingUrls.map(
        (url, index): ContentBlockingSubscription => ({
          id: crypto.randomUUID(),
          filterId: firstFilterId + index,
          name: new URL(url).hostname,
          url,
          enabled: true,
          content: '',
          ruleCount: 0,
          rejectedRuleCount: 0,
        }),
      );
      const downloads = await Promise.all(
        bases.map(async (base) => {
          try {
            const downloaded = await this.subscriptionFetcher.download(base);
            if (downloaded.status !== 'updated') {
              throw new Error(`${base.url} 没有返回可安装内容。`);
            }
            return {
              ...base,
              name: subscriptionNameFromSource(
                downloaded.source.content,
                base.url,
              ),
              content: downloaded.source.content,
              ruleCount: downloaded.source.ruleCount,
              rejectedRuleCount: downloaded.source.rejectedRuleCount,
              etag: downloaded.etag,
              lastModified: downloaded.lastModified,
              lastCheckedAt: downloaded.checkedAt,
              lastUpdatedAt: downloaded.checkedAt,
            } satisfies ContentBlockingSubscription;
          } catch (error) {
            this.reportError('subscription-install-failed', error);
            return {
              ...base,
              enabled: false,
              lastCheckedAt: Date.now(),
              error: errorMessage(error),
            } satisfies ContentBlockingSubscription;
          }
        }),
      );
      await this.apply({
        ...state,
        subscriptions: [...state.subscriptions, ...downloads],
      });
      return this.readSettings();
    });
  }

  async removeSubscription(subscriptionId: string) {
    return this.enqueue(async () => {
      const state = this.requireReadyState();
      const subscriptions = state.subscriptions.filter(
        (subscription) => subscription.id !== subscriptionId,
      );
      if (subscriptions.length === state.subscriptions.length) {
        throw new Error('找不到需要删除的规则订阅。');
      }
      await this.apply({ ...state, subscriptions });
      return this.readSettings();
    });
  }

  async setSubscriptionEnabled(subscriptionId: string, enabled: boolean) {
    return this.enqueue(async () => {
      const state = this.requireReadyState();
      let found = false;
      const subscriptions = state.subscriptions.map((subscription) => {
        if (subscription.id !== subscriptionId) return subscription;
        found = true;
        return { ...subscription, enabled };
      });
      if (!found) throw new Error('找不到需要更新的规则订阅。');
      await this.apply({ ...state, subscriptions });
      return this.readSettings();
    });
  }

  async setSubscriptionAutoUpdate(enabled: boolean) {
    return this.enqueue(async () => {
      const state = this.requireReadyState();
      if (state.autoUpdateSubscriptions === enabled) {
        return this.readSettings();
      }
      const next = { ...state, autoUpdateSubscriptions: enabled };
      await this.repository.write(next);
      this.state = structuredClone(next);
      return this.readSettings();
    });
  }

  async refreshSubscription(subscriptionId: string) {
    await this.readyState();
    const requested = this.requireReadyState().subscriptions.find(
      (subscription) => subscription.id === subscriptionId,
    );
    if (!requested) throw new Error('找不到需要刷新的规则订阅。');
    let downloaded: SubscriptionDownload | null = null;
    let failure: unknown;
    const checkedAt = Date.now();
    try {
      downloaded = await this.subscriptionFetcher.download(requested);
    } catch (error) {
      failure = error;
      this.reportError('subscription-refresh-failed', error);
    }
    return this.enqueue(async () => {
      const state = this.requireReadyState();
      const current = state.subscriptions.find(
        (subscription) => subscription.id === subscriptionId,
      );
      if (!current) throw new Error('找不到需要刷新的规则订阅。');
      if (failure !== undefined) {
        await this.persistMetadata({
          ...current,
          lastCheckedAt: checkedAt,
          error: errorMessage(failure),
        });
        throw failure;
      }
      if (!downloaded) {
        throw new Error('过滤列表刷新没有返回结果。');
      }
      if (downloaded.status === 'not-modified') {
        await this.persistMetadata({
          ...current,
          lastCheckedAt: downloaded.checkedAt,
          error: undefined,
        });
        return this.readSettings();
      }
      const updated: ContentBlockingSubscription = {
        ...current,
        content: downloaded.source.content,
        ruleCount: downloaded.source.ruleCount,
        rejectedRuleCount: downloaded.source.rejectedRuleCount,
        etag: downloaded.etag,
        lastModified: downloaded.lastModified,
        lastCheckedAt: downloaded.checkedAt,
        lastUpdatedAt: downloaded.checkedAt,
        error: undefined,
      };
      const next = {
        ...state,
        subscriptions: state.subscriptions.map((subscription) =>
          subscription.id === subscriptionId ? updated : subscription,
        ),
      };
      if (updated.content === current.content) {
        await this.repository.write(next);
        this.state = structuredClone(next);
        this.publish();
      } else {
        await this.apply(next);
      }
      return this.readSettings();
    });
  }

  async refreshSubscriptions() {
    await this.readyState();
    const requested = this.requireReadyState().subscriptions.map(
      (subscription) => structuredClone(subscription),
    );
    const refreshes = await Promise.all(
      requested.map(async (current) => {
        try {
          return {
            id: current.id,
            downloaded: await this.subscriptionFetcher.download(current),
          } as const;
        } catch (error) {
          this.reportError('subscription-refresh-failed', error);
          return { id: current.id, error, checkedAt: Date.now() } as const;
        }
      }),
    );
    return this.enqueue(async () => {
      const state = this.requireReadyState();
      const refreshById = new Map(
        refreshes.map((refresh) => [refresh.id, refresh]),
      );
      let configurationChanged = false;
      const subscriptions = state.subscriptions.map((current) => {
        const refresh = refreshById.get(current.id);
        if (!refresh) return current;
        if ('error' in refresh) {
          return {
            ...current,
            lastCheckedAt: refresh.checkedAt,
            error: errorMessage(refresh.error),
          };
        }
        const { downloaded } = refresh;
        if (downloaded.status === 'not-modified') {
          return {
            ...current,
            lastCheckedAt: downloaded.checkedAt,
            error: undefined,
          };
        }
        if (downloaded.source.content !== current.content) {
          configurationChanged = true;
        }
        return {
          ...current,
          content: downloaded.source.content,
          ruleCount: downloaded.source.ruleCount,
          rejectedRuleCount: downloaded.source.rejectedRuleCount,
          etag: downloaded.etag,
          lastModified: downloaded.lastModified,
          lastCheckedAt: downloaded.checkedAt,
          lastUpdatedAt: downloaded.checkedAt,
          error: undefined,
        };
      });
      const next = { ...state, subscriptions };
      if (configurationChanged) {
        await this.apply(next);
      } else {
        await this.repository.write(next);
        this.state = structuredClone(next);
        this.publish();
      }
      return this.readSettings();
    });
  }

  handlesMessage(message: unknown) {
    return this.engine.handlesMessage(message);
  }

  async handleMessage(message: unknown, sender: unknown) {
    await this.readyState();
    return this.engine.handleMessage(message, sender);
  }

  async waitForPendingConfiguration() {
    while (this.backgroundConfiguration) {
      await this.backgroundConfiguration;
    }
  }

  async exportConfiguration() {
    const state = await this.readyState();
    const exported: ContentBlockingConfigurationExport = {
      kind: CONTENT_BLOCKING_EXPORT_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      state: structuredClone(state),
    };
    return JSON.stringify(exported, null, 2);
  }

  async importConfiguration(source: string) {
    return this.enqueue(async () => {
      let decoded: unknown;
      try {
        decoded = JSON.parse(source);
      } catch (error) {
        throw new Error('内容拦截配置不是有效的 JSON。', { cause: error });
      }
      if (
        !record(decoded) ||
        Object.keys(decoded).length !== 4 ||
        decoded.kind !== CONTENT_BLOCKING_EXPORT_KIND ||
        decoded.version !== 1 ||
        typeof decoded.exportedAt !== 'string' ||
        !Number.isFinite(Date.parse(decoded.exportedAt)) ||
        !Object.hasOwn(decoded, 'state')
      ) {
        throw new Error('内容拦截配置格式或版本不受支持。');
      }
      const imported = parseContentBlockingState(decoded.state);
      if (!imported) throw new Error('内容拦截配置内容无效。');
      const subscriptions = imported.subscriptions.map((subscription) => {
        const sanitized = sanitizeSubscription(subscription.content);
        return {
          ...subscription,
          url: normalizeSubscriptionUrl(subscription.url),
          content: sanitized.content,
          ruleCount: sanitized.ruleCount,
          rejectedRuleCount: Math.max(
            subscription.rejectedRuleCount,
            sanitized.rejectedRuleCount,
          ),
        };
      });
      const next: ContentBlockingState = {
        ...imported,
        version: 1,
        allowlist: normalizeAllowlist(imported.allowlist),
        subscriptions,
      };
      await this.apply(next, null);
      this.notifyUserRulesChanged();
      return this.readSettings();
    });
  }

  dispose() {
    this.listeners.clear();
  }

  private async persistMetadata(updated: ContentBlockingSubscription) {
    const state = this.requireState();
    const next = {
      ...state,
      subscriptions: state.subscriptions.map((subscription) =>
        subscription.id === updated.id ? updated : subscription,
      ),
    };
    await this.repository.write(next);
    this.state = next;
    this.publish();
  }

  private notifyUserRulesChanged() {
    try {
      this.onUserRulesChanged();
    } catch (error) {
      this.reportError('user-rules-changed-callback-failed', error);
    }
  }

  private scheduleConfiguration(next: ContentBlockingState) {
    this.pendingConfiguration = structuredClone(next);
    this.configurationPending = true;
    this.publish();
    if (this.backgroundConfiguration) return;
    const operation = this.enqueueConfiguration(() =>
      this.flushPendingConfigurations(),
    );
    this.backgroundConfiguration = operation;
    void operation.then(
      () => this.finishBackgroundConfiguration(operation),
      (error) => {
        this.reportError('background-configuration-failed', error);
        this.status = 'error';
        this.startError = `内容拦截后台更新失败：${errorMessage(error)}`;
        this.configurationPending = false;
        this.publish();
        this.finishBackgroundConfiguration(operation);
      },
    );
  }

  private finishBackgroundConfiguration(operation: Promise<void>) {
    if (this.backgroundConfiguration !== operation) return;
    this.backgroundConfiguration = null;
    if (this.pendingConfiguration) {
      this.scheduleConfiguration(this.pendingConfiguration);
    }
  }

  private async flushPendingConfigurations() {
    while (this.pendingConfiguration) {
      const next = this.pendingConfiguration;
      this.pendingConfiguration = null;
      await this.applyPersistedConfiguration(next);
    }
  }

  private async applyPersistedConfiguration(next: ContentBlockingState) {
    const previous = this.appliedState;
    try {
      const report = await this.engine.configure(next);
      assertApplicable(report);
      this.appliedState = structuredClone(next);
      this.report = report;
      this.engineReady = true;
      this.status = 'ready';
      this.startError = null;
      this.configurationPending = Boolean(this.pendingConfiguration);
      this.publish();
      if (!this.configurationPending) {
        try {
          this.onConfigurationApplied();
        } catch (callbackError) {
          this.reportError(
            'configuration-applied-callback-failed',
            callbackError,
          );
        }
      }
    } catch (error) {
      this.reportError('configuration-apply-failed', error);
      if (previous) {
        try {
          const rollbackReport = await this.engine.configure(previous);
          assertApplicable(rollbackReport);
          this.report = rollbackReport;
          this.engineReady = true;
        } catch (rollbackError) {
          this.reportError('configuration-rollback-failed', rollbackError);
          this.engineReady = false;
          this.pendingConfiguration = null;
          this.startError = `内容拦截配置失败，且无法恢复上一状态：${errorMessage(
            rollbackError,
          )}`;
          this.status = 'error';
          this.configurationPending = false;
          this.publish();
          return;
        }
      }
      this.startError = `内容拦截规则已保存，但引擎更新失败：${errorMessage(
        error,
      )}`;
      this.status = 'error';
      this.configurationPending = Boolean(this.pendingConfiguration);
      this.publish();
    }
  }

  private async apply(
    next: ContentBlockingState,
    batch: ContentBlockingElementBatch | null = this.lastElementBlockingBatch,
  ) {
    const previous = this.appliedState ?? this.requireState();
    let report: ContentBlockingEngineReport;
    try {
      report = await this.enqueueConfiguration(() =>
        this.engine.configure(next),
      );
      assertApplicable(report);
      await this.repository.write(next, batch);
    } catch (error) {
      this.reportError('configuration-apply-failed', error);
      try {
        const rollbackReport = await this.enqueueConfiguration(() =>
          this.engine.configure(previous),
        );
        assertApplicable(rollbackReport);
        this.report = rollbackReport;
        this.appliedState = structuredClone(previous);
      } catch (rollbackError) {
        this.reportError('configuration-rollback-failed', rollbackError);
        this.engineReady = false;
        this.status = 'error';
        this.startError = `内容拦截配置失败，且无法恢复上一状态：${errorMessage(
          rollbackError,
        )}`;
        this.publish();
        throw new Error(`${errorMessage(error)} ${this.startError}`, {
          cause: rollbackError,
        });
      }
      throw error;
    }
    this.state = structuredClone(next);
    this.appliedState = structuredClone(next);
    this.lastElementBlockingBatch = batch ? structuredClone(batch) : null;
    this.report = report;
    this.engineReady = true;
    this.status = 'ready';
    this.startError = null;
    this.publish();
  }

  private async applyRuleActivation(rulesEnabled: boolean) {
    const previous = this.requireReadyState();
    const next = { ...previous, rulesEnabled };
    let report: ContentBlockingEngineReport;
    try {
      report = await this.enqueueConfiguration(() =>
        this.engine.setRulesEnabled(rulesEnabled),
      );
      assertApplicable(report);
      await this.repository.write(next);
    } catch (error) {
      this.reportError('rule-activation-failed', error);
      try {
        this.report = await this.enqueueConfiguration(() =>
          this.engine.setRulesEnabled(previous.rulesEnabled),
        );
        assertApplicable(this.report);
      } catch (rollbackError) {
        this.reportError('rule-activation-rollback-failed', rollbackError);
        this.engineReady = false;
        this.status = 'error';
        this.startError = `内容拦截规则状态切换失败，且无法恢复上一状态：${errorMessage(
          rollbackError,
        )}`;
        this.publish();
        throw new Error(`${errorMessage(error)} ${this.startError}`, {
          cause: rollbackError,
        });
      }
      throw error;
    }
    this.state = structuredClone(next);
    this.appliedState = {
      ...(this.appliedState ?? previous),
      rulesEnabled,
    };
    this.report = report;
    this.engineReady = true;
    this.status = 'ready';
    this.startError = null;
    this.publish();
  }

  private async readyState() {
    await this.start();
    return this.requireReadyState();
  }

  private requireState() {
    if (!this.state) {
      throw new Error(this.startError ?? '内容拦截服务尚未初始化。');
    }
    return this.state;
  }

  private requireReadyState() {
    const state = this.requireState();
    if (!this.engineReady) {
      throw new Error(this.startError ?? '内容拦截引擎当前不可用。');
    }
    return state;
  }

  private enqueue<T>(operation: () => Promise<T>) {
    const run = async () => {
      await this.start();
      return operation();
    };
    const result = this.operationQueue.then(run, run);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private enqueueConfiguration<T>(operation: () => Promise<T>) {
    const result = this.configurationQueue.then(operation, operation);
    this.configurationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private publish() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
