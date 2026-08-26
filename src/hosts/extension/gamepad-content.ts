import {
  defaultGamepadControlSettings,
  type GamepadControlSettings,
  isGamepadControlSettings,
} from '../../gamepad-control/domain/settings';
import { extensionContentHostUrl } from './content-host-url';
import {
  installExtensionContextBoundary,
  onExtensionContextInvalidated,
  registerExtensionListener,
  reportExtensionFailure,
} from './diagnostics';
import { EXTENSION_CHANNEL } from './extension-channel';
import {
  type GamepadExtensionApi,
  gamepadExtensionApiOrNull,
  sendGamepadExtensionMessage,
} from './gamepad-extension-client';
import { claimPageRuntime } from './page-runtime-ownership';

type GamepadControlRuntimeModule = {
  mountGamepadControl(api: GamepadExtensionApi): { dispose(): void };
};

export function mountGamepadPageLoader(
  api: GamepadExtensionApi,
  loadRuntime: () => Promise<GamepadControlRuntimeModule> = () =>
    import(/* @vite-ignore */ api.runtime.getURL('gamepad-control-content.js')),
) {
  const removeContextBoundary = installExtensionContextBoundary();
  let disposed = false;
  let enabled = false;
  let runtime: { dispose(): void } | null = null;
  let loading: Promise<void> | null = null;
  let removeMessageListener = () => {};
  let removeContextInvalidation = () => {};
  let releaseOwnership = () => {};

  const tearDownRuntime = () => {
    runtime?.dispose();
    runtime = null;
  };

  const apply = async (settings: GamepadControlSettings) => {
    if (disposed) return;
    enabled = settings.enabled;
    if (!enabled) {
      tearDownRuntime();
      return;
    }
    if (runtime || loading) return;
    loading = loadRuntime()
      .then((module) => {
        if (disposed || !enabled || runtime) return;
        runtime = module.mountGamepadControl(api);
      })
      .catch((error) =>
        reportExtensionFailure('gamepad-loader', 'runtime-load-failed', error),
      )
      .finally(() => {
        loading = null;
      });
    await loading;
  };

  const handleMessage = (message: unknown) => {
    if (
      !message ||
      typeof message !== 'object' ||
      Array.isArray(message) ||
      (message as { channel?: unknown }).channel !== EXTENSION_CHANNEL ||
      (message as { type?: unknown }).type !==
        'gamepad-control-settings-changed' ||
      !isGamepadControlSettings((message as { settings?: unknown }).settings)
    ) {
      return;
    }
    void apply((message as { settings: GamepadControlSettings }).settings);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    enabled = false;
    tearDownRuntime();
    removeMessageListener();
    removeContextInvalidation();
    releaseOwnership();
    removeContextBoundary();
  };

  releaseOwnership = claimPageRuntime('gamepad-loader', dispose).release;
  removeMessageListener = registerExtensionListener(
    api.runtime.onMessage,
    handleMessage,
  );
  removeContextInvalidation = onExtensionContextInvalidated(dispose);
  void sendGamepadExtensionMessage<GamepadControlSettings & { error?: string }>(
    api,
    {
      channel: EXTENSION_CHANNEL,
      type: 'gamepad-control-settings-read',
    },
  )
    .then((response) => {
      if (disposed || response.error) return;
      if (isGamepadControlSettings(response)) {
        void apply(response);
        return;
      }
      void apply(defaultGamepadControlSettings());
    })
    .catch((error) =>
      reportExtensionFailure('gamepad-loader', 'settings-read-failed', error),
    );

  return { apply, dispose };
}

const api = gamepadExtensionApiOrNull();
if (api && window.top === window && extensionContentHostUrl(location.href)) {
  mountGamepadPageLoader(api);
}
