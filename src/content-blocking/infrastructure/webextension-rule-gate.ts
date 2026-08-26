import type { ExtensionBackgroundApi } from '../../hosts/extension/api';
import { extensionErrorMessage } from '../../lib/extension-errors';
import type {
  AdguardBrowserApi,
  AdguardScriptInjection,
} from './adguard-browser-api';
import type { ContentBlockingCssInjectionStorage } from './css-injection-storage';

type CssInjection = chrome.scripting.CSSInjection;
type DiagnosticReporter = (event: string, error: unknown) => void;
const FRAME_LOOKUP_RETRY_MS = 50;
const TRANSIENT_FRAME_LOOKUP_FAILURE =
  /(?:Main frame not found|No tab with id|Invalid tab ID)/i;

function blocksPageScriptInjection(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtube-nocookie.com' ||
      hostname.endsWith('.youtube-nocookie.com')
    );
  } catch {
    return false;
  }
}

type ParkedNetworkRules = {
  staticRuleSetIds: string[];
  dynamicRules: chrome.declarativeNetRequest.Rule[];
  sessionRules: chrome.declarativeNetRequest.Rule[];
};

type StoredCssInjection = {
  cssKey: string;
  origin?: CssInjection['origin'];
  target: CssInjection['target'];
};

type StoredRuleOwnership = {
  version: 1;
  revision: number;
  dynamicRuleIds: number[];
  sessionRuleIds: number[];
  cssInjections: Array<{
    applied: boolean;
    injection: StoredCssInjection;
  }>;
};

export type WebExtensionRuleGateOptions = {
  managedStaticRuleSetIds: readonly string[];
  cssStorage: ContentBlockingCssInjectionStorage;
  canOwnDynamicRule?: (rule: chrome.declarativeNetRequest.Rule) => boolean;
  canOwnSessionRule?: (rule: chrome.declarativeNetRequest.Rule) => boolean;
  normalizeRuleUpdate?: (
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) => chrome.declarativeNetRequest.UpdateRuleOptions;
  reportError?: DiagnosticReporter;
};

export interface ContentBlockingRuleGate {
  isEnabled(): boolean;
  allocateRevision(): Promise<number>;
  runManagedConfiguration<T>(
    operation: () => Promise<T>,
  ): Promise<{ result: T; revision: number }>;
  prepare(rulesEnabled: boolean): Promise<void>;
  synchronize(rulesEnabled: boolean): Promise<void>;
  setRulesEnabled(rulesEnabled: boolean): Promise<void>;
}

function cssInjectionKey(injection: CssInjection) {
  return JSON.stringify({
    css: injection.css,
    files: injection.files,
    origin: injection.origin,
    target: injection.target,
  });
}

function appliesToFrame(
  injection: CssInjection,
  tabId: number,
  frameId: number,
) {
  if (injection.target.tabId !== tabId) return false;
  if (injection.target.allFrames) return true;
  return injection.target.frameIds?.includes(frameId) ?? frameId === 0;
}

function isTrackableCss(injection: CssInjection) {
  return typeof injection.css === 'string' && injection.origin === 'USER';
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function storedCssInjection(value: unknown): value is StoredCssInjection {
  if (!record(value) || typeof value.cssKey !== 'string') return false;
  const target = value.target;
  return (
    value.origin === 'USER' &&
    record(target) &&
    typeof target.tabId === 'number' &&
    Number.isSafeInteger(target.tabId)
  );
}

async function cssContentKey(css: string) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(css),
  );
  return `sha256-${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`;
}

