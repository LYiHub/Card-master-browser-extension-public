import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from '../../motion/gsap';
import { actionArcHeight, actionFanLayout, centerOutSlotIndex } from './layout';
import {
  ManagerActionNotice,
  type ManagerActionNoticeData,
} from './ManagerActionNotice';
import type { ManagerMode } from './state';

type ActionPlacement = 'center' | 'corner';
type CornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type ManagerFieldAction = {
  id: string;
  kind: string;
  label: string;
  description?: string;
  accent?: string;
};

export type ManagerActionScene<Action extends ManagerFieldAction> = {
  key: string;
  title: string;
  actions: readonly Action[];
  notice?: ManagerActionNoticeData;
};

type ManagerActionFieldProps<Action extends ManagerFieldAction> = {
  scene: ManagerActionScene<Action> | null;
  preview: boolean;
  mode: ManagerMode;
  viewportWidth: number;
  viewportHeight: number;
  hoveredAction: string | null;
  cancelAction: Action;
  actionFrameUrl: string;
  cornerActionsLabel: string;
  actionPlacement: (kind: Action['kind']) => ActionPlacement;
  cornerPositionForAction: (kind: Action['kind']) => CornerPosition | null;
  onHoverAction: (actionId: string | null) => void;
  onChooseAction: (actionId: string) => void;
};

type ActionTargetProps<Action extends ManagerFieldAction> = Pick<
  ManagerActionFieldProps<Action>,
  | 'mode'
  | 'hoveredAction'
  | 'actionFrameUrl'
  | 'cornerPositionForAction'
  | 'onHoverAction'
  | 'onChooseAction'
> & {
  action: Action;
  className: string;
  style?: CSSProperties;
  corner?: boolean;
};

