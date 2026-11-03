import { t } from '../../localization/messages';
import type {
  DataManagementAction,
  DataManagementResult,
  DataManagementStepAction,
  DataManagementStepResult,
} from '../domain/types';

type CompletedDataManagementStepResult = Omit<
  DataManagementStepResult,
  'status'
> & {
  status: 'completed';
};

export type DataManagementOperations = {
  resetPreferences(): Promise<void>;
  removeScripts(): Promise<number>;
  clearScriptValues(): Promise<number>;
  clearAssistantConversations(): Promise<void>;
  clearAssistantConfig(): Promise<void>;
  resetAssistantPins(): Promise<void>;
  resetContentBlocking(): Promise<void>;
  resetPageTheme(): Promise<void>;
  resetMediaSpeed(): Promise<void>;
  resetMediaResources(): Promise<void>;
  resetGamepadControl(): Promise<void>;
  resetBilibiliCapabilities(): Promise<void>;
  clearDiagnostics(): Promise<void>;
};

const RESET_ORDER: readonly DataManagementStepAction[] = [
  'assistant-conversations',
  'scripts',
  'script-values',
  'assistant-config',
  'assistant-pins',
  'content-blocking',
  'page-theme',
  'media-speed',
  'media-resources',
  'gamepad-control',
  'bilibili-capabilities',
  'diagnostics',
  'preferences',
];

const ACTION_MESSAGES: Record<
  Exclude<DataManagementStepAction, 'scripts' | 'script-values'>,
  string
> = {
  get preferences() {
    return t('cm_service_preferences_1');
  },
  get 'assistant-conversations'() {
    return t('cm_service__assistant_conversations__2');
  },
  get 'assistant-config'() {
    return t('cm_service__assistant_config__3');
  },
  get 'assistant-pins'() {
    return t('cm_service__assistant_pins__4');
  },
  get 'content-blocking'() {
    return t('cm_service__content_blocking__5');
  },
  get 'page-theme'() {
    return t('cm_service__page_theme__6');
  },
  get 'media-speed'() {
    return t('cm_service__media_speed__7');
  },
  get 'media-resources'() {
    return t('cm_service__media_resources__8');
  },
  get 'gamepad-control'() {
    return t('cm_service__gamepad_control__9');
  },
  get 'bilibili-capabilities'() {
    return t('cm_service__bilibili_capabilities__10');
  },
  get diagnostics() {
    return t('cm_service_diagnostics_11');
  },
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class DataManagementService {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly operations: DataManagementOperations) {}

  run(action: DataManagementAction) {
    const pending = this.queue.then(() => this.execute(action));
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  private async execute(
    action: DataManagementAction,
  ): Promise<DataManagementResult> {
    if (action !== 'reset-all') {
      return this.executeStep(action);
    }

    const steps: DataManagementStepResult[] = [];
    for (const step of RESET_ORDER) {
      try {
        steps.push(await this.executeStep(step));
      } catch (error) {
        steps.push({
          action: step,
          status: 'failed',
          message: errorMessage(error),
        });
      }
    }
    const failed = steps.filter((step) => step.status === 'failed');
    const scriptsRemoved = steps.find(
      (step) => step.action === 'scripts',
    )?.scriptsRemoved;
    const scriptValuesCleared = steps.find(
      (step) => step.action === 'script-values',
    )?.scriptValuesCleared;
    return {
      action,
      status: failed.length === 0 ? 'completed' : 'partial',
      ...(scriptsRemoved === undefined ? {} : { scriptsRemoved }),
      ...(scriptValuesCleared === undefined ? {} : { scriptValuesCleared }),
      steps,
      message:
        failed.length === 0
          ? t('cm_service_text_12')
          : t('cm_service_text_13', [
              String(failed.length),
              String(failed.map((step) => step.message).join('；')),
            ]),
    };
  }

  private async executeStep(
    action: DataManagementStepAction,
  ): Promise<CompletedDataManagementStepResult> {
    switch (action) {
      case 'preferences':
        await this.operations.resetPreferences();
        return {
          action,
          status: 'completed',
          message: ACTION_MESSAGES[action],
        };
      case 'scripts': {
        const scriptsRemoved = await this.operations.removeScripts();
        return {
          action,
          status: 'completed',
          scriptsRemoved,
          message:
            scriptsRemoved > 0
              ? t('cm_service_text_14', [String(scriptsRemoved)])
              : t('cm_service_text_15'),
        };
      }
      case 'script-values': {
        const scriptValuesCleared = await this.operations.clearScriptValues();
        return {
          action,
          status: 'completed',
          scriptValuesCleared,
          message:
            scriptValuesCleared > 0
              ? t('cm_service_text_16', [String(scriptValuesCleared)])
              : t('cm_service_text_17'),
        };
      }
      case 'assistant-conversations':
        await this.operations.clearAssistantConversations();
        return {
          action,
          status: 'completed',
          message: ACTION_MESSAGES[action],
        };
      case 'assistant-config':
        await this.operations.clearAssistantConfig();
        return {
          action,
          status: 'completed',
          message: ACTION_MESSAGES[action],
        };
      case 'assistant-pins':
        await this.operations.resetAssistantPins();
        return {
          action,
          status: 'completed',
          message: ACTION_MESSAGES[action],
        };
      case 'content-blocking':
        await this.operations.resetContentBlocking();
        return {
          action,
          status: 'completed',
          message: ACTION_MESSAGES[action],
        };
      case 'page-theme':
        await this.operations.resetPageTheme();
        return {
          action,
          status: 'completed',
          message: ACTION_MESSAGES[action],
        };
      case 'media-speed':
        await this.operations.resetMediaSpeed();
        return {
          action,
          status: 'completed',
          message: ACTION_MESSAGES[action],
        };
      case 'media-resources':
        await this.operations.resetMediaResources();
        return {
          action,
          status: 'completed',
          message: ACTION_MESSAGES[action],
        };
      case 'gamepad-control':
        await this.operations.resetGamepadControl();
        return {
          action,
          status: 'completed',
          message: ACTION_MESSAGES[action],
        };
      case 'bilibili-capabilities':
        await this.operations.resetBilibiliCapabilities();
        return {
          action,
          status: 'completed',
          message: ACTION_MESSAGES[action],
        };
      case 'diagnostics':
        await this.operations.clearDiagnostics();
        return {
          action,
          status: 'completed',
          message: ACTION_MESSAGES[action],
        };
    }
  }
}
