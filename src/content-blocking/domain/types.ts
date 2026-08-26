import filterCatalog from './filter-catalog.json';

export const CONTENT_BLOCKER_CARD_ID = 'system-content-blocker' as const;
export const CONTENT_BLOCKER_STORAGE_KEY = 'content-blocking.state.v1';
export const CONTENT_BLOCKER_USER_RULES_STORAGE_KEY =
  'content-blocking.user-rules.v1';
export const CONTENT_BLOCKER_ELEMENT_BATCH_STORAGE_KEY =
  'content-blocking.element-batch.v1';
export const CONTENT_BLOCKER_FIRST_CUSTOM_FILTER_ID = 10_000;
export const CONTENT_BLOCKING_EXPORT_KIND =
  'card-master-content-blocking' as const;

export type ContentBlockingRuntimeStatus = 'starting' | 'ready' | 'error';
export type ContentBlockingFilterGroup =
  | 'ads'
  | 'privacy'
  | 'security'
  | 'social'
  | 'annoyances'
  | 'regional';

export type ContentBlockingBuiltInFilterDefinition = {
  id: string;
  filterId: number;
  name: string;
  description: string;
  group: ContentBlockingFilterGroup;
  defaultEnabled: boolean;
  ruleCount: number;
};

export const CONTENT_BLOCKER_BUILTIN_FILTERS =
  filterCatalog as ContentBlockingBuiltInFilterDefinition[];
export const CONTENT_BLOCKER_STATIC_FILTER_IDS =
  CONTENT_BLOCKER_BUILTIN_FILTERS.map((filter) => filter.filterId);
export const CONTENT_BLOCKER_DEFAULT_STATIC_FILTER_IDS =
  CONTENT_BLOCKER_BUILTIN_FILTERS.filter((filter) => filter.defaultEnabled).map(
    (filter) => filter.filterId,
  );

export type ContentBlockingSubscription = {
  id: string;
  filterId: number;
  name: string;
  url: string;
  enabled: boolean;
  content: string;
  etag?: string;
  lastModified?: string;
  lastCheckedAt?: number;
  lastUpdatedAt?: number;
  ruleCount: number;
  rejectedRuleCount: number;
  error?: string;
};

export type ContentBlockingState = {
  version: 1;
  rulesEnabled: boolean;
  autoUpdateSubscriptions: boolean;
  enabledStaticFilterIds: number[];
  userRules: string;
  allowlist: string[];
  subscriptions: ContentBlockingSubscription[];
};

export type ContentBlockingEngineReport = {
  revision: number;
  loadedRuleCount: number;
  errors: string[];
  limitations: string[];
};

export type ContentBlockingElementSession = {
  sessionId: string;
  startedAt: number;
};

export type ContentBlockingElementBatch = ContentBlockingElementSession & {
  hostname: string;
  rules: string[];
};

export type ContentBlockingSnapshot = {
  revision: number;
  rulesEnabled: boolean;
  status: ContentBlockingRuntimeStatus;
  configurationPending: boolean;
  loadedRuleCount: number;
  activeRuleCount: number;
  userRuleCount: number;
  enabledSubscriptionCount: number;
  subscriptionCount: number;
  rejectedRuleCount: number;
  allowlist: string[];
  lastElementBlockingBatch: ContentBlockingElementBatch | null;
  errors: string[];
  limitations: string[];
};

export type ContentBlockingSiteState = {
  hostname: string | null;
  filteringEnabled: boolean;
};

export type ContentBlockingSubscriptionView = Omit<
  ContentBlockingSubscription,
  'content' | 'etag' | 'lastModified'
>;

export type ContentBlockingBuiltInFilterView =
  ContentBlockingBuiltInFilterDefinition & {
    enabled: boolean;
  };

export type ContentBlockingSettingsView = {
  rulesEnabled: boolean;
  autoUpdateSubscriptions: boolean;
  builtInFilters: ContentBlockingBuiltInFilterView[];
  userRules: string;
  allowlist: string[];
  subscriptions: ContentBlockingSubscriptionView[];
  snapshot: ContentBlockingSnapshot;
};

export type ContentBlockingGeneralSettingsInput = {
  rulesEnabled: boolean;
  allowlist: string[];
};

