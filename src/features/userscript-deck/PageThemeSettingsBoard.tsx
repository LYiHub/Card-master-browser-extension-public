import { Download, RotateCcw, Save, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  DiagnosticCopyButton,
  UiButton,
  UiDialog,
  UiLoader,
  UiNotice,
  UiRange,
  UiSegmentedControl,
  UiSelectField,
  UiTextArea,
  UiTextField,
  UiToggle,
} from '../../components/ui/Ui';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import {
  exportDarkReaderSettings,
  importDarkReaderSettings,
} from '../../page-theme/domain/dark-reader-settings';
import type {
  PageThemeController,
  PageThemeSettings,
  PageThemeSnapshot,
  PageThemeTheme,
} from '../../page-theme/domain/types';
import { isPageThemeSettings } from '../../page-theme/domain/types';
import { usePageThemeBoard } from './usePageThemeBoard';

type PageThemeTab = 'light' | 'sites' | 'automation' | 'advanced';
type ThemeScope = 'global' | 'site';

const TABS = [
  {
    value: 'light',
    get label() {
      return t('cm_page_theme_settings_board_label_1');
    },
  },
  {
    value: 'sites',
    get label() {
      return t('cm_page_theme_settings_board_label_2');
    },
  },
  {
    value: 'automation',
    get label() {
      return t('cm_page_theme_settings_board_label_3');
    },
  },
  {
    value: 'advanced',
    get label() {
      return t('cm_page_theme_settings_board_label_4');
    },
  },
] as const;

const SCOPES = [
  {
    value: 'global',
    get label() {
      return t('cm_page_theme_settings_board_label_5');
    },
  },
  {
    value: 'site',
    get label() {
      return t('cm_page_theme_settings_board_label_6');
    },
  },
] as const;

function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function themeForScope(
  settings: PageThemeSettings,
  scope: ThemeScope,
  host: string,
) {
  return scope === 'site'
    ? { ...settings.theme, ...settings.siteOverrides[host] }
    : settings.theme;
}

