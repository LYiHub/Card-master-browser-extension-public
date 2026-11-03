import { t } from '../../localization/messages';
import type { InstalledUserscript } from '../../userscript/domain/types';
import type { CardStateTone } from '../manager-interaction/CardStateBadge';

export type UserscriptStateNotice = {
  title: string;
  description: string;
  tone: 'neutral' | 'inactive' | 'error';
};

export type UserscriptStatePresentation = {
  badge: {
    label: string;
    tone: CardStateTone;
  };
  notice: UserscriptStateNotice;
};

export function userscriptStatePresentation(
  item: InstalledUserscript,
  executionUnavailable = false,
): UserscriptStatePresentation {
  if (item.manager.enabled && executionUnavailable) {
    return {
      badge: {
        label: t('cm_userscript_state_presentation_label_1'),
        tone: 'error',
      },
      notice: {
        title: t('cm_userscript_state_presentation_title_2'),
        description: t('cm_userscript_state_presentation_description_3'),
        tone: 'error',
      },
    };
  }
  if (!item.manager.enabled) {
    return item.runtime.pendingRefresh
      ? {
          badge: {
            label: t('cm_userscript_state_presentation_label_4'),
            tone: 'pending',
          },
          notice: {
            title: t('cm_userscript_state_presentation_title_5'),
            description: t('cm_userscript_state_presentation_description_6'),
            tone: 'inactive',
          },
        }
      : {
          badge: {
            label: t('cm_userscript_state_presentation_label_7'),
            tone: 'inactive',
          },
          notice: {
            title: t('cm_userscript_state_presentation_title_8'),
            description: t('cm_userscript_state_presentation_description_9'),
            tone: 'inactive',
          },
        };
  }
  if (item.runtime.pendingRefresh) {
    if (!item.runtime.instanceId) {
      return {
        badge: {
          label: t('cm_userscript_state_presentation_label_10'),
          tone: 'pending',
        },
        notice: {
          title: t('cm_userscript_state_presentation_title_11'),
          description: t('cm_userscript_state_presentation_description_12'),
          tone: 'neutral',
        },
      };
    }
    return {
      badge: {
        label: t('cm_userscript_state_presentation_label_13'),
        tone: 'pending',
      },
      notice: {
        title: t('cm_userscript_state_presentation_title_14'),
        description: t('cm_userscript_state_presentation_description_15'),
        tone: 'neutral',
      },
    };
  }
  if (item.runtime.status === 'error') {
    return {
      badge: {
        label: t('cm_userscript_state_presentation_label_16'),
        tone: 'error',
      },
      notice: {
        title: t('cm_userscript_state_presentation_title_17'),
        description:
          item.runtime.error ?? t('cm_userscript_state_presentation_text_18'),
        tone: 'error',
      },
    };
  }
  if (item.runtime.status === 'not-matched') {
    return {
      badge: {
        label: t('cm_userscript_state_presentation_label_19'),
        tone: 'inactive',
      },
      notice: {
        title: t('cm_userscript_state_presentation_title_20'),
        description: t('cm_userscript_state_presentation_description_21'),
        tone: 'neutral',
      },
    };
  }
  if (item.runtime.status === 'running') {
    return {
      badge: {
        label: t('cm_userscript_state_presentation_label_22'),
        tone: 'pending',
      },
      notice: {
        title: t('cm_userscript_state_presentation_title_23'),
        description: t('cm_userscript_state_presentation_description_24'),
        tone: 'neutral',
      },
    };
  }
  if (item.runtime.status === 'ready' && item.runtime.instanceId) {
    return {
      badge: {
        label: t('cm_userscript_state_presentation_label_25'),
        tone: 'active',
      },
      notice: {
        title: t('cm_userscript_state_presentation_title_26'),
        description: t('cm_userscript_state_presentation_description_27'),
        tone: 'neutral',
      },
    };
  }
  return {
    badge: {
      label: t('cm_userscript_state_presentation_label_28'),
      tone: 'pending',
    },
    notice: {
      title: t('cm_userscript_state_presentation_title_29'),
      description: t('cm_userscript_state_presentation_description_30'),
      tone: 'neutral',
    },
  };
}
