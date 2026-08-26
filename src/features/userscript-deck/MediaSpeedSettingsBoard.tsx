import { Gauge, RotateCcw, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  DiagnosticCopyButton,
  UiButton,
  UiDialog,
  UiLoader,
  UiNotice,
  UiSelectField,
  UiTextArea,
  UiToggle,
} from '../../components/ui/Ui';
import {
  defaultMediaSpeedSettings,
  isMediaSpeedStandardSpeed,
  type MediaSpeedController,
  type MediaSpeedSettings,
  type MediaSpeedSettingsView,
  type MediaSpeedSnapshot,
  type MediaSpeedStandardSpeed,
  type MediaSpeedWheelItem,
  mediaSpeedSiteEnabled,
  mediaSpeedSiteLockEnabled,
  setMediaSpeedSiteEnabled,
  setMediaSpeedSiteLock,
} from '../../media-speed/domain/types';

type Status = {
  message: string;
  error: boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function wheelDefinition(items: readonly MediaSpeedWheelItem[]) {
  return items
    .map((item) =>
      item.kind === 'speed'
        ? String(item.speed)
        : item.kind === 'random'
          ? '随机'
          : '地狱',
    )
    .join('\n');
}

function parseWheelDefinition(value: string): MediaSpeedWheelItem[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error('速度法印至少需要一个位置。');
  if (lines.length > 12) throw new Error('速度法印最多支持 12 个位置。');

  const items: MediaSpeedWheelItem[] = [];
  const speeds = new Set<number>();
  let randomAdded = false;
  let hellAdded = false;
  for (const line of lines) {
    if (/^(随机|骰子|random)$/i.test(line)) {
      if (randomAdded) throw new Error('随机位置只能添加一次。');
      randomAdded = true;
      items.push({ kind: 'random' });
      continue;
    }
    if (/^地狱$/u.test(line)) {
      if (hellAdded) throw new Error('地狱位置只能添加一次。');
      hellAdded = true;
      items.push({ kind: 'hell' });
      continue;
    }
    const speed = Number(line.replace(/×$/u, ''));
    if (!isMediaSpeedStandardSpeed(speed)) {
      throw new Error(`“${line}”不是 0.1 至 16 之间的有效倍速。`);
    }
    const normalized = Math.round(speed * 100) / 100;
    if (speeds.has(normalized)) {
      throw new Error(`倍速 ${normalized}× 重复出现。`);
    }
    speeds.add(normalized);
    items.push({ kind: 'speed', speed: normalized });
  }
  if (speeds.size === 0) {
    throw new Error('速度法印至少需要一个数字倍速，供默认与随机模式使用。');
  }
  return items;
}

export function MediaSpeedSettingsBoard({
  controller,
  onSnapshot,
  onClose,
}: {
  controller: MediaSpeedController;
  onSnapshot: (snapshot: MediaSpeedSnapshot) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<MediaSpeedSettingsView | null>(null);
  const [settings, setSettings] = useState<MediaSpeedSettings | null>(null);
  const [wheelText, setWheelText] = useState('');
  const [wheelError, setWheelError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>('load');
  const [status, setStatus] = useState<Status>({
    message: '',
    error: false,
  });

  const applyView = useCallback(
    (next: MediaSpeedSettingsView) => {
      setView(next);
      setSettings(structuredClone(next.settings));
      setWheelText(wheelDefinition(next.settings.wheelItems));
      setWheelError(null);
      onSnapshot(next.snapshot);
    },
    [onSnapshot],
  );

  useEffect(() => {
    let active = true;
    void controller.readSettings().then(
      (next) => {
        if (!active) return;
        applyView(next);
        setBusy(null);
      },
      (error) => {
        if (!active) return;
        setStatus({ message: errorMessage(error), error: true });
        setBusy(null);
      },
    );
    return () => {
      active = false;
    };
  }, [applyView, controller]);

  const run = async (
    operation: string,
    task: () => Promise<MediaSpeedSettingsView>,
    message: string,
  ) => {
    setBusy(operation);
    setStatus({ message: '', error: false });
    try {
      applyView(await task());
      setStatus({ message, error: false });
    } catch (error) {
      setStatus({ message: errorMessage(error), error: true });
    } finally {
      setBusy(null);
    }
  };

  if (!view || !settings) {
    return (
      <UiDialog ariaLabel="媒体倍速设置" title="媒体倍速" onClose={onClose}>
        {status.error ? (
          <UiNotice
            tone="error"
            title="媒体倍速设置读取失败"
            copyText={status.message}
          >
            <p>{status.message}</p>
          </UiNotice>
        ) : (
          <UiLoader large label="正在读取媒体时间设置" />
        )}
      </UiDialog>
    );
  }

  const configuredSpeeds = settings.wheelItems.flatMap((item) =>
    item.kind === 'speed' ? [item.speed] : [],
  );
  const currentHost = view.snapshot.currentHost;
  const currentSiteEnabled = currentHost
    ? mediaSpeedSiteEnabled(settings, currentHost)
    : false;
  const currentSiteLocked = currentHost
    ? mediaSpeedSiteLockEnabled(settings, currentHost)
    : false;
  const resetDraft = () => {
    const defaults = defaultMediaSpeedSettings();
    setSettings(defaults);
    setWheelText(wheelDefinition(defaults.wheelItems));
    setWheelError(null);
    setStatus({
      message: '已载入全部默认设置，点击“应用设置”后生效。',
      error: false,
    });
  };
  const updateWheel = (value: string) => {
    setWheelText(value);
    try {
      const wheelItems = parseWheelDefinition(value);
      const speeds = wheelItems.flatMap((item) =>
        item.kind === 'speed' ? [item.speed] : [],
      );
      setSettings((current) =>
        current
          ? {
              ...current,
              wheelItems,
              defaultSpeed: speeds.includes(current.defaultSpeed)
                ? current.defaultSpeed
                : (speeds[0] ?? current.defaultSpeed),
            }
          : current,
      );
      setWheelError(null);
      if (status.error) setStatus({ message: '', error: false });
    } catch (error) {
      const message = errorMessage(error);
      setWheelError(message);
      setStatus({ message, error: true });
    }
  };

  return (
    <UiDialog
      ariaLabel="媒体倍速设置"
      title="媒体倍速"
      status={
        !settings.enabled
          ? { label: '全局已停用', tone: 'inactive' }
          : !currentSiteEnabled
            ? { label: '当前网站已停用', tone: 'inactive' }
            : view.snapshot.mediaCount > 0
              ? {
                  label: `视频 ${view.snapshot.videoCount} · 音频 ${view.snapshot.audioCount}`,
                  tone: 'active',
                }
              : { label: '等待媒体', tone: 'active' }
      }
      onClose={onClose}
      footer={
        <>
          <UiLoader
            visible={busy !== null}
            compact
            className="manager-settings-operation-loader"
            label="正在同步媒体倍速设置"
          />
          {busy === null && status.message && (
            <p className={status.error ? 'is-error' : ''}>{status.message}</p>
          )}
          {status.error && status.message && (
            <DiagnosticCopyButton text={status.message} />
          )}
          <UiButton disabled={busy !== null} onClick={resetDraft}>
            <RotateCcw size={14} aria-hidden="true" />
            恢复全部默认设置
          </UiButton>
          <UiButton
            variant="primary"
            disabled={busy !== null || wheelError !== null}
            onClick={() =>
              void run(
                'save',
                () => controller.saveSettings(settings),
                '媒体倍速设置已应用。',
              )
            }
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
          title="媒体时间引擎诊断"
          copyText={view.snapshot.error}
        >
          <p>{view.snapshot.error || '媒体时间引擎运行异常。'}</p>
        </UiNotice>
      )}

      <div className="manager-media-speed-intro">
        <Gauge size={22} aria-hidden="true" />
        <div>
          <strong>页面级时间控制</strong>
          <p>
            选定档位会应用到当前页面及嵌入框架中的视频和音频；未锁定时播放器仍可自行调整。
          </p>
        </div>
      </div>

      <div className="manager-media-speed-grid">
        <UiTextArea
          label="速度法印"
          hint="每行一个位置，按顺时针排列。数字代表倍速；“随机”和“地狱”均可删除。最多 12 个位置。"
          className="manager-media-speed-wheel-editor"
          value={wheelText}
          spellCheck={false}
          onChange={(event) => updateWheel(event.currentTarget.value)}
        />
        <UiSelectField
          id="media-speed-default"
          label="默认播放速度"
          value={settings.defaultSpeed}
          onChange={(event) =>
            setSettings((current) =>
              current
                ? {
                    ...current,
                    defaultSpeed: Number(
                      event.currentTarget.value,
                    ) as MediaSpeedStandardSpeed,
                  }
                : current,
            )
          }
        >
          {configuredSpeeds.map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </UiSelectField>
        <UiToggle
          label="显示速度法印"
          description="检测到可控媒体后，在牌库入口周围依次展开速度选项。"
          checked={settings.showWheel}
          onChange={(showWheel) =>
            setSettings((current) =>
              current ? { ...current, showWheel } : current,
            )
          }
        />
        <UiToggle
          label="同时控制音频"
          description="关闭后恢复页面音频元素的正常速度，只继续控制视频。"
          checked={settings.includeAudio}
          onChange={(includeAudio) =>
            setSettings((current) =>
              current ? { ...current, includeAudio } : current,
            )
          }
        />
        <UiToggle
          label="全局启用"
          description="引擎保持常驻，这里只切换媒体时间控制是否生效。"
          checked={settings.enabled}
          onChange={(enabled) =>
            setSettings((current) =>
              current ? { ...current, enabled } : current,
            )
          }
        />
        <UiToggle
          label="在当前网站启用"
          description={
            currentHost
              ? `单独控制 ${currentHost}，并记忆该网站最后选择的倍速。`
              : '当前页面无法识别网站地址。'
          }
          checked={currentSiteEnabled}
          disabled={!currentHost}
          onChange={(enabled) =>
            setSettings((current) =>
              current && currentHost
                ? setMediaSpeedSiteEnabled(current, currentHost, enabled)
                : current,
            )
          }
        />
        <UiToggle
          label="阻止播放器自动重置"
          description={
            currentHost
              ? '仅在网站反复改回倍率时启用；你的原生倍速操作仍会同步。'
              : '当前页面无法识别网站地址。'
          }
          checked={currentSiteLocked}
          disabled={!currentHost || !currentSiteEnabled}
          onChange={(lockSpeed) =>
            setSettings((current) =>
              current && currentHost
                ? setMediaSpeedSiteLock(current, currentHost, lockSpeed)
                : current,
            )
          }
        />
      </div>
    </UiDialog>
  );
}
