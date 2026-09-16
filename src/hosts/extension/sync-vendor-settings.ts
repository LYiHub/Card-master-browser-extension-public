import { LUMNO_PORTABLE_KEYS } from '../../new-tab/application/portable-keys';
import type { NewTabPreferencesRepository } from '../../new-tab/application/preferences';
import { type Json, jsonValue, record, SYNC_OWNER_KEY } from '../../sync/model';
import {
  assertUnchanged,
  type SyncPortableAdapter,
} from '../../sync/projection';
import type { ExtensionBackgroundApi, ExtensionStorageArea } from './api';
import { sponsorStorageNamespaceKey } from './sponsor-runtime';
import type { SponsorRuntimeStorageService } from './sponsor-runtime-storage';

const CAT_KEYS =
  `Ext Type Regex TitleName Player ShowWebIco MobileUserAgent m3u8dl m3u8dlArg m3u8dlConfirm playbackRate copyM3U8 copyMPD copyOther autoClearMode catDownload saveAs userAgent downFileName css checkDuplicates downActive downAutoClose downStream aria2Rpc enableAria2Rpc enableAria2RpcReferer aria2RpcDir m3u8AutoDown badgeNumber send2local send2localManual send2localURL send2localMethod send2localBody send2localType popup popupMode invoke invokeText invokeConfirm M3u8Thread M3u8Mp4 M3u8OnlyAudio M3u8SkipDecrypt M3u8StreamSaver M3u8Ffmpeg M3u8AutoClose onlineServiceAddress chromeLimitSize blockUrl blockUrlWhite maxLength sidePanel deepSearch send2MQTT mqttEnable mqttBroker mqttPort mqttPath mqttProtocol mqttUser mqttTopic mqttQos mqttTitleLength mqttDataFormat getHtmlDOM damn iframeFFmpeg contextMenus reverse`.split(
    ' ',
  );
const CAT_LOCAL_KEYS = [
  'previewShowTitle',
  'previewDeleteDuplicateFilenames',
  'M3u8HideDownloadedSegments',
];
// Identity, entitlements, tokens, statistics and the fields owned by the platform card are not vendor preferences.
const SPONSOR_KEYS =
  `actuallySubmitKeybind advanceSkipNotice allowScrollingToEdit autoHideInfoButton autoSkipOnMusicVideos barTypes categoryPillUpdate checkTimeDanmakuSkip closeSkipNoticeKeybind colorPalette commentSponsorReplyBlock danmakuOffsetMatchingRegexPattern darkMode defaultCategory downvoteKeybind dynamicAndCommentSponsorRegexPattern dynamicAndCommentSponsorRegexPatternKeywordNumber dynamicAndCommentSponsorWhitelistedChannels dynamicSpaceSponsorBlocker dynamicSponsorBlock dynamicSponsorBlockerDebug dynamicSponsorSelections dynamicSponsorTypes enableAutoSkipDanmakuSkip enableDanmakuSkip enableMenuDanmakuSkip forceChannelCheck fullVideoLabelsOnThumbnailsMode hideDeleteButtonPlayerControls hideInfoButtonPlayerControls hideSkipButtonPlayerControls hideUploadButtonPlayerControls hideVideoPlayerControls hookUpdate invidiousInstances manualSkipOnFullVideo minDuration nextChapterKeybind nextFrameKeybind noticeVisibilityMode previewKeybind previousChapterKeybind previousFrameKeybind prideTheme renderSegmentsAsChapters scrollToEditTimeUpdate serverAddress showCategoryGuidelines showCategoryWithoutPermission showDonationLink showNewFeaturePopups showNewIcon showPortVideoButton showPreviewYoutubeButton showSegmentFailedToFetchWarning showSegmentNameInChapterBar showShortcutPopover showUpcomingNotice showUpsells showZoomToFillError2 skipKeybind skipNonMusicOnlyOnYoutubeMusic skipNoticeDuration skipNoticeDurationBefore skipRules skipToHighlightKeybind startSponsorKeybind submitKeybind testingServer trackDownvotes trackDownvotesInPrivate trackViewCount trackViewCountInPrivate upvoteKeybind useVirtualTime whitelistedChannels`.split(
    ' ',
  );

function select(
  values: Record<string, unknown>,
  keys: readonly string[],
): Json {
  return jsonValue(
    Object.fromEntries(
      keys
        .filter((key) => values[key] !== undefined)
        .map((key) => [key, values[key]]),
    ),
  );
}

