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
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import { GamepadMappingEditor } from './GamepadMappingEditor';
import { GamepadResponseCurveEditor } from './GamepadResponseCurveEditor';

const SETTINGS_TABS = [
  {
    value: 'mapping',
    get label() {
      return t('cm_gamepad_settings_dialog_label_1');
    },
  },
  {
    value: 'feel',
    get label() {
      return t('cm_gamepad_settings_dialog_label_2');
    },
  },
  {
    value: 'global',
    get label() {
      return t('cm_gamepad_settings_dialog_label_3');
    },
  },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['value'];

export function GamepadSettingsDialog({
  controller,
  onClose,
}: {
  controller: GamepadControlController;
  onClose: () => void;
}) {
  useLocale();

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
      setStatus(t('cm_gamepad_settings_dialog_text_4'));
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
        ariaLabel={t('cm_gamepad_settings_dialog_aria_label_5')}
        title={t('cm_gamepad_settings_dialog_title_6')}
        className="gamepad-control-dialog"
        onClose={onClose}
      >
        <UiLoader
          large
          visible={busy}
          label={t('cm_gamepad_settings_dialog_label_7')}
        />
        {!busy && (
          <UiNotice
            tone="error"
            title={t('cm_gamepad_settings_dialog_title_8')}
          >
            <p>{status}</p>
          </UiNotice>
        )}
      </UiDialog>
    );
  }

  return (
    <UiDialog
      ariaLabel={t('cm_gamepad_settings_dialog_aria_label_9')}
      title={t('cm_gamepad_settings_dialog_title_10')}
      className="gamepad-control-dialog"
      status={{
        label: !settings.enabled
          ? t('cm_gamepad_settings_dialog_text_11')
          : snapshot.connected
            ? t('cm_gamepad_settings_dialog_text_12')
            : t('cm_gamepad_settings_dialog_text_13'),
        tone: !settings.enabled
          ? 'inactive'
          : snapshot.connected
            ? 'active'
            : 'neutral',
      }}
      onClose={onClose}
      navigation={
        <UiSegmentedControl
          label={t('cm_gamepad_settings_dialog_label_14')}
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
            label={t('cm_gamepad_settings_dialog_label_15')}
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
              setStatus(t('cm_gamepad_settings_dialog_text_16'));
              setError(false);
            }}
          >
            <RotateCcw size={15} aria-hidden="true" />
            {t('cm_gamepad_settings_dialog_text_17')}
          </UiButton>
          <UiButton
            variant="primary"
            disabled={busy}
            onClick={() => void save()}
          >
            <Save size={15} aria-hidden="true" />
            {t('cm_gamepad_settings_dialog_text_18')}
          </UiButton>
        </>
      }
    >
      <div className="gamepad-control-settings">
        {tab === 'mapping' ? (
          <>
            <UiNotice
              title={t('cm_gamepad_settings_dialog_title_19')}
              icon={<Gamepad2 size={20} aria-hidden="true" />}
            >
              <p>{t('cm_gamepad_settings_dialog_text_20')}</p>
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
                setStatus(
                  t('cm_gamepad_settings_dialog_text_21', [String(message)]),
                );
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
                setStatus(t('cm_gamepad_settings_dialog_text_22'));
                setError(false);
              }}
            />
            <section className="gamepad-control-settings__range-section">
              <header>
                <strong className="gamepad-control-settings__range-title">
                  {t('cm_gamepad_settings_dialog_text_23')}
                </strong>
                <span className="gamepad-control-settings__range-description">
                  {t('cm_gamepad_settings_dialog_text_24')}
                </span>
              </header>
              <div className="gamepad-control-settings__ranges">
                <UiRange
                  label={t('cm_gamepad_settings_dialog_text_25', [
                    String(settings.cursorSpeed),
                  ])}
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
                  label={t('cm_gamepad_settings_dialog_text_26', [
                    String(settings.scrollSpeed),
                  ])}
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
                  {t('cm_gamepad_settings_dialog_text_27')}
                </strong>
                <span className="gamepad-control-settings__range-description">
                  {t('cm_gamepad_settings_dialog_text_28')}
                </span>
              </header>
              <div className="gamepad-control-settings__ranges">
                <UiRange
                  label={t('cm_gamepad_settings_dialog_text_29', [
                    String(settings.cursorRampMs),
                  ])}
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
                  {t('cm_gamepad_settings_dialog_text_30')}
                </strong>
                <span className="gamepad-control-settings__range-description">
                  {t('cm_gamepad_settings_dialog_text_31')}
                </span>
              </header>
              <div className="gamepad-control-settings__ranges is-compact">
                <UiRange
                  label={t('cm_gamepad_settings_dialog_text_32', [
                    String(Math.round(settings.stickDeadZone * 100)),
                  ])}
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
                  label={t('cm_gamepad_settings_dialog_text_33', [
                    String(settings.repeatDelayMs),
                  ])}
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
                  label={t('cm_gamepad_settings_dialog_text_34', [
                    String(settings.repeatIntervalMs),
                  ])}
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
                label={t('cm_gamepad_settings_dialog_label_35')}
                description={t('cm_gamepad_settings_dialog_description_36')}
                checked={settings.enabled}
                disabled={busy}
                onChange={(enabled) =>
                  setSettings((current) =>
                    current ? { ...current, enabled } : current,
                  )
                }
              />
              <UiToggle
                label={t('cm_gamepad_settings_dialog_label_37')}
                description={t('cm_gamepad_settings_dialog_description_38')}
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
