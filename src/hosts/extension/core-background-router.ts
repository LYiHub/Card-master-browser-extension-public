import type { AudioSettings } from '../../audio/AudioDirector';
import type { DataManagementService } from '../../data-management/application/service';
import type {
  UserscriptSettings,
  UserscriptSettingsInput,
} from '../../userscript/application/settings';
import type { GamepadBrowserCommandService } from './gamepad-browser-command';
import type { ExtensionGamepadControlService } from './gamepad-control-service';
import type { ExtensionRequest } from './protocol';
import { fetchExtensionText } from './source-fetch';

export const CORE_MESSAGE_UNHANDLED = Symbol('core-message-unhandled');

type CoreBackgroundRouterDependencies = {
  gamepadCommands: GamepadBrowserCommandService;
  gamepad: ExtensionGamepadControlService;
  readUserscriptSettings: () => Promise<UserscriptSettings>;
  writeUserscriptSettings: (
    settings: UserscriptSettingsInput,
  ) => Promise<UserscriptSettings>;
  readAudioSettings: () => Promise<AudioSettings>;
  writeAudioSettings: (settings: AudioSettings) => Promise<AudioSettings>;
  dataManagement: DataManagementService;
};

export async function routeCoreBackgroundMessage(
  message: ExtensionRequest,
  sender: chrome.runtime.MessageSender,
  dependencies: CoreBackgroundRouterDependencies,
): Promise<unknown | typeof CORE_MESSAGE_UNHANDLED> {
  switch (message.type) {
    case 'fetch-update': {
      const response = await fetchExtensionText(message.url);
      return {
        ok: response.ok,
        status: response.status,
        body: response.body,
      };
    }
    case 'gamepad-browser-command':
      return dependencies.gamepadCommands.execute(message.command, sender);
    case 'gamepad-control-settings-read':
      return dependencies.gamepad.readSettings();
    case 'gamepad-control-settings-save':
      return dependencies.gamepad.save(message.settings);
    case 'gamepad-control-indicator-set':
      return dependencies.gamepad.setControllerIndicatorVisible(
        message.visible,
      );
    case 'userscript-settings-read':
      return { settings: await dependencies.readUserscriptSettings() };
    case 'userscript-settings-write':
      return {
        settings: await dependencies.writeUserscriptSettings(message.settings),
      };
    case 'audio-settings-read':
      return { settings: await dependencies.readAudioSettings() };
    case 'audio-settings-write':
      return {
        settings: await dependencies.writeAudioSettings(message.settings),
      };
    case 'data-management-run':
      return { result: await dependencies.dataManagement.run(message.action) };
    default:
      return CORE_MESSAGE_UNHANDLED;
  }
}
