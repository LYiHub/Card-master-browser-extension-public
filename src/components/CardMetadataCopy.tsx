import type { CSSProperties } from 'react';
import { t } from '../localization/messages';
import { useLocale } from '../localization/react';

const ROOT_STYLE: CSSProperties = {
  display: 'grid',
  gap: 2,
  minWidth: 0,
  width: '100%',
};

const NAME_STYLE: CSSProperties = {
  display: '-webkit-box',
  fontWeight: 'var(--app-ui-font-display-strong-weight, 800)',
  minWidth: 0,
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
};

const DESCRIPTION_STYLE: CSSProperties = {
  display: '-webkit-box',
  minWidth: 0,
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
};

export function CardMetadataCopy({
  name,
  description,
  className,
}: {
  name: string;
  description: string;
  className?: string;
}) {
  useLocale();

  return (
    <span className={className} style={ROOT_STYLE}>
      <strong title={name} style={NAME_STYLE}>
        {name}
      </strong>
      <small title={description} style={DESCRIPTION_STYLE}>
        {description || t('cm_card_metadata_copy_text_1')}
      </small>
    </span>
  );
}
