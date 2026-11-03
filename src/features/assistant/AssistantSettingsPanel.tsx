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
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
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
  useLocale();

  return (
    <div
      className="cm-assistant-panel cm-assistant-settings-panel"
      id="settingsPanel"
      hidden={!visible}
    >
      <SettingsRow label={t('cm_assistant_settings_panel_label_1')}>
        <SettingsReadiness
          issues={readinessIssues}
          loading={readinessLoading}
          onOpenMicrophonePermission={onOpenMicrophonePermission}
        />
      </SettingsRow>
      <SettingsRow label={t('cm_assistant_settings_panel_label_2')}>
        <ModelServiceSettings
          services={services}
          config={servicesConfig}
          onConfigChange={onConfigChange}
        />
      </SettingsRow>
      <SettingsRow label={t('cm_assistant_settings_panel_label_3')}>
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
              ? t('cm_assistant_settings_panel_text_4')
              : userscriptCapability.status === 'available'
                ? t('cm_assistant_settings_panel_text_5')
                : t('cm_assistant_settings_panel_text_6')}
          </span>
          {userscriptCapability?.status === 'permission-required' &&
            onRequestUserscriptPermission && (
              <button
                type="button"
                className="cm-assistant-secondary-button"
                onClick={() => void onRequestUserscriptPermission()}
              >
                <KeyRound size={14} aria-hidden="true" />
                {t('cm_assistant_settings_panel_text_7')}
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
      <SettingsRow label={t('cm_assistant_settings_panel_label_8')}>
        <div className="cm-assistant-shortcut-setting">
          {onOpenShortcuts ? (
            <button
              type="button"
              className="cm-assistant-secondary-button"
              onClick={() => void onOpenShortcuts()}
            >
              <ExternalLink size={14} aria-hidden="true" />
              {t('cm_assistant_settings_panel_text_9')}
            </button>
          ) : (
            <span className="cm-assistant-shortcut-setting__label">
              {t('cm_assistant_settings_panel_text_10')}
            </span>
          )}
          <kbd>{shortcut || t('cm_assistant_settings_panel_text_11')}</kbd>
        </div>
      </SettingsRow>
      <SettingsRow label={t('cm_assistant_settings_panel_label_12')}>
        <p className="cm-assistant-settings-copy">
          {assistantTargetStatus(attachedPage)}
        </p>
      </SettingsRow>
      <SettingsRow label={t('cm_assistant_settings_panel_label_13')}>
        <ImageServiceSettings
          services={services}
          config={servicesConfig}
          onConfigChange={onConfigChange}
        />
      </SettingsRow>
      {speechCapability.available && (
        <SettingsRow label={t('cm_assistant_settings_panel_label_14')}>
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
