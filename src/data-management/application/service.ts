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
  preferences: '已恢复界面、牌阵入口、脚本运行和声音偏好。',
  'assistant-conversations': '已清空所有智能体会话，并创建一个新的空白会话。',
  'assistant-config': '已清除智能体、图像生成和语音识别的完整配置。',
  'assistant-pins': '已清除智能体全部会话的置顶状态。',
  'content-blocking': '已恢复内容拦截的默认过滤列表与规则设置。',
  'page-theme': '已恢复暗夜降临的默认设置与站点范围。',
  'media-speed': '已恢复媒体倍速的默认档位、站点范围和轮盘设置。',
  'media-resources': '已清空媒体资源记录并恢复默认发现状态。',
  'gamepad-control': '已恢复手柄控制的默认映射、摇杆职责、控制手感和站点范围。',
  'bilibili-capabilities': '已恢复流量探险家、合成大弹幕与绯红空降的默认状态。',
  diagnostics: '已清除脚本运行时诊断数据。',
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
          ? '已恢复为全新安装状态。'
          : `已完成其余清理，但有 ${failed.length} 项失败：${failed
              .map((step) => step.message)
              .join('；')}`,
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
              ? `已删除 ${scriptsRemoved} 个脚本及其脚本数据。`
              : '当前没有可删除的脚本。',
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
              ? `已清除 ${scriptValuesCleared} 份脚本 GM 数据。`
              : '当前没有可清除的脚本 GM 数据。',
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
