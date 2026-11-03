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
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';

const FILTER_GROUPS: Array<{
  id: ContentBlockingFilterGroup;
  label: string;
}> = [
  {
    id: 'ads',
    get label() {
      return t('cm_content_blocking_filter_lists_panel_label_1');
    },
  },
  {
    id: 'privacy',
    get label() {
      return t('cm_content_blocking_filter_lists_panel_label_2');
    },
  },
  {
    id: 'security',
    get label() {
      return t('cm_content_blocking_filter_lists_panel_label_3');
    },
  },
  {
    id: 'social',
    get label() {
      return t('cm_content_blocking_filter_lists_panel_label_4');
    },
  },
  {
    id: 'annoyances',
    get label() {
      return t('cm_content_blocking_filter_lists_panel_label_5');
    },
  },
  {
    id: 'regional',
    get label() {
      return t('cm_content_blocking_filter_lists_panel_label_6');
    },
  },
];

const FILTER_LIST_VIEWS = [
  {
    value: 'built-in',
    get label() {
      return t('cm_content_blocking_filter_lists_panel_label_7');
    },
  },
  {
    value: 'subscriptions',
    get label() {
      return t('cm_content_blocking_filter_lists_panel_label_8');
    },
  },
] as const;

type FilterListView = (typeof FILTER_LIST_VIEWS)[number]['value'];

type RunOperation = (
  operation: string,
  task: () => Promise<ContentBlockingSettingsView>,
  message: string,
) => Promise<boolean>;

