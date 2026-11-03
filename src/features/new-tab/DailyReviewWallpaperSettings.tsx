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
import { getLocale } from '../../localization/locale';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
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
  get 'reading-history'() {
    return t('cm_daily_review_wallpaper_settings__reading_history__1');
  },
  get planning() {
    return t('cm_daily_review_wallpaper_settings_planning_2');
  },
  get 'generating-image'() {
    return t('cm_daily_review_wallpaper_settings__generating_image__3');
  },
  get saving() {
    return t('cm_daily_review_wallpaper_settings_saving_4');
  },
};

const PHASE_DESCRIPTIONS: Record<DailyReviewWallpaperPhase, string> = {
  get 'reading-history'() {
    return t('cm_daily_review_wallpaper_settings__reading_history__5');
  },
  get planning() {
    return t('cm_daily_review_wallpaper_settings_planning_6');
  },
  get 'generating-image'() {
    return t('cm_daily_review_wallpaper_settings__generating_image__7');
  },
  get saving() {
    return t('cm_daily_review_wallpaper_settings_saving_8');
  },
};

const TRIGGER_LABELS: Record<DailyReviewWallpaperTrigger, string> = {
  get manual() {
    return t('cm_daily_review_wallpaper_settings_manual_9');
  },
  get scheduled() {
    return t('cm_daily_review_wallpaper_settings_scheduled_10');
  },
  get startup() {
    return t('cm_daily_review_wallpaper_settings_startup_11');
  },
  get configuration() {
    return t('cm_daily_review_wallpaper_settings_configuration_12');
  },
};

const STATUS_LABELS: Record<
  DailyReviewWallpaperGenerationRecord['status'],
  string
> = {
  get running() {
    return t('cm_daily_review_wallpaper_settings_running_13');
  },
  get ready() {
    return t('cm_daily_review_wallpaper_settings_ready_14');
  },
  get failed() {
    return t('cm_daily_review_wallpaper_settings_failed_15');
  },
  get blocked() {
    return t('cm_daily_review_wallpaper_settings_blocked_16');
  },
  get 'no-history'() {
    return t('cm_daily_review_wallpaper_settings__no_history__17');
  },
};

const HISTORY_PAGE_SIZE = 10;

function stateLabel(state: DailyReviewWallpaperState | null) {
  if (!state) return t('cm_daily_review_wallpaper_settings_text_18');
  switch (state.status) {
    case 'generating':
      return PHASE_LABELS[state.phase];
    case 'ready':
      return t('cm_daily_review_wallpaper_settings_text_19');
    case 'disabled':
      return t('cm_daily_review_wallpaper_settings_text_20');
    case 'unsupported':
      return t('cm_daily_review_wallpaper_settings_text_21');
    case 'waiting-for-configuration':
      return t('cm_daily_review_wallpaper_settings_text_22');
    case 'no-history':
      return t('cm_daily_review_wallpaper_settings_text_23');
    case 'failed':
      return t('cm_daily_review_wallpaper_settings_text_24');
  }
}

function dateTime(timestamp: number | undefined) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(timestamp);
}

