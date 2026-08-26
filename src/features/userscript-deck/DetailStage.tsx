import { type ComponentProps, useLayoutEffect, useRef } from 'react';
import {
  playCardStageEnter,
  playCardStageExit,
} from '../../components/card-stage-motion';
import { UiDialogInteractionBoundary } from '../../components/ui/Ui';
import { GamepadSettingsDialog } from '../gamepad-control/GamepadSettingsDialog';
import { BilibiliCapabilitySettingsBoard } from './BilibiliCapabilitySettingsBoard';
import { ContentBlockingSettingsBoard } from './ContentBlockingSettingsBoard';
import {
  type DeckCard,
  isBilibiliCapabilityCard,
  isInstalledUserscript,
} from './cards';
import type { UserscriptDetailMode } from './detail-mode';
import { ManageBoard } from './ManageBoard';
import { MediaSpeedSettingsBoard } from './MediaSpeedSettingsBoard';
import { PageThemeSettingsBoard } from './PageThemeSettingsBoard';
import { SettingsBoard } from './SettingsBoard';

type ManageBoardProps = Omit<ComponentProps<typeof ManageBoard>, 'item'>;
type SettingsBoardProps = ComponentProps<typeof SettingsBoard>;
type ContentBlockingBoardProps = ComponentProps<
  typeof ContentBlockingSettingsBoard
>;
type PageThemeBoardProps = Omit<
  ComponentProps<typeof PageThemeSettingsBoard>,
  'initialScope'
>;
type MediaSpeedBoardProps = ComponentProps<typeof MediaSpeedSettingsBoard>;
type BilibiliCapabilityBoardProps = Omit<
  ComponentProps<typeof BilibiliCapabilitySettingsBoard>,
  'card'
>;

export function DetailStage({
  selected,
  detailMode,
  manageBoardProps,
  settingsBoardProps,
  contentBlockingBoardProps,
  pageThemeBoardProps,
  mediaSpeedBoardProps,
  bilibiliCapabilityBoardProps,
  gamepadSettingsDialogProps,
  centered = false,
  closing,
  onRequestClose,
  onCloseComplete,
}: {
  selected: DeckCard;
  detailMode: UserscriptDetailMode | null;
  manageBoardProps: ManageBoardProps;
  settingsBoardProps: SettingsBoardProps;
  contentBlockingBoardProps?: ContentBlockingBoardProps;
  pageThemeBoardProps?: PageThemeBoardProps;
  mediaSpeedBoardProps?: MediaSpeedBoardProps;
  bilibiliCapabilityBoardProps?: BilibiliCapabilityBoardProps;
  gamepadSettingsDialogProps: Omit<
    ComponentProps<typeof GamepadSettingsDialog>,
    'onClose'
  >;
  centered?: boolean;
  closing: boolean;
  onRequestClose: () => void;
  onCloseComplete: () => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const panel = stage?.querySelector<HTMLElement>('.app-ui-dialog');
    if (!stage || !panel) return;
    return closing
      ? playCardStageExit({ layer: stage, panel, onComplete: onCloseComplete })
      : playCardStageEnter({ layer: stage, panel });
  }, [closing, onCloseComplete]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (closing) return;
      if (stage.querySelector('[data-dialog-close-blocked="true"]')) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.app-ui-dialog')) {
        return;
      }
      onRequestClose();
    };
    stage.addEventListener('pointerdown', handlePointerDown);
    return () => stage.removeEventListener('pointerdown', handlePointerDown);
  }, [closing, onRequestClose]);

  return (
    <div
      ref={stageRef}
      className={`manager-detail-stage${centered ? ' is-centered' : ''}${closing ? ' is-closing' : ''}`}
    >
      {!centered && (
        <div className="manager-detail-card-slot" aria-hidden="true" />
      )}
      <UiDialogInteractionBoundary enabled={!closing}>
        {detailMode === 'manage' && isInstalledUserscript(selected) ? (
          <ManageBoard item={selected} {...manageBoardProps} />
        ) : detailMode === 'global-settings' ? (
          <SettingsBoard {...settingsBoardProps} />
        ) : detailMode === 'content-blocking-settings' &&
          contentBlockingBoardProps ? (
          <ContentBlockingSettingsBoard {...contentBlockingBoardProps} />
        ) : (detailMode === 'page-theme-site' ||
            detailMode === 'page-theme-settings') &&
          pageThemeBoardProps ? (
          <PageThemeSettingsBoard
            {...pageThemeBoardProps}
            initialScope={detailMode === 'page-theme-site' ? 'site' : 'global'}
          />
        ) : detailMode === 'media-speed-settings' && mediaSpeedBoardProps ? (
          <MediaSpeedSettingsBoard {...mediaSpeedBoardProps} />
        ) : detailMode === 'gamepad-settings' ? (
          <GamepadSettingsDialog
            {...gamepadSettingsDialogProps}
            onClose={onRequestClose}
          />
        ) : detailMode === 'bilibili-capability-settings' &&
          bilibiliCapabilityBoardProps &&
          isBilibiliCapabilityCard(selected) ? (
          <BilibiliCapabilitySettingsBoard
            card={selected}
            {...bilibiliCapabilityBoardProps}
          />
        ) : null}
      </UiDialogInteractionBoundary>
    </div>
  );
}
