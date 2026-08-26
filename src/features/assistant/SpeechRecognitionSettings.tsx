import { useState } from 'react';
import { assistantUserFacingError } from '../../ai/domain/assistant-presentation';
import type { MicrophonePermissionState } from '../../ai/domain/assistant-readiness';
import type {
  AiServicesConfigView,
  AiServicesController,
} from '../../ai/domain/types';
import { UiLoader } from '../../components/ui/Ui';
import type { ExtensionSpeechCapability } from '../../hosts/extension/speech-capability';
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
    return <p className="cm-assistant-settings-copy">请在扩展设置中配置。</p>;
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
        setStatus('语音识别配置已保存。');
        try {
          const probe = await services.testSpeechService(candidate);
          if (probe.ok) {
            setStatus('语音识别配置已保存，连接测试通过。');
          } else {
            setError(
              `语音识别配置已保存，但连接测试失败：${assistantUserFacingError(
                probe.error || '无法连接语音识别服务',
              )}`,
            );
          }
        } catch (failure) {
          setError(
            `语音识别配置已保存，但连接测试失败：${assistantUserFacingError(
              failure,
            )}`,
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
          setStatus('语音识别连接测试通过。');
          return;
        }
        setError(
          assistantUserFacingError(probe.error || '无法连接语音识别服务。'),
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
        setStatus('语音识别 API 密钥已清除。');
      })
      .catch((failure) => setError(assistantUserFacingError(failure)))
      .finally(() => setOperation(null));
  };

  return (
    <div className="cm-assistant-service-settings">
      <CredentialField
        label="火山引擎 API 密钥"
        value={apiKey}
        hasCredential={Boolean(config?.speechService.hasCredential)}
        busy={busy}
        placeholder="输入语音识别 API 密钥"
        clearSavedLabel="清除已保存语音识别密钥"
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
          查看火山引擎配置指南
        </a>
      )}
      {permissionState !== 'granted' && (
        <div className="cm-assistant-service-permission">
          <span className="cm-assistant-service-field__label">麦克风权限</span>
          <div className="cm-assistant-service-permission__control">
            <span
              className={`cm-assistant-service-permission__state is-${permissionState}`}
            >
              {permissionState === 'denied'
                ? '已阻止'
                : permissionState === 'prompt'
                  ? '等待授权'
                  : '等待检测'}
            </span>
            {onOpenMicrophonePermission && (
              <button
                type="button"
                className="cm-assistant-secondary-button"
                disabled={busy}
                onClick={() => void onOpenMicrophonePermission()}
              >
                授予权限
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
              ? '正在测试语音识别连接'
              : '正在保存语音识别配置'
          }
        />
        <button
          type="button"
          className="cm-assistant-secondary-button"
          disabled={busy || (!apiKey && !config?.speechService.hasCredential)}
          onClick={test}
        >
          测试连接
        </button>
        <button
          type="button"
          className="cm-assistant-primary-button"
          disabled={busy || !apiKey}
          onClick={save}
        >
          保存语音配置
        </button>
      </div>
      {status && <p className="is-success">{status}</p>}
      {error && <p className="is-error">{error}</p>}
    </div>
  );
}
