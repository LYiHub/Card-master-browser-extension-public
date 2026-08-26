import {
  installUserscriptSource,
  UserscriptInstallError,
} from '../../userscript/application/install-service';
import {
  hydrateScript,
  type StoredScript,
  storedScript,
  type TransactionalScriptRepository,
} from '../../userscript/application/script-repository';
import { userscriptSiteSearchUrl } from '../../userscript/application/site-search';
import type {
  MetadataDiagnostic,
  UserscriptPresentation,
} from '../../userscript/domain/types';
import { userscriptPlatformCompatibilityDiagnostics } from '../../userscript/runtime/platform-compatibility';
import {
  type ExtensionBackgroundApi,
  USER_SCRIPTS_API_UNAVAILABLE,
} from './api';
import { extensionContentHostUrl } from './content-host-url';
import { extensionDiagnostics } from './diagnostics';
import { monitorExtensionMessageDeliveries } from './extension-message-delivery';
import type { GlobalLibraryHostCoordinator } from './global-library-host';
import {
  normalizeUserscriptSourceUrl,
  type UserscriptInstallInterceptor,
} from './installer';
import { injectableExtensionPage } from './page-host-refresh';
import { extensionTarget } from './platform';
import { EXTENSION_CHANNEL, type ExtensionRequest } from './protocol';
import type { RegisteredUserscriptSynchronizer } from './registration-sync';
import type { ExtensionRuntimeBridge } from './runtime-bridge';
import { safariMainWorldScripts } from './safari-main-world';
import { executeSafariUserscriptRegistration } from './safari-userscript-executor';
import {
  fetchExtensionText,
  normalizeExtensionSourceUrl,
} from './source-fetch';
import {
  type UserscriptActivationCoordinator,
  type UserscriptActivationResult,
  userscriptLibraryChanges,
} from './userscript-activation-coordinator';
import { userscriptExecutionCapability } from './userscript-permission';

const MESSAGE_DELIVERY_TIMEOUT_MS = 2_000;

type InstalledScripts = Awaited<
  ReturnType<TransactionalScriptRepository['list']>
>;

type LibraryChangeMessage = {
  channel: typeof EXTENSION_CHANNEL;
  type: 'library-changed';
  orderedIds: string[];
  scripts: StoredScript[];
};

type PreparedLibraryMutation = {
  message: LibraryChangeMessage;
  finalize: () => Promise<{
    activation: UserscriptActivationResult | undefined;
    failures: unknown[];
  }>;
};

export const USERSCRIPT_LIBRARY_MESSAGE_UNHANDLED = Symbol(
  'userscript-library-message-unhandled',
);

class UserscriptPreviewError extends UserscriptInstallError {
  constructor(
    diagnostics: readonly MetadataDiagnostic[],
    readonly source: string,
    readonly sourceUrl: string,
  ) {
    super(diagnostics);
    this.name = 'UserscriptPreviewError';
  }
}

export function userscriptBackgroundErrorResponse(error: unknown) {
  if (error instanceof UserscriptInstallError) {
    return {
      error: error.message || '脚本未通过兼容性预检。',
      diagnostics: error.diagnostics,
      ...(error instanceof UserscriptPreviewError
        ? { source: error.source, sourceUrl: error.sourceUrl }
        : {}),
    };
  }
  return {
    error: error instanceof Error ? error.message : String(error),
  };
}

type UserscriptLibraryCoordinatorDependencies = {
  api: ExtensionBackgroundApi;
  repository: TransactionalScriptRepository;
  synchronizer: RegisteredUserscriptSynchronizer | null;
  runtimeBridge: ExtensionRuntimeBridge | null;
  activation: UserscriptActivationCoordinator;
  installer: UserscriptInstallInterceptor;
  globalLibrary: GlobalLibraryHostCoordinator;
  nativeUserscriptsAvailable: boolean;
  safariRuntime: boolean;
  scheduleActivationReload: (activation: UserscriptActivationResult) => void;
  reportFailure: (context: string, error: unknown) => void;
};

export class UserscriptLibraryCoordinator {
  constructor(
    private readonly dependencies: UserscriptLibraryCoordinatorDependencies,
  ) {}

  private installOptions(
    source: string,
    origin: string,
    presentation?: UserscriptPresentation,
  ) {
    return {
      source,
      origin,
      presentation,
      createId: () => `installed-userscript-${crypto.randomUUID()}`,
      now: Date.now,
    };
  }

