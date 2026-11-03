import { getLocale } from '../../localization/locale';
import { t } from '../../localization/messages';
export const DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE = [
  '创作一幅原创、明亮、奇趣的手绘幻想风景，带有轻松活泼的酒馆冒险气息。',
  '使用宽阔而有力度的绘画笔触、饱和温暖的色块、丰富的中间调、清楚可感的材质和生动完整的幻想世界。',
  '强调富有表现力的轮廓、适度夸张、魔法氛围、清晰的材质对比和充足但不零碎的想象细节。',
].join(' ');

export const DAILY_REVIEW_PLANNING_RULES = [
  'summary 必须点题：用一两句中文点名当天所有主要浏览主题，让没看图的人也能知道这一天看了什么。禁止只写气氛，禁止只写其中一个主题。',
  'image_prompt 必须把每个主要浏览主题落成画面里能一眼认出的具体道具、人物或场景，并全部放进同一张连贯画面。禁止只用光、雾、根系、色块等意象代替主题。',
  'image_prompt 尽量写长、写具体、写有冲击力，但仍是一张图而不是分栏或拼贴。',
  '不要复刻现有品牌、角色、网站界面、浏览器界面或可读文字；专有名词可以保留原文，不得输出英文句子。',
  '不要重复书写十六比九、无文字、安全区等固定约束。',
] as const;

export const DAILY_REVIEW_WALLPAPER_ID = 'card-master-daily-review-wallpaper';
export const DAILY_REVIEW_WALLPAPER_STATE_STORAGE_KEY =
  'card-master.new-tab.daily-review-wallpaper.v1';
export const DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY =
  'card-master.new-tab.daily-review-wallpaper-history.v1';
export const DAILY_REVIEW_WALLPAPER_SELECTION_STORAGE_KEY =
  'card-master.new-tab.daily-review-wallpaper-selection.v1';
export const DAILY_REVIEW_WALLPAPER_RETENTION_DAY_OPTIONS = [
  3, 7, 14, 30,
] as const;
export type DailyReviewWallpaperRetentionDays =
  (typeof DAILY_REVIEW_WALLPAPER_RETENTION_DAY_OPTIONS)[number];
export const DAILY_REVIEW_WALLPAPER_DEFAULT_RETENTION_DAYS = 7;
export const DAILY_REVIEW_WALLPAPER_MAX_IMAGES = 14;
export const DAILY_REVIEW_WALLPAPER_MAX_IMAGES_PER_SOURCE_DATE = 3;
export const DAILY_REVIEW_WALLPAPER_MAX_IMAGE_BYTES = 100 * 1024 * 1024;

export const DAILY_REVIEW_WALLPAPER_TRIGGERS = [
  'manual',
  'scheduled',
  'startup',
  'configuration',
] as const;

export type DailyReviewWallpaperTrigger =
  (typeof DAILY_REVIEW_WALLPAPER_TRIGGERS)[number];

export const DAILY_REVIEW_WALLPAPER_PHASES = [
  'reading-history',
  'planning',
  'generating-image',
  'saving',
] as const;

export type DailyReviewWallpaperPhase =
  (typeof DAILY_REVIEW_WALLPAPER_PHASES)[number];

export type DailyHistoryPage = {
  id: string;
  title: string;
  url: string;
  visitCount: number;
  firstVisitTime: string;
  lastVisitTime: string;
  transitions: Record<string, number>;
};

export type DailyHistoryTimelineEntry = {
  time: string;
  pageId: string;
  transition: string;
};

export type DailyHistorySource = {
  sourceDate: string;
  pages: DailyHistoryPage[];
  timeline: DailyHistoryTimelineEntry[];
};

export type DailyReviewWallpaperPlan = {
  summary: string;
  image_prompt: string;
};

export const DAILY_REVIEW_SUMMARY_MAX_LENGTH = 1_000;
export const DAILY_REVIEW_IMAGE_PROMPT_MAX_LENGTH = 8_000;

export type DailyReviewWallpaperImageResult = {
  imageId: string;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
  imageModel: string;
};

