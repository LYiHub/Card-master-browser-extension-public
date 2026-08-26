import { describe, expect, it, vi } from 'vitest';

import { defaultGamepadControlSettings } from '../../gamepad-control/domain/settings';
import { mountGamepadPageLoader } from './gamepad-content';

vi.mock('./diagnostics', () => ({
  installExtensionContextBoundary: () => () => undefined,
  onExtensionContextInvalidated: () => () => undefined,
  registerExtensionListener: () => () => undefined,
  reportExtensionFailure: vi.fn(),
}));

vi.mock('./page-runtime-ownership', () => ({
  claimPageRuntime: () => ({ release: () => undefined }),
}));

function extensionApi(
  enabled: boolean,
): Parameters<typeof mountGamepadPageLoader>[0] {
  return {
    runtime: {
      id: 'test',
      lastError: undefined,
      getURL: (path: string) => path,
      connect: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      sendMessage: vi.fn((_message, callback?: (response: unknown) => void) => {
        callback?.({ ...defaultGamepadControlSettings(), enabled });
      }),
    },
  } as never;
}

describe('gamepad page loader', () => {
  it('loads and tears down the page runtime with the enabled flag', async () => {
    const dispose = vi.fn();
    const mountGamepadControl = vi.fn(() => ({ dispose }));
    const loadRuntime = vi.fn(async () => ({ mountGamepadControl }));
    const loader = mountGamepadPageLoader(extensionApi(false), loadRuntime);

    await loader.apply({ ...defaultGamepadControlSettings(), enabled: false });
    expect(loadRuntime).not.toHaveBeenCalled();

    await loader.apply({ ...defaultGamepadControlSettings(), enabled: true });
    expect(mountGamepadControl).toHaveBeenCalledOnce();

    await loader.apply({ ...defaultGamepadControlSettings(), enabled: false });
    expect(dispose).toHaveBeenCalledOnce();
    loader.dispose();
  });
});
