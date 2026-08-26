import { describe, expect, it, vi } from 'vitest';

import {
  CONTENT_BLOCKER_STORAGE_KEY,
  CONTENT_BLOCKER_USER_RULES_STORAGE_KEY,
  type ContentBlockingEngineReport,
  type ContentBlockingState,
  defaultContentBlockingState,
} from '../domain/types';
import { ContentBlockingRepository } from './repository';
import { type ContentBlockingEngine, ContentBlockingService } from './service';
import type {
  ContentBlockingSubscriptionFetcher,
  SubscriptionDownload,
} from './subscriptions';

const healthyReport: ContentBlockingEngineReport = {
  revision: 1,
  loadedRuleCount: 1,
  errors: [],
  limitations: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function storage(initial: ContentBlockingState) {
  const contents = new Map(
    initial.subscriptions.map((subscription) => [
      `test-${subscription.id}`,
      subscription.content,
    ]),
  );
  const values: Record<string, unknown> = {
    [CONTENT_BLOCKER_STORAGE_KEY]: {
      ...structuredClone(initial),
      subscriptions: initial.subscriptions.map(
        ({ content: _content, ...subscription }) => ({
          ...subscription,
          contentKey: `test-${subscription.id}`,
        }),
      ),
    },
    [CONTENT_BLOCKER_USER_RULES_STORAGE_KEY]: initial.userRules,
  };
  const area = {
    async get(key: string) {
      return { [key]: structuredClone(values[key]) };
    },
    async set(items: Record<string, unknown>) {
      Object.assign(values, structuredClone(items));
    },
    async remove(key: string) {
      delete values[key];
    },
  };
  const contentStorage = {
    async read(contentKey: string) {
      return contents.get(contentKey);
    },
    async write(contentKey: string, content: string) {
      contents.set(contentKey, content);
    },
    async remove(contentKey: string) {
      contents.delete(contentKey);
    },
  };
  return {
    repository: new ContentBlockingRepository(area, contentStorage),
    read: () => {
      const persisted = structuredClone(
        values[CONTENT_BLOCKER_STORAGE_KEY],
      ) as Omit<ContentBlockingState, 'subscriptions'> & {
        subscriptions: Array<
          Omit<ContentBlockingState['subscriptions'][number], 'content'> & {
            contentKey: string;
          }
        >;
      };
      return {
        ...persisted,
        subscriptions: persisted.subscriptions.map(
          ({ contentKey, ...subscription }) => ({
            ...subscription,
            content: contents.get(contentKey) ?? '',
          }),
        ),
      } satisfies ContentBlockingState;
    },
  };
}

function engine(
  configure: (
    state: ContentBlockingState,
  ) => Promise<ContentBlockingEngineReport> = async () => healthyReport,
  setRulesEnabled: (
    rulesEnabled: boolean,
  ) => Promise<ContentBlockingEngineReport> = async () => healthyReport,
) {
  return {
    start: vi.fn(async () => healthyReport),
    configure: vi.fn(configure),
    setRulesEnabled: vi.fn(setRulesEnabled),
    handlesMessage: vi.fn(() => false),
    handleMessage: vi.fn(async () => undefined),
  } satisfies ContentBlockingEngine;
}

function elementSession(sessionId: string, startedAt: number) {
  return { sessionId, startedAt };
}

describe('ContentBlockingService', () => {
  it('waits for engine startup before accepting a mutating command', async () => {
    const persisted = storage(defaultContentBlockingState());
    const startup = deferred<ContentBlockingEngineReport>();
    const blocker = engine();
    blocker.start.mockImplementation(async () => startup.promise);
    const service = new ContentBlockingService(persisted.repository, blocker);

    const starting = service.start();
    await vi.waitFor(() => expect(blocker.start).toHaveBeenCalledTimes(1));
    const addition = service.addUserRules(
      ['example.com##.ad'],
      elementSession('session-1', 1),
    );

    startup.resolve(healthyReport);
    await starting;
    await expect(addition).resolves.toMatchObject({ userRuleCount: 1 });
    expect(blocker.configure).toHaveBeenCalledTimes(1);
  });

  it('persists a full user-rule replacement before the engine finishes updating', async () => {
    const persisted = storage(defaultContentBlockingState());
    const deployment = deferred<ContentBlockingEngineReport>();
    const onConfigurationApplied = vi.fn();
    const onUserRulesChanged = vi.fn();
    const blocker = engine(async () => deployment.promise);
    const service = new ContentBlockingService(persisted.repository, blocker, {
      onConfigurationApplied,
      onUserRulesChanged,
    });
    await service.start();

    const settings = await service.replaceUserRules('example.com##.ad');

    expect(settings.userRules).toBe('example.com##.ad');
    expect(settings.snapshot.configurationPending).toBe(true);
    expect(persisted.read().userRules).toBe('example.com##.ad');
    expect(onConfigurationApplied).not.toHaveBeenCalled();
    expect(onUserRulesChanged).toHaveBeenCalledTimes(1);

    deployment.resolve({ ...healthyReport, revision: 2 });
    await service.waitForPendingConfiguration();

    expect(service.snapshot()).toMatchObject({
      revision: 2,
      configurationPending: false,
      status: 'ready',
    });
    expect(onConfigurationApplied).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid full user-rule replacements behind the active deployment', async () => {
    const persisted = storage(defaultContentBlockingState());
    const firstDeployment = deferred<ContentBlockingEngineReport>();
    const firstStarted = deferred<void>();
    let configureCount = 0;
    const blocker = engine(async () => {
      configureCount += 1;
      if (configureCount === 1) {
        firstStarted.resolve(undefined);
        return firstDeployment.promise;
      }
      return { ...healthyReport, revision: configureCount + 1 };
    });
    const service = new ContentBlockingService(persisted.repository, blocker);
    await service.start();

    await service.replaceUserRules('example.com##.one');
    await firstStarted.promise;
    await service.replaceUserRules('example.com##.two');
    await service.replaceUserRules('example.com##.three');
    firstDeployment.resolve({ ...healthyReport, revision: 2 });
    await service.waitForPendingConfiguration();

    expect(blocker.configure).toHaveBeenCalledTimes(2);
    expect(
      blocker.configure.mock.calls.map(([state]) => state.userRules),
    ).toEqual(['example.com##.one', 'example.com##.three']);
    expect(persisted.read().userRules).toBe('example.com##.three');
  });

  it('does not let a subscription download block a user-rule save', async () => {
    const initial = defaultContentBlockingState();
    initial.subscriptions = [
      {
        id: 'slow',
        filterId: 10_000,
        name: 'Slow',
        url: 'https://slow.example/filter.txt',
        enabled: true,
        content: '||ads.example^',
        ruleCount: 1,
        rejectedRuleCount: 0,
      },
    ];
    const persisted = storage(initial);
    const downloadStarted = deferred<void>();
    const download = deferred<SubscriptionDownload>();
    const service = new ContentBlockingService(persisted.repository, engine(), {
      subscriptionFetcher: {
        download: vi.fn(async () => {
          downloadStarted.resolve(undefined);
          return download.promise;
        }),
      } as unknown as ContentBlockingSubscriptionFetcher,
    });
    await service.start();

    const refresh = service.refreshSubscriptions();
    await downloadStarted.promise;
    const settings = await service.replaceUserRules('example.com##.ad');

    expect(settings.userRules).toBe('example.com##.ad');
    download.resolve({ status: 'not-modified', checkedAt: 42 });
    await refresh;
    await service.waitForPendingConfiguration();
    expect((await service.readSettings()).userRules).toBe('example.com##.ad');
  });

  it('applies a validated user-rule batch once and keeps duplicates idempotent', async () => {
    const persisted = storage(defaultContentBlockingState());
    const blocker = engine();
    const service = new ContentBlockingService(persisted.repository, blocker);
    await service.start();

    await service.addUserRules(
      [' example.com##.ad ', 'example.com##.sponsor'],
      elementSession('session-1', 1),
    );
    await service.addUserRules(
      ['example.com##.ad'],
      elementSession('session-1', 1),
    );

    expect(persisted.read().userRules).toBe(
      'example.com##.ad\nexample.com##.sponsor',
    );
    expect(service.snapshot().userRuleCount).toBe(2);
    await expect(
      service.addUserRules(['one\ntwo'], elementSession('session-1', 1)),
    ).rejects.toThrow('单条非空规则');
    expect(blocker.configure).toHaveBeenCalledTimes(1);
  });

  it('restores every rule created by the latest element-blocking session', async () => {
    const persisted = storage(defaultContentBlockingState());
    const service = new ContentBlockingService(persisted.repository, engine());
    await service.start();

    await service.addUserRules(
      ['example.com##.ad'],
      elementSession('session-1', 1),
    );
    await service.addUserRules(
      ['example.com##.sponsor'],
      elementSession('session-1', 1),
    );

    expect(service.snapshot().lastElementBlockingBatch).toEqual({
      sessionId: 'session-1',
      startedAt: 1,
      hostname: 'example.com',
      rules: ['example.com##.ad', 'example.com##.sponsor'],
    });
    await expect(service.undoLastElementBlockingBatch()).resolves.toMatchObject(
      {
        userRuleCount: 0,
        lastElementBlockingBatch: null,
      },
    );
    expect(persisted.read().userRules).toBe('');
  });

  it('restores only the most recent successful element-blocking session', async () => {
    const persisted = storage(defaultContentBlockingState());
    const service = new ContentBlockingService(persisted.repository, engine());
    await service.start();

    await service.addUserRules(
      ['example.com##.ad', 'example.com##.sponsor'],
      elementSession('session-1', 1),
    );
    await service.addUserRules(
      ['example.com##.modal'],
      elementSession('session-2', 2),
    );
    await service.undoLastElementBlockingBatch();

    expect(persisted.read().userRules).toBe(
      'example.com##.ad\nexample.com##.sponsor',
    );
    expect(service.snapshot().lastElementBlockingBatch).toBeNull();
  });

  it('does not let an older session overwrite a newer restore batch', async () => {
    const persisted = storage(defaultContentBlockingState());
    const service = new ContentBlockingService(persisted.repository, engine());
    await service.start();

    await service.addUserRules(
      ['example.com##.newer'],
      elementSession('session-2', 2),
    );
    await service.addUserRules(
      ['example.com##.older'],
      elementSession('session-1', 1),
    );

    expect(service.snapshot().lastElementBlockingBatch).toMatchObject({
      sessionId: 'session-2',
      startedAt: 2,
      rules: ['example.com##.newer'],
    });
    await service.undoLastElementBlockingBatch();
    expect(persisted.read().userRules).toBe('example.com##.older');
  });

  it('restores the latest session after the background service restarts', async () => {
    const persisted = storage(defaultContentBlockingState());
    const first = new ContentBlockingService(persisted.repository, engine());
    await first.start();
    await first.addUserRules(
      ['example.com##.ad'],
      elementSession('session-1', 1),
    );

    const restarted = new ContentBlockingService(
      persisted.repository,
      engine(),
    );
    await restarted.start();

    expect(restarted.snapshot().lastElementBlockingBatch).toMatchObject({
      sessionId: 'session-1',
      startedAt: 1,
      rules: ['example.com##.ad'],
    });
    await restarted.undoLastElementBlockingBatch();
    expect(persisted.read().userRules).toBe('');
  });

  it('switches filtering for the current root domain without changing the global gate', async () => {
    const persisted = storage(defaultContentBlockingState());
    const service = new ContentBlockingService(persisted.repository, engine());
    await service.start();

    const disabled = await service.setCurrentSiteFiltering(
      'https://docs.example.com/page',
      false,
    );
    const enabled = await service.setCurrentSiteFiltering(
      'https://docs.example.com/page',
      true,
    );

    expect(disabled.allowlist).toEqual(['example.com']);
    expect(disabled.rulesEnabled).toBe(true);
    expect(enabled.allowlist).toEqual([]);
  });

  it('toggles the rule gate without recompiling and rolls back failures', async () => {
    const persisted = storage(defaultContentBlockingState());
    const blocker = engine(
      async () => healthyReport,
      async (rulesEnabled) =>
        rulesEnabled
          ? healthyReport
          : {
              revision: 2,
              loadedRuleCount: 1,
              errors: ['rule gate rejected'],
              limitations: [],
            },
    );
    const service = new ContentBlockingService(persisted.repository, blocker);
    await service.start();

    await expect(service.setRulesEnabled(false)).rejects.toThrow(
      'rule gate rejected',
    );

    expect(blocker.configure).not.toHaveBeenCalled();
    expect(blocker.setRulesEnabled).toHaveBeenNthCalledWith(1, false);
    expect(blocker.setRulesEnabled).toHaveBeenNthCalledWith(2, true);
    expect(service.snapshot()).toMatchObject({
      rulesEnabled: true,
      status: 'ready',
    });
    expect(persisted.read().rulesEnabled).toBe(true);
  });

  it('persists a paused rule state while retaining the loaded engine count', async () => {
    const persisted = storage(defaultContentBlockingState());
    const blocker = engine();
    const service = new ContentBlockingService(persisted.repository, blocker);
    await service.start();

    await expect(service.setRulesEnabled(false)).resolves.toMatchObject({
      rulesEnabled: false,
      loadedRuleCount: 1,
      activeRuleCount: 0,
    });

    expect(blocker.configure).not.toHaveBeenCalled();
    expect(persisted.read().rulesEnabled).toBe(false);
  });

  it('restores the complete default configuration through the resident engine', async () => {
    const initial = defaultContentBlockingState();
    initial.rulesEnabled = false;
    initial.autoUpdateSubscriptions = false;
    initial.enabledStaticFilterIds = [];
    initial.userRules = 'example.com##.ad';
    initial.allowlist = ['example.com'];
    initial.subscriptions = [
      {
        id: 'custom',
        filterId: 10_000,
        name: 'Custom',
        url: 'https://filters.example/list.txt',
        enabled: true,
        content: '||ads.example^',
        ruleCount: 1,
        rejectedRuleCount: 0,
      },
    ];
    const persisted = storage(initial);
    const blocker = engine();
    const service = new ContentBlockingService(persisted.repository, blocker);
    await service.start();

    const settings = await service.reset();

    expect(settings).toMatchObject({
      rulesEnabled: true,
      autoUpdateSubscriptions: true,
      userRules: '',
      allowlist: [],
      subscriptions: [],
    });
    expect(persisted.read()).toEqual(defaultContentBlockingState());
    expect(blocker.configure).toHaveBeenCalledWith(
      defaultContentBlockingState(),
    );
  });

  it('uses the fast rule gate when the settings panel changes only activation', async () => {
    const persisted = storage(defaultContentBlockingState());
    const blocker = engine();
    const service = new ContentBlockingService(persisted.repository, blocker);
    await service.start();

    await service.saveGeneralSettings({
      rulesEnabled: false,
      allowlist: [],
    });

    expect(blocker.setRulesEnabled).toHaveBeenCalledWith(false);
    expect(blocker.configure).not.toHaveBeenCalled();
  });

  it('applies built-in filter selection through the resident engine', async () => {
    const persisted = storage(defaultContentBlockingState());
    const blocker = engine();
    const service = new ContentBlockingService(persisted.repository, blocker);
    await service.start();

    const settings = await service.setBuiltInFilterEnabled(4, true);

    expect(settings.builtInFilters).toContainEqual(
      expect.objectContaining({ filterId: 4, enabled: true }),
    );
    expect(persisted.read().enabledStaticFilterIds).toContain(4);
    expect(blocker.configure).toHaveBeenCalledTimes(1);
  });

  it('persists subscription auto-update without rebuilding the engine', async () => {
    const persisted = storage(defaultContentBlockingState());
    const blocker = engine();
    const service = new ContentBlockingService(persisted.repository, blocker);
    await service.start();

    const settings = await service.setSubscriptionAutoUpdate(false);

    expect(settings.autoUpdateSubscriptions).toBe(false);
    expect(persisted.read().autoUpdateSubscriptions).toBe(false);
    expect(blocker.configure).not.toHaveBeenCalled();
    expect(blocker.setRulesEnabled).not.toHaveBeenCalled();
  });

  it('imports URL-only custom lists in one engine transaction', async () => {
    const persisted = storage(defaultContentBlockingState());
    const blocker = engine();
    const download = vi.fn(async (subscription: { url: string }) => ({
      status: 'updated' as const,
      checkedAt: 42,
      source: {
        content: `! Title: ${new URL(subscription.url).hostname}\n||ads.example^`,
        ruleCount: 1,
        rejectedRuleCount: 0,
      },
    }));
    const service = new ContentBlockingService(persisted.repository, blocker, {
      subscriptionFetcher: {
        download,
      } as unknown as ContentBlockingSubscriptionFetcher,
    });
    await service.start();

    const settings = await service.addSubscriptions([
      'https://one.example/filter.txt',
      'https://two.example/filter.txt',
    ]);

    expect(settings.subscriptions).toEqual([
      expect.objectContaining({ name: 'one.example', filterId: 10_000 }),
      expect.objectContaining({ name: 'two.example', filterId: 10_001 }),
    ]);
    expect(download).toHaveBeenCalledTimes(2);
    expect(blocker.configure).toHaveBeenCalledTimes(1);
  });

  it('retains failed subscription imports as disabled retryable rows', async () => {
    const persisted = storage(defaultContentBlockingState());
    const download = vi.fn(async (subscription: { url: string }) => {
      if (subscription.url.includes('failed')) {
        throw new Error('network unavailable');
      }
      return {
        status: 'updated' as const,
        checkedAt: 42,
        source: {
          content: '||ads.example^',
          ruleCount: 1,
          rejectedRuleCount: 0,
        },
      };
    });
    const service = new ContentBlockingService(persisted.repository, engine(), {
      subscriptionFetcher: {
        download,
      } as unknown as ContentBlockingSubscriptionFetcher,
    });
    await service.start();

    const settings = await service.addSubscriptions([
      'https://working.example/filter.txt',
      'https://failed.example/filter.txt',
    ]);

    expect(settings.subscriptions).toEqual([
      expect.objectContaining({
        url: 'https://working.example/filter.txt',
        enabled: true,
        ruleCount: 1,
      }),
      expect.objectContaining({
        url: 'https://failed.example/filter.txt',
        enabled: false,
        error: 'network unavailable',
        lastCheckedAt: expect.any(Number),
      }),
    ]);
  });

  it('refreshes every subscription and persists individual failures', async () => {
    const initial = defaultContentBlockingState();
    initial.subscriptions = [
      {
        id: 'failed',
        filterId: 10_000,
        name: 'Failed',
        url: 'https://failed.example/filter.txt',
        enabled: true,
        content: 'old.example##.ad',
        ruleCount: 1,
        rejectedRuleCount: 0,
      },
      {
        id: 'updated',
        filterId: 10_001,
        name: 'Updated',
        url: 'https://updated.example/filter.txt',
        enabled: true,
        content: '',
        ruleCount: 0,
        rejectedRuleCount: 0,
      },
    ];
    const persisted = storage(initial);
    const download = vi.fn(
      async (subscription: { url: string }): Promise<SubscriptionDownload> => {
        if (subscription.url.includes('failed')) {
          throw new Error('network unavailable');
        }
        return {
          status: 'updated',
          checkedAt: 42,
          source: {
            content: 'updated.example##.ad',
            ruleCount: 1,
            rejectedRuleCount: 0,
          },
        };
      },
    );
    const blocker = engine();
    const service = new ContentBlockingService(persisted.repository, blocker, {
      subscriptionFetcher: {
        download,
      } as unknown as ContentBlockingSubscriptionFetcher,
    });
    await service.start();

    const settings = await service.refreshSubscriptions();

    expect(download).toHaveBeenCalledTimes(2);
    expect(blocker.configure).toHaveBeenCalledTimes(1);
    expect(settings.subscriptions).toEqual([
      expect.objectContaining({
        id: 'failed',
        error: 'network unavailable',
      }),
      expect.objectContaining({
        id: 'updated',
        ruleCount: 1,
        lastUpdatedAt: 42,
      }),
    ]);
  });

  it('reports the original engine startup failure before publishing its snapshot', async () => {
    const persisted = storage(defaultContentBlockingState());
    const blocker = engine();
    const startError = new Error('window is not defined');
    const reportError = vi.fn();
    blocker.start.mockRejectedValue(startError);
    const service = new ContentBlockingService(persisted.repository, blocker, {
      reportError,
    });

    await service.start();

    expect(reportError).toHaveBeenCalledWith('start-failed', startError);
    expect(service.snapshot()).toMatchObject({
      status: 'error',
      errors: ['window is not defined'],
    });
  });

  it('preserves nested engine startup causes in the published snapshot', async () => {
    const persisted = storage(defaultContentBlockingState());
    const blocker = engine();
    blocker.start.mockRejectedValue(
      new Error('Cannot be started:', {
        cause: new Error(
          'Invalid enumeration value "extraHeaders" for webRequest.',
        ),
      }),
    );
    const service = new ContentBlockingService(persisted.repository, blocker);

    await service.start();

    expect(service.snapshot()).toMatchObject({
      status: 'error',
      errors: [
        'Cannot be started: Invalid enumeration value "extraHeaders" for webRequest.',
      ],
    });
  });

  it('round-trips the strict first-public configuration format', async () => {
    const persisted = storage(defaultContentBlockingState());
    const service = new ContentBlockingService(persisted.repository, engine());
    await service.start();
    await service.addUserRules(
      ['example.com##.ad'],
      elementSession('session-1', 1),
    );
    await service.setCurrentSiteFiltering('https://example.com/', false);

    const exported = await service.exportConfiguration();
    await service.replaceUserRules('');
    await service.setCurrentSiteFiltering('https://example.com/', true);
    const imported = await service.importConfiguration(exported);

    expect(imported.userRules).toBe('example.com##.ad');
    expect(imported.allowlist).toEqual(['example.com']);
    await expect(
      service.importConfiguration(
        JSON.stringify({
          ...JSON.parse(exported),
          unsupported: true,
        }),
      ),
    ).rejects.toThrow('格式或版本不受支持');
  });

  it('does not repeat a failed engine deployment for every snapshot read', async () => {
    const persisted = storage(defaultContentBlockingState());
    const blocker = engine();
    blocker.start
      .mockRejectedValueOnce(new Error('worker unavailable'))
      .mockResolvedValueOnce({
        revision: 2,
        loadedRuleCount: 12,
        errors: [],
        limitations: [],
      });
    const service = new ContentBlockingService(persisted.repository, blocker);

    await service.start();
    await service.start();

    expect(blocker.start).toHaveBeenCalledTimes(1);
    expect(service.snapshot()).toMatchObject({
      status: 'error',
      loadedRuleCount: 0,
      errors: ['worker unavailable'],
    });
  });
});
