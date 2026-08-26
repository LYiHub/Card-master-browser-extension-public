import {
  AlertTriangle,
  Code2,
  Globe2,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { MotionIconSwap } from '../../components/ui/MotionIconSwap';
import { DiagnosticCopyButton, UiLayeredDialog } from '../../components/ui/Ui';
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
  const diagnosticText = diagnostics.map(formatMetadataDiagnostic).join('\n');
  return (
    <UiLayeredDialog
      open={open}
      title="预检详情"
      ariaLabel="脚本兼容性预检详情"
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
            兼容性诊断
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
                  {diagnostic.severity === 'error' ? '阻止安装' : '兼容提示'}
                </strong>
                <p>{formatMetadataDiagnostic(diagnostic)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="install-inspection__empty">没有发现阻止安装的问题。</p>
        )}
      </section>

      <div className="install-inspection__grid">
        <section className="install-inspection__section">
          <header>
            <Globe2 size={17} aria-hidden="true" />
            <strong className="install-inspection__section-title">
              页面范围
            </strong>
          </header>
          <div className="install-token-list">
            {matchScope.length > 0 ? (
              matchScope.map((scope) => <code key={scope}>{scope}</code>)
            ) : (
              <p>未声明 @match 或 @include。</p>
            )}
          </div>
        </section>
        <section className="install-inspection__section">
          <header>
            <KeyRound size={17} aria-hidden="true" />
            <strong className="install-inspection__section-title">
              脚本权限
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
              <strong className="install-source__title">完整源码</strong>
              <small className="install-source__size">
                {sourceCode.length} 字符
              </small>
            </span>
          </summary>
          <pre>{sourceCode}</pre>
        </details>
      )}
    </UiLayeredDialog>
  );
}
