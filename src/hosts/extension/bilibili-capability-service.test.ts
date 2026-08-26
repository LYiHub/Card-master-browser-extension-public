import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BILIBILI_CAPABILITY_STORAGE_KEY,
  defaultBilibiliCapabilitiesState,
} from '../../bilibili-capabilities/domain/types';
import {
  BilibiliCapabilityService,
  bilibiliVideoIdentity,
  resolveCapabilityPageContext,
} from './bilibili-capability-service';
import { SponsorRuntimeStorageService } from './sponsor-runtime-storage';

afterEach(() => vi.unstubAllGlobals());

function storageArea(seed: Record<string, unknown> = {}) {
  const values = { ...seed };
  return {
    values,
    get: vi.fn(async (key?: string | string[]) => {
      if (typeof key === 'string') return { [key]: values[key] };
      if (Array.isArray(key)) {
        return Object.fromEntries(key.map((entry) => [entry, values[entry]]));
      }
      return { ...values };
    }),
    set: vi.fn(async (next: Record<string, unknown>) => {
      Object.assign(values, next);
    }),
    remove: vi.fn(async (key: string | string[]) => {
      for (const entry of Array.isArray(key) ? key : [key]) {
        delete values[entry];
      }
    }),
  };
}

function serviceHarness(
  tabs: chrome.tabs.Tab[] = [
    {
      id: 9,
      active: true,
      highlighted: true,
      incognito: false,
      pinned: false,
      selected: true,
      discarded: false,
      frozen: false,
      autoDiscardable: true,
      groupId: -1,
      index: 0,
      windowId: 1,
      url: 'https://www.bilibili.com/',
    },
  ],
) {
  const local = storageArea();
  const sync = storageArea();
  const session = storageArea();
  let sessionRules: chrome.declarativeNetRequest.Rule[] = [];
  const updateSessionRules = vi.fn(
    async (update: chrome.declarativeNetRequest.UpdateRuleOptions) => {
      const removed = new Set(update.removeRuleIds ?? []);
      sessionRules = sessionRules.filter((rule) => !removed.has(rule.id));
      sessionRules.push(...(update.addRules ?? []));
    },
  );
  const sendMessage = vi.fn(async (): Promise<unknown> => undefined);
  const sendRuntimeMessage = vi.fn(async () => undefined);
  const api = {
    runtime: {
      sendMessage: sendRuntimeMessage,
    },
    storage: { local, sync, session },
    declarativeNetRequest: {
      getSessionRules: vi.fn(async () => sessionRules),
      updateSessionRules,
    },
    cookies: {
      getAll: vi.fn(
        async () =>
          [
            {
              domain: '.bilibili.com',
              hostOnly: false,
              httpOnly: false,
              name: 'buvid3',
              path: '/',
              sameSite: 'unspecified',
              secure: true,
              session: false,
              storeId: '0',
              value: 'test-fingerprint',
            },
          ] as chrome.cookies.Cookie[],
      ),
      remove: vi.fn(async () => null),
      set: vi.fn(async () => null),
    },
    tabs: {
      onRemoved: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      query: vi.fn(async () => tabs),
      sendMessage,
      reload: vi.fn(async () => undefined),
    },
  };
  const sponsorStorage = new SponsorRuntimeStorageService(api as never);
  return {
    api,
    local,
    sync,
    session,
    sendMessage,
    sendRuntimeMessage,
    updateSessionRules,
    rules: () => sessionRules,
    sponsorStorage,
    service: new BilibiliCapabilityService(api as never, sponsorStorage),
  };
}