  private async prepareInstall(value: string) {
    const requestedUrl = normalizeUserscriptSourceUrl(value);
    const download = await fetchExtensionText(requestedUrl);
    if (!download.ok) {
      throw new Error(`脚本源码下载失败：HTTP ${download.status}。`);
    }
    try {
      return {
        sourceUrl: download.finalUrl,
        installation: installUserscriptSource(
          await this.dependencies.repository.list(),
          this.installOptions(download.body, download.finalUrl),
        ),
      };
    } catch (error) {
      if (error instanceof UserscriptInstallError) {
        throw new UserscriptPreviewError(
          error.diagnostics,
          download.body,
          download.finalUrl,
        );
      }
      throw error;
    }
  }

  private libraryChange(
    scripts: InstalledScripts,
    changedIds: ReadonlySet<string>,
  ): LibraryChangeMessage {
    return {
      channel: EXTENSION_CHANNEL,
      type: 'library-changed' as const,
      orderedIds: scripts.map((script) => script.id),
      scripts: scripts
        .filter((script) => changedIds.has(script.id))
        .map(storedScript),
    };
  }

  private sameScript(
    left: ReturnType<typeof hydrateScript>,
    right: ReturnType<typeof hydrateScript>,
  ) {
    return (
      JSON.stringify(storedScript(left)) === JSON.stringify(storedScript(right))
    );
  }

  private upsert(
    scripts: readonly ReturnType<typeof hydrateScript>[],
    script: ReturnType<typeof hydrateScript>,
  ) {
    const index = scripts.findIndex((candidate) => candidate.id === script.id);
    if (index < 0) return [...scripts, script];
    if (this.sameScript(scripts[index], script)) return scripts;
    return scripts.map((candidate, candidateIndex) =>
      candidateIndex === index ? script : candidate,
    );
  }

  private async broadcast(message: LibraryChangeMessage) {
    const { api } = this.dependencies;
    const tabs = (await api.tabs.query({})).filter(injectableExtensionPage);
    monitorExtensionMessageDeliveries(
      [
        api.runtime.sendMessage(message),
        ...tabs.flatMap((tab) =>
          typeof tab.id === 'number'
            ? [api.tabs.sendMessage(tab.id, message, { frameId: 0 })]
            : [],
        ),
      ],
      MESSAGE_DELIVERY_TIMEOUT_MS,
      ({ failed, timedOut }) => {
        if (failed === 0) return;
        extensionDiagnostics.warn(
          'background',
          'library-broadcast-incomplete',
          new Error('部分页面没有接收用户脚本牌库更新。'),
          {
            attemptedPageHosts: tabs.length,
            attemptedExtensionBroadcasts: 1,
            failedDeliveries: failed,
            timedOutDeliveries: timedOut,
          },
        );
      },
    );
  }

  private prepareMutation(
    previous: InstalledScripts,
    next: InstalledScripts,
    tabId?: number,
  ): PreparedLibraryMutation {
    const { synchronizer, runtimeBridge, activation } = this.dependencies;
    const changes = userscriptLibraryChanges(previous, next);
    const message = this.libraryChange(next, changes.changedIds);
    return {
      message,
      finalize: async () => {
        const failures: unknown[] = [];
        if (changes.runtimeChangedIds.size > 0) {
          try {
            await synchronizer?.schedule();
          } catch (error) {
            failures.push(error);
          }
        }
        let activationResult: UserscriptActivationResult | undefined;
        try {
          activationResult = await activation.reconcile(
            previous,
            next,
            synchronizer ? tabId : undefined,
          );
        } catch (error) {
          failures.push(error);
        }
        const sideEffects = await Promise.allSettled([
          ...[...changes.removedIds].map((scriptId) =>
            Promise.resolve().then(() => runtimeBridge?.removeValues(scriptId)),
          ),
          this.broadcast(message),
        ]);
        failures.push(
          ...sideEffects.flatMap((result) =>
            result.status === 'rejected' ? [result.reason] : [],
          ),
        );
        return { activation: activationResult, failures };
      },
    };
  }

  async commit(
    previous: InstalledScripts,
    next: InstalledScripts,
    tabId?: number,
  ) {
    const mutation = this.prepareMutation(previous, next, tabId);
    const { activation, failures } = await mutation.finalize();
    if (!activation || failures.length > 0) {
      throw new AggregateError(
        failures.length > 0
          ? failures
          : [new Error('用户脚本运行时协调没有返回结果。')],
        '用户脚本仓库收尾失败。',
      );
    }
    return { message: mutation.message, activation };
  }

  async removeAll() {
    const committed = await this.dependencies.repository.transact(
      (current) => ({
        scripts: current.length > 0 ? [] : current,
        result: { previous: [...current] },
      }),
    );
    const removed = committed.result.previous.length;
    if (removed === 0) return 0;
    await this.complete(
      this.prepareMutation(committed.result.previous, committed.scripts),
    );
    return removed;
  }

