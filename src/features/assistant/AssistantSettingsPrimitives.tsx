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
          placeholder={hasCredential ? '已经配置好' : placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="cm-assistant-password-field__actions">
          {value && (
            <button
              type="button"
              className="cm-assistant-field-icon-button"
              title={visible ? '隐藏当前输入' : '显示当前输入'}
              aria-label={visible ? '隐藏当前输入' : '显示当前输入'}
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
              title={value ? '清空当前输入' : clearSavedLabel}
              aria-label={value ? '清空当前输入' : clearSavedLabel}
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
  if (loading) {
    return (
      <div className="cm-assistant-readiness is-loading" role="status">
        <Loader2
          className="cm-assistant-readiness__loader"
          size={15}
          aria-hidden="true"
        />
        <span>正在读取服务配置…</span>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="cm-assistant-readiness is-ready" role="status">
        <CircleCheck size={16} aria-hidden="true" />
        <span>各项配置已完成，服务会在首次使用时验证连接</span>
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
        <strong>{issues.length} 项配置需要处理</strong>
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
          处理麦克风权限
        </button>
      )}
    </div>
  );
}
