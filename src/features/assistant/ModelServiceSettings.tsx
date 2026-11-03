import { useEffect, useState } from 'react';
import { assistantUserFacingError } from '../../ai/domain/assistant-presentation';
import type {
  AiModelProtocol,
  AiReasoningEffort,
  AiServicesConfigView,
  AiServicesController,
  ModelServiceProbe,
} from '../../ai/domain/types';
import {
  DEFAULT_MODEL_SERVICE_MODEL,
  MODEL_SERVICE_BASE_URL_PRESETS,
  MODEL_SERVICE_PRESETS,
} from '../../ai/domain/types';
import { UiLoader } from '../../components/ui/Ui';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import { CredentialField } from './AssistantSettingsPrimitives';

const REASONING_EFFORT_OPTIONS = [
  {
    value: 'off',
    get label() {
      return t('cm_model_service_settings_label_1');
    },
  },
  {
    value: 'low',
    get label() {
      return t('cm_model_service_settings_label_2');
    },
  },
  {
    value: 'medium',
    get label() {
      return t('cm_model_service_settings_label_3');
    },
  },
  {
    value: 'high',
    get label() {
      return t('cm_model_service_settings_label_4');
    },
  },
  {
    value: 'max',
    get label() {
      return t('cm_model_service_settings_label_5');
    },
  },
] as const satisfies readonly {
  value: AiReasoningEffort;
  label: string;
}[];

const MODEL_PROTOCOL_OPTIONS = [
  {
    value: 'responses',
    label: 'Responses API',
    get description() {
      return t('cm_model_service_settings_description_6');
    },
  },
  {
    value: 'chat-completions',
    label: 'Chat Completions API',
    get description() {
      return t('cm_model_service_settings_description_7');
    },
  },
] as const satisfies readonly {
  value: AiModelProtocol;
  label: string;
  description: string;
}[];

