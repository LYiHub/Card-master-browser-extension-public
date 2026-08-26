import { localScriptRules } from 'virtual:adguard-local-script-rules';
import {
  type ConfigurationResult,
  FilterList,
  MESSAGE_HANDLER_NAME,
  MessageType,
  TsWebExtension,
} from '@adguard/tswebextension/mv3';
import type { ContentBlockingEngine } from '../application/service';
import type {
  ContentBlockingEngineReport,
  ContentBlockingState,
} from '../domain/types';
import { createAdguardConfiguration } from './adguard-configuration';
import { normalizeAdguardDiagnostics } from './adguard-diagnostics';
import { runAdguardEnginePhase } from './adguard-engine-error';
import { normalizeAdguardMessage } from './adguard-message';
import type { ContentBlockingRuleGate } from './webextension-rule-gate';

const WEB_ACCESSIBLE_RESOURCES_PATH = '/web-accessible-resources/redirects';

function filterList(source: string) {
  const list = new FilterList(source);
  return {
    content: list.getContent(),
    conversionData: list.getConversionData(),
  };
}

function engineReport(
  engine: TsWebExtension,
  result: ConfigurationResult,
  state: ContentBlockingState,
  revision: number,
): ContentBlockingEngineReport {
  const diagnostics = normalizeAdguardDiagnostics(
    {
      staticErrors: result.staticFiltersStatus.errors,
      dynamicErrors: result.dynamicRules?.errors ?? [],
      limitations: result.dynamicRules?.limitations ?? [],
    },
    state,
  );
  return {
    revision,
    loadedRuleCount: engine.getRulesCount(),
    ...diagnostics,
  };
}

export class AdguardContentBlockingEngine implements ContentBlockingEngine {
  private readonly engine = new TsWebExtension(WEB_ACCESSIBLE_RESOURCES_PATH);
  private readonly messageHandler = this.engine.getMessageHandler();
  private storageInitialization: Promise<void> | null = null;
  private storageInitialized = false;
  private started = false;
  private filterCache = new Map<
    string,
    { source: string; prepared: ReturnType<typeof filterList> }
  >();
  private report: ContentBlockingEngineReport = {
    revision: 0,
    loadedRuleCount: 0,
    errors: [],
    limitations: [],
  };

  constructor(
    private readonly ruleGate: ContentBlockingRuleGate,
    private readonly userscriptApiAvailable: boolean,
  ) {}

  private initializeStorage() {
    if (this.storageInitialized) return Promise.resolve();
    if (!this.storageInitialization) {
      const operation = runAdguardEnginePhase('存储初始化', () =>
        this.engine.initStorage(),
      ).then(() => {
        this.storageInitialized = true;
      });
      this.storageInitialization = operation;
      const release = () => {
        if (this.storageInitialization === operation) {
          this.storageInitialization = null;
        }
      };
      void operation.then(release, release);
    }
    return this.storageInitialization;
  }

  private configuration(state: ContentBlockingState) {
    const nextCache = new Map<
      string,
      { source: string; prepared: ReturnType<typeof filterList> }
    >();
    const configuration = createAdguardConfiguration(
      state,
      (source, cacheKey) => {
        if (!cacheKey) return filterList(source);
        const cached = this.filterCache.get(cacheKey);
        const prepared =
          cached?.source === source ? cached.prepared : filterList(source);
        nextCache.set(cacheKey, { source, prepared });
        return prepared;
      },
    );
    this.filterCache = nextCache;
    return configuration;
  }

  async start(state: ContentBlockingState) {
    if (!this.userscriptApiAvailable) {
      TsWebExtension.setLocalScriptRules(localScriptRules);
    }
    await this.initializeStorage();
    await runAdguardEnginePhase('规则门控准备', () =>
      this.ruleGate.prepare(state.rulesEnabled),
    );
    const phase = this.started ? '规则重新配置' : '首次规则配置';
    const { result, revision } = await runAdguardEnginePhase(phase, () =>
      this.ruleGate.runManagedConfiguration(async () => {
        const configuration = this.configuration(state);
        if (this.started) return this.engine.configure(configuration);
        const initial = await this.engine.start(configuration);
        this.started = true;
        return initial;
      }),
    );
    this.report = engineReport(this.engine, result, state, revision);
    await runAdguardEnginePhase('规则门控同步', () =>
      this.ruleGate.synchronize(state.rulesEnabled),
    );
    return this.report;
  }

  async configure(state: ContentBlockingState) {
    const { result, revision } = await runAdguardEnginePhase(
      '规则重新配置',
      () =>
        this.ruleGate.runManagedConfiguration(() =>
          this.engine.configure(this.configuration(state)),
        ),
    );
    this.report = engineReport(this.engine, result, state, revision);
    await runAdguardEnginePhase('规则门控同步', () =>
      this.ruleGate.synchronize(state.rulesEnabled),
    );
    return this.report;
  }

  async setRulesEnabled(rulesEnabled: boolean) {
    await runAdguardEnginePhase('规则启停', () =>
      this.ruleGate.setRulesEnabled(rulesEnabled),
    );
    this.report = {
      ...this.report,
      revision: await runAdguardEnginePhase('规则版本保存', () =>
        this.ruleGate.allocateRevision(),
      ),
    };
    return this.report;
  }

  handlesMessage(message: unknown) {
    return Boolean(
      message &&
        typeof message === 'object' &&
        'handlerName' in message &&
        message.handlerName === MESSAGE_HANDLER_NAME,
    );
  }

  async handleMessage(message: unknown, sender: unknown) {
    if (!this.ruleGate.isEnabled() && message && typeof message === 'object') {
      const type = 'type' in message ? message.type : undefined;
      if (type === MessageType.GetCosmeticData) {
        return Promise.resolve({
          isAppStarted: true,
          revision: this.report.revision,
          areHitsStatsCollected: false,
          extCssRules: null,
          nativeCssSelectors: null,
        });
      }
      if (type === MessageType.GetCookieRules) {
        return Promise.resolve({
          isAppStarted: true,
          cookieRules: [],
        });
      }
      if (type === MessageType.ProcessShouldCollapse) {
        return Promise.resolve(false);
      }
    }
    const response = await runAdguardEnginePhase('页面规则查询', () =>
      this.messageHandler(
        normalizeAdguardMessage(message, MESSAGE_HANDLER_NAME) as never,
        sender as never,
      ),
    );
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === MessageType.GetCosmeticData &&
      response &&
      typeof response === 'object'
    ) {
      return { ...response, revision: this.report.revision };
    }
    return response;
  }
}
