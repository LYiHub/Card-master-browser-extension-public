import { describe, expect, it, vi } from 'vitest';

import {
  CONTENT_BLOCKER_DEFAULT_STATIC_FILTER_IDS,
  CONTENT_BLOCKER_ELEMENT_BATCH_STORAGE_KEY,
  CONTENT_BLOCKER_STORAGE_KEY,
  CONTENT_BLOCKER_USER_RULES_STORAGE_KEY,
  defaultContentBlockingState,
} from '../domain/types';
import { ContentBlockingRepository } from './repository';

function harness(initial: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = structuredClone(initial);
  const contents = new Map<string, string>();
  const area = {
    get: vi.fn(async (key: string) => ({ [key]: values[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, structuredClone(items));
    }),
    remove: vi.fn(async (key: string) => {
      delete values[key];
    }),
  };
  const contentStorage = {
    read: vi.fn(async (contentKey: string) => contents.get(contentKey)),
    write: vi.fn(async (contentKey: string, content: string) => {
      contents.set(contentKey, content);
    }),
    remove: vi.fn(async (contentKey: string) => {
      contents.delete(contentKey);
    }),
  };
  return {
    values,
    contents,
    area,
    contentStorage,
    repository: new ContentBlockingRepository(area, contentStorage),
  };
}

function subscription() {
  return {
    id: 'example',
    filterId: 10_000,
    name: 'Example',
    url: 'https://example.com/filter.txt',
    enabled: true,
    content: '||ads.example^',
    ruleCount: 1,
    rejectedRuleCount: 0,
  };
}

function persistedSubscription(
  value: ReturnType<typeof subscription>,
  contentKey: string,
) {
  const { content: _content, ...persisted } = value;
  return { ...persisted, contentKey };
}

describe('ContentBlockingRepository', () => {
  it('reads editor rules without hydrating subscription bodies', async () => {
    const test = harness({
      [CONTENT_BLOCKER_STORAGE_KEY]: {
        version: 1,
        rulesEnabled: true,
        autoUpdateSubscriptions: true,
        enabledStaticFilterIds: CONTENT_BLOCKER_DEFAULT_STATIC_FILTER_IDS,
        userRules: 'example.com##.ad',
        allowlist: [],
        subscriptions: [
          {
            id: 'example',
            filterId: 10_000,
            name: 'Example',
            url: 'https://example.com/filter.txt',
            enabled: true,
            contentKey: 'sha256-example',
            ruleCount: 1,
            rejectedRuleCount: 0,
          },
        ],
      },
    });

    await expect(test.repository.readUserRules()).resolves.toBe(
      'example.com##.ad',
    );
    expect(test.contentStorage.read).not.toHaveBeenCalled();
  });

  it('keeps a dedicated lightweight copy of user rules', async () => {
    const test = harness();
    const state = defaultContentBlockingState();
    state.userRules = 'example.com##.sponsor';

    await test.repository.write(state);

    expect(test.values[CONTENT_BLOCKER_USER_RULES_STORAGE_KEY]).toBe(
      'example.com##.sponsor',
    );
  });

  it('persists the latest element-blocking session separately', async () => {
    const test = harness();
    const state = defaultContentBlockingState();
    const batch = {
      sessionId: 'session-1',
      startedAt: 1,
      hostname: 'example.com',
      rules: ['example.com##.ad', 'example.com##.sponsor'],
    };

    await test.repository.write(state, batch);

    expect(test.values[CONTENT_BLOCKER_ELEMENT_BATCH_STORAGE_KEY]).toEqual(
      batch,
    );
    await expect(
      new ContentBlockingRepository(
        test.area,
        test.contentStorage,
      ).readElementBlockingBatch(),
    ).resolves.toEqual(batch);
  });

  it('creates an enabled empty first-install state', async () => {
    const test = harness();

    await expect(test.repository.read()).resolves.toEqual({
      version: 1,
      rulesEnabled: true,
      autoUpdateSubscriptions: true,
      enabledStaticFilterIds: CONTENT_BLOCKER_DEFAULT_STATIC_FILTER_IDS,
      userRules: '',
      allowlist: [],
      subscriptions: [],
    });
  });

  it('rejects unknown persisted shapes instead of guessing their schema', async () => {
    const test = harness({
      [CONTENT_BLOCKER_STORAGE_KEY]: { version: 0, rules: [] },
    });

    await expect(test.repository.read()).rejects.toThrow('invalid schema');
  });

  it('rejects non-v1 embedded states instead of guessing their schema', async () => {
    const test = harness({
      [CONTENT_BLOCKER_STORAGE_KEY]: {
        ...defaultContentBlockingState(),
        version: 2,
        subscriptions: [subscription()],
      },
    });

    await expect(test.repository.read()).rejects.toThrow('invalid schema');
  });

  it('keeps large subscription bodies outside extension storage across restarts', async () => {
    const test = harness();
    const content = '||ads.example^\n'.repeat(50_000);
    const state = defaultContentBlockingState();
    state.subscriptions = [{ ...subscription(), content, ruleCount: 50_000 }];

    await test.repository.write(state);

    const serialized = JSON.stringify(test.values[CONTENT_BLOCKER_STORAGE_KEY]);
    expect(serialized.length).toBeLessThan(2_000);
    expect(serialized).not.toContain(content.slice(0, 100));
    await expect(
      new ContentBlockingRepository(test.area, test.contentStorage).read(),
    ).resolves.toMatchObject({
      subscriptions: [expect.objectContaining({ content })],
    });
  });

  it('rejects duplicate and reserved custom filter identities', async () => {
    const duplicate = subscription();
    const duplicated = harness({
      [CONTENT_BLOCKER_STORAGE_KEY]: {
        ...defaultContentBlockingState(),
        subscriptions: [
          persistedSubscription(duplicate, 'first'),
          persistedSubscription(
            {
              ...duplicate,
              url: 'https://example.org/filter.txt',
            },
            'second',
          ),
        ],
      },
    });
    const reserved = harness({
      [CONTENT_BLOCKER_STORAGE_KEY]: {
        ...defaultContentBlockingState(),
        subscriptions: [
          persistedSubscription({ ...duplicate, filterId: 2 }, 'reserved'),
        ],
      },
    });

    await expect(duplicated.repository.read()).rejects.toThrow(
      'invalid schema',
    );
    await expect(reserved.repository.read()).rejects.toThrow('invalid schema');
  });

  it('rejects static filter ids outside the packaged catalog', async () => {
    const test = harness({
      [CONTENT_BLOCKER_STORAGE_KEY]: {
        ...defaultContentBlockingState(),
        enabledStaticFilterIds: [999_999],
      },
    });

    await expect(test.repository.read()).rejects.toThrow('invalid schema');
  });
});
