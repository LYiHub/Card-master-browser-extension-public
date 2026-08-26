import {
  BILIBILI_CAPABILITY_IDS,
  BILIBILI_CAPABILITY_STORAGE_KEY,
  type BilibiliCapabilitiesState,
  type BilibiliCapabilityCommand,
  type BilibiliCapabilityId,
  type BilibiliCapabilitySettings,
  type BilibiliCapabilitySnapshot,
  type BilibiliDanmakuSettings,
  type BilibiliSegmentPolicy,
  bilibiliCapabilityAppliesToPage,
  capabilityHost,
  defaultBilibiliCapabilitiesState,
  isBilibiliPage,
  normalizeBilibiliCapabilitiesState,
  sponsorPlatformForPage,
} from '../../bilibili-capabilities/domain/types';
import type { ExtensionBackgroundApi } from './api';
import { extensionDiagnostics } from './diagnostics';
import { extensionTarget } from './platform';
import { EXTENSION_CHANNEL } from './protocol';
import type { SponsorRuntimeStorageService } from './sponsor-runtime-storage';

export const BILIBILI_RECOMMENDATION_RULE_ID = 8_700_001;
const BILIBILI_MIXED_RULE_BASE = 8_710_000;
const BILIBILI_MIXED_RULE_RANGE = 400_000;
const SAFARI_RECOMMENDATION_UNAVAILABLE_REASON =
  'Safari 不支持修改 B 站推荐请求身份，因此流量探险家不会出现在牌阵中，也无法启用。';

export type BilibiliPageContext = {
  tabId: number;
  url: string;
};

type PakkuRuntimeMessage = {
  type?: string;
  is_pure_env?: boolean;
  url?: string;
};

type PakkuBypassVideo = {
  mediaIdentity: string;
  routeIdentity: string;
};

type SponsorVideoIdentityResponse = {
  videoID?: unknown;
};

const PAKKU_DEFAULT_CONFIG = {
  _LAST_UPDATE_TIME: 0,
  _CONFIG_VER: 5,
  ADVANCED_USER: false,
  FORCELIST: [
    ['^23{2,}$', '23333'],
    ['^6{3,}$', '66666'],
  ],
  FORCELIST_CONTINUE_ON_MATCH: true,
  FORCELIST_APPLY_SINGULAR: false,
  WHITELIST: [],
  PROC_TYPE7: true,
  PROC_TYPE4: true,
  PROC_POOL1: false,
  MODE_ELEVATION: true,
  REPRESENTATIVE_PERCENT: 20,
  TOOLTIP_KEYBINDING: true,
  FLUCTLIGHT: false,
  BREAK_UPDATE: false,
  TAKEOVER_AIJUDGE: false,
  SCROLL_THRESHOLD: 1_200,
  USERSCRIPT: null,
  POPUP_BADGE: 'off',
  READ_PLAYER_BLACKLIST: true,
} as const;

function categoryOption(policy: BilibiliSegmentPolicy) {
  if (policy === 'auto') return 2;
  if (policy === 'manual') return 1;
  if (policy === 'overlay') return 0;
  return -1;
}

export async function resolveCapabilityPageContext(
  api: Pick<ExtensionBackgroundApi, 'tabs'>,
  sender: Pick<chrome.runtime.MessageSender, 'tab' | 'url'>,
  requestedUrl?: string,
): Promise<BilibiliPageContext | null> {
  const senderTabId = sender.tab?.id;
  const senderUrl = sender.tab?.url ?? sender.url;
  if (typeof senderTabId === 'number' && senderUrl) {
    let url = senderUrl;
    if (requestedUrl) {
      try {
        if (new URL(requestedUrl).origin === new URL(senderUrl).origin) {
          url = requestedUrl;
        }
      } catch {
        // Ignore invalid or cross-origin page context overrides.
      }
    }
    return { tabId: senderTabId, url };
  }
  const [activeTab] = await api.tabs.query({
    active: true,
    currentWindow: true,
  });
  return typeof activeTab?.id === 'number' && activeTab.url
    ? { tabId: activeTab.id, url: activeTab.url }
    : null;
}

