import { Download, Info, RefreshCw, Save, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  DiagnosticCopyButton,
  UiButton,
  UiDialog,
  UiLoader,
  UiNotice,
  UiSegmentedControl,
  UiTextArea,
  UiToggle,
} from '../../components/ui/Ui';
import type {
  ContentBlockingController,
  ContentBlockingSettingsView,
  ContentBlockingSnapshot,
} from '../../content-blocking/domain/types';
import { contentBlockingSiteState } from '../../content-blocking/domain/types';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import { ContentBlockingFilterListsPanel } from './ContentBlockingFilterListsPanel';
import { ContentBlockingRulesPanel } from './ContentBlockingRulesPanel';
import { useContentBlockingBoard } from './useContentBlockingBoard';

const MAX_CONFIGURATION_FILE_BYTES = 32 * 1024 * 1024;

type ContentBlockingTab = 'general' | 'filters' | 'rules' | 'advanced';

const TABS = [
  {
    value: 'general',
    get label() {
      return t('cm_content_blocking_settings_board_label_1');
    },
  },
  {
    value: 'filters',
    get label() {
      return t('cm_content_blocking_settings_board_label_2');
    },
  },
  {
    value: 'rules',
    get label() {
      return t('cm_content_blocking_settings_board_label_3');
    },
  },
  {
    value: 'advanced',
    get label() {
      return t('cm_content_blocking_settings_board_label_4');
    },
  },
] as const;

function configurationFilename(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return `card-master-content-blocking_${day}.json`;
}

