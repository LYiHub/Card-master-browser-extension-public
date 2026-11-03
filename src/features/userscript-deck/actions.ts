import type { BilibiliCapabilityCommand } from '../../bilibili-capabilities/domain/types';
import { bilibiliCapabilityDefinition } from '../../bilibili-capabilities/registry';
import { t } from '../../localization/messages';
import type { MediaSpeedStandardSpeed } from '../../media-speed/domain/types';
import type { InstalledUserscript } from '../../userscript/domain/types';
import { sequencedActionColors } from '../manager-interaction/action-colors';
import {
  type DeckCard,
  isBilibiliCapabilityCard,
  isContentBlockingCard,
  isGamepadControlCard,
  isMediaResourcesCard,
  isMediaSpeedCard,
  isNewTabCard,
  isPageThemeCard,
} from './cards';

export type ManagerActionKind =
  | 'command'
  | 'toggle'
  | 'manage'
  | 'remove'
  | 'assistant'
  | 'library'
  | 'site-search'
  | 'open-new-tab'
  | 'block'
  | 'zap'
  | 'site-toggle'
  | 'undo-block'
  | 'theme-site-toggle'
  | 'theme-tune'
  | 'speed-select'
  | 'media-resources-collect'
  | 'capability-command'
  | 'cancel';

export type ManagerAction = {
  id: string;
  kind: ManagerActionKind;
  label: string;
  description?: string;
  accent?: string;
  target?: 'page-element';
  targetingMode?: 'single' | 'continuous';
  autoClose?: boolean;
  commandId?: string;
  speed?: MediaSpeedStandardSpeed;
  command?: BilibiliCapabilityCommand;
};

export const CANCEL_ACTION_ID = 'cancel';

export const CANCEL_ACTION: ManagerAction = {
  id: CANCEL_ACTION_ID,
  kind: 'cancel',
  get label() {
    return t('cm_actions_label_1');
  },
  get description() {
    return t('cm_actions_description_2');
  },
  accent: '#bdd1d2',
};

export function actionPlacement(kind: ManagerActionKind) {
  return kind === 'remove' ||
    kind === 'manage' ||
    kind === 'toggle' ||
    kind === 'cancel'
    ? 'corner'
    : 'center';
}

export function cornerPositionForAction(kind: ManagerActionKind) {
  if (kind === 'remove') return 'bottom-left' as const;
  if (kind === 'manage') return 'bottom-right' as const;
  if (kind === 'toggle') return 'top-right' as const;
  if (kind === 'cancel') return 'top-left' as const;
  return null;
}

export function preferredActionId(actions: readonly ManagerAction[]) {
  return (
    actions.find((action) => actionPlacement(action.kind) === 'center')?.id ??
    actions.find((action) => action.kind === 'manage')?.id ??
    actions.find((action) => action.kind === 'toggle')?.id ??
    actions.find((action) => action.kind === 'remove')?.id ??
    null
  );
}

function colorizeCentralActions(actions: readonly ManagerAction[]) {
  const centralActions = actions.filter(
    (action) => actionPlacement(action.kind) === 'center',
  );
  const colors = sequencedActionColors(centralActions.length);
  const accents = new Map(
    centralActions.map((action, index) => [action.id, colors[index]]),
  );
  return actions.map((action) => {
    const accent = accents.get(action.id);
    return accent ? { ...action, accent } : action;
  });
}

function commandActions(item: InstalledUserscript): ManagerAction[] {
  if (!item.manager.enabled || !item.runtime.instanceId) return [];
  return item.runtime.commands.map((command) => ({
    id: `command:${command.id}`,
    commandId: command.id,
    kind: 'command',
    label: command.title,
    description: command.description,
    autoClose: command.autoClose,
  }));
}

