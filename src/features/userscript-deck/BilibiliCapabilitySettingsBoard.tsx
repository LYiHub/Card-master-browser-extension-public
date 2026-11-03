import { RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type {
  BilibiliCapabilityCard,
  BilibiliCapabilityController,
  BilibiliCapabilitySettings,
  BilibiliDanmakuSettings,
  BilibiliSegmentPolicy,
  BilibiliSegmentSkippingSettings,
} from '../../bilibili-capabilities/domain/types';
import { bilibiliCapabilityDefinition } from '../../bilibili-capabilities/registry';
import {
  DiagnosticCopyButton,
  UiButton,
  UiDialog,
  UiLoader,
  UiNotice,
  UiSegmentedControl,
  UiSelectField,
  UiTextField,
  UiToggle,
} from '../../components/ui/Ui';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';

const RECOMMENDATION_MODES = [
  {
    value: 'pure',
    get label() {
      return t('cm_bilibili_capability_settings_board_label_1');
    },
  },
  {
    value: 'explore',
    get label() {
      return t('cm_bilibili_capability_settings_board_label_2');
    },
  },
  {
    value: 'mixed',
    get label() {
      return t('cm_bilibili_capability_settings_board_label_3');
    },
  },
  {
    value: 'native',
    get label() {
      return t('cm_bilibili_capability_settings_board_label_4');
    },
  },
] as const;

const SEGMENT_POLICIES = [
  {
    value: 'auto',
    get label() {
      return t('cm_bilibili_capability_settings_board_label_5');
    },
  },
  {
    value: 'manual',
    get label() {
      return t('cm_bilibili_capability_settings_board_label_6');
    },
  },
  {
    value: 'overlay',
    get label() {
      return t('cm_bilibili_capability_settings_board_label_7');
    },
  },
  {
    value: 'disabled',
    get label() {
      return t('cm_bilibili_capability_settings_board_label_8');
    },
  },
] as const;

const DANMAKU_MARK_MODES = [
  {
    value: 'prefix',
    get label() {
      return t('cm_bilibili_capability_settings_board_label_9');
    },
  },
  {
    value: 'suffix',
    get label() {
      return t('cm_bilibili_capability_settings_board_label_10');
    },
  },
  {
    value: 'off',
    get label() {
      return t('cm_bilibili_capability_settings_board_label_11');
    },
  },
] as const;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function NumericSetting({
  id,
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}) {
  useLocale();

  return (
    <UiTextField
      id={id}
      label={label}
      type="number"
      min={minimum}
      max={maximum}
      value={value}
      onChange={(event) => {
        const next = Number(event.currentTarget.value);
        if (Number.isFinite(next)) {
          onChange(Math.min(maximum, Math.max(minimum, next)));
        }
      }}
    />
  );
}

function SegmentPolicySetting({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: BilibiliSegmentPolicy;
  onChange: (value: BilibiliSegmentPolicy) => void;
}) {
  useLocale();

  return (
    <UiSelectField
      id={id}
      label={label}
      value={value}
      onChange={(event) =>
        onChange(event.currentTarget.value as BilibiliSegmentPolicy)
      }
    >
      {SEGMENT_POLICIES.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </UiSelectField>
  );
}

export function BilibiliCapabilitySettingsBoard({
  card,
  controller,
  onSnapshots,
  onClose,
}: {
  card: BilibiliCapabilityCard;
  controller: BilibiliCapabilityController;
  onSnapshots: Parameters<BilibiliCapabilityController['subscribe']>[0];
  onClose: () => void;
}) {
  useLocale();

  const definition = bilibiliCapabilityDefinition(card.capabilityId);
  const unavailableReason = card.snapshot.available
    ? null
    : (card.snapshot.unavailableReason ??
      t('cm_bilibili_capability_settings_board_text_12'));
  const [draft, setDraft] = useState<BilibiliCapabilitySettings | null>(null);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (unavailableReason) {
      setBusy(false);
      return;
    }
    let active = true;
    void controller.readSettings(card.capabilityId).then(
      (settings) => {
        if (!active) return;
        setDraft(structuredClone(settings));
        setBusy(false);
      },
      (failure) => {
        if (!active) return;
        setStatus(errorMessage(failure));
        setError(true);
        setBusy(false);
      },
    );
    return () => {
      active = false;
    };
  }, [card.capabilityId, controller, unavailableReason]);

  const updateDraft = useCallback(
    <Id extends BilibiliCapabilitySettings['id']>(
      id: Id,
      settings: Extract<BilibiliCapabilitySettings, { id: Id }>['settings'],
    ) => {
      setDraft((current) =>
        current && current.id === id
          ? ({ ...current, settings } as BilibiliCapabilitySettings)
          : current,
      );
    },
    [],
  );

  const save = async () => {
    if (!draft || unavailableReason) return;
    setBusy(true);
    setStatus('');
    setError(false);
    try {
      const snapshots = await controller.saveSettings(draft);
      onSnapshots(snapshots);
      setStatus(t('cm_bilibili_capability_settings_board_text_13'));
    } catch (failure) {
      setStatus(errorMessage(failure));
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <UiDialog
      ariaLabel={t('cm_bilibili_capability_settings_board_text_14', [
        String(definition.title),
      ])}
      title={definition.title}
      status={{
        label: unavailableReason
          ? card.snapshot.stateLabel
          : card.snapshot.enabled
            ? card.snapshot.stateLabel
            : t('cm_bilibili_capability_settings_board_text_15'),
        tone:
          !unavailableReason && card.snapshot.enabled ? 'active' : 'inactive',
      }}
      onClose={onClose}
      footer={
        unavailableReason ? (
          <UiButton onClick={onClose}>
            {t('cm_bilibili_capability_settings_board_text_16')}
          </UiButton>
        ) : (
          <>
            <UiLoader
              visible={busy && Boolean(draft)}
              compact
              className="manager-settings-operation-loader"
              label={t('cm_bilibili_capability_settings_board_label_17')}
            />
            {(!busy || !draft) && status && (
              <p className={error ? 'is-error' : ''}>{status}</p>
            )}
            {error && status && <DiagnosticCopyButton text={status} />}
            <UiButton
              disabled={!draft || busy}
              onClick={() => {
                setDraft(null);
                setBusy(true);
                void controller.readSettings(card.capabilityId).then(
                  (settings) => {
                    setDraft(structuredClone(settings));
                    setStatus(
                      t('cm_bilibili_capability_settings_board_text_18'),
                    );
                    setError(false);
                    setBusy(false);
                  },
                  (failure) => {
                    setStatus(errorMessage(failure));
                    setError(true);
                    setBusy(false);
                  },
                );
              }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {t('cm_bilibili_capability_settings_board_text_19')}
            </UiButton>
            <UiButton
              variant="primary"
              disabled={!draft || busy}
              onClick={() => void save()}
            >
              <Save size={14} aria-hidden="true" />
              {t('cm_bilibili_capability_settings_board_text_20')}
            </UiButton>
          </>
        )
      }
    >
      <div className="manager-bilibili-capability-intro">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <p>{definition.description}</p>
        </div>
      </div>

      {unavailableReason ? (
        <UiNotice title={t('cm_bilibili_capability_settings_board_title_21')}>
          <p>{unavailableReason}</p>
        </UiNotice>
      ) : !draft ? (
        error ? (
          <UiNotice
            tone="error"
            title={t('cm_bilibili_capability_settings_board_title_22')}
            copyText={status}
          >
            <p>{status}</p>
          </UiNotice>
        ) : (
          <UiLoader
            large
            label={t('cm_bilibili_capability_settings_board_label_23')}
          />
        )
      ) : (
        <div className="manager-bilibili-capability-grid">
          {draft.id === 'recommendation-control' && (
            <>
              <UiSegmentedControl
                label={t('cm_bilibili_capability_settings_board_label_24')}
                value={draft.settings.mode}
                options={RECOMMENDATION_MODES}
                onChange={(mode) =>
                  updateDraft('recommendation-control', {
                    ...draft.settings,
                    mode,
                  })
                }
              />
              <UiNotice
                title={t('cm_bilibili_capability_settings_board_title_25')}
              >
                <p>{t('cm_bilibili_capability_settings_board_text_26')}</p>
                {(draft.settings.mode === 'explore' ||
                  draft.settings.mode === 'mixed') && (
                  <UiButton
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      setStatus('');
                      void controller
                        .execute('recommendation-control', 'reset-fingerprint')
                        .then(
                          (snapshots) => {
                            onSnapshots(snapshots);
                            setStatus(
                              t(
                                'cm_bilibili_capability_settings_board_text_27',
                              ),
                            );
                            setError(false);
                          },
                          (failure) => {
                            setStatus(errorMessage(failure));
                            setError(true);
                          },
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {t('cm_bilibili_capability_settings_board_text_28')}
                  </UiButton>
                )}
              </UiNotice>
            </>
          )}

          {draft.id === 'danmaku-compression' && (
            <>
              <NumericSetting
                id="bilibili-danmaku-threshold"
                label={t('cm_bilibili_capability_settings_board_label_29')}
                value={draft.settings.threshold}
                minimum={-1}
                maximum={180}
                onChange={(threshold) =>
                  updateDraft('danmaku-compression', {
                    ...draft.settings,
                    threshold,
                  })
                }
              />
              <NumericSetting
                id="bilibili-danmaku-distance"
                label={t('cm_bilibili_capability_settings_board_label_30')}
                value={draft.settings.maxDistance}
                minimum={0}
                maximum={100}
                onChange={(maxDistance) =>
                  updateDraft('danmaku-compression', {
                    ...draft.settings,
                    maxDistance,
                  })
                }
              />
              <NumericSetting
                id="bilibili-danmaku-cosine"
                label={t('cm_bilibili_capability_settings_board_label_31')}
                value={draft.settings.maxCosine}
                minimum={0}
                maximum={1_000}
                onChange={(maxCosine) =>
                  updateDraft('danmaku-compression', {
                    ...draft.settings,
                    maxCosine,
                  })
                }
              />
              <NumericSetting
                id="bilibili-danmaku-workers"
                label={t('cm_bilibili_capability_settings_board_label_32')}
                value={draft.settings.workerCount}
                minimum={0}
                maximum={6}
                onChange={(workerCount) =>
                  updateDraft('danmaku-compression', {
                    ...draft.settings,
                    workerCount,
                  })
                }
              />
              <UiSegmentedControl
                label={t('cm_bilibili_capability_settings_board_label_33')}
                value={draft.settings.mark}
                options={DANMAKU_MARK_MODES}
                onChange={(mark) =>
                  updateDraft('danmaku-compression', {
                    ...draft.settings,
                    mark,
                  })
                }
              />
              <NumericSetting
                id="bilibili-danmaku-mark-threshold"
                label={t('cm_bilibili_capability_settings_board_label_34')}
                value={draft.settings.markThreshold}
                minimum={1}
                maximum={9_999}
                onChange={(markThreshold) =>
                  updateDraft('danmaku-compression', {
                    ...draft.settings,
                    markThreshold,
                  })
                }
              />
              <NumericSetting
                id="bilibili-danmaku-shrink-threshold"
                label={t('cm_bilibili_capability_settings_board_label_35')}
                value={draft.settings.shrinkThreshold}
                minimum={0}
                maximum={999}
                onChange={(shrinkThreshold) =>
                  updateDraft('danmaku-compression', {
                    ...draft.settings,
                    shrinkThreshold,
                  })
                }
              />
              <NumericSetting
                id="bilibili-danmaku-drop-threshold"
                label={t('cm_bilibili_capability_settings_board_label_36')}
                value={draft.settings.dropThreshold}
                minimum={0}
                maximum={999}
                onChange={(dropThreshold) =>
                  updateDraft('danmaku-compression', {
                    ...draft.settings,
                    dropThreshold,
                  })
                }
              />
              {(
                [
                  [
                    'trimPinyin',
                    t('cm_bilibili_capability_settings_board_text_37'),
                  ],
                  [
                    'trimEnding',
                    t('cm_bilibili_capability_settings_board_text_38'),
                  ],
                  [
                    'trimSpace',
                    t('cm_bilibili_capability_settings_board_text_39'),
                  ],
                  [
                    'trimWidth',
                    t('cm_bilibili_capability_settings_board_text_40'),
                  ],
                  [
                    'crossMode',
                    t('cm_bilibili_capability_settings_board_text_41'),
                  ],
                  [
                    'subscript',
                    t('cm_bilibili_capability_settings_board_text_42'),
                  ],
                  [
                    'enlarge',
                    t('cm_bilibili_capability_settings_board_text_43'),
                  ],
                  [
                    'tooltip',
                    t('cm_bilibili_capability_settings_board_text_44'),
                  ],
                  [
                    'autoDisableDanmaku',
                    t('cm_bilibili_capability_settings_board_text_45'),
                  ],
                  [
                    'autoOpenList',
                    t('cm_bilibili_capability_settings_board_text_46'),
                  ],
                ] as const
              ).map(([key, label]) => (
                <UiToggle
                  key={key}
                  label={label}
                  checked={draft.settings[key]}
                  onChange={(checked) =>
                    updateDraft('danmaku-compression', {
                      ...draft.settings,
                      [key]: checked,
                    } as BilibiliDanmakuSettings)
                  }
                />
              ))}
            </>
          )}

          {draft.id === 'segment-skipping' && (
            <>
              {(
                [
                  [
                    'sponsor',
                    t('cm_bilibili_capability_settings_board_text_47'),
                  ],
                  [
                    'selfPromotion',
                    t('cm_bilibili_capability_settings_board_text_48'),
                  ],
                  [
                    'interaction',
                    t('cm_bilibili_capability_settings_board_text_49'),
                  ],
                  ['intro', t('cm_bilibili_capability_settings_board_text_50')],
                  ['outro', t('cm_bilibili_capability_settings_board_text_51')],
                  [
                    'preview',
                    t('cm_bilibili_capability_settings_board_text_52'),
                  ],
                  [
                    'filler',
                    t('cm_bilibili_capability_settings_board_text_53'),
                  ],
                  [
                    'musicOfftopic',
                    t('cm_bilibili_capability_settings_board_text_54'),
                  ],
                ] as const
              ).map(([key, label]) => (
                <SegmentPolicySetting
                  key={key}
                  id={`bilibili-segment-${key}`}
                  label={label}
                  value={draft.settings[key]}
                  onChange={(policy) =>
                    updateDraft('segment-skipping', {
                      ...draft.settings,
                      [key]: policy,
                    } as BilibiliSegmentSkippingSettings)
                  }
                />
              ))}
              {(
                [
                  [
                    'audioNotification',
                    t('cm_bilibili_capability_settings_board_text_55'),
                  ],
                  [
                    'showNotice',
                    t('cm_bilibili_capability_settings_board_text_56'),
                  ],
                  [
                    'showTimeWithSkips',
                    t('cm_bilibili_capability_settings_board_text_57'),
                  ],
                  [
                    'skipOnSeek',
                    t('cm_bilibili_capability_settings_board_text_58'),
                  ],
                  [
                    'dynamicSponsorBlock',
                    t('cm_bilibili_capability_settings_board_text_59'),
                  ],
                  [
                    'commentSponsorBlock',
                    t('cm_bilibili_capability_settings_board_text_60'),
                  ],
                ] as const
              ).map(([key, label]) => (
                <UiToggle
                  key={key}
                  label={label}
                  checked={draft.settings[key]}
                  onChange={(checked) =>
                    updateDraft('segment-skipping', {
                      ...draft.settings,
                      [key]: checked,
                    } as BilibiliSegmentSkippingSettings)
                  }
                />
              ))}
              <UiNotice
                title={t('cm_bilibili_capability_settings_board_title_61')}
              >
                <p>{t('cm_bilibili_capability_settings_board_text_62')}</p>
              </UiNotice>
            </>
          )}
        </div>
      )}
    </UiDialog>
  );
}
