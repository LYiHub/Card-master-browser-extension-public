import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  Globe2,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { RefObject } from 'react';
import { MotionIconSwap } from '../../components/ui/MotionIconSwap';
import { CardStatusNotice, UiButton } from '../../components/ui/Ui';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import {
  type UserscriptExecutionCapability,
  userscriptExecutionAvailable,
} from '../../userscript/runtime/capabilities';
import { installAndCloseShortcutLabel } from './install-shortcut';
import type {
  UserscriptInstallPreview,
  UserscriptInstallResult,
} from './protocol';
import type { InstallPhase } from './useInstallCardAnimation';

export function InstallDecision({
  decisionRef,
  phase,
  result,
  preview,
  executionCapability,
  loadFailed,
  blockingCount,
  warningCount,
  success,
  matchScopeCount,
  permissionSummary,
  canInspect,
  busy,
  onInspect,
  onRequestExecutionPermission,
  onInstall,
  onInstallAndClose,
}: {
  decisionRef: RefObject<HTMLElement>;
  phase: InstallPhase;
  result: UserscriptInstallResult | null;
  preview: UserscriptInstallPreview | null;
  executionCapability: UserscriptExecutionCapability | null;
  loadFailed: boolean;
  blockingCount: number;
  warningCount: number;
  success: boolean;
  matchScopeCount: number | null;
  permissionSummary: string;
  canInspect: boolean;
  busy: boolean;
  onInspect: () => void;
  onRequestExecutionPermission: () => void;
  onInstall: () => void;
  onInstallAndClose: () => void;
}) {
  useLocale();

  const executionReady = userscriptExecutionAvailable(executionCapability);
  const executionError =
    executionCapability && !executionReady ? executionCapability.message : null;
  const permissionRequired =
    executionCapability?.status === 'permission-required';
  const shortcut = installAndCloseShortcutLabel();
  return (
    <section
      ref={decisionRef}
      className="install-decision"
      aria-label={t('cm_install_decision_aria_label_1')}
    >
      <header className="install-decision__heading">
        <h2 className="install-decision__title">
          {success
            ? t('cm_install_decision_text_2')
            : preview?.mode === 'replaced'
              ? t('cm_install_decision_text_3')
              : t('cm_install_decision_text_4')}
        </h2>
        <p className="install-decision__description">
          {success
            ? result?.mode === 'replaced'
              ? t('cm_install_decision_text_5')
              : t('cm_install_decision_text_6')
            : t('cm_install_decision_text_7')}
        </p>
      </header>

      {executionCapability === null ? (
        <CardStatusNotice
          tone="warning"
          status={t('cm_install_decision_status_8')}
          title={t('cm_install_decision_title_9')}
          description={t('cm_install_decision_description_10')}
        />
      ) : executionError ? (
        <CardStatusNotice
          tone="error"
          status={t('cm_install_decision_status_11')}
          title={t('cm_install_decision_title_12')}
          description={executionError}
          copyText={executionError}
        />
      ) : null}

      <div
        className={`install-readiness${loadFailed ? ' is-error' : success ? ' is-success' : ''}`}
        role={loadFailed ? 'alert' : 'status'}
      >
        <MotionIconSwap
          state={loadFailed ? 'error' : success ? 'success' : 'ready'}
          items={[
            { state: 'ready', icon: <ShieldCheck size={21} /> },
            { state: 'success', icon: <CheckCircle2 size={21} /> },
            { state: 'error', icon: <AlertTriangle size={21} /> },
          ]}
        />
        <div>
          <strong className="install-readiness__title">
            {loadFailed
              ? t('cm_install_decision_text_13', [
                  String(Math.max(1, blockingCount)),
                ])
              : executionCapability === null
                ? t('cm_install_decision_text_14')
                : !executionReady
                  ? t('cm_install_decision_text_15')
                  : success
                    ? result?.mode === 'replaced'
                      ? t('cm_install_decision_text_16')
                      : t('cm_install_decision_text_17')
                    : warningCount > 0
                      ? t('cm_install_decision_text_18', [String(warningCount)])
                      : t('cm_install_decision_text_19')}
          </strong>
          <p className="install-readiness__description">
            {loadFailed
              ? t('cm_install_decision_text_20')
              : executionCapability === null
                ? t('cm_install_decision_text_21')
                : !executionReady
                  ? t('cm_install_decision_text_22')
                  : success
                    ? t('cm_install_decision_text_23')
                    : t('cm_install_decision_text_24')}
          </p>
        </div>
      </div>

      {matchScopeCount !== null && (
        <div className="install-summary">
          <div>
            <Globe2 size={18} aria-hidden="true" />
            <span>
              <strong className="install-summary__title">
                {matchScopeCount} {t('cm_install_decision_text_25')}
              </strong>
              <small className="install-summary__description">
                {t('cm_install_decision_text_26')}
              </small>
            </span>
          </div>
          <div>
            <KeyRound size={18} aria-hidden="true" />
            <span>
              <strong className="install-summary__title">
                {permissionSummary}
              </strong>
              <small className="install-summary__description">
                {t('cm_install_decision_text_27')}
              </small>
            </span>
          </div>
        </div>
      )}

      <div className="install-decision__actions">
        <UiButton disabled={!canInspect} onClick={onInspect}>
          <Eye size={17} aria-hidden="true" />
          {t('cm_install_decision_text_28')}
        </UiButton>
        {!success && phase !== 'stowing' && (
          <>
            {permissionRequired && (
              <UiButton
                variant="primary"
                disabled={busy}
                onClick={onRequestExecutionPermission}
              >
                <KeyRound size={18} aria-hidden="true" />
                {t('cm_install_decision_text_29')}
              </UiButton>
            )}
            <UiButton
              disabled={!preview || busy || !executionReady}
              onClick={onInstall}
            >
              <MotionIconSwap
                state={
                  busy
                    ? 'busy'
                    : preview?.mode === 'replaced'
                      ? 'update'
                      : 'install'
                }
                items={[
                  { state: 'install', icon: <Download size={18} /> },
                  { state: 'update', icon: <RefreshCw size={18} /> },
                  {
                    state: 'busy',
                    icon: <Loader2 className="is-spinning" size={18} />,
                  },
                ]}
              />
              {busy
                ? t('cm_install_decision_text_30')
                : preview?.mode === 'replaced'
                  ? t('cm_install_decision_text_31')
                  : loadFailed ||
                      (executionCapability !== null && !executionReady)
                    ? t('cm_install_decision_text_32')
                    : executionCapability === null
                      ? t('cm_install_decision_text_33')
                      : t('cm_install_decision_text_34')}
            </UiButton>
            <UiButton
              variant="primary"
              disabled={!preview || busy || !executionReady}
              onClick={onInstallAndClose}
            >
              <Download size={18} aria-hidden="true" />
              {preview?.mode === 'replaced'
                ? t('cm_install_decision_text_35')
                : t('cm_install_decision_text_36')}
              <kbd aria-label={shortcut.replace('⌘', 'Command')}>
                {shortcut}
              </kbd>
            </UiButton>
          </>
        )}
      </div>
    </section>
  );
}