function validateVendor(
  value: Json,
  keys: readonly string[],
): asserts value is Record<string, Json> {
  if (!record(value) || !Object.keys(value).every((key) => keys.includes(key)))
    throw new Error('上游配置包含未知或敏感字段。');
  for (const key of ['Ext', 'Type', 'Regex', 'blockUrl']) {
    if (
      key in value &&
      (!Array.isArray(value[key]) || !value[key].every(record))
    )
      throw new Error('媒体捕捉规则格式无效。');
  }
}

function storagePreferences(
  key: string,
  name: string,
  keys: readonly string[],
  area: () => Promise<ExtensionStorageArea>,
): SyncPortableAdapter {
  const read = async () => select(await (await area()).get([...keys]), keys);
  return {
    key,
    name,
    read,
    validate: (value) => validateVendor(value, keys),
    apply: async (value, expected) => {
      validateVendor(value, keys);
      assertUnchanged(await read(), expected);
      const storage = await area();
      await storage.set(value as Record<string, Json>);
      const removed = keys.filter((field) => !Object.hasOwn(value, field));
      if (removed.length) await storage.remove(removed);
      return true;
    },
  };
}

export function vendorSyncSettings(
  api: ExtensionBackgroundApi,
  newTab: NewTabPreferencesRepository,
  sponsor: SponsorRuntimeStorageService,
) {
  const catKeys = CAT_KEYS.map((key) => `card-master.cat-catch.${key}`);
  const catLocal = CAT_LOCAL_KEYS.map((key) => `card-master.cat-catch.${key}`);
  const topbarKeys = LUMNO_PORTABLE_KEYS.filter((key) =>
    key.includes('bookmark_topbar_'),
  );
  return [
    storagePreferences(
      'new-tab-appearance',
      '新标签页组件外观与快捷方式',
      LUMNO_PORTABLE_KEYS.filter((key) => !topbarKeys.includes(key)),
      () => newTab.runtimeStorage(),
    ),
    storagePreferences(
      'new-tab-topbar',
      '新标签页书签顶部外观',
      topbarKeys,
      async () => api.storage.local,
    ),
    storagePreferences(
      'media-advanced',
      '顺手牵羊高级设置',
      catKeys,
      async () =>
        typeof (await api.storage.local.get(SYNC_OWNER_KEY))[SYNC_OWNER_KEY] ===
        'boolean'
          ? api.storage.local
          : api.storage.sync,
    ),
    storagePreferences(
      'media-preview',
      '顺手牵羊预览偏好',
      catLocal,
      async () => api.storage.local,
    ),
    ...(['bilibili', 'youtube'] as const).map(
      (runtimeId): SyncPortableAdapter => {
        const read = async () =>
          select(
            (await sponsor.request(runtimeId, 'sync', 'get', null)) as Record<
              string,
              unknown
            >,
            SPONSOR_KEYS,
          );
        return {
          key: `sponsor-${runtimeId}`,
          name: `${runtimeId === 'bilibili' ? 'B 站' : 'YouTube'}空降助手高级设置`,
          read,
          validate: (value) => validateVendor(value, SPONSOR_KEYS),
          apply: async (value, expected) => {
            validateVendor(value, SPONSOR_KEYS);
            assertUnchanged(await read(), expected);
            await sponsor.set(
              runtimeId,
              'sync',
              value as Record<string, unknown>,
            );
            await sponsor.request(
              runtimeId,
              'sync',
              'remove',
              SPONSOR_KEYS.filter((key) => !Object.hasOwn(value, key)),
            );
            return true;
          },
        };
      },
    ),
  ];
}

export async function takeVendorStorageOwnership(api: ExtensionBackgroundApi) {
  if (
    typeof (await api.storage.local.get(SYNC_OWNER_KEY))[SYNC_OWNER_KEY] ===
    'boolean'
  )
    return;
  // Relocate existing vendor settings once; this changes the storage provider, not the data format.
  const source = await api.storage.sync.get(null);
  const keys = Object.keys(source).filter(
    (key) =>
      key.startsWith('card-master.cat-catch.') ||
      ['bilibili', 'youtube'].some(
        (id) =>
          key ===
          sponsorStorageNamespaceKey(id as 'bilibili' | 'youtube', 'sync'),
      ),
  );
  const local = await api.storage.local.get(keys);
  await api.storage.local.set(
    Object.fromEntries(keys.map((key) => [key, local[key] ?? source[key]])),
  );
}
