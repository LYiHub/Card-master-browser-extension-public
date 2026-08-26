import type {
  UserscriptSettings,
  UserscriptSettingsController,
  UserscriptSettingsInput,
} from '../../userscript/application/settings';
import { normalizeUserscriptSettings } from '../../userscript/application/settings';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

type UserscriptSettingsResponse = {
  settings?: UserscriptSettings;
  error?: string;
};

function settingsResponse(response: UserscriptSettingsResponse) {
  if (response.error) throw new Error(response.error);
  if (!response.settings) {
    throw new Error('扩展没有返回有效的脚本设置。');
  }
  return normalizeUserscriptSettings(response.settings);
}

export class ExtensionUserscriptSettingsController
  implements UserscriptSettingsController
{
  constructor(private readonly api: ExtensionApi) {}

  async read() {
    return settingsResponse(
      await sendExtensionRequest<UserscriptSettingsResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'userscript-settings-read',
      }),
    );
  }

  async write(settings: UserscriptSettingsInput) {
    return settingsResponse(
      await sendExtensionRequest<UserscriptSettingsResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'userscript-settings-write',
        settings,
      }),
    );
  }
}