function downloadConfiguration(source: string) {
  const url = URL.createObjectURL(
    new Blob([source], { type: 'application/json;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = configurationFilename();
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ContentBlockingSettingsBoard({
  controller,
  onSnapshot,
  onClose,
}: {
  controller: ContentBlockingController;
  onSnapshot: (snapshot: ContentBlockingSnapshot) => void;
  onClose: () => void;
}) {
  useLocale();

  const { view, activeOperations, isBusy, status, setStatus, run } =
    useContentBlockingBoard(controller, onSnapshot);
  const [tab, setTab] = useState<ContentBlockingTab>('general');
  const [rulesEnabled, setRulesEnabled] = useState(true);
  const [allowlist, setAllowlist] = useState('');
  const [generalDirty, setGeneralDirty] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const configurationInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!view || generalDirty) return;
    setRulesEnabled(view.rulesEnabled);
    setAllowlist(view.allowlist.join('\n'));
  }, [generalDirty, view]);

  if (!view) {
    return (
      <UiDialog
        ariaLabel={t('cm_content_blocking_settings_board_aria_label_5')}
        title={t('cm_content_blocking_settings_board_title_6')}
        onClose={onClose}
      >
        {status.error ? (
          <UiNotice
            tone="error"
            title={t('cm_content_blocking_settings_board_title_7')}
            copyText={status.message}
          >
            <p>{status.message}</p>
          </UiNotice>
        ) : (
          <div className="manager-blocking-loading">
            <UiLoader
              large
              label={t('cm_content_blocking_settings_board_label_8')}
            />
            <p>{t('cm_content_blocking_settings_board_text_9')}</p>
          </div>
        )}
      </UiDialog>
    );
  }

  const snapshot = view.snapshot;
  const site = contentBlockingSiteState(view.allowlist, window.location.href);
  const diagnostics = [
    ...new Set([...snapshot.errors, ...snapshot.limitations]),
  ];
  const settingsMutationBusy =
    isBusy('save-general') || isBusy('import-configuration');
  const enabledFilterCount =
    view.builtInFilters.filter((filter) => filter.enabled).length +
    snapshot.enabledSubscriptionCount;
  const headerStatus = !snapshot.rulesEnabled
    ? t('cm_content_blocking_settings_board_text_10')
    : site.filteringEnabled
      ? t('cm_content_blocking_settings_board_text_11')
      : t('cm_content_blocking_settings_board_text_12');

  const saveGeneralSettings = async () => {
    const wereRulesEnabled = view.rulesEnabled;
    const succeeded = await run(
      'save-general',
      () =>
        controller.saveGeneralSettings({
          rulesEnabled,
          allowlist: allowlist.split(/\r?\n/),
        }),
      t('cm_content_blocking_settings_board_text_13'),
    );
    if (!succeeded) return;
    setGeneralDirty(false);
    if (wereRulesEnabled && !rulesEnabled) setReloadRequired(true);
  };

  const saveRules = async (rules: string) => {
    let saved: ContentBlockingSettingsView | null = null;
    const succeeded = await run(
      'save-rules',
      async () => {
        const next = await controller.replaceUserRules(rules);
        saved = next;
        return next;
      },
      t('cm_content_blocking_settings_board_text_14'),
    );
    return succeeded ? saved : null;
  };

  const importConfiguration = async (file: File) => {
    if (file.size > MAX_CONFIGURATION_FILE_BYTES) {
      setStatus({
        message: t('cm_content_blocking_settings_board_message_15'),
        error: true,
      });
      return;
    }
    try {
      const source = await file.text();
      const succeeded = await run(
        'import-configuration',
        () => controller.importConfiguration(source),
        t('cm_content_blocking_settings_board_text_16'),
      );
      if (succeeded) setGeneralDirty(false);
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        error: true,
      });
    }
  };

  return (
    <UiDialog
      ariaLabel={t('cm_content_blocking_settings_board_aria_label_17')}
      title={t('cm_content_blocking_settings_board_title_18')}
      className="manager-blocking-dialog"
      status={{
        label: headerStatus,
        tone:
          snapshot.rulesEnabled && site.filteringEnabled
            ? 'active'
            : 'inactive',
      }}
      onClose={onClose}
      navigation={
        <UiSegmentedControl
          label={t('cm_content_blocking_settings_board_label_19')}
          value={tab}
          options={TABS}
          className="manager-blocking-primary-tabs"
          onChange={setTab}
        />
      }
      footer={
        <>
          <UiLoader
            visible={activeOperations.size > 0}
            compact
            className="manager-blocking-operation-loader"
            label={t('cm_content_blocking_settings_board_text_20', [
              String(activeOperations.size),
            ])}
          />
          {activeOperations.size === 0 && status.message && (
            <p
              className={`manager-blocking-operation-status${status.error ? ' is-error' : ''}`}
            >
              {!status.error && <Info size={15} aria-hidden="true" />}
              <span>{status.message}</span>
            </p>
          )}
          {status.error && status.message && (
            <DiagnosticCopyButton text={status.message} />
          )}
          {reloadRequired ? (
            <>
              <UiButton onClick={() => setReloadRequired(false)}>
                {t('cm_content_blocking_settings_board_text_21')}
              </UiButton>
              <UiButton
                variant="primary"
                onClick={() => window.location.reload()}
              >
                <RefreshCw size={14} aria-hidden="true" />
                {t('cm_content_blocking_settings_board_text_22')}
              </UiButton>
            </>
          ) : (
            tab === 'general' && (
              <UiButton
                variant="primary"
                disabled={settingsMutationBusy || !generalDirty}
                onClick={() => void saveGeneralSettings()}
              >
                <Save size={14} aria-hidden="true" />
                {t('cm_content_blocking_settings_board_text_23')}
              </UiButton>
            )
          )}
        </>
      }
    >
      <div className="manager-blocking-workspace">
        <div className="manager-blocking-settings-panels">
          <div
            className="manager-blocking-panel manager-blocking-general-panel"
            hidden={tab !== 'general'}
          >
            <header className="manager-blocking-panel__header">
              <div>
                <strong>
                  {t('cm_content_blocking_settings_board_text_24')}
                </strong>
                <span>{t('cm_content_blocking_settings_board_text_25')}</span>
              </div>
            </header>

            {reloadRequired && (
              <UiNotice
                tone="warning"
                title={t('cm_content_blocking_settings_board_title_26')}
              >
                <p>{t('cm_content_blocking_settings_board_text_27')}</p>
              </UiNotice>
            )}

            <div className="manager-blocking-general-grid">
              <UiToggle
                label={t('cm_content_blocking_settings_board_label_28')}
                description={t(
                  'cm_content_blocking_settings_board_description_29',
                )}
                checked={rulesEnabled}
                onChange={(enabled) => {
                  setRulesEnabled(enabled);
                  setGeneralDirty(true);
                }}
              />
              <UiNotice
                title={t('cm_content_blocking_settings_board_text_30', [
                  String(
                    site.hostname ||
                      t('cm_content_blocking_settings_board_text_1'),
                  ),
                ])}
              >
                <p>
                  {!snapshot.rulesEnabled
                    ? t('cm_content_blocking_settings_board_text_31')
                    : site.filteringEnabled
                      ? t('cm_content_blocking_settings_board_text_32')
                      : t('cm_content_blocking_settings_board_text_33')}
                </p>
              </UiNotice>
            </div>

            <div className="manager-blocking-summary">
              <div className="manager-blocking-summary__item">
                <span>{t('cm_content_blocking_settings_board_text_34')}</span>
                <strong>{snapshot.status}</strong>
              </div>
              <div className="manager-blocking-summary__item">
                <span>
                  {snapshot.rulesEnabled
                    ? t('cm_content_blocking_settings_board_text_35')
                    : t('cm_content_blocking_settings_board_text_36')}
                </span>
                <strong>
                  {snapshot.rulesEnabled
                    ? snapshot.activeRuleCount
                    : snapshot.loadedRuleCount}
                </strong>
              </div>
              <div className="manager-blocking-summary__item">
                <span>{t('cm_content_blocking_settings_board_text_37')}</span>
                <strong>{enabledFilterCount}</strong>
              </div>
              <div className="manager-blocking-summary__item">
                <span>{t('cm_content_blocking_settings_board_text_38')}</span>
                <strong>{snapshot.userRuleCount}</strong>
              </div>
            </div>

            {diagnostics.length > 0 && (
              <UiNotice
                tone="error"
                title={t('cm_content_blocking_settings_board_title_39')}
                copyText={diagnostics.join('\n')}
              >
                {diagnostics.map((diagnostic) => (
                  <p key={diagnostic}>{diagnostic}</p>
                ))}
              </UiNotice>
            )}

            <UiTextArea
              label={t('cm_content_blocking_settings_board_label_40')}
              hint={t('cm_content_blocking_settings_board_hint_41')}
              value={allowlist}
              spellCheck={false}
              onChange={(event) => {
                setAllowlist(event.target.value);
                setGeneralDirty(true);
              }}
            />
          </div>

          <div
            className="manager-blocking-tab-panel"
            hidden={tab !== 'filters'}
          >
            <ContentBlockingFilterListsPanel
              controller={controller}
              view={view}
              activeOperations={activeOperations}
              isBusy={isBusy}
              run={run}
            />
          </div>

          <div className="manager-blocking-tab-panel" hidden={tab !== 'rules'}>
            <ContentBlockingRulesPanel
              controller={controller}
              persistedRules={view.userRules}
              saving={isBusy('save-rules')}
              onSave={saveRules}
            />
          </div>

          <div
            className="manager-blocking-panel manager-blocking-advanced-panel"
            hidden={tab !== 'advanced'}
          >
            <header className="manager-blocking-panel__header">
              <div>
                <strong>
                  {t('cm_content_blocking_settings_board_text_42')}
                </strong>
                <span>{t('cm_content_blocking_settings_board_text_43')}</span>
              </div>
            </header>
            <input
              ref={configurationInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importConfiguration(file);
                event.currentTarget.value = '';
              }}
            />
            <UiNotice title={t('cm_content_blocking_settings_board_title_44')}>
              <p>{t('cm_content_blocking_settings_board_text_45')}</p>
              <div className="manager-blocking-archive-actions">
                <UiButton
                  disabled={settingsMutationBusy}
                  onClick={() => configurationInputRef.current?.click()}
                >
                  <Upload size={14} aria-hidden="true" />
                  {t('cm_content_blocking_settings_board_text_46')}
                </UiButton>
                <UiButton
                  disabled={
                    settingsMutationBusy || isBusy('export-configuration')
                  }
                  onClick={() =>
                    void run(
                      'export-configuration',
                      async () => {
                        downloadConfiguration(
                          await controller.exportConfiguration(),
                        );
                        return view;
                      },
                      t('cm_content_blocking_settings_board_text_47'),
                    )
                  }
                >
                  <Download size={14} aria-hidden="true" />
                  {t('cm_content_blocking_settings_board_text_48')}
                </UiButton>
              </div>
            </UiNotice>
            <UiNotice title={t('cm_content_blocking_settings_board_title_49')}>
              <p>
                {t('cm_content_blocking_settings_board_text_50')}
                {snapshot.status}{' '}
                {t('cm_content_blocking_settings_board_text_51')}
                {snapshot.revision}{' '}
                {t('cm_content_blocking_settings_board_text_52')}{' '}
                {snapshot.loadedRuleCount.toLocaleString()}{' '}
                {t('cm_content_blocking_settings_board_text_53')}
              </p>
            </UiNotice>
          </div>
        </div>
      </div>
    </UiDialog>
  );
}
