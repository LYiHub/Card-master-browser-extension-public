import {
  AlertTriangle,
  Code2,
  Globe2,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { MotionIconSwap } from '../../components/ui/MotionIconSwap';
import { DiagnosticCopyButton, UiLayeredDialog } from '../../components/ui/Ui';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import { formatMetadataDiagnostic } from '../../userscript/domain/metadata';
import type { MetadataDiagnostic } from '../../userscript/domain/types';

export function InstallInspectionDialog({
  open,
  diagnostics,
  matchScope,
  grants,
  sourceCode,
  onClose,
}: {
  open: boolean;
  diagnostics: readonly MetadataDiagnostic[];
  matchScope: readonly string[];
  grants: readonly string[];
  sourceCode?: string;
  onClose: () => void;
}) {
  useLocale();

  const diagnosticText = diagnostics.map(formatMetadataDiagnostic).join('\n');
  return (
    <UiLayeredDialog
      open={open}
      title={t('cm_install_inspection_dialog_title_1')}
      ariaLabel={t('cm_install_inspection_dialog_aria_label_2')}
      headerActions={
        diagnosticText ? <DiagnosticCopyButton text={diagnosticText} /> : null
      }
      onClose={onClose}
    >
      <section className="install-inspection__section">
        <header>
          <MotionIconSwap
            state={
              diagnostics.some((diagnostic) => diagnostic.severity === 'error')
                ? 'error'
                : 'ready'
            }
            items={[
              { state: 'ready', icon: <ShieldCheck size={17} /> },
              { state: 'error', icon: <AlertTriangle size={17} /> },
            ]}
          />
          <strong className="install-inspection__section-title">
            {t('cm_install_inspection_dialog_text_3')}
          </strong>
        </header>
        {diagnostics.length > 0 ? (
          <ul className="install-diagnostics">
            {diagnostics.map((diagnostic) => (
              <li
                className={`is-${diagnostic.severity}`}
                key={`${diagnostic.code}:${diagnostic.line ?? 0}:${diagnostic.message}`}
              >
                <strong className="install-diagnostic__title">
                  {diagnostic.severity === 'error'
                    ? t('cm_install_inspection_dialog_text_4')
                    : t('cm_install_inspection_dialog_text_5')}
                </strong>
                <p>{formatMetadataDiagnostic(diagnostic)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="install-inspection__empty">
            {t('cm_install_inspection_dialog_text_6')}
          </p>
        )}
      </section>

      <div className="install-inspection__grid">
        <section className="install-inspection__section">
          <header>
            <Globe2 size={17} aria-hidden="true" />
            <strong className="install-inspection__section-title">
              {t('cm_install_inspection_dialog_text_7')}
            </strong>
          </header>
          <div className="install-token-list">
            {matchScope.length > 0 ? (
              matchScope.map((scope) => <code key={scope}>{scope}</code>)
            ) : (
              <p>{t('cm_install_inspection_dialog_text_8')}</p>
            )}
          </div>
        </section>
        <section className="install-inspection__section">
          <header>
            <KeyRound size={17} aria-hidden="true" />
            <strong className="install-inspection__section-title">
              {t('cm_install_inspection_dialog_text_9')}
            </strong>
          </header>
          <div className="install-token-list">
            {grants.map((grant) => (
              <code key={grant}>@grant {grant}</code>
            ))}
          </div>
        </section>
      </div>

      {sourceCode && (
        <details className="install-source">
          <summary>
            <Code2 size={17} aria-hidden="true" />
            <span>
              <strong className="install-source__title">
                {t('cm_install_inspection_dialog_text_10')}
              </strong>
              <small className="install-source__size">
                {sourceCode.length} {t('cm_install_inspection_dialog_text_11')}
              </small>
            </span>
          </summary>
          <pre>{sourceCode}</pre>
        </details>
      )}
    </UiLayeredDialog>
  );
}
