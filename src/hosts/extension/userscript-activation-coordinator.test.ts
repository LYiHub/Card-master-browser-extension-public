import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_USERSCRIPT_SETTINGS } from '../../userscript/application/settings';
import type { UserscriptRuntimeState } from '../../userscript/domain/types';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import {
  UserscriptActivationCoordinator,
  userscriptLibraryChanges,
} from './userscript-activation-coordinator';

const pageUrl = 'http://127.0.0.1/example';

function harness(reloadAfterScriptChange = false) {
  const reload = vi.fn(async () => undefined);
  const execute = vi.fn(async () => ({
    status: 'ready' as const,
    url: pageUrl,
    completedAt: Date.now(),
  }));
  const state = vi.fn(
    async (): Promise<UserscriptRuntimeState | undefined> => undefined,
  );
  const invalidate = vi.fn();
  const coordinator = new UserscriptActivationCoordinator(
    {
      tabs: {
        get: vi.fn(
          async (tabId: number) =>
            ({
              id: tabId,
              url: pageUrl,
            }) as chrome.tabs.Tab,
        ),
        reload,
      },
    },
    { state, invalidate },
    { execute },
    vi.fn(async (tabId: number) => ({
      context: {
        url: pageUrl,
        title: 'Example',
        language: 'zh-CN',
        selectedText: '',
        visibleText: '',
      },
      target: { tabId, frameId: 0, documentId: 'document-1' },
    })),
    vi.fn(async () => ({
      ...DEFAULT_USERSCRIPT_SETTINGS,
      reloadAfterScriptChange,
    })),
    vi.fn(),
  );
  return { coordinator, execute, invalidate, reload, state };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('userscript activation coordinator', () => {
  it('separates presentation changes from runtime changes', () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    const presented = {
      ...script,
      presentation: {
        accent: '#d6ad58',
        media: { kind: 'video' as const, video: '/card.webm' },
      },
    };
    const changes = userscriptLibraryChanges([script], [presented]);

    expect(changes.changedIds).toEqual(new Set([script.id]));
    expect(changes.runtimeChangedIds).toEqual(new Set());
  });

  it('executes a newly enabled non-start script in the current document', async () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    script.manager.enabled = false;
    const enabled = {
      ...script,
      manager: { ...script.manager, enabled: true },
    };
    const { coordinator, execute, reload } = harness();

    const result = await coordinator.reconcile([script], [enabled], 7);

    expect(result).toMatchObject({
      injection: {
        eligible: 1,
        attempted: 1,
        succeeded: 1,
        failed: 0,
      },
      refreshRequired: false,
      reloadRequested: false,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('returns and schedules one reload plan when stopping a running script', async () => {
    vi.useFakeTimers();
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    const disabled = {
      ...script,
      manager: { ...script.manager, enabled: false },
    };
    const { coordinator, reload, state } = harness(true);
    state.mockResolvedValue({
      tabId: 7,
      frameId: 0,
      instanceId: 'instance-1',
      status: 'ready',
      commands: [],
      pendingRefresh: false,
    });

    const result = await coordinator.reconcile([script], [disabled], 7);
    expect(result).toMatchObject({
      injection: {
        eligible: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
      },
      refreshRequired: true,
      reloadRequested: true,
      reloadPlan: {
        tabId: 7,
        expectedUrl: pageUrl,
      },
    });
    if (!result.reloadPlan) throw new Error('刷新计划不存在。');
    coordinator.scheduleReload(result.reloadPlan);
    await vi.runAllTimersAsync();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('immediately injects a document-start script when no old instance exists', async () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    script.manager.enabled = false;
    script.metadata.runAt = 'document-start';
    const enabled = {
      ...script,
      manager: { ...script.manager, enabled: true },
    };
    const { coordinator, execute, reload } = harness();

    const result = await coordinator.reconcile([script], [enabled], 7);

    expect(result).toMatchObject({
      injection: {
        eligible: 1,
        attempted: 1,
        succeeded: 1,
        failed: 0,
      },
      refreshRequired: false,
      reloadRequested: false,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps a stopped runtime until a manual refresh when reload is disabled', async () => {
    vi.useFakeTimers();
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    const disabled = {
      ...script,
      manager: { ...script.manager, enabled: false },
    };
    const { coordinator, execute, reload, state } = harness();
    state.mockResolvedValue({
      tabId: 7,
      frameId: 0,
      instanceId: 'instance-1',
      status: 'ready',
      commands: [],
      pendingRefresh: false,
    });

    const result = await coordinator.reconcile([script], [disabled], 7);
    await vi.runAllTimersAsync();

    expect(result).toMatchObject({
      injection: {
        eligible: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
      },
      refreshRequired: true,
      reloadRequested: false,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('requires a clean document before replacing an existing runtime', async () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    const updated = {
      ...script,
      source: {
        ...script.source,
        code: `${script.source.code}\nconsole.log('updated');`,
      },
    };
    const { coordinator, execute, invalidate, state } = harness();
    state.mockResolvedValue({
      tabId: 7,
      frameId: 0,
      instanceId: 'instance-1',
      status: 'ready',
      commands: [],
      pendingRefresh: false,
    });

    const result = await coordinator.reconcile([script], [updated], 7);

    expect(result).toMatchObject({
      injection: {
        eligible: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
      },
      refreshRequired: true,
      reloadRequested: false,
    });
    expect(invalidate).toHaveBeenCalledWith(new Set([script.id]));
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not inject over a runtime that is already waiting for refresh', async () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    const updated = {
      ...script,
      source: {
        ...script.source,
        code: `${script.source.code}\nconsole.log('updated');`,
      },
    };
    const { coordinator, execute, state } = harness();
    state.mockResolvedValue({
      tabId: 7,
      frameId: 0,
      instanceId: null,
      status: 'idle',
      commands: [],
      pendingRefresh: true,
    });

    const result = await coordinator.reconcile([script], [updated], 7);

    expect(result).toMatchObject({
      injection: {
        eligible: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
      },
      refreshRequired: true,
      reloadRequested: false,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not treat source timestamps as a runtime change', () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    const timestamped = {
      ...script,
      source: {
        ...script.source,
        updatedAt: script.source.updatedAt + 1,
      },
    };

    const changes = userscriptLibraryChanges([script], [timestamped]);

    expect(changes.changedIds).toEqual(new Set([script.id]));
    expect(changes.runtimeChangedIds).toEqual(new Set());
  });
});
