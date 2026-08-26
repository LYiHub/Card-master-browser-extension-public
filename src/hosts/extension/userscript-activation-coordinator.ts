import type { AiScriptExecution } from '../../ai/domain/types';
import type { UserscriptSettings } from '../../userscript/application/settings';
import { matchInstalledUserscript } from '../../userscript/domain/matcher';
import type {
  InstalledUserscript,
  UserscriptRuntimeState,
} from '../../userscript/domain/types';
import type { AssistantPageAttachment } from './assistant-page-observer';

const RELOAD_DELAY_MS = 150;
const EXECUTION_CONCURRENCY = 4;

type ActivationRuntime = {
  state(
    tabId: number,
    frameId: number,
    scriptId: string,
    documentId?: string,
  ): Promise<UserscriptRuntimeState | undefined>;
  invalidate(scriptIds: ReadonlySet<string>): void;
};

type CurrentDocumentRunner = {
  execute(
    attachment: AssistantPageAttachment,
    scriptId: string,
  ): Promise<AiScriptExecution>;
};

type ActivationApi = {
  tabs: Pick<typeof chrome.tabs, 'get' | 'reload'>;
};

export type UserscriptInjectionSummary = {
  eligible: number;
  attempted: number;
  succeeded: number;
  failed: number;
};

export type UserscriptReloadPlan = {
  tabId: number;
  expectedUrl: string;
};

export type UserscriptActivationResult = {
  injection: UserscriptInjectionSummary;
  refreshRequired: boolean;
  reloadRequested: boolean;
  reloadPlan?: UserscriptReloadPlan;
  executions: AiScriptExecution[];
};

export type UserscriptLibraryChanges = {
  changedIds: Set<string>;
  runtimeChangedIds: Set<string>;
  removedIds: Set<string>;
};

function storedFingerprint(script: InstalledUserscript) {
  return JSON.stringify({
    source: script.source,
    presentation: script.presentation,
    manager: script.manager,
  });
}

function runtimeFingerprint(script: InstalledUserscript) {
  return JSON.stringify({
    code: script.source.code,
    origin: script.source.origin,
    enabled: script.manager.enabled,
    userMatches: script.manager.userMatches,
    userIncludes: script.manager.userIncludes,
    userExcludeMatches: script.manager.userExcludeMatches,
    userExcludes: script.manager.userExcludes,
  });
}

export function userscriptLibraryChanges(
  previous: readonly InstalledUserscript[],
  next: readonly InstalledUserscript[],
): UserscriptLibraryChanges {
  const previousById = new Map(previous.map((script) => [script.id, script]));
  const changedIds = new Set<string>();
  const runtimeChangedIds = new Set<string>();
  const removedIds = new Set<string>();

  for (const script of next) {
    const before = previousById.get(script.id);
    if (!before || storedFingerprint(before) !== storedFingerprint(script)) {
      changedIds.add(script.id);
    }
    if (!before || runtimeFingerprint(before) !== runtimeFingerprint(script)) {
      runtimeChangedIds.add(script.id);
    }
    previousById.delete(script.id);
  }
  for (const scriptId of previousById.keys()) {
    changedIds.add(scriptId);
    runtimeChangedIds.add(scriptId);
    removedIds.add(scriptId);
  }
  return { changedIds, runtimeChangedIds, removedIds };
}

function runtimeActive(state: UserscriptRuntimeState | undefined) {
  return Boolean(
    state?.instanceId ||
      state?.status === 'running' ||
      state?.status === 'ready' ||
      state?.pendingRefresh,
  );
}

function matchesCurrentPage(
  script: InstalledUserscript | undefined,
  url: string,
) {
  if (!script?.manager.enabled) return false;
  return matchInstalledUserscript(script, {
    url,
    frameId: 0,
    topFrame: true,
    softNavigation: false,
  }).eligible;
}

function emptyActivationResult(): UserscriptActivationResult {
  return {
    injection: {
      eligible: 0,
      attempted: 0,
      succeeded: 0,
      failed: 0,
    },
    refreshRequired: false,
    reloadRequested: false,
    executions: [],
  };
}

