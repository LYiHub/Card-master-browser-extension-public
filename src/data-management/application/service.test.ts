import { describe, expect, it, vi } from 'vitest';

import {
  type DataManagementOperations,
  DataManagementService,
} from './service';

function operations(
  overrides: Partial<DataManagementOperations> = {},
): DataManagementOperations {
  return {
    resetPreferences: vi.fn(async () => undefined),
    removeScripts: vi.fn(async () => 3),
    clearScriptValues: vi.fn(async () => 2),
    clearAssistantConversations: vi.fn(async () => undefined),
    clearAssistantConfig: vi.fn(async () => undefined),
    resetAssistantPins: vi.fn(async () => undefined),
    resetContentBlocking: vi.fn(async () => undefined),
    resetPageTheme: vi.fn(async () => undefined),
    resetMediaSpeed: vi.fn(async () => undefined),
    resetMediaResources: vi.fn(async () => undefined),
    resetGamepadControl: vi.fn(async () => undefined),
    resetBilibiliCapabilities: vi.fn(async () => undefined),
    clearDiagnostics: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('DataManagementService', () => {
  it('runs a single data domain without touching unrelated state', async () => {
    const actions = operations();
    const service = new DataManagementService(actions);

    await expect(service.run('script-values')).resolves.toEqual({
      action: 'script-values',
      status: 'completed',
      scriptValuesCleared: 2,
      message: '已清除 2 份脚本 GM 数据。',
    });

    expect(actions.clearScriptValues).toHaveBeenCalledOnce();
    expect(actions.removeScripts).not.toHaveBeenCalled();
    expect(actions.resetPreferences).not.toHaveBeenCalled();
  });

  it('restores a fresh installation in a deterministic order', async () => {
    const order: string[] = [];
    const actions = operations({
      clearAssistantConversations: vi.fn(async () => {
        order.push('assistant-conversations');
      }),
      removeScripts: vi.fn(async () => {
        order.push('scripts');
        return 4;
      }),
      clearScriptValues: vi.fn(async () => {
        order.push('script-values');
        return 1;
      }),
      clearAssistantConfig: vi.fn(async () => {
        order.push('assistant-config');
      }),
      resetAssistantPins: vi.fn(async () => {
        order.push('assistant-pins');
      }),
      resetContentBlocking: vi.fn(async () => {
        order.push('content-blocking');
      }),
      resetPageTheme: vi.fn(async () => {
        order.push('page-theme');
      }),
      resetMediaSpeed: vi.fn(async () => {
        order.push('media-speed');
      }),
      resetMediaResources: vi.fn(async () => {
        order.push('media-resources');
      }),
      resetGamepadControl: vi.fn(async () => {
        order.push('gamepad-control');
      }),
      resetBilibiliCapabilities: vi.fn(async () => {
        order.push('bilibili-capabilities');
      }),
      clearDiagnostics: vi.fn(async () => {
        order.push('diagnostics');
      }),
      resetPreferences: vi.fn(async () => {
        order.push('preferences');
      }),
    });
    const service = new DataManagementService(actions);

    await expect(service.run('reset-all')).resolves.toMatchObject({
      action: 'reset-all',
      status: 'completed',
      scriptsRemoved: 4,
      scriptValuesCleared: 1,
      message: '已恢复为全新安装状态。',
    });
    expect(order).toEqual([
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
    ]);
  });

  it('continues independent reset steps and reports partial completion', async () => {
    const actions = operations({
      removeScripts: vi.fn(async () => {
        throw new Error('脚本仓库不可用');
      }),
      resetPageTheme: vi.fn(async () => {
        throw new Error('暗夜设置写入失败');
      }),
    });
    const service = new DataManagementService(actions);

    await expect(service.run('reset-all')).resolves.toMatchObject({
      action: 'reset-all',
      status: 'partial',
      message: expect.stringContaining('有 2 项失败'),
      steps: expect.arrayContaining([
        {
          action: 'scripts',
          status: 'failed',
          message: '脚本仓库不可用',
        },
        {
          action: 'page-theme',
          status: 'failed',
          message: '暗夜设置写入失败',
        },
      ]),
    });
    expect(actions.resetPreferences).toHaveBeenCalledOnce();
    expect(actions.clearDiagnostics).toHaveBeenCalledOnce();
  });
});
