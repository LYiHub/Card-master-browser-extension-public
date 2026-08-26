import {
  BILIBILI_CAPABILITIES,
  bilibiliCapabilityCardId,
} from '../../bilibili-capabilities/registry';
import { CONTENT_BLOCKER_CARD_ID } from '../../content-blocking/domain/types';
import { GAMEPAD_CONTROL_CARD_ID } from '../../gamepad-control/domain/types';
import { MEDIA_RESOURCES_CARD_ID } from '../../media-resources/domain/types';
import { MEDIA_SPEED_CARD_ID } from '../../media-speed/domain/types';
import { PAGE_THEME_CARD_ID } from '../../page-theme/domain/types';

export const DECK_STEWARD_CARD_ID = 'system-deck-steward' as const;
export const NEW_TAB_CARD_ID = 'system-new-tab' as const;

export type SystemCardKind =
  | 'steward'
  | 'new-tab'
  | 'gamepad-control'
  | 'content-blocker'
  | 'page-theme'
  | 'media-speed'
  | 'media-resources'
  | 'bilibili-capability';

export type SystemCardDefinition = Readonly<{
  id: string;
  kind: SystemCardKind;
  title: string;
  description: string;
  hideable: boolean;
  order: number;
}>;

const CORE_SYSTEM_CARDS: readonly SystemCardDefinition[] = [
  {
    id: DECK_STEWARD_CARD_ID,
    kind: 'steward',
    title: '了不起的脚本小子',
    description: '查找本站现成脚本，没有合适的就按你的要求生成。',
    hideable: true,
    order: 0,
  },
  {
    id: NEW_TAB_CARD_ID,
    kind: 'new-tab',
    title: '新标签页',
    description: '用AI每日回顾壁纸、电子相框和搜索重做新标签页。',
    hideable: true,
    order: 10,
  },
  {
    id: GAMEPAD_CONTROL_CARD_ID,
    kind: 'gamepad-control',
    title: '科乐美秘技',
    description: '用实体手柄统一操作网页、牌阵、设置和扩展界面。',
    hideable: true,
    order: 20,
  },
  {
    id: CONTENT_BLOCKER_CARD_ID,
    kind: 'content-blocker',
    title: '杀',
    description: '点选网页广告或其他内容，加入本站隐藏规则并生效。',
    hideable: true,
    order: 30,
  },
  {
    id: PAGE_THEME_CARD_ID,
    kind: 'page-theme',
    title: '暗夜降临',
    description: '重算当前网页的背景、文字和控件明暗，随时可以开关。',
    hideable: true,
    order: 40,
  },
  {
    id: MEDIA_SPEED_CARD_ID,
    kind: 'media-speed',
    title: '时光飞龙',
    description: '统一调节当前网页及嵌入框架中视频和音频的速度。',
    hideable: true,
    order: 50,
  },
  {
    id: MEDIA_RESOURCES_CARD_ID,
    kind: 'media-resources',
    title: '顺手牵羊',
    description: '发现当前页面加载的音视频资源，挑选之后直接取得。',
    hideable: true,
    order: 60,
  },
];

const PLATFORM_SYSTEM_CARDS: readonly SystemCardDefinition[] =
  BILIBILI_CAPABILITIES.map((capability, index) => ({
    id: bilibiliCapabilityCardId(capability.id),
    kind: 'bilibili-capability',
    title: capability.title,
    description: capability.description,
    hideable: true,
    order: 100 + index,
  }));

export const SYSTEM_CARD_CATALOG: readonly SystemCardDefinition[] = [
  ...CORE_SYSTEM_CARDS,
  ...PLATFORM_SYSTEM_CARDS,
];

const SYSTEM_CARD_BY_ID = new Map(
  SYSTEM_CARD_CATALOG.map((definition) => [definition.id, definition]),
);

export function systemCardDefinition(cardId: string) {
  const definition = SYSTEM_CARD_BY_ID.get(cardId);
  if (!definition) throw new Error(`Unknown system card: ${cardId}`);
  return definition;
}

export function systemCardCopy(cardId: string) {
  const { title, description } = systemCardDefinition(cardId);
  return { title, description };
}

export function isSystemCardId(cardId: string) {
  return SYSTEM_CARD_BY_ID.has(cardId);
}

const SAFARI_EXCLUDED_SYSTEM_CARD_IDS = new Set<string>([
  MEDIA_RESOURCES_CARD_ID,
  NEW_TAB_CARD_ID,
]);

export function systemCardOfferedOnTarget(
  cardId: string,
  target: 'chromium' | 'firefox' | 'safari',
) {
  return target !== 'safari' || !SAFARI_EXCLUDED_SYSTEM_CARD_IDS.has(cardId);
}
