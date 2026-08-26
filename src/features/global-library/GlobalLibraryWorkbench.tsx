import {
  Archive,
  ChevronDown,
  ChevronUp,
  CircleSlash2,
  ExternalLink,
  Eye,
  EyeOff,
  Power,
  PowerOff,
  Search,
  Settings,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  BilibiliCapabilityId,
  BilibiliCapabilitySnapshot,
} from '../../bilibili-capabilities/domain/types';
import { bilibiliCapabilityDefinition } from '../../bilibili-capabilities/registry';
import { CardBottomFrame } from '../../components/CardBottomFrame';
import { UserscriptSourcePanel } from '../../components/UserscriptSourcePanel';
import { CardInfoPopover } from '../../components/ui/CardInfoPopover';
import { MotionIconSwap } from '../../components/ui/MotionIconSwap';
import {
  UiButton,
  UiDialog,
  UiLayeredCompactDialog,
  UiLoader,
  UiNotice,
  UiSegmentedControl,
  UiWorkspace,
} from '../../components/ui/Ui';
import {
  CONTENT_BLOCKER_CARD_ID,
  type ContentBlockingSnapshot,
  startingContentBlockingSnapshot,
} from '../../content-blocking/domain/types';
import type {
  GamepadControlController,
  GamepadControlSettings,
} from '../../gamepad-control/domain/settings';
import { GAMEPAD_CONTROL_CARD_ID } from '../../gamepad-control/domain/types';
import { useGamepadConnection } from '../../gamepad-control/useGamepadSnapshot';
import { extensionTarget } from '../../hosts/extension/platform';
import { useElementVisibility } from '../../lib/element-visibility';
import { projectAssetUrl } from '../../lib/project-assets';
import {
  MEDIA_RESOURCES_CARD_ID,
  type MediaResourcesSnapshot,
  startingMediaResourcesSnapshot,
} from '../../media-resources/domain/types';
import {
  MEDIA_SPEED_CARD_ID,
  type MediaSpeedSnapshot,
  startingMediaSpeedSnapshot,
} from '../../media-speed/domain/types';
import { gsap } from '../../motion/gsap';
import {
  PAGE_THEME_CARD_ID,
  type PageThemeSnapshot,
  startingPageThemeSnapshot,
} from '../../page-theme/domain/types';
import {
  NEW_TAB_CARD_ID,
  systemCardOfferedOnTarget,
} from '../../system-cards/domain/catalog';
import {
  userscriptPublicationPageUrl,
  userscriptSourcePageUrl,
} from '../../userscript/application/publication-page';
import type { ScriptRepository } from '../../userscript/application/script-repository';
import { userscriptExportFilename } from '../../userscript/application/source-export';
import { userscriptDisplayName } from '../../userscript/domain/metadata';
import type { InstalledUserscript } from '../../userscript/domain/types';
import { BrowserUserscriptSourceExporter } from '../../userscript/infrastructure/browser-source-export';
import { userscriptPlatformCompatibilityDiagnostics } from '../../userscript/runtime/platform-compatibility';
import { useReducedMotion } from '../manager-interaction/useReducedMotion';
import { actionsFor } from '../userscript-deck/actions';
import {
  bilibiliIntegrationCards,
  cardDescription,
  cardEnabled,
  cardTitle,
  contentBlockingCard,
  DECK_STEWARD_CARD,
  type DeckCard,
  gamepadControlCard,
  isBilibiliCapabilityCard,
  isContentBlockingCard,
  isGamepadControlCard,
  isInstalledUserscript,
  isMediaResourcesCard,
  isMediaSpeedCard,
  isNewTabCard,
  isPageThemeCard,
  mediaResourcesCard,
  mediaSpeedCard,
  NEW_TAB_CARD,
  pageThemeCard,
} from '../userscript-deck/cards';
import {
  applyDeckEntrySettingsMutation,
  DEFAULT_DECK_ENTRY_SETTINGS,
  type DeckEntryController,
} from '../userscript-deck/deck-entry';
import { CardFace } from '../userscript-deck/ManagerCard';
import { useCardAccent } from '../userscript-deck/useCardAccent';
import {
  GLOBAL_LIBRARY_CLOSED_EVENT,
  GLOBAL_LIBRARY_CLOSING_EVENT,
} from './lifecycle';

const CARD_BOTTOM_FRAME_URL = projectAssetUrl(
  'userscript-deck/visual/cards/bottom-frame.webp',
);
const SOURCE_EXPORTER = new BrowserUserscriptSourceExporter();
const HOVER_CARD_PLAQUE_WIDTH = 380;
type LibraryFilter = 'all' | 'enabled' | 'disabled';
type InspectionMode = 'metadata' | 'source';
type GlobalLibraryCard = DeckCard;

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已停用' },
] as const;

const INSPECTION_MODES = [
  { value: 'metadata', label: '卡牌信息' },
  { value: 'source', label: '完整源码' },
] as const;

function cardHiddenFromDeck(
  cardId: string,
  hiddenCardIds: ReadonlySet<string>,
) {
  return hiddenCardIds.has(cardId);
}

function cardUnavailableReason(card: GlobalLibraryCard) {
  if (
    (isBilibiliCapabilityCard(card) || isMediaResourcesCard(card)) &&
    !card.snapshot.available
  ) {
    return card.snapshot.unavailableReason ?? '当前平台不支持这张卡牌。';
  }
  return null;
}

function cardUnavailableLabel(card: GlobalLibraryCard) {
  return isBilibiliCapabilityCard(card) ? 'Safari 不支持' : '当前平台不支持';
}

