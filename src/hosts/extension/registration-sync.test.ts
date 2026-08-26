import { describe, expect, it, vi } from 'vitest';

import type { UserscriptResourceLoader } from '../../userscript/application/resource-loader';
import type {
  ScriptRepository,
  ScriptRepositoryQuery,
} from '../../userscript/application/script-repository';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import type { ExtensionBackgroundApi, ExtensionUserscriptApi } from './api';
import { RegisteredUserscriptSynchronizer } from './registration-sync';

function harness() {
  const storage: Record<string, unknown> = {};
  const registrations = new Map<
    string,
    chrome.userScripts.RegisteredUserScript
  >();
  const register = vi.fn(
    async (items: chrome.userScripts.RegisteredUserScript[]) => {
      for (const item of items) registrations.set(item.id, item);
    },
  );
  const update = vi.fn(
    async (items: chrome.userScripts.RegisteredUserScript[]) => {
      for (const item of items) registrations.set(item.id, item);
    },
  );
  const unregister = vi.fn(async (filter?: { ids?: string[] }) => {
    for (const id of filter?.ids ?? [...registrations.keys()]) {
      registrations.delete(id);
    }
  });
  const api = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: storage[key] }),
        set: async (items: Record<string, unknown>) =>
          Object.assign(storage, items),
      },
    },
    userScripts: {
      configureWorld: vi.fn(async () => undefined),
      getScripts: async () => [...registrations.values()],
      register,
      update,
      unregister,
      resetWorldConfiguration: vi.fn(async () => undefined),
    },
  } as unknown as ExtensionUserscriptApi;
  return {
    api,
    register,
    registrations,
    unregister,
    update,
  };
}

