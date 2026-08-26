import { PowerOff } from 'lucide-react';
import type { CSSProperties } from 'react';

import { DiagnosticCopyButton } from '../../components/ui/DiagnosticCopyButton';
import { projectAssetUrl } from '../../lib/project-assets';

const NOTICE_FRAME_URL = projectAssetUrl(
  'userscript-deck/visual/ui/interface/surfaces/badge-frame.webp',
);
const NOTICE_STYLE: CSSProperties = {
  position: 'absolute',
  top: 'var(--manager-action-center-y, 50%)',
  left: '50%',
  zIndex: 12,
  display: 'block',
  boxSizing: 'border-box',
  width: 'fit-content',
  minWidth: 'var(--manager-notice-min-width, 0)',
  maxWidth: 'min(720px, calc(100vw - 48px))',
  maxHeight: 'min(46vh, 420px)',
  height: 'fit-content',
  minHeight: 0,
  aspectRatio: 'auto',
  padding:
    'var(--manager-notice-padding, clamp(16px, 2vw, 24px) clamp(28px, 4vw, 48px) clamp(10px, 1.4vw, 16px))',
  overflow: 'hidden',
  transform: 'translate(-50%, -50%)',
  border: '12px solid transparent',
  borderImageSource: `url("${NOTICE_FRAME_URL}")`,
  borderImageSlice: '12',
  borderImageRepeat: 'round',
  background: 'var(--manager-notice-surface, rgba(18, 13, 9, 0.92))',
  backgroundClip: 'border-box',
  backgroundOrigin: 'border-box',
};
const NOTICE_COPY_STYLE: CSSProperties = {
  position: 'relative',
  inset: 'auto',
  display: 'grid',
  gap: 10,
  boxSizing: 'border-box',
  width: 'fit-content',
  minWidth: 0,
  maxWidth: '100%',
  maxHeight: 'calc(min(46vh, 420px) - 44px)',
  overflow: 'hidden',
  transform: 'none',
};
const NOTICE_COPY_BUTTON_STYLE: CSSProperties = {
  position: 'absolute',
  top: 'clamp(12px, 2vw, 18px)',
  right: 'clamp(12px, 2vw, 18px)',
  zIndex: 1,
};
const NOTICE_DESCRIPTION_STYLE: CSSProperties = {
  display: 'block',
  minWidth: 0,
  maxWidth: 'min(620px, calc(100vw - 112px))',
  maxHeight: 'min(30vh, 280px)',
  overflowX: 'hidden',
  overflowY: 'auto',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
  textOverflow: 'clip',
  WebkitLineClamp: 'unset',
  WebkitBoxOrient: 'initial',
};

export type ManagerActionNoticeData = {
  title: string;
  description: string;
  tone?: 'neutral' | 'inactive' | 'error';
};

export function ManagerActionNotice({
  notice,
}: {
  notice: ManagerActionNoticeData | undefined;
}) {
  if (!notice) return null;

  return (
    <aside
      className={`manager-action-notice is-${notice.tone ?? 'neutral'}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      style={NOTICE_STYLE}
    >
      <span className="manager-action-notice__copy" style={NOTICE_COPY_STYLE}>
        {notice.tone === 'inactive' && (
          <PowerOff
            className="manager-action-notice__status-icon"
            aria-hidden="true"
          />
        )}
        <strong>{notice.title}</strong>
        <span style={NOTICE_DESCRIPTION_STYLE}>{notice.description}</span>
      </span>
      {notice.tone === 'error' && (
        <span style={NOTICE_COPY_BUTTON_STYLE}>
          <DiagnosticCopyButton
            text={`${notice.title}\n${notice.description}`}
            className="manager-action-notice__copy-button"
          />
        </span>
      )}
    </aside>
  );
}
