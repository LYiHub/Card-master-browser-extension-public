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
import { ContentBlockingFilterListsPanel } from './ContentBlockingFilterListsPanel';
import { ContentBlockingRulesPanel } from './ContentBlockingRulesPanel';
import { useContentBlockingBoard } from './useContentBlockingBoard';

const MAX_CONFIGURATION_FILE_BYTES = 32 * 1024 * 1024;

type ContentBlockingTab = 'general' | 'filters' | 'rules' | 'advanced';

const TABS = [
  { value: 'general', label: '常规' },
  { value: 'filters', label: '过滤列表' },
  { value: 'rules', label: '自定义规则' },
  { value: 'advanced', label: '高级' },
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
      <UiDialog ariaLabel="内容拦截设置" title="杀" onClose={onClose}>
        {status.error ? (
          <UiNotice
            tone="error"
            title="内容拦截设置读取失败"
            copyText={status.message}
          >
            <p>{status.message}</p>
          </UiNotice>
        ) : (
          <div className="manager-blocking-loading">
            <UiLoader large label="正在读取内容拦截设置" />
            <p>正在同步过滤列表、自定义规则与站点配置。</p>
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
    ? '内容拦截已停用'
    : site.filteringEnabled
      ? '当前网站已启用'
      : '当前网站已停用';

  const saveGeneralSettings = async () => {
    const wereRulesEnabled = view.rulesEnabled;
    const succeeded = await run(
      'save-general',
      () =>
        controller.saveGeneralSettings({
          rulesEnabled,
          allowlist: allowlist.split(/\r?\n/),
        }),
      '内容拦截常规设置已应用。',
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
      '自定义规则已保存。',
    );
    return succeeded ? saved : null;
  };

  const importConfiguration = async (file: File) => {
    if (file.size > MAX_CONFIGURATION_FILE_BYTES) {
      setStatus({ message: '配置文件超过 32 MB 上限。', error: true });
      return;
    }
    try {
      const source = await file.text();
      const succeeded = await run(
        'import-configuration',
        () => controller.importConfiguration(source),
        '完整内容拦截配置已导入。',
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
      ariaLabel="内容拦截设置"
      title="杀"
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
          label="内容拦截设置分类"
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
            label={`正在同步 ${activeOperations.size} 项内容拦截配置`}
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
                稍后刷新
              </UiButton>
              <UiButton
                variant="primary"
                onClick={() => window.location.reload()}
              >
                <RefreshCw size={14} aria-hidden="true" />
                刷新并恢复页面
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
                应用设置
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
                <strong>常规</strong>
                <span>控制过滤引擎总开关、站点白名单与当前运行状态。</span>
              </div>
            </header>

            {reloadRequired && (
              <UiNotice tone="warning" title="需要刷新当前页面">
                <p>规则已暂停；刷新后可恢复本页已经执行的过滤效果。</p>
              </UiNotice>
            )}

            <div className="manager-blocking-general-grid">
              <UiToggle
                label="内容过滤总开关"
                description="关闭后停止所有网站的内容过滤，但保留规则和列表配置。"
                checked={rulesEnabled}
                onChange={(enabled) => {
                  setRulesEnabled(enabled);
                  setGeneralDirty(true);
                }}
              />
              <UiNotice title={`当前站点：${site.hostname || '无法识别'}`}>
                <p>
                  {!snapshot.rulesEnabled
                    ? '内容过滤当前已全局停用。'
                    : site.filteringEnabled
                      ? '当前站点正在应用内容过滤规则。'
                      : '当前站点位于白名单中，内容过滤保持停用。'}
                </p>
              </UiNotice>
            </div>

            <div className="manager-blocking-summary">
              <div className="manager-blocking-summary__item">
                <span>引擎状态</span>
                <strong>{snapshot.status}</strong>
              </div>
              <div className="manager-blocking-summary__item">
                <span>{snapshot.rulesEnabled ? '生效规则' : '已载入规则'}</span>
                <strong>
                  {snapshot.rulesEnabled
                    ? snapshot.activeRuleCount
                    : snapshot.loadedRuleCount}
                </strong>
              </div>
              <div className="manager-blocking-summary__item">
                <span>过滤列表</span>
                <strong>{enabledFilterCount}</strong>
              </div>
              <div className="manager-blocking-summary__item">
                <span>自定义规则</span>
                <strong>{snapshot.userRuleCount}</strong>
              </div>
            </div>

            {diagnostics.length > 0 && (
              <UiNotice
                tone="error"
                title="过滤引擎诊断"
                copyText={diagnostics.join('\n')}
              >
                {diagnostics.map((diagnostic) => (
                  <p key={diagnostic}>{diagnostic}</p>
                ))}
              </UiNotice>
            )}

            <UiTextArea
              label="站点白名单"
              hint="每行一个域名；白名单中的站点不会应用内容过滤。"
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
                <strong>高级</strong>
                <span>迁移完整配置，并查看当前规则引擎的汇总信息。</span>
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
            <UiNotice title="完整配置归档">
              <p>
                配置文件包含总开关、过滤列表、自定义规则、订阅和站点白名单。
              </p>
              <div className="manager-blocking-archive-actions">
                <UiButton
                  disabled={settingsMutationBusy}
                  onClick={() => configurationInputRef.current?.click()}
                >
                  <Upload size={14} aria-hidden="true" />
                  导入完整配置
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
                      '完整内容拦截配置已导出。',
                    )
                  }
                >
                  <Download size={14} aria-hidden="true" />
                  导出完整配置
                </UiButton>
              </div>
            </UiNotice>
            <UiNotice title="引擎信息">
              <p>
                状态 {snapshot.status} · 修订 {snapshot.revision} · 已载入{' '}
                {snapshot.loadedRuleCount.toLocaleString()} 条规则
              </p>
            </UiNotice>
          </div>
        </div>
      </div>
    </UiDialog>
  );
}