function recommendationRule(
  id: number,
  fingerprint: string | null,
  tabId?: number,
): chrome.declarativeNetRequest.Rule {
  return {
    id,
    priority: 8,
    action: {
      type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
      requestHeaders: [
        fingerprint
          ? {
              header: 'cookie',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: fingerprint,
            }
          : {
              header: 'cookie',
              operation:
                'remove' as chrome.declarativeNetRequest.HeaderOperation,
            },
      ],
    },
    condition: {
      urlFilter: '||api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd',
      resourceTypes: [
        'xmlhttprequest' as chrome.declarativeNetRequest.ResourceType,
      ],
      ...(typeof tabId === 'number' ? { tabIds: [tabId] } : {}),
    },
  };
}

function mixedRuleId(tabId: number) {
  return BILIBILI_MIXED_RULE_BASE + (tabId % BILIBILI_MIXED_RULE_RANGE);
}

function stateLabel(
  id: BilibiliCapabilityId,
  state: BilibiliCapabilitiesState,
  danmakuBypassed = false,
  recommendationSupported = true,
) {
  if (id === 'recommendation-control' && !recommendationSupported) {
    return 'Safari 暂不支持';
  }
  if (!state.capabilities[id].enabled) return '已停用';
  if (id === 'recommendation-control') {
    return {
      pure: '纯净',
      explore: '探索',
      mixed: '混合',
      native: '原生',
    }[state.capabilities['recommendation-control'].settings.mode];
  }
  if (id === 'danmaku-compression') {
    if (danmakuBypassed) return '本视频原弹幕';
    return `阈值 ${state.capabilities['danmaku-compression'].settings.threshold}`;
  }
  if (id === 'segment-skipping') {
    return state.capabilities['segment-skipping'].settings.sponsor === 'auto'
      ? '自动跳过'
      : '按策略';
  }
  return '已启用';
}

function snapshots(
  state: BilibiliCapabilitiesState,
  url: string,
  danmakuBypassed = false,
  recommendationSupported = true,
): BilibiliCapabilitySnapshot[] {
  const currentHost = capabilityHost(url);
  const danmaku = state.capabilities['danmaku-compression'];
  const segment = state.capabilities['segment-skipping'];
  const sponsorPlatform = sponsorPlatformForPage(url);
  return BILIBILI_CAPABILITY_IDS.map((id) => {
    const capability = state.capabilities[id];
    const available = !(
      id === 'recommendation-control' && !recommendationSupported
    );
    const metrics =
      id === 'recommendation-control'
        ? [
            {
              label: '推荐身份',
              value: stateLabel(
                id,
                state,
                danmakuBypassed,
                recommendationSupported,
              ),
            },
          ]
        : id === 'danmaku-compression'
          ? [
              {
                label: '合并窗口',
                value: `${danmaku.settings.threshold} 秒`,
              },
              {
                label: '工作线程',
                value: String(danmaku.settings.workerCount),
              },
              {
                label: '当前视频',
                value: danmakuBypassed ? '原始弹幕' : '合成大弹幕',
              },
            ]
          : id === 'segment-skipping'
            ? [
                {
                  label: '当前平台',
                  value:
                    sponsorPlatform === 'bilibili'
                      ? 'BilibiliSponsorBlock'
                      : sponsorPlatform === 'youtube'
                        ? 'SponsorBlock'
                        : '等待视频页面',
                },
                {
                  label: '赞助片段',
                  value: stateLabel(id, state),
                },
                {
                  label: '跳过提示',
                  value: segment.settings.showNotice ? '显示' : '隐藏',
                },
              ]
            : [];
    return {
      id,
      revision: state.revision,
      status: 'ready',
      available,
      ...(available
        ? {}
        : { unavailableReason: SAFARI_RECOMMENDATION_UNAVAILABLE_REASON }),
      enabled: capability.enabled,
      activeOnPage:
        bilibiliCapabilityAppliesToPage(id, url) &&
        capability.enabled &&
        available &&
        !(id === 'danmaku-compression' && danmakuBypassed),
      currentHost,
      temporaryMode:
        id === 'danmaku-compression' && danmakuBypassed
          ? 'original-danmaku'
          : 'default',
      stateLabel: stateLabel(
        id,
        state,
        danmakuBypassed,
        recommendationSupported,
      ),
      metrics,
    };
  });
}

