import { type CSSProperties, forwardRef, type ReactNode } from 'react';

export const CardInfoPopover = forwardRef<
  HTMLElement,
  {
    title: string;
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    ariaHidden?: boolean;
  }
>(function CardInfoPopover(
  { title, children, className, style, ariaHidden },
  ref,
) {
  return (
    <aside
      ref={ref}
      className={`card-info-popover${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden={ariaHidden}
    >
      <div className="card-info-popover__title">
        <strong>{title}</strong>
      </div>
      <div className="card-info-popover__body">{children}</div>
    </aside>
  );
});
