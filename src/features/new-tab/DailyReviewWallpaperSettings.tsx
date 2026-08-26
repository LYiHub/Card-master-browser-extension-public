import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Image as ImageIcon,
  LoaderCircle,
  Play,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DAILY_REVIEW_IMAGE_PROMPT_MAX_LENGTH,
  DAILY_REVIEW_SUMMARY_MAX_LENGTH,
  DAILY_REVIEW_WALLPAPER_PHASES,
  type DailyReviewWallpaperGenerationRecord,
  type DailyReviewWallpaperPhase,
  type DailyReviewWallpaperPlan,
  type DailyReviewWallpaperRetentionDays,
  type DailyReviewWallpaperSettingsController,
  type DailyReviewWallpaperSnapshot,
  type DailyReviewWallpaperState,
  type DailyReviewWallpaperTrigger,
  dailyReviewPromptUsesChinese,
  localDateKey,
  normalizeDailyReviewWallpaperPlan,
  type StoredDailyReviewWallpaperImage,
} from '../../new-tab/application/daily-review-wallpaper';

const PHASE_LABELS: Record<DailyReviewWallpaperPhase, string> = {
  'reading-history': '读取历史',
  planning: '整理画面',
  'generating-image': '生成图片',
  saving: '保存结果',
};

const PHASE_DESCRIPTIONS: Record<DailyReviewWallpaperPhase, string> = {
  'reading-history': '汇总最近一个完整浏览日',
  planning: '提炼主题并形成视觉方案',
  'generating-image': '调用图像模型生成壁纸',
  saving: '写入本地并应用到新标签页',
};

const TRIGGER_LABELS: Record<DailyReviewWallpaperTrigger, string> = {
  manual: '手动触发',
  scheduled: '定时触发',
  startup: '启动触发',
  configuration: '配置触发',
};

const STATUS_LABELS: Record<
  DailyReviewWallpaperGenerationRecord['status'],
  string
> = {
  running: '进行中',
  ready: '已完成',
  failed: '失败',
  blocked: '未发起',
  'no-history': '无可用历史',
};

const HISTORY_PAGE_SIZE = 10;

function stateLabel(state: DailyReviewWallpaperState | null) {
  if (!state) return '尚未运行';
  switch (state.status) {
    case 'generating':
      return PHASE_LABELS[state.phase];
    case 'ready':
      return '生成完成';
    case 'disabled':
      return '每日回顾未启用';
    case 'unsupported':
      return '当前浏览器不可用';
    case 'waiting-for-configuration':
      return '等待服务配置';
    case 'no-history':
      return '没有可用历史';
    case 'failed':
      return '生成失败';
  }
}

function dateTime(timestamp: number | undefined) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(timestamp);
}

function time(timestamp: number | undefined) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function stateUpdatedAt(state: DailyReviewWallpaperState) {
  return state.status === 'ready' ? state.generatedAt : state.updatedAt;
}

function byteSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function groupedHistory(
  history: readonly DailyReviewWallpaperGenerationRecord[],
) {
  const groups = new Map<string, DailyReviewWallpaperGenerationRecord[]>();
  for (const record of history) {
    const entries = groups.get(record.targetDate) ?? [];
    entries.push(record);
    groups.set(record.targetDate, entries);
  }
  return [...groups.entries()];
}

export function dailyReviewGenerationButtonLabel(
  generatedToday: boolean,
  busy: boolean,
) {
  if (busy) return generatedToday ? '正在重新生成' : '正在生成';
  return generatedToday ? '重新生成' : '立即生成';
}

function phaseState(
  phase: DailyReviewWallpaperPhase,
  state: DailyReviewWallpaperState | null,
  record: DailyReviewWallpaperGenerationRecord | null,
) {
  if (state?.status === 'ready') return 'complete';
  const currentPhase =
    state?.status === 'generating' ? state.phase : record?.phase;
  if (!currentPhase) return 'waiting';
  const activeIndex = DAILY_REVIEW_WALLPAPER_PHASES.indexOf(currentPhase);
  const phaseIndex = DAILY_REVIEW_WALLPAPER_PHASES.indexOf(phase);
  if (phaseIndex < activeIndex) return 'complete';
  if (phaseIndex === activeIndex) {
    return state?.status === 'generating' ? 'active' : 'failed';
  }
  return 'waiting';
}