function GlobalLibraryCard({
  card,
  selected,
  hidden,
  unavailableReason,
  onSelect,
  onInspect,
  onInspectEnd,
}: {
  card: GlobalLibraryCard;
  selected: boolean;
  hidden: boolean;
  unavailableReason: string | null;
  onSelect: () => void;
  onInspect: (card: GlobalLibraryCard, element: HTMLElement) => void;
  onInspectEnd: (cardId: string) => void;
}) {
  const { ref: visibilityRef, visible } =
    useElementVisibility<HTMLButtonElement>();
  const rootRef = useRef<HTMLButtonElement | null>(null);
  const previewRef = useRef<HTMLSpanElement | null>(null);
  const previousBoundsRef = useRef<DOMRect | null>(null);
  const [activationCycle, setActivationCycle] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useReducedMotion();
  const accent = useCardAccent(card);
  const setRootRef = useCallback(
    (node: HTMLButtonElement | null) => {
      rootRef.current = node;
      visibilityRef(node);
    },
    [visibilityRef],
  );

  useLayoutEffect(() => {
    const preview = previewRef.current;
    const root = rootRef.current;
    if (!preview || !root || !selected) return;
    gsap.killTweensOf(preview);

    const previous = previousBoundsRef.current;
    previousBoundsRef.current = null;
    const current = root.getBoundingClientRect();
    const x = previous
      ? previous.left + previous.width / 2 - (current.left + current.width / 2)
      : 0;
    const y = previous
      ? previous.top + previous.height / 2 - (current.top + current.height / 2)
      : 0;
    const timeline = gsap.timeline();

    if (activationCycle > 0) {
      const currentX = Number(gsap.getProperty(preview, 'x')) || 0;
      const currentY = Number(gsap.getProperty(preview, 'y')) || 0;
      gsap.set(preview, { x: currentX + x, y: currentY + y });
      timeline
        .to(preview, {
          x: x * 0.45,
          y: y * 0.45 + 2,
          scale: 1.04,
          duration: reducedMotion ? 0.28 : 0.14,
          ease: 'power2.inOut',
        })
        .to(preview, {
          x: 0,
          y: 0,
          scale: 1.1,
          duration: reducedMotion ? 0.48 : 0.42,
          ease: 'power3.out',
        });
    } else {
      gsap.set(preview, { x: 0, y: 0, scale: 1.1 });
    }

    if (!reducedMotion) {
      timeline.to(preview, {
        y: -8,
        duration: 1.6,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });
    }
    return () => {
      timeline.kill();
    };
  }, [activationCycle, reducedMotion, selected]);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview || selected) return;
    gsap.killTweensOf(preview);
    const tween = gsap.to(preview, {
      x: 0,
      y: 0,
      scale: hovered || focused ? 1.1 : 1,
      duration: reducedMotion ? 0.4 : 0.32,
      ease: 'power3.out',
    });
    return () => {
      tween.kill();
    };
  }, [focused, hovered, reducedMotion, selected]);

  return (
    <button
      ref={setRootRef}
      type="button"
      className={`global-library-card${selected ? ' is-selected' : ''}${hidden ? ' is-deck-hidden' : ''}${unavailableReason ? ' is-unavailable' : ''}`}
      style={{ '--manager-accent': accent } as CSSProperties}
      aria-pressed={selected}
      aria-label={`${cardTitle(card)}${unavailableReason ? `，${cardUnavailableLabel(card)}` : hidden ? '，已从牌阵隐藏' : ''}`}
      onClick={() => {
        previousBoundsRef.current =
          rootRef.current?.getBoundingClientRect() ?? null;
        setActivationCycle((cycle) => cycle + 1);
        onSelect();
      }}
      onPointerEnter={(event) => {
        setHovered(true);
        onInspect(
          card,
          event.currentTarget.querySelector<HTMLElement>(
            '.global-library-card__preview',
          ) ?? event.currentTarget,
        );
      }}
      onPointerLeave={() => {
        setHovered(false);
        onInspectEnd(card.id);
      }}
      onFocus={(event) => {
        setFocused(true);
        onInspect(
          card,
          event.currentTarget.querySelector<HTMLElement>(
            '.global-library-card__preview',
          ) ?? event.currentTarget,
        );
      }}
      onBlur={() => {
        setFocused(false);
        onInspectEnd(card.id);
      }}
    >
      <span
        ref={previewRef}
        className="global-library-card__preview"
        aria-hidden="true"
      >
        <CardFace
          item={card}
          active={selected}
          playing={visible && (selected || hovered || focused)}
          audioActive={hovered}
          loadMedia={visible}
          preloadFrame
        />
        <CardBottomFrame
          className="global-library-card__bottom"
          imageClassName="global-library-card__bottom-image"
          source={CARD_BOTTOM_FRAME_URL}
        />
      </span>
      {unavailableReason ? (
        <span className="global-library-card__availability-badge">
          <CircleSlash2 size={13} aria-hidden="true" />
          {cardUnavailableLabel(card)}
        </span>
      ) : hidden ? (
        <span className="global-library-card__visibility-badge">
          <EyeOff size={13} aria-hidden="true" />
          已隐藏
        </span>
      ) : null}
    </button>
  );
}

type HoveredCardInspection = {
  card: GlobalLibraryCard;
  side: 'left' | 'right';
  left: number;
  desiredTop: number;
};

function hoveredCardInspection(
  card: GlobalLibraryCard,
  element: HTMLElement,
): HoveredCardInspection {
  const bounds = element.getBoundingClientRect();
  const width = Math.min(
    HOVER_CARD_PLAQUE_WIDTH,
    Math.max(0, window.innerWidth - 36),
  );
  const scaledLeft = bounds.left - bounds.width * 0.05;
  const scaledRight = bounds.right + bounds.width * 0.05;
  const scaledTop = bounds.top - bounds.height * 0.05;
  const side = scaledRight + width <= window.innerWidth - 18 ? 'right' : 'left';
  return {
    card,
    side,
    left: side === 'right' ? scaledRight : Math.max(18, scaledLeft - width),
    desiredTop: scaledTop + 2,
  };
}