export class WebExtensionContentBlockingRuleGate
  implements ContentBlockingRuleGate, AdguardBrowserApi
{
  private readonly managedStaticRuleSetIds: ReadonlySet<string>;
  private readonly managedDynamicRuleIds = new Set<number>();
  private readonly managedSessionRuleIds = new Set<number>();
  private readonly reportError: DiagnosticReporter;
  private readonly nativeInsertCss: (injection: CssInjection) => Promise<void>;
  private readonly nativeRemoveCss: (injection: CssInjection) => Promise<void>;
  private readonly nativeGetDisabledRuleIds:
    | ((
        options: chrome.declarativeNetRequest.GetDisabledRuleIdsOptions,
      ) => Promise<number[]>)
    | null;
  private readonly nativeGetAllFrames:
    | ((
        details: chrome.webNavigation.GetAllFrameDetails,
      ) => Promise<chrome.webNavigation.GetAllFrameResultDetails[] | null>)
    | null;
  private readonly nativeHandlerBehaviorChanged: (() => Promise<void>) | null;
  private readonly nativeUpdateDynamicRules: (
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) => Promise<void>;
  private readonly nativeUpdateSessionRules: (
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) => Promise<void>;
  private readonly nativeUpdateStaticRules:
    | ((
        update: chrome.declarativeNetRequest.UpdateStaticRulesOptions,
      ) => Promise<void>)
    | null;
  private readonly appliedCss = new Map<string, CssInjection>();
  private readonly parkedCss = new Map<string, CssInjection>();
  private readonly cssKeys = new Map<string, Promise<string>>();
  private readonly cssWrites = new Map<string, Promise<void>>();
  private readonly frameUrls = new Map<string, string>();
  private knownCssContentKeys = new Set<string>();
  private parkedNetworkRules: ParkedNetworkRules | null = null;
  private ownershipPromise: Promise<void> | null = null;
  private persistenceQueue = Promise.resolve();
  private managedConfigurationDepth = 0;
  private revision = 0;
  private rulesEnabled = true;

  private readonly handleNavigation = (
    details: chrome.webNavigation.WebNavigationBaseCallbackDetails,
  ) => {
    this.forgetFrame(details.tabId, details.frameId);
  };

  private readonly handleTabRemoved = (tabId: number) => {
    this.forgetTab(tabId);
  };

  constructor(
    private readonly api: ExtensionBackgroundApi,
    private readonly options: WebExtensionRuleGateOptions,
  ) {
    this.managedStaticRuleSetIds = new Set(options.managedStaticRuleSetIds);
    this.reportError = options.reportError ?? (() => undefined);
    this.nativeInsertCss = api.scripting.insertCSS.bind(api.scripting) as (
      injection: CssInjection,
    ) => Promise<void>;
    this.nativeRemoveCss = api.scripting.removeCSS.bind(api.scripting) as (
      injection: CssInjection,
    ) => Promise<void>;
    this.nativeGetDisabledRuleIds =
      typeof api.declarativeNetRequest.getDisabledRuleIds === 'function'
        ? api.declarativeNetRequest.getDisabledRuleIds.bind(
            api.declarativeNetRequest,
          )
        : null;
    this.nativeGetAllFrames =
      typeof api.webNavigation.getAllFrames === 'function'
        ? api.webNavigation.getAllFrames.bind(api.webNavigation)
        : null;
    this.nativeHandlerBehaviorChanged =
      typeof api.webRequest?.handlerBehaviorChanged === 'function'
        ? api.webRequest.handlerBehaviorChanged.bind(api.webRequest)
        : null;
    this.nativeUpdateDynamicRules =
      api.declarativeNetRequest.updateDynamicRules.bind(
        api.declarativeNetRequest,
      );
    this.nativeUpdateSessionRules =
      api.declarativeNetRequest.updateSessionRules.bind(
        api.declarativeNetRequest,
      );
    this.nativeUpdateStaticRules =
      typeof api.declarativeNetRequest.updateStaticRules === 'function'
        ? api.declarativeNetRequest.updateStaticRules.bind(
            api.declarativeNetRequest,
          )
        : null;
    api.webNavigation.onBeforeNavigate.addListener(this.handleNavigation);
    api.tabs.onRemoved.addListener(this.handleTabRemoved);
  }

  isEnabled() {
    return this.rulesEnabled;
  }

  async allocateRevision() {
    await this.ensureOwnership();
    this.revision = Math.max(this.revision + 1, Date.now());
    await this.persistOwnership();
    return this.revision;
  }

  async runManagedConfiguration<T>(operation: () => Promise<T>) {
    await this.ensureOwnership();
    this.managedConfigurationDepth += 1;
    try {
      const result = await operation();
      this.revision = Math.max(this.revision + 1, Date.now());
      return { result, revision: this.revision };
    } finally {
      this.managedConfigurationDepth -= 1;
      if (this.managedConfigurationDepth === 0) {
        await this.persistOwnership();
      }
    }
  }

  async prepare(rulesEnabled: boolean) {
    await this.ensureOwnership();
    this.rulesEnabled = rulesEnabled;
    if (!rulesEnabled) {
      await Promise.all([this.parkNetworkRules(), this.parkAppliedCss()]);
    }
  }

  async synchronize(rulesEnabled: boolean) {
    await this.ensureOwnership();
    if (rulesEnabled) {
      this.parkedNetworkRules = null;
      await this.restoreParkedCss();
      this.rulesEnabled = true;
      return;
    }
    this.rulesEnabled = false;
    await Promise.all([this.parkNetworkRules(), this.parkAppliedCss()]);
  }

  async setRulesEnabled(rulesEnabled: boolean) {
    await this.ensureOwnership();
    if (this.rulesEnabled === rulesEnabled) return;
    if (rulesEnabled) {
      const parkedNetworkRules = this.parkedNetworkRules;
      try {
        await this.restoreNetworkRules();
        await this.restoreParkedCss();
        this.rulesEnabled = true;
      } catch (error) {
        await this.parkNetworkRules().catch((rollbackError) => {
          this.rulesEnabled = true;
          this.reportError(
            'network-rule-restore-rollback-failed',
            rollbackError,
          );
        });
        this.parkedNetworkRules = parkedNetworkRules;
        throw error;
      }
      return;
    }
    this.rulesEnabled = false;
    try {
      await Promise.all([this.parkNetworkRules(), this.parkAppliedCss()]);
    } catch (error) {
      this.rulesEnabled = true;
      await Promise.allSettled([
        this.restoreNetworkRules(),
        this.restoreParkedCss(),
      ]);
      throw error;
    }
  }

  readonly updateDynamicRules = async (
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) => {
    const managedUpdate = this.normalizeRuleUpdate(
      this.filterManagedUpdate(
        this.managedDynamicRuleIds,
        update,
        this.options.canOwnDynamicRule,
      ),
    );
    if (!this.hasRuleUpdate(managedUpdate)) return;
    await this.nativeUpdateDynamicRules(managedUpdate);
    if (this.managedConfigurationDepth === 0) return;
    this.recordRuleUpdate(
      this.managedDynamicRuleIds,
      managedUpdate,
      this.options.canOwnDynamicRule,
    );
  };

  readonly updateSessionRules = async (
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) => {
    const managedUpdate = this.normalizeRuleUpdate(
      this.filterManagedUpdate(
        this.managedSessionRuleIds,
        update,
        this.options.canOwnSessionRule,
      ),
    );
    if (!this.hasRuleUpdate(managedUpdate)) return;
    await this.nativeUpdateSessionRules(managedUpdate);
    if (this.managedConfigurationDepth === 0) return;
    this.recordRuleUpdate(
      this.managedSessionRuleIds,
      managedUpdate,
      this.options.canOwnSessionRule,
    );
  };

  readonly getDisabledRuleIds = async (
    options: chrome.declarativeNetRequest.GetDisabledRuleIdsOptions,
  ) => this.nativeGetDisabledRuleIds?.(options) ?? [];

  readonly getAllFrames = async (
    details: chrome.webNavigation.GetAllFrameDetails,
  ) => {
    if (!this.nativeGetAllFrames) return null;
    try {
      return await this.nativeGetAllFrames(details);
    } catch (error) {
      const message = extensionErrorMessage(error);
      if (!TRANSIENT_FRAME_LOOKUP_FAILURE.test(message)) throw error;
      if (!/Main frame not found/i.test(message)) return null;
    }

    await new Promise((resolve) => setTimeout(resolve, FRAME_LOOKUP_RETRY_MS));
    try {
      return await this.nativeGetAllFrames(details);
    } catch (error) {
      if (!TRANSIENT_FRAME_LOOKUP_FAILURE.test(extensionErrorMessage(error))) {
        throw error;
      }
      return null;
    }
  };

  readonly updateStaticRules = async (
    update: chrome.declarativeNetRequest.UpdateStaticRulesOptions,
  ) => {
    if (this.nativeUpdateStaticRules) {
      await this.nativeUpdateStaticRules(update);
      return;
    }
    if (
      (update.disableRuleIds?.length ?? 0) > 0 ||
      (update.enableRuleIds?.length ?? 0) > 0
    ) {
      this.reportError(
        'static-rule-update-unsupported',
        new Error(
          'The browser cannot enable or disable individual static DNR rules.',
        ),
      );
    }
  };

  readonly handlerBehaviorChanged = async () => {
    await this.nativeHandlerBehaviorChanged?.();
  };

  readonly executeScript = async (
    tabId: number,
    injection: AdguardScriptInjection,
  ) => {
    const frameId = injection.frameId ?? 0;
    const frameUrl = await this.frameUrl(tabId, frameId);
    if (frameUrl && blocksPageScriptInjection(frameUrl)) return;
    const target = {
      tabId,
      ...(typeof injection.frameId === 'number'
        ? { frameIds: [injection.frameId] }
        : {}),
    };
    if (injection.file) {
      await this.api.scripting.executeScript({
        target,
        files: [injection.file],
      });
      return;
    }
    if (!injection.code) return;
    const userScripts = (
      this.api as ExtensionBackgroundApi & {
        userScripts?: Pick<typeof chrome.userScripts, 'execute'>;
      }
    ).userScripts;
    if (!userScripts?.execute) return;
    await userScripts.execute({
      target,
      js: [{ code: injection.code }],
      injectImmediately: true,
    });
  };

  private async frameUrl(tabId: number, frameId: number) {
    const key = `${tabId}:${frameId}`;
    const cached = this.frameUrls.get(key);
    if (cached) return cached;
    const frames = await this.getAllFrames({ tabId });
    let url = frames?.find((frame) => frame.frameId === frameId)?.url;
    if (!url && frameId === 0) {
      try {
        url = (await this.api.tabs.get(tabId)).url;
      } catch {
        return null;
      }
    }
    if (url) this.frameUrls.set(key, url);
    return url ?? null;
  }

  private filterManagedUpdate(
    ownedRuleIds: ReadonlySet<number>,
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
    canOwnRule?: (rule: chrome.declarativeNetRequest.Rule) => boolean,
  ): chrome.declarativeNetRequest.UpdateRuleOptions {
    if (this.managedConfigurationDepth === 0) return update;
    return {
      ...update,
      ...(update.removeRuleIds
        ? {
            removeRuleIds: update.removeRuleIds.filter((id) =>
              ownedRuleIds.has(id),
            ),
          }
        : {}),
      ...(update.addRules
        ? {
            addRules: canOwnRule
              ? update.addRules.filter(canOwnRule)
              : update.addRules,
          }
        : {}),
    };
  }

  private normalizeRuleUpdate(
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) {
    return this.options.normalizeRuleUpdate?.(update) ?? update;
  }

  private hasRuleUpdate(
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) {
    return (
      (update.addRules?.length ?? 0) > 0 ||
      (update.removeRuleIds?.length ?? 0) > 0
    );
  }

  private recordRuleUpdate(
    ownedRuleIds: Set<number>,
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
    canOwnRule?: (rule: chrome.declarativeNetRequest.Rule) => boolean,
  ) {
    for (const ruleId of update.removeRuleIds ?? []) {
      ownedRuleIds.delete(ruleId);
    }
    for (const rule of update.addRules ?? []) {
      if (!canOwnRule || canOwnRule(rule)) ownedRuleIds.add(rule.id);
    }
  }

  private ensureOwnership() {
    if (!this.ownershipPromise) {
      this.ownershipPromise = this.loadOwnership();
    }
    return this.ownershipPromise;
  }

  async initializeOwnership() {
    await this.ensureOwnership();
  }

  private async loadOwnership() {
    const stored = await this.options.cssStorage.readOwnership();
    if (record(stored) && stored.version === 1) {
      const ownership = stored as Partial<StoredRuleOwnership>;
      if (
        typeof ownership.revision === 'number' &&
        Number.isSafeInteger(ownership.revision) &&
        ownership.revision >= 0
      ) {
        this.revision = ownership.revision;
      }
      for (const id of ownership.dynamicRuleIds ?? []) {
        if (Number.isInteger(id)) this.managedDynamicRuleIds.add(id);
      }
      for (const id of ownership.sessionRuleIds ?? []) {
        if (Number.isInteger(id)) this.managedSessionRuleIds.add(id);
      }
      const cssReads = new Map<string, Promise<string | undefined>>();
      for (const entry of ownership.cssInjections ?? []) {
        const candidate = entry?.injection;
        if (storedCssInjection(candidate)) {
          let read = cssReads.get(candidate.cssKey);
          if (!read) {
            read = this.options.cssStorage.read(candidate.cssKey);
            cssReads.set(candidate.cssKey, read);
          }
          const css = await read;
          if (css === undefined) {
            this.reportError(
              'css-payload-missing',
              new Error(`内容拦截样式缓存缺失：${candidate.cssKey}`),
            );
            continue;
          }
          this.knownCssContentKeys.add(candidate.cssKey);
          const injection = {
            css,
            origin: candidate.origin,
            target: structuredClone(candidate.target),
          } satisfies CssInjection;
          const key = cssInjectionKey(injection);
          (entry.applied ? this.appliedCss : this.parkedCss).set(
            key,
            injection,
          );
        }
      }
      return;
    }

    const [dynamicRules, sessionRules] = await Promise.all([
      this.api.declarativeNetRequest.getDynamicRules(),
      this.api.declarativeNetRequest.getSessionRules(),
    ]);
    for (const rule of dynamicRules) {
      if (this.options.canOwnDynamicRule?.(rule)) {
        this.managedDynamicRuleIds.add(rule.id);
      }
    }
    for (const rule of sessionRules) {
      if (this.options.canOwnSessionRule?.(rule)) {
        this.managedSessionRuleIds.add(rule.id);
      }
    }
    await this.persistOwnership();
  }

  private cssKey(css: string) {
    let key = this.cssKeys.get(css);
    if (!key) {
      key = cssContentKey(css);
      this.cssKeys.set(css, key);
    }
    return key;
  }

  private async storeCssInjection(applied: boolean, injection: CssInjection) {
    const css = injection.css;
    if (typeof css !== 'string') {
      throw new Error('内容拦截样式缺少 CSS 正文。');
    }
    const cssKey = await this.cssKey(css);
    if (!this.knownCssContentKeys.has(cssKey)) {
      let write = this.cssWrites.get(cssKey);
      if (!write) {
        const operation = this.options.cssStorage.write(cssKey, css);
        write = operation.finally(() => {
          if (this.cssWrites.get(cssKey) === write) {
            this.cssWrites.delete(cssKey);
          }
        });
        this.cssWrites.set(cssKey, write);
      }
      await write;
    }
    return {
      applied,
      injection: {
        cssKey,
        origin: injection.origin,
        target: structuredClone(injection.target),
      },
    };
  }

  private persistOwnership() {
    const operation = this.persistenceQueue.then(async () => {
      const cssInjections = await Promise.all([
        ...[...this.appliedCss.values()].map((injection) =>
          this.storeCssInjection(true, injection),
        ),
        ...[...this.parkedCss.values()].map((injection) =>
          this.storeCssInjection(false, injection),
        ),
      ]);
      const nextCssContentKeys = new Set(
        cssInjections.map((entry) => entry.injection.cssKey),
      );
      const ownership: StoredRuleOwnership = {
        version: 1,
        revision: this.revision,
        dynamicRuleIds: [...this.managedDynamicRuleIds].sort((a, b) => a - b),
        sessionRuleIds: [...this.managedSessionRuleIds].sort((a, b) => a - b),
        cssInjections,
      };
      await this.options.cssStorage.writeOwnership(ownership);
      await Promise.all(
        [...this.knownCssContentKeys]
          .filter((contentKey) => !nextCssContentKeys.has(contentKey))
          .map((contentKey) => this.options.cssStorage.remove(contentKey)),
      );
      this.knownCssContentKeys = nextCssContentKeys;
    });
    this.persistenceQueue = operation.catch((error) => {
      this.reportError('rule-ownership-persist-failed', error);
    });
    return operation;
  }

  async insertCSS(injection: CssInjection) {
    if (!isTrackableCss(injection)) {
      return this.nativeInsertCss(injection);
    }
    await this.ensureOwnership();
    const key = cssInjectionKey(injection);
    if (!this.rulesEnabled) {
      this.parkedCss.set(key, structuredClone(injection));
      if (this.managedConfigurationDepth === 0) {
        await this.persistOwnership();
      }
      return;
    }
    if (this.appliedCss.has(key)) return;
    await this.nativeInsertCss(injection);
    this.appliedCss.set(key, structuredClone(injection));
    if (this.managedConfigurationDepth === 0) {
      await this.persistOwnership();
    }
  }

  private async parkNetworkRules() {
    const [enabledRuleSetIds, dynamicRules, sessionRules] = await Promise.all([
      this.api.declarativeNetRequest.getEnabledRulesets(),
      this.api.declarativeNetRequest.getDynamicRules(),
      this.api.declarativeNetRequest.getSessionRules(),
    ]);
    const managedStaticRuleSetIds = enabledRuleSetIds.filter((id) =>
      this.managedStaticRuleSetIds.has(id),
    );
    const managedDynamicRules = dynamicRules.filter((rule) =>
      this.managedDynamicRuleIds.has(rule.id),
    );
    const managedSessionRules = sessionRules.filter((rule) =>
      this.managedSessionRuleIds.has(rule.id),
    );
    this.parkedNetworkRules = {
      staticRuleSetIds: managedStaticRuleSetIds,
      dynamicRules: structuredClone(managedDynamicRules),
      sessionRules: structuredClone(managedSessionRules),
    };
    await Promise.all([
      managedStaticRuleSetIds.length > 0
        ? this.api.declarativeNetRequest.updateEnabledRulesets({
            disableRulesetIds: managedStaticRuleSetIds,
          })
        : Promise.resolve(),
      managedDynamicRules.length > 0
        ? this.nativeUpdateDynamicRules({
            removeRuleIds: managedDynamicRules.map((rule) => rule.id),
          })
        : Promise.resolve(),
      managedSessionRules.length > 0
        ? this.nativeUpdateSessionRules({
            removeRuleIds: managedSessionRules.map((rule) => rule.id),
          })
        : Promise.resolve(),
    ]);
  }

  private async restoreNetworkRules() {
    const parked = this.parkedNetworkRules;
    if (!parked) return;
    await Promise.all([
      parked.staticRuleSetIds.length > 0
        ? this.api.declarativeNetRequest.updateEnabledRulesets({
            enableRulesetIds: parked.staticRuleSetIds,
          })
        : Promise.resolve(),
      parked.dynamicRules.length > 0
        ? this.nativeUpdateDynamicRules({
            removeRuleIds: parked.dynamicRules.map((rule) => rule.id),
            addRules: structuredClone(parked.dynamicRules),
          })
        : Promise.resolve(),
      parked.sessionRules.length > 0
        ? this.nativeUpdateSessionRules({
            removeRuleIds: parked.sessionRules.map((rule) => rule.id),
            addRules: structuredClone(parked.sessionRules),
          })
        : Promise.resolve(),
    ]);
    this.parkedNetworkRules = null;
  }

  private async parkAppliedCss() {
    const entries = [...this.appliedCss.entries()];
    if (entries.length === 0) return;
    this.appliedCss.clear();
    const removals = await Promise.allSettled(
      entries.map(([, injection]) => this.nativeRemoveCss(injection)),
    );
    removals.forEach((result, index) => {
      const [key, injection] = entries[index];
      if (result.status === 'fulfilled') {
        this.parkedCss.set(key, injection);
      } else {
        this.appliedCss.set(key, injection);
        this.reportError('css-remove-failed', result.reason);
      }
    });
    await this.persistOwnership();
  }

  private async restoreParkedCss() {
    const entries = [...this.parkedCss.entries()];
    if (entries.length === 0) return;
    this.parkedCss.clear();
    const insertions = await Promise.allSettled(
      entries.map(([, injection]) => this.nativeInsertCss(injection)),
    );
    insertions.forEach((result, index) => {
      const [key, injection] = entries[index];
      if (result.status === 'fulfilled') {
        this.appliedCss.set(key, injection);
      } else {
        this.parkedCss.set(key, injection);
        this.reportError('css-restore-failed', result.reason);
      }
    });
    await this.persistOwnership();
  }

  private forgetFrame(tabId: number, frameId: number) {
    this.frameUrls.delete(`${tabId}:${frameId}`);
    let changed = false;
    for (const [key, injection] of this.appliedCss) {
      if (appliesToFrame(injection, tabId, frameId)) {
        this.appliedCss.delete(key);
        changed = true;
      }
    }
    for (const [key, injection] of this.parkedCss) {
      if (appliesToFrame(injection, tabId, frameId)) {
        this.parkedCss.delete(key);
        changed = true;
      }
    }
    if (changed) void this.persistOwnership().catch(() => undefined);
  }

  private forgetTab(tabId: number) {
    for (const key of this.frameUrls.keys()) {
      if (key.startsWith(`${tabId}:`)) this.frameUrls.delete(key);
    }
    let changed = false;
    for (const [key, injection] of this.appliedCss) {
      if (injection.target.tabId === tabId) {
        this.appliedCss.delete(key);
        changed = true;
      }
    }
    for (const [key, injection] of this.parkedCss) {
      if (injection.target.tabId === tabId) {
        this.parkedCss.delete(key);
        changed = true;
      }
    }
    if (changed) void this.persistOwnership().catch(() => undefined);
  }
}