function time(timestamp: number | undefined) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(getLocale(), {
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
  if (busy)
    return generatedToday
      ? t('cm_daily_review_wallpaper_settings_text_25')
      : t('cm_daily_review_wallpaper_settings_text_26');
  return generatedToday
    ? t('cm_daily_review_wallpaper_settings_text_27')
    : t('cm_daily_review_wallpaper_settings_text_28');
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
  if (!state) return t('cm_daily_review_wallpaper_settings_text_29');
  if (state.status === 'ready')
    return t('cm_daily_review_wallpaper_settings_text_30');
  if (state.status === 'generating') {
    return PHASE_DESCRIPTIONS[state.phase];
  }
  if (state.status === 'failed' && record?.phase) {
    return t('cm_daily_review_wallpaper_settings_text_31', [
      String(PHASE_LABELS[record.phase]),
    ]);
  }
  if (state.status === 'no-history')
    return t('cm_daily_review_wallpaper_settings_text_32');
  if (state.status === 'waiting-for-configuration')
    return t('cm_daily_review_wallpaper_settings_text_33');
  if (state.status === 'unsupported')
    return t('cm_daily_review_wallpaper_settings_text_34');
  if (state.status === 'disabled')
    return t('cm_daily_review_wallpaper_settings_text_35');
  return t('cm_daily_review_wallpaper_settings_text_36');
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
  useLocale();

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
        error instanceof Error
          ? error.message
          : t('cm_daily_review_wallpaper_settings_text_37'),
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
      onNotice(t('cm_daily_review_wallpaper_settings_text_38'));
      return;
    }
    setManualRequestStartedAt(Date.now());
    setManualRequestKind('history');
    try {
      const result = await controller.generate();
      onNotice(
        result.started
          ? t('cm_daily_review_wallpaper_settings_text_39')
          : t('cm_daily_review_wallpaper_settings_text_40'),
      );
      await refresh();
    } catch (error) {
      setManualRequestStartedAt(null);
      setManualRequestKind(null);
      onNotice(
        error instanceof Error
          ? error.message
          : t('cm_daily_review_wallpaper_settings_text_41'),
      );
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
      onNotice(
        error instanceof Error
          ? error.message
          : t('cm_daily_review_wallpaper_settings_text_42'),
      );
      return;
    }
    setManualRequestStartedAt(Date.now());
    setManualRequestKind('custom');
    try {
      const result = await controller.generate(plan);
      onNotice(
        result.started
          ? t('cm_daily_review_wallpaper_settings_text_43')
          : t('cm_daily_review_wallpaper_settings_text_44'),
      );
      await refresh();
    } catch (error) {
      setManualRequestStartedAt(null);
      setManualRequestKind(null);
      onNotice(
        error instanceof Error
          ? error.message
          : t('cm_daily_review_wallpaper_settings_text_45'),
      );
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
      if (!image)
        throw new Error(t('cm_daily_review_wallpaper_settings_error_46'));
      setSelectedImage(image);
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : t('cm_daily_review_wallpaper_settings_text_47'),
      );
    } finally {
      setImageBusy(false);
    }
  };

  const copyPrompt = async (prompt: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error(t('cm_daily_review_wallpaper_settings_error_48'));
      }
      await navigator.clipboard.writeText(prompt);
      onNotice(t('cm_daily_review_wallpaper_settings_text_49'));
    } catch (error) {
      onNotice(
        error instanceof Error
          ? error.message
          : t('cm_daily_review_wallpaper_settings_text_50'),
      );
    }
  };

  return (
    <div className="cm-new-tab-daily-runtime">
      <section className="cm-new-tab-daily-status">
        <header>
          <div>
            <strong>{t('cm_daily_review_wallpaper_settings_text_51')}</strong>
            <span>
              {active
                ? manualPending
                  ? manualRequestKind === 'custom'
                    ? t('cm_daily_review_wallpaper_settings_text_52')
                    : generatedToday
                      ? t('cm_daily_review_wallpaper_settings_text_53')
                      : t('cm_daily_review_wallpaper_settings_text_54')
                  : automaticPending
                    ? t('cm_daily_review_wallpaper_settings_text_55')
                    : stateLabel(snapshot?.state ?? null)
                : t('cm_daily_review_wallpaper_settings_text_56')}
            </span>
          </div>
          <button
            data-busy={generationBusy ? 'true' : 'false'}
            disabled={!historyPlanningAvailable || generationBusy}
            onClick={() => void generate()}
            title={
              historyPlanningAvailable
                ? undefined
                : t('cm_daily_review_wallpaper_settings_text_57')
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
          aria-label={t('cm_daily_review_wallpaper_settings_aria_label_58')}
        >
          <header>
            <div>
              <strong>{t('cm_daily_review_wallpaper_settings_text_59')}</strong>
              <span>
                {manualPending
                  ? manualRequestKind === 'custom'
                    ? t('cm_daily_review_wallpaper_settings_text_60')
                    : generatedToday
                      ? t('cm_daily_review_wallpaper_settings_text_61')
                      : t('cm_daily_review_wallpaper_settings_text_62')
                  : automaticPending
                    ? t('cm_daily_review_wallpaper_settings_text_63')
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
                        ? t('cm_daily_review_wallpaper_settings_text_64')
                        : status === 'active'
                          ? t('cm_daily_review_wallpaper_settings_text_65')
                          : status === 'failed'
                            ? t('cm_daily_review_wallpaper_settings_text_66')
                            : t('cm_daily_review_wallpaper_settings_text_67')
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
              <dt>{t('cm_daily_review_wallpaper_settings_text_68')}</dt>
              <dd>
                {manualPending
                  ? manualRequestKind === 'custom'
                    ? t('cm_daily_review_wallpaper_settings_text_69')
                    : t('cm_daily_review_wallpaper_settings_text_70', [
                        String(
                          generatedToday
                            ? t('cm_daily_review_wallpaper_settings_text_1')
                            : t('cm_daily_review_wallpaper_settings_text_2'),
                        ),
                      ])
                  : t('cm_daily_review_wallpaper_settings_text_71')}
              </dd>
            </div>
            <div>
              <dt>{t('cm_daily_review_wallpaper_settings_text_72')}</dt>
              <dd>
                {manualRequestKind === 'custom'
                  ? t('cm_daily_review_wallpaper_settings_text_73')
                  : t('cm_daily_review_wallpaper_settings_text_74')}
              </dd>
            </div>
          </dl>
        ) : snapshot?.state ? (
          <dl className="cm-new-tab-daily-state-details">
            <div className="cm-new-tab-daily-state-date">
              <dt>{t('cm_daily_review_wallpaper_settings_text_75')}</dt>
              <dd>
                {'sourceDate' in snapshot.state && snapshot.state.sourceDate
                  ? snapshot.state.status === 'ready' &&
                    snapshot.state.model === 'manual'
                    ? t('cm_daily_review_wallpaper_settings_text_76', [
                        String(snapshot.state.sourceDate),
                      ])
                    : t('cm_daily_review_wallpaper_settings_text_77', [
                        String(snapshot.state.sourceDate),
                        String(snapshot.state.targetDate),
                      ])
                  : t('cm_daily_review_wallpaper_settings_text_78', [
                      String(snapshot.state.targetDate),
                    ])}
              </dd>
            </div>
            <div>
              <dt>{t('cm_daily_review_wallpaper_settings_text_79')}</dt>
              <dd>{TRIGGER_LABELS[snapshot.state.trigger]}</dd>
            </div>
            <div>
              <dt>{t('cm_daily_review_wallpaper_settings_text_80')}</dt>
              <dd>{dateTime(stateUpdatedAt(snapshot.state))}</dd>
            </div>
            {'lastCheckedAt' in snapshot.state &&
            snapshot.state.lastCheckedAt &&
            snapshot.state.lastCheckTrigger ? (
              <div>
                <dt>{t('cm_daily_review_wallpaper_settings_text_81')}</dt>
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
              {t('cm_daily_review_wallpaper_settings_text_82')}
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
              <strong>{t('cm_daily_review_wallpaper_settings_text_83')}</strong>
              <small>{t('cm_daily_review_wallpaper_settings_text_84')}</small>
            </span>
            <ChevronDown aria-hidden="true" size={16} />
          </button>
        </header>
        <div className="cm-new-tab-daily-custom-body">
          <div>
            <div className="cm-new-tab-daily-custom-fields">
              <label className="cm-new-tab-daily-custom-field">
                <span>
                  <b>{t('cm_daily_review_wallpaper_settings_text_85')}</b>
                  <small>
                    {summaryDraft.length} / {DAILY_REVIEW_SUMMARY_MAX_LENGTH}
                  </small>
                </span>
                <textarea
                  maxLength={DAILY_REVIEW_SUMMARY_MAX_LENGTH}
                  onChange={(event) =>
                    setSummaryDraft(event.currentTarget.value)
                  }
                  placeholder={t(
                    'cm_daily_review_wallpaper_settings_placeholder_86',
                  )}
                  rows={3}
                  value={summaryDraft}
                />
                {normalizedSummary && !summaryValid ? (
                  <small className="cm-new-tab-daily-custom-error">
                    {t('cm_daily_review_wallpaper_settings_text_87')}
                  </small>
                ) : null}
              </label>
              <label className="cm-new-tab-daily-custom-field">
                <span>
                  <b>{t('cm_daily_review_wallpaper_settings_text_88')}</b>
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
                  placeholder={t(
                    'cm_daily_review_wallpaper_settings_placeholder_89',
                  )}
                  rows={7}
                  value={imagePromptDraft}
                />
                {normalizedImagePrompt && !imagePromptValid ? (
                  <small className="cm-new-tab-daily-custom-error">
                    {t('cm_daily_review_wallpaper_settings_text_90')}
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
                {generationBusy
                  ? t('cm_daily_review_wallpaper_settings_text_91')
                  : t('cm_daily_review_wallpaper_settings_text_92')}
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
              <strong>{t('cm_daily_review_wallpaper_settings_text_93')}</strong>
              <small>
                {t('cm_daily_review_wallpaper_settings_text_94')}
                {retentionDays}{' '}
                {t('cm_daily_review_wallpaper_settings_text_95')}
                {snapshot?.history.length ?? 0}{' '}
                {t('cm_daily_review_wallpaper_settings_text_96')}
              </small>
            </span>
            <ChevronDown aria-hidden="true" size={16} />
          </button>
          <button
            aria-label={t('cm_daily_review_wallpaper_settings_aria_label_97')}
            className="cm-new-tab-daily-review-history-refresh"
            onClick={() => void refresh()}
            title={t('cm_daily_review_wallpaper_settings_title_98')}
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
              <p className="cm-new-tab-daily-empty">
                {t('cm_daily_review_wallpaper_settings_text_99')}
              </p>
            ) : (
              <div className="cm-new-tab-daily-days">
                {historyGroups.map(([date, records]) => (
                  <section key={date}>
                    <h2>
                      <span>
                        <CalendarDays aria-hidden="true" size={14} />
                        {date}
                      </span>
                      <small>
                        {records.length}{' '}
                        {t('cm_daily_review_wallpaper_settings_text_100')}
                      </small>
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
                            : record.error ||
                              t('cm_daily_review_wallpaper_settings_text_101'));
                        const availability = record.finalPrompt
                          ? t('cm_daily_review_wallpaper_settings_text_102')
                          : record.result
                            ? `${record.result.width}×${record.result.height}`
                            : record.sourceDate
                              ? t(
                                  'cm_daily_review_wallpaper_settings_text_103',
                                  [String(record.sourceDate)],
                                )
                              : t(
                                  'cm_daily_review_wallpaper_settings_text_104',
                                  [String(record.targetDate)],
                                );
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
                                        ? t(
                                            'cm_daily_review_wallpaper_settings_text_105',
                                            [String(record.sourceDate)],
                                          )
                                        : t(
                                            'cm_daily_review_wallpaper_settings_text_106',
                                            [String(record.sourceDate)],
                                          )
                                      : t(
                                          'cm_daily_review_wallpaper_settings_text_107',
                                        )}
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
                                    aria-label={t(
                                      'cm_daily_review_wallpaper_settings_aria_label_108',
                                    )}
                                    className="cm-new-tab-daily-record-action-copy"
                                    onClick={() =>
                                      void copyPrompt(record.finalPrompt ?? '')
                                    }
                                    title={t(
                                      'cm_daily_review_wallpaper_settings_title_109',
                                    )}
                                    type="button"
                                  >
                                    <Copy aria-hidden="true" size={14} />
                                  </button>
                                ) : null}
                                {record.result ? (
                                  <button
                                    aria-label={t(
                                      'cm_daily_review_wallpaper_settings_aria_label_110',
                                    )}
                                    className="cm-new-tab-daily-record-action-image"
                                    data-busy={imageLoading ? 'true' : 'false'}
                                    disabled={imageLoading}
                                    onClick={() => void showImage(record)}
                                    title={t(
                                      'cm_daily_review_wallpaper_settings_title_111',
                                    )}
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
                                      <dt>
                                        {t(
                                          'cm_daily_review_wallpaper_settings_text_112',
                                        )}
                                      </dt>
                                      <dd>{PHASE_LABELS[record.phase]}</dd>
                                    </div>
                                  ) : null}
                                  <div>
                                    <dt>
                                      {t(
                                        'cm_daily_review_wallpaper_settings_text_113',
                                      )}
                                    </dt>
                                    <dd>{dateTime(record.startedAt)}</dd>
                                  </div>
                                  {record.model ? (
                                    <div>
                                      <dt>
                                        {record.model === 'manual'
                                          ? t(
                                              'cm_daily_review_wallpaper_settings_text_114',
                                            )
                                          : t(
                                              'cm_daily_review_wallpaper_settings_text_115',
                                            )}
                                      </dt>
                                      <dd>
                                        {record.model === 'manual'
                                          ? t(
                                              'cm_daily_review_wallpaper_settings_text_116',
                                            )
                                          : record.model}
                                      </dd>
                                    </div>
                                  ) : null}
                                  {record.result ? (
                                    <>
                                      <div>
                                        <dt>
                                          {t(
                                            'cm_daily_review_wallpaper_settings_text_117',
                                          )}
                                        </dt>
                                        <dd>{record.result.imageModel}</dd>
                                      </div>
                                      <div>
                                        <dt>
                                          {t(
                                            'cm_daily_review_wallpaper_settings_text_118',
                                          )}
                                        </dt>
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
                                      <dt>
                                        {t(
                                          'cm_daily_review_wallpaper_settings_text_119',
                                        )}
                                      </dt>
                                      <dd>{dateTime(record.completedAt)}</dd>
                                    </div>
                                  ) : null}
                                </dl>

                                {record.summary ? (
                                  <section className="cm-new-tab-daily-summary">
                                    <h3>
                                      {t(
                                        'cm_daily_review_wallpaper_settings_text_120',
                                      )}
                                    </h3>
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
                                    <h3>
                                      {t(
                                        'cm_daily_review_wallpaper_settings_text_121',
                                      )}
                                    </h3>
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
                                        alt={t(
                                          'cm_daily_review_wallpaper_settings_text_122',
                                          [
                                            String(
                                              record.sourceDate ??
                                                record.targetDate,
                                            ),
                                          ],
                                        )}
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
                    {t('cm_daily_review_wallpaper_settings_text_123')}
                    {Math.min(HISTORY_PAGE_SIZE, hiddenHistoryCount)}{' '}
                    {t('cm_daily_review_wallpaper_settings_text_124')}
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