export function ModelServiceSettings({
  services,
  config,
  onConfigChange,
}: {
  services?: AiServicesController;
  config: AiServicesConfigView | null;
  onConfigChange: (config: AiServicesConfigView) => void;
}) {
  useLocale();

  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState<string>(DEFAULT_MODEL_SERVICE_MODEL);
  const [protocol, setProtocol] = useState<AiModelProtocol>('responses');
  const [reasoningEffort, setReasoningEffort] =
    useState<AiReasoningEffort>('high');
  const [apiKey, setApiKey] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<ModelServiceProbe | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config || dirty) return;
    setBaseUrl(config.modelService.baseUrl);
    setModel(config.modelService.model);
    setProtocol(config.modelService.protocol);
    setReasoningEffort(config.modelService.reasoningEffort);
  }, [config, dirty]);

  if (!services) {
    return (
      <p className="cm-assistant-settings-copy">
        {t('cm_model_service_settings_text_8')}
      </p>
    );
  }

  const input = () => ({
    baseUrl,
    model,
    protocol,
    reasoningEffort,
    ...(apiKey ? { apiKey } : {}),
  });

  const clearCredential = () => {
    if (apiKey) {
      setApiKey('');
      return;
    }
    if (!config?.modelService.hasCredential) return;
    setBusy(true);
    setError(null);
    void services
      .clearModelServiceCredential()
      .then(onConfigChange)
      .catch((failure) => setError(assistantUserFacingError(failure)))
      .finally(() => setBusy(false));
  };

  const update = (change: () => void) => {
    change();
    setDirty(true);
    setProbe(null);
  };

  return (
    <div className="cm-assistant-service-settings">
      <label className="cm-assistant-service-field">
        <span className="cm-assistant-service-field__label">
          {t('cm_model_service_settings_text_9')}
        </span>
        <input
          className="cm-assistant-form-control"
          value={baseUrl}
          type="url"
          list="cm-assistant-base-url-presets"
          placeholder={t('cm_model_service_settings_placeholder_10')}
          disabled={busy}
          onChange={(event) => update(() => setBaseUrl(event.target.value))}
        />
        <datalist id="cm-assistant-base-url-presets">
          {MODEL_SERVICE_BASE_URL_PRESETS.map((candidate) => (
            <option key={candidate.url} value={candidate.url}>
              {candidate.label}
            </option>
          ))}
        </datalist>
      </label>
      <CredentialField
        label={t('cm_model_service_settings_label_11')}
        value={apiKey}
        hasCredential={Boolean(config?.modelService.hasCredential)}
        busy={busy}
        placeholder={t('cm_model_service_settings_placeholder_12')}
        clearSavedLabel={t('cm_model_service_settings_clear_saved_label_13')}
        onChange={setApiKey}
        onClear={clearCredential}
      />
      <label className="cm-assistant-service-field">
        <span className="cm-assistant-service-field__label">
          {t('cm_model_service_settings_text_14')}
        </span>
        <select
          className="cm-assistant-form-control"
          value={protocol}
          disabled={busy}
          onChange={(event) =>
            update(() => setProtocol(event.target.value as AiModelProtocol))
          }
        >
          {MODEL_PROTOCOL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="cm-assistant-settings-copy">
        {
          MODEL_PROTOCOL_OPTIONS.find((option) => option.value === protocol)
            ?.description
        }
      </p>
      <label className="cm-assistant-service-field">
        <span className="cm-assistant-service-field__label">
          {t('cm_model_service_settings_text_15')}
        </span>
        <input
          className="cm-assistant-form-control"
          value={model}
          list="cm-assistant-model-presets"
          placeholder={t('cm_model_service_settings_placeholder_16')}
          disabled={busy}
          spellCheck={false}
          onChange={(event) => update(() => setModel(event.target.value))}
        />
        <datalist id="cm-assistant-model-presets">
          {MODEL_SERVICE_PRESETS.map((candidate) => (
            <option key={candidate.id} value={candidate.id} />
          ))}
        </datalist>
      </label>
      <label className="cm-assistant-service-field">
        <span className="cm-assistant-service-field__label">
          {t('cm_model_service_settings_text_17')}
        </span>
        <select
          className="cm-assistant-form-control"
          value={reasoningEffort}
          disabled={busy}
          onChange={(event) =>
            update(() =>
              setReasoningEffort(event.target.value as AiReasoningEffort),
            )
          }
        >
          {REASONING_EFFORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="cm-assistant-service-settings__actions">
        <UiLoader
          visible={busy}
          compact
          className="cm-assistant-service-loader"
          label={t('cm_model_service_settings_label_18')}
        />
        <button
          type="button"
          className="cm-assistant-secondary-button"
          disabled={busy || !baseUrl.trim() || !model.trim()}
          onClick={() => {
            setBusy(true);
            setError(null);
            setProbe(null);
            void services
              .testModelService(input())
              .then(setProbe)
              .catch((failure) => setError(assistantUserFacingError(failure)))
              .finally(() => setBusy(false));
          }}
        >
          {t('cm_model_service_settings_text_19')}
        </button>
        <button
          type="button"
          className="cm-assistant-primary-button"
          disabled={busy || !baseUrl.trim() || !model.trim()}
          onClick={() => {
            const candidate = input();
            setBusy(true);
            setStatus(null);
            setError(null);
            setProbe(null);
            void (async () => {
              try {
                const next = await services.saveModelService(candidate);
                setDirty(false);
                setApiKey('');
                onConfigChange(next);
                setStatus(t('cm_model_service_settings_text_20'));
                try {
                  const result = await services.testModelService(candidate);
                  setProbe(result);
                  if (result.ok) {
                    setStatus(t('cm_model_service_settings_text_21'));
                  }
                } catch (failure) {
                  setError(
                    t('cm_model_service_settings_text_22', [
                      String(assistantUserFacingError(failure)),
                    ]),
                  );
                }
              } catch (failure) {
                setError(assistantUserFacingError(failure));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {t('cm_model_service_settings_text_23')}
        </button>
      </div>
      {status && <p className="is-success">{status}</p>}
      {probe && (
        <p className={probe.ok ? 'is-success' : 'is-error'}>
          {probe.ok
            ? t('cm_model_service_settings_text_24', [
                String(probe.model),
                String((probe.durationMs / 1_000).toFixed(2)),
              ])
            : assistantUserFacingError(
                probe.error || t('cm_model_service_settings_text_25'),
              )}
        </p>
      )}
      {error && <p className="is-error">{error}</p>}
    </div>
  );
}
