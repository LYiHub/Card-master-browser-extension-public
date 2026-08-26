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

const RECOMMENDATION_MODES = [
  { value: 'pure', label: '纯净' },
  { value: 'explore', label: '探索' },
  { value: 'mixed', label: '混合' },
  { value: 'native', label: '原生' },
] as const;

const SEGMENT_POLICIES = [
  { value: 'auto', label: '自动跳过' },
  { value: 'manual', label: '手动确认' },
  { value: 'overlay', label: '仅标记' },
  { value: 'disabled', label: '不处理' },
] as const;

const DANMAKU_MARK_MODES = [
  { value: 'prefix', label: '显示在开头' },
  { value: 'suffix', label: '显示在结尾' },
  { value: 'off', label: '不显示' },
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
  const definition = bilibiliCapabilityDefinition(card.capabilityId);
  const unavailableReason = card.snapshot.available
    ? null
    : (card.snapshot.unavailableReason ?? '当前平台不支持这张卡牌。');
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
      setStatus('设置已应用，当前支持的页面会同步更新。');
    } catch (failure) {
      setStatus(errorMessage(failure));
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <UiDialog
      ariaLabel={`${definition.title}设置`}
      title={definition.title}
      status={{
        label: unavailableReason
          ? card.snapshot.stateLabel
          : card.snapshot.enabled
            ? card.snapshot.stateLabel
            : '已停用',
        tone:
          !unavailableReason && card.snapshot.enabled ? 'active' : 'inactive',
      }}
      onClose={onClose}
      footer={
        unavailableReason ? (
          <UiButton onClick={onClose}>关闭</UiButton>
        ) : (
          <>
            <UiLoader
              visible={busy && Boolean(draft)}
              compact
              className="manager-settings-operation-loader"
              label="正在同步扩展能力设置"
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
                    setStatus('已恢复最近保存的设置。');
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
              撤销修改
            </UiButton>
            <UiButton
              variant="primary"
              disabled={!draft || busy}
              onClick={() => void save()}
            >
              <Save size={14} aria-hidden="true" />
              应用设置
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
        <UiNotice title="Safari 不支持此卡牌">
          <p>{unavailableReason}</p>
        </UiNotice>
      ) : !draft ? (
        error ? (
          <UiNotice tone="error" title="设置读取失败" copyText={status}>
            <p>{status}</p>
          </UiNotice>
        ) : (
          <UiLoader large label="正在载入该能力的完整配置" />
        )
      ) : (
        <div className="manager-bilibili-capability-grid">
          {draft.id === 'recommendation-control' && (
            <>
              <UiSegmentedControl
                label="推荐身份"
                value={draft.settings.mode}
                options={RECOMMENDATION_MODES}
                onChange={(mode) =>
                  updateDraft('recommendation-control', {
                    ...draft.settings,
                    mode,
                  })
                }
              />
              <UiNotice title="请求范围">
                <p>
                  只调整首页推荐接口的
                  Cookie，不会退出登录，也不会修改收藏、评论、画质和账号数据。
                </p>
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
                              'B 站设备指纹已清除，页面刷新后将由 B 站重新签发。',
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
                    重置匿名指纹
                  </UiButton>
                )}
              </UiNotice>
            </>
          )}

          {draft.id === 'danmaku-compression' && (
            <>
              <NumericSetting
                id="bilibili-danmaku-threshold"
                label="合并时间窗口（秒）"
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
                label="最大文本距离"
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
                label="最大余弦角"
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
                label="处理线程"
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
                label="合并数量标记"
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
                label="数量标记阈值"
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
                label="自动缩小密度阈值"
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
                label="自动优选密度阈值"
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
                  ['trimPinyin', '忽略拼音差异'],
                  ['trimEnding', '忽略句尾语气'],
                  ['trimSpace', '忽略空格差异'],
                  ['trimWidth', '统一全角半角'],
                  ['crossMode', '跨弹幕模式合并'],
                  ['subscript', '显示合并数量'],
                  ['enlarge', '放大高频代表弹幕'],
                  ['tooltip', '显示弹幕详情'],
                  ['autoDisableDanmaku', '处理后关闭滚动弹幕'],
                  ['autoOpenList', '自动展开弹幕列表'],
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
                  ['sponsor', '商业赞助'],
                  ['selfPromotion', '自我推广'],
                  ['interaction', '一键三连提示'],
                  ['intro', '片头'],
                  ['outro', '片尾'],
                  ['preview', '预告与回顾'],
                  ['filler', '无关填充'],
                  ['musicOfftopic', '音乐外内容'],
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
                  ['audioNotification', '跳过时播放提示音'],
                  ['showNotice', '显示跳过提示'],
                  ['showTimeWithSkips', '显示扣除片段后的时长'],
                  ['skipOnSeek', '拖动进度后继续跳过'],
                  ['dynamicSponsorBlock', '识别 B 站动态中的推广'],
                  ['commentSponsorBlock', '识别 B 站评论区推广'],
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
              <UiNotice title="双平台运行">
                <p>
                  分类策略、跳过提示和全局启停会同时应用到 BilibiliSponsorBlock
                  与 YouTube SponsorBlock；动态和评论识别仅属于 B 站运行时。
                </p>
              </UiNotice>
            </>
          )}
        </div>
      )}
    </UiDialog>
  );
}
