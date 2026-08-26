import type { CSSProperties } from 'react';

const ROOT_STYLE: CSSProperties = {
  display: 'grid',
  gap: 2,
  minWidth: 0,
  width: '100%',
};

const NAME_STYLE: CSSProperties = {
  display: '-webkit-box',
  fontWeight: 800,
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
  return (
    <span className={className} style={ROOT_STYLE}>
      <strong title={name} style={NAME_STYLE}>
        {name}
      </strong>
      <small title={description} style={DESCRIPTION_STYLE}>
        {description || '该卡牌未提供说明。'}
      </small>
    </span>
  );
}