function formattedTime(value?: number) {
  if (!value) return t('cm_content_blocking_filter_lists_panel_text_9');
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
  useLocale();

  return (
    <article className="manager-filter-list-row">
      <input
        type="checkbox"
        checked={enabled}
        disabled={disabled}
        aria-label={`${enabled ? t('cm_content_blocking_filter_lists_panel_text_10') : t('cm_content_blocking_filter_lists_panel_text_11')} ${title}`}
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
  useLocale();

  return (
    <FilterListRow
      enabled={filter.enabled}
      title={filter.name}
      description={filter.description}
      details={
        <span>
          {filter.ruleCount.toLocaleString()}{' '}
          {t('cm_content_blocking_filter_lists_panel_text_12')}
        </span>
      }
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
  useLocale();

  return (
    <FilterListRow
      enabled={subscription.enabled}
      title={subscription.name}
      description={subscription.url}
      details={
        <>
          <span>
            {subscription.ruleCount.toLocaleString()}{' '}
            {t('cm_content_blocking_filter_lists_panel_text_13')}
          </span>
          {subscription.rejectedRuleCount > 0 && (
            <span className="is-warning">
              {subscription.rejectedRuleCount.toLocaleString()}{' '}
              {t('cm_content_blocking_filter_lists_panel_text_14')}
            </span>
          )}
          <span>
            {t('cm_content_blocking_filter_lists_panel_text_15')}
            {formattedTime(subscription.lastCheckedAt)}
          </span>
          <span>
            {t('cm_content_blocking_filter_lists_panel_text_16')}
            {formattedTime(subscription.lastUpdatedAt)}
          </span>
        </>
      }
      error={subscription.error}
      disabled={toggleBusy}
      onToggle={onToggle}
      actions={
        <>
          <UiIconButton
            label={t('cm_content_blocking_filter_lists_panel_text_17', [
              String(subscription.name),
            ])}
            disabled={refreshBusy || removeBusy}
            onClick={onRefresh}
          >
            <RefreshCw size={14} aria-hidden="true" />
          </UiIconButton>
          <UiIconButton
            label={t('cm_content_blocking_filter_lists_panel_text_18', [
              String(subscription.name),
            ])}
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
  useLocale();

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
      t('cm_content_blocking_filter_lists_panel_text_19', [
        String(new Set(urls).size),
      ]),
    );
    if (succeeded) setImportUrls('');
  };

  return (
    <div className="manager-blocking-panel manager-blocking-filter-panel">
      <header className="manager-blocking-panel__header">
        <div>
          <strong>{t('cm_content_blocking_filter_lists_panel_text_20')}</strong>
          <span>{t('cm_content_blocking_filter_lists_panel_text_21')}</span>
        </div>
        {filterListView === 'subscriptions' && (
          <UiButton
            disabled={refreshingSubscriptions || subscriptions.length === 0}
            onClick={() =>
              void run(
                'refresh-all',
                () => controller.refreshSubscriptions(),
                t('cm_content_blocking_filter_lists_panel_text_22'),
              )
            }
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t('cm_content_blocking_filter_lists_panel_text_23')}
          </UiButton>
        )}
      </header>

      <div className="manager-filter-lists-workspace">
        <UiSegmentedControl
          label={t('cm_content_blocking_filter_lists_panel_label_24')}
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
            placeholder={t(
              'cm_content_blocking_filter_lists_panel_placeholder_25',
            )}
            aria-label={t(
              'cm_content_blocking_filter_lists_panel_aria_label_26',
            )}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <section
          className="manager-filter-lists-panel"
          hidden={filterListView !== 'built-in'}
        >
          <header className="manager-filter-lists-panel__header">
            <div>
              <strong>
                {t('cm_content_blocking_filter_lists_panel_text_27')}
              </strong>
              <span>{t('cm_content_blocking_filter_lists_panel_text_28')}</span>
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
                          t('cm_content_blocking_filter_lists_panel_text_29', [
                            String(filter.name),
                            String(
                              enabled
                                ? t(
                                    'cm_content_blocking_filter_lists_panel_text_1',
                                  )
                                : t(
                                    'cm_content_blocking_filter_lists_panel_text_2',
                                  ),
                            ),
                          ]),
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
              <strong>
                {t('cm_content_blocking_filter_lists_panel_text_30')}
              </strong>
              <span>{t('cm_content_blocking_filter_lists_panel_text_31')}</span>
            </div>
            <b>{subscriptions.length}</b>
          </header>
          <div className="manager-filter-lists-panel__body--custom">
            <div className="manager-filter-auto-update">
              <UiToggle
                label={t('cm_content_blocking_filter_lists_panel_label_32')}
                description={t(
                  'cm_content_blocking_filter_lists_panel_description_33',
                )}
                checked={view.autoUpdateSubscriptions}
                disabled={isBusy('auto-update')}
                onChange={(enabled) =>
                  void run(
                    'auto-update',
                    () => controller.setSubscriptionAutoUpdate(enabled),
                    t('cm_content_blocking_filter_lists_panel_text_34', [
                      String(
                        enabled
                          ? t('cm_content_blocking_filter_lists_panel_text_3')
                          : t('cm_content_blocking_filter_lists_panel_text_4'),
                      ),
                    ]),
                  )
                }
              />
            </div>
            <div className="manager-filter-import">
              <textarea
                value={importUrls}
                aria-label={t(
                  'cm_content_blocking_filter_lists_panel_aria_label_35',
                )}
                placeholder={t(
                  'cm_content_blocking_filter_lists_panel_placeholder_36',
                )}
                spellCheck={false}
                onChange={(event) => setImportUrls(event.target.value)}
              />
              <UiButton
                disabled={isBusy('add-subscriptions') || !importUrls.trim()}
                onClick={() => void addSubscriptions()}
              >
                <Plus size={14} aria-hidden="true" />
                {t('cm_content_blocking_filter_lists_panel_text_37')}
              </UiButton>
            </div>
            <div className="manager-filter-lists-scroll manager-filter-custom-list">
              {visibleSubscriptions.length === 0 ? (
                <p className="manager-filter-list-empty">
                  {subscriptions.length === 0
                    ? t('cm_content_blocking_filter_lists_panel_text_38')
                    : t('cm_content_blocking_filter_lists_panel_text_39')}
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
                        t('cm_content_blocking_filter_lists_panel_text_40', [
                          String(subscription.name),
                          String(
                            enabled
                              ? t(
                                  'cm_content_blocking_filter_lists_panel_text_5',
                                )
                              : t(
                                  'cm_content_blocking_filter_lists_panel_text_6',
                                ),
                          ),
                        ]),
                      )
                    }
                    onRefresh={() =>
                      void run(
                        `refresh:${subscription.id}`,
                        () => controller.refreshSubscription(subscription.id),
                        t('cm_content_blocking_filter_lists_panel_text_41', [
                          String(subscription.name),
                        ]),
                      )
                    }
                    onRemove={() =>
                      void run(
                        `remove:${subscription.id}`,
                        () => controller.removeSubscription(subscription.id),
                        t('cm_content_blocking_filter_lists_panel_text_42', [
                          String(subscription.name),
                        ]),
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
