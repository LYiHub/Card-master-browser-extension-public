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
import { CredentialField } from './AssistantSettingsPrimitives';

const REASONING_EFFORT_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'max', label: '最高' },
] as const satisfies readonly {
  value: AiReasoningEffort;
  label: string;
}[];

const MODEL_PROTOCOL_OPTIONS = [
  {
    value: 'responses',
    label: 'Responses API',
    description: '使用统一的 Responses 输入项、流式事件和函数工具格式。',
  },
  {
    value: 'chat-completions',
    label: 'Chat Completions API',
    description: '使用 messages、tool_calls 和流式增量格式。',
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
    return <p className="cm-assistant-settings-copy">请在扩展设置中配置。</p>;
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
        <span className="cm-assistant-service-field__label">API 地址</span>
        <input
          className="cm-assistant-form-control"
          value={baseUrl}
          type="url"
          list="cm-assistant-base-url-presets"
          placeholder="API 基础地址"
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
        label="API 密钥"
        value={apiKey}
        hasCredential={Boolean(config?.modelService.hasCredential)}
        busy={busy}
        placeholder="输入 API 密钥"
        clearSavedLabel="清除已保存密钥"
        onChange={setApiKey}
        onClear={clearCredential}
      />
      <label className="cm-assistant-service-field">
        <span className="cm-assistant-service-field__label">API 格式</span>
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
        <span className="cm-assistant-service-field__label">模型</span>
        <input
          className="cm-assistant-form-control"
          value={model}
          list="cm-assistant-model-presets"
          placeholder="输入服务支持的模型 ID"
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
        <span className="cm-assistant-service-field__label">推理强度</span>
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
          label="正在处理模型服务"
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
          测试连接
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
                setStatus('模型配置已保存。');
                try {
                  const result = await services.testModelService(candidate);
                  setProbe(result);
                  if (result.ok) {
                    setStatus('模型配置已保存，连接测试通过。');
                  }
                } catch (failure) {
                  setError(
                    `模型配置已保存，但连接测试失败：${assistantUserFacingError(failure)}`,
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
          保存
        </button>
      </div>
      {status && <p className="is-success">{status}</p>}
      {probe && (
        <p className={probe.ok ? 'is-success' : 'is-error'}>
          {probe.ok
            ? `${probe.model} 连接成功（${(probe.durationMs / 1_000).toFixed(
                2,
              )} 秒）`
            : assistantUserFacingError(probe.error || '连接失败')}
        </p>
      )}
      {error && <p className="is-error">{error}</p>}
    </div>
  );
}