function ActionTarget<Action extends ManagerFieldAction>({
  action,
  className,
  style,
  mode,
  hoveredAction,
  actionFrameUrl,
  cornerPositionForAction,
  onHoverAction,
  onChooseAction,
  corner = false,
}: ActionTargetProps<Action>) {
  const rootRef = useRef<HTMLButtonElement | null>(null);
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  const copyRef = useRef<HTMLSpanElement | null>(null);
  const emphasisTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const cornerPosition = corner
    ? (cornerPositionForAction(action.kind) ?? undefined)
    : undefined;
  const emphasized = corner && hoveredAction === action.id;
  const resolvedStyle = action.accent
    ? ({
        ...style,
        '--action-color': action.accent,
      } as CSSProperties)
    : style;

  useLayoutEffect(() => {
    if (!corner) return;
    const root = rootRef.current;
    const badge = badgeRef.current;
    const copy = copyRef.current;
    if (!root || !badge || !copy) return;

    emphasisTimelineRef.current?.kill();
    gsap.killTweensOf(root);
    gsap.set(root, { clearProps: 'transform' });
    emphasisTimelineRef.current = gsap
      .timeline()
      .to(
        badge,
        {
          scale: emphasized ? 1.035 : 1,
          duration: emphasized ? 0.16 : 0.18,
          ease: 'power3.out',
          overwrite: 'auto',
        },
        0,
      )
      .to(
        copy,
        {
          scale: emphasized ? 1.045 : 1,
          duration: emphasized ? 0.15 : 0.17,
          ease: 'power3.out',
          overwrite: 'auto',
        },
        0.01,
      );

    return () => {
      emphasisTimelineRef.current?.kill();
      gsap.set(root, { clearProps: 'transform' });
    };
  }, [corner, emphasized]);

  return (
    <button
      ref={rootRef}
      type="button"
      className={`${className} manager-action--${action.kind}${hoveredAction === action.id ? ' is-hovered' : ''}`}
      style={resolvedStyle}
      data-manager-action={action.id}
      data-manager-action-zone={corner ? 'corner' : 'center'}
      data-manager-action-corner={cornerPosition}
      data-audio-managed="true"
      aria-label={
        action.description
          ? `${action.label}：${action.description}`
          : action.label
      }
      tabIndex={mode === 'targeting' && hoveredAction === action.id ? 0 : -1}
      onFocus={() => {
        if (mode === 'targeting') onHoverAction(action.id);
      }}
      onBlur={() => {
        if (mode === 'targeting') onHoverAction(null);
      }}
      onClick={(event) => {
        if (mode === 'targeting' && event.detail === 0) {
          onChooseAction(action.id);
        }
      }}
    >
      <span
        ref={badgeRef}
        className={`manager-action__badge${corner ? '' : ' manager-action-plate'}`}
      >
        {!corner && (
          <>
            <span
              className="manager-action__activation-aura"
              aria-hidden="true"
            />
            <img
              className="manager-action__frame"
              src={actionFrameUrl}
              alt=""
            />
          </>
        )}
        <span ref={copyRef} className="manager-action__copy">
          <strong>{action.label}</strong>
          {action.description && (
            <span className="manager-action__description">
              {action.description}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export function ManagerActionField<Action extends ManagerFieldAction>({
  scene,
  preview,
  mode,
  viewportWidth,
  viewportHeight,
  hoveredAction,
  cancelAction,
  actionFrameUrl,
  cornerActionsLabel,
  actionPlacement,
  cornerPositionForAction,
  onHoverAction,
  onChooseAction,
}: ManagerActionFieldProps<Action>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const renderedRef = useRef<ManagerActionScene<Action> | null>(scene);
  const sceneKeyRef = useRef(scene?.key ?? null);
  const [renderedScene, setRenderedScene] =
    useState<ManagerActionScene<Action> | null>(scene);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nextKey = scene?.key ?? null;
    const directInteraction =
      mode === 'reordering' || mode === 'dragging' || mode === 'targeting';
    if (directInteraction) {
      timelineRef.current?.kill();
      gsap.killTweensOf(root);
      gsap.set(root, { clearProps: 'transform,opacity' });
      sceneKeyRef.current = nextKey;
      renderedRef.current = scene;
      setRenderedScene(scene);
      return;
    }
    if (sceneKeyRef.current === nextKey) {
      if (scene && renderedRef.current !== scene) {
        renderedRef.current = scene;
        setRenderedScene(scene);
      }
      return;
    }

    sceneKeyRef.current = nextKey;
    timelineRef.current?.kill();
    gsap.killTweensOf(root);
    const setRendered = (nextScene: ManagerActionScene<Action> | null) => {
      renderedRef.current = nextScene;
      setRenderedScene(nextScene);
    };

    if (!scene) {
      timelineRef.current = gsap.timeline({
        onComplete: () => setRendered(null),
      });
      timelineRef.current.to(root, {
        y: 12,
        scale: 0.985,
        opacity: 0,
        duration: 0.22,
        ease: 'power2.in',
      });
      return () => {
        timelineRef.current?.kill();
      };
    }

    if (!renderedRef.current) {
      setRendered(scene);
      gsap.set(root, { y: 14, scale: 0.98, opacity: 0 });
      timelineRef.current = gsap.timeline({ delay: 0.02 }).to(root, {
        y: 0,
        scale: 1,
        opacity: 1,
        duration: 0.42,
        ease: 'back.out(1.24)',
      });
      return () => {
        timelineRef.current?.kill();
      };
    }

    timelineRef.current = gsap
      .timeline()
      .to(root, {
        y: -8,
        scale: 0.985,
        opacity: 0,
        duration: 0.16,
        ease: 'power2.in',
      })
      .add(() => setRendered(scene))
      .set(root, { y: 12, scale: 0.98 })
      .to(root, {
        y: 0,
        scale: 1,
        opacity: 1,
        duration: 0.38,
        ease: 'back.out(1.22)',
      });
    return () => {
      timelineRef.current?.kill();
    };
  }, [mode, scene]);

  useLayoutEffect(
    () => () => {
      timelineRef.current?.kill();
      if (rootRef.current) gsap.killTweensOf(rootRef.current);
    },
    [],
  );

  const centralActions =
    renderedScene?.actions.filter(
      (action) => actionPlacement(action.kind) === 'center',
    ) ?? [];
  const cornerActions =
    renderedScene?.actions.filter(
      (action) => actionPlacement(action.kind) === 'corner',
    ) ?? [];
  const actionFieldSpan = actionFanLayout(
    0,
    Math.max(1, centralActions.length),
    viewportWidth,
  ).span;
  const arcHeight = actionArcHeight(viewportHeight);
  const actionBaselineOffset = 73;
  const showCancel = Boolean(scene && !preview);

  return (
    <div
      ref={rootRef}
      className={`manager-action-layer${preview ? ' is-preview' : ''}`}
      aria-hidden={!scene}
    >
      {renderedScene && (
        <>
          {centralActions.length > 0 && (
            <section
              className="manager-action-field"
              data-manager-action-field
              data-manager-action-span={actionFieldSpan}
              data-manager-action-arc-height={arcHeight}
              data-manager-action-baseline-offset={actionBaselineOffset}
              style={
                {
                  '--action-span': `${actionFieldSpan}px`,
                  '--action-arc-height': `${arcHeight}px`,
                  '--action-baseline-offset': `${actionBaselineOffset}px`,
                } as CSSProperties
              }
              aria-label={`${renderedScene.title} 卡牌能力`}
            >
              {centralActions.map((action, index) => {
                const slotIndex = centerOutSlotIndex(
                  index,
                  centralActions.length,
                );
                const slot = actionFanLayout(
                  slotIndex,
                  centralActions.length,
                  viewportWidth,
                );
                return (
                  <ActionTarget
                    key={action.id}
                    action={action}
                    className="manager-action"
                    style={
                      {
                        '--action-left': `${slot.left}px`,
                        '--action-y': `${slot.y}px`,
                        '--action-width': `${slot.zoneWidth}px`,
                        '--action-badge-width': `${slot.badgeWidth}px`,
                        '--action-label-size': `${slot.labelFontSize}px`,
                        '--action-description-size': `${slot.descriptionFontSize}px`,
                      } as CSSProperties
                    }
                    mode={mode}
                    hoveredAction={hoveredAction}
                    actionFrameUrl={actionFrameUrl}
                    cornerPositionForAction={cornerPositionForAction}
                    onHoverAction={onHoverAction}
                    onChooseAction={onChooseAction}
                  />
                );
              })}
            </section>
          )}
          <ManagerActionNotice
            notice={
              centralActions.length === 0 ? renderedScene.notice : undefined
            }
          />

          <aside
            className="manager-corner-actions"
            aria-label={cornerActionsLabel}
          >
            {cornerActions.map((action) => (
              <ActionTarget
                key={action.id}
                action={action}
                className={`manager-corner-action manager-corner-action--${action.kind}`}
                mode={mode}
                hoveredAction={hoveredAction}
                actionFrameUrl={actionFrameUrl}
                cornerPositionForAction={cornerPositionForAction}
                onHoverAction={onHoverAction}
                onChooseAction={onChooseAction}
                corner
              />
            ))}
            <ActionTarget
              action={cancelAction}
              className={`manager-corner-action manager-corner-action--cancel${showCancel ? ' is-visible' : ''}`}
              mode={mode}
              hoveredAction={hoveredAction}
              actionFrameUrl={actionFrameUrl}
              cornerPositionForAction={cornerPositionForAction}
              onHoverAction={onHoverAction}
              onChooseAction={onChooseAction}
              corner
            />
          </aside>
        </>
      )}
    </div>
  );
}
