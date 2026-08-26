import {
  ArchiveRestore,
  Bot,
  Database,
  Download,
  Eraser,
  ExternalLink,
  FileUp,
  Gauge,
  Keyboard,
  type LucideIcon,
  Moon,
  Radio,
  RotateCcw,
  Save,
  Shield,
  Sparkles,
  Trash2,
  UserRoundCog,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  DiagnosticCopyButton,
  UiActionRow,
  UiButton,
  UiDialog,
  UiIconButton,
  UiLayeredCompactDialog,
  UiLoader,
  UiNotice,
  UiSegmentedControl,
  UiTextField,
  UiToggle,
} from '../../components/ui/Ui';
import type {
  DataManagementAction,
  DataManagementController,
} from '../../data-management/domain/types';
import { extensionTarget } from '../../hosts/extension/platform';
import {
  exportUserscriptLibrary,
  formatLibraryImportReport,
  importUserscriptLibrary,
  libraryArchiveFilename,
} from '../../userscript/application/library-transfer';
import type { ScriptRepository } from '../../userscript/application/script-repository';
import type { UserscriptSettingsController } from '../../userscript/application/settings';
import type { InstalledUserscript } from '../../userscript/domain/types';
import {
  DEFAULT_DECK_SHORTCUT,
  type DeckEntryController,
  type DeckEntrySettings,
  type DeckEntrySettingsMutation,
} from './deck-entry';