function timelineSummary(
  state: DailyReviewWallpaperState | null,
  record: DailyReviewWallpaperGenerationRecord | null,
) {
  if (!state) return '等待首次生成';
  if (state.status === 'ready') return '全部流程已完成';
  if (state.status === 'generating') {
    return PHASE_DESCRIPTIONS[state.phase];
  }
  if (state.status === 'failed' && record?.phase) {
    return `${PHASE_LABELS[record.phase]}阶段未完成`;
  }
  if (state.status === 'no-history') return '未找到可用于回顾的浏览历史';
  if (state.status === 'waiting-for-configuration') return '等待服务配置后开始';
  if (state.status === 'unsupported') return '当前平台无法读取完整历史';
  if (state.status === 'disabled') return '自动生成已关闭';
  return '等待生成';
}

export function dailyReviewAutomaticGenerationPending(
  active: boolean,
  state: DailyReviewWallpaperState | null,
) {
  return (
    active &&
    (!state ||
      state.status === 'disabled' ||
      state.status === 'waiting-for-configuration')
  );
}

export function DailyReviewWallpaperSettings({
  controller,
  active,
  historyPlanningAvailable,
  onNotice,
  retentionDays,
}: {
  controller: DailyReviewWallpaperSettingsController;
  active: boolean;
  historyPlanningAvailable: boolean;
  onNotice(message: string): void;
  retentionDays: DailyReviewWallpaperRetentionDays;
}) {
  const [snapshot, setSnapshot] = useState<DailyReviewWallpaperSnapshot | null>(
    null,
  );
  const [readError, setReadError] = useState('');
  const [manualRequestStartedAt, setManualRequestStartedAt] = useState<
    number | null
  >(null);
  const [manualRequestKind, setManualRequestKind] = useState<
    'history' | 'custom' | null
  >(null);
  const [customExpanded, setCustomExpanded] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [imagePromptDraft, setImagePromptDraft] = useState('');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [visibleHistoryCount, setVisibleHistoryCount] =
    useState(HISTORY_PAGE_SIZE);
  const [expandedRecordId, setExpandedRecordId] = useState('');
  const [selectedImageId, setSelectedImageId] = useState('');
  const [selectedImage, setSelectedImage] =
    useState<StoredDailyReviewWallpaperImage | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');
  const manualPending = manualRequestStartedAt !== null;
  const automaticPending =
    historyPlanningAvailable &&
    dailyReviewAutomaticGenerationPending(active, snapshot?.state ?? null);
  const requestPending = manualPending || automaticPending;
  const normalizedSummary = summaryDraft.trim();
  const normalizedImagePrompt = imagePromptDraft.trim();
  const summaryValid = Boolean(
    normalizedSummary && dailyReviewPromptUsesChinese(normalizedSummary),
  );
  const imagePromptValid = Boolean(
    normalizedImagePrompt &&
      dailyReviewPromptUsesChinese(normalizedImagePrompt),
  );
  const customPlanReady = summaryValid && imagePromptValid;

  const refresh = useCallback(async () => {
    try {
      const next = await controller.readSnapshot();
      setSnapshot(next);
      setReadError('');
      setManualRequestStartedAt((requestedAt) => {
        if (requestedAt === null || !next.state) return requestedAt;
        if (next.state.status === 'generating') return null;
        return stateUpdatedAt(next.state) >= requestedAt ? null : requestedAt;
      });
      return next;
    } catch (error) {
      setReadError(
        error instanceof Error ? error.message : '每日回顾状态读取失败。',
      );
      return null;
    }
  }, [controller]);

  useEffect(() => {
    let active = true;
    let timeout = 0;
    const poll = async () => {
      const next = await refresh();
      if (!active) return;
      timeout = window.setTimeout(
        () => void poll(),
        next?.state?.status === 'generating' || requestPending ? 1_200 : 6_000,
      );
    };
    void poll();
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [refresh, requestPending]);

  const visibleHistory = useMemo(
    () => (snapshot?.history ?? []).slice(0, visibleHistoryCount),
    [snapshot?.history, visibleHistoryCount],
  );
  const historyGroups = useMemo(
    () => groupedHistory(visibleHistory),
    [visibleHistory],
  );
  const hiddenHistoryCount = Math.max(
    0,
    (snapshot?.history.length ?? 0) - visibleHistory.length,
  );
  const timelineRecord = useMemo(() => {
    const generationId =
      snapshot?.state && 'generationId' in snapshot.state
        ? snapshot.state.generationId
        : undefined;
    if (!generationId) return null;
    return (
      snapshot?.history.find((record) => record.id === generationId) ?? null
    );
  }, [snapshot?.history, snapshot?.state]);
  const timelineStates = requestPending
    ? DAILY_REVIEW_WALLPAPER_PHASES.map((_, index) =>
        manualRequestKind === 'custom'
          ? index < 2
            ? 'complete'
            : index === 2
              ? 'active'
              : 'waiting'
          : index === 0
            ? 'active'
            : 'waiting',
      )
    : DAILY_REVIEW_WALLPAPER_PHASES.map((phase) =>
        phaseState(phase, snapshot?.state ?? null, timelineRecord),
      );
  const timelineFocusIndex = timelineStates.findIndex(
    (status) => status === 'active' || status === 'failed',
  );
  const timelineCompleted = timelineStates.filter(
    (status) => status === 'complete',
  ).length;
  const timelineStep = requestPending
    ? manualRequestKind === 'custom'
      ? 3
      : 1
    : snapshot?.state?.status === 'ready'
      ? DAILY_REVIEW_WALLPAPER_PHASES.length
      : timelineFocusIndex >= 0
        ? timelineFocusIndex + 1
        : timelineCompleted;
  const running = snapshot?.state?.status === 'generating';
  const generatedToday =
    snapshot?.history.some(
      (record) =>
        record.targetDate === localDateKey(Date.now()) &&
        record.status === 'ready',
    ) ?? false;
  const generationBusy = running || requestPending;
  const generationButtonLabel = dailyReviewGenerationButtonLabel(
    generatedToday,
    generationBusy,
  );

  const generate = async () => {
    if (!historyPlanningAvailable) {
      onNotice('根据历史生成需要历史记录权限和规划模型服务。');
      return;
    }
    setManualRequestStartedAt(Date.now());
    setManualRequestKind('history');
    try {
      const result = await controller.generate();
      onNotice(
        result.started
          ? '每日回顾生成已开始。'
          : '已有每日回顾任务正在运行，没有重复创建。',
      );
      await refresh();
    } catch (error) {
      setManualRequestStartedAt(null);
      setManualRequestKind(null);
      onNotice(error instanceof Error ? error.message : '手动生成请求失败。');
    }
  };

  const generateCustom = async () => {
    let plan: DailyReviewWallpaperPlan;
    try {
      plan = normalizeDailyReviewWallpaperPlan({
        summary: summaryDraft,
        image_prompt: imagePromptDraft,
      });
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '自定义内容无效。');
      return;
    }
    setManualRequestStartedAt(Date.now());
    setManualRequestKind('custom');
    try {
      const result = await controller.generate(plan);
      onNotice(
        result.started
          ? '自定义内容已提交，正在生成图片。'
          : '已有每日回顾任务正在运行，没有重复创建。',
      );
      await refresh();
    } catch (error) {
      setManualRequestStartedAt(null);
      setManualRequestKind(null);
      onNotice(error instanceof Error ? error.message : '自定义生成请求失败。');
    }
  };

  const showImage = async (record: DailyReviewWallpaperGenerationRecord) => {
    const imageId = record.result?.imageId;
    if (!imageId) return;
    setExpandedRecordId(record.id);
    setSelectedImageId(imageId);
    setSelectedImage(null);
    setImageError('');
    setImageBusy(true);
    try {
      const image = await controller.readImage(imageId);
      if (!image) throw new Error('对应的生成图片不存在。');
      setSelectedImage(image);
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : '生成图片读取失败。',
      );
    } finally {
      setImageBusy(false);
    }
  };

  const copyPrompt = async (prompt: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('当前页面无法使用剪贴板。');
      }
      await navigator.clipboard.writeText(prompt);
      onNotice('最终生图提示词已复制。');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '提示词复制失败。');
    }
  };

  return (
    <div className="cm-new-tab-daily-runtime">
      <section className="cm-new-tab-daily-status">
        <header>
          <div>
            <strong>每日回顾生成</strong>
            <span>
              {active
                ? manualPending
                  ? manualRequestKind === 'custom'
                    ? '准备自定义创作'
                    : generatedToday
                      ? '准备重新生成'
                      : '准备生成'
                  : automaticPending
                    ? '准备自动生成'
                    : stateLabel(snapshot?.state ?? null)
                : '未使用'}
            </span>
          </div>
          <button
            data-busy={generationBusy ? 'true' : 'false'}
            disabled={!historyPlanningAvailable || generationBusy}
            onClick={() => void generate()}
            title={
              historyPlanningAvailable
                ? undefined
                : '需要历史记录权限和规划模型服务'
            }
            type="button"
          >
            {generationBusy ? (
              <LoaderCircle aria-hidden="true" size={15} />
            ) : generatedToday ? (
              <RefreshCw aria-hidden="true" size={15} />
            ) : (
              <Play aria-hidden="true" size={15} />
            )}
            {generationButtonLabel}
          </button>
        </header>

        <fieldset
          className="cm-new-tab-daily-phases"
          aria-label="每日回顾生成阶段"
        >
          <header>
            <div>
              <strong>生成流程</strong>
              <span>
                {manualPending
                  ? manualRequestKind === 'custom'
                    ? '正在提交自定义摘要与画面描述'
                    : generatedToday
                      ? '正在提交重新生成请求'
                      : '正在提交生成请求'
                  : automaticPending
                    ? '正在启动自动生成'
                    : timelineSummary(snapshot?.state ?? null, timelineRecord)}
              </span>
            </div>
            <b>
              {timelineStep} / {DAILY_REVIEW_WALLPAPER_PHASES.length}
            </b>
          </header>
          <ol>
            {DAILY_REVIEW_WALLPAPER_PHASES.map((phase, index) => {
              const status = timelineStates[index];
              return (
                <li
                  aria-current={status === 'active' ? 'step' : undefined}
                  data-status={status}
                  key={phase}
                >
                  <span
                    aria-label={
                      status === 'complete'
                        ? '已完成'
                        : status === 'active'
                          ? '进行中'
                          : status === 'failed'
                            ? '未完成'
                            : '未开始'
                    }
                    className="cm-new-tab-daily-phase-node"
                    role="img"
                  >
                    {status === 'complete' ? (
                      <Check aria-hidden="true" size={14} />
                    ) : status === 'active' ? (
                      <LoaderCircle aria-hidden="true" size={14} />
                    ) : status === 'failed' ? (
                      <AlertCircle aria-hidden="true" size={14} />
                    ) : (
                      <span aria-hidden="true">{index + 1}</span>
                    )}
                  </span>
                  <span className="cm-new-tab-daily-phase-copy">
                    <b>{PHASE_LABELS[phase]}</b>
                  </span>
                </li>
              );
            })}
          </ol>
        </fieldset>

        {requestPending ? (
          <dl className="cm-new-tab-daily-state-details">
            <div>
              <dt>本次操作</dt>
              <dd>
                {manualPending
                  ? manualRequestKind === 'custom'
                    ? '自定义内容 · 手动触发'
                    : `${generatedToday ? '重新生成' : '首次生成'} · 手动触发`
                  : '自动生成 · 配置触发'}
              </dd>
            </div>
            <div>
              <dt>当前阶段</dt>
              <dd>
                {manualRequestKind === 'custom'
                  ? '准备校验摘要与画面描述'
                  : '准备读取最近一个完整浏览日'}
              </dd>
            </div>
          </dl>
        ) : snapshot?.state ? (
          <dl className="cm-new-tab-daily-state-details">
            <div className="cm-new-tab-daily-state-date">
              <dt>日期</dt>
              <dd>
                {'sourceDate' in snapshot.state && snapshot.state.sourceDate
                  ? snapshot.state.status === 'ready' &&
                    snapshot.state.model === 'manual'
                    ? `创作 ${snapshot.state.sourceDate} · 自定义内容`
                    : `回顾 ${snapshot.state.sourceDate} · 生成 ${snapshot.state.targetDate}`
                  : `计划 ${snapshot.state.targetDate}`}
              </dd>
            </div>
            <div>
              <dt>触发</dt>
              <dd>{TRIGGER_LABELS[snapshot.state.trigger]}</dd>
            </div>
            <div>
              <dt>更新</dt>
              <dd>{dateTime(stateUpdatedAt(snapshot.state))}</dd>
            </div>
            {'lastCheckedAt' in snapshot.state &&
            snapshot.state.lastCheckedAt &&
            snapshot.state.lastCheckTrigger ? (
              <div>
                <dt>检查</dt>
                <dd>
                  {TRIGGER_LABELS[snapshot.state.lastCheckTrigger]} ·{' '}
                  {dateTime(snapshot.state.lastCheckedAt)}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {snapshot?.state &&
        'error' in snapshot.state &&
        snapshot.state.error ? (
          <p className="cm-new-tab-daily-error">{snapshot.state.error}</p>
        ) : null}
        {readError ? (
          <div className="cm-new-tab-daily-refresh-error">
            <p>{readError}</p>
            <button onClick={() => void refresh()} type="button">
              <RefreshCw aria-hidden="true" size={14} />
              重新读取
            </button>
          </div>
        ) : null}
      </section>

      <section
        className="cm-new-tab-daily-custom"
        data-expanded={customExpanded ? 'true' : 'false'}
      >
        <header>
          <button
            aria-expanded={customExpanded}
            className="cm-new-tab-daily-review-history-toggle cm-new-tab-daily-custom-toggle"
            onClick={() => setCustomExpanded((current) => !current)}
            type="button"
          >
            <span>
              <strong>手动生成图片</strong>
              <small>摘要点名全部主题，画面描述写成能认出的具体东西</small>
            </span>
            <ChevronDown aria-hidden="true" size={16} />
          </button>
        </header>
        <div className="cm-new-tab-daily-custom-body">
          <div>
            <div className="cm-new-tab-daily-custom-fields">
              <label className="cm-new-tab-daily-custom-field">
                <span>
                  <b>摘要</b>
                  <small>
                    {summaryDraft.length} / {DAILY_REVIEW_SUMMARY_MAX_LENGTH}
                  </small>
                </span>
                <textarea
                  maxLength={DAILY_REVIEW_SUMMARY_MAX_LENGTH}
                  onChange={(event) =>
                    setSummaryDraft(event.currentTarget.value)
                  }
                  placeholder="例如：今天同时在用卡牌大师摆牌、安装用户脚本，还在试手柄秘技。"
                  rows={3}
                  value={summaryDraft}
                />
                {normalizedSummary && !summaryValid ? (
                  <small className="cm-new-tab-daily-custom-error">
                    摘要需要包含简体中文，且不能是连续英文句子。
                  </small>
                ) : null}
              </label>
              <label className="cm-new-tab-daily-custom-field">
                <span>
                  <b>画面描述</b>
                  <small>
                    {imagePromptDraft.length} /{' '}
                    {DAILY_REVIEW_IMAGE_PROMPT_MAX_LENGTH}
                  </small>
                </span>
                <textarea
                  maxLength={DAILY_REVIEW_IMAGE_PROMPT_MAX_LENGTH}
                  onChange={(event) =>
                    setImagePromptDraft(event.currentTarget.value)
                  }
                  placeholder="把每个主题写成能一眼认出的具体道具、人物或场景，全部放进同一张画面。尽量写长、写具体。不用写十六比九或无文字。"
                  rows={7}
                  value={imagePromptDraft}
                />
                {normalizedImagePrompt && !imagePromptValid ? (
                  <small className="cm-new-tab-daily-custom-error">
                    画面描述需要包含简体中文，且不能是连续英文句子。
                  </small>
                ) : null}
              </label>
            </div>
            <div className="cm-new-tab-daily-custom-actions">
              <button
                className="cm-new-tab-daily-custom-submit"
                data-busy={generationBusy ? 'true' : 'false'}
                disabled={!customPlanReady || generationBusy}
                onClick={() => void generateCustom()}
                type="button"
              >
                {generationBusy ? (
                  <LoaderCircle aria-hidden="true" size={15} />
                ) : (
                  <Play aria-hidden="true" size={15} />
                )}
                {generationBusy ? '正在生成' : '生成图片'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section
        className="cm-new-tab-daily-review-history"
        data-expanded={historyExpanded ? 'true' : 'false'}
      >
        <header>
          <button
            aria-expanded={historyExpanded}
            className="cm-new-tab-daily-review-history-toggle"
            onClick={() => {
              setHistoryExpanded((current) => {
                if (current) {
                  setVisibleHistoryCount(HISTORY_PAGE_SIZE);
                  setExpandedRecordId('');
                }
                return !current;
              });
            }}
            type="button"
          >
            <span>
              <strong>生成历史</strong>
              <small>
                近 {retentionDays} 天 · {snapshot?.history.length ?? 0} 次
              </small>
            </span>
            <ChevronDown aria-hidden="true" size={16} />
          </button>
          <button
            aria-label="刷新生成历史"
            className="cm-new-tab-daily-review-history-refresh"
            onClick={() => void refresh()}
            title="刷新"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={15} />
          </button>
        </header>

        <div
          aria-hidden={!historyExpanded}
          className="cm-new-tab-daily-review-history-body"
        >
          <div>
            {historyGroups.length === 0 ? (
              <p className="cm-new-tab-daily-empty">还没有生成记录。</p>
            ) : (
              <div className="cm-new-tab-daily-days">
                {historyGroups.map(([date, records]) => (
                  <section key={date}>
                    <h2>
                      <span>
                        <CalendarDays aria-hidden="true" size={14} />
                        {date}
                      </span>
                      <small>{records.length} 次</small>
                    </h2>
                    <div>
                      {records.map((record) => {
                        const expanded = expandedRecordId === record.id;
                        const imageLoading =
                          imageBusy &&
                          selectedImageId === record.result?.imageId;
                        const preview =
                          record.summary ||
                          (record.phase
                            ? PHASE_DESCRIPTIONS[record.phase]
                            : record.error || '等待生成详情');
                        const availability = record.finalPrompt
                          ? '包含生成提示词'
                          : record.result
                            ? `${record.result.width}×${record.result.height}`
                            : record.sourceDate
                              ? `回顾 ${record.sourceDate}`
                              : `计划 ${record.targetDate}`;
                        return (
                          <article
                            data-expanded={expanded ? 'true' : 'false'}
                            data-status={record.status}
                            key={record.id}
                          >
                            <header>
                              <button
                                aria-expanded={expanded}
                                className="cm-new-tab-daily-record-toggle"
                                onClick={() =>
                                  setExpandedRecordId((current) =>
                                    current === record.id ? '' : record.id,
                                  )
                                }
                                type="button"
                              >
                                <span className="cm-new-tab-daily-record-date">
                                  <strong>
                                    {record.sourceDate
                                      ? record.model === 'manual'
                                        ? `创作 ${record.sourceDate}`
                                        : `回顾 ${record.sourceDate}`
                                      : '等待回顾日期'}
                                  </strong>
                                  <small>
                                    <time
                                      dateTime={new Date(
                                        record.startedAt,
                                      ).toISOString()}
                                    >
                                      {time(record.startedAt)}
                                    </time>
                                    {' · '}
                                    {TRIGGER_LABELS[record.trigger]}
                                  </small>
                                </span>
                                <span className="cm-new-tab-daily-record-preview">
                                  <strong>{preview}</strong>
                                  <small>{availability}</small>
                                </span>
                                <span
                                  className="cm-new-tab-daily-record-status"
                                  data-status={record.status}
                                >
                                  {STATUS_LABELS[record.status]}
                                </span>
                                <ChevronDown
                                  aria-hidden="true"
                                  className="cm-new-tab-daily-record-chevron"
                                  size={16}
                                />
                              </button>
                              <div className="cm-new-tab-daily-record-actions">
                                {record.finalPrompt ? (
                                  <button
                                    aria-label="复制最终生图提示词"
                                    className="cm-new-tab-daily-record-action-copy"
                                    onClick={() =>
                                      void copyPrompt(record.finalPrompt ?? '')
                                    }
                                    title="复制提示词"
                                    type="button"
                                  >
                                    <Copy aria-hidden="true" size={14} />
                                  </button>
                                ) : null}
                                {record.result ? (
                                  <button
                                    aria-label="查看生成图片"
                                    className="cm-new-tab-daily-record-action-image"
                                    data-busy={imageLoading ? 'true' : 'false'}
                                    disabled={imageLoading}
                                    onClick={() => void showImage(record)}
                                    title="查看图片"
                                    type="button"
                                  >
                                    {imageLoading ? (
                                      <LoaderCircle
                                        aria-hidden="true"
                                        size={14}
                                      />
                                    ) : (
                                      <ImageIcon aria-hidden="true" size={14} />
                                    )}
                                  </button>
                                ) : null}
                              </div>
                            </header>

                            {expanded ? (
                              <div className="cm-new-tab-daily-record-details">
                                <dl>
                                  {record.status === 'running' &&
                                  record.phase ? (
                                    <div>
                                      <dt>当前阶段</dt>
                                      <dd>{PHASE_LABELS[record.phase]}</dd>
                                    </div>
                                  ) : null}
                                  <div>
                                    <dt>开始时间</dt>
                                    <dd>{dateTime(record.startedAt)}</dd>
                                  </div>
                                  {record.model ? (
                                    <div>
                                      <dt>
                                        {record.model === 'manual'
                                          ? '内容来源'
                                          : '规划模型'}
                                      </dt>
                                      <dd>
                                        {record.model === 'manual'
                                          ? '手动提供'
                                          : record.model}
                                      </dd>
                                    </div>
                                  ) : null}
                                  {record.result ? (
                                    <>
                                      <div>
                                        <dt>生图模型</dt>
                                        <dd>{record.result.imageModel}</dd>
                                      </div>
                                      <div>
                                        <dt>图片规格</dt>
                                        <dd>
                                          {record.result.width}×
                                          {record.result.height} ·{' '}
                                          {byteSize(record.result.byteLength)}
                                        </dd>
                                      </div>
                                    </>
                                  ) : null}
                                  {record.completedAt ? (
                                    <div>
                                      <dt>完成时间</dt>
                                      <dd>{dateTime(record.completedAt)}</dd>
                                    </div>
                                  ) : null}
                                </dl>

                                {record.summary ? (
                                  <section className="cm-new-tab-daily-summary">
                                    <h3>回顾摘要</h3>
                                    <p>{record.summary}</p>
                                  </section>
                                ) : null}
                                {record.error ? (
                                  <p className="cm-new-tab-daily-error">
                                    {record.error}
                                  </p>
                                ) : null}

                                {record.finalPrompt ? (
                                  <section className="cm-new-tab-daily-prompt">
                                    <h3>最终生图提示词</h3>
                                    <pre>{record.finalPrompt}</pre>
                                  </section>
                                ) : null}

                                {selectedImageId === record.result?.imageId ? (
                                  <div className="cm-new-tab-daily-image">
                                    {imageError ? (
                                      <p className="cm-new-tab-daily-error">
                                        {imageError}
                                      </p>
                                    ) : null}
                                    {selectedImage ? (
                                      <img
                                        alt={`${record.sourceDate ?? record.targetDate} 每日回顾生成结果`}
                                        src={selectedImage.dataUrl}
                                      />
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {hiddenHistoryCount > 0 ? (
                  <button
                    className="cm-new-tab-daily-review-history-more"
                    onClick={() =>
                      setVisibleHistoryCount(
                        (current) => current + HISTORY_PAGE_SIZE,
                      )
                    }
                    type="button"
                  >
                    再显示 {Math.min(HISTORY_PAGE_SIZE, hiddenHistoryCount)} 条
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
