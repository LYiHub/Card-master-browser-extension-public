import { describe, expect, it } from 'vitest';
import type { BilibiliCapabilityCard } from '../../bilibili-capabilities/domain/types';
import { startingMediaResourcesSnapshot } from '../../media-resources/domain/types';
import { startingMediaSpeedSnapshot } from '../../media-speed/domain/types';
import { startingPageThemeSnapshot } from '../../page-theme/domain/types';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import { mediaResourcesCard, mediaSpeedCard, pageThemeCard } from './cards';
import { userscriptDeckActionNotice } from './deck-view';
import { cardStatePresentation } from './ManagerCard';

describe('card state presentation', () => {
  it('优先显示旧实例等待刷新，而不是继续显示已唤醒', () => {
    const card = structuredClone(INITIAL_USERSCRIPTS[0]);
    card.runtime = {
      ...card.runtime,
      instanceId: 'old-instance',
      status: 'ready',
      pendingRefresh: true,
    };

    expect(cardStatePresentation(card)).toEqual({
      label: '更新待刷新',
      tone: 'pending',
    });
  });

  it('停用后仍有旧实例时显示停用待刷新', () => {
    const card = structuredClone(INITIAL_USERSCRIPTS[0]);
    card.manager.enabled = false;
    card.runtime = {
      ...card.runtime,
      instanceId: 'old-instance',
      status: 'ready',
      pendingRefresh: true,
    };

    expect(cardStatePresentation(card)).toEqual({
      label: '停用待刷新',
      tone: 'pending',
    });
    expect(userscriptDeckActionNotice(card)?.tone).toBe('inactive');
  });

  it('停用卡牌在中央显示明确的恢复引导', () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    script.manager.enabled = false;
    script.runtime.pendingRefresh = false;

    expect(userscriptDeckActionNotice(script)).toEqual({
      title: '脚本当前已停用',
      description: '拖至右上角的启用区域即可恢复运行。',
      tone: 'inactive',
    });

    const theme = pageThemeCard({
      ...startingPageThemeSnapshot('https://example.com/'),
      status: 'ready',
      enabled: false,
      activeOnPage: false,
      inactiveReason: 'global-disabled',
    });
    expect(userscriptDeckActionNotice(theme)).toEqual({
      title: '暗夜降临已停用',
      description: '拖至右上角的启用区域即可恢复页面光影。',
      tone: 'inactive',
    });
  });

  it('脚本未匹配当前页面时徽标与中央提示表达同一状态', () => {
    const card = structuredClone(INITIAL_USERSCRIPTS[0]);
    card.runtime.status = 'not-matched';

    expect(cardStatePresentation(card)).toEqual({
      label: '本站不生效',
      tone: 'inactive',
    });
    expect(userscriptDeckActionNotice(card)).toEqual({
      title: '脚本在本站未激活',
      description: '当前页面不符合脚本的匹配规则。',
      tone: 'neutral',
    });
  });

  it('只有已连接的就绪实例才显示脚本已正常加载', () => {
    const card = structuredClone(INITIAL_USERSCRIPTS[0]);

    expect(cardStatePresentation(card)).toEqual({
      label: '待刷新',
      tone: 'pending',
    });
    expect(userscriptDeckActionNotice(card)).toEqual({
      title: '刷新页面以启用脚本',
      description: '脚本已成功导入。刷新当前页面后，它会自动开始运行。',
      tone: 'neutral',
    });

    card.runtime.status = 'ready';
    card.runtime.instanceId = 'instance-1';

    expect(cardStatePresentation(card)).toEqual({
      label: '已唤醒',
      tone: 'active',
    });
    expect(userscriptDeckActionNotice(card)?.title).toBe('脚本已正常加载');
  });

  it('没有旧实例的待刷新状态直接引导用户刷新页面', () => {
    const card = structuredClone(INITIAL_USERSCRIPTS[0]);
    card.runtime.pendingRefresh = true;
    card.runtime.instanceId = null;

    expect(cardStatePresentation(card)).toEqual({
      label: '待刷新',
      tone: 'pending',
    });
    expect(userscriptDeckActionNotice(card)).toEqual({
      title: '刷新页面以启用脚本',
      description: '脚本已成功导入。刷新当前页面后，它会自动开始运行。',
      tone: 'neutral',
    });
  });

  it('uses an inactive badge when 暗夜降临 is stopped for the current site', () => {
    const card = pageThemeCard({
      ...startingPageThemeSnapshot('https://example.com/'),
      status: 'ready',
      enabled: true,
      activeOnPage: false,
      inactiveReason: 'site-disabled',
    });

    expect(cardStatePresentation(card)).toEqual({
      label: '本站停用',
      tone: 'inactive',
    });
  });

  it('uses green only when 暗夜降临 is active on the current page', () => {
    const card = pageThemeCard({
      ...startingPageThemeSnapshot('https://example.com/'),
      status: 'ready',
      enabled: true,
      activeOnPage: true,
      inactiveReason: null,
    });

    expect(cardStatePresentation(card)).toEqual({
      label: '本站生效',
      tone: 'active',
    });
  });

  it('distinguishes pending and failed theme startup states', () => {
    const starting = pageThemeCard(
      startingPageThemeSnapshot('https://example.com/'),
    );
    const failed = pageThemeCard({
      ...starting.snapshot,
      status: 'error',
      enabled: true,
      error: '启动失败',
    });

    expect(cardStatePresentation(starting)).toEqual({
      label: '停用',
      tone: 'inactive',
    });
    expect(
      cardStatePresentation(
        pageThemeCard({
          ...starting.snapshot,
          enabled: true,
        }),
      ),
    ).toEqual({
      label: '正在启用',
      tone: 'pending',
    });
    expect(cardStatePresentation(failed)).toEqual({
      label: '引擎异常',
      tone: 'error',
    });
  });

  it('shows the selected page-level media speed without exposing hell numerics', () => {
    const standard = mediaSpeedCard({
      ...startingMediaSpeedSnapshot('https://example.com/'),
      status: 'ready',
      mediaCount: 2,
      videoCount: 1,
      audioCount: 1,
      selection: { mode: 'standard', speed: 2 },
    });
    const hell = mediaSpeedCard({
      ...standard.snapshot,
      selection: { mode: 'hell' },
    });

    expect(cardStatePresentation(standard)).toEqual({
      label: '2×',
      tone: 'active',
    });
    expect(cardStatePresentation(hell)).toEqual({
      label: '地狱',
      tone: 'active',
    });
  });

  it('uses a video waiting state for the shared SponsorBlock card', () => {
    const card: BilibiliCapabilityCard = {
      kind: 'bilibili-capability',
      id: 'system-bilibili-segment-skipping',
      capabilityId: 'segment-skipping',
      title: '绯红空降',
      description: '双平台 SponsorBlock。',
      snapshot: {
        id: 'segment-skipping',
        revision: 1,
        status: 'ready',
        available: true,
        enabled: true,
        activeOnPage: false,
        currentHost: 'www.youtube.com',
        temporaryMode: 'default',
        stateLabel: '按策略',
        metrics: [],
      },
    };

    expect(cardStatePresentation(card)).toEqual({
      label: '等待视频',
      tone: 'inactive',
    });
  });

  it('shows media discovery progress without counting resource details as metadata', () => {
    const waiting = mediaResourcesCard({
      ...startingMediaResourcesSnapshot('https://example.com/'),
      status: 'ready',
      enabled: true,
    });
    const discovered = mediaResourcesCard({
      ...waiting.snapshot,
      activeOnPage: true,
      resources: [
        {
          id: 'media-1',
          tabId: 7,
          url: 'https://cdn.example/video.mp4',
          kind: 'video',
          fileName: 'video.mp4',
          mimeType: 'video/mp4',
          size: null,
          initiator: 'https://example.com',
          frameId: 0,
          discoveredAt: 1,
          requestHeaders: [],
          responseHeaders: [],
        },
      ],
    });

    expect(cardStatePresentation(waiting)).toEqual({
      label: '等待媒体',
      tone: 'pending',
    });
    expect(cardStatePresentation(discovered)).toEqual({
      label: '1 项资源',
      tone: 'active',
    });
  });
});
