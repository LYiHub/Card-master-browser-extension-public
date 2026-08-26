import { describe, expect, it, vi } from 'vitest';

import { defaultGamepadControlSettings } from '../../gamepad-control/domain/settings';
import type { ExtensionMessageListener } from './api';
import { EXTENSION_CHANNEL } from './extension-channel';
import { ExtensionGamepadControlController } from './gamepad-control-settings';

function messageEvent() {
  let listener: ExtensionMessageListener | null = null;
  return {
    addListener: vi.fn((next: ExtensionMessageListener) => {
      listener = next;
    }),
    removeListener: vi.fn(),
    emit(message: unknown) {
      listener?.(message, {} as chrome.runtime.MessageSender, vi.fn());
    },
  };
}

describe('ExtensionGamepadControlController', () => {
  it('rejects missing and malformed background responses', async () => {
    const runtimeMessages = messageEvent();
    const api = {
      runtime: {
        lastError: undefined,
        onMessage: runtimeMessages,
        sendMessage: vi.fn(
          (_message: unknown, callback: (response: unknown) => void) =>
            callback(undefined),
        ),
      },
    };
    const controller = new ExtensionGamepadControlController(api as never);

    await expect(controller.readSettings()).rejects.toThrow(
      '扩展没有返回有效的手柄控制设置。',
    );
  });

  it('reads persisted settings and follows background broadcasts', async () => {
    const runtimeMessages = messageEvent();
    const settings = {
      ...defaultGamepadControlSettings(),
      revision: 3,
    };
    const api = {
      runtime: {
        lastError: undefined,
        onMessage: runtimeMessages,
        sendMessage: vi.fn((_message, callback) => callback(settings)),
      },
    };
    const controller = new ExtensionGamepadControlController(api as never);
    const listener = vi.fn();
    controller.subscribe(listener);

    await expect(controller.readSettings()).resolves.toEqual(settings);
    runtimeMessages.emit({
      channel: EXTENSION_CHANNEL,
      type: 'gamepad-control-settings-changed',
      settings: {
        ...settings,
        revision: 4,
      },
    });

    expect(listener.mock.lastCall?.[0]).toMatchObject({ revision: 4 });
  });
});