function sponsorVideoIdentity(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(BV[\da-z]+|av\d+)\+(\d+)$/i);
  return match ? `video:${match[1].toLowerCase()}:cid:${match[2]}` : null;
}

export function bilibiliVideoIdentity(url: string, reportedVideoId?: unknown) {
  try {
    const parsed = new URL(url);
    if (!isBilibiliPage(parsed.href)) return null;
    const reported = sponsorVideoIdentity(reportedVideoId);
    if (reported) return reported;
    const video = parsed.pathname.match(/^\/video\/(BV[\da-z]+|av\d+)/i);
    if (video) {
      return `video:${video[1].toLowerCase()}:p:${parsed.searchParams.get('p') ?? '1'}`;
    }
    const bangumi = parsed.pathname.match(/^\/bangumi\/play\/((?:ep|ss)\d+)/i);
    return bangumi ? `bangumi:${bangumi[1].toLowerCase()}` : null;
  } catch {
    return null;
  }
}

export class BilibiliCapabilityService {
  private statePromise: Promise<BilibiliCapabilitiesState> | null = null;
  private mutationQueue = Promise.resolve();
  private readonly mixedCounters = new Map<number, number>();
  private readonly mixedQueues = new Map<number, Promise<void>>();
  private readonly pakkuBypassVideos = new Map<number, PakkuBypassVideo>();
  private readonly recommendationSupported = extensionTarget() !== 'safari';

  constructor(
    private readonly api: ExtensionBackgroundApi,
    private readonly sponsorStorage: SponsorRuntimeStorageService,
  ) {
    api.tabs.onRemoved.addListener((tabId) => {
      this.mixedCounters.delete(tabId);
      this.mixedQueues.delete(tabId);
      this.pakkuBypassVideos.delete(tabId);
      void this.updateSessionRules({
        removeRuleIds: [mixedRuleId(tabId)],
      }).catch(() => undefined);
    });
    api.tabs.onUpdated.addListener((tabId, change) => {
      if (!change.url) return;
      const bypassedVideo = this.pakkuBypassVideos.get(tabId);
      if (
        bypassedVideo &&
        bypassedVideo.routeIdentity !== bilibiliVideoIdentity(change.url)
      ) {
        this.pakkuBypassVideos.delete(tabId);
      }
    });
  }

  private danmakuBypassed(
    context: BilibiliPageContext,
    currentMediaIdentity?: string | null,
  ) {
    const routeIdentity = bilibiliVideoIdentity(context.url);
    const bypassedVideo = this.pakkuBypassVideos.get(context.tabId);
    if (
      !routeIdentity ||
      (bypassedVideo &&
        (bypassedVideo.routeIdentity !== routeIdentity ||
          (currentMediaIdentity &&
            bypassedVideo.mediaIdentity !== currentMediaIdentity)))
    ) {
      this.pakkuBypassVideos.delete(context.tabId);
      return false;
    }
    return Boolean(bypassedVideo);
  }

  private async currentVideoIdentity(context: BilibiliPageContext) {
    const routeIdentity = bilibiliVideoIdentity(context.url);
    if (!routeIdentity) return null;
    const response = await this.api.tabs
      .sendMessage(context.tabId, { message: 'getVideoID' })
      .catch(() => undefined);
    return {
      routeIdentity,
      mediaIdentity:
        bilibiliVideoIdentity(
          context.url,
          (response as SponsorVideoIdentityResponse | undefined)?.videoID,
        ) ?? routeIdentity,
    };
  }

  private async requireEnabled(id: BilibiliCapabilityId) {
    const state = await this.readState();
    if (!state.capabilities[id].enabled) {
      throw new Error(`${stateLabel(id, state)}，请先从卡牌右上角启用。`);
    }
    return state;
  }

