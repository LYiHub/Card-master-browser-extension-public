import { useEffect, useState } from 'react';
import { assistantUserFacingError } from '../../ai/domain/assistant-presentation';
import { AI_IMAGE_GENERATION_MODEL } from '../../ai/domain/image-generation';
import type {
  AiServicesConfigView,
  AiServicesController,
  ImageServiceCredentialSource,
  ImageServiceProtocol,
} from '../../ai/domain/types';
import { IMAGE_GENERATION_PROTOCOL_ADAPTERS } from '../../ai/infrastructure/image-generation-protocol-registry';
import { UiLoader } from '../../components/ui/Ui';
import { CredentialField } from './AssistantSettingsPrimitives';

export function ImageServiceSettings({
  services,
  config,
  onConfigChange,
}: {
  services?: AiServicesController;
  config: AiServicesConfigView | null;
  onConfigChange: (config: AiServicesConfigView) => void;
}) {
  const [credentialSource, setCredentialSource] =
    useState<ImageServiceCredentialSource>('model-service');
  const [protocol, setProtocol] =
    useState<ImageServiceProtocol>('openai-images');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState(AI_IMAGE_GENERATION_MODEL);
  const [apiKey, setApiKey] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config || dirty) return;
    setCredentialSource(config.imageService.credentialSource);
    setProtocol(config.imageService.protocol);
    setBaseUrl(config.imageService.baseUrl);
    setModel(config.imageService.model);
  }, [config, dirty]);

  if (!services) {
    return <p className="cm-assistant-settings-copy">请在扩展设置中配置。</p>;
  }

  const independent = credentialSource === 'independent';
  const separateBaseUrl = independent || protocol === 'dashscope';
  const currentAdapter = IMAGE_GENERATION_PROTOCOL_ADAPTERS.find(
    (adapter) => adapter.protocol === protocol,
  );

  const update = (change: () => void) => {
    change();
    setDirty(true);
    setStatus(null);
    setError(null);
  };

  const clearCredential = () => {
    if (apiKey) {
      setApiKey('');
      return;
    }
    if (!independent || !config?.imageService.hasCredential) return;
    setBusy(true);
    setError(null);
    void services
      .clearImageServiceCredential()
      .then((next) => {
        onConfigChange(next);
        setStatus('图像服务密钥已清除。');
      })
      .catch((failure) => setError(assistantUserFacingError(failure)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="cm-assistant-service-settings">
      <label className="cm-assistant-service-field">
        <span className="cm-assistant-service-field__label">接口协议</span>
        <select
          className="cm-assistant-form-control"
          value={protocol}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value as ImageServiceProtocol;
            update(() => {
              const nextAdapter = IMAGE_GENERATION_PROTOCOL_ADAPTERS.find(
                (adapter) => adapter.protocol === next,
              );
              if (nextAdapter) {
                if (
                  !baseUrl.trim() ||
                  baseUrl === currentAdapter?.defaultBaseUrl
                ) {
                  setBaseUrl(nextAdapter.defaultBaseUrl);
                }
                if (
                  !model.trim() ||
                  IMAGE_GENERATION_PROTOCOL_ADAPTERS.some(
                    (adapter) => adapter.defaultModel === model,
                  )
                ) {
                  setModel(nextAdapter.defaultModel);
                }
              }
              setProtocol(next);
            });
          }}
        >
          {IMAGE_GENERATION_PROTOCOL_ADAPTERS.map((adapter) => (
            <option key={adapter.protocol} value={adapter.protocol}>
              {adapter.label}
            </option>
          ))}
        </select>
      </label>
      <p className="cm-assistant-settings-copy">
        {currentAdapter?.description}
      </p>
      <label className="cm-assistant-service-field">
        <span className="cm-assistant-service-field__label">凭据来源</span>
        <select
          className="cm-assistant-form-control"
          value={credentialSource}
          disabled={busy}
          onChange={(event) =>
            update(() =>
              setCredentialSource(
                event.target.value as ImageServiceCredentialSource,
              ),
            )
          }
        >
          <option value="model-service">沿用模型服务</option>
          <option value="independent">独立图像服务</option>
        </select>
      </label>
      {separateBaseUrl && (
        <>
          <label className="cm-assistant-service-field">
            <span className="cm-assistant-service-field__label">API 地址</span>
            <input
              className="cm-assistant-form-control"
              value={baseUrl}
              type="url"
              placeholder="图像服务基础地址"
              disabled={busy}
              onChange={(event) => update(() => setBaseUrl(event.target.value))}
            />
          </label>
          {independent && (
            <CredentialField
              label="API 密钥"
              value={apiKey}
              hasCredential={Boolean(
                config?.imageService.hasCredential &&
                  config.imageService.protocol === protocol,
              )}
              busy={busy}
              placeholder="输入图像服务 API 密钥"
              clearSavedLabel="清除已保存图像服务密钥"
              onChange={setApiKey}
              onClear={clearCredential}
            />
          )}
        </>
      )}
      <label className="cm-assistant-service-field">
        <span className="cm-assistant-service-field__label">生图模型</span>
        <input
          className="cm-assistant-form-control"
          value={model}
          placeholder={
            currentAdapter?.defaultModel ?? AI_IMAGE_GENERATION_MODEL
          }
          disabled={busy}
          spellCheck={false}
          onChange={(event) => update(() => setModel(event.target.value))}
        />
      </label>
      <p className="cm-assistant-settings-copy">
        {independent
          ? `请求使用${currentAdapter?.label ?? protocol}的生成参数和响应格式。`
          : protocol === 'dashscope'
            ? '沿用模型服务的 API 密钥，单独使用上方百炼图像 API 地址。'
            : '沿用模型服务的 API 地址和密钥，只单独指定生图模型。'}
      </p>
      <div className="cm-assistant-service-settings__actions">
        <UiLoader
          visible={busy}
          compact
          className="cm-assistant-service-loader"
          label="正在保存图像配置"
        />
        <button
          type="button"
          className="cm-assistant-primary-button"
          disabled={
            busy || !model.trim() || (separateBaseUrl && !baseUrl.trim())
          }
          onClick={() => {
            setBusy(true);
            setStatus(null);
            setError(null);
            void services
              .saveImageService({
                credentialSource,
                protocol,
                baseUrl:
                  baseUrl.trim() ||
                  config?.modelService.baseUrl ||
                  'https://api.openai.com/v1',
                model,
                ...(apiKey ? { apiKey } : {}),
              })
              .then((next) => {
                setDirty(false);
                setApiKey('');
                onConfigChange(next);
                setStatus('图像服务配置已保存。');
              })
              .catch((failure) => setError(assistantUserFacingError(failure)))
              .finally(() => setBusy(false));
          }}
        >
          保存图像配置
        </button>
      </div>
      {status && <p className="is-success">{status}</p>}
      {error && <p className="is-error">{error}</p>}
    </div>
  );
}
