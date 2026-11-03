import {
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Loader2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import type { AssistantReadinessIssue } from '../../ai/domain/assistant-readiness';
import { MotionIconSwap } from '../../components/ui/MotionIconSwap';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';

type AwaitableAction = void | Promise<void>;

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  useLocale();

  return (
    <div className="cm-assistant-settings-row">
      <div className="cm-assistant-settings-row__label">{label}</div>
      <div className="cm-assistant-settings-row__content">{children}</div>
    </div>
  );
}

export function CredentialField({
  label,
  value,
  hasCredential,
  busy,
  placeholder,
  clearSavedLabel,
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  hasCredential: boolean;
  busy: boolean;
  placeholder: string;
  clearSavedLabel: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  useLocale();

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!value) setVisible(false);
  }, [value]);

  return (
    <label className="cm-assistant-service-field">
      <span className="cm-assistant-service-field__label">{label}</span>
      <div className="cm-assistant-password-field">
        <input
          className={`cm-assistant-form-control${
            hasCredential && !value ? ' is-configured' : ''
          }`}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete="new-password"
          spellCheck={false}
          placeholder={
            hasCredential
              ? t('cm_assistant_settings_primitives_text_1')
              : placeholder
          }
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="cm-assistant-password-field__actions">
          {value && (
            <button
              type="button"
              className="cm-assistant-field-icon-button"
              title={
                visible
                  ? t('cm_assistant_settings_primitives_text_2')
                  : t('cm_assistant_settings_primitives_text_3')
              }
              aria-label={
                visible
                  ? t('cm_assistant_settings_primitives_text_4')
                  : t('cm_assistant_settings_primitives_text_5')
              }
              aria-pressed={visible}
              disabled={busy}
              onClick={() => setVisible((current) => !current)}
            >
              <MotionIconSwap
                state={visible ? 'hidden' : 'visible'}
                items={[
                  { state: 'visible', icon: <Eye size={16} /> },
                  { state: 'hidden', icon: <EyeOff size={16} /> },
                ]}
              />
            </button>
          )}
          {(value || hasCredential) && (
            <button
              type="button"
              className="cm-assistant-field-icon-button"
              title={
                value
                  ? t('cm_assistant_settings_primitives_text_6')
                  : clearSavedLabel
              }
              aria-label={
                value
                  ? t('cm_assistant_settings_primitives_text_7')
                  : clearSavedLabel
              }
              disabled={busy}
              onClick={onClear}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </label>
  );
}

export function SettingsReadiness({
  issues,
  loading,
  onOpenMicrophonePermission,
}: {
  issues: AssistantReadinessIssue[];
  loading: boolean;
  onOpenMicrophonePermission?: () => AwaitableAction;
}) {
  useLocale();

  if (loading) {
    return (
      <div className="cm-assistant-readiness is-loading" role="status">
        <Loader2
          className="cm-assistant-readiness__loader"
          size={15}
          aria-hidden="true"
        />
        <span>{t('cm_assistant_settings_primitives_text_8')}</span>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="cm-assistant-readiness is-ready" role="status">
        <CircleCheck size={16} aria-hidden="true" />
        <span>{t('cm_assistant_settings_primitives_text_9')}</span>
      </div>
    );
  }

  const microphoneIssue = issues.some((issue) =>
    issue.id.startsWith('microphone-'),
  );

  return (
    <div className="cm-assistant-readiness is-error" role="alert">
      <div className="cm-assistant-readiness__heading">
        <CircleAlert size={16} aria-hidden="true" />
        <strong>
          {issues.length} {t('cm_assistant_settings_primitives_text_10')}
        </strong>
      </div>
      <ul className="cm-assistant-readiness__issues">
        {issues.map((issue) => (
          <li className="cm-assistant-readiness__issue" key={issue.id}>
            <strong className="cm-assistant-readiness__issue-title">
              {issue.title}
            </strong>
            <span className="cm-assistant-readiness__issue-detail">
              {issue.detail}
            </span>
          </li>
        ))}
      </ul>
      {microphoneIssue && onOpenMicrophonePermission && (
        <button
          type="button"
          className="cm-assistant-secondary-button"
          onClick={() => void onOpenMicrophonePermission()}
        >
          {t('cm_assistant_settings_primitives_text_11')}
        </button>
      )}
    </div>
  );
}
