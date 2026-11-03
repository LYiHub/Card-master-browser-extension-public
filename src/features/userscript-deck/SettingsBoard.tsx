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
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { detectBrowserEnvironment } from '../../hosts/extension/browser-detection';
import { extensionTarget } from '../../hosts/extension/platform';
import { getLocale } from '../../localization/locale';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import type {
  SyncCommand,
  SyncController,
  SyncSnapshot,
} from '../../sync/model';
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
import { LanguageSettings } from './LanguageSettings';

const SETTINGS_SECTIONS = [
  {
    value: 'interface',
    get label() {
      return t('cm_settings_board_label_1');
    },
  },
  {
    value: 'scripts',
    get label() {
      return t('cm_settings_board_label_2');
    },
  },
  {
    value: 'library',
    get label() {
      return t('cm_settings_board_label_3');
    },
  },
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
    get title() {
      return t('cm_settings_board_title_4');
    },
    get description() {
      return t('cm_settings_board_description_5');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_6');
    },
    icon: Trash2,
    danger: true,
  },
  {
    action: 'script-values',
    get title() {
      return t('cm_settings_board_title_7');
    },
    get description() {
      return t('cm_settings_board_description_8');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_9');
    },
    icon: Database,
  },
  {
    action: 'assistant-conversations',
    get title() {
      return t('cm_settings_board_title_10');
    },
    get description() {
      return t('cm_settings_board_description_11');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_12');
    },
    icon: Bot,
  },
  {
    action: 'assistant-config',
    get title() {
      return t('cm_settings_board_title_13');
    },
    get description() {
      return t('cm_settings_board_description_14');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_15');
    },
    icon: UserRoundCog,
    danger: true,
  },
  {
    action: 'assistant-pins',
    get title() {
      return t('cm_settings_board_title_16');
    },
    get description() {
      return t('cm_settings_board_description_17');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_18');
    },
    icon: Sparkles,
  },
  {
    action: 'content-blocking',
    get title() {
      return t('cm_settings_board_title_19');
    },
    get description() {
      return t('cm_settings_board_description_20');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_21');
    },
    icon: Shield,
  },
  {
    action: 'page-theme',
    get title() {
      return t('cm_settings_board_title_22');
    },
    get description() {
      return t('cm_settings_board_description_23');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_24');
    },
    icon: Moon,
  },
  {
    action: 'media-speed',
    get title() {
      return t('cm_settings_board_title_25');
    },
    get description() {
      return t('cm_settings_board_description_26');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_27');
    },
    icon: Gauge,
  },
  {
    action: 'media-resources',
    get title() {
      return t('cm_settings_board_title_28');
    },
    get description() {
      return t('cm_settings_board_description_29');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_30');
    },
    icon: Radio,
  },
  {
    action: 'gamepad-control',
    get title() {
      return t('cm_settings_board_title_31');
    },
    get description() {
      return t('cm_settings_board_description_32');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_33');
    },
    icon: Keyboard,
  },
  {
    action: 'bilibili-capabilities',
    get title() {
      return t('cm_settings_board_title_34');
    },
    get description() {
      return t('cm_settings_board_description_35');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_36');
    },
    icon: Sparkles,
  },
  {
    action: 'diagnostics',
    get title() {
      return t('cm_settings_board_title_37');
    },
    get description() {
      return t('cm_settings_board_description_38');
    },
    get buttonLabel() {
      return t('cm_settings_board_button_label_39');
    },
    icon: Eraser,
  },
];

const PREFERENCES_ACTION: DataActionDefinition = {
  action: 'preferences',
  get title() {
    return t('cm_settings_board_title_40');
  },
  get description() {
    return t('cm_settings_board_description_41');
  },
  get buttonLabel() {
    return t('cm_settings_board_button_label_42');
  },
  icon: RotateCcw,
};

