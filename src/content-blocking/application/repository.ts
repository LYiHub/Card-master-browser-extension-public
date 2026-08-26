import {
  CONTENT_BLOCKER_ELEMENT_BATCH_STORAGE_KEY,
  CONTENT_BLOCKER_FIRST_CUSTOM_FILTER_ID,
  CONTENT_BLOCKER_STATIC_FILTER_IDS,
  CONTENT_BLOCKER_STORAGE_KEY,
  CONTENT_BLOCKER_USER_RULES_STORAGE_KEY,
  type ContentBlockingElementBatch,
  type ContentBlockingState,
  type ContentBlockingSubscription,
  defaultContentBlockingState,
} from '../domain/types';
import { normalizeSubscriptionUrl } from './subscriptions';

export interface ContentBlockingStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ContentBlockingSubscriptionContentStorage {
  read(contentKey: string): Promise<string | undefined>;
  write(contentKey: string, content: string): Promise<void>;
  remove(contentKey: string): Promise<void>;
}

type PersistedSubscription = Omit<ContentBlockingSubscription, 'content'> & {
  contentKey: string;
};

type PersistedState = Omit<ContentBlockingState, 'subscriptions'> & {
  subscriptions: PersistedSubscription[];
};

class MemorySubscriptionContentStorage
  implements ContentBlockingSubscriptionContentStorage
{
  private readonly contents = new Map<string, string>();

  async read(contentKey: string) {
    return this.contents.get(contentKey);
  }

  async write(contentKey: string, content: string) {
    this.contents.set(contentKey, content);
  }

  async remove(contentKey: string) {
    this.contents.delete(contentKey);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

function numberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => Number.isSafeInteger(entry) && entry > 0)
  );
}

function elementBlockingBatch(
  value: unknown,
): ContentBlockingElementBatch | null {
  if (
    !record(value) ||
    !exactKeys(value, ['sessionId', 'startedAt', 'hostname', 'rules']) ||
    typeof value.sessionId !== 'string' ||
    !value.sessionId.trim() ||
    value.sessionId.length > 128 ||
    typeof value.startedAt !== 'number' ||
    !Number.isFinite(value.startedAt) ||
    value.startedAt <= 0 ||
    typeof value.hostname !== 'string' ||
    !value.hostname ||
    value.hostname.length > 253 ||
    value.hostname !== value.hostname.toLowerCase() ||
    !stringArray(value.rules) ||
    value.rules.length === 0 ||
    new Set(value.rules).size !== value.rules.length ||
    value.rules.some(
      (rule) => !rule.trim() || /[\r\n]/.test(rule) || rule.length > 16_384,
    )
  ) {
    return null;
  }
  try {
    if (new URL(`https://${value.hostname}`).hostname !== value.hostname) {
      return null;
    }
  } catch {
    return null;
  }
  return {
    sessionId: value.sessionId,
    startedAt: value.startedAt,
    hostname: value.hostname,
    rules: [...value.rules],
  };
}

function subscriptionFields(
  value: Record<string, unknown>,
  contentField: 'content' | 'contentKey',
) {
  const url = value.url;
  const valid =
    typeof value.id === 'string' &&
    typeof value.filterId === 'number' &&
    Number.isSafeInteger(value.filterId) &&
    value.filterId > 0 &&
    typeof value.name === 'string' &&
    typeof url === 'string' &&
    typeof value.enabled === 'boolean' &&
    typeof value[contentField] === 'string' &&
    (contentField === 'content' || Boolean(value[contentField])) &&
    typeof value.ruleCount === 'number' &&
    Number.isSafeInteger(value.ruleCount) &&
    value.ruleCount >= 0 &&
    typeof value.rejectedRuleCount === 'number' &&
    Number.isSafeInteger(value.rejectedRuleCount) &&
    value.rejectedRuleCount >= 0 &&
    (value.etag === undefined || typeof value.etag === 'string') &&
    (value.lastModified === undefined ||
      typeof value.lastModified === 'string') &&
    (value.lastCheckedAt === undefined ||
      (typeof value.lastCheckedAt === 'number' &&
        Number.isFinite(value.lastCheckedAt))) &&
    (value.lastUpdatedAt === undefined ||
      (typeof value.lastUpdatedAt === 'number' &&
        Number.isFinite(value.lastUpdatedAt))) &&
    (value.error === undefined || typeof value.error === 'string');
  if (!valid) return false;
  try {
    return normalizeSubscriptionUrl(url) === url;
  } catch {
    return false;
  }
}

function subscriptionWithContent(
  value: unknown,
): value is ContentBlockingSubscription {
  return (
    record(value) &&
    exactKeys(
      value,
      [
        'id',
        'filterId',
        'name',
        'url',
        'enabled',
        'content',
        'ruleCount',
        'rejectedRuleCount',
      ],
      ['etag', 'lastModified', 'lastCheckedAt', 'lastUpdatedAt', 'error'],
    ) &&
    subscriptionFields(value, 'content')
  );
}