  private async complete(mutation: PreparedLibraryMutation) {
    const { activation, failures } = await mutation.finalize();
    if (activation) {
      this.dependencies.scheduleActivationReload(activation);
    }
    if (failures.length > 0) {
      this.dependencies.reportFailure(
        '用户脚本仓库收尾失败',
        new AggregateError(failures, '用户脚本仓库收尾失败。'),
      );
    }
    return mutation.message;
  }

  private targetTabId(sender: chrome.runtime.MessageSender) {
    return sender.tab && injectableExtensionPage(sender.tab)
      ? sender.tab.id
      : undefined;
  }

  async route(
    message: ExtensionRequest,
    sender: chrome.runtime.MessageSender,
  ): Promise<unknown | typeof USERSCRIPT_LIBRARY_MESSAGE_UNHANDLED> {
    const {
      api,
      repository,
      synchronizer,
      runtimeBridge,
      installer,
      globalLibrary,
      nativeUserscriptsAvailable,
      safariRuntime,
      reportFailure,
    } = this.dependencies;
    switch (message.type) {
      case 'userscript-installer-open': {
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number') {
          throw new Error('脚本安装请求缺少当前标签页身份。');
        }
        await installer.open(tabId, message.url);
        return { ok: true };
      }
      case 'userscript-install-preview': {
        const prepared = await this.prepareInstall(message.url);
        return {
          preview: {
            sourceUrl: prepared.sourceUrl,
            mode: prepared.installation.mode,
            script: storedScript(prepared.installation.script),
            diagnostics: [
              ...prepared.installation.diagnostics,
              ...userscriptPlatformCompatibilityDiagnostics(
                prepared.installation.script,
                extensionTarget(),
              ),
            ],
          },
        };
      }
      case 'userscript-install-confirm': {
        if (!nativeUserscriptsAvailable) {
          throw new Error(USER_SCRIPTS_API_UNAVAILABLE);
        }
        const sourceUrl = normalizeExtensionSourceUrl(message.sourceUrl);
        const committed = await repository.transact((current) => {
          const installation = installUserscriptSource(
            current,
            this.installOptions(
              message.source,
              sourceUrl,
              message.presentation,
            ),
          );
          return {
            scripts: this.upsert(current, installation.script),
            result: { installation, previous: [...current] },
          };
        });
        const { installation, previous } = committed.result;
        const mutation = await this.commit(
          previous,
          committed.scripts,
          this.targetTabId(sender),
        );
        this.dependencies.scheduleActivationReload(mutation.activation);
        return {
          result: {
            mode: installation.mode,
            script: storedScript(installation.script),
          },
        };
      }
      case 'library-list':
        return { scripts: (await repository.list()).map(storedScript) };
      case 'library-upsert': {
        const script = hydrateScript(message.script);
        const committed = await repository.transact((current) => ({
          scripts: this.upsert(current, script),
          result: { previous: [...current] },
        }));
        return this.complete(
          this.prepareMutation(
            committed.result.previous,
            committed.scripts,
            this.targetTabId(sender),
          ),
        );
      }
      case 'library-remove': {
        const committed = await repository.transact((current) => {
          const scripts = current.filter(
            (script) => script.id !== message.scriptId,
          );
          return {
            scripts: scripts.length === current.length ? current : scripts,
            result: { previous: [...current] },
          };
        });
        return this.complete(
          this.prepareMutation(
            committed.result.previous,
            committed.scripts,
            this.targetTabId(sender),
          ),
        );
      }
      case 'library-reorder': {
        const scripts = await repository.reorder(message.orderedIds);
        const event = this.libraryChange(scripts, new Set());
        try {
          await this.broadcast(event);
        } catch (error) {
          reportFailure('用户脚本牌库排序广播失败', error);
        }
        return event;
      }
      case 'library-replace-all': {
        const scripts = message.scripts.map(hydrateScript);
        const committed = await repository.transact((current) => ({
          scripts:
            current.length === scripts.length &&
            current.every(
              (script, index) =>
                scripts[index]?.id === script.id &&
                this.sameScript(script, scripts[index]),
            )
              ? current
              : scripts,
          result: { previous: [...current] },
        }));
        return this.complete(
          this.prepareMutation(
            committed.result.previous,
            committed.scripts,
            this.targetTabId(sender),
          ),
        );
      }
      case 'global-library-open': {
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number') {
          throw new Error('全局脚本牌库请求缺少当前标签页身份。');
        }
        await globalLibrary.prepare(tabId);
        return { ok: true };
      }
      case 'site-script-search-open': {
        const pageUrl = sender.tab?.url ?? sender.url;
        if (!pageUrl) {
          throw new Error('站点脚本检索请求缺少当前页面地址。');
        }
        await api.tabs.create({
          active: true,
          url: userscriptSiteSearchUrl(pageUrl),
        });
        return { ok: true };
      }
      case 'main-world-runtime': {
        if (!synchronizer || !runtimeBridge) {
          throw new Error(USER_SCRIPTS_API_UNAVAILABLE);
        }
        await synchronizer.ensureReady();
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number') {
          throw new Error('Runtime event is missing a tab identity.');
        }
        runtimeBridge.reportMainWorld(
          tabId,
          sender.frameId ?? 0,
          sender.documentId,
          message.scriptId,
          message.capability,
          message.message,
        );
        return { ok: true };
      }
      case 'get-page-context': {
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number') {
          throw new Error('Page context request is missing a tab identity.');
        }
        return { tabId, frameId: sender.frameId ?? 0 };
      }
      case 'userscript-capability-read':
        return userscriptExecutionCapability(api);
      case 'safari-main-world-injection-request': {
        if (!safariRuntime) return { ok: false, failedFiles: [] };
        const tabId = sender.tab?.id;
        const frameId = sender.frameId ?? 0;
        const pageUrl = sender.url ?? sender.tab?.url;
        if (
          typeof tabId !== 'number' ||
          !pageUrl ||
          !extensionContentHostUrl(pageUrl)
        ) {
          return { ok: false, failedFiles: [] };
        }
        const target = sender.documentId
          ? { tabId, documentIds: [sender.documentId] }
          : { tabId, frameIds: [frameId] };
        const failedFiles: string[] = [];
        for (const file of safariMainWorldScripts(pageUrl, frameId === 0)) {
          try {
            await api.scripting.executeScript({
              target,
              files: [file],
              world: 'MAIN',
            });
          } catch {
            failedFiles.push(file);
          }
        }
        return { ok: failedFiles.length === 0, failedFiles };
      }
      case 'safari-userscript-runtime-run': {
        if (!safariRuntime || !synchronizer) {
          throw new Error('Safari 用户脚本运行时不可用。');
        }
        const tabId = sender.tab?.id;
        const pageUrl = sender.url ?? sender.tab?.url;
        if (typeof tabId !== 'number' || !pageUrl) {
          throw new Error('Safari 用户脚本请求缺少页面身份。');
        }
        const registrations = await synchronizer.pageExecutionRegistrations(
          {
            url: pageUrl,
            frameId: sender.frameId ?? 0,
            topFrame: (sender.frameId ?? 0) === 0,
          },
          message.runAt,
        );
        const target = sender.documentId
          ? { tabId, documentIds: [sender.documentId] }
          : { tabId, frameIds: [sender.frameId ?? 0] };
        const results = await Promise.allSettled(
          registrations.map((registration) =>
            executeSafariUserscriptRegistration(
              api.scripting,
              target,
              registration,
            ),
          ),
        );
        const failures = results.flatMap((result, index) =>
          result.status === 'rejected'
            ? [
                {
                  registrationId: registrations[index]?.id,
                  error:
                    result.reason instanceof Error
                      ? result.reason.message
                      : String(result.reason),
                },
              ]
            : [],
        );
        if (failures.length > 0) {
          extensionDiagnostics.warn(
            'safari-userscript-runtime',
            `${message.runAt}-incomplete`,
            new Error('部分 Safari 用户脚本未能注入。'),
            { failures, pageUrl },
          );
        }
        return {
          executed: registrations.length - failures.length,
          failures,
        };
      }
      case 'get-runtime-state': {
        if (!synchronizer || !runtimeBridge) {
          return { error: USER_SCRIPTS_API_UNAVAILABLE };
        }
        await synchronizer.ensureReady();
        const registrationError = synchronizer.getError(message.scriptId);
        if (registrationError) return { error: registrationError };
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number') {
          return { error: 'Runtime state request is missing a tab identity.' };
        }
        const state = await runtimeBridge.state(
          tabId,
          sender.frameId ?? 0,
          message.scriptId,
          sender.documentId,
        );
        return state ? { state } : {};
      }
      case 'invoke-command': {
        if (!runtimeBridge) return { error: USER_SCRIPTS_API_UNAVAILABLE };
        const tabId = sender.tab?.id;
        if (typeof tabId !== 'number') {
          return { error: 'Command invocation is missing a tab identity.' };
        }
        const result = await runtimeBridge.invoke(
          tabId,
          sender.frameId ?? 0,
          message.scriptId,
          message.commandId,
        );
        if (result.ok) return { ok: true, value: result.value };
        const { error } = result;
        return {
          error,
          code:
            error === 'The script instance is not running.'
              ? 'instance-not-running'
              : error === 'The runtime command is no longer registered.'
                ? 'command-not-registered'
                : 'invocation-failed',
        };
      }
      default:
        return USERSCRIPT_LIBRARY_MESSAGE_UNHANDLED;
    }
  }
}
