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
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
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
          ? t('cm_media_speed_settings_board_text_1')
          : t('cm_media_speed_settings_board_text_2'),
    )
    .join('\n');
}

function parseWheelDefinition(value: string): MediaSpeedWheelItem[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0)
    throw new Error(t('cm_media_speed_settings_board_error_3'));
  if (lines.length > 12)
    throw new Error(t('cm_media_speed_settings_board_error_4'));

  const items: MediaSpeedWheelItem[] = [];
  const speeds = new Set<number>();
  let randomAdded = false;
  let hellAdded = false;
  for (const line of lines) {
    if (/^(随机|骰子|random)$/i.test(line)) {
      if (randomAdded)
        throw new Error(t('cm_media_speed_settings_board_error_5'));
      randomAdded = true;
      items.push({ kind: 'random' });
      continue;
    }
    if (/^地狱$/u.test(line)) {
      if (hellAdded)
        throw new Error(t('cm_media_speed_settings_board_error_6'));
      hellAdded = true;
      items.push({ kind: 'hell' });
      continue;
    }
    const speed = Number(line.replace(/×$/u, ''));
    if (!isMediaSpeedStandardSpeed(speed)) {
      throw new Error(
        t('cm_media_speed_settings_board_error_7', [String(line)]),
      );
    }
    const normalized = Math.round(speed * 100) / 100;
    if (speeds.has(normalized)) {
      throw new Error(
        t('cm_media_speed_settings_board_error_8', [String(normalized)]),
      );
    }
    speeds.add(normalized);
    items.push({ kind: 'speed', speed: normalized });
  }
  if (speeds.size === 0) {
    throw new Error(t('cm_media_speed_settings_board_error_9'));
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
  useLocale();

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
      <UiDialog
        ariaLabel={t('cm_media_speed_settings_board_aria_label_10')}
        title={t('cm_media_speed_settings_board_title_11')}
        onClose={onClose}
      >
        {status.error ? (
          <UiNotice
            tone="error"
            title={t('cm_media_speed_settings_board_title_12')}
            copyText={status.message}
          >
            <p>{status.message}</p>
          </UiNotice>
        ) : (
          <UiLoader large label={t('cm_media_speed_settings_board_label_13')} />
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
      message: t('cm_media_speed_settings_board_message_14'),
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
      ariaLabel={t('cm_media_speed_settings_board_aria_label_15')}
      title={t('cm_media_speed_settings_board_title_16')}
      status={
        !settings.enabled
          ? {
              label: t('cm_media_speed_settings_board_label_17'),
              tone: 'inactive',
            }
          : !currentSiteEnabled
            ? {
                label: t('cm_media_speed_settings_board_label_18'),
                tone: 'inactive',
              }
            : view.snapshot.mediaCount > 0
              ? {
                  label: t('cm_media_speed_settings_board_label_19', [
                    String(view.snapshot.videoCount),
                    String(view.snapshot.audioCount),
                  ]),
                  tone: 'active',
                }
              : {
                  label: t('cm_media_speed_settings_board_label_20'),
                  tone: 'active',
                }
      }
      onClose={onClose}
      footer={
        <>
          <UiLoader
            visible={busy !== null}
            compact
            className="manager-settings-operation-loader"
            label={t('cm_media_speed_settings_board_label_21')}
          />
          {busy === null && status.message && (
            <p className={status.error ? 'is-error' : ''}>{status.message}</p>
          )}
          {status.error && status.message && (
            <DiagnosticCopyButton text={status.message} />
          )}
          <UiButton disabled={busy !== null} onClick={resetDraft}>
            <RotateCcw size={14} aria-hidden="true" />
            {t('cm_media_speed_settings_board_text_22')}
          </UiButton>
          <UiButton
            variant="primary"
            disabled={busy !== null || wheelError !== null}
            onClick={() =>
              void run(
                'save',
                () => controller.saveSettings(settings),
                t('cm_media_speed_settings_board_text_23'),
              )
            }
          >
            <Save size={14} aria-hidden="true" />
            {t('cm_media_speed_settings_board_text_24')}
          </UiButton>
        </>
      }
    >
      {view.snapshot.status === 'error' && (
        <UiNotice
          tone="error"
          title={t('cm_media_speed_settings_board_title_25')}
          copyText={view.snapshot.error}
        >
          <p>
            {view.snapshot.error || t('cm_media_speed_settings_board_text_26')}
          </p>
        </UiNotice>
      )}

      <div className="manager-media-speed-intro">
        <Gauge size={22} aria-hidden="true" />
        <div>
          <strong>{t('cm_media_speed_settings_board_text_27')}</strong>
          <p>{t('cm_media_speed_settings_board_text_28')}</p>
        </div>
      </div>

      <div className="manager-media-speed-grid">
        <UiTextArea
          label={t('cm_media_speed_settings_board_label_29')}
          hint={t('cm_media_speed_settings_board_hint_30')}
          className="manager-media-speed-wheel-editor"
          value={wheelText}
          spellCheck={false}
          onChange={(event) => updateWheel(event.currentTarget.value)}
        />
        <UiSelectField
          id="media-speed-default"
          label={t('cm_media_speed_settings_board_label_31')}
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
          label={t('cm_media_speed_settings_board_label_32')}
          description={t('cm_media_speed_settings_board_description_33')}
          checked={settings.showWheel}
          onChange={(showWheel) =>
            setSettings((current) =>
              current ? { ...current, showWheel } : current,
            )
          }
        />
        <UiToggle
          label={t('cm_media_speed_settings_board_label_34')}
          description={t('cm_media_speed_settings_board_description_35')}
          checked={settings.includeAudio}
          onChange={(includeAudio) =>
            setSettings((current) =>
              current ? { ...current, includeAudio } : current,
            )
          }
        />
        <UiToggle
          label={t('cm_media_speed_settings_board_label_36')}
          description={t('cm_media_speed_settings_board_description_37')}
          checked={settings.enabled}
          onChange={(enabled) =>
            setSettings((current) =>
              current ? { ...current, enabled } : current,
            )
          }
        />
        <UiToggle
          label={t('cm_media_speed_settings_board_label_38')}
          description={
            currentHost
              ? t('cm_media_speed_settings_board_text_39', [
                  String(currentHost),
                ])
              : t('cm_media_speed_settings_board_text_40')
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
          label={t('cm_media_speed_settings_board_label_41')}
          description={
            currentHost
              ? t('cm_media_speed_settings_board_text_42')
              : t('cm_media_speed_settings_board_text_43')
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
