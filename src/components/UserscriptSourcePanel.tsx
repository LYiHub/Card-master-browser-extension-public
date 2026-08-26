import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { INPUT_SCOPE_PRIORITY } from '../input/coordinator';
import { useSurfaceInputInteraction } from '../input/useSurfaceInputInteraction';
import { classNames } from '../lib/class-names';
import { copyDiagnosticText } from './ui/DiagnosticCopyButton';
import { MotionIconSwap } from './ui/MotionIconSwap';
import { UiButton } from './ui/Ui';

export function UserscriptSourcePanel({
  source,
  label = '完整 `.user.js` 源码',
  editable = false,
  onChange,
  onDownload,
  publicationUrl,
  className,
  editorId,
  expandable = false,
  showHeading = true,
  expanded = false,
  onExpandedChange,
}: {
  source: string;
  label?: string;
  editable?: boolean;
  onChange?: (source: string) => void;
  onDownload: () => void;
  publicationUrl: string | null;
  className?: string;
  editorId?: string;
  expandable?: boolean;
  showHeading?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timeout = window.setTimeout(() => setCopyState('idle'), 1_600);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  useSurfaceInputInteraction({
    surfaceRef: panelRef,
    enabled: expanded,
    priority: INPUT_SCOPE_PRIORITY.expandedView,
    id: `userscript-source:${editorId ?? 'viewer'}`,
    onClose: () => onExpandedChange?.(false),
  });

  const copyTitle =
    copyState === 'copied'
      ? '已复制'
      : copyState === 'failed'
        ? '复制失败，请重试'
        : '复制完整源码';

  return (
    <section
      ref={panelRef}
      className={classNames(
        'userscript-source-panel',
        editable && 'is-editable',
        expandable && 'is-expandable',
        expanded && 'is-expanded',
        className,
      )}
    >
      <header className="userscript-source-panel__header">
        {showHeading && <strong>{label}</strong>}
        <div className="userscript-source-panel__actions">
          <UiButton
            title={
              publicationUrl
                ? '在脚本发布页面查看详情'
                : '脚本没有可识别的发布页面'
            }
            aria-label={
              publicationUrl
                ? '在脚本发布页面查看详情'
                : '脚本没有可识别的发布页面'
            }
            disabled={!publicationUrl}
            onClick={() => {
              if (publicationUrl) {
                window.open(publicationUrl, '_blank', 'noopener,noreferrer');
              }
            }}
          >
            <ExternalLink size={14} aria-hidden="true" />
            发布页面
          </UiButton>
          <UiButton
            title={copyTitle}
            aria-label={copyTitle}
            onClick={() => {
              void copyDiagnosticText(source).then(
                () => setCopyState('copied'),
                () => setCopyState('failed'),
              );
            }}
          >
            <MotionIconSwap
              state={copyState === 'copied' ? 'copied' : 'copy'}
              items={[
                { state: 'copy', icon: <Copy size={14} /> },
                { state: 'copied', icon: <Check size={14} /> },
              ]}
            />
            {copyState === 'copied' ? '已复制' : '复制源码'}
          </UiButton>
          <UiButton
            title="下载完整源码"
            aria-label="下载完整源码"
            onClick={onDownload}
          >
            <Download size={14} aria-hidden="true" />
            下载源码
          </UiButton>
        </div>
      </header>
      <div className="userscript-source-panel__viewport">
        {expandable && (
          <button
            type="button"
            className="userscript-source-panel__expand"
            title={expanded ? '退出全屏源码查看（Esc）' : '全屏查看源码'}
            aria-label={expanded ? '退出全屏源码查看（Esc）' : '全屏查看源码'}
            onClick={() => onExpandedChange?.(!expanded)}
          >
            <MotionIconSwap
              state={expanded ? 'minimize' : 'maximize'}
              items={[
                {
                  state: 'maximize',
                  icon: <Maximize2 size={15} aria-hidden="true" />,
                },
                {
                  state: 'minimize',
                  icon: <Minimize2 size={15} aria-hidden="true" />,
                },
              ]}
            />
          </button>
        )}
        {editable ? (
          <textarea
            id={editorId}
            className="userscript-source-panel__source"
            value={source}
            spellCheck={false}
            aria-label={label}
            onChange={(event) => onChange?.(event.currentTarget.value)}
          />
        ) : (
          <pre className="userscript-source-panel__source">{source}</pre>
        )}
      </div>
    </section>
  );
}
