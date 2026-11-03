import { t } from '../../localization/messages';
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
          message: t('cm_userscript_permission_message_1'),
        };
      }
      return {
        status: 'permission-required',
        message: t('cm_userscript_permission_message_2'),
      };
    }
    case 'safari':
      return { status: 'available' };
    case 'chromium':
      return {
        status: 'browser-setting-required',
        message: t('cm_userscript_permission_message_3'),
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
    throw new Error(t('cm_userscript_permission_error_4'));
  }
  const granted = await permissions.request(FIREFOX_USER_SCRIPTS_PERMISSION);
  if (!granted) {
    throw new Error(t('cm_userscript_permission_error_5'));
  }
  api.runtime.reload();
}