const ALL_ACTION: DataActionDefinition = {
  action: 'reset-all',
  get title() {
    return t('cm_settings_board_title_43');
  },
  get description() {
    return t('cm_settings_board_description_44');
  },
  get buttonLabel() {
    return t('cm_settings_board_button_label_45');
  },
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

function SyncSettings({ controller }: { controller: SyncController }) {
  useLocale();

  const [snapshot, setSnapshot] = useState<SyncSnapshot | null>(null);
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const request = async (command: SyncCommand) => {
    setBusy(true);
    setError('');
    try {
      const next = await controller.request(command);
      setSnapshot(next);
      setChoices({});
      if (next.status === 'error') setError(next.message);
      if (next.connected) setPassword('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    setBusy(true);
    const refresh = () =>
      controller.request({ type: 'read' }).then(
        (value) => {
          if (active) setSnapshot(value);
        },
        (failure) => {
          if (active)
            setError(
              failure instanceof Error ? failure.message : String(failure),
            );
        },
      );
    void refresh().finally(() => {
      if (active) setBusy(false);
    });
    const timer = window.setInterval(refresh, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [controller]);

  const connected = snapshot?.connected === true;
  const conflicts =
    snapshot?.preview?.changes.filter((change) => change.kind === 'conflict') ??
    [];
  return (
    <section className="manager-data-section manager-sync" aria-busy={busy}>
      <header className="manager-data-section__heading">
        <strong>{t('cm_settings_board_text_46')}</strong>
        <p>{t('cm_settings_board_text_47')}</p>
      </header>
      {!connected && !snapshot?.preview ? (
        <>
          <label className="manager-sync-field">
            {t('cm_settings_board_text_48')}
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/dav/"
            />
          </label>
          <label className="manager-sync-field">
            {t('cm_settings_board_text_49')}
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="manager-sync-field">
            {t('cm_settings_board_text_50')}
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          <UiButton
            variant="primary"
            disabled={busy || !url || !username || !password}
            onClick={() =>
              void request({
                type: 'preview',
                connection: { url, username, password },
              })
            }
          >
            {busy
              ? t('cm_settings_board_text_51')
              : t('cm_settings_board_text_52')}
          </UiButton>
        </>
      ) : (
        <>
          <UiNotice title={snapshot?.message || t('cm_settings_board_text_53')}>
            <p>
              {t('cm_settings_board_text_54')}
              {snapshot?.directory}
            </p>
            {snapshot?.lastSyncedAt ? (
              <p>
                {t('cm_settings_board_text_55')}
                {new Date(snapshot.lastSyncedAt).toLocaleString(getLocale(), {
                  hour12: false,
                })}
              </p>
            ) : null}
          </UiNotice>
          {snapshot?.preview ? (
            <div className="manager-sync-conflicts" key={snapshot.preview.id}>
              <strong>
                {snapshot.preview.restore
                  ? t('cm_settings_board_text_56')
                  : t('cm_settings_board_text_57')}
              </strong>
              <p>
                {snapshot.preview.changes.length}{' '}
                {t('cm_settings_board_text_58')}
                {conflicts.length} {t('cm_settings_board_text_59')}
              </p>
              {snapshot.preview.changes
                .filter((change) => change.kind !== 'conflict')
                .map((change) => (
                  <p key={change.key}>
                    {change.name} ·{' '}
                    {change.kind === 'add'
                      ? t('cm_settings_board_text_60')
                      : change.kind === 'delete'
                        ? t('cm_settings_board_text_61')
                        : t('cm_settings_board_text_62')}
                  </p>
                ))}
              {conflicts.map((change) => (
                <div key={change.key} className="manager-sync-conflict">
                  <strong>{change.name}</strong>
                  <div className="manager-sync-comparison">
                    <section aria-label={t('cm_settings_board_aria_label_63')}>
                      <strong>{t('cm_settings_board_text_64')}</strong>
                      <pre>
                        {change.local
                          ? JSON.stringify(change.local.value, null, 2)
                          : t('cm_settings_board_text_65')}
                      </pre>
                    </section>
                    {!change.alternatives && (
                      <section
                        aria-label={t('cm_settings_board_aria_label_66')}
                      >
                        <strong>{t('cm_settings_board_text_67')}</strong>
                        <pre>
                          {change.remote
                            ? JSON.stringify(change.remote.value, null, 2)
                            : t('cm_settings_board_text_68')}
                        </pre>
                      </section>
                    )}
                    {change.alternatives?.map((alternative) => (
                      <section
                        key={alternative.id}
                        aria-label={alternative.label}
                      >
                        <strong>{alternative.label}</strong>
                        <pre>
                          {alternative.entry
                            ? JSON.stringify(alternative.entry.value, null, 2)
                            : t('cm_settings_board_text_69')}
                        </pre>
                      </section>
                    ))}
                  </div>
                  <select
                    aria-label={t('cm_settings_board_text_70', [
                      String(change.name),
                    ])}
                    value={choices[change.key] ?? ''}
                    onChange={(event) =>
                      setChoices((current) => ({
                        ...current,
                        [change.key]: event.target.value,
                      }))
                    }
                  >
                    <option value="">{t('cm_settings_board_text_71')}</option>
                    <option value="local">
                      {t('cm_settings_board_text_72')}
                    </option>
                    {change.alternatives ? (
                      change.alternatives.map((alternative) => (
                        <option key={alternative.id} value={alternative.id}>
                          {alternative.label}
                        </option>
                      ))
                    ) : (
                      <option value="remote">
                        {t('cm_settings_board_text_73')}
                      </option>
                    )}
                  </select>
                </div>
              ))}
              <UiButton
                variant="primary"
                disabled={
                  busy || conflicts.some((change) => !choices[change.key])
                }
                onClick={() =>
                  void request({
                    type: 'confirm',
                    previewId: snapshot?.preview?.id ?? '',
                    choices,
                  })
                }
              >
                {snapshot.preview.restore
                  ? t('cm_settings_board_text_74')
                  : t('cm_settings_board_text_75')}
              </UiButton>
              <UiButton
                disabled={busy}
                onClick={() => void request({ type: 'cancel' })}
              >
                {t('cm_settings_board_text_76')}
              </UiButton>
            </div>
          ) : null}
          {snapshot?.history.length ? (
            <div className="manager-sync-history">
              <strong>{t('cm_settings_board_text_77')}</strong>
              {snapshot.history.map((version) => (
                <UiButton
                  key={version.id}
                  disabled={busy}
                  onClick={() =>
                    void request({ type: 'restore', versionId: version.id })
                  }
                >
                  {t('cm_settings_board_text_78')}{' '}
                  {new Date(version.at).toLocaleString(getLocale(), {
                    hour12: false,
                  })}
                </UiButton>
              ))}
            </div>
          ) : null}
          <div className="manager-sync-actions">
            <UiButton
              disabled={busy || !connected || Boolean(snapshot?.preview)}
              onClick={() => void request({ type: 'run' })}
            >
              {busy
                ? t('cm_settings_board_text_79')
                : t('cm_settings_board_text_80')}
            </UiButton>
            <UiButton
              disabled={busy}
              onClick={() => void request({ type: 'disconnect' })}
            >
              {t('cm_settings_board_text_81')}
            </UiButton>
          </div>
        </>
      )}
      {error ? <p className="is-error">{error}</p> : null}
      {Boolean(snapshot?.diagnostics.length) && (
        <div className="manager-sync-history">
          <strong>{t('cm_settings_board_text_82')}</strong>
          <pre>{snapshot?.diagnostics.join('\n')}</pre>
          <DiagnosticCopyButton text={snapshot?.diagnostics.join('\n') ?? ''} />
        </div>
      )}
    </section>
  );
}

export function SettingsBoard({
  initialSection = 'interface',
  repository,
  userscriptSettings,
  dataManagement,
  sync,
  deckEntry,
  deckEntrySettings,
  onDeckEntrySettingsChange,
  reportError,
  onImportPrepare,
  onImportCancel,
  onClose,
}: {
  initialSection?: SettingsSection;
  repository: ScriptRepository;
  userscriptSettings: UserscriptSettingsController;
  dataManagement: DataManagementController;
  sync?: SyncController;
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
  useLocale();

  const browserInfo = useMemo(() => detectBrowserEnvironment(), []);
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [reloadAfterScriptChange, setReloadAfterScriptChange] = useState(false);
  const [updateIntervalDays, setUpdateIntervalDays] = useState(1);
  const [updateEnabledOnly, setUpdateEnabledOnly] = useState(true);
  const [lastUpdateCheckAt, setLastUpdateCheckAt] = useState(0);
  const [assistantPanelMode, setAssistantPanelMode] = useState<
    'sidePanel' | 'popup'
  >(() => browserInfo.recommendedPanelMode);
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
        if (
          browserInfo.recommendedPanelMode === 'popup' &&
          settings.assistantPanelMode !== 'popup'
        ) {
          setAssistantPanelMode('popup');
          void userscriptSettings
            .write({
              ...settings,
              assistantPanelMode: 'popup',
            })
            .catch((err) => {
              console.warn(
                '[CardMaster:Settings] Failed to auto-persist recommended popup mode:',
                err,
              );
            });
        } else {
          setAssistantPanelMode(settings.assistantPanelMode);
        }
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
  }, [userscriptSettings, browserInfo]);

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
        assistantPanelMode,
      });
      setReloadAfterScriptChange(settings.reloadAfterScriptChange);
      setUpdateIntervalDays(settings.updateIntervalDays);
      setUpdateEnabledOnly(settings.updateEnabledOnly);
      setLastUpdateCheckAt(settings.lastUpdateCheckAt);
      setAssistantPanelMode(settings.assistantPanelMode);
      setStatus(
        settings.updateIntervalDays === 0
          ? t('cm_settings_board_text_83')
          : t('cm_settings_board_text_84', [
              String(settings.updateIntervalDays),
            ]),
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
      setStatus(t('cm_settings_board_text_85'));
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
      setStatus(t('cm_settings_board_text_86', [String(scripts.length)]));
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
    setStatus(t('cm_settings_board_text_87'));
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
        setStatus(t('cm_settings_board_text_88', [String(result.installed)]));
        await repository.replaceAll(result.scripts);
      }
      const summary = [
        t('cm_settings_board_text_89', [String(result.installed)]),
        t('cm_settings_board_text_90', [String(result.skipped.length)]),
        ...(result.rejected.length > 0
          ? [t('cm_settings_board_text_91', [String(result.rejected.length)])]
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
      setErrorCopyText(
        t('cm_settings_board_text_92', [String(file.name), String(message)]),
      );
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
        if (
          browserInfo.recommendedPanelMode === 'popup' &&
          settings.assistantPanelMode !== 'popup'
        ) {
          setAssistantPanelMode('popup');
          void userscriptSettings.write({
            ...settings,
            assistantPanelMode: 'popup',
          });
        } else {
          setAssistantPanelMode(settings.assistantPanelMode);
        }
      }
      setStatus(result.message);
      setError(result.status === 'partial');
      setErrorCopyText(
        result.status === 'partial'
          ? (result.steps ?? [])
              .map(
                (step) =>
                  `${step.status === 'completed' ? t('cm_settings_board_text_93') : t('cm_settings_board_text_94')} · ${step.action} · ${step.message}`,
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
        ariaLabel={t('cm_settings_board_aria_label_95')}
        title={t('cm_settings_board_title_96')}
        className={`manager-settings-dialog${importing ? ' is-importing' : ''}`}
        onClose={requestClose}
        navigation={
          importing ? undefined : (
            <UiSegmentedControl
              label={t('cm_settings_board_label_97')}
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
                {busy === 'save-scripts'
                  ? t('cm_settings_board_text_98')
                  : t('cm_settings_board_text_99')}
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
            <UiLoader large label={status || t('cm_settings_board_text_100')} />
            <p>{t('cm_settings_board_text_101')}</p>
          </div>
        ) : section === 'interface' ? (
          <section className="manager-settings-panel">
            <LanguageSettings />
            <UiToggle
              label={t('cm_settings_board_label_102')}
              description={t('cm_settings_board_description_103')}
              checked={deckEntrySettings.showDeckTrigger}
              onChange={(showDeckTrigger) =>
                void onDeckEntrySettingsChange({
                  kind: 'set-trigger-visible',
                  visible: showDeckTrigger,
                })
              }
            />
            <UiToggle
              label={t('cm_settings_board_label_104')}
              description={t('cm_settings_board_description_105')}
              checked={deckEntrySettings.autoHideInFullscreen}
              onChange={(enabled) =>
                void onDeckEntrySettingsChange({
                  kind: 'set-fullscreen-auto-hide',
                  enabled,
                })
              }
            />
            <UiToggle
              label={t('cm_settings_board_label_106')}
              description={t('cm_settings_board_description_107')}
              checked={deckEntrySettings.showToolbarBadge}
              onChange={(visible) =>
                void onDeckEntrySettingsChange({
                  kind: 'set-toolbar-badge-visible',
                  visible,
                })
              }
            />
            <UiToggle
              label={t('cm_settings_board_label_108')}
              description={t('cm_settings_board_description_109')}
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
                title={t('cm_settings_board_title_110')}
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
                    t('cm_settings_board_text_111')
                  )
                }
                actions={
                  <UiIconButton
                    label={t('cm_settings_board_label_112')}
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
              label={t('cm_settings_board_label_113')}
              description={t('cm_settings_board_description_114')}
              checked={reloadAfterScriptChange}
              onChange={setReloadAfterScriptChange}
            />
            <UiNotice title={t('cm_settings_board_title_115')}>
              <p>{t('cm_settings_board_text_116')}</p>
            </UiNotice>
            <UiTextField
              label={t('cm_settings_board_label_117')}
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
              label={t('cm_settings_board_label_118')}
              description={t('cm_settings_board_description_119')}
              checked={updateEnabledOnly}
              onChange={setUpdateEnabledOnly}
            />
            <div className="manager-browser-notice">
              <div className="manager-browser-notice-header">
                <span className="manager-browser-badge">
                  {t('cm_settings_board_text_120')}
                </span>
                <span className="manager-browser-name">
                  {browserInfo.displayName}
                </span>
                <span
                  className={`manager-browser-mode-tag ${assistantPanelMode === 'popup' ? 'is-popup' : 'is-sidepanel'}`}
                >
                  {assistantPanelMode === 'popup'
                    ? t('cm_settings_board_text_121')
                    : t('cm_settings_board_text_122')}
                </span>
              </div>
              <p className="manager-browser-notice-description">
                {browserInfo.statusNotice}
              </p>
            </div>
            <UiToggle
              label={t('cm_settings_board_label_123')}
              description={
                browserInfo.brand === 'arc'
                  ? t('cm_settings_board_text_124')
                  : t('cm_settings_board_text_125')
              }
              checked={assistantPanelMode === 'popup'}
              onChange={(checked) => {
                const nextMode = checked ? 'popup' : 'sidePanel';
                console.log(
                  '[CardMaster:Settings] assistantPanelMode toggle changed to:',
                  nextMode,
                );
                setAssistantPanelMode(nextMode);
                if (
                  typeof userscriptSettings?.read === 'function' &&
                  typeof userscriptSettings?.write === 'function'
                ) {
                  void (async () => {
                    try {
                      const current = await userscriptSettings.read();
                      await userscriptSettings.write({
                        ...current,
                        assistantPanelMode: nextMode,
                      });
                      console.log(
                        '[CardMaster:Settings] assistantPanelMode auto-persisted immediately:',
                        nextMode,
                      );
                    } catch (err) {
                      console.warn(
                        '[CardMaster:Settings] Auto-persist failed, will save on manual submit:',
                        err,
                      );
                    }
                  })();
                }
              }}
            />
            <UiNotice title={t('cm_settings_board_title_126')}>
              <p>
                {lastUpdateCheckAt > 0
                  ? t('cm_settings_board_text_127', [
                      String(
                        new Date(lastUpdateCheckAt).toLocaleString(
                          getLocale(),
                          {
                            hour12: false,
                          },
                        ),
                      ),
                    ])
                  : t('cm_settings_board_text_128')}
              </p>
            </UiNotice>
          </section>
        ) : (
          <section className="manager-settings-panel manager-data-management">
            {sync ? <SyncSettings controller={sync} /> : null}
            <section className="manager-data-section">
              <header className="manager-data-section__heading">
                <strong>{t('cm_settings_board_text_129')}</strong>
                <p>{t('cm_settings_board_text_130')}</p>
              </header>
              <UiNotice
                icon={<ArchiveRestore size={18} aria-hidden="true" />}
                title={t('cm_settings_board_title_131')}
              >
                <p>{t('cm_settings_board_text_132')}</p>
              </UiNotice>
              <div className="manager-library-transfer__actions">
                <UiButton
                  disabled={busy !== null}
                  onClick={() => importInputRef.current?.click()}
                >
                  <FileUp size={16} aria-hidden="true" />
                  {t('cm_settings_board_text_133')}
                </UiButton>
                <UiButton
                  variant="primary"
                  disabled={busy !== null}
                  onClick={() => void exportLibrary()}
                >
                  <Download size={16} aria-hidden="true" />
                  {busy === 'export'
                    ? t('cm_settings_board_text_134')
                    : t('cm_settings_board_text_135')}
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
                <strong>{t('cm_settings_board_text_136')}</strong>
                <p>{t('cm_settings_board_text_137')}</p>
              </header>
              <DataActionRow
                definition={PREFERENCES_ACTION}
                busy={busy}
                onRequest={requestDataAction}
              />
            </section>

            <section className="manager-data-section">
              <header className="manager-data-section__heading">
                <strong>{t('cm_settings_board_text_138')}</strong>
                <p>{t('cm_settings_board_text_139')}</p>
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
                <strong>{t('cm_settings_board_text_140')}</strong>
                <p>{t('cm_settings_board_text_141')}</p>
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
          ariaLabel={t('cm_settings_board_text_142', [
            String(confirmation.title),
          ])}
          title={confirmation.title}
          onClose={closeConfirmation}
          onExitComplete={() => {
            setConfirmation(null);
          }}
          footer={
            <>
              <UiButton disabled={busy !== null} onClick={closeConfirmation}>
                {t('cm_settings_board_text_143')}
              </UiButton>
              <UiButton
                variant={confirmation.danger ? 'danger' : 'primary'}
                disabled={busy !== null}
                onClick={() => void runDataAction(confirmation.action)}
              >
                {busy === `data:${confirmation.action}`
                  ? t('cm_settings_board_text_144')
                  : confirmation.buttonLabel}
              </UiButton>
            </>
          }
        >
          <div className="manager-data-confirmation">
            <UiNotice
              tone={confirmation.danger ? 'warning' : 'info'}
              title={t('cm_settings_board_title_145')}
            >
              <p>{confirmation.description}</p>
            </UiNotice>
            {confirmation.action === 'reset-all' && (
              <UiButton
                disabled={busy !== null}
                onClick={() => void exportLibrary()}
              >
                <Download size={16} aria-hidden="true" />
                {t('cm_settings_board_text_146')}
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
  useLocale();

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