  private snapshots(
    state: BilibiliCapabilitiesState,
    context: BilibiliPageContext,
    danmakuBypassed = this.danmakuBypassed(context),
  ) {
    return snapshots(
      state,
      context.url,
      danmakuBypassed,
      this.recommendationSupported,
    );
  }

  private constrainForPlatform(state: BilibiliCapabilitiesState) {
    if (this.recommendationSupported) return state;
    const recommendation = state.capabilities['recommendation-control'];
    recommendation.enabled = false;
    recommendation.settings.mode = 'native';
    return state;
  }

  private updateSessionRules(
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
  ) {
    if (
      (update.addRules?.length ?? 0) === 0 &&
      (update.removeRuleIds?.length ?? 0) === 0
    ) {
      return Promise.resolve();
    }
    return this.api.declarativeNetRequest.updateSessionRules(update);
  }

  private async load() {
    const stored = (
      await this.api.storage.local.get(BILIBILI_CAPABILITY_STORAGE_KEY)
    )[BILIBILI_CAPABILITY_STORAGE_KEY];
    const state = this.constrainForPlatform(
      normalizeBilibiliCapabilitiesState(stored),
    );
    if (JSON.stringify(stored) !== JSON.stringify(state)) {
      await this.api.storage.local.set({
        [BILIBILI_CAPABILITY_STORAGE_KEY]: state,
      });
    }
    await this.applyIntegrations(state);
    return state;
  }

  readState() {
    if (!this.statePromise) {
      this.statePromise = this.load().catch((error) => {
        this.statePromise = null;
        throw error;
      });
    }
    return this.statePromise;
  }

  async read(context: BilibiliPageContext) {
    const state = await this.readState();
    const bypassed = this.pakkuBypassVideos.has(context.tabId)
      ? this.danmakuBypassed(
          context,
          (await this.currentVideoIdentity(context))?.mediaIdentity,
        )
      : false;
    return {
      state,
      snapshots: this.snapshots(state, context, bypassed),
    };
  }

  private async recommendationFingerprint() {
    if (!this.api.cookies) {
      throw new Error('当前浏览器未开放 B 站 Cookie 读取能力。');
    }
    const cookies = await this.api.cookies.getAll({ domain: 'bilibili.com' });
    const fingerprint = ['buvid3', 'buvid4'].flatMap((name) => {
      const cookie = cookies.find((candidate) => candidate.name === name);
      return cookie ? [`${name}=${cookie.value}`] : [];
    });
    return fingerprint.length > 0 ? fingerprint.join('; ') : null;
  }

  private async resetRecommendationFingerprint(context: BilibiliPageContext) {
    if (!this.api.cookies) {
      throw new Error('当前浏览器未开放 B 站 Cookie 管理能力。');
    }
    const cookies = await this.api.cookies.getAll({ domain: 'bilibili.com' });
    await Promise.all(
      cookies
        .filter(
          (cookie) => cookie.name === 'buvid3' || cookie.name === 'buvid4',
        )
        .map((cookie) =>
          this.api.cookies?.remove({
            url: `${cookie.secure ? 'https' : 'http'}://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`,
            name: cookie.name,
            storeId: cookie.storeId,
          }),
        ),
    );
    const state = await this.readState();
    await this.applyRecommendation(state);
    await this.api.tabs.reload(context.tabId);
    return { state, snapshots: this.snapshots(state, context) };
  }