function persistedSubscription(value: unknown): value is PersistedSubscription {
  return (
    record(value) &&
    exactKeys(
      value,
      [
        'id',
        'filterId',
        'name',
        'url',
        'enabled',
        'contentKey',
        'ruleCount',
        'rejectedRuleCount',
      ],
      ['etag', 'lastModified', 'lastCheckedAt', 'lastUpdatedAt', 'error'],
    ) &&
    subscriptionFields(value, 'contentKey')
  );
}

function validIdentities(
  subscriptions: readonly Pick<
    ContentBlockingSubscription,
    'id' | 'filterId'
  >[],
) {
  const ids = new Set<string>();
  const filterIds = new Set<number>();
  for (const entry of subscriptions) {
    if (
      entry.filterId < CONTENT_BLOCKER_FIRST_CUSTOM_FILTER_ID ||
      ids.has(entry.id) ||
      filterIds.has(entry.filterId)
    ) {
      return false;
    }
    ids.add(entry.id);
    filterIds.add(entry.filterId);
  }
  return true;
}

function stateEnvelope(
  value: unknown,
  validateSubscription: (subscription: unknown) => boolean,
) {
  if (
    !record(value) ||
    !exactKeys(value, [
      'version',
      'rulesEnabled',
      'autoUpdateSubscriptions',
      'enabledStaticFilterIds',
      'userRules',
      'allowlist',
      'subscriptions',
    ]) ||
    value.version !== 1 ||
    typeof value.rulesEnabled !== 'boolean' ||
    typeof value.autoUpdateSubscriptions !== 'boolean' ||
    !numberArray(value.enabledStaticFilterIds) ||
    typeof value.userRules !== 'string' ||
    !stringArray(value.allowlist) ||
    !Array.isArray(value.subscriptions) ||
    !value.subscriptions.every(validateSubscription)
  ) {
    return false;
  }
  const staticFilterIds = new Set(CONTENT_BLOCKER_STATIC_FILTER_IDS);
  return (
    new Set(value.enabledStaticFilterIds).size ===
      value.enabledStaticFilterIds.length &&
    value.enabledStaticFilterIds.every((filterId) =>
      staticFilterIds.has(filterId),
    ) &&
    validIdentities(
      value.subscriptions as Array<
        Pick<ContentBlockingSubscription, 'id' | 'filterId'>
      >,
    )
  );
}

function runtimeState(value: unknown): ContentBlockingState | null {
  if (!stateEnvelope(value, subscriptionWithContent)) return null;
  const state = value as ContentBlockingState;
  return {
    version: 1,
    rulesEnabled: state.rulesEnabled,
    autoUpdateSubscriptions: state.autoUpdateSubscriptions,
    enabledStaticFilterIds: [...state.enabledStaticFilterIds],
    userRules: state.userRules,
    allowlist: [...state.allowlist],
    subscriptions: state.subscriptions.map((entry) => ({ ...entry })),
  };
}

function persistedState(value: unknown): PersistedState | null {
  if (!stateEnvelope(value, persistedSubscription)) return null;
  const state = value as PersistedState;
  return {
    version: 1,
    rulesEnabled: state.rulesEnabled,
    autoUpdateSubscriptions: state.autoUpdateSubscriptions,
    enabledStaticFilterIds: [...state.enabledStaticFilterIds],
    userRules: state.userRules,
    allowlist: [...state.allowlist],
    subscriptions: state.subscriptions.map((entry) => ({ ...entry })),
  };
}

export function parseContentBlockingState(value: unknown) {
  return runtimeState(value);
}

async function subscriptionContentKey(content: string) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(content),
  );
  return `sha256-${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`;
}

export class ContentBlockingRepository {
  private knownContentKeys = new Set<string>();
  private knownSubscriptionContents = new Map<
    string,
    { content: string; contentKey: string }
  >();

  constructor(
    private readonly storage: ContentBlockingStorage,
    private readonly contentStorage: ContentBlockingSubscriptionContentStorage = new MemorySubscriptionContentStorage(),
  ) {}

  async read() {
    const current = (await this.storage.get(CONTENT_BLOCKER_STORAGE_KEY))[
      CONTENT_BLOCKER_STORAGE_KEY
    ];
    if (current !== undefined) {
      const persisted = persistedState(current);
      if (persisted) return this.hydrate(persisted);
      throw new Error('Content blocking storage has an invalid schema.');
    }
    return defaultContentBlockingState();
  }