async function mapConcurrent<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  operation: (value: Input, index: number) => Promise<Output>,
) {
  const results = new Array<Output>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= values.length) return;
        results[index] = await operation(values[index] as Input, index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export class UserscriptActivationCoordinator {
  private readonly reloadTimers = new Map<
    number,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly api: ActivationApi,
    private readonly runtime: ActivationRuntime | null,
    private readonly runner: CurrentDocumentRunner | null,
    private readonly resolveAttachment: (
      tabId: number,
    ) => Promise<AssistantPageAttachment>,
    private readonly readSettings: () => Promise<UserscriptSettings>,
    private readonly reportError: (
      event: string,
      error: unknown,
      details?: Readonly<Record<string, unknown>>,
    ) => void,
  ) {}

  async reconcile(
    previous: readonly InstalledUserscript[],
    next: readonly InstalledUserscript[],
    tabId: number | undefined,
  ): Promise<UserscriptActivationResult> {
    const changes = userscriptLibraryChanges(previous, next);
    if (changes.runtimeChangedIds.size === 0 || tabId === undefined) {
      return emptyActivationResult();
    }

    let tab: chrome.tabs.Tab;
    try {
      tab = await this.api.tabs.get(tabId);
    } catch (error) {
      this.reportError('tab-read-failed', error, { tabId });
      return emptyActivationResult();
    }
    const url = tab.url;
    if (!url || !/^(?:https?|file|ftp):/i.test(url)) {
      return emptyActivationResult();
    }

    let reloadAfterScriptChange = false;
    try {
      reloadAfterScriptChange = (await this.readSettings())
        .reloadAfterScriptChange;
    } catch (error) {
      this.reportError('settings-read-failed', error);
    }

    let attachment: AssistantPageAttachment | undefined;
    try {
      attachment = await this.resolveAttachment(tabId);
    } catch (error) {
      this.reportError('page-attachment-read-failed', error, { tabId });
    }

    const previousById = new Map(previous.map((script) => [script.id, script]));
    const nextById = new Map(next.map((script) => [script.id, script]));
    const changed = await Promise.all(
      [...changes.runtimeChangedIds].map(async (scriptId) => {
        const before = previousById.get(scriptId);
        const after = nextById.get(scriptId);
        const state = await this.readRuntimeState(
          tabId,
          scriptId,
          attachment?.target.documentId,
        );
        const active = runtimeActive(state);
        const matchedBefore = matchesCurrentPage(before, url);
        const matchedAfter = matchesCurrentPage(after, url);
        return {
          after,
          active,
          affectsCurrentPage: active || matchedBefore || matchedAfter,
          matchedAfter,
        };
      }),
    );
    const relevant = changed.filter((entry) => entry.affectsCurrentPage);
    if (relevant.length === 0) return emptyActivationResult();

    this.runtime?.invalidate(changes.runtimeChangedIds);
    const candidates = relevant.flatMap((entry) =>
      entry.after && entry.matchedAfter && !entry.active ? [entry.after] : [],
    );
    let executions: AiScriptExecution[] = [];
    if (candidates.length > 0 && this.runner) {
      try {
        const executionAttachment =
          attachment ?? (await this.resolveAttachment(tabId));
        executions = await mapConcurrent(
          candidates,
          EXECUTION_CONCURRENCY,
          async (script) => {
            const execution = await this.runner?.execute(
              executionAttachment,
              script.id,
            );
            if (!execution) {
              throw new Error('当前文档执行器不可用。');
            }
            if (execution.status === 'error') {
              this.reportError(
                'immediate-execution-failed',
                new Error(execution.error || '脚本即时执行失败。'),
                { tabId, scriptId: script.id },
              );
            }
            return execution;
          },
        );
      } catch (error) {
        this.reportError('immediate-execution-failed', error, {
          tabId,
          scriptIds: candidates.map((script) => script.id),
        });
      }
    }

    const attempted = executions.length;
    const succeeded = executions.filter(
      (execution) => execution.status === 'ready',
    ).length;
    const failed = attempted - succeeded;
    const refreshRequired = relevant.some((entry) => entry.active);
    const reloadRequested = reloadAfterScriptChange && refreshRequired;
    return {
      injection: {
        eligible: candidates.length,
        attempted,
        succeeded,
        failed,
      },
      refreshRequired,
      reloadRequested,
      ...(reloadRequested ? { reloadPlan: { tabId, expectedUrl: url } } : {}),
      executions,
    };
  }

  scheduleReload(plan: UserscriptReloadPlan) {
    const previous = this.reloadTimers.get(plan.tabId);
    if (previous) clearTimeout(previous);
    this.reloadTimers.set(
      plan.tabId,
      setTimeout(() => {
        this.reloadTimers.delete(plan.tabId);
        void this.api.tabs
          .get(plan.tabId)
          .then((tab) => {
            if (tab.url !== plan.expectedUrl) return;
            return this.api.tabs.reload(plan.tabId);
          })
          .catch((error) =>
            this.reportError('tab-reload-failed', error, {
              tabId: plan.tabId,
            }),
          );
      }, RELOAD_DELAY_MS),
    );
  }

  private async readRuntimeState(
    tabId: number,
    scriptId: string,
    documentId?: string,
  ) {
    try {
      return await this.runtime?.state(tabId, 0, scriptId, documentId);
    } catch (error) {
      this.reportError('runtime-state-read-failed', error, { tabId, scriptId });
      return undefined;
    }
  }
}