describe('B 站能力服务', () => {
  it('首次读取时初始化三项成熟扩展能力并部署纯净推荐规则', async () => {
    const harness = serviceHarness();
    const result = await harness.service.read({
      tabId: 7,
      url: 'https://www.bilibili.com/',
    });

    expect(result.snapshots).toHaveLength(3);
    expect(
      result.snapshots.find(
        (snapshot) => snapshot.id === 'recommendation-control',
      )?.activeOnPage,
    ).toBe(true);
    expect(
      result.snapshots
        .filter((snapshot) => snapshot.id !== 'recommendation-control')
        .every((snapshot) => !snapshot.activeOnPage),
    ).toBe(true);
    expect(harness.rules()).toHaveLength(1);
    expect(harness.rules()[0]?.action.requestHeaders).toEqual([
      expect.objectContaining({ header: 'cookie', operation: 'remove' }),
    ]);
    expect(harness.session.values.GLOBAL_SWITCH).toBe(true);
    expect(
      (
        harness.sync.values['sponsor-runtime.bilibili.sync.v1'] as Record<
          string,
          unknown
        >
      ).disableSkipping,
    ).toBe(false);
  });

  it('读取完整的已存状态时不会重复写回本地存储', async () => {
    const harness = serviceHarness();
    harness.local.values[BILIBILI_CAPABILITY_STORAGE_KEY] =
      defaultBilibiliCapabilitiesState();

    await harness.service.readState();

    expect(harness.local.set).not.toHaveBeenCalled();
  });

  it('切换推荐身份时先提交 DNR 规则，再通知当前 B 站页面刷新推荐', async () => {
    const harness = serviceHarness();
    await harness.service.read({
      tabId: 9,
      url: 'https://www.bilibili.com/',
    });

    const result = await harness.service.execute(
      'recommendation-control',
      'mode:explore',
      { tabId: 9, url: 'https://www.bilibili.com/' },
    );

    expect(
      result.state.capabilities['recommendation-control'].settings.mode,
    ).toBe('explore');
    expect(harness.rules()[0]?.action.requestHeaders).toEqual([
      expect.objectContaining({
        header: 'cookie',
        operation: 'set',
        value: 'buvid3=test-fingerprint',
      }),
    ]);
    expect(harness.sendMessage).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        type: 'bilibili-recommendation-refresh',
        mode: 'explore',
      }),
    );
    expect(harness.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bilibili-capabilities-changed',
      }),
    );
  });

  it('Safari 不部署请求头规则且不会阻断其他后台能力', async () => {
    vi.stubGlobal('__EXTENSION_TARGET__', 'safari');
    const harness = serviceHarness();
    const stored = defaultBilibiliCapabilitiesState();
    stored.capabilities['recommendation-control'].settings.mode = 'mixed';
    harness.local.values[BILIBILI_CAPABILITY_STORAGE_KEY] = stored;

    const result = await harness.service.read({
      tabId: 9,
      url: 'https://www.bilibili.com/',
    });

    expect(
      result.state.capabilities['recommendation-control'].settings.mode,
    ).toBe('native');
    expect(result.state.capabilities['recommendation-control'].enabled).toBe(
      false,
    );
    expect(
      result.snapshots.find(
        (snapshot) => snapshot.id === 'recommendation-control',
      ),
    ).toEqual(
      expect.objectContaining({
        available: false,
        unavailableReason:
          'Safari 不支持修改 B 站推荐请求身份，因此流量探险家不会出现在牌阵中，也无法启用。',
        enabled: false,
        activeOnPage: false,
        stateLabel: 'Safari 暂不支持',
      }),
    );
    expect(harness.rules()).toEqual([]);
    expect(harness.updateSessionRules).not.toHaveBeenCalled();
    await expect(
      harness.service.setEnabled('recommendation-control', true, {
        tabId: 9,
        url: 'https://www.bilibili.com/',
      }),
    ).rejects.toThrow('Safari 暂不支持切换 B 站推荐身份。');
    await expect(
      harness.service.execute('recommendation-control', 'mode:pure', {
        tabId: 9,
        url: 'https://www.bilibili.com/',
      }),
    ).rejects.toThrow('Safari 暂不支持切换 B 站推荐身份。');
  });

  it('pakku 桥接只返回我们的配置，不再让上游后台覆盖工具栏铭牌', async () => {
    const harness = serviceHarness();
    const response = await new Promise<Record<string, unknown>>((resolve) => {
      const handled = harness.service.handlesPakkuMessage(
        { type: 'get_local_config', is_pure_env: false },
        { tab: { id: 12 } } as chrome.runtime.MessageSender,
        (value) => resolve(value as Record<string, unknown>),
      );
      expect(handled).toBe(true);
    });

    expect(response.error).toBeNull();
    expect(response.result).toEqual(
      expect.objectContaining({
        tabid: 12,
        local_config: expect.objectContaining({
          GLOBAL_SWITCH: true,
          THRESHOLD: 30,
          COMBINE_THREADS: 3,
        }),
      }),
    );
  });

  it('使用 SponsorBlock 原生分类枚举保存自动、标记和停用策略', async () => {
    const harness = serviceHarness();
    const initial = await harness.service.read({
      tabId: 9,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    });
    const stored = initial.state.capabilities['segment-skipping'];
    const capability = {
      id: stored.id,
      settings: structuredClone(stored.settings),
    };
    capability.settings.sponsor = 'disabled';
    capability.settings.preview = 'overlay';
    capability.settings.outro = 'auto';

    await harness.service.saveSettings(capability, {
      tabId: 9,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    });

    expect(
      (
        harness.sync.values['sponsor-runtime.bilibili.sync.v1'] as Record<
          string,
          unknown
        >
      ).categorySelections,
    ).toEqual(
      expect.arrayContaining([
        { name: 'sponsor', option: -1 },
        { name: 'preview', option: 0 },
        { name: 'outro', option: 2 },
      ]),
    );
    expect(
      (
        harness.sync.values['sponsor-runtime.youtube.sync.v1'] as Record<
          string,
          unknown
        >
      ).categorySelections,
    ).toEqual(
      expect.arrayContaining([
        { name: 'sponsor', option: -1 },
        { name: 'preview', option: 0 },
        { name: 'outro', option: 2 },
        { name: 'chapter', option: 0 },
      ]),
    );
  });

  it('在 YouTube 视频页启用同一张绯红空降卡牌并路由原版指令', async () => {
    const harness = serviceHarness([
      {
        id: 19,
        url: 'https://www.youtube.com/watch?v=video',
      } as chrome.tabs.Tab,
    ]);
    const context = {
      tabId: 19,
      url: 'https://www.youtube.com/watch?v=video',
    };

    const result = await harness.service.read(context);

    expect(
      result.snapshots.find((snapshot) => snapshot.id === 'segment-skipping'),
    ).toEqual(
      expect.objectContaining({
        activeOnPage: true,
        currentHost: 'www.youtube.com',
        metrics: expect.arrayContaining([
          { label: '当前平台', value: 'SponsorBlock' },
        ]),
      }),
    );
    expect(
      result.snapshots
        .filter((snapshot) => snapshot.id !== 'segment-skipping')
        .every((snapshot) => !snapshot.activeOnPage),
    ).toBe(true);
    expect(
      (
        harness.sync.values['sponsor-runtime.youtube.sync.v1'] as Record<
          string,
          unknown
        >
      ).disableSkipping,
    ).toBe(false);

    await harness.service.execute(
      'segment-skipping',
      'toggle-capture',
      context,
    );

    expect(harness.sendMessage).toHaveBeenCalledWith(19, {
      message: 'sponsorStart',
    });
  });

  it('不会向 YouTube 标签页广播 B 站推荐或弹幕运行时消息', async () => {
    const harness = serviceHarness([
      {
        id: 9,
        url: 'https://www.bilibili.com/video/BV1xx411c7mD',
      } as chrome.tabs.Tab,
      {
        id: 19,
        url: 'https://www.youtube.com/watch?v=video',
      } as chrome.tabs.Tab,
    ]);
    const context = {
      tabId: 9,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    };
    await harness.service.read(context);

    await harness.service.setEnabled('danmaku-compression', false, context);

    expect(harness.sendMessage).toHaveBeenCalledWith(9, {
      type: 'reload_danmu',
      key: 1,
      trigger_player: true,
    });
    expect(harness.sendMessage).not.toHaveBeenCalledWith(
      19,
      expect.objectContaining({ type: 'reload_danmu' }),
    );
  });

  it('拒绝在非视频页面执行 SponsorBlock 片段指令', async () => {
    const harness = serviceHarness();
    const context = {
      tabId: 9,
      url: 'https://www.youtube.com/',
    };
    await harness.service.read(context);

    await expect(
      harness.service.execute('segment-skipping', 'refresh-segments', context),
    ).rejects.toThrow('当前页面没有可操作的 B 站或 YouTube 视频');
  });

  it('保存算法参数时不会覆盖右上角管理的全局启停状态', async () => {
    const harness = serviceHarness();
    const context = {
      tabId: 9,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    };
    await harness.service.read(context);
    await harness.service.setEnabled('danmaku-compression', false, context);
    const state = await harness.service.readState();
    const stored = state.capabilities['danmaku-compression'];

    const result = await harness.service.saveSettings(
      {
        id: stored.id,
        settings: {
          ...stored.settings,
          threshold: 45,
        },
      },
      context,
    );

    expect(result.state.capabilities['danmaku-compression']).toEqual(
      expect.objectContaining({
        enabled: false,
        settings: expect.objectContaining({ threshold: 45 }),
      }),
    );
  });

  it('修改 pakku 启停后清空页面配置缓存并只刷新当前播放器', async () => {
    const harness = serviceHarness();
    await harness.service.read({
      tabId: 9,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    });

    await harness.service.setEnabled('danmaku-compression', false, {
      tabId: 9,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    });

    expect(harness.sendMessage).toHaveBeenCalledWith(9, {
      type: 'reload_danmu',
      key: 1,
      trigger_player: true,
    });
  });

  it('只为当前视频临时恢复原弹幕，切换视频后自动恢复降噪', async () => {
    const harness = serviceHarness();
    harness.sendMessage.mockResolvedValueOnce({
      videoID: 'BV1xx411c7mD+987654321',
    });
    const context = {
      tabId: 9,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    };
    await harness.service.read(context);
    const result = await harness.service.execute(
      'danmaku-compression',
      'restore',
      context,
    );
    expect(
      result.snapshots.find(
        (snapshot) => snapshot.id === 'danmaku-compression',
      ),
    ).toEqual(
      expect.objectContaining({
        activeOnPage: false,
        temporaryMode: 'original-danmaku',
        stateLabel: '本视频原弹幕',
      }),
    );

    const restored = await new Promise<Record<string, unknown>>((resolve) => {
      harness.service.handlesPakkuMessage(
        { type: 'get_local_config', is_pure_env: false },
        { tab: { id: 9, url: context.url } } as chrome.runtime.MessageSender,
        (value) => resolve(value as Record<string, unknown>),
      );
    });
    expect(restored.result).toEqual(
      expect.objectContaining({
        local_config: expect.objectContaining({ GLOBAL_SWITCH: false }),
      }),
    );

    const nextVideo = await new Promise<Record<string, unknown>>((resolve) => {
      harness.service.handlesPakkuMessage(
        { type: 'get_local_config', is_pure_env: false },
        {
          tab: {
            id: 9,
            url: 'https://www.bilibili.com/video/BV1yy411c7mD',
          },
        } as chrome.runtime.MessageSender,
        (value) => resolve(value as Record<string, unknown>),
      );
    });
    expect(nextVideo.result).toEqual(
      expect.objectContaining({
        local_config: expect.objectContaining({ GLOBAL_SWITCH: true }),
      }),
    );
  });

  it('使用视频与分P身份约束临时原弹幕范围', () => {
    expect(
      bilibiliVideoIdentity(
        'https://www.bilibili.com/video/BV1xx411c7mD?p=2&t=15',
      ),
    ).toBe('video:bv1xx411c7md:p:2');
    expect(
      bilibiliVideoIdentity('https://www.bilibili.com/bangumi/play/ep123'),
    ).toBe('bangumi:ep123');
    expect(
      bilibiliVideoIdentity(
        'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
        'BV1xx411c7mD+987654321',
      ),
    ).toBe('video:bv1xx411c7md:cid:987654321');
    expect(bilibiliVideoIdentity('https://www.bilibili.com/')).toBeNull();
  });

  it('同一路由切换 CID 后自动清除当前视频的临时原弹幕旁路', async () => {
    const harness = serviceHarness();
    const context = {
      tabId: 9,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    };
    harness.sendMessage.mockResolvedValueOnce({
      videoID: 'BV1xx411c7mD+111',
    });
    await harness.service.read(context);
    await harness.service.execute('danmaku-compression', 'restore', context);
    harness.sendMessage.mockResolvedValueOnce({
      videoID: 'BV1xx411c7mD+222',
    });

    const result = await harness.service.read(context);

    expect(
      result.snapshots.find(
        (snapshot) => snapshot.id === 'danmaku-compression',
      ),
    ).toEqual(
      expect.objectContaining({
        activeOnPage: true,
        temporaryMode: 'default',
      }),
    );
  });

  it('串行处理同一标签页的并发混合推荐请求', async () => {
    const harness = serviceHarness();
    const context = { tabId: 9, url: 'https://www.bilibili.com/' };
    await harness.service.read(context);
    await harness.service.execute(
      'recommendation-control',
      'mode:mixed',
      context,
    );

    await Promise.all([
      harness.service.execute('recommendation-control', 'mixed-next', context),
      harness.service.execute('recommendation-control', 'mixed-next', context),
    ]);

    expect(
      harness
        .rules()
        .filter((rule) => rule.condition.tabIds?.includes(context.tabId)),
    ).toHaveLength(0);
  });

  it('重置设备指纹时删除 B 站签发 Cookie 并刷新当前标签页', async () => {
    const harness = serviceHarness();
    const context = { tabId: 9, url: 'https://www.bilibili.com/' };
    await harness.service.read(context);

    await harness.service.execute(
      'recommendation-control',
      'reset-fingerprint',
      context,
    );

    expect(harness.api.cookies.remove).toHaveBeenCalledOnce();
    expect(harness.api.tabs.reload).toHaveBeenCalledWith(context.tabId);
  });

  it('在服务层拒绝执行已全局停用能力的运行时指令', async () => {
    const harness = serviceHarness();
    const context = {
      tabId: 9,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    };
    await harness.service.read(context);
    await harness.service.setEnabled('danmaku-compression', false, context);

    await expect(
      harness.service.execute('danmaku-compression', 'reload', context),
    ).rejects.toThrow('请先从卡牌右上角启用');
  });

  it('扩展页面请求使用当前活动标签页作为 B 站能力上下文', async () => {
    const query = vi.fn(async () => [
      {
        id: 31,
        url: 'https://www.bilibili.com/video/BV1xx411c7mD',
      },
    ]);

    await expect(
      resolveCapabilityPageContext({ tabs: { query } } as never, {
        url: 'chrome-extension://example/library.html',
      }),
    ).resolves.toEqual({
      tabId: 31,
      url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    });
  });

  it('内容页读取时优先使用同源的单页导航地址', async () => {
    const query = vi.fn();

    await expect(
      resolveCapabilityPageContext(
        { tabs: { query } } as never,
        {
          tab: {
            id: 31,
            url: 'https://www.youtube.com/',
          } as chrome.tabs.Tab,
        },
        'https://www.youtube.com/watch?v=video-id',
      ),
    ).resolves.toEqual({
      tabId: 31,
      url: 'https://www.youtube.com/watch?v=video-id',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('拒绝跨站覆盖能力上下文', async () => {
    await expect(
      resolveCapabilityPageContext(
        { tabs: { query: vi.fn() } } as never,
        {
          tab: {
            id: 31,
            url: 'https://www.youtube.com/',
          } as chrome.tabs.Tab,
        },
        'https://www.bilibili.com/video/BV1xx411c7mD',
      ),
    ).resolves.toEqual({
      tabId: 31,
      url: 'https://www.youtube.com/',
    });
  });
});