describe('RegisteredUserscriptSynchronizer', () => {
  it('compiles page registrations without the native userScripts API', async () => {
    const storage: Record<string, unknown> = {};
    const api = {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: storage[key] }),
          set: async (items: Record<string, unknown>) =>
            Object.assign(storage, items),
        },
      },
    } as unknown as ExtensionBackgroundApi;
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    script.metadata.matches = ['https://example.com/*'];
    const synchronizer = new RegisteredUserscriptSynchronizer(api, {
      list: async () => [script],
      upsert: vi.fn(),
      remove: vi.fn(),
      reorder: vi.fn(),
      subscribe: () => () => undefined,
    } as unknown as ScriptRepository);

    await synchronizer.schedule();

    const registrations = await synchronizer.pageExecutionRegistrations(
      {
        url: 'https://example.com/page',
        frameId: 0,
        topFrame: true,
      },
      'document_idle',
    );
    expect(registrations).toHaveLength(2);
    expect(registrations.map((registration) => registration.world)).toEqual([
      'MAIN',
      'USER_SCRIPT',
    ]);
  });

  it('replaces obsolete duplicated-prefix registrations with canonical IDs', async () => {
    const test = harness();
    test.registrations.set('card-master-obsolete', {
      id: 'card-master-obsolete',
      js: [{ code: '' }],
      matches: ['<all_urls>'],
    });
    const synchronizer = new RegisteredUserscriptSynchronizer(test.api, {
      list: async () => structuredClone(INITIAL_USERSCRIPTS.slice(0, 1)),
      upsert: vi.fn(),
      remove: vi.fn(),
      reorder: vi.fn(),
      subscribe: () => () => undefined,
    } as unknown as ScriptRepository);

    await synchronizer.schedule();

    expect(test.registrations.has('card-master-obsolete')).toBe(false);
    expect([...test.registrations.keys()]).toHaveLength(2);
    expect(
      [...test.registrations.keys()].every((id) => id.startsWith('card-')),
    ).toBe(true);
    expect(test.unregister).toHaveBeenCalledWith({
      ids: ['card-master-obsolete'],
    });
  });

  it('registers, incrementally updates, and exactly removes one script', async () => {
    const test = harness();
    const synchronizer = new RegisteredUserscriptSynchronizer(test.api, {
      list: async () =>
        structuredClone(
          test.registrations.size > 0
            ? [
                {
                  ...INITIAL_USERSCRIPTS[0],
                  metadata: {
                    ...INITIAL_USERSCRIPTS[0].metadata,
                    version:
                      test.update.mock.calls.length > 0 ? '2.4.2' : '2.4.1',
                  },
                },
              ]
            : [INITIAL_USERSCRIPTS[0]],
        ),
      upsert: vi.fn(),
      remove: vi.fn(),
      reorder: vi.fn(),
      subscribe: () => () => undefined,
    } as unknown as ScriptRepository);

    await synchronizer.schedule();
    await synchronizer.schedule();

    expect(test.register).toHaveBeenCalledTimes(2);
    expect(test.update).toHaveBeenCalledTimes(2);
    expect(test.registrations.size).toBe(2);
  });

  it('unregisters only the disabled script and leaves other registrations intact', async () => {
    const test = harness();
    const repository = {
      list: async () => structuredClone(INITIAL_USERSCRIPTS.slice(0, 2)),
      get: async (scriptId: string) =>
        structuredClone(
          INITIAL_USERSCRIPTS.find((script) => script.id === scriptId) ?? null,
        ),
      query: async ({ offset, limit }: ScriptRepositoryQuery) => ({
        scripts: structuredClone(
          INITIAL_USERSCRIPTS.slice(0, 2).slice(offset, offset + limit),
        ),
        total: 2,
        offset,
        limit,
        hasMore: offset + limit < 2,
      }),
      upsert: vi.fn(),
      remove: vi.fn(),
      reorder: vi.fn(),
      subscribe: () => () => undefined,
    } as unknown as ScriptRepository;
    const synchronizer = new RegisteredUserscriptSynchronizer(
      test.api,
      repository,
    );
    await synchronizer.schedule();

    const secondId = [...test.registrations.values()].find((registration) =>
      registration.js?.[0]?.code?.includes(INITIAL_USERSCRIPTS[1].id),
    )?.id;
    if (!secondId) throw new Error('Expected the second script registration.');
    const secondRegistrationIds = [secondId, `${secondId}-unsafe-window`];

    const changingRepository = {
      ...repository,
      list: async () =>
        structuredClone([
          INITIAL_USERSCRIPTS[0],
          {
            ...INITIAL_USERSCRIPTS[1],
            manager: { ...INITIAL_USERSCRIPTS[1].manager, enabled: false },
          },
        ]),
    } as ScriptRepository;
    const nextSynchronizer = new RegisteredUserscriptSynchronizer(
      test.api,
      changingRepository,
    );
    await nextSynchronizer.schedule();

    expect(test.registrations.size).toBe(2);
    expect(test.unregister).toHaveBeenCalledWith({
      ids: secondRegistrationIds,
    });
  });

  it('registers ready scripts without waiting for an unrelated dependency load', async () => {
    const test = harness();
    let releaseFirst: (() => void) | undefined;
    const firstBundle = new Promise<{
      requires: [];
      resources: Record<string, never>;
    }>((resolve) => {
      releaseFirst = () => resolve({ requires: [], resources: {} });
    });
    const resourceLoader = {
      load: vi.fn((script: { id: string }) =>
        script.id === INITIAL_USERSCRIPTS[0].id
          ? firstBundle
          : Promise.resolve({ requires: [], resources: {} }),
      ),
    } as unknown as UserscriptResourceLoader;
    const synchronizer = new RegisteredUserscriptSynchronizer(
      test.api,
      {
        list: async () => structuredClone(INITIAL_USERSCRIPTS.slice(0, 2)),
        get: async (scriptId) =>
          structuredClone(
            INITIAL_USERSCRIPTS.find((script) => script.id === scriptId) ??
              null,
          ),
        query: async ({ offset, limit }) => ({
          scripts: structuredClone(
            INITIAL_USERSCRIPTS.slice(0, 2).slice(offset, offset + limit),
          ),
          total: 2,
          offset,
          limit,
          hasMore: offset + limit < 2,
        }),
        upsert: vi.fn(),
        remove: vi.fn(),
        reorder: vi.fn(),
        replaceAll: vi.fn(),
        subscribe: () => () => undefined,
      },
      resourceLoader,
    );

    const pending = synchronizer.schedule();
    let registrationSettled = false;
    void pending.finally(() => {
      registrationSettled = true;
    });
    await synchronizer.ensureRuntimeReady();
    expect(registrationSettled).toBe(false);
    expect(synchronizer.getScript(INITIAL_USERSCRIPTS[0].id)?.id).toBe(
      INITIAL_USERSCRIPTS[0].id,
    );
    await vi.waitFor(() => expect(test.register).toHaveBeenCalledTimes(2));
    expect(
      test.register.mock.calls.some(([registrations]) =>
        registrations[0]?.js?.[0]?.code?.includes(INITIAL_USERSCRIPTS[1].id),
      ),
    ).toBe(true);

    releaseFirst?.();
    await pending;
    expect(test.register).toHaveBeenCalledTimes(4);
  });
});