export function PageThemeSettingsBoard({
  controller,
  onSnapshot,
  onClose,
  initialTab = 'light',
  initialScope = 'global',
}: {
  controller: PageThemeController;
  onSnapshot: (snapshot: PageThemeSnapshot) => void;
  onClose: () => void;
  initialTab?: PageThemeTab;
  initialScope?: ThemeScope;
}) {
  useLocale();

  const { view, busy, status, setStatus, run } = usePageThemeBoard(
    controller,
    onSnapshot,
  );
  const [tab, setTab] = useState<PageThemeTab>(initialTab);
  const [scope, setScope] = useState<ThemeScope>(initialScope);
  const [settings, setSettings] = useState<PageThemeSettings | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const darkReaderImportRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (view) setSettings(structuredClone(view.settings));
  }, [view]);

  if (!settings || !view) {
    return (
      <UiDialog
        ariaLabel={t('cm_page_theme_settings_board_aria_label_7')}
        title={t('cm_page_theme_settings_board_title_8')}
        onClose={onClose}
      >
        {status.error ? (
          <UiNotice
            tone="error"
            title={t('cm_page_theme_settings_board_title_9')}
            copyText={status.message}
          >
            <p>{status.message}</p>
          </UiNotice>
        ) : (
          <UiLoader large label={t('cm_page_theme_settings_board_label_10')} />
        )}
      </UiDialog>
    );
  }

  const currentHost = view.snapshot.currentHost;
  const activeTheme = themeForScope(settings, scope, currentHost);
  const updateTheme = (change: Partial<PageThemeTheme>) => {
    setSettings((current) => {
      if (!current) return current;
      if (scope === 'global') {
        return { ...current, theme: { ...current.theme, ...change } };
      }
      return {
        ...current,
        siteOverrides: {
          ...current.siteOverrides,
          [currentHost]: {
            ...current.siteOverrides[currentHost],
            ...change,
          },
        },
      };
    });
  };
  const save = () =>
    run(
      'save',
      () => controller.saveSettings(settings),
      t('cm_page_theme_settings_board_text_11'),
    );
  const reset = async () => {
    const succeeded = await run(
      'reset',
      () => controller.resetSettings(),
      t('cm_page_theme_settings_board_text_12'),
    );
    if (succeeded) setScope('global');
  };
  const importSettings = async (file: File) => {
    try {
      const imported: unknown = JSON.parse(await file.text());
      if (!isPageThemeSettings(imported)) {
        throw new Error(t('cm_page_theme_settings_board_error_13'));
      }
      setSettings({
        ...imported,
        revision: settings.revision,
      });
      setStatus({
        message: t('cm_page_theme_settings_board_message_14'),
        error: false,
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        error: true,
      });
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };
  const importDarkReader = async (file: File) => {
    try {
      const migrated = importDarkReaderSettings(
        JSON.parse(await file.text()),
        settings.revision,
      );
      setSettings(migrated.settings);
      setStatus({
        message:
          t('cm_page_theme_settings_board_text_15', [
            String(migrated.importedSiteOverrides),
          ]) +
          (migrated.skippedSitePatterns > 0
            ? t('cm_page_theme_settings_board_text_16', [
                String(migrated.skippedSitePatterns),
              ])
            : '') +
          t('cm_page_theme_settings_board_text_17'),
        error: false,
      });
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : String(error),
        error: true,
      });
    } finally {
      if (darkReaderImportRef.current) {
        darkReaderImportRef.current.value = '';
      }
    }
  };

  return (
    <UiDialog
      ariaLabel={t('cm_page_theme_settings_board_aria_label_18')}
      title={t('cm_page_theme_settings_board_title_19')}
      status={
        view.snapshot.activeOnPage
          ? {
              label: t('cm_page_theme_settings_board_label_20'),
              tone: 'active',
            }
          : view.snapshot.inactiveReason === 'site-disabled'
            ? {
                label: t('cm_page_theme_settings_board_label_21'),
                tone: 'inactive',
              }
            : view.snapshot.inactiveReason === 'automation'
              ? { label: t('cm_page_theme_settings_board_label_22') }
              : view.snapshot.darkThemeDetected
                ? { label: t('cm_page_theme_settings_board_label_23') }
                : { label: t('cm_page_theme_settings_board_label_24') }
      }
      onClose={onClose}
      navigation={
        <UiSegmentedControl
          label={t('cm_page_theme_settings_board_label_25')}
          value={tab}
          options={TABS}
          className="manager-theme-primary-tabs"
          onChange={setTab}
        />
      }
      footer={
        <>
          <UiLoader
            visible={busy !== null}
            compact
            className="manager-settings-operation-loader"
            label={t('cm_page_theme_settings_board_label_26')}
          />
          {busy === null && status.message && (
            <p className={status.error ? 'is-error' : ''}>{status.message}</p>
          )}
          {status.error && status.message && (
            <DiagnosticCopyButton text={status.message} />
          )}
          <UiButton
            variant="primary"
            disabled={busy !== null}
            onClick={() => void save()}
          >
            <Save size={14} aria-hidden="true" />
            {t('cm_page_theme_settings_board_text_27')}
          </UiButton>
        </>
      }
    >
      {view.snapshot.status === 'error' && (
        <UiNotice
          tone="error"
          title={t('cm_page_theme_settings_board_title_28')}
          copyText={view.snapshot.error}
        >
          <p>
            {view.snapshot.error || t('cm_page_theme_settings_board_text_29')}
          </p>
        </UiNotice>
      )}

      {tab === 'light' && (
        <div className="manager-theme-panel">
          <UiSegmentedControl
            label={t('cm_page_theme_settings_board_label_30')}
            value={scope}
            options={SCOPES}
            className="manager-theme-scope-tabs"
            onChange={setScope}
          />
          {scope === 'site' && settings.siteOverrides[currentHost] && (
            <div className="manager-theme-actions">
              <UiButton
                onClick={() =>
                  setSettings((current) => {
                    if (!current) return current;
                    const siteOverrides = { ...current.siteOverrides };
                    delete siteOverrides[currentHost];
                    return { ...current, siteOverrides };
                  })
                }
              >
                <RotateCcw size={14} aria-hidden="true" />
                {t('cm_page_theme_settings_board_text_31')}
              </UiButton>
            </div>
          )}
          <div className="manager-theme-grid">
            <UiSelectField
              id="page-theme-mode"
              label={t('cm_page_theme_settings_board_label_32')}
              value={activeTheme.mode}
              onChange={(event) =>
                updateTheme({ mode: Number(event.target.value) as 0 | 1 })
              }
            >
              <option value={1}>
                {t('cm_page_theme_settings_board_text_33')}
              </option>
              <option value={0}>
                {t('cm_page_theme_settings_board_text_34')}
              </option>
            </UiSelectField>
            <UiSelectField
              id="page-theme-engine"
              label={t('cm_page_theme_settings_board_label_35')}
              value={activeTheme.engine}
              onChange={(event) =>
                updateTheme({
                  engine: event.target.value as PageThemeTheme['engine'],
                })
              }
            >
              <option value="dynamicTheme">
                {t('cm_page_theme_settings_board_text_36')}
              </option>
              <option value="cssFilter">
                {t('cm_page_theme_settings_board_text_37')}
              </option>
            </UiSelectField>
          </div>
          <div className="manager-theme-range-grid">
            <UiRange
              label={t('cm_page_theme_settings_board_text_38', [
                String(activeTheme.brightness),
              ])}
              min={5}
              max={200}
              value={activeTheme.brightness}
              onChange={(event) =>
                updateTheme({ brightness: Number(event.target.value) })
              }
            />
            <UiRange
              label={t('cm_page_theme_settings_board_text_39', [
                String(activeTheme.contrast),
              ])}
              min={5}
              max={200}
              value={activeTheme.contrast}
              onChange={(event) =>
                updateTheme({ contrast: Number(event.target.value) })
              }
            />
            <UiRange
              label={t('cm_page_theme_settings_board_text_40', [
                String(activeTheme.grayscale),
              ])}
              min={0}
              max={100}
              value={activeTheme.grayscale}
              onChange={(event) =>
                updateTheme({ grayscale: Number(event.target.value) })
              }
            />
            <UiRange
              label={t('cm_page_theme_settings_board_text_41', [
                String(activeTheme.sepia),
              ])}
              min={0}
              max={100}
              value={activeTheme.sepia}
              onChange={(event) =>
                updateTheme({ sepia: Number(event.target.value) })
              }
            />
          </div>
          <div className="manager-theme-grid">
            <UiTextField
              label={t('cm_page_theme_settings_board_label_42')}
              type="color"
              value={activeTheme.darkSchemeBackgroundColor}
              onChange={(event) =>
                updateTheme({ darkSchemeBackgroundColor: event.target.value })
              }
            />
            <UiTextField
              label={t('cm_page_theme_settings_board_label_43')}
              type="color"
              value={activeTheme.darkSchemeTextColor}
              onChange={(event) =>
                updateTheme({ darkSchemeTextColor: event.target.value })
              }
            />
            <UiTextField
              label={t('cm_page_theme_settings_board_label_44')}
              type="color"
              value={activeTheme.lightSchemeBackgroundColor}
              onChange={(event) =>
                updateTheme({ lightSchemeBackgroundColor: event.target.value })
              }
            />
            <UiTextField
              label={t('cm_page_theme_settings_board_label_45')}
              type="color"
              value={activeTheme.lightSchemeTextColor}
              onChange={(event) =>
                updateTheme({ lightSchemeTextColor: event.target.value })
              }
            />
            <UiTextField
              label={t('cm_page_theme_settings_board_label_46')}
              value={activeTheme.scrollbarColor}
              placeholder={t('cm_page_theme_settings_board_placeholder_47')}
              onChange={(event) =>
                updateTheme({ scrollbarColor: event.target.value })
              }
            />
            <UiTextField
              label={t('cm_page_theme_settings_board_label_48')}
              value={activeTheme.selectionColor}
              placeholder={t('cm_page_theme_settings_board_placeholder_49')}
              onChange={(event) =>
                updateTheme({ selectionColor: event.target.value })
              }
            />
          </div>
          <UiToggle
            label={t('cm_page_theme_settings_board_label_50')}
            description={t('cm_page_theme_settings_board_description_51')}
            checked={activeTheme.styleSystemControls}
            onChange={(styleSystemControls) =>
              updateTheme({ styleSystemControls })
            }
          />
          <UiToggle
            label={t('cm_page_theme_settings_board_label_52')}
            description={t('cm_page_theme_settings_board_description_53')}
            checked={activeTheme.immediateModify}
            onChange={(immediateModify) => updateTheme({ immediateModify })}
          />
        </div>
      )}

      {tab === 'sites' && (
        <div className="manager-theme-panel">
          <UiToggle
            label={t('cm_page_theme_settings_board_label_54')}
            checked={settings.enabledByDefault}
            onChange={(enabledByDefault) =>
              setSettings({ ...settings, enabledByDefault })
            }
          />
          <UiToggle
            label={t('cm_page_theme_settings_board_label_55')}
            description={t('cm_page_theme_settings_board_description_56')}
            checked={settings.detectDarkTheme}
            onChange={(detectDarkTheme) =>
              setSettings({ ...settings, detectDarkTheme })
            }
          />
          <div className="manager-theme-grid">
            <UiTextArea
              label={t('cm_page_theme_settings_board_label_57')}
              value={settings.enabledFor.join('\n')}
              spellCheck={false}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  enabledFor: event.target.value.split(/\r?\n/),
                })
              }
            />
            <UiTextArea
              label={t('cm_page_theme_settings_board_label_58')}
              value={settings.disabledFor.join('\n')}
              spellCheck={false}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  disabledFor: event.target.value.split(/\r?\n/),
                })
              }
            />
          </div>
          <UiNotice
            title={t('cm_page_theme_settings_board_text_59', [
              String(currentHost || t('cm_page_theme_settings_board_text_1')),
            ])}
          >
            <p>
              {view.snapshot.darkThemeDetected
                ? t('cm_page_theme_settings_board_text_60')
                : view.snapshot.activeOnPage
                  ? t('cm_page_theme_settings_board_text_61')
                  : view.snapshot.inactiveReason === 'site-disabled'
                    ? t('cm_page_theme_settings_board_text_62')
                    : view.snapshot.inactiveReason === 'automation'
                      ? t('cm_page_theme_settings_board_text_63')
                      : t('cm_page_theme_settings_board_text_64')}
            </p>
          </UiNotice>
        </div>
      )}

      {tab === 'automation' && (
        <div className="manager-theme-panel">
          <UiSelectField
            id="page-theme-automation"
            label={t('cm_page_theme_settings_board_label_65')}
            value={settings.automation.mode}
            onChange={(event) =>
              setSettings({
                ...settings,
                automation: {
                  ...settings.automation,
                  mode: event.target
                    .value as PageThemeSettings['automation']['mode'],
                },
              })
            }
          >
            <option value="none">
              {t('cm_page_theme_settings_board_text_66')}
            </option>
            <option value="system">
              {t('cm_page_theme_settings_board_text_67')}
            </option>
            <option value="time">
              {t('cm_page_theme_settings_board_text_68')}
            </option>
          </UiSelectField>
          <UiSelectField
            id="page-theme-behavior"
            label={t('cm_page_theme_settings_board_label_69')}
            value={settings.automation.behavior}
            onChange={(event) =>
              setSettings({
                ...settings,
                automation: {
                  ...settings.automation,
                  behavior: event.target
                    .value as PageThemeSettings['automation']['behavior'],
                },
              })
            }
          >
            <option value="on-off">
              {t('cm_page_theme_settings_board_text_70')}
            </option>
            <option value="scheme">
              {t('cm_page_theme_settings_board_text_71')}
            </option>
          </UiSelectField>
          {settings.automation.mode === 'time' && (
            <div className="manager-theme-grid">
              <UiTextField
                label={t('cm_page_theme_settings_board_label_72')}
                type="time"
                value={settings.time.activation}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    time: { ...settings.time, activation: event.target.value },
                  })
                }
              />
              <UiTextField
                label={t('cm_page_theme_settings_board_label_73')}
                type="time"
                value={settings.time.deactivation}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    time: {
                      ...settings.time,
                      deactivation: event.target.value,
                    },
                  })
                }
              />
            </div>
          )}
        </div>
      )}

      {tab === 'advanced' && (
        <div className="manager-theme-panel">
          <UiToggle
            label={t('cm_page_theme_settings_board_label_74')}
            checked={activeTheme.useFont}
            onChange={(useFont) => updateTheme({ useFont })}
          />
          <UiTextField
            label={t('cm_page_theme_settings_board_label_75')}
            value={activeTheme.fontFamily}
            disabled={!activeTheme.useFont}
            onChange={(event) =>
              updateTheme({ fontFamily: event.target.value })
            }
          />
          <UiRange
            label={t('cm_page_theme_settings_board_text_76', [
              String(activeTheme.textStroke.toFixed(1)),
            ])}
            min={0}
            max={2}
            step={0.1}
            value={activeTheme.textStroke}
            onChange={(event) =>
              updateTheme({ textStroke: Number(event.target.value) })
            }
          />
          <div className="manager-theme-actions">
            <UiButton
              onClick={() =>
                downloadText(
                  'page-theme-settings.json',
                  JSON.stringify(settings, null, 2),
                  'application/json;charset=utf-8',
                )
              }
            >
              <Download size={14} aria-hidden="true" />
              {t('cm_page_theme_settings_board_text_77')}
            </UiButton>
            <UiButton onClick={() => importRef.current?.click()}>
              <Upload size={14} aria-hidden="true" />
              {t('cm_page_theme_settings_board_text_78')}
            </UiButton>
            <input
              ref={importRef}
              className="manager-theme-import"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importSettings(file);
              }}
            />
            <UiButton
              onClick={() =>
                downloadText(
                  'Dark-Reader-Settings.json',
                  JSON.stringify(exportDarkReaderSettings(settings), null, 4),
                  'application/json;charset=utf-8',
                )
              }
            >
              <Download size={14} aria-hidden="true" />
              {t('cm_page_theme_settings_board_text_79')}
            </UiButton>
            <UiButton onClick={() => darkReaderImportRef.current?.click()}>
              <Upload size={14} aria-hidden="true" />
              {t('cm_page_theme_settings_board_text_80')}
            </UiButton>
            <input
              ref={darkReaderImportRef}
              className="manager-theme-import"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importDarkReader(file);
              }}
            />
            <UiButton
              variant="danger"
              disabled={busy !== null}
              onClick={() => void reset()}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {t('cm_page_theme_settings_board_text_81')}
            </UiButton>
          </div>
          <UiNotice title={t('cm_page_theme_settings_board_title_82')}>
            <p>
              {t('cm_page_theme_settings_board_text_83')}
              {view.snapshot.status} {t('cm_page_theme_settings_board_text_84')}{' '}
              {view.snapshot.revision}
            </p>
          </UiNotice>
        </div>
      )}
    </UiDialog>
  );
}