export type DailyReviewWallpaperGenerationRecord = {
  id: string;
  targetDate: string;
  trigger: DailyReviewWallpaperTrigger;
  status: 'running' | 'ready' | 'failed' | 'blocked' | 'no-history';
  phase?: DailyReviewWallpaperPhase;
  startedAt: number;
  completedAt?: number;
  sourceDate?: string;
  finalPrompt?: string;
  summary?: string;
  model?: string;
  styleFingerprint?: string;
  result?: DailyReviewWallpaperImageResult;
  error?: string;
};

export type DailyReviewWallpaperState =
  | {
      status: 'ready';
      generationId: string;
      targetDate: string;
      sourceDate: string;
      trigger: DailyReviewWallpaperTrigger;
      startedAt: number;
      generatedAt: number;
      imageId: string;
      model: string;
      imageModel: string;
      styleFingerprint: string;
      lastCheckedAt?: number;
      lastCheckTrigger?: DailyReviewWallpaperTrigger;
    }
  | {
      status: 'generating';
      generationId: string;
      targetDate: string;
      sourceDate?: string;
      trigger: DailyReviewWallpaperTrigger;
      phase: DailyReviewWallpaperPhase;
      startedAt: number;
      updatedAt: number;
      styleFingerprint: string;
    }
  | {
      status:
        | 'disabled'
        | 'unsupported'
        | 'waiting-for-configuration'
        | 'no-history'
        | 'failed';
      targetDate: string;
      trigger: DailyReviewWallpaperTrigger;
      generationId?: string;
      sourceDate?: string;
      startedAt?: number;
      updatedAt: number;
      error?: string;
      styleFingerprint?: string;
      lastCheckedAt?: number;
      lastCheckTrigger?: DailyReviewWallpaperTrigger;
    };

export type DailyReviewWallpaperSnapshot = {
  state: DailyReviewWallpaperState | null;
  history: DailyReviewWallpaperGenerationRecord[];
};

export type DailyReviewWallpaperDisplaySelection = {
  status: 'ready' | 'generating';
  imageId: string;
  record: DailyReviewWallpaperGenerationRecord | null;
};

export type DailyReviewWallpaperGalleryItem = {
  generationId: string;
  imageId: string;
  targetDate: string;
  sourceDate: string;
  generatedAt: number;
  finalPrompt: string;
  summary: string;
};

export type DailyReviewWallpaperGallerySelection = {
  selectedGenerationId: string;
  latestGenerationId: string;
};

export type DailyReviewWallpaperResolvedGallerySelection = {
  index: number;
  latestIndex: number;
  state: DailyReviewWallpaperGallerySelection;
};

export type StoredDailyReviewWallpaperImage = {
  imageId: string;
  dataUrl: string;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
  sourceDate: string;
  generatedAt: number;
};

export type DailyReviewWallpaperReadiness = {
  imageServiceConfigured: boolean;
  modelServiceConfigured: boolean;
};

export type DailyReviewWallpaperSettingsController = {
  readSnapshot(): Promise<DailyReviewWallpaperSnapshot>;
  readReadiness(): Promise<DailyReviewWallpaperReadiness>;
  subscribeReadiness(listener: () => void): () => void;
  openAiSettings(): Promise<void>;
  generate(plan?: DailyReviewWallpaperPlan): Promise<{ started: boolean }>;
  readImage(imageId: string): Promise<StoredDailyReviewWallpaperImage | null>;
};