function HoveredCardPlaque({
  inspection,
}: {
  inspection: HoveredCardInspection;
}) {
  const plaqueRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({
    left: inspection.left,
    top: inspection.desiredTop,
  });

  useLayoutEffect(() => {
    const plaque = plaqueRef.current;
    if (!plaque) return;
    const viewportGap = 18;
    const updatePosition = () => {
      const bounds = plaque.getBoundingClientRect();
      const left = Math.max(
        viewportGap,
        Math.min(
          window.innerWidth - bounds.width - viewportGap,
          inspection.left,
        ),
      );
      const top = Math.max(
        viewportGap,
        Math.min(
          window.innerHeight - bounds.height - viewportGap,
          inspection.desiredTop,
        ),
      );
      setPosition((current) =>
        current.left === left && current.top === top ? current : { left, top },
      );
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(plaque);
    return () => observer.disconnect();
  }, [inspection]);

  return (
    <CardInfoPopover
      ref={plaqueRef}
      title={cardTitle(inspection.card)}
      className={`global-library-card-plaque is-${inspection.side}`}
      style={
        {
          left: position.left,
          top: position.top,
        } as CSSProperties
      }
      ariaHidden
    >
      <p>
        {cardUnavailableReason(inspection.card) ??
          cardDescription(inspection.card) ??
          '该卡牌未提供说明。'}
      </p>
    </CardInfoPopover>
  );
}

function MetadataValues({
  label,
  values,
  href,
}: {
  label: string;
  values: readonly string[];
  href?: string | null;
}) {
  const occurrences = new Map<string, number>();
  const entries = (values.length > 0 ? values : ['未声明']).map((value) => {
    const occurrence = (occurrences.get(value) ?? 0) + 1;
    occurrences.set(value, occurrence);
    return { key: `${value}:${occurrence}`, value };
  });
  return (
    <div className="global-library-metadata">
      <span>{label}</span>
      <div>
        {entries.map((entry) =>
          href && entries.length === 1 ? (
            <a
              key={entry.key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title="在新标签页打开脚本来源"
            >
              <code>{entry.value}</code>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          ) : (
            <code key={entry.key}>{entry.value}</code>
          ),
        )}
      </div>
    </div>
  );
}

function ExpandableDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const [expandable, setExpandable] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement | null>(null);

  useLayoutEffect(() => {
    const element = descriptionRef.current;
    if (!element || expanded) return;
    const measure = () =>
      setExpandable(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <div
      className={`global-library-detail__description${expanded ? ' is-expanded' : ''}`}
    >
      <p ref={descriptionRef}>{description || '该卡牌未提供说明。'}</p>
      {expandable && (
        <button type="button" onClick={() => setExpanded((value) => !value)}>
          <MotionIconSwap
            state={expanded ? 'expanded' : 'collapsed'}
            items={[
              { state: 'collapsed', icon: <ChevronDown size={14} /> },
              { state: 'expanded', icon: <ChevronUp size={14} /> },
            ]}
          />
          {expanded ? '收起说明' : '展开说明'}
        </button>
      )}
    </div>
  );
}

function DeckVisibilityButton({
  hidden,
  busy,
  sessionOnly = false,
  onChange,
}: {
  hidden: boolean;
  busy: boolean;
  sessionOnly?: boolean;
  onChange: (hidden: boolean) => Promise<void>;
}) {
  return (
    <UiButton
      variant={hidden ? 'primary' : 'secondary'}
      disabled={busy}
      aria-pressed={hidden}
      title={
        sessionOnly
          ? hidden
            ? '重新放回当前牌阵'
            : '先从牌阵拿开，重启浏览器后会回来'
          : hidden
            ? '恢复在牌阵中显示'
            : '从牌阵中隐藏，卡牌仍继续运行'
      }
      onClick={() => void onChange(!hidden)}
    >
      <MotionIconSwap
        state={hidden ? 'restore' : 'hide'}
        items={[
          {
            state: 'hide',
            icon: <EyeOff size={15} aria-hidden="true" />,
          },
          {
            state: 'restore',
            icon: <Eye size={15} aria-hidden="true" />,
          },
        ]}
      />
      {sessionOnly
        ? hidden
          ? '重新显示'
          : '暂时在牌阵中隐藏，重启浏览器恢复'
        : hidden
          ? '在牌阵中显示'
          : '在牌阵中隐藏'}
    </UiButton>
  );
}

function CardEnablementButton({
  enabled,
  busy,
  onChange,
}: {
  enabled: boolean;
  busy: boolean;
  onChange: (enabled: boolean) => Promise<void>;
}) {
  return (
    <UiButton
      variant={enabled ? 'secondary' : 'primary'}
      disabled={busy}
      aria-pressed={enabled}
      data-action={enabled ? 'disable' : 'enable'}
      title={enabled ? '当前已启用，点击停用' : '当前已停用，点击启用'}
      onClick={() => void onChange(!enabled)}
    >
      <MotionIconSwap
        state={enabled ? 'disable' : 'enable'}
        items={[
          {
            state: 'disable',
            icon: <PowerOff size={15} aria-hidden="true" />,
          },
          {
            state: 'enable',
            icon: <Power size={15} aria-hidden="true" />,
          },
        ]}
      />
      {enabled ? '停用' : '启用'}
    </UiButton>
  );
}

function SystemCardDetail({
  card,
  hiddenFromDeck,
  busy,
  onHiddenFromDeckChange,
  onToggleContentBlocking,
  onToggleGamepadControl,
  onTogglePageTheme,
  onToggleMediaSpeed,
  onToggleMediaResources,
  onToggleBilibiliCapability,
  onOpenNewTabSettings,
  onOpenSettings,
}: {
  card: Exclude<GlobalLibraryCard, InstalledUserscript>;
  hiddenFromDeck: boolean;
  busy: boolean;
  onHiddenFromDeckChange: (hidden: boolean) => Promise<void>;
  onToggleContentBlocking: (enabled: boolean) => Promise<void>;
  onToggleGamepadControl: (enabled: boolean) => Promise<void>;
  onTogglePageTheme: (enabled: boolean) => Promise<void>;
  onToggleMediaSpeed: (enabled: boolean) => Promise<void>;
  onToggleMediaResources: (enabled: boolean) => Promise<void>;
  onToggleBilibiliCapability: (
    capabilityId: BilibiliCapabilityId,
    enabled: boolean,
  ) => Promise<void>;
  onOpenNewTabSettings: () => Promise<void>;
  onOpenSettings: (() => void) | null;
}) {
  if (card.kind === 'steward') {
    return (
      <>
        <div className="global-library-detail__actions">
          <DeckVisibilityButton
            hidden={hiddenFromDeck}
            busy={busy}
            sessionOnly
            onChange={onHiddenFromDeckChange}
          />
        </div>
        <UiLoader
          visible={busy}
          compact
          className="global-library-detail__loader"
          label="正在应用卡牌变更"
        />
      </>
    );
  }

  if (isNewTabCard(card)) {
    return (
      <>
        <div className="global-library-detail__actions is-paired">
          <DeckVisibilityButton
            hidden={hiddenFromDeck}
            busy={busy}
            onChange={onHiddenFromDeckChange}
          />
          <UiButton disabled={busy} onClick={() => void onOpenNewTabSettings()}>
            <Settings size={15} aria-hidden="true" />
            设置
          </UiButton>
        </div>
        <UiLoader
          visible={busy}
          compact
          className="global-library-detail__loader"
          label="正在应用卡牌变更"
        />
        <UiNotice
          icon={<WandSparkles size={18} aria-hidden="true" />}
          title="浏览器新标签页"
        >
          <p>
            默认打开卡牌大师
            新标签页；也可以在设置中填写一个网址，让新标签页直接前往指定页面。
          </p>
        </UiNotice>
      </>
    );
  }

  const toggleEnabled = (enabled: boolean) => {
    if (isGamepadControlCard(card)) {
      return onToggleGamepadControl(enabled);
    }
    if (isContentBlockingCard(card)) {
      return onToggleContentBlocking(enabled);
    }
    if (isPageThemeCard(card)) {
      return onTogglePageTheme(enabled);
    }
    if (isMediaSpeedCard(card)) {
      return onToggleMediaSpeed(enabled);
    }
    if (isMediaResourcesCard(card)) {
      return onToggleMediaResources(enabled);
    }
    return onToggleBilibiliCapability(card.capabilityId, enabled);
  };
  const managementActions = (
    <>
      <div
        className={`global-library-detail__actions${
          onOpenSettings ? ' is-management' : ' is-paired'
        }`}
      >
        <DeckVisibilityButton
          hidden={hiddenFromDeck}
          busy={busy}
          onChange={onHiddenFromDeckChange}
        />
        <CardEnablementButton
          enabled={cardEnabled(card)}
          busy={busy}
          onChange={toggleEnabled}
        />
        {onOpenSettings && (
          <UiButton disabled={busy} onClick={onOpenSettings}>
            <Settings size={15} aria-hidden="true" />
            设置
          </UiButton>
        )}
      </div>
      <UiLoader
        visible={busy}
        compact
        className="global-library-detail__loader"
        label="正在应用卡牌变更"
      />
    </>
  );

  if (
    (isBilibiliCapabilityCard(card) || isMediaResourcesCard(card)) &&
    !card.snapshot.available
  ) {
    return (
      <UiNotice
        icon={<CircleSlash2 size={18} aria-hidden="true" />}
        title={`${cardUnavailableLabel(card)}此卡牌`}
      >
        <p>
          {card.snapshot.unavailableReason ??
            '当前平台不支持这张卡牌，因此不会显示在牌阵中，也无法启用。'}
        </p>
      </UiNotice>
    );
  }

  if (isGamepadControlCard(card)) {
    return (
      <>
        {managementActions}
        <UiNotice
          icon={<Sparkles size={18} aria-hidden="true" />}
          title="手柄网页控制"
        >
          <p>
            连接手柄后，页面会在牌库入口附近显示实时输入状态，并启用光标、滚动、空间导航、历史导航与屏幕键盘。
          </p>
        </UiNotice>
      </>
    );
  }

  if (isContentBlockingCard(card)) {
    return (
      <>
        {managementActions}
        <div className="global-library-facts">
          <span>
            <b>{card.snapshot.activeRuleCount.toLocaleString()}</b>
            活动规则
          </span>
          <span>
            <b>{card.snapshot.userRuleCount.toLocaleString()}</b>
            用户规则
          </span>
          <span>
            <b>{card.snapshot.subscriptionCount.toLocaleString()}</b>
            第三方订阅
          </span>
        </div>
        {card.snapshot.errors.length > 0 && (
          <UiNotice
            tone="error"
            title="内容拦截诊断"
            copyText={card.snapshot.errors.join('\n')}
          >
            <p>{card.snapshot.errors.join(' ')}</p>
          </UiNotice>
        )}
      </>
    );
  }

  if (isPageThemeCard(card)) {
    return (
      <>
        {managementActions}
        <div className="global-library-facts">
          <span>
            <b>
              {card.snapshot.activeOnPage
                ? '生效'
                : card.snapshot.inactiveReason === 'site-disabled'
                  ? '停用'
                  : card.snapshot.inactiveReason === 'automation'
                    ? '休眠'
                    : card.snapshot.darkThemeDetected
                      ? '避让'
                      : '未生效'}
            </b>
            当前站点
          </span>
          <span>
            <b>{card.snapshot.engine === 'dynamicTheme' ? '动态' : '滤镜'}</b>
            渲染引擎
          </span>
          <span>
            <b>{card.snapshot.darkThemeDetected ? '已发现' : '未发现'}</b>
            原生暗色
          </span>
        </div>
        {card.snapshot.error && (
          <UiNotice
            tone="error"
            title="暗夜降临引擎诊断"
            copyText={card.snapshot.error}
          >
            <p>{card.snapshot.error}</p>
          </UiNotice>
        )}
        <UiNotice
          icon={<WandSparkles size={18} aria-hidden="true" />}
          title="页面光影系统卡牌"
        >
          <p>站点范围、自动切换和完整调校从网页牌阵中的暗夜降临进入。</p>
        </UiNotice>
      </>
    );
  }

  if (isMediaSpeedCard(card)) {
    return (
      <>
        {managementActions}
        <div className="global-library-facts">
          <span>
            <b>{card.snapshot.mediaCount}</b>
            当前媒体
          </span>
          <span>
            <b>
              {card.snapshot.selection.mode === 'hell'
                ? '地狱'
                : `${card.snapshot.selection.speed}×`}
            </b>
            页面档位
          </span>
          <span>
            <b>{card.snapshot.showWheel ? '显示' : '隐藏'}</b>
            速度法印
          </span>
        </div>
        {card.snapshot.error && (
          <UiNotice
            tone="error"
            title="媒体倍速引擎诊断"
            copyText={card.snapshot.error}
          >
            <p>{card.snapshot.error}</p>
          </UiNotice>
        )}
        <UiNotice
          icon={<WandSparkles size={18} aria-hidden="true" />}
          title="页面媒体系统卡牌"
        >
          <p>默认档位、站点范围和速度法印从网页牌阵中的媒体倍速进入。</p>
        </UiNotice>
      </>
    );
  }

  if (isMediaResourcesCard(card)) {
    const manifests = card.snapshot.resources.filter(
      (resource) => resource.kind === 'hls' || resource.kind === 'dash',
    ).length;
    return (
      <>
        {managementActions}
        <div className="global-library-facts">
          <span>
            <b>{card.snapshot.resources.length}</b>
            当前资源
          </span>
          <span>
            <b>{manifests}</b>
            播放清单
          </span>
          <span>
            <b>{card.snapshot.downloadAvailable ? '可用' : '不可用'}</b>
            浏览器下载
          </span>
        </div>
        {card.snapshot.error && (
          <UiNotice
            tone="error"
            title="顺手牵羊诊断"
            copyText={card.snapshot.error}
          >
            <p>{card.snapshot.error}</p>
          </UiNotice>
        )}
        {card.snapshot.limitation && (
          <UiNotice title="当前平台限制">
            <p>{card.snapshot.limitation}</p>
          </UiNotice>
        )}
        <UiNotice
          icon={<WandSparkles size={18} aria-hidden="true" />}
          title="页面媒体资源系统卡牌"
        >
          <p>从网页牌阵发动顺手牵羊，挑选、分析并取得当前页面的媒体资源。</p>
        </UiNotice>
      </>
    );
  }

  if (isBilibiliCapabilityCard(card)) {
    const definition = bilibiliCapabilityDefinition(card.capabilityId);
    const crossPlatform = definition.platforms.length > 1;
    return (
      <>
        {managementActions}
        <div className="global-library-facts">
          {card.snapshot.metrics.map((metric) => (
            <span key={metric.label}>
              <b>{metric.value}</b>
              {metric.label}
            </span>
          ))}
        </div>
        <UiNotice
          icon={<WandSparkles size={18} aria-hidden="true" />}
          title={
            crossPlatform ? '双平台 SponsorBlock 卡牌' : 'B 站增强能力卡牌'
          }
        >
          <p>
            {crossPlatform
              ? '在 B 站调用 BilibiliSponsorBlock，在 YouTube 调用原版 SponsorBlock；分类策略、启停状态与卡牌入口保持统一。'
              : '完整参数与页面动作从 B 站网页牌阵中的对应卡牌进入。'}
          </p>
        </UiNotice>
      </>
    );
  }

  return null;
}

function UserscriptDetail({
  script,
  hiddenFromDeck,
  inspectionMode,
  sourceExpanded,
  busy,
  onHiddenFromDeckChange,
  onInspectionModeChange,
  onSourceExpandedChange,
  onToggle,
  onOpenSettings,
  onRemove,
}: {
  script: InstalledUserscript;
  hiddenFromDeck: boolean;
  inspectionMode: InspectionMode;
  sourceExpanded: boolean;
  busy: boolean;
  onHiddenFromDeckChange: (hidden: boolean) => Promise<void>;
  onInspectionModeChange: (mode: InspectionMode) => void;
  onSourceExpandedChange: (expanded: boolean) => void;
  onToggle: (enabled: boolean) => Promise<void>;
  onOpenSettings: () => void;
  onRemove: () => void;
}) {
  const platformDiagnostics = userscriptPlatformCompatibilityDiagnostics(
    script,
    extensionTarget(),
  );
  const downloadSource = () => {
    SOURCE_EXPORTER.exportSource({
      source: script.source.code,
      suggestedFilename: userscriptExportFilename(
        userscriptDisplayName(script.metadata),
      ),
    });
  };

  return (
    <>
      <div className="global-library-detail__actions is-script-actions">
        <DeckVisibilityButton
          hidden={hiddenFromDeck}
          busy={busy}
          onChange={onHiddenFromDeckChange}
        />
        <CardEnablementButton
          enabled={script.manager.enabled}
          busy={busy}
          onChange={onToggle}
        />
        <UiButton disabled={busy} onClick={onOpenSettings}>
          <Settings size={14} aria-hidden="true" />
          设置
        </UiButton>
        <UiButton variant="danger" disabled={busy} onClick={onRemove}>
          <Trash2 size={14} aria-hidden="true" />
          删除
        </UiButton>
      </div>
      <UiLoader
        visible={busy}
        compact
        className="global-library-detail__loader"
        label="正在应用脚本变更"
      />

      {platformDiagnostics.length > 0 && (
        <UiNotice tone="warning" title="Safari 脚本能力限制">
          {platformDiagnostics.map((diagnostic) => (
            <p key={diagnostic.code}>{diagnostic.message}</p>
          ))}
        </UiNotice>
      )}

      <UiSegmentedControl
        label="脚本检查视图"
        value={inspectionMode}
        options={INSPECTION_MODES}
        onChange={onInspectionModeChange}
      />

      {inspectionMode === 'source' ? (
        <UserscriptSourcePanel
          source={script.source.code}
          expandable
          expanded={sourceExpanded}
          showHeading={false}
          onExpandedChange={onSourceExpandedChange}
          onDownload={downloadSource}
          publicationUrl={userscriptPublicationPageUrl(script)}
        />
      ) : (
        <div className="global-library-metadata-list">
          <MetadataValues label="@match" values={script.metadata.matches} />
          <MetadataValues label="@include" values={script.metadata.includes} />
          <MetadataValues label="@grant" values={script.metadata.grants} />
          <MetadataValues label="@run-at" values={[script.metadata.runAt]} />
          <MetadataValues
            label="来源"
            values={[script.source.origin ?? '本地安装']}
            href={userscriptSourcePageUrl(script)}
          />
        </div>
      )}
    </>
  );
}

export function GlobalLibraryWorkbench({
  repository,
  deckEntry,
  gamepadControl,
  initialContentBlockingSnapshot = startingContentBlockingSnapshot(),
  initialPageThemeSnapshot = startingPageThemeSnapshot(),
  initialMediaSpeedSnapshot = startingMediaSpeedSnapshot(),
  initialMediaResourcesSnapshot = startingMediaResourcesSnapshot(),
  initialBilibiliCapabilitySnapshots = [],
  readContentBlocking,
  subscribeContentBlocking,
  setContentBlockingEnabled,
  readPageTheme,
  subscribePageTheme,
  setPageThemeEnabled,
  readMediaSpeed,
  subscribeMediaSpeed,
  setMediaSpeedEnabled,
  readMediaResources,
  subscribeMediaResources,
  setMediaResourcesEnabled,
  readBilibiliCapabilities,
  subscribeBilibiliCapabilities,
  setBilibiliCapabilityEnabled,
  openNewTabSettings,
  onOpenCardSettings,
  onClose,
}: {
  repository: ScriptRepository;
  deckEntry: DeckEntryController;
  gamepadControl: GamepadControlController;
  initialContentBlockingSnapshot?: ContentBlockingSnapshot;
  initialPageThemeSnapshot?: PageThemeSnapshot;
  initialMediaSpeedSnapshot?: MediaSpeedSnapshot;
  initialMediaResourcesSnapshot?: MediaResourcesSnapshot;
  initialBilibiliCapabilitySnapshots?: readonly BilibiliCapabilitySnapshot[];
  readContentBlocking: () => Promise<ContentBlockingSnapshot>;
  subscribeContentBlocking: (
    listener: (snapshot: ContentBlockingSnapshot) => void,
  ) => () => void;
  setContentBlockingEnabled: (
    enabled: boolean,
  ) => Promise<ContentBlockingSnapshot>;
  readPageTheme: () => Promise<PageThemeSnapshot>;
  subscribePageTheme: (
    listener: (snapshot: PageThemeSnapshot) => void,
  ) => () => void;
  setPageThemeEnabled: (enabled: boolean) => Promise<PageThemeSnapshot>;
  readMediaSpeed: () => Promise<MediaSpeedSnapshot>;
  subscribeMediaSpeed: (
    listener: (snapshot: MediaSpeedSnapshot) => void,
  ) => () => void;
  setMediaSpeedEnabled: (enabled: boolean) => Promise<MediaSpeedSnapshot>;
  readMediaResources: () => Promise<MediaResourcesSnapshot>;
  subscribeMediaResources: (
    listener: (snapshot: MediaResourcesSnapshot) => void,
  ) => () => void;
  setMediaResourcesEnabled: (
    enabled: boolean,
  ) => Promise<MediaResourcesSnapshot>;
  readBilibiliCapabilities: () => Promise<
    readonly BilibiliCapabilitySnapshot[]
  >;
  subscribeBilibiliCapabilities: (
    listener: (snapshots: readonly BilibiliCapabilitySnapshot[]) => void,
  ) => () => void;
  setBilibiliCapabilityEnabled: (
    capabilityId: BilibiliCapabilityId,
    enabled: boolean,
  ) => Promise<readonly BilibiliCapabilitySnapshot[]>;
  openNewTabSettings: () => Promise<void>;
  onOpenCardSettings: (card: GlobalLibraryCard) => void;
  onClose: () => void;
}) {
  const [scripts, setScripts] = useState<InstalledUserscript[]>([]);
  const [contentBlocking, setContentBlocking] = useState(
    initialContentBlockingSnapshot,
  );
  const [pageTheme, setPageTheme] = useState(initialPageThemeSnapshot);
  const [mediaSpeed, setMediaSpeed] = useState(initialMediaSpeedSnapshot);
  const [mediaResources, setMediaResources] = useState(() => ({
    ...initialMediaResourcesSnapshot,
    available:
      initialMediaResourcesSnapshot.available && extensionTarget() !== 'safari',
  }));
  const [gamepadSettings, setGamepadSettings] =
    useState<GamepadControlSettings | null>(null);
  const gamepadConnection = useGamepadConnection();
  const [bilibiliCapabilities, setBilibiliCapabilities] = useState(
    initialBilibiliCapabilitySnapshots,
  );
  const [deckEntrySettings, setDeckEntrySettings] = useState(
    DEFAULT_DECK_ENTRY_SETTINGS,
  );
  const [selectedId, setSelectedId] = useState<string>(GAMEPAD_CONTROL_CARD_ID);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [inspectionMode, setInspectionMode] =
    useState<InspectionMode>('metadata');
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [removeCandidate, setRemoveCandidate] =
    useState<InstalledUserscript | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<HoveredCardInspection | null>(
    null,
  );
  const scriptToggleQueues = useRef(new Map<string, Promise<void>>());
  const pendingScriptStates = useRef(new Map<string, boolean>());
  const mutationTokens = useRef(new Map<string, symbol>());
  const collectionRef = useRef<HTMLElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const resetTransientView = () => {
      setSourceExpanded(false);
      setHoveredCard(null);
    };
    const resetScrollPositions = () => {
      const scrollContainers = [
        collectionRef.current,
        detailRef.current,
        ...Array.from(
          detailRef.current?.querySelectorAll<HTMLElement>(
            '.userscript-source-panel__source',
          ) ?? [],
        ),
      ];
      for (const element of scrollContainers) {
        if (!element) continue;
        element.scrollTop = 0;
        element.scrollLeft = 0;
      }
    };
    document.addEventListener(GLOBAL_LIBRARY_CLOSING_EVENT, resetTransientView);
    document.addEventListener(
      GLOBAL_LIBRARY_CLOSED_EVENT,
      resetScrollPositions,
    );
    return () => {
      document.removeEventListener(
        GLOBAL_LIBRARY_CLOSING_EVENT,
        resetTransientView,
      );
      document.removeEventListener(
        GLOBAL_LIBRARY_CLOSED_EVENT,
        resetScrollPositions,
      );
    };
  }, []);
  const applyScripts = useCallback((next: readonly InstalledUserscript[]) => {
    setScripts(
      next.map((script) => {
        const pending = pendingScriptStates.current.get(script.id);
        return pending === undefined
          ? script
          : {
              ...script,
              manager: { ...script.manager, enabled: pending },
            };
      }),
    );
  }, []);

  useEffect(() => {
    let active = true;
    let receivedDeckEntryChange = false;
    const unsubscribeLibrary = repository.subscribe((next) => {
      if (active) applyScripts(next);
    });
    const unsubscribeContentBlocking = subscribeContentBlocking((snapshot) => {
      if (active) setContentBlocking(snapshot);
    });
    const unsubscribePageTheme = subscribePageTheme((snapshot) => {
      if (active) setPageTheme(snapshot);
    });
    const unsubscribeMediaSpeed = subscribeMediaSpeed((snapshot) => {
      if (active) setMediaSpeed(snapshot);
    });
    const unsubscribeMediaResources = subscribeMediaResources((snapshot) => {
      if (active) setMediaResources(snapshot);
    });
    const unsubscribeGamepad = gamepadControl.subscribe((settings) => {
      if (active) setGamepadSettings(settings);
    });
    const unsubscribeBilibiliCapabilities = subscribeBilibiliCapabilities(
      (snapshots) => {
        if (active) setBilibiliCapabilities(snapshots);
      },
    );
    const unsubscribeDeckEntry = deckEntry.subscribeSettings((settings) => {
      receivedDeckEntryChange = true;
      if (active) setDeckEntrySettings(settings);
    });
    const reportLoadFailure = (failure: unknown) => {
      if (active) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    };
    const consume = <T,>(
      task: Promise<T>,
      apply: (value: T) => void,
    ): Promise<void> =>
      task.then((value) => {
        if (active) apply(value);
      }, reportLoadFailure);
    void consume(repository.list(), applyScripts).finally(() => {
      if (active) setLoading(false);
    });
    void consume(readContentBlocking(), setContentBlocking);
    void consume(readPageTheme(), setPageTheme);
    void consume(readMediaSpeed(), setMediaSpeed);
    void consume(readMediaResources(), setMediaResources);
    void consume(gamepadControl.readSettings(), setGamepadSettings);
    void consume(readBilibiliCapabilities(), setBilibiliCapabilities);
    void consume(deckEntry.readSettings(), (settings) => {
      if (!receivedDeckEntryChange) setDeckEntrySettings(settings);
    });
    return () => {
      active = false;
      unsubscribeLibrary();
      unsubscribeContentBlocking();
      unsubscribePageTheme();
      unsubscribeMediaSpeed();
      unsubscribeMediaResources();
      unsubscribeGamepad();
      unsubscribeBilibiliCapabilities();
      unsubscribeDeckEntry();
    };
  }, [
    applyScripts,
    readContentBlocking,
    readPageTheme,
    readMediaSpeed,
    readMediaResources,
    gamepadControl,
    readBilibiliCapabilities,
    deckEntry,
    repository,
    subscribeContentBlocking,
    subscribePageTheme,
    subscribeMediaSpeed,
    subscribeMediaResources,
    subscribeBilibiliCapabilities,
  ]);

  const cards = useMemo<GlobalLibraryCard[]>(
    () => [
      DECK_STEWARD_CARD,
      ...(systemCardOfferedOnTarget(NEW_TAB_CARD_ID, extensionTarget())
        ? [NEW_TAB_CARD]
        : []),
      gamepadControlCard({
        connected: gamepadConnection.connected,
        deviceName: gamepadConnection.id,
        enabled: gamepadSettings?.enabled ?? false,
      }),
      contentBlockingCard(contentBlocking, null),
      pageThemeCard(pageTheme),
      mediaSpeedCard(mediaSpeed),
      ...(mediaResources.available ? [mediaResourcesCard(mediaResources)] : []),
      ...bilibiliIntegrationCards(bilibiliCapabilities),
      ...scripts,
    ],
    [
      bilibiliCapabilities,
      contentBlocking,
      gamepadConnection,
      gamepadSettings,
      mediaSpeed,
      mediaResources,
      pageTheme,
      scripts,
    ],
  );
  const hiddenCardIdSet = useMemo(
    () => new Set(deckEntrySettings.hiddenCardIds),
    [deckEntrySettings.hiddenCardIds],
  );
  const hiddenCardCount = useMemo(
    () =>
      cards.filter(
        (card) =>
          !cardUnavailableReason(card) &&
          cardHiddenFromDeck(card.id, hiddenCardIdSet),
      ).length,
    [cards, hiddenCardIdSet],
  );
  const visibleCards = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return cards.filter((card) => {
      if (filter === 'enabled' && !cardEnabled(card)) return false;
      if (filter === 'disabled' && cardEnabled(card)) return false;
      if (!normalizedQuery) return true;
      return `${cardTitle(card)} ${cardDescription(card)} ${
        isInstalledUserscript(card)
          ? `${card.metadata.author} ${card.metadata.namespace} ${card.metadata.matches.join(' ')}`
          : ''
      }`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [cards, filter, query]);
  const selected =
    cards.find((card) => card.id === selectedId) ??
    cards[0] ??
    gamepadControlCard();
  const selectedUnavailableReason = cardUnavailableReason(selected);
  const selectedHidden =
    !selectedUnavailableReason &&
    cardHiddenFromDeck(selected.id, hiddenCardIdSet);
  const visibleGroups = useMemo(
    () =>
      [
        {
          id: 'system',
          title: '系统卡牌',
          cards: visibleCards.filter(
            (card) =>
              !isInstalledUserscript(card) && !isBilibiliCapabilityCard(card),
          ),
        },
        {
          id: 'bilibili',
          title: 'B 站和油管能力套件',
          cards: visibleCards.filter(isBilibiliCapabilityCard),
        },
        {
          id: 'userscripts',
          title: '用户脚本',
          cards: visibleCards.filter(isInstalledUserscript),
        },
      ].filter((group) => group.cards.length > 0),
    [visibleCards],
  );

  useEffect(() => {
    if (!cards.some((card) => card.id === selectedId)) {
      setSelectedId(cards[0]?.id ?? GAMEPAD_CONTROL_CARD_ID);
      setInspectionMode('metadata');
      setSourceExpanded(false);
    }
  }, [cards, selectedId]);

  useEffect(() => {
    const clearHoveredCard = () => setHoveredCard(null);
    window.addEventListener('resize', clearHoveredCard);
    return () => window.removeEventListener('resize', clearHoveredCard);
  }, []);

  const runMutation = async (id: string, operation: () => Promise<void>) => {
    const token = Symbol(id);
    mutationTokens.current.set(id, token);
    setBusyIds((current) => new Set(current).add(id));
    setError(null);
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (mutationTokens.current.get(id) === token) {
        mutationTokens.current.delete(id);
        setBusyIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    }
  };

  const setCardHiddenInDeck = (cardId: string, hidden: boolean) => {
    const mutation = {
      kind: 'set-card-hidden',
      cardId,
      hidden,
    } as const;
    setDeckEntrySettings((current) =>
      applyDeckEntrySettingsMutation(current, mutation),
    );
    return runMutation(cardId, async () => {
      try {
        setDeckEntrySettings(await deckEntry.updateSettings(mutation));
      } catch (failure) {
        try {
          setDeckEntrySettings(await deckEntry.readSettings());
        } catch {
          // Preserve the optimistic view until a synchronized update arrives.
        }
        throw failure;
      }
    });
  };

  const toggleScript = (script: InstalledUserscript, enabled: boolean) => {
    pendingScriptStates.current.set(script.id, enabled);
    const optimistic = {
      ...script,
      manager: { ...script.manager, enabled },
    };
    setScripts((current) =>
      current.map((candidate) =>
        candidate.id === script.id ? optimistic : candidate,
      ),
    );
    setError(null);
    const previous =
      scriptToggleQueues.current.get(script.id) ?? Promise.resolve();
    let task: Promise<void>;
    task = previous
      .catch(() => undefined)
      .then(async () => {
        applyScripts(await repository.upsert(optimistic));
        setError(null);
      })
      .catch(async (failure) => {
        setError(failure instanceof Error ? failure.message : String(failure));
        if (scriptToggleQueues.current.get(script.id) !== task) return;
        pendingScriptStates.current.delete(script.id);
        try {
          setScripts(await repository.list());
        } catch {
          setScripts((current) =>
            current.map((candidate) =>
              candidate.id === script.id ? script : candidate,
            ),
          );
        }
      })
      .finally(() => {
        if (scriptToggleQueues.current.get(script.id) !== task) return;
        scriptToggleQueues.current.delete(script.id);
        pendingScriptStates.current.delete(script.id);
      });
    scriptToggleQueues.current.set(script.id, task);
    return task;
  };

  const toggleContentBlocking = (enabled: boolean) => {
    const previous = contentBlocking;
    setContentBlocking({ ...previous, rulesEnabled: enabled });
    return runMutation(CONTENT_BLOCKER_CARD_ID, async () => {
      try {
        setContentBlocking(await setContentBlockingEnabled(enabled));
      } catch (failure) {
        setContentBlocking(previous);
        throw failure;
      }
    });
  };

  const toggleGamepadControl = (enabled: boolean) => {
    const previous = gamepadSettings;
    if (!previous) return Promise.resolve();
    const settings = { ...previous, enabled };
    setGamepadSettings(settings);
    return runMutation(GAMEPAD_CONTROL_CARD_ID, async () => {
      try {
        setGamepadSettings(await gamepadControl.saveSettings(settings));
      } catch (failure) {
        setGamepadSettings(previous);
        throw failure;
      }
    });
  };

  const togglePageTheme = (enabled: boolean) => {
    const previous = pageTheme;
    setPageTheme({ ...previous, enabled });
    return runMutation(PAGE_THEME_CARD_ID, async () => {
      try {
        setPageTheme(await setPageThemeEnabled(enabled));
      } catch (failure) {
        setPageTheme(previous);
        throw failure;
      }
    });
  };

  const toggleMediaSpeed = (enabled: boolean) => {
    const previous = mediaSpeed;
    setMediaSpeed({ ...previous, enabled });
    return runMutation(MEDIA_SPEED_CARD_ID, async () => {
      try {
        setMediaSpeed(await setMediaSpeedEnabled(enabled));
      } catch (failure) {
        setMediaSpeed(previous);
        throw failure;
      }
    });
  };

  const toggleMediaResources = (enabled: boolean) => {
    const previous = mediaResources;
    setMediaResources({ ...previous, enabled });
    return runMutation(MEDIA_RESOURCES_CARD_ID, async () => {
      try {
        setMediaResources(await setMediaResourcesEnabled(enabled));
      } catch (failure) {
        setMediaResources(previous);
        throw failure;
      }
    });
  };

  const toggleBilibiliCapability = (
    capabilityId: BilibiliCapabilityId,
    enabled: boolean,
  ) => {
    const previous = bilibiliCapabilities;
    setBilibiliCapabilities((current) =>
      current.map((snapshot) =>
        snapshot.id === capabilityId ? { ...snapshot, enabled } : snapshot,
      ),
    );
    return runMutation(`system-bilibili-${capabilityId}`, async () => {
      try {
        setBilibiliCapabilities(
          await setBilibiliCapabilityEnabled(capabilityId, enabled),
        );
      } catch (failure) {
        setBilibiliCapabilities(previous);
        throw failure;
      }
    });
  };

  const removeScript = (script: InstalledUserscript) => {
    return runMutation(script.id, async () => {
      const next = await repository.remove(script.id);
      setScripts(next);
      setRemoveDialogOpen(false);
      setHoveredCard(null);
      setSelectedId(GAMEPAD_CONTROL_CARD_ID);
      setInspectionMode('metadata');
      setSourceExpanded(false);
    });
  };

  const closeRemoveDialog = () => {
    if (removeCandidate && busyIds.has(removeCandidate.id)) return;
    setRemoveDialogOpen(false);
  };
  const removingScript =
    removeCandidate !== null && busyIds.has(removeCandidate.id);

  if (loading) {
    return (
      <UiDialog
        ariaLabel="正在打开全局脚本牌库"
        title="全局脚本牌库"
        className="global-library-loading-dialog"
        onClose={onClose}
      >
        <UiLoader large label="正在整理全部卡牌" />
      </UiDialog>
    );
  }

  return (
    <>
      <UiWorkspace
        ariaLabel="全局脚本牌库"
        title="全局脚本牌库"
        description="集中查看系统卡牌与全部已安装用户脚本。"
        className="global-library-frame"
        bodyClassName="global-library-frame__body"
        onClose={onClose}
        actions={
          <div className="global-library-header__stats">
            <span>
              <b>{cards.length}</b>
              全部卡牌
            </span>
            <span>
              <b>{scripts.filter((script) => script.manager.enabled).length}</b>
              已启用脚本
            </span>
            <span>
              <b>{hiddenCardCount}</b>
              已隐藏
            </span>
          </div>
        }
      >
        <div
          className={`global-library-workspace${
            sourceExpanded ? ' is-source-expanded' : ''
          }`}
        >
          <section
            ref={collectionRef}
            className="global-library-collection"
            aria-label="全部卡牌"
            onScroll={() => setHoveredCard(null)}
          >
            <div className="global-library-toolbar">
              <label className="global-library-search">
                <Search size={15} aria-hidden="true" />
                <input
                  value={query}
                  type="search"
                  placeholder="搜索名称、描述、作者或匹配范围"
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
              </label>
              <UiSegmentedControl
                label="牌库筛选"
                value={filter}
                options={FILTERS}
                contextNavigation
                onChange={setFilter}
              />
              <span className="global-library-result-count" aria-live="polite">
                {visibleCards.length} 张
              </span>
            </div>

            {visibleCards.length > 0 ? (
              <div className="global-library-groups">
                {visibleGroups.map((group) => (
                  <section
                    key={group.id}
                    className={`global-library-group is-${group.id}`}
                    aria-label={group.title}
                  >
                    <header>
                      <h3>{group.title}</h3>
                      <span>{group.cards.length} 张</span>
                    </header>
                    <div className="global-library-grid">
                      {group.cards.map((card) => (
                        <GlobalLibraryCard
                          key={card.id}
                          card={card}
                          selected={card.id === selected.id}
                          hidden={
                            !cardUnavailableReason(card) &&
                            cardHiddenFromDeck(card.id, hiddenCardIdSet)
                          }
                          unavailableReason={cardUnavailableReason(card)}
                          onSelect={() => {
                            setSelectedId(card.id);
                            setInspectionMode('metadata');
                            setSourceExpanded(false);
                          }}
                          onInspect={(inspectedCard, element) =>
                            setHoveredCard(
                              hoveredCardInspection(inspectedCard, element),
                            )
                          }
                          onInspectEnd={(cardId) =>
                            setHoveredCard((current) =>
                              current?.card.id === cardId ? null : current,
                            )
                          }
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <UiNotice
                icon={<Archive size={18} aria-hidden="true" />}
                title="没有符合条件的卡牌"
              >
                <p>调整搜索内容或筛选状态后重新查看。</p>
              </UiNotice>
            )}
          </section>

          <aside
            ref={detailRef}
            className="global-library-detail"
            aria-label="卡牌详情"
          >
            <header>
              <div className="global-library-detail__title-row">
                <h2>{cardTitle(selected)}</h2>
                {selectedHidden && (
                  <span className="global-library-detail__visibility-badge">
                    <EyeOff size={14} aria-hidden="true" />
                    {selected.kind === 'steward' ? '暂时隐藏' : '已隐藏'}
                  </span>
                )}
                {selectedUnavailableReason && (
                  <span className="global-library-detail__availability-badge">
                    <CircleSlash2 size={14} aria-hidden="true" />
                    {cardUnavailableLabel(selected)}
                  </span>
                )}
              </div>
              {isInstalledUserscript(selected) && (
                <div className="global-library-detail__byline">
                  <span>{selected.metadata.author || '未署名'}</span>
                  <span>v{selected.metadata.version || '0.0.0'}</span>
                </div>
              )}
              <ExpandableDescription
                key={`${selected.id}:${cardDescription(selected)}`}
                description={cardDescription(selected)}
              />
            </header>

            {error && (
              <UiNotice tone="error" title="牌库操作失败" copyText={error}>
                <p>{error}</p>
              </UiNotice>
            )}

            <div className="global-library-detail__body">
              {isInstalledUserscript(selected) ? (
                <UserscriptDetail
                  key={selected.id}
                  script={selected}
                  hiddenFromDeck={selectedHidden}
                  inspectionMode={inspectionMode}
                  sourceExpanded={sourceExpanded}
                  busy={busyIds.has(selected.id)}
                  onHiddenFromDeckChange={(hidden) =>
                    setCardHiddenInDeck(selected.id, hidden)
                  }
                  onInspectionModeChange={(mode) => {
                    setInspectionMode(mode);
                    if (mode !== 'source') setSourceExpanded(false);
                  }}
                  onSourceExpandedChange={setSourceExpanded}
                  onToggle={(enabled) => toggleScript(selected, enabled)}
                  onOpenSettings={() => onOpenCardSettings(selected)}
                  onRemove={() => {
                    setRemoveCandidate(selected);
                    setRemoveDialogOpen(true);
                  }}
                />
              ) : (
                <SystemCardDetail
                  card={selected}
                  hiddenFromDeck={selectedHidden}
                  busy={busyIds.has(selected.id)}
                  onHiddenFromDeckChange={(hidden) =>
                    setCardHiddenInDeck(selected.id, hidden)
                  }
                  onToggleContentBlocking={toggleContentBlocking}
                  onToggleGamepadControl={toggleGamepadControl}
                  onTogglePageTheme={togglePageTheme}
                  onToggleMediaSpeed={toggleMediaSpeed}
                  onToggleMediaResources={toggleMediaResources}
                  onToggleBilibiliCapability={toggleBilibiliCapability}
                  onOpenNewTabSettings={() =>
                    runMutation(NEW_TAB_CARD_ID, openNewTabSettings)
                  }
                  onOpenSettings={
                    actionsFor(selected).some(
                      (action) => action.kind === 'manage',
                    )
                      ? () => onOpenCardSettings(selected)
                      : null
                  }
                />
              )}
            </div>
          </aside>
        </div>
      </UiWorkspace>
      {hoveredCard && <HoveredCardPlaque inspection={hoveredCard} />}
      {removeCandidate && (
        <UiLayeredCompactDialog
          open={removeDialogOpen}
          closeOnBackdrop
          ariaLabel={`删除 ${userscriptDisplayName(removeCandidate.metadata)}`}
          title={removingScript ? '正在删除脚本' : '确认删除脚本'}
          className="global-library-remove-dialog"
          onClose={closeRemoveDialog}
          onExitComplete={() => setRemoveCandidate(null)}
          footer={
            removingScript ? null : (
              <>
                <UiButton onClick={closeRemoveDialog}>取消</UiButton>
                <UiButton
                  variant="danger"
                  disabled={busyIds.has(removeCandidate.id)}
                  onClick={() => void removeScript(removeCandidate)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  确认删除
                </UiButton>
              </>
            )
          }
        >
          <UiLoader
            visible={removingScript}
            className="global-library-remove-dialog__loader"
            label={`正在删除 ${userscriptDisplayName(removeCandidate.metadata)}`}
          />
          {!removingScript && (
            <div className="global-library-remove-dialog__content">
              <Trash2 size={24} strokeWidth={1.7} aria-hidden="true" />
              <div>
                <strong>
                  {userscriptDisplayName(removeCandidate.metadata)}
                </strong>
                <p>
                  将移除完整源码、管理配置、GM
                  值和安装记录。此操作不会保留兼容副本。
                </p>
              </div>
            </div>
          )}
        </UiLayeredCompactDialog>
      )}
    </>
  );
}