export function actionsFor(card: DeckCard): ManagerAction[] {
  if (card.kind === 'steward') {
    return colorizeCentralActions([
      {
        id: 'script-workshop',
        kind: 'assistant',
        label: t('cm_actions_label_3'),
        description: t('cm_actions_description_4'),
      },
      {
        id: 'library',
        kind: 'library',
        label: t('cm_actions_label_5'),
        description: t('cm_actions_description_6'),
      },
      {
        id: 'import-local-script',
        kind: 'library',
        label: t('cm_actions_label_7'),
        description: t('cm_actions_description_8'),
      },
      {
        id: 'site-search',
        kind: 'site-search',
        label: t('cm_actions_label_9'),
        description: t('cm_actions_description_10'),
      },
      {
        id: 'manage',
        kind: 'manage',
        label: t('cm_actions_label_11'),
        description: t('cm_actions_description_12'),
      },
    ]);
  }
  if (isNewTabCard(card)) {
    return colorizeCentralActions([
      {
        id: 'open-new-tab',
        kind: 'open-new-tab',
        label: t('cm_actions_label_13'),
        description: t('cm_actions_description_14'),
      },
      {
        id: 'manage',
        kind: 'manage',
        label: t('cm_actions_label_15'),
        description: t('cm_actions_description_16'),
      },
    ]);
  }
  if (isGamepadControlCard(card)) {
    return [
      {
        id: 'manage',
        kind: 'manage',
        label: t('cm_actions_label_17'),
        description: t('cm_actions_description_18'),
      },
      {
        id: 'toggle',
        kind: 'toggle',
        label: card.enabled ? t('cm_actions_text_19') : t('cm_actions_text_20'),
        description: card.enabled
          ? t('cm_actions_text_21')
          : t('cm_actions_text_22'),
      },
    ];
  }
  if (isContentBlockingCard(card)) {
    const controls: ManagerAction[] = card.snapshot.rulesEnabled
      ? [
          {
            id: 'block-element',
            kind: 'block',
            label: t('cm_actions_label_23'),
            description: t('cm_actions_description_24'),
            target: 'page-element',
            targetingMode: 'continuous',
            autoClose: false,
          },
          {
            id: 'zap-element',
            kind: 'zap',
            label: t('cm_actions_label_25'),
            description: t('cm_actions_description_26'),
            target: 'page-element',
            targetingMode: 'continuous',
            autoClose: false,
          },
        ]
      : [];
    if (card.snapshot.rulesEnabled && card.site.hostname) {
      controls.push({
        id: 'site-toggle',
        kind: 'site-toggle',
        label: card.site.filteringEnabled
          ? t('cm_actions_text_27')
          : t('cm_actions_text_28'),
        description: card.site.filteringEnabled
          ? t('cm_actions_text_29', [String(card.site.hostname)])
          : t('cm_actions_text_30', [String(card.site.hostname)]),
      });
    }
    controls.push({
      id: 'manage',
      kind: 'manage',
      label: t('cm_actions_label_31'),
      description: t('cm_actions_description_32'),
    });
    const lastBatch = card.snapshot.lastElementBlockingBatch;
    if (lastBatch && lastBatch.hostname === card.site.hostname) {
      controls.push({
        id: 'undo-block',
        kind: 'undo-block',
        label: t('cm_actions_label_33'),
        description: t('cm_actions_description_34', [
          String(lastBatch.rules.length),
        ]),
      });
    }
    controls.push({
      id: 'toggle',
      kind: 'toggle',
      label: card.snapshot.rulesEnabled
        ? t('cm_actions_text_35')
        : t('cm_actions_text_36'),
      description: card.snapshot.rulesEnabled
        ? t('cm_actions_text_37')
        : t('cm_actions_text_38'),
    });
    return colorizeCentralActions(controls);
  }
  if (isPageThemeCard(card)) {
    const controls: ManagerAction[] = [
      {
        id: 'manage',
        kind: 'manage',
        label: t('cm_actions_label_39'),
        description: t('cm_actions_description_40'),
      },
      {
        id: 'toggle',
        kind: 'toggle',
        label: card.snapshot.enabled
          ? t('cm_actions_text_41')
          : t('cm_actions_text_42'),
        description: card.snapshot.enabled
          ? t('cm_actions_text_43')
          : t('cm_actions_text_44'),
      },
    ];
    if (
      !card.snapshot.enabled ||
      card.snapshot.status === 'error' ||
      card.snapshot.darkThemeDetected
    ) {
      return controls;
    }
    return colorizeCentralActions([
      {
        id: 'theme-site-toggle',
        kind: 'theme-site-toggle',
        label: card.snapshot.activeOnPage
          ? t('cm_actions_text_45')
          : t('cm_actions_text_46'),
        description: card.snapshot.activeOnPage
          ? t('cm_actions_text_47')
          : t('cm_actions_text_48'),
      },
      {
        id: 'theme-tune',
        kind: 'theme-tune',
        label: t('cm_actions_label_49'),
        description: t('cm_actions_description_50'),
      },
      ...controls,
    ]);
  }
  if (isMediaSpeedCard(card)) {
    const controls: ManagerAction[] = [
      {
        id: 'manage',
        kind: 'manage',
        label: t('cm_actions_label_51'),
        description: t('cm_actions_description_52'),
      },
      {
        id: 'toggle',
        kind: 'toggle',
        label: card.snapshot.enabled
          ? t('cm_actions_text_53')
          : t('cm_actions_text_54'),
        description: card.snapshot.enabled
          ? t('cm_actions_text_55')
          : t('cm_actions_text_56'),
      },
    ];
    if (!card.snapshot.enabled) return controls;
    return colorizeCentralActions([
      {
        id: 'speed-reset',
        kind: 'speed-select',
        speed: 1,
        label: t('cm_actions_label_57'),
        description: t('cm_actions_description_58'),
      },
      ...controls,
    ]);
  }
  if (isMediaResourcesCard(card)) {
    const controls: ManagerAction[] = [
      {
        id: 'manage',
        kind: 'manage',
        label: t('cm_actions_label_59'),
        description: t('cm_actions_description_60'),
      },
      {
        id: 'toggle',
        kind: 'toggle',
        label: card.snapshot.enabled
          ? t('cm_actions_text_61')
          : t('cm_actions_text_62'),
        description: card.snapshot.enabled
          ? t('cm_actions_text_63')
          : t('cm_actions_text_64'),
      },
    ];
    if (!card.snapshot.enabled) return controls;
    return colorizeCentralActions([
      {
        id: 'collect-resources',
        kind: 'media-resources-collect',
        label: t('cm_actions_label_65'),
        description: t('cm_actions_description_66'),
      },
      ...controls,
    ]);
  }
  if (isBilibiliCapabilityCard(card)) {
    const definition = bilibiliCapabilityDefinition(card.capabilityId);
    const commands: readonly {
      id: BilibiliCapabilityCommand;
      label: string;
      description: string;
    }[] =
      !card.snapshot.enabled ||
      (card.capabilityId === 'segment-skipping' && !card.snapshot.activeOnPage)
        ? []
        : card.capabilityId !== 'danmaku-compression'
          ? definition.commands
          : card.snapshot.temporaryMode === 'original-danmaku'
            ? [
                {
                  id: 'reload',
                  label: t('cm_actions_label_67'),
                  description: t('cm_actions_description_68'),
                },
              ]
            : definition.commands;
    return colorizeCentralActions([
      ...commands.map((command) => ({
        id: `capability:${command.id}`,
        kind: 'capability-command' as const,
        label: command.label,
        description: command.description,
        command: command.id,
      })),
      {
        id: 'manage',
        kind: 'manage',
        label: t('cm_actions_label_69'),
        description: t('cm_actions_description_70'),
      },
      {
        id: 'toggle',
        kind: 'toggle',
        label: card.snapshot.enabled
          ? t('cm_actions_text_71')
          : t('cm_actions_text_72'),
        description: card.snapshot.enabled
          ? t('cm_actions_text_73')
          : t('cm_actions_text_74'),
      },
    ]);
  }

  return colorizeCentralActions([
    {
      id: 'remove',
      kind: 'remove',
      label: t('cm_actions_label_75'),
      description: t('cm_actions_description_76'),
    },
    {
      id: 'manage',
      kind: 'manage',
      label: t('cm_actions_label_77'),
      description: t('cm_actions_description_78'),
    },
    ...commandActions(card),
    {
      id: 'toggle',
      kind: 'toggle',
      label: card.manager.enabled
        ? t('cm_actions_text_79')
        : t('cm_actions_text_80'),
      description: card.manager.enabled
        ? t('cm_actions_text_81')
        : t('cm_actions_text_82'),
    },
  ]);
}
