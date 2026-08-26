import {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { registerGamepadVirtualPointerElement } from '../../hosts/extension/gamepad-bridge';
import { projectAssetUrl } from '../../lib/project-assets';
import type {
  MediaSpeedSelection,
  MediaSpeedWheelItem,
} from '../../media-speed/domain/types';
import type { ManagerMode } from '../manager-interaction/state';
import { DeckEntryLogo } from './DeckEntryLogo';
import type { DeckEntryPosition } from './deck-entry';
import { deckEntryBadgeCompact, deckEntryBadgeText } from './deck-entry-badge';
import { DECK_ENTRY_LAYOUT, resolveDeckEntryInsets } from './deck-entry-layout';
import {
  createDeckEntryDragSession,
  type DeckEntryDragSession,
  updateDeckEntryDragSession,
} from './deck-entry-position';
import { deckEntryPresentation } from './deck-entry-presentation';
import { MediaSpeedRadialMenu } from './MediaSpeedRadialMenu';
import { mediaSpeedWheelPointerMoved } from './media-speed-wheel-intent';

type DeckTriggerStyle = CSSProperties & {
  '--manager-deck-entry-width': string;
  '--manager-deck-entry-height': string;
  '--manager-deck-entry-half-width': string;
  '--manager-deck-entry-half-height': string;
  '--manager-deck-entry-anchor-x': string;
  '--manager-deck-entry-anchor-y': string;
  '--manager-deck-entry-left-inset': string;
  '--manager-deck-entry-right-inset': string;
  '--manager-deck-entry-top-inset': string;
  '--manager-deck-entry-bottom-inset': string;
  '--manager-deck-entry-button-width': string;
  '--manager-deck-entry-button-height': string;
  '--manager-deck-entry-logo-size': string;
  '--manager-media-speed-radius': string;
  '--manager-media-speed-option-width': string;
  '--manager-media-speed-option-height': string;
  '--manager-media-speed-crowded-option-width': string;
  '--manager-media-speed-crowded-option-height': string;
  '--manager-media-speed-option-emphasis-scale': string;
  '--manager-media-resources-size': string;
  '--manager-media-resources-combined-offset': string;
  '--manager-deck-entry-x'?: string;
  '--manager-deck-entry-y'?: string;
};

const SPEED_WHEEL_AUTO_COLLAPSE_MS = 3200;
const SPEED_WHEEL_LEAVE_COLLAPSE_MS = 360;
const SPEED_WHEEL_HIDE_GRACE_MS = 640;
const MEDIA_RESOURCES_LOGO_URL = projectAssetUrl(
  'userscript-deck/visual/integrations/media-resources-sheep.png',
);
const MEDIA_RESOURCES_HOVER_LOGO_URL = projectAssetUrl(
  'userscript-deck/visual/integrations/media-resources-sheep-hover.png',
);

function speedWheelInteractionTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest('.manager-deck-trigger, .manager-media-speed-radial'),
    )
  );
}

