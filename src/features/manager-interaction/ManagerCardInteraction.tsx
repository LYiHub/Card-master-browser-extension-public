import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useAudioDirector } from '../../audio/AudioDirectorProvider';
import { ACTION_ATTACHMENT_DURATION_CSS } from './action-attachment-motion';
import {
  type ActionHitSample,
  cardLayout,
  formationCardLayout,
  type Point,
} from './layout';
import { ManagerCardGlowEffect } from './ManagerCardGlowEffect';
import type { CardCollectionRole, ManagerMode } from './state';
import {
  type ManagerCardReleaseDisposition,
  useManagerCardGesture,
} from './useManagerCardGesture';
import {
  type ManagerDeckSource,
  useManagerCardLifecycleMotion,
} from './useManagerCardLifecycleMotion';

const NOOP = () => undefined;

export type ManagerCardItem = {
  id: string;
  kind: string;
};

export type ManagerCardInteractionProps<
  Item extends ManagerCardItem,
  ActionKind extends string,
> = {
  item: Item;
  index: number;
  layerIndex: number;
  total: number;
  mode: ManagerMode;
  selectedId: string | null;
  selectedIndex: number;
  focusedIndex: number | null;
  viewportWidth: number;
  viewportHeight: number;
  retreated?: boolean;
  dealActive?: boolean;
  dealCycle: number;
  collectCycle: number;
  arrivingId: string | null;
  castingActionKind: ActionKind | null;
  collectionRole: CardCollectionRole;
  activeManagerAction: {
    kind: ActionKind;
    accent?: string;
  } | null;
  deckSource: ManagerDeckSource;
  presentationSuppressed?: boolean;
  hoverManagedExternally?: boolean;
  actionRoot: ParentNode;
  accent: string;
  ariaLabel: string;
  backImageUrl: string;
  cardKindDataAttribute: 'data-package-kind' | 'data-deck-card-kind';
  renderFace: (
    active: boolean,
    playing: boolean,
    audioActive: boolean,
  ) => ReactNode;
  renderActionFrame: (className: string, style?: CSSProperties) => ReactNode;
  onFocus: (index: number | null) => void;
  onDealReady?: () => void;
  onDealComplete: () => void;
  onCollectAll: () => void;
  onArrivalComplete: (id: string) => void;
  onReturnComplete: (id: string) => void;
  interactionId: string | null;
  onInteractionClaim: (id: string, cancelGesture?: () => void) => boolean;
  onInteractionRelease: (id: string) => void;
  onDragStart: (id: string) => void;
  onActionStart: (id: string) => void;
  onActionCancel: (id: string) => void;
  onActivate: (item: Item, element: HTMLElement, point: Point) => void;
  onReorderPoint: (id: string, point: Point) => void;
  onReorderRelease: (point: Point | null) => void;
  onDragPoint: (sample: ActionHitSample, actionId: string | null) => void;
  onRelease: (
    item: Item,
    element: HTMLElement,
    sample: ActionHitSample,
    actionId: string | null,
  ) => ManagerCardReleaseDisposition;
};

type PresentationProp =
  | 'actionRoot'
  | 'accent'
  | 'ariaLabel'
  | 'backImageUrl'
  | 'cardKindDataAttribute'
  | 'renderFace'
  | 'renderActionFrame';

export type ManagerCardBehaviorProps<
  Item extends ManagerCardItem,
  ActionKind extends string,
> = Omit<ManagerCardInteractionProps<Item, ActionKind>, PresentationProp>;

function pointInside(bounds: DOMRect, x: number, y: number, margin = 8) {
  return (
    x >= bounds.left - margin &&
    x <= bounds.right + margin &&
    y >= bounds.top - margin &&
    y <= bounds.bottom + margin
  );
}

export function ManagerCardInteraction<
  Item extends ManagerCardItem,
  ActionKind extends string,