  async readUserRules() {
    const storedRules = (
      await this.storage.get(CONTENT_BLOCKER_USER_RULES_STORAGE_KEY)
    )[CONTENT_BLOCKER_USER_RULES_STORAGE_KEY];
    if (typeof storedRules === 'string') return storedRules;
    if (storedRules !== undefined) {
      throw new Error('Content blocking user rules storage is invalid.');
    }

    const current = (await this.storage.get(CONTENT_BLOCKER_STORAGE_KEY))[
      CONTENT_BLOCKER_STORAGE_KEY
    ];
    if (current !== undefined) {
      const state = persistedState(current);
      if (!state) {
        throw new Error('Content blocking storage has an invalid schema.');
      }
      return state.userRules;
    }

    return '';
  }

  async readElementBlockingBatch() {
    const stored = (
      await this.storage.get(CONTENT_BLOCKER_ELEMENT_BATCH_STORAGE_KEY)
    )[CONTENT_BLOCKER_ELEMENT_BATCH_STORAGE_KEY];
    if (stored === undefined || stored === null) return null;
    const batch = elementBlockingBatch(stored);
    if (!batch) {
      throw new Error('Content blocking element batch storage is invalid.');
    }
    return batch;
  }

  async write(
    state: ContentBlockingState,
    batch?: ContentBlockingElementBatch | null,
  ) {
    const normalized = runtimeState(state);
    if (!normalized) {
      throw new Error('Refusing to persist invalid content blocking state.');
    }
    const normalizedBatch =
      batch === undefined || batch === null
        ? batch
        : elementBlockingBatch(batch);
    if (batch !== undefined && batch !== null && !normalizedBatch) {
      throw new Error('Refusing to persist invalid element blocking batch.');
    }
    const unchangedSubscriptions = normalized.subscriptions.every(
      ({ id, content }) =>
        this.knownSubscriptionContents.get(id)?.content === content,
    );
    if (unchangedSubscriptions) {
      await this.commit(
        normalized,
        normalized.subscriptions.map(
          ({ content: _content, ...subscription }) => {
            const known = this.knownSubscriptionContents.get(subscription.id);
            if (!known) {
              throw new Error('Subscription content cache is incomplete.');
            }
            return { ...subscription, contentKey: known.contentKey };
          },
        ),
        normalizedBatch,
      );
      return;
    }
    const persistedSubscriptions = await Promise.all(
      normalized.subscriptions.map(async ({ content, ...subscription }) => {
        const known = this.knownSubscriptionContents.get(subscription.id);
        return {
          ...subscription,
          contentKey:
            known?.content === content
              ? known.contentKey
              : await subscriptionContentKey(content),
        };
      }),
    );
    await Promise.all(
      normalized.subscriptions.map(async (subscription, index) => {
        const contentKey = persistedSubscriptions[index].contentKey;
        if (this.knownContentKeys.has(contentKey)) return;
        await this.contentStorage.write(contentKey, subscription.content);
      }),
    );
    await this.commit(normalized, persistedSubscriptions, normalizedBatch);
  }

  private async commit(
    normalized: ContentBlockingState,
    persistedSubscriptions: PersistedSubscription[],
    batch?: ContentBlockingElementBatch | null,
  ) {
    const nextContentKeys = new Set(
      persistedSubscriptions.map((subscription) => subscription.contentKey),
    );
    const persisted: PersistedState = {
      ...normalized,
      subscriptions: persistedSubscriptions,
    };
    const items: Record<string, unknown> = {
      [CONTENT_BLOCKER_STORAGE_KEY]: structuredClone(persisted),
      [CONTENT_BLOCKER_USER_RULES_STORAGE_KEY]: normalized.userRules,
    };
    if (batch !== undefined) {
      items[CONTENT_BLOCKER_ELEMENT_BATCH_STORAGE_KEY] = structuredClone(batch);
    }
    await this.storage.set(items);
    await Promise.all(
      [...this.knownContentKeys]
        .filter((contentKey) => !nextContentKeys.has(contentKey))
        .map((contentKey) => this.contentStorage.remove(contentKey)),
    );
    this.knownContentKeys = nextContentKeys;
    this.knownSubscriptionContents = new Map(
      normalized.subscriptions.map((subscription, index) => [
        subscription.id,
        {
          content: subscription.content,
          contentKey: persistedSubscriptions[index].contentKey,
        },
      ]),
    );
  }

  private async hydrate(persisted: PersistedState) {
    this.knownContentKeys = new Set(
      persisted.subscriptions.map((subscription) => subscription.contentKey),
    );
    const subscriptions = await Promise.all(
      persisted.subscriptions.map(async ({ contentKey, ...subscription }) => {
        const content = await this.contentStorage.read(contentKey);
        if (content !== undefined) {
          this.knownSubscriptionContents.set(subscription.id, {
            content,
            contentKey,
          });
          return { ...subscription, content };
        }
        return {
          ...subscription,
          enabled: false,
          content: '',
          error:
            subscription.error ??
            '过滤列表正文缓存缺失，请手动刷新该订阅后重新启用。',
        };
      }),
    );
    return {
      ...persisted,
      subscriptions,
    } satisfies ContentBlockingState;
  }
}
