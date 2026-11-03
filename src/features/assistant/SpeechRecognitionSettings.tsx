import { useState } from 'react';
import { assistantUserFacingError } from '../../ai/domain/assistant-presentation';
import type { MicrophonePermissionState } from '../../ai/domain/assistant-readiness';
import type {
  AiServicesConfigView,
  AiServicesController,
} from '../../ai/domain/types';
import { UiLoader } from '../../components/ui/Ui';
import type { ExtensionSpeechCapability } from '../../hosts/extension/speech-capability';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import { CredentialField } from './AssistantSettingsPrimitives';

type AwaitableAction = void | Promise<void>;
const VOLCENGINE_SPEECH_GUIDE = 'https://docs.volcengine.com/docs/6561/1354869';

export function SpeechRecognitionSettings({
  services,
  config,
  capability,
  permissionState,
  onConfigChange,
  onOpenMicrophonePermission,
}: {
  services?: AiServicesController;
  config: AiServicesConfigView | null;
  capability: ExtensionSpeechCapability;
  permissionState: MicrophonePermissionState;
  onConfigChange: (config: AiServicesConfigView) => void;
  onOpenMicrophonePermission?: () => AwaitableAction;
}) {
  useLocale();

  const [apiKey, setApiKey] = useState('');
  const [operation, setOperation] = useState<'save' | 'test' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = operation !== null;

  if (!capability.available) {
    return (
      <div className="cm-assistant-service-unavailable" role="note">
        <strong>{capability.title}</strong>
        <p>{capability.message}</p>
      </div>
    );
  }

  if (!services) {
    return (
      <p className="cm-assistant-settings-copy">
        {t('cm_speech_recognition_settings_text_1')}
      </p>
    );
  }

  const save = () => {
    setOperation('save');
    setStatus(null);
    setError(null);
    void (async () => {
      try {
        const candidate = { apiKey };
        const next = await services.saveSpeechService(candidate);
        onConfigChange(next);
        setApiKey('');
        setStatus(t('cm_speech_recognition_settings_text_2'));
        try {
          const probe = await services.testSpeechService(candidate);
          if (probe.ok) {
            setStatus(t('cm_speech_recognition_settings_text_3'));
          } else {
            setError(
              t('cm_speech_recognition_settings_text_4', [
                String(
                  assistantUserFacingError(
                    probe.error || t('cm_speech_recognition_settings_text_9'),
                  ),
                ),
              ]),
            );
          }
        } catch (failure) {
          setError(
            t('cm_speech_recognition_settings_text_5', [
              String(assistantUserFacingError(failure)),
            ]),
          );
        }
      } catch (failure) {
        setError(assistantUserFacingError(failure));
      } finally {
        setOperation(null);
      }
    })();
  };

  const test = () => {
    setOperation('test');
    setStatus(null);
    setError(null);
    void services
      .testSpeechService(apiKey ? { apiKey } : {})
      .then((probe) => {
        if (probe.ok) {
          setStatus(t('cm_speech_recognition_settings_text_6'));
          return;
        }
        setError(
          assistantUserFacingError(
            probe.error || t('cm_speech_recognition_settings_text_7'),
          ),
        );
      })
      .catch((failure) => setError(assistantUserFacingError(failure)))
      .finally(() => setOperation(null));
  };

  const clearCredential = () => {
    if (apiKey) {
      setApiKey('');
      return;
    }
    if (!config?.speechService.hasCredential) return;
    setOperation('save');
    setStatus(null);
    setError(null);
    void services
      .clearSpeechServiceCredential()
      .then((next) => {
        onConfigChange(next);
        setStatus(t('cm_speech_recognition_settings_text_8'));
      })
      .catch((failure) => setError(assistantUserFacingError(failure)))
      .finally(() => setOperation(null));
  };

  return (
    <div className="cm-assistant-service-settings">
      <CredentialField
        label={t('cm_speech_recognition_settings_label_9')}
        value={apiKey}
        hasCredential={Boolean(config?.speechService.hasCredential)}
        busy={busy}
        placeholder={t('cm_speech_recognition_settings_placeholder_10')}
        clearSavedLabel={t(
          'cm_speech_recognition_settings_clear_saved_label_11',
        )}
        onChange={setApiKey}
        onClear={clearCredential}
      />
      {!config?.speechService.hasCredential && (
        <a
          className="cm-assistant-secondary-button"
          href={VOLCENGINE_SPEECH_GUIDE}
          target="_blank"
          rel="noreferrer"
        >
          {t('cm_speech_recognition_settings_text_12')}
        </a>
      )}
      {permissionState !== 'granted' && (
        <div className="cm-assistant-service-permission">
          <span className="cm-assistant-service-field__label">
            {t('cm_speech_recognition_settings_text_13')}
          </span>
          <div className="cm-assistant-service-permission__control">
            <span
              className={`cm-assistant-service-permission__state is-${permissionState}`}
            >
              {permissionState === 'denied'
                ? t('cm_speech_recognition_settings_text_14')
                : permissionState === 'prompt'
                  ? t('cm_speech_recognition_settings_text_15')
                  : t('cm_speech_recognition_settings_text_16')}
            </span>
            {onOpenMicrophonePermission && (
              <button
                type="button"
                className="cm-assistant-secondary-button"
                disabled={busy}
                onClick={() => void onOpenMicrophonePermission()}
              >
                {t('cm_speech_recognition_settings_text_17')}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="cm-assistant-service-settings__actions">
        <UiLoader
          visible={busy}
          compact
          className="cm-assistant-service-loader"
          label={
            operation === 'test'
              ? t('cm_speech_recognition_settings_text_18')
              : t('cm_speech_recognition_settings_text_19')
          }
        />
        <button
          type="button"
          className="cm-assistant-secondary-button"
          disabled={busy || (!apiKey && !config?.speechService.hasCredential)}
          onClick={test}
        >
          {t('cm_speech_recognition_settings_text_20')}
        </button>
        <button
          type="button"
          className="cm-assistant-primary-button"
          disabled={busy || !apiKey}
          onClick={save}
        >
          {t('cm_speech_recognition_settings_text_21')}
        </button>
      </div>
      {status && <p className="is-success">{status}</p>}
      {error && <p className="is-error">{error}</p>}
    </div>
  );
}