>({
  item,
  index,
  layerIndex,
  total,
  mode,
  selectedId,
  selectedIndex,
  focusedIndex,
  viewportWidth,
  viewportHeight,
  retreated = false,
  dealActive = mode === 'dealing',
  dealCycle,
  collectCycle,
  arrivingId,
  castingActionKind,
  collectionRole,
  activeManagerAction,
  deckSource,
  presentationSuppressed = false,
  hoverManagedExternally = false,
  actionRoot,
  accent,
  ariaLabel,
  backImageUrl,
  cardKindDataAttribute,
  renderFace,
  renderActionFrame,
  onFocus,
  onDealReady = NOOP,
  onDealComplete,
  onCollectAll,
  onArrivalComplete,
  onReturnComplete,
  interactionId,
  onInteractionClaim,
  onInteractionRelease,
  onDragStart,
  onActionStart,
  onActionCancel,
  onActivate,
  onReorderPoint,
  onReorderRelease,
  onDragPoint,
  onRelease,
}: ManagerCardInteractionProps<Item, ActionKind>) {
  const audio = useAudioDirector();
  const rootRef = useRef<HTMLButtonElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const flipperRef = useRef<HTMLDivElement | null>(null);
  const hoverHomeBoundsRef = useRef<DOMRect | null>(null);
  const reorderSettlingRef = useRef(false);
  const layout = cardLayout(index, total, viewportWidth, viewportHeight);
  const stableZIndex = layerIndex + 20;
  const focused = focusedIndex === index;
  const formation = formationCardLayout(layout, index, focusedIndex);
  const formationRef = useRef(formation);
  const stableZIndexRef = useRef(stableZIndex);
  formationRef.current = formation;
  stableZIndexRef.current = stableZIndex;
  const selected = selectedId === item.id;
  const targeting =
    selected && (mode === 'targeting' || mode === 'element-targeting');
  const casting = castingActionKind !== null;
  const arriving = arrivingId === item.id;
  const interactionOwner = interactionId === item.id;
  const [settledDealCycle, setSettledDealCycle] = useState(0);
  const dealSettled = !dealActive || settledDealCycle === dealCycle;
  const markDealSettled = useCallback(
    () => setSettledDealCycle(dealCycle),
    [dealCycle],
  );

  const {
    dragging,
    hasActiveGesture,
    resetGesture,
    settleTilt,
    pointerDown,
    pointerMove,
    finish,
    cancelGesture,
  } = useManagerCardGesture({
    item,
    index,
    total,
    mode,
    targeting,
    viewportWidth,
    viewportHeight,
    actionRoot,
    audio,
    rootRef,
    tiltRef,
    formationRef,
    stableZIndexRef,
    reorderSettlingRef,
    onFocus,
    onInteractionClaim,
    onInteractionRelease,
    onDragStart,
    onActionStart,
    onActionCancel,
    onActivate,
    onReorderPoint,
    onReorderRelease,
    onDragPoint,
    onRelease,
  });
  const mediaPlaying =
    mode !== 'closed' &&
    mode !== 'collecting' &&
    mode !== 'returning' &&
    !retreated &&
    (focused || dragging || selected || casting || interactionOwner);
  const mediaAudioActive =
    mediaPlaying &&
    focused &&
    !dragging &&
    !selected &&
    !casting &&
    !interactionOwner &&
    (mode === 'spread' || (mode === 'dealing' && dealSettled));

  useManagerCardLifecycleMotion({
    itemId: item.id,
    index,
    total,
    mode,
    selected,
    selectedIndex,
    focused,
    dragging,
    arriving,
    interactionOwner,
    stableZIndex,
    dealActive,
    dealSettled,
    dealCycle,
    collectCycle,
    collectionRole,
    layout,
    formation,
    deckSource,
    viewportWidth,
    viewportHeight,
    retreated,
    audio,
    rootRef,
    flipperRef,
    reorderSettlingRef,
    resetGesture,
    onDealSettled: markDealSettled,
    onDealReady,
    onDealComplete,
    onCollectAll,
    onArrivalComplete,
    onReturnComplete,
  });

  useEffect(() => {
    if (hoverManagedExternally) return;
    const root = rootRef.current;
    const home = hoverHomeBoundsRef.current;
    if (!root || !home || !focused || dragging) return;
    const handlePointerMove = (event: PointerEvent) => {
      if (
        pointInside(home, event.clientX, event.clientY) ||
        pointInside(root.getBoundingClientRect(), event.clientX, event.clientY)
      ) {
        return;
      }
      hoverHomeBoundsRef.current = null;
      onFocus(null);
      settleTilt();
    };
    window.addEventListener('pointermove', handlePointerMove, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener('pointermove', handlePointerMove, true);
  }, [dragging, focused, hoverManagedExternally, onFocus, settleTilt]);

  const previousFocusedRef = useRef(focused);
  useEffect(() => {
    if (
      hoverManagedExternally &&
      previousFocusedRef.current &&
      !focused &&
      !dragging
    ) {
      settleTilt();
    }
    previousFocusedRef.current = focused;
  }, [dragging, focused, hoverManagedExternally, settleTilt]);

  return (
    <button
      type="button"
      ref={rootRef}
      className={`manager-card${focused ? ' is-focused' : ''}${dragging ? ' is-dragging' : ''}${interactionOwner ? ' is-interacting' : ''}${dealSettled ? ' is-deal-settled' : ''}${mode === 'collecting' ? ' is-collecting' : ''}${targeting ? ' is-targeting' : ''}${castingActionKind ? ` is-casting manager-action--${castingActionKind}` : ''}`}
      style={{ '--manager-accent': accent } as CSSProperties}
      {...{ [cardKindDataAttribute]: item.kind }}
      data-manager-card-id={item.id}
      data-audio-managed="true"
      hidden={presentationSuppressed}
      tabIndex={mode === 'spread' && dealSettled && focused ? 0 : -1}
      aria-label={ariaLabel}
      aria-pressed={selected}
      onPointerEnter={(event) => {
        if (hoverManagedExternally) return;
        if (
          (mode === 'spread' || (mode === 'dealing' && dealSettled)) &&
          (!interactionId || interactionOwner)
        ) {
          hoverHomeBoundsRef.current ??=
            event.currentTarget.getBoundingClientRect();
          void audio.prepare([
            'cardHover',
            'cardPress',
            'cardLift',
            'cardPlace',
            'cardReturn',
            'cardFlip',
            'actionOpen',
            'actionAttach',
            'actionDetach',
          ]);
          audio.play('cardHover', { positionX: event.clientX });
          onFocus(index);
        }
      }}
      onPointerLeave={(event) => {
        if (hoverManagedExternally) {
          if (!hasActiveGesture() && !reorderSettlingRef.current) settleTilt();
          return;
        }
        const home = hoverHomeBoundsRef.current;
        if (home && pointInside(home, event.clientX, event.clientY)) return;
        if (
          !hasActiveGesture() &&
          !reorderSettlingRef.current &&
          (mode === 'spread' ||
            mode === 'reordering' ||
            (mode === 'dealing' && dealSettled))
        ) {
          hoverHomeBoundsRef.current = null;
          onFocus(null);
          settleTilt();
        }
      }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={finish}
      onPointerCancel={cancelGesture}
      onLostPointerCapture={cancelGesture}
    >
      <div ref={tiltRef} className="manager-card__tilt">
        <div ref={flipperRef} className="manager-card__flipper">
          {renderFace(
            casting ||
              focused ||
              dragging ||
              ((mode === 'targeting' ||
                mode === 'element-targeting' ||
                mode === 'returning') &&
                selected),
            mediaPlaying,
            mediaAudioActive,
          )}
          <div className="manager-card__back">
            <img src={backImageUrl} alt="" />
          </div>
        </div>
        <ManagerCardGlowEffect />
        {renderActionFrame(
          `manager-card__action-frame${activeManagerAction ? ` is-visible manager-action--${activeManagerAction.kind}` : ''}`,
          {
            '--manager-action-attachment-duration':
              ACTION_ATTACHMENT_DURATION_CSS,
            ...(activeManagerAction?.accent
              ? { '--action-color': activeManagerAction.accent }
              : {}),
          } as CSSProperties,
        )}
      </div>
    </button>
  );
}
