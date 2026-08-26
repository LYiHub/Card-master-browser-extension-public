import type { PresetCardVariant } from '../lib/userscript-deck-media';
import type {
  BilibiliCapabilityCard,
  BilibiliCapabilityCommand,
  BilibiliCapabilityId,
  BilibiliCapabilitySnapshot,
  SponsorPlatform,
} from './domain/types';
import { capabilityPlatformForPage } from './domain/types';

export type BilibiliCapabilityDefinition = {
  id: BilibiliCapabilityId;
  title: string;
  description: string;
  mediaId: PresetCardVariant;
  platforms: readonly SponsorPlatform[];
  inactiveLabel: string;
  commands: readonly {
    id: BilibiliCapabilityCommand;
    label: string;
    description: string;
  }[];
};

export const BILIBILI_CAPABILITIES: readonly BilibiliCapabilityDefinition[] = [
  {
    id: 'recommendation-control',
    title: '流量探险家',
    description: '保持登录状态，在纯净、探索、混合与原生身份间切换。',
    mediaId: '05-bilibili-recommendation',
    platforms: ['bilibili'],
    inactiveLabel: '仅限首页',
    commands: [
      {
        id: 'mode:pure',
        label: '纯净',
        description: '移除推荐请求中的登录身份，读取公共推荐流',
      },
      {
        id: 'mode:explore',
        label: '探索',
        description: '使用独立匿名指纹刷新推荐，主动离开既有兴趣画像',
      },
      {
        id: 'mode:mixed',
        label: '混合',
        description: '在个性推荐与匿名探索之间交替取样',
      },
      {
        id: 'mode:native',
        label: '原生',
        description: '恢复 B 站原生个性推荐请求',
      },
    ],
  },
  {
    id: 'danmaku-compression',
    title: '合成大弹幕',
    description: '合并相同或相似的重复弹幕，并保留代表文本和出现次数。',
    mediaId: '06-bilibili-danmaku',
    platforms: ['bilibili'],
    inactiveLabel: '等待视频',
    commands: [
      {
        id: 'reload',
        label: '重新处理当前视频',
        description: '使用当前参数重新载入并压缩本视频弹幕',
      },
      {
        id: 'restore',
        label: '暂用原弹幕',
        description: '仅让当前视频暂时使用原始弹幕，切换视频后自动恢复',
      },
    ],
  },
  {
    id: 'segment-skipping',
    title: '绯红空降',
    description: '按社区标注自动跳过当前视频的赞助、片头和片尾。',
    mediaId: '07-bilibili-segments',
    platforms: ['bilibili', 'youtube'],
    inactiveLabel: '等待视频',
    commands: [
      {
        id: 'toggle-capture',
        label: '标记片段',
        description: '在当前 B 站或 YouTube 视频开始、结束片段标记',
      },
      {
        id: 'refresh-segments',
        label: '刷新片段',
        description: '忽略本地缓存并重新读取当前平台的社区片段',
      },
    ],
  },
] as const;

export function bilibiliCapabilityDefinition(id: BilibiliCapabilityId) {
  const definition = BILIBILI_CAPABILITIES.find(
    (candidate) => candidate.id === id,
  );
  if (!definition) throw new Error(`Unknown Bilibili capability: ${id}`);
  return definition;
}

export function bilibiliCapabilityCardId(
  id: BilibiliCapabilityId,
): BilibiliCapabilityCard['id'] {
  return `system-bilibili-${id}`;
}

export function bilibiliCapabilityCards(
  snapshots: readonly BilibiliCapabilitySnapshot[],
): BilibiliCapabilityCard[] {
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  return BILIBILI_CAPABILITIES.flatMap((definition) => {
    const snapshot = byId.get(definition.id);
    return snapshot
      ? [
          {
            kind: 'bilibili-capability' as const,
            id: bilibiliCapabilityCardId(definition.id),
            capabilityId: definition.id,
            title: definition.title,
            description: definition.description,
            snapshot,
          },
        ]
      : [];
  });
}

export function bilibiliCapabilityCardsForPage(
  snapshots: readonly BilibiliCapabilitySnapshot[],
  url: string,
) {
  const platform = capabilityPlatformForPage(url);
  if (!platform) return [];
  return bilibiliCapabilityCards(snapshots).filter(
    (card) =>
      card.snapshot.available &&
      bilibiliCapabilityDefinition(card.capabilityId).platforms.includes(
        platform,
      ),
  );
}