export type ContentBlockingCard = {
  kind: 'content-blocker';
  id: typeof CONTENT_BLOCKER_CARD_ID;
  title: string;
  description: string;
  snapshot: ContentBlockingSnapshot;
  site: ContentBlockingSiteState;
};

export type ContentBlockingSnapshotListener = (
  snapshot: ContentBlockingSnapshot,
) => void;

export type ContentBlockingUserRulesListener = (userRules: string) => void;

export interface ContentBlockingController {
  read(): Promise<ContentBlockingSnapshot>;
  getCachedSettings(): ContentBlockingSettingsView | null;
  getCachedUserRules(): string | null;
  readUserRules(): Promise<string>;
  subscribeUserRules(listener: ContentBlockingUserRulesListener): () => void;
  readSettings(): Promise<ContentBlockingSettingsView>;
  subscribe(listener: ContentBlockingSnapshotListener): () => void;
  setRulesEnabled(rulesEnabled: boolean): Promise<ContentBlockingSnapshot>;
  addUserRule(
    rule: string,
    session: ContentBlockingElementSession,
  ): Promise<ContentBlockingSnapshot>;
  undoLastElementBlockingBatch(): Promise<ContentBlockingSnapshot>;
  setCurrentSiteFiltering(
    pageUrl: string,
    enabled: boolean,
  ): Promise<ContentBlockingSettingsView>;
  waitForCosmeticRevision(revision: number): Promise<boolean>;
  saveGeneralSettings(
    settings: ContentBlockingGeneralSettingsInput,
  ): Promise<ContentBlockingSettingsView>;
  replaceUserRules(userRules: string): Promise<ContentBlockingSettingsView>;
  setBuiltInFilterEnabled(
    filterId: number,
    enabled: boolean,
  ): Promise<ContentBlockingSettingsView>;
  addSubscriptions(
    urls: readonly string[],
  ): Promise<ContentBlockingSettingsView>;
  removeSubscription(
    subscriptionId: string,
  ): Promise<ContentBlockingSettingsView>;
  setSubscriptionEnabled(
    subscriptionId: string,
    enabled: boolean,
  ): Promise<ContentBlockingSettingsView>;
  setSubscriptionAutoUpdate(
    enabled: boolean,
  ): Promise<ContentBlockingSettingsView>;
  refreshSubscription(
    subscriptionId: string,
  ): Promise<ContentBlockingSettingsView>;
  refreshSubscriptions(): Promise<ContentBlockingSettingsView>;
  exportConfiguration(): Promise<string>;
  importConfiguration(source: string): Promise<ContentBlockingSettingsView>;
  dispose(): void;
}

export type ContentBlockingConfigurationExport = {
  kind: typeof CONTENT_BLOCKING_EXPORT_KIND;
  version: 1;
  exportedAt: string;
  state: ContentBlockingState;
};

export function contentBlockingSiteState(
  allowlist: readonly string[],
  pageUrl: string | null,
): ContentBlockingSiteState {
  if (!pageUrl) return { hostname: null, filteringEnabled: true };
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { hostname: null, filteringEnabled: true };
    }
    const hostname = url.hostname.toLowerCase();
    return {
      hostname,
      filteringEnabled: !allowlist.includes(hostname),
    };
  } catch {
    return { hostname: null, filteringEnabled: true };
  }
}

export function defaultContentBlockingState(): ContentBlockingState {
  return {
    version: 1,
    rulesEnabled: true,
    autoUpdateSubscriptions: true,
    enabledStaticFilterIds: [...CONTENT_BLOCKER_DEFAULT_STATIC_FILTER_IDS],
    userRules: '',
    allowlist: [],
    subscriptions: [],
  };
}

export function startingContentBlockingSnapshot(): ContentBlockingSnapshot {
  return {
    revision: 0,
    rulesEnabled: true,
    status: 'starting',
    configurationPending: false,
    loadedRuleCount: 0,
    activeRuleCount: 0,
    userRuleCount: 0,
    enabledSubscriptionCount: 0,
    subscriptionCount: 0,
    rejectedRuleCount: 0,
    allowlist: [],
    lastElementBlockingBatch: null,
    errors: [],
    limitations: [],
  };
}
