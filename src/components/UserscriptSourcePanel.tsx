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
import { t } from '../localization/messages';
import { useLocale } from '../localization/react';
import { copyDiagnosticText } from './ui/DiagnosticCopyButton';
import { MotionIconSwap } from './ui/MotionIconSwap';
import { UiButton } from './ui/Ui';

export function UserscriptSourcePanel({
  source,
  label = t('cm_userscript_source_panel_text_1'),
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
  useLocale();

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
      ? t('cm_userscript_source_panel_text_2')
      : copyState === 'failed'
        ? t('cm_userscript_source_panel_text_3')
        : t('cm_userscript_source_panel_text_4');

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
                ? t('cm_userscript_source_panel_text_5')
                : t('cm_userscript_source_panel_text_6')
            }
            aria-label={
              publicationUrl
                ? t('cm_userscript_source_panel_text_7')
                : t('cm_userscript_source_panel_text_8')
            }
            disabled={!publicationUrl}
            onClick={() => {
              if (publicationUrl) {
                window.open(publicationUrl, '_blank', 'noopener,noreferrer');
              }
            }}
          >
            <ExternalLink size={14} aria-hidden="true" />
            {t('cm_userscript_source_panel_text_9')}
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
            {copyState === 'copied'
              ? t('cm_userscript_source_panel_text_10')
              : t('cm_userscript_source_panel_text_11')}
          </UiButton>
          <UiButton
            title={t('cm_userscript_source_panel_title_12')}
            aria-label={t('cm_userscript_source_panel_aria_label_13')}
            onClick={onDownload}
          >
            <Download size={14} aria-hidden="true" />
            {t('cm_userscript_source_panel_text_14')}
          </UiButton>
        </div>
      </header>
      <div className="userscript-source-panel__viewport">
        {expandable && (
          <button
            type="button"
            className="userscript-source-panel__expand"
            title={
              expanded
                ? t('cm_userscript_source_panel_text_15')
                : t('cm_userscript_source_panel_text_16')
            }
            aria-label={
              expanded
                ? t('cm_userscript_source_panel_text_17')
                : t('cm_userscript_source_panel_text_18')
            }
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
