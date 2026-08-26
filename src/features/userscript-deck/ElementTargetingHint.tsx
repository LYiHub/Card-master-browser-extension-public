import { type CSSProperties, useLayoutEffect, useRef } from 'react';
import { actionFanLayout } from '../manager-interaction/layout';
import type { ManagerAction } from './actions';

const ACTION_FRAME_ASPECT = 536 / 360;
const CARD_GAP = 10;

export function ElementTargetingHint({
  visible,
  cardId,
  action,
  centralActionCount,
  viewportWidth,
  actionRoot,
  actionFrameUrl,
}: {
  visible: boolean;
  cardId: string | null;
  action: ManagerAction | null;
  centralActionCount: number;
  viewportWidth: number;
  actionRoot: ParentNode;
  actionFrameUrl: string;
}) {
  const hintRef = useRef<HTMLSpanElement | null>(null);
  const layout = actionFanLayout(
    0,
    Math.max(1, centralActionCount),
    viewportWidth,
  );

  useLayoutEffect(() => {
    const hint = hintRef.current;
    if (!visible || !cardId || !hint) return;
    const card = actionRoot.querySelector<HTMLElement>(
      `[data-manager-card-id="${CSS.escape(cardId)}"]`,
    );
    if (!card) return;

    let frame = 0;
    const updatePosition = () => {
      const bounds = card.getBoundingClientRect();
      const height = layout.badgeWidth / ACTION_FRAME_ASPECT;
      hint.style.left = `${bounds.left + bounds.width / 2}px`;
      hint.style.top = `${bounds.top - height - CARD_GAP}px`;
      frame = window.requestAnimationFrame(updatePosition);
    };
    updatePosition();
    return () => window.cancelAnimationFrame(frame);
  }, [actionRoot, cardId, layout.badgeWidth, visible]);

  return (
    <span
      ref={hintRef}
      className={`manager-element-targeting-hint${action ? ` manager-action--${action.kind}` : ''}${visible && action ? ' is-visible' : ''}`}
      style={
        {
          '--manager-element-targeting-hint-width': `${layout.badgeWidth}px`,
          '--manager-element-targeting-hint-font-size': `${layout.descriptionFontSize}px`,
          ...(action?.accent ? { '--action-color': action.accent } : {}),
        } as CSSProperties
      }
      role="status"
      aria-hidden={!visible}
    >
      <span className="manager-element-targeting-hint__plate manager-action-plate">
        <span className="manager-action__activation-aura" aria-hidden="true" />
        <img className="manager-action__frame" src={actionFrameUrl} alt="" />
        <span className="manager-element-targeting-hint__copy">
          <span>单击拦截所选内容</span>
          <span>ESC 结束内容拦截</span>
        </span>
      </span>
    </span>
  );
}
