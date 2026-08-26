import { ExternalLink, KeyRound, ShieldCheck } from 'lucide-react';
import { assistantTargetStatus } from '../../ai/domain/assistant-presentation';
import type {
  AssistantReadinessIssue,
  MicrophonePermissionState,
} from '../../ai/domain/assistant-readiness';
import type {
  AiServicesConfigView,
  AiServicesController,
  AssistantTabTargetState,
} from '../../ai/domain/types';
import { MotionIconSwap } from '../../components/ui/MotionIconSwap';
import type { ExtensionSpeechCapability } from '../../hosts/extension/speech-capability';
import type { UserscriptExecutionCapability } from '../../userscript/runtime/capabilities';
import { SettingsReadiness, SettingsRow } from './AssistantSettingsPrimitives';
import { ImageServiceSettings } from './ImageServiceSettings';
import { ModelServiceSettings } from './ModelServiceSettings';
import { SpeechRecognitionSettings } from './SpeechRecognitionSettings';

type AwaitableAction = void | Promise<void>;

export function AssistantSettingsPanel({
  visible,
  readinessIssues,
  readinessLoading,
  services,
  servicesConfig,
  speechCapability,
  shortcut,
  attachedPage,
  microphonePermission,
  userscriptCapability,
  onConfigChange,
  onOpenShortcuts,
  onOpenMicrophonePermission,
  onRequestUserscriptPermission,
}: {
  visible: boolean;
  readinessIssues: AssistantReadinessIssue[];
  readinessLoading: boolean;
  services?: AiServicesController;
  servicesConfig: AiServicesConfigView | null;
  speechCapability: ExtensionSpeechCapability;
  shortcut?: string;
  attachedPage?: AssistantTabTargetState;
  microphonePermission: MicrophonePermissionState;
  userscriptCapability: UserscriptExecutionCapability | null;
  onConfigChange: (config: AiServicesConfigView) => void;
  onOpenShortcuts?: () => AwaitableAction;
  onOpenMicrophonePermission?: () => AwaitableAction;
  onRequestUserscriptPermission?: () => AwaitableAction;
}) {
  return (
    <div
      className="cm-assistant-panel cm-assistant-settings-panel"
      id="settingsPanel"
      hidden={!visible}
    >
      <SettingsRow label="配置检查">
        <SettingsReadiness
          issues={readinessIssues}
          loading={readinessLoading}
          onOpenMicrophonePermission={onOpenMicrophonePermission}
        />
      </SettingsRow>
      <SettingsRow label="模型服务">
        <ModelServiceSettings
          services={services}
          config={servicesConfig}
          onConfigChange={onConfigChange}
        />
      </SettingsRow>
      <SettingsRow label="脚本执行">
        <div className="cm-assistant-capability-setting">
          <span
            className={`cm-assistant-capability-setting__state is-${
              userscriptCapability?.status ?? 'checking'
            }`}
          >
            <MotionIconSwap
              state={
                userscriptCapability?.status === 'available'
                  ? 'available'
                  : 'required'
              }
              items={[
                { state: 'available', icon: <ShieldCheck size={15} /> },
                { state: 'required', icon: <KeyRound size={15} /> },
              ]}
            />
            {userscriptCapability === null
              ? '正在检查'
              : userscriptCapability.status === 'available'
                ? '已授权'
                : '需要处理'}
          </span>
          {userscriptCapability?.status === 'permission-required' &&
            onRequestUserscriptPermission && (
              <button
                type="button"
                className="cm-assistant-secondary-button"
                onClick={() => void onRequestUserscriptPermission()}
              >
                <KeyRound size={14} aria-hidden="true" />
                授权并重启扩展
              </button>
            )}
          {userscriptCapability?.status !== 'available' &&
            userscriptCapability !== null && (
              <p className="cm-assistant-settings-copy">
                {userscriptCapability.message}
              </p>
            )}
        </div>
      </SettingsRow>
      <SettingsRow label="唤出快捷键">
        <div className="cm-assistant-shortcut-setting">
          {onOpenShortcuts ? (
            <button
              type="button"
              className="cm-assistant-secondary-button"
              onClick={() => void onOpenShortcuts()}
            >
              <ExternalLink size={14} aria-hidden="true" />
              修改快捷键
            </button>
          ) : (
            <span className="cm-assistant-shortcut-setting__label">
              当前快捷键
            </span>
          )}
          <kbd>{shortcut || '未设置'}</kbd>
        </div>
      </SettingsRow>
      <SettingsRow label="操作目标">
        <p className="cm-assistant-settings-copy">
          {assistantTargetStatus(attachedPage)}
        </p>
      </SettingsRow>
      <SettingsRow label="图像生成">
        <ImageServiceSettings
          services={services}
          config={servicesConfig}
          onConfigChange={onConfigChange}
        />
      </SettingsRow>
      {speechCapability.available && (
        <SettingsRow label="语音识别">
          <SpeechRecognitionSettings
            services={services}
            config={servicesConfig}
            capability={speechCapability}
            permissionState={microphonePermission}
            onConfigChange={onConfigChange}
            onOpenMicrophonePermission={onOpenMicrophonePermission}
          />
        </SettingsRow>
      )}
    </div>
  );
}
