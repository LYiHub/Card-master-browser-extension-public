import { describe, expect, it } from 'vitest';

import {
  BILIBILI_CAPABILITY_IDS,
  type BilibiliCapabilitySnapshot,
  defaultBilibiliCapabilitiesState,
  normalizeBilibiliCapabilitiesState,
} from './domain/types';
import {
  BILIBILI_CAPABILITIES,
  bilibiliCapabilityCards,
  bilibiliCapabilityCardsForPage,
} from './registry';

function readySnapshots(): BilibiliCapabilitySnapshot[] {
  return BILIBILI_CAPABILITY_IDS.map((id) => ({
    id,
    revision: 0,
    status: 'ready',
    available: true,
    enabled: true,
    activeOnPage: true,
    currentHost: 'www.bilibili.com',
    temporaryMode: 'default',
    stateLabel: '已启用',
    metrics: [],
  }));
}

describe('B 站能力注册表', () => {
  it('以稳定顺序生成三张名称明确的独立能力卡', () => {
    const cards = bilibiliCapabilityCards(readySnapshots());

    expect(cards.map((card) => [card.id, card.kind, card.title])).toEqual([
      [
        'system-bilibili-recommendation-control',
        'bilibili-capability',
        '流量探险家',
      ],
      [
        'system-bilibili-danmaku-compression',
        'bilibili-capability',
        '合成大弹幕',
      ],
      ['system-bilibili-segment-skipping', 'bilibili-capability', '绯红空降'],
    ]);
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
  });

  it('注册定义、默认状态与能力 ID 使用同一份完整清单', () => {
    const defaults = defaultBilibiliCapabilitiesState();

    expect(BILIBILI_CAPABILITIES.map((definition) => definition.id)).toEqual(
      BILIBILI_CAPABILITY_IDS,
    );
    expect(Object.keys(defaults.capabilities)).toEqual(BILIBILI_CAPABILITY_IDS);
  });

  it('B 站显示完整套件，YouTube 只显示共享的 SponsorBlock 卡牌', () => {
    const snapshots = readySnapshots();

    expect(
      bilibiliCapabilityCardsForPage(
        snapshots,
        'https://www.bilibili.com/video/BV1xx411c7mD',
      ).map((card) => card.capabilityId),
    ).toEqual([
      'recommendation-control',
      'danmaku-compression',
      'segment-skipping',
    ]);
    expect(
      bilibiliCapabilityCardsForPage(
        snapshots,
        'https://www.youtube.com/watch?v=video-id',
      ).map((card) => card.capabilityId),
    ).toEqual(['segment-skipping']);
    expect(
      bilibiliCapabilityCardsForPage(snapshots, 'https://www.youtube.com/').map(
        (card) => card.capabilityId,
      ),
    ).toEqual(['segment-skipping']);
    expect(
      bilibiliCapabilityCardsForPage(
        snapshots,
        'https://www.youtube-nocookie.com/embed/video-id',
      ).map((card) => card.capabilityId),
    ).toEqual(['segment-skipping']);
    expect(
      bilibiliCapabilityCardsForPage(snapshots, 'https://example.com/'),
    ).toEqual([]);
  });

  it('不把当前平台不可用的能力放入网页牌阵', () => {
    const snapshots = readySnapshots().map((snapshot) =>
      snapshot.id === 'recommendation-control'
        ? {
            ...snapshot,
            available: false,
            unavailableReason: 'Safari 不支持修改 B 站推荐请求身份。',
          }
        : snapshot,
    );

    expect(
      bilibiliCapabilityCardsForPage(
        snapshots,
        'https://www.bilibili.com/',
      ).map((card) => card.capabilityId),
    ).toEqual(['danmaku-compression', 'segment-skipping']);
    expect(bilibiliCapabilityCards(snapshots)).toHaveLength(3);
  });

  it('注册表明确区分 B 站专属能力与双平台 SponsorBlock', () => {
    expect(
      BILIBILI_CAPABILITIES.map(({ id, platforms, inactiveLabel }) => ({
        id,
        platforms,
        inactiveLabel,
      })),
    ).toEqual([
      {
        id: 'recommendation-control',
        platforms: ['bilibili'],
        inactiveLabel: '仅限首页',
      },
      {
        id: 'danmaku-compression',
        platforms: ['bilibili'],
        inactiveLabel: '等待视频',
      },
      {
        id: 'segment-skipping',
        platforms: ['bilibili', 'youtube'],
        inactiveLabel: '等待视频',
      },
    ]);
  });

  it('只接受完整有效的单项设置，损坏项回退到当前默认值', () => {
    const defaults = defaultBilibiliCapabilitiesState();
    const normalized = normalizeBilibiliCapabilitiesState({
      ...defaults,
      revision: 7,
      capabilities: {
        ...defaults.capabilities,
        'danmaku-compression': {
          ...defaults.capabilities['danmaku-compression'],
          settings: {
            ...defaults.capabilities['danmaku-compression'].settings,
            workerCount: 99,
          },
        },
      },
    });

    expect(normalized.revision).toBe(7);
    expect(
      normalized.capabilities['danmaku-compression'].settings.workerCount,
    ).toBe(3);
  });

  it('规范化状态时彻底丢弃已弃用能力', () => {
    const defaults = defaultBilibiliCapabilitiesState();
    const normalized = normalizeBilibiliCapabilitiesState({
      ...defaults,
      capabilities: {
        ...defaults.capabilities,
        'retired-capability': {
          id: 'retired-capability',
          enabled: true,
          settings: {},
        },
      },
    });

    expect(normalized.capabilities).not.toHaveProperty('retired-capability');
  });
});
