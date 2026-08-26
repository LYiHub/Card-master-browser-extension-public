import type { UserscriptExecutionCapability } from '../../userscript/runtime/capabilities';
import {
  type ExtensionApi,
  type ExtensionBackgroundApi,
  extensionUserscriptApi,
  sendExtensionRequest,
} from './api';
import { extensionTarget } from './platform';
import { EXTENSION_CHANNEL } from './protocol';

const FIREFOX_USER_SCRIPTS_PERMISSION = {
  permissions: ['userScripts'],
} satisfies chrome.permissions.Permissions;

export async function userscriptExecutionCapability(
  api: ExtensionBackgroundApi,
): Promise<UserscriptExecutionCapability> {
  if (extensionUserscriptApi(api)) return { status: 'available' };
  switch (extensionTarget()) {
    case 'firefox': {
      const permissionGranted = await api.permissions
        ?.contains(FIREFOX_USER_SCRIPTS_PERMISSION)
        .catch(() => false);
      if (permissionGranted) {
        return {
          status: 'unavailable',
          message:
            'Firefox 已授予用户脚本权限，但执行 API 尚未就绪。请重新加载扩展。',
        };
      }
      return {
        status: 'permission-required',
        message: 'Firefox 需要先授权用户脚本执行权限。',
      };
    }
    case 'safari':
      return { status: 'available' };
    case 'chromium':
      return {
        status: 'browser-setting-required',
        message:
          '请在扩展详情页开启“允许运行用户脚本”，然后重新加载扩展。Chrome 默认关闭这项开关。',
      };
  }
}

export function readUserscriptExecutionCapability(api: ExtensionApi) {
  return sendExtensionRequest<UserscriptExecutionCapability>(api, {
    channel: EXTENSION_CHANNEL,
    type: 'userscript-capability-read',
  });
}

export async function requestUserscriptExecutionPermission(api: ExtensionApi) {
  const permissions = api.permissions;
  if (extensionTarget() !== 'firefox' || !permissions?.request) {
    throw new Error('当前浏览器不支持在扩展内申请用户脚本权限。');
  }
  const granted = await permissions.request(FIREFOX_USER_SCRIPTS_PERMISSION);
  if (!granted) {
    throw new Error('Firefox 没有授予用户脚本执行权限。');
  }
  api.runtime.reload();
}