const PLAN_KEYS = ['image_prompt', 'summary'] as const;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function localDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return `${localDateKey(timestamp)} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

export function localDayRange(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateKey);
  if (!match) throw new Error(t('cm_daily_review_wallpaper_error_1'));
  const startDate = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (localDateKey(startDate.getTime()) !== dateKey) {
    throw new Error(t('cm_daily_review_wallpaper_error_2'));
  }
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);
  return { startTime: startDate.getTime(), endTime: endDate.getTime() };
}

export function startOfLocalToday(now: number) {
  const date = new Date(now);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

export function localDateDaysBefore(now: number, days: number) {
  const date = new Date(startOfLocalToday(now));
  date.setDate(date.getDate() - days);
  return date.getTime();
}

export function sanitizeHistoryUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizedTitle(value: string | undefined, url: string) {
  const title = value
    ? [...value]
        .map((character) => {
          const code = character.charCodeAt(0);
          return code <= 0x1f || code === 0x7f ? ' ' : character;
        })
        .join('')
        .trim()
    : '';
  if (title) return title.slice(0, 512);
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function transitionName(
  value: chrome.history.VisitItem['transition'] | undefined,
) {
  return typeof value === 'string' && value ? value : 'link';
}

export function buildDailyHistorySource(
  items: readonly chrome.history.HistoryItem[],
  visitsByUrl: ReadonlyMap<string, readonly chrome.history.VisitItem[]>,
  sourceDate: string,
): DailyHistorySource {
  const range = localDayRange(sourceDate);
  const pagesByUrl = new Map<
    string,
    {
      title: string;
      url: string;
      visits: Array<{ time: number; transition: string }>;
    }
  >();

  for (const item of items) {
    if (!item.url) continue;
    const url = sanitizeHistoryUrl(item.url);
    if (!url) continue;
    const visits = (visitsByUrl.get(item.url) ?? [])
      .flatMap((visit) =>
        typeof visit.visitTime === 'number' &&
        visit.visitTime >= range.startTime &&
        visit.visitTime < range.endTime
          ? [
              {
                time: visit.visitTime,
                transition: transitionName(visit.transition),
              },
            ]
          : [],
      )
      .sort((left, right) => left.time - right.time);
    if (visits.length === 0) continue;
    const current = pagesByUrl.get(url);
    if (current) {
      current.visits.push(...visits);
      current.visits.sort((left, right) => left.time - right.time);
      if (item.title?.trim()) current.title = normalizedTitle(item.title, url);
      continue;
    }
    pagesByUrl.set(url, {
      title: normalizedTitle(item.title, url),
      url,
      visits,
    });
  }

  const pageRecords = [...pagesByUrl.values()].sort(
    (left, right) => (left.visits[0]?.time ?? 0) - (right.visits[0]?.time ?? 0),
  );
  const pageIds = new Map(
    pageRecords.map((page, index) => [page.url, `p${index + 1}`] as const),
  );
  const pages = pageRecords.map<DailyHistoryPage>((page) => {
    const firstVisit = page.visits[0];
    const lastVisit = page.visits.at(-1);
    const id = pageIds.get(page.url);
    if (!firstVisit || !lastVisit || !id) {
      throw new Error(t('cm_daily_review_wallpaper_error_3'));
    }
    const transitions: Record<string, number> = {};
    for (const visit of page.visits) {
      transitions[visit.transition] = (transitions[visit.transition] ?? 0) + 1;
    }
    return {
      id,
      title: page.title,
      url: page.url,
      visitCount: page.visits.length,
      firstVisitTime: localTimestamp(firstVisit.time),
      lastVisitTime: localTimestamp(lastVisit.time),
      transitions,
    };
  });
  const timeline = pageRecords
    .flatMap((page) => {
      const pageId = pageIds.get(page.url);
      return pageId
        ? page.visits.map((visit) => ({
            time: visit.time,
            pageId,
            transition: visit.transition,
          }))
        : [];
    })
    .sort((left, right) => left.time - right.time)
    .map<DailyHistoryTimelineEntry>((visit) => ({
      time: localTimestamp(visit.time),
      pageId: visit.pageId,
      transition: visit.transition,
    }));

  return { sourceDate, pages, timeline };
}

export function buildDailyReviewModelInput(source: DailyHistorySource) {
  return JSON.stringify(
    {
      purpose: t('cm_daily_review_wallpaper_purpose_4'),
      requirements: {
        scene: t('cm_daily_review_wallpaper_scene_5'),
        coverage: t('cm_daily_review_wallpaper_coverage_6'),
        concrete: t('cm_daily_review_wallpaper_concrete_7'),
        composition: t('cm_daily_review_wallpaper_composition_8'),
        forbidden: [
          t('cm_daily_review_wallpaper_text_9'),
          t('cm_daily_review_wallpaper_text_10'),
          t('cm_daily_review_wallpaper_text_11'),
          t('cm_daily_review_wallpaper_text_12'),
          t('cm_daily_review_wallpaper_text_13'),
          t('cm_daily_review_wallpaper_text_14'),
        ],
        language: t('cm_daily_review_wallpaper_language_15', [
          String(getLocale() === 'zh-TW' ? '台灣繁體中文' : '简体中文'),
        ]),
        planning: [...DAILY_REVIEW_PLANNING_RULES],
        output: t('cm_daily_review_wallpaper_output_16'),
      },
      history: source,
    },
    null,
    2,
  );
}

export function parseDailyReviewWallpaperPlan(
  value: string,
): DailyReviewWallpaperPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(t('cm_daily_review_wallpaper_error_17'));
  }
  return normalizeDailyReviewWallpaperPlan(parsed);
}

export function normalizeDailyReviewWallpaperPlan(
  value: unknown,
): DailyReviewWallpaperPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(t('cm_daily_review_wallpaper_error_18'));
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== PLAN_KEYS.length ||
    !PLAN_KEYS.every((key, index) => keys[index] === key)
  ) {
    throw new Error(t('cm_daily_review_wallpaper_error_19'));
  }
  if (typeof record.summary !== 'string' || !record.summary.trim()) {
    throw new Error(t('cm_daily_review_wallpaper_error_20'));
  }
  const summary = record.summary.trim();
  if (summary.length > DAILY_REVIEW_SUMMARY_MAX_LENGTH) {
    throw new Error(t('cm_daily_review_wallpaper_error_21'));
  }
  if (!dailyReviewPromptUsesChinese(summary)) {
    throw new Error(t('cm_daily_review_wallpaper_error_22'));
  }
  if (typeof record.image_prompt !== 'string' || !record.image_prompt.trim()) {
    throw new Error(t('cm_daily_review_wallpaper_error_23'));
  }
  const imagePrompt = record.image_prompt.trim();
  if (imagePrompt.length > DAILY_REVIEW_IMAGE_PROMPT_MAX_LENGTH) {
    throw new Error(t('cm_daily_review_wallpaper_error_24'));
  }
  if (!dailyReviewPromptUsesChinese(imagePrompt)) {
    throw new Error(t('cm_daily_review_wallpaper_error_25'));
  }
  return {
    summary,
    image_prompt: imagePrompt,
  };
}

export function isDailyReviewWallpaperPlan(
  value: unknown,
): value is DailyReviewWallpaperPlan {
  try {
    normalizeDailyReviewWallpaperPlan(value);
    return true;
  } catch {
    return false;
  }
}

export function effectiveDailyReviewStyle(override: string) {
  return override.trim() || DAILY_REVIEW_WALLPAPER_DEFAULT_STYLE;
}

export function dailyReviewPromptUsesChinese(value: string) {
  return (
    /[\u3400-\u9fff]/u.test(value) &&
    !/(?:\b[A-Za-z]{2,}\b[\s,.;:!?-]*){4,}/u.test(value)
  );
}

export function dailyReviewWallpaperRecordUsesChinese(
  record: Pick<DailyReviewWallpaperGenerationRecord, 'finalPrompt' | 'summary'>,
) {
  return Boolean(
    record.finalPrompt &&
      dailyReviewPromptUsesChinese(record.finalPrompt) &&
      record.summary &&
      dailyReviewPromptUsesChinese(record.summary),
  );
}

export function normalizeDailyReviewStyleOverride(value: unknown) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().slice(0, 8_000);
  return normalized && dailyReviewPromptUsesChinese(normalized)
    ? normalized
    : '';
}

export function dailyReviewStyleFingerprint(style: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < style.length; index += 1) {
    hash ^= style.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function dailyReviewWallpaperImageId(generationId: string) {
  return `${DAILY_REVIEW_WALLPAPER_ID}:${generationId}`;
}

export function isDailyReviewWallpaperTrigger(
  value: unknown,
): value is DailyReviewWallpaperTrigger {
  return (
    typeof value === 'string' &&
    (DAILY_REVIEW_WALLPAPER_TRIGGERS as readonly string[]).includes(value)
  );
}

export function isDailyReviewWallpaperPhase(
  value: unknown,
): value is DailyReviewWallpaperPhase {
  return (
    typeof value === 'string' &&
    (DAILY_REVIEW_WALLPAPER_PHASES as readonly string[]).includes(value)
  );
}

export function buildDailyReviewImagePrompt(
  style: string,
  plan: DailyReviewWallpaperPlan,
) {
  return [
    t('cm_daily_review_wallpaper_text_26', [String(plan.image_prompt)]),
    t('cm_daily_review_wallpaper_text_27'),
    style.trim(),
    t('cm_daily_review_wallpaper_text_28'),
    t('cm_daily_review_wallpaper_text_29'),
    t('cm_daily_review_wallpaper_text_30'),
    t('cm_daily_review_wallpaper_text_31'),
    t('cm_daily_review_wallpaper_text_32'),
  ].join(' ');
}

export function resolveDailyReviewWallpaperDisplay(
  state: DailyReviewWallpaperState | null,
  history: readonly DailyReviewWallpaperGenerationRecord[],
): DailyReviewWallpaperDisplaySelection | null {
  if (state?.status === 'ready') {
    return {
      status: 'ready',
      imageId: state.imageId,
      record:
        history.find(
          (entry) =>
            entry.id === state.generationId && entry.status === 'ready',
        ) ?? null,
    };
  }
  if (state?.status !== 'generating') return null;
  const record =
    history.find(
      (entry) =>
        entry.status === 'ready' &&
        Boolean(entry.result?.imageId) &&
        entry.id !== state.generationId,
    ) ?? null;
  return {
    status: 'generating',
    imageId: record?.result?.imageId ?? '',
    record,
  };
}

export function buildDailyReviewWallpaperGallery(
  history: readonly DailyReviewWallpaperGenerationRecord[],
) {
  return history
    .filter(
      (
        record,
      ): record is DailyReviewWallpaperGenerationRecord & {
        result: DailyReviewWallpaperImageResult;
        sourceDate: string;
      } =>
        record.status === 'ready' &&
        Boolean(record.sourceDate) &&
        Boolean(record.result?.imageId),
    )
    .map(
      (record): DailyReviewWallpaperGalleryItem => ({
        generationId: record.id,
        imageId: record.result.imageId,
        targetDate: record.targetDate,
        sourceDate: record.sourceDate,
        generatedAt: record.completedAt ?? record.startedAt,
        finalPrompt: record.finalPrompt ?? '',
        summary: record.summary ?? '',
      }),
    )
    .sort(
      (left, right) =>
        left.sourceDate.localeCompare(right.sourceDate) ||
        left.generatedAt - right.generatedAt,
    );
}

export function normalizeDailyReviewWallpaperGallerySelection(
  value: unknown,
): DailyReviewWallpaperGallerySelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.selectedGenerationId === 'string' &&
    record.selectedGenerationId &&
    typeof record.latestGenerationId === 'string' &&
    record.latestGenerationId
    ? {
        selectedGenerationId: record.selectedGenerationId,
        latestGenerationId: record.latestGenerationId,
      }
    : null;
}

export function resolveDailyReviewWallpaperGallerySelection(
  items: readonly DailyReviewWallpaperGalleryItem[],
  stored: DailyReviewWallpaperGallerySelection | null,
): DailyReviewWallpaperResolvedGallerySelection | null {
  if (items.length === 0) return null;
  let latestIndex = 0;
  for (let index = 1; index < items.length; index += 1) {
    const item = items[index];
    const latest = items[latestIndex];
    if (item && latest && item.generatedAt > latest.generatedAt) {
      latestIndex = index;
    }
  }
  const latest = items[latestIndex];
  if (!latest) return null;
  const storedIndex =
    stored?.latestGenerationId === latest.generationId
      ? items.findIndex(
          (item) => item.generationId === stored.selectedGenerationId,
        )
      : -1;
  const index = storedIndex >= 0 ? storedIndex : latestIndex;
  const selected = items[index];
  if (!selected) return null;
  return {
    index,
    latestIndex,
    state: {
      selectedGenerationId: selected.generationId,
      latestGenerationId: latest.generationId,
    },
  };
}
