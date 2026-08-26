import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  UiButton,
  UiIconButton,
  UiSegmentedControl,
  UiToggle,
} from '../../components/ui/Ui';
import type {
  ContentBlockingBuiltInFilterView,
  ContentBlockingController,
  ContentBlockingFilterGroup,
  ContentBlockingSettingsView,
  ContentBlockingSubscriptionView,
} from '../../content-blocking/domain/types';

const FILTER_GROUPS: Array<{
  id: ContentBlockingFilterGroup;
  label: string;
}> = [
  { id: 'ads', label: '广告' },
  { id: 'privacy', label: '隐私' },
  { id: 'security', label: '安全' },
  { id: 'social', label: '社交组件' },
  { id: 'annoyances', label: '骚扰' },
  { id: 'regional', label: '区域与语言' },
];

const FILTER_LIST_VIEWS = [
  { value: 'built-in', label: '内置列表' },
  { value: 'subscriptions', label: '第三方订阅' },
] as const;

type FilterListView = (typeof FILTER_LIST_VIEWS)[number]['value'];

type RunOperation = (
  operation: string,
  task: () => Promise<ContentBlockingSettingsView>,
  message: string,
) => Promise<boolean>;

function formattedTime(value?: number) {
  if (!value) return '尚无';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function FilterListRow({
  enabled,
  title,
  description,
  details,
  error,
  disabled,
  onToggle,
  actions,
}: {
  enabled: boolean;
  title: string;
  description: string;
  details: ReactNode;
  error?: string;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
  actions?: ReactNode;
}) {
  return (
    <article className="manager-filter-list-row">
      <input
        type="checkbox"
        checked={enabled}
        disabled={disabled}
        aria-label={`${enabled ? '停用' : '启用'} ${title}`}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <div>
        <strong>{title}</strong>
        <span className="manager-filter-list-row__summary">
          <span>{description}</span>
        </span>
        <span className="manager-filter-list-row__details">{details}</span>
        {error && <small className="is-error">{error}</small>}
      </div>
      {actions && (
        <div className="manager-filter-list-row__actions">{actions}</div>
      )}
    </article>
  );
}

function BuiltInFilterRow({
  filter,
  busy,
  onToggle,
}: {
  filter: ContentBlockingBuiltInFilterView;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <FilterListRow
      enabled={filter.enabled}
      title={filter.name}
      description={filter.description}
      details={<span>{filter.ruleCount.toLocaleString()} 条规则</span>}
      disabled={busy}
      onToggle={onToggle}
    />
  );
}

function CustomFilterRow({
  subscription,
  toggleBusy,
  refreshBusy,
  removeBusy,
  onToggle,
  onRefresh,
  onRemove,
}: {
  subscription: ContentBlockingSubscriptionView;
  toggleBusy: boolean;
  refreshBusy: boolean;
  removeBusy: boolean;
  onToggle: (enabled: boolean) => void;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  return (
    <FilterListRow
      enabled={subscription.enabled}
      title={subscription.name}
      description={subscription.url}
      details={
        <>
          <span>{subscription.ruleCount.toLocaleString()} 条规则</span>
          {subscription.rejectedRuleCount > 0 && (
            <span className="is-warning">
              {subscription.rejectedRuleCount.toLocaleString()} 条已拒绝
            </span>
          )}
          <span>检查 {formattedTime(subscription.lastCheckedAt)}</span>
          <span>变更 {formattedTime(subscription.lastUpdatedAt)}</span>
        </>
      }
      error={subscription.error}
      disabled={toggleBusy}
      onToggle={onToggle}
      actions={
        <>
          <UiIconButton
            label={`更新 ${subscription.name}`}
            disabled={refreshBusy || removeBusy}
            onClick={onRefresh}
          >
            <RefreshCw size={14} aria-hidden="true" />
          </UiIconButton>
          <UiIconButton
            label={`删除 ${subscription.name}`}
            disabled={removeBusy || refreshBusy}
            onClick={onRemove}
          >
            <Trash2 size={14} aria-hidden="true" />
          </UiIconButton>
        </>
      }
    />
  );
}

export function ContentBlockingFilterListsPanel({
  controller,
  view,
  activeOperations,
  isBusy,
  run,
}: {
  controller: ContentBlockingController;
  view: ContentBlockingSettingsView;
  activeOperations: ReadonlySet<string>;
  isBusy: (operation: string) => boolean;
  run: RunOperation;
}) {
  const [importUrls, setImportUrls] = useState('');
  const [search, setSearch] = useState('');
  const [filterListView, setFilterListView] =
    useState<FilterListView>('built-in');
  const builtInFilters = view.builtInFilters;
  const subscriptions = view.subscriptions;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleBuiltInFilters = normalizedSearch
    ? builtInFilters.filter((filter) =>
        `${filter.name} ${filter.description} ${filter.group}`
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      )
    : builtInFilters;
  const visibleSubscriptions = normalizedSearch
    ? subscriptions.filter((subscription) =>
        `${subscription.name} ${subscription.url} ${subscription.error ?? ''}`
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      )
    : subscriptions;
  const enabledBuiltInCount = builtInFilters.filter(
    (filter) => filter.enabled,
  ).length;
  const refreshingSubscriptions =
    isBusy('refresh-all') ||
    [...activeOperations].some((operation) => operation.startsWith('refresh:'));

  const addSubscriptions = async () => {
    const urls = importUrls
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter((url) => url && !url.startsWith('!') && !url.startsWith('#'));
    const succeeded = await run(
      'add-subscriptions',
      () => controller.addSubscriptions(urls),
      `已处理 ${new Set(urls).size} 个过滤列表，失败项已保留以便重试。`,
    );
    if (succeeded) setImportUrls('');
  };

  return (
    <div className="manager-blocking-panel manager-blocking-filter-panel">
      <header className="manager-blocking-panel__header">
        <div>
          <strong>过滤列表</strong>
          <span>管理扩展内置规则集和可更新的第三方订阅。</span>
        </div>
        {filterListView === 'subscriptions' && (
          <UiButton
            disabled={refreshingSubscriptions || subscriptions.length === 0}
            onClick={() =>
              void run(
                'refresh-all',
                () => controller.refreshSubscriptions(),
                '自定义过滤列表已全部检查更新。',
              )
            }
          >
            <RefreshCw size={14} aria-hidden="true" />
            检查更新
          </UiButton>
        )}
      </header>

      <div className="manager-filter-lists-workspace">
        <UiSegmentedControl
          label="过滤列表类型"
          value={filterListView}
          options={FILTER_LIST_VIEWS}
          className="manager-filter-list-tabs"
          onChange={setFilterListView}
        />
        <label className="manager-filter-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder="搜索过滤列表"
            aria-label="搜索过滤列表"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <section
          className="manager-filter-lists-panel"
          hidden={filterListView !== 'built-in'}
        >
          <header className="manager-filter-lists-panel__header">
            <div>
              <strong>内置过滤列表</strong>
              <span>按用途独立启停，变更后由引擎增量应用。</span>
            </div>
            <b>
              {enabledBuiltInCount}/{builtInFilters.length}
            </b>
          </header>
          <div className="manager-filter-lists-scroll manager-filter-groups">
            {FILTER_GROUPS.map((group) => {
              const filters = visibleBuiltInFilters.filter(
                (filter) => filter.group === group.id,
              );
              if (filters.length === 0) return null;
              return (
                <section key={group.id} className="manager-filter-group">
                  <header>
                    <strong>{group.label}</strong>
                    <span>
                      {filters.filter((filter) => filter.enabled).length}/
                      {filters.length}
                    </span>
                  </header>
                  {filters.map((filter) => (
                    <BuiltInFilterRow
                      key={filter.id}
                      filter={filter}
                      busy={isBusy(`builtin:${filter.filterId}`)}
                      onToggle={(enabled) =>
                        void run(
                          `builtin:${filter.filterId}`,
                          () =>
                            controller.setBuiltInFilterEnabled(
                              filter.filterId,
                              enabled,
                            ),
                          `${filter.name} 已${enabled ? '启用' : '停用'}。`,
                        )
                      }
                    />
                  ))}
                </section>
              );
            })}
          </div>
        </section>

        <aside
          className="manager-filter-lists-panel manager-filter-lists-panel--custom"
          hidden={filterListView !== 'subscriptions'}
        >
          <header className="manager-filter-lists-panel__header">
            <div>
              <strong>第三方订阅</strong>
              <span>每行导入一个 HTTPS 地址，并按需更新或停用。</span>
            </div>
            <b>{subscriptions.length}</b>
          </header>
          <div className="manager-filter-lists-panel__body--custom">
            <div className="manager-filter-auto-update">
              <UiToggle
                label="自动更新订阅列表"
                description="每天检查已导入地址，仅在内容变化时重新应用规则。"
                checked={view.autoUpdateSubscriptions}
                disabled={isBusy('auto-update')}
                onChange={(enabled) =>
                  void run(
                    'auto-update',
                    () => controller.setSubscriptionAutoUpdate(enabled),
                    `订阅列表自动更新已${enabled ? '开启' : '关闭'}。`,
                  )
                }
              />
            </div>
            <div className="manager-filter-import">
              <textarea
                value={importUrls}
                aria-label="过滤列表地址"
                placeholder="每行一个 HTTPS 过滤列表地址"
                spellCheck={false}
                onChange={(event) => setImportUrls(event.target.value)}
              />
              <UiButton
                disabled={isBusy('add-subscriptions') || !importUrls.trim()}
                onClick={() => void addSubscriptions()}
              >
                <Plus size={14} aria-hidden="true" />
                导入列表
              </UiButton>
            </div>
            <div className="manager-filter-lists-scroll manager-filter-custom-list">
              {visibleSubscriptions.length === 0 ? (
                <p className="manager-filter-list-empty">
                  {subscriptions.length === 0
                    ? '尚未导入第三方过滤列表。'
                    : '没有匹配的第三方过滤列表。'}
                </p>
              ) : (
                visibleSubscriptions.map((subscription) => (
                  <CustomFilterRow
                    key={subscription.id}
                    subscription={subscription}
                    toggleBusy={
                      isBusy(`toggle:${subscription.id}`) ||
                      isBusy(`refresh:${subscription.id}`) ||
                      isBusy(`remove:${subscription.id}`)
                    }
                    refreshBusy={
                      isBusy(`refresh:${subscription.id}`) ||
                      isBusy(`toggle:${subscription.id}`) ||
                      isBusy('refresh-all')
                    }
                    removeBusy={
                      isBusy(`remove:${subscription.id}`) ||
                      isBusy(`toggle:${subscription.id}`)
                    }
                    onToggle={(enabled) =>
                      void run(
                        `toggle:${subscription.id}`,
                        () =>
                          controller.setSubscriptionEnabled(
                            subscription.id,
                            enabled,
                          ),
                        `${subscription.name} 已${enabled ? '启用' : '停用'}。`,
                      )
                    }
                    onRefresh={() =>
                      void run(
                        `refresh:${subscription.id}`,
                        () => controller.refreshSubscription(subscription.id),
                        `${subscription.name} 已更新。`,
                      )
                    }
                    onRemove={() =>
                      void run(
                        `remove:${subscription.id}`,
                        () => controller.removeSubscription(subscription.id),
                        `${subscription.name} 已删除。`,
                      )
                    }
                  />
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