  private async writeUpstreamSettings(state: BilibiliCapabilitiesState) {
    const pakku = state.capabilities['danmaku-compression'];
    const sponsor = state.capabilities['segment-skipping'];
    const segmentSettings = sponsor.settings;
    const managedCategorySelections = [
      { name: 'sponsor', option: categoryOption(segmentSettings.sponsor) },
      {
        name: 'selfpromo',
        option: categoryOption(segmentSettings.selfPromotion),
      },
      {
        name: 'interaction',
        option: categoryOption(segmentSettings.interaction),
      },
      { name: 'intro', option: categoryOption(segmentSettings.intro) },
      { name: 'outro', option: categoryOption(segmentSettings.outro) },
      { name: 'preview', option: categoryOption(segmentSettings.preview) },
      { name: 'filler', option: categoryOption(segmentSettings.filler) },
      {
        name: 'music_offtopic',
        option: categoryOption(segmentSettings.musicOfftopic),
      },
    ];
    const commonSponsorSettings = {
      disableSkipping: !sponsor.enabled,
      fullVideoLabelsOnThumbnails: false,
      audioNotificationOnSkip: segmentSettings.audioNotification,
      dontShowNotice: !segmentSettings.showNotice,
      showTimeWithSkips: segmentSettings.showTimeWithSkips,
    };
    await Promise.all([
      this.sponsorStorage.set('bilibili', 'sync', {
        ...commonSponsorSettings,
        skipOnSeekToSegment: segmentSettings.skipOnSeek,
        dynamicAndCommentSponsorBlocker:
          sponsor.enabled && segmentSettings.dynamicSponsorBlock,
        commentSponsorBlock:
          sponsor.enabled && segmentSettings.commentSponsorBlock,
        categorySelections: [
          ...managedCategorySelections,
          { name: 'padding', option: 2 },
          { name: 'poi_highlight', option: 1 },
          { name: 'exclusive_access', option: 0 },
        ],
      }),
      this.sponsorStorage.set('youtube', 'sync', {
        ...commonSponsorSettings,
        categorySelections: [
          ...managedCategorySelections,
          { name: 'poi_highlight', option: 1 },
          { name: 'exclusive_access', option: 0 },
          { name: 'chapter', option: 0 },
        ],
      }),
      this.api.storage.session
        .set({ GLOBAL_SWITCH: pakku.enabled, _INITIALIZED: true })
        .catch(() =>
          this.api.storage.local.set({
            GLOBAL_SWITCH: pakku.enabled,
            _INITIALIZED: true,
          }),
        ),
    ]);
  }

  private async applyRecommendation(state: BilibiliCapabilitiesState) {
    const capability = state.capabilities['recommendation-control'];
    const existing = await this.api.declarativeNetRequest.getSessionRules();
    const managedIds = existing
      .map((rule) => rule.id)
      .filter(
        (id) =>
          id === BILIBILI_RECOMMENDATION_RULE_ID ||
          (id >= BILIBILI_MIXED_RULE_BASE &&
            id < BILIBILI_MIXED_RULE_BASE + BILIBILI_MIXED_RULE_RANGE),
      );
    const mode = capability.enabled ? capability.settings.mode : 'native';
    if (!this.recommendationSupported) {
      await this.updateSessionRules({ removeRuleIds: managedIds });
      return;
    }
    const fingerprint =
      mode === 'explore' || mode === 'mixed'
        ? await this.recommendationFingerprint()
        : null;
    const rule =
      mode === 'pure'
        ? recommendationRule(BILIBILI_RECOMMENDATION_RULE_ID, null)
        : mode === 'explore'
          ? recommendationRule(BILIBILI_RECOMMENDATION_RULE_ID, fingerprint)
          : null;
    await this.updateSessionRules({
      removeRuleIds: managedIds,
      ...(rule ? { addRules: [rule] } : {}),
    });
  }

  private async applyIntegrations(state: BilibiliCapabilitiesState) {
    await this.writeUpstreamSettings(state);
    await this.applyRecommendation(state);
  }

