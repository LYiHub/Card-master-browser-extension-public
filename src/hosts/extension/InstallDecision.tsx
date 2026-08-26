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
      aria-label="用户脚本安装确认"
    >
      <header className="install-decision__heading">
        <h2 className="install-decision__title">
          {success
            ? '卡牌已收录'
            : preview?.mode === 'replaced'
              ? '更新现有卡牌'
              : '收录脚本卡牌'}
        </h2>
        <p className="install-decision__description">
          {success
            ? result?.mode === 'replaced'
              ? '完整源码已更新，原有管理器配置保持不变。'
              : '完整源码已保存，脚本会按 metadata 自动匹配并执行。'
            : '确认后会保存完整 .user.js，并将它铸成一张可管理的脚本卡牌。'}
        </p>
      </header>

      {executionCapability === null ? (
        <CardStatusNotice
          tone="warning"
          status="正在检查执行权限"
          title="确认浏览器允许扩展运行用户脚本"
          description="权限检查完成前不会写入或启动这张卡牌。"
        />
      ) : executionError ? (
        <CardStatusNotice
          tone="error"
          status="执行权限未开启"
          title="请先开启“允许运行用户脚本”"
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
              ? `${Math.max(1, blockingCount)} 项问题阻止安装`
              : executionCapability === null
                ? '正在确认脚本执行权限'
                : !executionReady
                  ? '需要先开启脚本执行权限'
                  : success
                    ? result?.mode === 'replaced'
                      ? '脚本已原位更新'
                      : '脚本已安装'
                    : warningCount > 0
                      ? `可以安装 · ${warningCount} 项兼容提示`
                      : '可以安全安装'}
          </strong>
          <p className="install-readiness__description">
            {loadFailed
              ? '详细原因已统一收纳在预检详情中。'
              : executionCapability === null
                ? '浏览器权限状态确认后即可继续。'
                : !executionReady
                  ? '未开启该权限时，安装后的脚本无法在页面中运行。'
                  : success
                    ? '返回原页面后即可通过右下角牌阵找到这张卡牌。'
                    : '安装前仍可查看页面范围、权限和完整源码。'}
          </p>
        </div>
      </div>

      {matchScopeCount !== null && (
        <div className="install-summary">
          <div>
            <Globe2 size={18} aria-hidden="true" />
            <span>
              <strong className="install-summary__title">
                {matchScopeCount} 个页面范围
              </strong>
              <small className="install-summary__description">
                脚本声明的匹配范围
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
                脚本声明的 grant
              </small>
            </span>
          </div>
        </div>
      )}

      <div className="install-decision__actions">
        <UiButton disabled={!canInspect} onClick={onInspect}>
          <Eye size={17} aria-hidden="true" />
          预检详情
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
                授权并重启扩展
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
                ? '正在安装'
                : preview?.mode === 'replaced'
                  ? '更新'
                  : loadFailed ||
                      (executionCapability !== null && !executionReady)
                    ? '暂时无法安装'
                    : executionCapability === null
                      ? '正在检查权限'
                      : '安装'}
            </UiButton>
            <UiButton
              variant="primary"
              disabled={!preview || busy || !executionReady}
              onClick={onInstallAndClose}
            >
              <Download size={18} aria-hidden="true" />
              {preview?.mode === 'replaced' ? '更新+关闭' : '安装+关闭'}
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