export function DeckTrigger({
  mode,
  visibleCount,
  activeCount,
  showDeckTriggerBadge,
  ready,
  hidden,
  receiving = false,
  position,
  speedWheelVisible,
  speedSelection,
  speedWheelItems,
  mediaResourcesCount = 0,
  showMediaResourcesTrigger = true,
  showMediaResourcesBadge = true,
  triggerRef,
  onHover,
  onLeave,
  onPositionChange,
  onPositionCommit,
  onSpeedSelection,
  onOpenMediaResources,
  mediaResourcesPopup,
  onActivate,
}: {
  mode: ManagerMode;
  visibleCount: number;
  activeCount: number;
  showDeckTriggerBadge: boolean;
  ready: boolean;
  hidden: boolean;
  receiving?: boolean;
  position: DeckEntryPosition | null;
  speedWheelVisible: boolean;
  speedSelection: MediaSpeedSelection;
  speedWheelItems: readonly MediaSpeedWheelItem[];
  mediaResourcesCount?: number;
  showMediaResourcesTrigger?: boolean;
  showMediaResourcesBadge?: boolean;
  triggerRef: RefCallback<HTMLElement>;
  onHover: (positionX: number) => void;
  onLeave: () => void;
  onPositionChange: (position: DeckEntryPosition) => void;
  onPositionCommit: (position: DeckEntryPosition) => void;
  onSpeedSelection: (selection: MediaSpeedSelection) => void;
  onOpenMediaResources?: () => void;
  mediaResourcesPopup?: ReactNode;
  onActivate: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const mediaResourcesButtonRef = useRef<HTMLButtonElement | null>(null);
  const dragSessionRef = useRef<DeckEntryDragSession | null>(null);
  const suppressClickRef = useRef(false);
  const radialCollapseTimerRef = useRef<number | null>(null);
  const radialHideTimerRef = useRef<number | null>(null);
  const ignoreRadialEntryRef = useRef(false);
  const dragCallbacksRef = useRef({ onPositionChange, onPositionCommit });
  dragCallbacksRef.current = { onPositionChange, onPositionCommit };
  const [dragging, setDragging] = useState(false);
  const radialSignal = speedWheelVisible && mode === 'closed';
  const [radialRetained, setRadialRetained] = useState(radialSignal);
  const radialRequested = mode === 'closed' && (radialSignal || radialRetained);
  const [radialExpanded, setRadialExpanded] = useState(
    () =>
      radialRequested &&
      typeof document !== 'undefined' &&
      !document.hidden &&
      document.hasFocus(),
  );
  const [radialMounted, setRadialMounted] = useState(radialRequested);
  const radialVisible = radialMounted || radialRequested;
  const presentation = deckEntryPresentation({
    mode,
    ready,
    hidden,
    receiving,
    radialVisible,
    mediaResourcesAvailable:
      showMediaResourcesTrigger &&
      mediaResourcesCount > 0 &&
      onOpenMediaResources !== undefined,
  });
  const mediaResourcesVisible = presentation.resourcesVisible;
  const entryInsets = resolveDeckEntryInsets(
    presentation.accessoryState === 'speed-resources',
  );
  const popupHorizontal =
    (position?.x ?? 1) > 0.5 ? ('left' as const) : ('right' as const);
  const popupVertical =
    (position?.y ?? 1) > 0.5 ? ('above' as const) : ('below' as const);
  const setButtonNode = useCallback(
    (node: HTMLButtonElement | null) => {
      buttonRef.current = node;
      if (!hidden) triggerRef(node);
    },
    [hidden, triggerRef],
  );
  const setLaunchAnchorNode = useCallback(
    (node: HTMLSpanElement | null) => {
      if (hidden) triggerRef(node);
    },
    [hidden, triggerRef],
  );

  const clearRadialCollapseTimer = useCallback(() => {
    if (radialCollapseTimerRef.current === null) return;
    window.clearTimeout(radialCollapseTimerRef.current);
    radialCollapseTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (radialHideTimerRef.current !== null) {
      window.clearTimeout(radialHideTimerRef.current);
      radialHideTimerRef.current = null;
    }
    if (radialSignal) {
      setRadialRetained(true);
      return;
    }
    if (mode !== 'closed') {
      setRadialRetained(false);
      return;
    }
    radialHideTimerRef.current = window.setTimeout(() => {
      radialHideTimerRef.current = null;
      setRadialRetained(false);
    }, SPEED_WHEEL_HIDE_GRACE_MS);
    return () => {
      if (radialHideTimerRef.current === null) return;
      window.clearTimeout(radialHideTimerRef.current);
      radialHideTimerRef.current = null;
    };
  }, [mode, radialSignal]);

  const scheduleRadialCollapse = useCallback(
    (delay: number) => {
      clearRadialCollapseTimer();
      radialCollapseTimerRef.current = window.setTimeout(() => {
        radialCollapseTimerRef.current = null;
        setRadialExpanded(false);
      }, delay);
    },
    [clearRadialCollapseTimer],
  );

  const expandRadial = useCallback(() => {
    if (!radialRequested || document.hidden || !document.hasFocus()) return;
    clearRadialCollapseTimer();
    setRadialExpanded(true);
  }, [clearRadialCollapseTimer, radialRequested]);
  const gamepadInteractionRef = useRef({ expandRadial, onHover, onLeave });
  gamepadInteractionRef.current = { expandRadial, onHover, onLeave };

  useEffect(() => {
    if (!radialRequested) {
      clearRadialCollapseTimer();
      setRadialExpanded(false);
      return;
    }
    setRadialMounted(true);
    if (document.hidden || !document.hasFocus()) {
      setRadialExpanded(false);
      return;
    }
    setRadialExpanded(true);
    scheduleRadialCollapse(SPEED_WHEEL_AUTO_COLLAPSE_MS);
    return clearRadialCollapseTimer;
  }, [clearRadialCollapseTimer, radialRequested, scheduleRadialCollapse]);

  useEffect(() => {
    const deactivate = () => {
      ignoreRadialEntryRef.current = true;
      clearRadialCollapseTimer();
      setRadialExpanded(false);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) deactivate();
    };
    window.addEventListener('blur', deactivate);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', deactivate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clearRadialCollapseTimer]);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button || hidden || !ready || mode !== 'closed') return;
    return registerGamepadVirtualPointerElement({
      element: button,
      onHoverChange(hovered, point) {
        if (hovered && point) {
          gamepadInteractionRef.current.onHover(point.x);
          gamepadInteractionRef.current.expandRadial();
        } else {
          gamepadInteractionRef.current.onLeave();
        }
      },
    });
  }, [hidden, mode, ready]);

  useEffect(() => {
    const button = mediaResourcesButtonRef.current;
    if (!button || !mediaResourcesVisible) return;
    return registerGamepadVirtualPointerElement({ element: button });
  }, [mediaResourcesVisible]);

  const handleRadialClosed = useCallback(() => {
    if (!radialRequested) setRadialMounted(false);
  }, [radialRequested]);

  const updateDragPosition = useCallback((event: PointerEvent) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const update = updateDeckEntryDragSession(session, {
      pointerX: event.clientX,
      pointerY: event.clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    if (!update) return;
    if (update.started) setDragging(true);
    event.preventDefault();
    dragCallbacksRef.current.onPositionChange(update.position);
  }, []);

  const finishDrag = useCallback(
    (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      updateDragPosition(event);
      dragSessionRef.current = null;
      const button = buttonRef.current;
      if (button?.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
      if (!session.moved) return;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      setDragging(false);
      dragCallbacksRef.current.onPositionCommit(session.position);
    },
    [updateDragPosition],
  );

  useEffect(() => {
    window.addEventListener('pointermove', updateDragPosition, true);
    window.addEventListener('pointerup', finishDrag, true);
    window.addEventListener('pointercancel', finishDrag, true);
    return () => {
      window.removeEventListener('pointermove', updateDragPosition, true);
      window.removeEventListener('pointerup', finishDrag, true);
      window.removeEventListener('pointercancel', finishDrag, true);
      dragSessionRef.current = null;
    };
  }, [finishDrag, updateDragPosition]);

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!presentation.canDrag || event.button !== 0 || !event.isPrimary) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const session = createDeckEntryDragSession({
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      centerX: bounds.left + bounds.width / 2,
      centerY: bounds.top + bounds.height / 2,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      position,
      insets: entryInsets,
    });
    dragSessionRef.current = session;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  };

  const positionStyle: DeckTriggerStyle = {
    '--manager-deck-entry-width': `${DECK_ENTRY_LAYOUT.dock.width}px`,
    '--manager-deck-entry-height': `${DECK_ENTRY_LAYOUT.dock.height}px`,
    '--manager-deck-entry-half-width': `${DECK_ENTRY_LAYOUT.dock.width / 2}px`,
    '--manager-deck-entry-half-height': `${DECK_ENTRY_LAYOUT.dock.height / 2}px`,
    '--manager-deck-entry-anchor-x': `${DECK_ENTRY_LAYOUT.dock.defaultCenterOffset}px`,
    '--manager-deck-entry-anchor-y': `${DECK_ENTRY_LAYOUT.dock.defaultCenterOffset}px`,
    '--manager-deck-entry-left-inset': `${entryInsets.left}px`,
    '--manager-deck-entry-right-inset': `${entryInsets.right}px`,
    '--manager-deck-entry-top-inset': `${entryInsets.top}px`,
    '--manager-deck-entry-bottom-inset': `${entryInsets.bottom}px`,
    '--manager-deck-entry-button-width': `${DECK_ENTRY_LAYOUT.core.buttonWidth}px`,
    '--manager-deck-entry-button-height': `${DECK_ENTRY_LAYOUT.core.buttonHeight}px`,
    '--manager-deck-entry-logo-size': `${DECK_ENTRY_LAYOUT.core.logoSize}px`,
    '--manager-media-speed-radius': `${DECK_ENTRY_LAYOUT.speed.radius}px`,
    '--manager-media-speed-option-width': `${DECK_ENTRY_LAYOUT.speed.optionWidth}px`,
    '--manager-media-speed-option-height': `${DECK_ENTRY_LAYOUT.speed.optionHeight}px`,
    '--manager-media-speed-crowded-option-width': `${DECK_ENTRY_LAYOUT.speed.crowdedOptionWidth}px`,
    '--manager-media-speed-crowded-option-height': `${DECK_ENTRY_LAYOUT.speed.crowdedOptionHeight}px`,
    '--manager-media-speed-option-emphasis-scale': `${DECK_ENTRY_LAYOUT.speed.optionEmphasisScale}`,
    '--manager-media-resources-size': `${DECK_ENTRY_LAYOUT.resources.size}px`,
    '--manager-media-resources-combined-offset': `${DECK_ENTRY_LAYOUT.resources.combinedOffset}px`,
    ...(position
      ? {
          '--manager-deck-entry-x': `${position.x * 100}%`,
          '--manager-deck-entry-y': `${position.y * 100}%`,
        }
      : {}),
  };

  const cluster = (
    <div
      className={`manager-deck-entry-cluster${radialVisible ? ' has-speed-radial' : ''}${mediaResourcesVisible ? ' has-media-resources-trigger' : ''}${hidden ? ' has-hidden-trigger' : ''}${position ? ' has-custom-position' : ''}${dragging ? ' is-dragging' : ''}`}
      data-core-state={presentation.coreState}
      data-accessories={presentation.accessoryState}
      data-media-resources-placement={
        presentation.resourcePlacement ?? undefined
      }
      data-cat-catch-popup-horizontal={
        mediaResourcesPopup ? popupHorizontal : undefined
      }
      data-cat-catch-popup-vertical={
        mediaResourcesPopup ? popupVertical : undefined
      }
      style={positionStyle}
      onPointerEnter={(event) => {
        if (!speedWheelInteractionTarget(event.target)) return;
        if (ignoreRadialEntryRef.current) return;
        expandRadial();
      }}
      onPointerMove={(event) => {
        if (
          !speedWheelInteractionTarget(event.target) ||
          document.hidden ||
          !document.hasFocus() ||
          !ignoreRadialEntryRef.current ||
          !mediaSpeedWheelPointerMoved(event.movementX, event.movementY)
        ) {
          return;
        }
        ignoreRadialEntryRef.current = false;
        expandRadial();
      }}
      onPointerLeave={() => {
        if (!radialRequested || dragging) return;
        if (document.hidden || !document.hasFocus()) return;
        ignoreRadialEntryRef.current = false;
        scheduleRadialCollapse(SPEED_WHEEL_LEAVE_COLLAPSE_MS);
      }}
    >
      {radialVisible && (
        <MediaSpeedRadialMenu
          items={speedWheelItems}
          selection={speedSelection}
          visible={radialRequested}
          expanded={radialExpanded}
          onClosed={handleRadialClosed}
          onRequestExpand={expandRadial}
          onSelect={onSpeedSelection}
        />
      )}
      {mediaResourcesVisible && (
        <button
          ref={mediaResourcesButtonRef}
          type="button"
          className="manager-media-resources-trigger"
          aria-label={`打开发现的 ${mediaResourcesCount} 项媒体资源`}
          title={`发现 ${mediaResourcesCount} 项媒体资源`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.detail > 0) event.currentTarget.blur();
            onOpenMediaResources?.();
          }}
        >
          <img
            className="manager-media-resources-trigger__logo is-default"
            src={MEDIA_RESOURCES_LOGO_URL}
            alt=""
            aria-hidden="true"
          />
          <img
            className="manager-media-resources-trigger__logo is-hover"
            src={MEDIA_RESOURCES_HOVER_LOGO_URL}
            alt=""
            aria-hidden="true"
          />
          {showMediaResourcesBadge && (
            <span
              className="manager-entry-count-badge manager-media-resources-trigger__badge"
              data-compact={
                deckEntryBadgeCompact(mediaResourcesCount) ? 'true' : undefined
              }
              aria-hidden="true"
            >
              {deckEntryBadgeText(mediaResourcesCount)}
            </span>
          )}
        </button>
      )}
      {mediaResourcesPopup}
      <button
        ref={setButtonNode}
        type="button"
        disabled={!presentation.canActivate}
        data-audio-managed="true"
        className={`manager-deck-trigger${presentation.coreState === 'hidden' ? ' is-hidden' : ''}${presentation.coreState === 'closed' ? ' is-ready' : ''}${presentation.coreState === 'transition' ? ' is-transitioning' : ''}${presentation.coreState === 'suppressed' ? ' is-suppressed' : ''}${presentation.coreState === 'receiving' ? ' is-import-receiving' : ''}${dragging ? ' is-dragging' : ''}`}
        aria-hidden={presentation.coreVisible ? undefined : true}
        tabIndex={presentation.coreVisible ? undefined : -1}
        onPointerEnter={(event) => {
          onHover(event.clientX);
        }}
        onPointerLeave={onLeave}
        onPointerDown={beginDrag}
        onDragStart={(event) => {
          event.preventDefault();
        }}
        onClick={(event) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (event.detail > 0) event.currentTarget.blur();
          onActivate();
        }}
        aria-grabbed={dragging}
        aria-label={
          presentation.coreState === 'receiving'
            ? '正在接收导入卡牌'
            : presentation.coreState === 'transition'
              ? '正在切换当前页面牌阵'
              : presentation.coreState === 'suppressed'
                ? '当前牌阵正在处理操作'
                : `展开 ${visibleCount} 张匹配卡牌，可拖动调整入口位置`
        }
      >
        <span className="manager-deck-trigger__logo-anchor">
          <DeckEntryLogo className="manager-deck-trigger__logo" />
          {showDeckTriggerBadge && ready && (
            <span
              className="manager-entry-count-badge manager-deck-trigger__badge"
              data-compact={
                deckEntryBadgeCompact(activeCount) ? 'true' : undefined
              }
              aria-hidden="true"
            >
              {deckEntryBadgeText(activeCount)}
            </span>
          )}
        </span>
      </button>
    </div>
  );

  return hidden ? (
    <>
      <span
        ref={setLaunchAnchorNode}
        className="manager-deck-launch-anchor"
        aria-hidden="true"
      />
      {cluster}
    </>
  ) : (
    cluster
  );
}
