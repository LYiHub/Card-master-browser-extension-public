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
  { value: 'light', label: '光影' },
  { value: 'sites', label: '站点' },
  { value: 'automation', label: '自动' },
  { value: 'advanced', label: '高级' },
] as const;

const SCOPES = [
  { value: 'global', label: '全局' },
  { value: 'site', label: '当前站点' },
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
      <UiDialog ariaLabel="暗夜降临设置" title="暗夜降临" onClose={onClose}>
        {status.error ? (
          <UiNotice
            tone="error"
            title="暗夜降临设置读取失败"
            copyText={status.message}
          >
            <p>{status.message}</p>
          </UiNotice>
        ) : (
          <UiLoader large label="正在唤醒光影引擎" />
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
      '暗夜降临设置已应用。',
    );
  const reset = async () => {
    const succeeded = await run(
      'reset',
      () => controller.resetSettings(),
      '暗夜降临已恢复默认设置。',
    );
    if (succeeded) setScope('global');
  };
  const importSettings = async (file: File) => {
    try {
      const imported: unknown = JSON.parse(await file.text());
      if (!isPageThemeSettings(imported)) {
        throw new Error('导入文件不是有效的暗夜降临设置。');
      }
      setSettings({
        ...imported,
        revision: settings.revision,
      });
      setStatus({
        message: '设置已载入，点击“应用设置”后生效。',
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
          `Dark Reader 设置已载入，迁移 ${migrated.importedSiteOverrides} 个站点调校` +
          (migrated.skippedSitePatterns > 0
            ? `，跳过 ${migrated.skippedSitePatterns} 个路径或通配规则`
            : '') +
          '。点击“应用设置”后生效。',
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
      ariaLabel="暗夜降临设置"
      title="暗夜降临"
      status={
        view.snapshot.activeOnPage
          ? { label: '当前网站已启用', tone: 'active' }
          : view.snapshot.inactiveReason === 'site-disabled'
            ? { label: '当前网站已停用', tone: 'inactive' }
            : view.snapshot.inactiveReason === 'automation'
              ? { label: '自动休眠' }
              : view.snapshot.darkThemeDetected
                ? { label: '检测到原生暗色' }
                : { label: '当前网站未生效' }
      }
      onClose={onClose}
      navigation={
        <UiSegmentedControl
          label="暗夜降临设置分类"
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
            label="正在同步暗夜降临设置"
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
            应用设置
          </UiButton>
        </>
      }
    >
      {view.snapshot.status === 'error' && (
        <UiNotice
          tone="error"
          title="光影引擎诊断"
          copyText={view.snapshot.error}
        >
          <p>{view.snapshot.error || '页面光影引擎运行异常。'}</p>
        </UiNotice>
      )}

      {tab === 'light' && (
        <div className="manager-theme-panel">
          <UiSegmentedControl
            label="设置作用范围"
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
                清除本站调校
              </UiButton>
            </div>
          )}
          <div className="manager-theme-grid">
            <UiSelectField
              id="page-theme-mode"
              label="色彩模式"
              value={activeTheme.mode}
              onChange={(event) =>
                updateTheme({ mode: Number(event.target.value) as 0 | 1 })
              }
            >
              <option value={1}>暗色</option>
              <option value={0}>亮色</option>
            </UiSelectField>
            <UiSelectField
              id="page-theme-engine"
              label="渲染引擎"
              value={activeTheme.engine}
              onChange={(event) =>
                updateTheme({
                  engine: event.target.value as PageThemeTheme['engine'],
                })
              }
            >
              <option value="dynamicTheme">动态主题</option>
              <option value="cssFilter">滤镜后备</option>
            </UiSelectField>
          </div>
          <div className="manager-theme-range-grid">
            <UiRange
              label={`亮度 ${activeTheme.brightness}%`}
              min={5}
              max={200}
              value={activeTheme.brightness}
              onChange={(event) =>
                updateTheme({ brightness: Number(event.target.value) })
              }
            />
            <UiRange
              label={`对比 ${activeTheme.contrast}%`}
              min={5}
              max={200}
              value={activeTheme.contrast}
              onChange={(event) =>
                updateTheme({ contrast: Number(event.target.value) })
              }
            />
            <UiRange
              label={`灰度 ${activeTheme.grayscale}%`}
              min={0}
              max={100}
              value={activeTheme.grayscale}
              onChange={(event) =>
                updateTheme({ grayscale: Number(event.target.value) })
              }
            />
            <UiRange
              label={`褐色 ${activeTheme.sepia}%`}
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
              label="暗色背景"
              type="color"
              value={activeTheme.darkSchemeBackgroundColor}
              onChange={(event) =>
                updateTheme({ darkSchemeBackgroundColor: event.target.value })
              }
            />
            <UiTextField
              label="暗色文字"
              type="color"
              value={activeTheme.darkSchemeTextColor}
              onChange={(event) =>
                updateTheme({ darkSchemeTextColor: event.target.value })
              }
            />
            <UiTextField
              label="亮色背景"
              type="color"
              value={activeTheme.lightSchemeBackgroundColor}
              onChange={(event) =>
                updateTheme({ lightSchemeBackgroundColor: event.target.value })
              }
            />
            <UiTextField
              label="亮色文字"
              type="color"
              value={activeTheme.lightSchemeTextColor}
              onChange={(event) =>
                updateTheme({ lightSchemeTextColor: event.target.value })
              }
            />
            <UiTextField
              label="滚动条颜色"
              value={activeTheme.scrollbarColor}
              placeholder="auto 或颜色值"
              onChange={(event) =>
                updateTheme({ scrollbarColor: event.target.value })
              }
            />
            <UiTextField
              label="选区颜色"
              value={activeTheme.selectionColor}
              placeholder="auto 或颜色值"
              onChange={(event) =>
                updateTheme({ selectionColor: event.target.value })
              }
            />
          </div>
          <UiToggle
            label="页面控件"
            description="同步调整表单控件与系统组件的配色。"
            checked={activeTheme.styleSystemControls}
            onChange={(styleSystemControls) =>
              updateTheme({ styleSystemControls })
            }
          />
          <UiToggle
            label="立即重绘"
            description="更积极地处理新出现的页面样式。"
            checked={activeTheme.immediateModify}
            onChange={(immediateModify) => updateTheme({ immediateModify })}
          />
        </div>
      )}

      {tab === 'sites' && (
        <div className="manager-theme-panel">
          <UiToggle
            label="默认覆盖新站点"
            checked={settings.enabledByDefault}
            onChange={(enabledByDefault) =>
              setSettings({ ...settings, enabledByDefault })
            }
          />
          <UiToggle
            label="检测站点原生暗色"
            description="发现可靠的原生暗色主题时自动避让。"
            checked={settings.detectDarkTheme}
            onChange={(detectDarkTheme) =>
              setSettings({ ...settings, detectDarkTheme })
            }
          />
          <div className="manager-theme-grid">
            <UiTextArea
              label="强制启用站点"
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
              label="排除站点"
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
          <UiNotice title={`当前站点：${currentHost || '无法识别'}`}>
            <p>
              {view.snapshot.darkThemeDetected
                ? '已检测到站点原生暗色，暗夜降临当前保持避让。'
                : view.snapshot.activeOnPage
                  ? '当前站点正在使用暗夜降临。'
                  : view.snapshot.inactiveReason === 'site-disabled'
                    ? '暗夜降临已在当前站点停用。'
                    : view.snapshot.inactiveReason === 'automation'
                      ? '自动规则当前处于休眠时段。'
                      : '暗夜降临当前未在此页面生效。'}
            </p>
          </UiNotice>
        </div>
      )}

      {tab === 'automation' && (
        <div className="manager-theme-panel">
          <UiSelectField
            id="page-theme-automation"
            label="自动规则"
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
            <option value="none">不自动切换</option>
            <option value="system">跟随系统</option>
            <option value="time">按时间</option>
          </UiSelectField>
          <UiSelectField
            id="page-theme-behavior"
            label="自动行为"
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
            <option value="on-off">启用或停用</option>
            <option value="scheme">切换明暗方案</option>
          </UiSelectField>
          {settings.automation.mode === 'time' && (
            <div className="manager-theme-grid">
              <UiTextField
                label="启用时间"
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
                label="停用时间"
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
            label="替换页面字体"
            checked={activeTheme.useFont}
            onChange={(useFont) => updateTheme({ useFont })}
          />
          <UiTextField
            label="字体"
            value={activeTheme.fontFamily}
            disabled={!activeTheme.useFont}
            onChange={(event) =>
              updateTheme({ fontFamily: event.target.value })
            }
          />
          <UiRange
            label={`文字描边 ${activeTheme.textStroke.toFixed(1)}px`}
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
              导出暗夜降临设置
            </UiButton>
            <UiButton onClick={() => importRef.current?.click()}>
              <Upload size={14} aria-hidden="true" />
              导入暗夜降临设置
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
              导出 Dark Reader
            </UiButton>
            <UiButton onClick={() => darkReaderImportRef.current?.click()}>
              <Upload size={14} aria-hidden="true" />
              导入 Dark Reader
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
              恢复默认
            </UiButton>
          </div>
          <UiNotice title="引擎信息">
            <p>
              Dark Reader 动态主题内核 · 状态 {view.snapshot.status} · 修订{' '}
              {view.snapshot.revision}
            </p>
          </UiNotice>
        </div>
      )}
    </UiDialog>
  );
}
