import {
  createTsWebExtension,
  FilterList,
  MESSAGE_HANDLER_NAME,
  MessageType,
} from '@adguard/tswebextension';

import { extensionErrorMessage } from '../../lib/extension-errors';
import type { ContentBlockingEngine } from '../application/service';
import type {
  ContentBlockingEngineReport,
  ContentBlockingState,
} from '../domain/types';
import { defaultContentBlockingState } from '../domain/types';
import { normalizeAdguardDiagnostics } from './adguard-diagnostics';
import { runAdguardEnginePhase } from './adguard-engine-error';
import {
  createAdguardFirefoxConfiguration,
  type FirefoxFilterAsset,
} from './adguard-firefox-configuration';
import { normalizeAdguardMessage } from './adguard-message';
import type { ContentBlockingRuleGate } from './webextension-rule-gate';

const WEB_ACCESSIBLE_RESOURCES_PATH = 'web-accessible-resources';
const FILTER_ASSET_DIRECTORY = 'filters/webrequest';
const LOCAL_SCRIPT_RULES_PATH = `${FILTER_ASSET_DIRECTORY}/local_script_rules.json`;

type LocalScriptRules = Parameters<
  ReturnType<typeof createTsWebExtension>['setLocalScriptRules']
>[0];

function filterList(source: string) {
  const list = new FilterList(source);
  return {
    content: list.getContent(),
    conversionData: list.getConversionData(),
  };
}

function extensionResourceUrl(path: string) {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.getURL) {
    throw new Error('Firefox 扩展资源 API 不可用。');
  }
  return runtime.getURL(path);
}

async function readJsonResource<T>(path: string): Promise<T> {
  const response = await fetch(extensionResourceUrl(path));
  if (!response.ok) {
    throw new Error(`无法读取扩展资源 ${path}：HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export class AdguardContentBlockingEngine implements ContentBlockingEngine {
  private readonly engine = createTsWebExtension(WEB_ACCESSIBLE_RESOURCES_PATH);
  private readonly messageHandler = this.engine.getMessageHandler();
  private readonly filterAssets = new Map<number, FirefoxFilterAsset>();
  private storageInitialization: Promise<void> | null = null;
  private storageInitialized = false;
  private localScriptRulesInitialized = false;
  private started = false;
  private rulesEnabled = true;
  private revision = 0;

  constructor(
    private readonly ruleGate: ContentBlockingRuleGate,
    _userscriptApiAvailable: boolean,
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

  private async initializeLocalScriptRules() {
    if (this.localScriptRulesInitialized) return;
    const rules = await readJsonResource<LocalScriptRules>(
      LOCAL_SCRIPT_RULES_PATH,
    );
    this.engine.setLocalScriptRules(rules);
    this.localScriptRulesInitialized = true;
  }

  private async loadFilterAssets(filterIds: readonly number[]) {
    const missing = filterIds.filter(
      (filterId) => !this.filterAssets.has(filterId),
    );
    await Promise.all(
      missing.map(async (filterId) => {
        const asset = await readJsonResource<FirefoxFilterAsset>(
          `${FILTER_ASSET_DIRECTORY}/filter_${filterId}.json`,
        );
        if (asset.filterId !== filterId || !asset.content.trim()) {
          throw new Error(`Firefox 内置过滤器 ${filterId} 资源无效。`);
        }
        this.filterAssets.set(filterId, asset);
      }),
    );
  }

  private async configuration(state: ContentBlockingState) {
    await this.loadFilterAssets(state.enabledStaticFilterIds);
    return createAdguardFirefoxConfiguration(
      state,
      [...this.filterAssets.values()],
      filterList,
    );
  }

  private report(
    conversionErrors: readonly unknown[] = [],
  ): ContentBlockingEngineReport {
    this.revision = Math.max(this.revision + 1, Date.now());
    return {
      revision: this.revision,
      loadedRuleCount: this.engine.getRulesCount(),
      ...normalizeAdguardDiagnostics(
        {
          staticErrors: [],
          dynamicErrors: [],
          conversionErrors,
          limitations: [],
        },
        this.currentState,
      ),
    };
  }

  private currentState: ContentBlockingState = {
    ...defaultContentBlockingState(),
  };

  async start(state: ContentBlockingState) {
    await Promise.all([
      this.initializeStorage(),
      this.initializeLocalScriptRules(),
      this.ruleGate.prepare(state.rulesEnabled),
    ]);
    const configuration = await this.configuration(state);
    const result = await runAdguardEnginePhase('首次规则配置', () =>
      this.ruleGate.runManagedConfiguration(async () => {
        return this.engine.start(configuration);
      }),
    );
    this.started = true;
    this.rulesEnabled = state.rulesEnabled;
    this.currentState = structuredClone(state);
    await this.ruleGate.synchronize(state.rulesEnabled);
    return this.report(result.result.conversionErrors);
  }

  async configure(state: ContentBlockingState) {
    const configuration = await this.configuration(state);
    const result = await runAdguardEnginePhase('规则重新配置', () =>
      this.ruleGate.runManagedConfiguration(async () => {
        return this.engine.configure(configuration);
      }),
    );
    this.rulesEnabled = state.rulesEnabled;
    this.currentState = structuredClone(state);
    await this.ruleGate.synchronize(state.rulesEnabled);
    return this.report(result.result.conversionErrors);
  }

  async setRulesEnabled(rulesEnabled: boolean) {
    await runAdguardEnginePhase('规则启停', async () => {
      if (rulesEnabled) {
        await this.ruleGate.setRulesEnabled(true);
        await this.engine.setFilteringEnabled(true);
        return;
      }
      await this.engine.setFilteringEnabled(false);
      await this.ruleGate.setRulesEnabled(false);
    });
    this.rulesEnabled = rulesEnabled;
    return this.report();
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
    if (
      !this.started ||
      (!this.rulesEnabled && message && typeof message === 'object')
    ) {
      const type =
        message && typeof message === 'object' && 'type' in message
          ? message.type
          : undefined;
      if (type === MessageType.GetCosmeticData) {
        return {
          isAppStarted: true,
          revision: this.revision,
          areHitsStatsCollected: false,
          extCssRules: null,
          nativeCssSelectors: null,
        };
      }
      if (type === MessageType.GetCookieRules) {
        return { isAppStarted: true, cookieRules: [] };
      }
      if (type === MessageType.ProcessShouldCollapse) return false;
    }

    try {
      const response = await this.messageHandler(
        normalizeAdguardMessage(message, MESSAGE_HANDLER_NAME) as never,
        sender as never,
      );
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === MessageType.GetCosmeticData &&
        response &&
        typeof response === 'object'
      ) {
        return { ...response, revision: this.revision };
      }
      return response;
    } catch (error) {
      throw new Error(
        `Firefox 内容拦截请求失败：${extensionErrorMessage(error)}`,
        { cause: error },
      );
    }
  }
}