  private mutate(
    mutation: (state: BilibiliCapabilitiesState) => void,
    context: BilibiliPageContext,
    changedCapability: BilibiliCapabilityId,
  ) {
    const operation = this.mutationQueue.then(async () => {
      const current = structuredClone(await this.readState());
      const previous = structuredClone(current);
      mutation(current);
      current.revision += 1;
      try {
        await this.applyIntegrations(current);
        await this.api.storage.local.set({
          [BILIBILI_CAPABILITY_STORAGE_KEY]: current,
        });
      } catch (error) {
        await this.applyIntegrations(previous).catch((rollbackError) => {
          extensionDiagnostics.error(
            'bilibili-capabilities',
            'integration-rollback-failed',
            rollbackError,
            { attemptedRevision: current.revision },
          );
        });
        throw error;
      }
      this.statePromise = Promise.resolve(current);
      await this.broadcast(current, changedCapability, context.tabId);
      return {
        state: current,
        snapshots: this.snapshots(current, context),
      };
    });
    this.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async setEnabled(
    id: BilibiliCapabilityId,
    enabled: boolean,
    context: BilibiliPageContext,
  ) {
    if (
      id === 'recommendation-control' &&
      enabled &&
      !this.recommendationSupported
    ) {
      throw new Error('Safari 暂不支持切换 B 站推荐身份。');
    }
    if (id === 'danmaku-compression') this.pakkuBypassVideos.clear();
    return this.mutate(
      (state) => {
        state.capabilities[id].enabled = enabled;
      },
      context,
      id,
    );
  }

  async saveSettings(
    value: BilibiliCapabilitySettings,
    context: BilibiliPageContext,
  ) {
    if (
      value.id === 'recommendation-control' &&
      !this.recommendationSupported
    ) {
      throw new Error('Safari 暂不支持切换 B 站推荐身份。');
    }
    return this.mutate(
      (state) => {
        state.capabilities[value.id].settings = structuredClone(
          value.settings,
        ) as never;
      },
      context,
      value.id,
    );
  }

  reset() {
    const operation = this.mutationQueue.then(async () => {
      const previous = structuredClone(await this.readState());
      const next = this.constrainForPlatform(
        defaultBilibiliCapabilitiesState(),
      );
      next.revision = previous.revision + 1;
      try {
        await this.applyIntegrations(next);
        await this.api.storage.local.set({
          [BILIBILI_CAPABILITY_STORAGE_KEY]: next,
        });
      } catch (error) {
        await this.applyIntegrations(previous).catch((rollbackError) => {
          extensionDiagnostics.error(
            'bilibili-capabilities',
            'reset-rollback-failed',
            rollbackError,
          );
        });
        throw error;
      }
      this.statePromise = Promise.resolve(next);
      this.mixedCounters.clear();
      this.mixedQueues.clear();
      this.pakkuBypassVideos.clear();
      await this.broadcast(next, 'recommendation-control', -1);
      await this.broadcast(next, 'danmaku-compression', -1);
      await this.broadcast(next, 'segment-skipping', -1);
    });
    this.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private runtimeMessages(
    state: BilibiliCapabilitiesState,
    changedCapability: BilibiliCapabilityId,
    tabId: number,
    sourceTabId: number,
    url: string,
  ) {
    if (!isBilibiliPage(url)) return [];
    if (changedCapability === 'recommendation-control') {
      return [
        {
          channel: EXTENSION_CHANNEL,
          type: 'bilibili-recommendation-refresh',
          mode: state.capabilities['recommendation-control'].settings.mode,
        },
      ];
    }
    if (changedCapability === 'danmaku-compression') {
      const enabledOnTab =
        state.capabilities['danmaku-compression'].enabled &&
        !this.danmakuBypassed({ tabId, url });
      return [
        {
          type: 'reload_danmu',
          key: enabledOnTab ? 2 : 1,
          trigger_player: tabId === sourceTabId,
        },
      ];
    }
    return [];
  }

  private async broadcast(
    state: BilibiliCapabilitiesState,
    changedCapability: BilibiliCapabilityId,
    sourceTabId: number,
  ) {
    const [tabs, activeTabs] = await Promise.all([
      this.api.tabs.query({
        url: [
          '*://*.bilibili.com/*',
          'https://*.youtube.com/*',
          'https://www.youtube-nocookie.com/*',
        ],
      }),
      this.api.tabs.query({ active: true, currentWindow: true }),
    ]);
    await Promise.allSettled(
      tabs.flatMap((tab) => {
        if (typeof tab.id !== 'number') return [];
        const tabId = tab.id;
        const stateEvent = {
          channel: EXTENSION_CHANNEL,
          type: 'bilibili-capabilities-changed',
          state,
          snapshots: this.snapshots(state, {
            tabId,
            url: tab.url ?? '',
          }),
        };
        return [
          (async () => {
            await this.api.tabs.sendMessage(tabId, stateEvent);
            for (const message of this.runtimeMessages(
              state,
              changedCapability,
              tabId,
              sourceTabId,
              tab.url ?? '',
            )) {
              await this.api.tabs.sendMessage(tabId, message);
            }
          })(),
        ];
      }),
    );
    const activeTab = activeTabs[0];
    await this.api.runtime
      .sendMessage({
        channel: EXTENSION_CHANNEL,
        type: 'bilibili-capabilities-changed',
        state,
        snapshots:
          typeof activeTab?.id === 'number'
            ? this.snapshots(state, {
                tabId: activeTab.id,
                url: activeTab.url ?? '',
              })
            : snapshots(state, ''),
      })
      .catch(() => undefined);
  }

  private async setRecommendationMode(
    mode: string,
    context: BilibiliPageContext,
  ) {
    if (
      mode !== 'pure' &&
      mode !== 'explore' &&
      mode !== 'mixed' &&
      mode !== 'native'
    ) {
      throw new Error('流量探险家收到了无效模式。');
    }
    if (!this.recommendationSupported) {
      throw new Error('Safari 暂不支持切换 B 站推荐身份。');
    }
    await this.requireEnabled('recommendation-control');
    return this.mutate(
      (state) => {
        const capability = state.capabilities['recommendation-control'];
        capability.settings.mode = mode;
      },
      context,
      'recommendation-control',
    );
  }

  private async advanceMixedRequest(context: BilibiliPageContext) {
    const previous = this.mixedQueues.get(context.tabId) ?? Promise.resolve();
    let result:
      | {
          state: BilibiliCapabilitiesState;
          snapshots: BilibiliCapabilitySnapshot[];
        }
      | undefined;
    const operation = previous.then(async () => {
      const state = await this.readState();
      if (extensionTarget() === 'safari') {
        result = { state, snapshots: this.snapshots(state, context) };
        return;
      }
      const capability = state.capabilities['recommendation-control'];
      if (!capability.enabled || capability.settings.mode !== 'mixed') {
        result = { state, snapshots: this.snapshots(state, context) };
        return;
      }
      const count = (this.mixedCounters.get(context.tabId) ?? 0) + 1;
      this.mixedCounters.set(context.tabId, count);
      const id = mixedRuleId(context.tabId);
      const fingerprint = await this.recommendationFingerprint();
      await this.updateSessionRules({
        removeRuleIds: [id],
        ...(count % 2 === 1
          ? {
              addRules: [recommendationRule(id, fingerprint, context.tabId)],
            }
          : {}),
      });
      result = { state, snapshots: this.snapshots(state, context) };
    });
    const settled = operation.then(
      () => undefined,
      () => undefined,
    );
    this.mixedQueues.set(context.tabId, settled);
    await operation;
    if (this.mixedQueues.get(context.tabId) === settled) {
      this.mixedQueues.delete(context.tabId);
    }
    if (!result) {
      throw new Error('混合推荐切换未返回状态。');
    }
    return result;
  }

  async execute<Id extends BilibiliCapabilityId>(
    id: Id,
    command: BilibiliCapabilityCommand<Id>,
    context: BilibiliPageContext,
  ) {
    if (id === 'recommendation-control' && command.startsWith('mode:')) {
      return this.setRecommendationMode(command.slice('mode:'.length), context);
    }
    if (id === 'recommendation-control' && command === 'mixed-next') {
      return this.advanceMixedRequest(context);
    }
    if (id === 'recommendation-control' && command === 'reset-fingerprint') {
      return this.resetRecommendationFingerprint(context);
    }
    if (id === 'recommendation-control') {
      throw new Error('流量探险家收到了无效指令。');
    }
    if (id === 'danmaku-compression') {
      await this.requireEnabled(id);
      if (command === 'restore') {
        const identity = await this.currentVideoIdentity(context);
        if (!identity) {
          throw new Error('当前页面没有可临时恢复原弹幕的视频。');
        }
        this.pakkuBypassVideos.set(context.tabId, identity);
      } else if (command === 'reload') {
        this.pakkuBypassVideos.delete(context.tabId);
      } else {
        throw new Error('合成大弹幕收到了无效指令。');
      }
      await this.api.tabs.sendMessage(context.tabId, {
        type: 'reload_danmu',
        key: command === 'restore' ? 1 : 2,
        trigger_player: true,
      });
    } else if (id === 'segment-skipping') {
      await this.requireEnabled(id);
      if (command !== 'toggle-capture' && command !== 'refresh-segments') {
        throw new Error('绯红空降收到了无效指令。');
      }
      if (!sponsorPlatformForPage(context.url)) {
        throw new Error('当前页面没有可操作的 B 站或 YouTube 视频。');
      }
      await this.api.tabs.sendMessage(context.tabId, {
        message:
          command === 'toggle-capture' ? 'sponsorStart' : 'refreshSegments',
      });
    }
    const state = await this.readState();
    return { state, snapshots: this.snapshots(state, context) };
  }

  private pakkuConfig(settings: BilibiliDanmakuSettings, enabled: boolean) {
    return {
      ...PAKKU_DEFAULT_CONFIG,
      THRESHOLD: settings.threshold,
      MAX_DIST: settings.maxDistance,
      MAX_COSINE: settings.maxCosine,
      TRIM_PINYIN: settings.trimPinyin,
      TRIM_ENDING: settings.trimEnding,
      TRIM_SPACE: settings.trimSpace,
      TRIM_WIDTH: settings.trimWidth,
      CROSS_MODE: settings.crossMode,
      DANMU_MARK: settings.mark,
      MARK_THRESHOLD: settings.markThreshold,
      DANMU_SUBSCRIPT: settings.subscript,
      ENLARGE: settings.enlarge,
      SHRINK_THRESHOLD: settings.shrinkThreshold,
      DROP_THRESHOLD: settings.dropThreshold,
      TOOLTIP: settings.tooltip,
      AUTO_DISABLE_DANMU: settings.autoDisableDanmaku,
      AUTO_DANMU_LIST: settings.autoOpenList,
      COMBINE_THREADS: settings.workerCount,
      BLACKLIST: [],
      GLOBAL_SWITCH: enabled,
      SKIP_INJECT: false,
    };
  }

  handlesPakkuMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) {
    if (!message || typeof message !== 'object') return false;
    const request = message as PakkuRuntimeMessage;
    if (
      request.type !== 'get_local_config' &&
      request.type !== 'xhr_proxy' &&
      request.type !== 'update_badge' &&
      request.type !== 'reset_dnr_status'
    ) {
      return false;
    }
    if (
      request.type === 'update_badge' ||
      request.type === 'reset_dnr_status'
    ) {
      sendResponse({ ok: true });
      return true;
    }
    void (async () => {
      if (request.type === 'xhr_proxy') {
        if (typeof request.url !== 'string') {
          throw new Error('pakku 请求缺少 URL。');
        }
        const response = await fetch(request.url);
        return {
          error: null,
          text: await response.text(),
          status: response.status,
        };
      }
      const state = await this.readState();
      const capability = state.capabilities['danmaku-compression'];
      const tabId = sender.tab?.id ?? 0;
      const pageUrl = sender.tab?.url ?? sender.url ?? '';
      const enabled =
        capability.enabled && !this.danmakuBypassed({ tabId, url: pageUrl });
      return {
        error: null,
        result: {
          tabid: tabId,
          local_config: {
            ...this.pakkuConfig(capability.settings, enabled),
            SKIP_INJECT: request.is_pure_env === true,
          },
        },
      };
    })()
      .then(sendResponse)
      .catch((error) => {
        extensionDiagnostics.warn(
          'bilibili-capabilities',
          'pakku-bridge-failed',
          error,
        );
        sendResponse({
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return true;
  }
}