const SETTINGS_SECTIONS = [
  { value: 'interface', label: '牌阵入口' },
  { value: 'scripts', label: '脚本运行' },
  { value: 'library', label: '数据管理' },
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['value'];
type BusyState =
  | 'load'
  | 'save-scripts'
  | 'import'
  | 'export'
  | `data:${DataManagementAction}`
  | null;

type DataActionDefinition = {
  action: DataManagementAction;
  title: string;
  description: string;
  buttonLabel: string;
  icon: LucideIcon;
  danger?: boolean;
};

const DATA_ACTIONS: readonly DataActionDefinition[] = [
  {
    action: 'scripts',
    title: '删除所有脚本',
    description: '注销并删除全部用户脚本，同时清除这些脚本保存的 GM 数据。',
    buttonLabel: '删除脚本',
    icon: Trash2,
    danger: true,
  },
  {
    action: 'script-values',
    title: '清除所有脚本 GM 数据',
    description: '保留脚本本身，只清除脚本通过 GM 存储保存的本机数据。',
    buttonLabel: '清除数据',
    icon: Database,
  },
  {
    action: 'assistant-conversations',
    title: '清空所有智能体会话',
    description: '终止当前生成任务，删除历史消息，并创建一个新的空白会话。',
    buttonLabel: '清空会话',
    icon: Bot,
  },
  {
    action: 'assistant-config',
    title: '清除完整智能体配置',
    description: '清除模型服务、图像生成与语音识别的地址、模型和密钥配置。',
    buttonLabel: '清除配置',
    icon: UserRoundCog,
    danger: true,
  },
  {
    action: 'assistant-pins',
    title: '清除会话置顶',
    description: '清除智能体全部会话的置顶状态，不影响其他设置。',
    buttonLabel: '清除置顶',
    icon: Sparkles,
  },
  {
    action: 'content-blocking',
    title: '重置内容拦截',
    description: '恢复默认过滤列表，并清空自定义规则、订阅和站点白名单。',
    buttonLabel: '重置拦截',
    icon: Shield,
  },
  {
    action: 'page-theme',
    title: '重置暗夜降临',
    description: '恢复默认主题参数，并清空所有站点启用与停用规则。',
    buttonLabel: '重置暗夜',
    icon: Moon,
  },
  {
    action: 'media-speed',
    title: '重置媒体倍速',
    description: '恢复默认档位、轮盘选项、站点倍率和站点停用规则。',
    buttonLabel: '重置倍速',
    icon: Gauge,
  },
  {
    action: 'media-resources',
    title: '重置顺手牵羊',
    description: '清空所有标签页的媒体资源记录，并恢复默认发现状态。',
    buttonLabel: '重置资源',
    icon: Radio,
  },
  {
    action: 'gamepad-control',
    title: '重置手柄控制',
    description: '恢复默认按键映射、摇杆职责、控制手感和站点范围。',
    buttonLabel: '重置手柄',
    icon: Keyboard,
  },
  {
    action: 'bilibili-capabilities',
    title: '重置 B 站增强能力',
    description:
      '恢复流量探险家、合成大弹幕和绯红空降的设置，并清除未提交片段与临时缓存。',
    buttonLabel: '重置增强',
    icon: Sparkles,
  },
  {
    action: 'diagnostics',
    title: '清除诊断数据',
    description: '清除脚本运行时错误与命令状态快照，不影响脚本和设置。',
    buttonLabel: '清除诊断',
    icon: Eraser,
  },
];

const PREFERENCES_ACTION: DataActionDefinition = {
  action: 'preferences',
  title: '恢复默认偏好',
  description: '恢复牌阵入口显示与位置、脚本刷新和更新偏好，以及全局声音设置。',
  buttonLabel: '恢复默认',
  icon: RotateCcw,
};

const ALL_ACTION: DataActionDefinition = {
  action: 'reset-all',
  title: '恢复为全新安装状态',
  description:
    '删除所有脚本、脚本数据、智能体会话与配置，并重置内容拦截、暗夜降临、媒体倍速、手柄控制、B 站增强、诊断和全部偏好。',
  buttonLabel: '全部清空',
  icon: Trash2,
  danger: true,
};

function downloadArchive(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

export function SettingsBoard({
  repository,
  userscriptSettings,
  dataManagement,
  deckEntry,
  deckEntrySettings,
  onDeckEntrySettingsChange,
  reportError,
  onImportPrepare,
  onImportCancel,
  onClose,
}: {
  repository: ScriptRepository;
  userscriptSettings: UserscriptSettingsController;
  dataManagement: DataManagementController;
  deckEntry: DeckEntryController;
  deckEntrySettings: DeckEntrySettings;
  onDeckEntrySettingsChange: (
    mutation: DeckEntrySettingsMutation,
  ) => Promise<void>;
  reportError?: (
    scope: string,
    event: string,
    error: unknown,
    details?: Readonly<Record<string, unknown>>,
  ) => void;
  onImportPrepare?: (scripts: readonly InstalledUserscript[]) => string | null;
  onImportCancel?: (requestId: string) => void;
  onClose: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>('interface');
  const [reloadAfterScriptChange, setReloadAfterScriptChange] = useState(false);
  const [updateIntervalDays, setUpdateIntervalDays] = useState(1);
  const [updateEnabledOnly, setUpdateEnabledOnly] = useState(true);
  const [lastUpdateCheckAt, setLastUpdateCheckAt] = useState(0);
  const [deckShortcut, setDeckShortcut] = useState(DEFAULT_DECK_SHORTCUT);
  const [busy, setBusy] = useState<BusyState>('load');
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);
  const [errorCopyText, setErrorCopyText] = useState('');
  const [confirmation, setConfirmation] = useState<DataActionDefinition | null>(
    null,
  );
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void userscriptSettings.read().then(
      (settings) => {
        if (!active) return;
        setReloadAfterScriptChange(settings.reloadAfterScriptChange);
        setUpdateIntervalDays(settings.updateIntervalDays);
        setUpdateEnabledOnly(settings.updateEnabledOnly);
        setLastUpdateCheckAt(settings.lastUpdateCheckAt);
        setBusy(null);
      },
      (failure) => {
        if (!active) return;
        const message =
          failure instanceof Error ? failure.message : String(failure);
        setStatus(message);
        setError(true);
        setErrorCopyText(message);
        setBusy(null);
      },
    );
    return () => {
      active = false;
    };
  }, [userscriptSettings]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void deckEntry.readShortcut().then(
        (state) => {
          if (active) setDeckShortcut(state.shortcut);
        },
        () => {
          if (active) setDeckShortcut('');
        },
      );
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [deckEntry]);

  const saveUserscriptSettings = async () => {
    setBusy('save-scripts');
    setStatus('');
    setErrorCopyText('');
    try {
      const settings = await userscriptSettings.write({
        reloadAfterScriptChange,
        updateIntervalDays,
        updateEnabledOnly,
      });
      setReloadAfterScriptChange(settings.reloadAfterScriptChange);
      setUpdateIntervalDays(settings.updateIntervalDays);
      setUpdateEnabledOnly(settings.updateEnabledOnly);
      setLastUpdateCheckAt(settings.lastUpdateCheckAt);
      setStatus(
        settings.updateIntervalDays === 0
          ? '自动检查脚本更新已关闭。'
          : `脚本设置已保存，更新将每 ${settings.updateIntervalDays} 天检查一次。`,
      );
      setError(false);
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : String(failure);
      setStatus(message);
      setError(true);
      setErrorCopyText(message);
    } finally {
      setBusy(null);
    }
  };

  const openShortcutSettings = async () => {
    try {
      await deckEntry.openShortcutSettings();
      setStatus('已打开浏览器扩展快捷键页面。修改后返回即可刷新显示。');
      setError(false);
      setErrorCopyText('');
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : String(failure);
      setStatus(message);
      setError(true);
      setErrorCopyText(message);
    }
  };

  const exportLibrary = async () => {
    setBusy('export');
    setStatus('');
    setErrorCopyText('');
    const startedAt = performance.now();
    try {
      const scripts = await repository.list();
      downloadArchive(
        exportUserscriptLibrary(scripts),
        libraryArchiveFilename(),
      );
      setStatus(
        `已导出 ${scripts.length} 张用户脚本。系统内置卡牌与能力设置不会写入脚本归档。`,
      );
      setError(false);
    } catch (failure) {
      reportError?.('library-transfer', 'export-failed', failure, {
        durationMs: Math.round(performance.now() - startedAt),
      });
      const message =
        failure instanceof Error ? failure.message : String(failure);
      setStatus(message);
      setError(true);
      setErrorCopyText(message);
    } finally {
      setBusy(null);
    }
  };

  const importLibrary = async (file: File) => {
    setBusy('import');
    setStatus('正在读取并校验归档…');
    setErrorCopyText('');
    const startedAt = performance.now();
    let presentationRequestId: string | null = null;
    let closingAfterImport = false;
    try {
      const current = await repository.list();
      const currentIds = new Set(current.map((script) => script.id));
      const result = await importUserscriptLibrary(file, current);
      const importedScripts = result.scripts.filter(
        (script) => !currentIds.has(script.id),
      );
      if (result.installed > 0) {
        presentationRequestId = onImportPrepare?.(importedScripts) ?? null;
        setStatus(`校验完成，正在提交 ${result.installed} 张新脚本…`);
        await repository.replaceAll(result.scripts);
      }
      const summary = [
        `${result.installed} 张新增`,
        `${result.skipped.length} 张重复跳过`,
        ...(result.rejected.length > 0
          ? [`${result.rejected.length} 张未导入`]
          : []),
      ].join(' · ');
      setStatus(
        result.rejected[0]
          ? `${summary}。${result.rejected[0].path}：${result.rejected[0].reason}`
          : summary,
      );
      setError(result.rejected.length > 0);
      setErrorCopyText(
        result.rejected.length > 0
          ? formatLibraryImportReport(file.name, result)
          : '',
      );
      if (importedScripts.length > 0) {
        closingAfterImport = true;
        onClose();
      }
    } catch (failure) {
      if (presentationRequestId) onImportCancel?.(presentationRequestId);
      reportError?.('library-transfer', 'import-failed', failure, {
        fileName: file.name,
        fileSize: file.size,
        durationMs: Math.round(performance.now() - startedAt),
      });
      const message =
        failure instanceof Error ? failure.message : String(failure);
      setStatus(message);
      setError(true);
      setErrorCopyText(`导入文件：${file.name}\n${message}`);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
      if (!closingAfterImport) setBusy(null);
    }
  };

  const runDataAction = async (action: DataManagementAction) => {
    setBusy(`data:${action}`);
    setStatus('');
    setErrorCopyText('');
    try {
      const result = await dataManagement.run(action);
      if (action === 'preferences' || action === 'reset-all') {
        const settings = await userscriptSettings.read();
        setReloadAfterScriptChange(settings.reloadAfterScriptChange);
        setUpdateIntervalDays(settings.updateIntervalDays);
        setUpdateEnabledOnly(settings.updateEnabledOnly);
        setLastUpdateCheckAt(settings.lastUpdateCheckAt);
      }
      setStatus(result.message);
      setError(result.status === 'partial');
      setErrorCopyText(
        result.status === 'partial'
          ? (result.steps ?? [])
              .map(
                (step) =>
                  `${step.status === 'completed' ? '完成' : '失败'} · ${step.action} · ${step.message}`,
              )
              .join('\n')
          : '',
      );
      setConfirmationOpen(false);
      if (action === 'reset-all') setSection('interface');
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : String(failure);
      setStatus(message);
      setError(true);
      setErrorCopyText(message);
    } finally {
      setBusy(null);
    }
  };

  const requestDataAction = (definition: DataActionDefinition) => {
    setConfirmation(definition);
    setConfirmationOpen(true);
  };

  const closeConfirmation = () => {
    if (busy !== null) return;
    setConfirmationOpen(false);
  };

  const shortcutKeys = deckShortcut
    .split('+')
    .map((key) => key.trim())
    .filter(Boolean);

  const importing = busy === 'import';
  const requestClose = () => {
    if (importing) return;
    onClose();
  };

  return (
    <>
      <UiDialog
        ariaLabel="全局设置"
        title="设置"
        className={`manager-settings-dialog${importing ? ' is-importing' : ''}`}
        onClose={requestClose}
        navigation={
          importing ? undefined : (
            <UiSegmentedControl
              label="设置分类"
              className="manager-settings-sections"
              value={section}
              options={SETTINGS_SECTIONS}
              onChange={(value) => {
                setSection(value);
                setStatus('');
                setError(false);
                setErrorCopyText('');
              }}
            />
          )
        }
        footer={
          importing ? undefined : section === 'scripts' ? (
            <>
              <div className="manager-system-status">
                <div className="manager-system-status__message">
                  <p className={error ? 'is-error' : ''}>{status}</p>
                  {error && errorCopyText && (
                    <DiagnosticCopyButton text={errorCopyText} />
                  )}
                </div>
              </div>
              <UiButton
                variant="primary"
                disabled={busy !== null}
                onClick={() => void saveUserscriptSettings()}
              >
                <Save size={14} aria-hidden="true" />
                {busy === 'save-scripts' ? '正在保存' : '保存脚本设置'}
              </UiButton>
            </>
          ) : (
            <div className="manager-system-status">
              <div className="manager-system-status__message">
                <p className={error ? 'is-error' : ''}>{status}</p>
                {error && errorCopyText && (
                  <DiagnosticCopyButton text={errorCopyText} />
                )}
              </div>
            </div>
          )
        }
      >
        {importing ? (
          <div
            className="manager-library-import-loader"
            data-dialog-close-blocked="true"
            role="status"
            aria-live="polite"
          >
            <UiLoader large label={status || '正在导入脚本'} />
            <p>正在校验并写入脚本牌库，请保持当前页面打开。</p>
          </div>
        ) : section === 'interface' ? (
          <section className="manager-settings-panel">
            <UiToggle
              label="显示页面牌库入口"
              description="开启后在网页与新标签页显示可拖动的卡牌大师 Logo；点击可展开牌阵。关闭后仍可使用扩展栏图标或快捷键。"
              checked={deckEntrySettings.showDeckTrigger}
              onChange={(showDeckTrigger) =>
                void onDeckEntrySettingsChange({
                  kind: 'set-trigger-visible',
                  visible: showDeckTrigger,
                })
              }
            />
            <UiToggle
              label="扩展栏显示激活卡牌数量"
              description="仅控制浏览器扩展栏图标上的数字，图标本身始终保持不变。"
              checked={deckEntrySettings.showToolbarBadge}
              onChange={(visible) =>
                void onDeckEntrySettingsChange({
                  kind: 'set-toolbar-badge-visible',
                  visible,
                })
              }
            />
            <UiToggle
              label="页面入口显示激活卡牌数量"
              description="仅控制网页与新标签页中卡牌大师 Logo 右上角的数字。"
              checked={deckEntrySettings.showDeckTriggerBadge}
              onChange={(visible) =>
                void onDeckEntrySettingsChange({
                  kind: 'set-trigger-badge-visible',
                  visible,
                })
              }
            />
            {deckEntry.shortcutSettingsAvailable() ? (
              <UiActionRow
                icon={<Keyboard size={18} aria-hidden="true" />}
                title="牌阵快捷键"
                description={
                  shortcutKeys.length > 0 ? (
                    <span className="manager-shortcut-keys">
                      {shortcutKeys.map((key, index) => (
                        <span key={key}>
                          {index > 0 && <i aria-hidden="true">+</i>}
                          <kbd>{key}</kbd>
                        </span>
                      ))}
                    </span>
                  ) : (
                    '未设置'
                  )
                }
                actions={
                  <UiIconButton
                    label="在浏览器中配置牌阵快捷键"
                    onClick={() => void openShortcutSettings()}
                  >
                    <ExternalLink size={15} aria-hidden="true" />
                  </UiIconButton>
                }
              />
            ) : null}
          </section>
        ) : section === 'scripts' ? (
          <section className="manager-settings-panel">
            <UiToggle
              label="脚本变更后刷新当前页面"
              description="脚本会先立即注入；开启后，再刷新当前页面以重新经历完整加载流程。"
              checked={reloadAfterScriptChange}
              onChange={setReloadAfterScriptChange}
            />
            <UiNotice title="自动检查脚本更新">
              <p>
                定期读取脚本声明的 `@updateURL` 或
                `@downloadURL`。每张卡牌自己的“检查更新”开关仍然优先生效。
              </p>
            </UiNotice>
            <UiTextField
              label="检查间隔（天）"
              type="number"
              min={0}
              max={365}
              step={1}
              value={String(updateIntervalDays)}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                setUpdateIntervalDays(
                  Number.isFinite(value)
                    ? Math.min(365, Math.max(0, value))
                    : 0,
                );
              }}
            />
            <UiToggle
              label="只检查已启用脚本"
              description="关闭后也会检查当前处于停用状态、且允许检查更新的脚本。"
              checked={updateEnabledOnly}
              onChange={setUpdateEnabledOnly}
            />
            <UiNotice title="检查状态">
              <p>
                {lastUpdateCheckAt > 0
                  ? `上次检查：${new Date(lastUpdateCheckAt).toLocaleString('zh-CN', { hour12: false })}`
                  : '尚未执行自动检查。设置为 0 天可以关闭此功能。'}
              </p>
            </UiNotice>
          </section>
        ) : (
          <section className="manager-settings-panel manager-data-management">
            <section className="manager-data-section">
              <header className="manager-data-section__heading">
                <strong>备份与恢复</strong>
                <p>在进行破坏性清理前，可以先导出全部用户脚本。</p>
              </header>
              <UiNotice
                icon={<ArchiveRestore size={18} aria-hidden="true" />}
                title="脚本卡牌归档"
              >
                <p>
                  导出标准 ZIP 与完整 `.user.js`。归档只包含
                  用户脚本，不包含系统内置卡牌及其能力设置。
                </p>
              </UiNotice>
              <div className="manager-library-transfer__actions">
                <UiButton
                  disabled={busy !== null}
                  onClick={() => importInputRef.current?.click()}
                >
                  <FileUp size={16} aria-hidden="true" />
                  导入脚本
                </UiButton>
                <UiButton
                  variant="primary"
                  disabled={busy !== null}
                  onClick={() => void exportLibrary()}
                >
                  <Download size={16} aria-hidden="true" />
                  {busy === 'export' ? '正在导出' : '导出全部'}
                </UiButton>
              </div>
            </section>
            <input
              ref={importInputRef}
              type="file"
              hidden
              accept=".zip,.user.js,application/zip,text/javascript"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importLibrary(file);
              }}
            />

            <section className="manager-data-section">
              <header className="manager-data-section__heading">
                <strong>恢复默认偏好</strong>
                <p>只恢复使用偏好，不删除脚本、站点规则、会话或凭据。</p>
              </header>
              <DataActionRow
                definition={PREFERENCES_ACTION}
                busy={busy}
                onRequest={requestDataAction}
              />
            </section>

            <section className="manager-data-section">
              <header className="manager-data-section__heading">
                <strong>分类清理</strong>
                <p>每项操作彼此独立，并在执行前再次确认。</p>
              </header>
              <div className="manager-data-list">
                {DATA_ACTIONS.filter(
                  (definition) =>
                    definition.action !== 'media-resources' ||
                    extensionTarget() !== 'safari',
                ).map((definition) => (
                  <DataActionRow
                    key={definition.action}
                    definition={definition}
                    busy={busy}
                    onRequest={requestDataAction}
                  />
                ))}
              </div>
            </section>

            <section className="manager-data-section is-danger">
              <header className="manager-data-section__heading">
                <strong>危险区域</strong>
                <p>恢复后无法撤销，浏览器扩展快捷键不会被更改。</p>
              </header>
              <DataActionRow
                definition={ALL_ACTION}
                busy={busy}
                onRequest={requestDataAction}
              />
            </section>
          </section>
        )}
      </UiDialog>
      {confirmation && (
        <UiLayeredCompactDialog
          open={confirmationOpen}
          ariaLabel={`确认${confirmation.title}`}
          title={confirmation.title}
          onClose={closeConfirmation}
          onExitComplete={() => {
            setConfirmation(null);
          }}
          footer={
            <>
              <UiButton disabled={busy !== null} onClick={closeConfirmation}>
                取消
              </UiButton>
              <UiButton
                variant={confirmation.danger ? 'danger' : 'primary'}
                disabled={busy !== null}
                onClick={() => void runDataAction(confirmation.action)}
              >
                {busy === `data:${confirmation.action}`
                  ? '正在处理'
                  : confirmation.buttonLabel}
              </UiButton>
            </>
          }
        >
          <div className="manager-data-confirmation">
            <UiNotice
              tone={confirmation.danger ? 'warning' : 'info'}
              title="请确认操作范围"
            >
              <p>{confirmation.description}</p>
            </UiNotice>
            {confirmation.action === 'reset-all' && (
              <UiButton
                disabled={busy !== null}
                onClick={() => void exportLibrary()}
              >
                <Download size={16} aria-hidden="true" />
                先导出全部脚本
              </UiButton>
            )}
          </div>
        </UiLayeredCompactDialog>
      )}
    </>
  );
}

function DataActionRow({
  definition,
  busy,
  onRequest,
}: {
  definition: DataActionDefinition;
  busy: BusyState;
  onRequest: (definition: DataActionDefinition) => void;
}) {
  const Icon = definition.icon;
  return (
    <UiActionRow
      icon={<Icon size={18} aria-hidden="true" />}
      title={definition.title}
      description={definition.description}
      tone={definition.danger ? 'danger' : 'neutral'}
      actions={
        <UiButton
          variant={definition.danger ? 'danger' : 'secondary'}
          disabled={busy !== null}
          onClick={() => onRequest(definition)}
        >
          {definition.buttonLabel}
        </UiButton>
      }
    />
  );
}
