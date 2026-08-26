import { describe, expect, it, vi } from 'vitest';
import { setGamepadButtonBinding } from '../../gamepad-control/domain/bindings';
import {
  defaultGamepadControlSettings,
  GAMEPAD_CONTROL_STORAGE_KEY,
} from '../../gamepad-control/domain/settings';
import { ExtensionGamepadControlService } from './gamepad-control-service';

function serviceApi() {
  const settings = defaultGamepadControlSettings();
  return {
    storage: {
      local: {
        get: vi.fn(
          async (): Promise<Record<string, unknown>> => ({
            [GAMEPAD_CONTROL_STORAGE_KEY]: settings,
          }),
        ),
        remove: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
      },
    },
    tabs: {
      query: vi.fn(async (): Promise<chrome.tabs.Tab[]> => []),
      sendMessage: vi.fn(async () => undefined),
    },
  };
}

describe('ExtensionGamepadControlService', () => {
  it('persists normalized global settings', async () => {
    const api = serviceApi();
    const service = new ExtensionGamepadControlService(api as never);
    const defaults = defaultGamepadControlSettings();
    const settings = await service.save({
      ...defaults,
      bindings: setGamepadButtonBinding(defaults.bindings, 'confirm', 11),
      cursorSpeed: 1_111.4,
    });

    expect(settings).toMatchObject({
      revision: 1,
      cursorSpeed: 1_111,
      bindings: {
        buttons: {
          confirm: 11,
        },
      },
    });
    expect(api.storage.local.set).toHaveBeenCalledOnce();
  });

  it('hides the controller indicator globally', async () => {
    const api = serviceApi();
    const service = new ExtensionGamepadControlService(api as never);

    const hidden = await service.setControllerIndicatorVisible(false);

    expect(hidden).toMatchObject({
      enabled: false,
      showControllerIndicator: false,
    });
  });

  it('replaces non-v1 stored schemas with current defaults', async () => {
    const previous = {
      ...defaultGamepadControlSettings(),
      version: 2,
    };
    const api = serviceApi();
    api.storage.local.get.mockResolvedValue({
      [GAMEPAD_CONTROL_STORAGE_KEY]: previous,
    });
    const service = new ExtensionGamepadControlService(api as never);

    const settings = await service.readSettings();

    expect(settings).toEqual(defaultGamepadControlSettings());
    expect(api.storage.local.set).toHaveBeenCalledWith({
      [GAMEPAD_CONTROL_STORAGE_KEY]: settings,
    });
  });
});
