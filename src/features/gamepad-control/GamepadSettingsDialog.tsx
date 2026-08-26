import { Gamepad2, RotateCcw, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  UiButton,
  UiDialog,
  UiLoader,
  UiNotice,
  UiRange,
  UiSegmentedControl,
  UiToggle,
} from '../../components/ui/Ui';
import { GAMEPAD_CURSOR_ACCELERATION_DURATION_RANGE } from '../../gamepad-control/domain/motion';
import {
  GAMEPAD_CURSOR_SPEED_RANGE,
  GAMEPAD_SCROLL_SPEED_RANGE,
} from '../../gamepad-control/domain/response-curve';
import {
  defaultGamepadControlSettings,
  type GamepadControlController,
  type GamepadControlSettings,
} from '../../gamepad-control/domain/settings';
import { useGamepadSnapshot } from '../../gamepad-control/useGamepadSnapshot';
import { extensionSpeechCapability } from '../../hosts/extension/speech-capability';
import { GamepadMappingEditor } from './GamepadMappingEditor';
import { GamepadResponseCurveEditor } from './GamepadResponseCurveEditor';

const SETTINGS_TABS = [
  { value: 'mapping', label: '映射' },
  { value: 'feel', label: '手感' },
  { value: 'global', label: '全局' },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['value'];

export function GamepadSettingsDialog({
  controller,
  onClose,
}: {
  controller: GamepadControlController;
  onClose: () => void;
}) {
  const snapshot = useGamepadSnapshot();
  const speechCapability = extensionSpeechCapability();
  const [settings, setSettings] = useState<GamepadControlSettings | null>(null);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<SettingsTab>('mapping');

  const applySettings = useCallback((next: GamepadControlSettings) => {
    setSettings(structuredClone(next));
  }, []);

  useEffect(() => {
    let active = true;
    void controller.readSettings().then(
      (next) => {
        if (!active) return;
        applySettings(next);
        setBusy(false);
      },
      (failure) => {
        if (!active) return;
        setStatus(failure instanceof Error ? failure.message : String(failure));
        setError(true);
        setBusy(false);
      },
    );
    return () => {
      active = false;
    };
  }, [applySettings, controller]);

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setStatus('');
    setError(false);
    try {
      applySettings(await controller.saveSettings(settings));
      setStatus('手柄控制设置已应用到所有页面。');
    } catch (failure) {
      setStatus(failure instanceof Error ? failure.message : String(failure));
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (!settings) {
    return (
      <UiDialog
        ariaLabel="手柄控制设置"
        title="手柄控制"
        className="gamepad-control-dialog"
        onClose={onClose}
      >
        <UiLoader large visible={busy} label="正在读取手柄控制设置" />
        {!busy && (
          <UiNotice tone="error" title="无法读取手柄控制设置">
            <p>{status}</p>
          </UiNotice>
        )}
      </UiDialog>
    );
  }

  return (
    <UiDialog
      ariaLabel="手柄控制设置"
      title="手柄控制"
      className="gamepad-control-dialog"
      status={{
        label: !settings.enabled
          ? '全局停用'
          : snapshot.connected
            ? '手柄已连接'
            : '等待手柄',
        tone: !settings.enabled
          ? 'inactive'
          : snapshot.connected
            ? 'active'
            : 'neutral',
      }}
      onClose={onClose}
      navigation={
        <UiSegmentedControl
          label="手柄控制设置"
          value={tab}
          options={SETTINGS_TABS}
          contextNavigation
          onChange={setTab}
        />
      }
      footer={
        <>
          <UiLoader
            visible={busy}
            compact
            className="manager-settings-operation-loader"
            label="正在同步手柄控制设置"
          />
          {!busy && status && (
            <p className={error ? 'is-error' : ''}>{status}</p>
          )}
          <UiButton
            disabled={busy}
            onClick={() => {
              setSettings({
                ...defaultGamepadControlSettings(),
                revision: settings.revision,
              });
              setStatus('已载入默认参数，点击“应用设置”后生效。');
              setError(false);
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />
            恢复默认
          </UiButton>
          <UiButton
            variant="primary"
            disabled={busy}
            onClick={() => void save()}
          >
            <Save size={15} aria-hidden="true" />
            应用设置
          </UiButton>
        </>
      }
    >
      <div className="gamepad-control-settings">
        {tab === 'mapping' ? (
          <>
            <UiNotice
              title="三套输入，共用同一动作"
              icon={<Gamepad2 size={20} aria-hidden="true" />}
            >
              <p>
                鼠标与键盘列用于说明对应关系，手柄列可以自由修改。网页上的手柄图形只在按键发生时显示当前功能，完整映射始终以这里为准。
              </p>
            </UiNotice>
            <GamepadMappingEditor
              bindings={settings.bindings}
              snapshot={snapshot}
              deadZone={settings.stickDeadZone}
              speechInputAvailable={speechCapability.available}
              onChange={(bindings) =>
                setSettings((current) =>
                  current ? { ...current, bindings } : current,
                )
              }
              onFeedback={(message) => {
                setStatus(`${message} 点击“应用设置”后生效。`);
                setError(false);
              }}
            />
          </>
        ) : tab === 'feel' ? (
          <div className="gamepad-control-settings__feel">
            <GamepadResponseCurveEditor
              settings={settings}
              snapshot={snapshot}
              onChange={(patch) => {
                setSettings((current) =>
                  current ? { ...current, ...patch } : current,
                );
                setStatus('手感参数已调整，点击“应用设置”后生效。');
                setError(false);
              }}
            />
            <section className="gamepad-control-settings__range-section">
              <header>
                <strong className="gamepad-control-settings__range-title">
                  满幅速度
                </strong>
                <span className="gamepad-control-settings__range-description">
                  决定摇杆推到底时的最高移动速度
                </span>
              </header>
              <div className="gamepad-control-settings__ranges">
                <UiRange
                  label={`光标速度：${settings.cursorSpeed}px/s`}
                  min={GAMEPAD_CURSOR_SPEED_RANGE.minimum}
                  max={GAMEPAD_CURSOR_SPEED_RANGE.maximum}
                  step={40}
                  value={settings.cursorSpeed}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            cursorSpeed: Number(event.currentTarget.value),
                          }
                        : current,
                    )
                  }
                />
                <UiRange
                  label={`滚动速度：${settings.scrollSpeed}px/s`}
                  min={GAMEPAD_SCROLL_SPEED_RANGE.minimum}
                  max={GAMEPAD_SCROLL_SPEED_RANGE.maximum}
                  step={10}
                  value={settings.scrollSpeed}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            scrollSpeed: Number(event.currentTarget.value),
                          }
                        : current,
                    )
                  }
                />
              </div>
            </section>
            <section className="gamepad-control-settings__range-section">
              <header>
                <strong className="gamepad-control-settings__range-title">
                  光标加速时间线
                </strong>
                <span className="gamepad-control-settings__range-description">
                  只控制光标从静止到目标速度的缓冲；滚动始终即时响应摇杆幅度
                </span>
              </header>
              <div className="gamepad-control-settings__ranges">
                <UiRange
                  label={`光标加速：${settings.cursorRampMs}ms`}
                  min={GAMEPAD_CURSOR_ACCELERATION_DURATION_RANGE.minimum}
                  max={GAMEPAD_CURSOR_ACCELERATION_DURATION_RANGE.maximum}
                  step={20}
                  value={settings.cursorRampMs}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            cursorRampMs: Number(event.currentTarget.value),
                          }
                        : current,
                    )
                  }
                />
              </div>
            </section>
            <section className="gamepad-control-settings__range-section">
              <header>
                <strong className="gamepad-control-settings__range-title">
                  输入节奏
                </strong>
                <span className="gamepad-control-settings__range-description">
                  控制死区与方向导航的连续触发节奏
                </span>
              </header>
              <div className="gamepad-control-settings__ranges is-compact">
                <UiRange
                  label={`摇杆死区：${Math.round(settings.stickDeadZone * 100)}%`}
                  min={0.05}
                  max={0.45}
                  step={0.01}
                  value={settings.stickDeadZone}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            stickDeadZone: Number(event.currentTarget.value),
                          }
                        : current,
                    )
                  }
                />
                <UiRange
                  label={`方向首次重复：${settings.repeatDelayMs}ms`}
                  min={160}
                  max={800}
                  step={10}
                  value={settings.repeatDelayMs}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            repeatDelayMs: Number(event.currentTarget.value),
                          }
                        : current,
                    )
                  }
                />
                <UiRange
                  label={`方向连续重复：${settings.repeatIntervalMs}ms`}
                  min={45}
                  max={240}
                  step={5}
                  value={settings.repeatIntervalMs}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            repeatIntervalMs: Number(event.currentTarget.value),
                          }
                        : current,
                    )
                  }
                />
              </div>
            </section>
          </div>
        ) : (
          <div className="gamepad-control-settings__global">
            <div className="gamepad-control-settings__toggles">
              <UiToggle
                label="启用手柄网页控制"
                description="统一控制所有网页和扩展界面的手柄交互；关闭后可在这里重新启用。"
                checked={settings.enabled}
                disabled={busy}
                onChange={(enabled) =>
                  setSettings((current) =>
                    current ? { ...current, enabled } : current,
                  )
                }
              />
              <UiToggle
                label="显示手柄示意图"
                description="在牌库入口旁显示手柄状态与近期操作；关闭后对所有网站生效。"
                checked={settings.showControllerIndicator}
                disabled={busy}
                onChange={(showControllerIndicator) =>
                  setSettings((current) =>
                    current ? { ...current, showControllerIndicator } : current,
                  )
                }
              />
            </div>
          </div>
        )}
      </div>
    </UiDialog>
  );
}
