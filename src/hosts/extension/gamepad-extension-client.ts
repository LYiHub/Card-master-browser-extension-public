export type GamepadExtensionApi = {
  runtime: Pick<
    typeof chrome.runtime,
    'connect' | 'getURL' | 'id' | 'lastError' | 'onMessage' | 'sendMessage'
  >;
};

export function gamepadExtensionApiOrNull(): GamepadExtensionApi | null {
  const globals = globalThis as typeof globalThis & {
    browser?: typeof chrome;
    chrome?: typeof chrome;
  };
  const runtime = (globals.browser ?? globals.chrome)?.runtime;
  return runtime?.id &&
    typeof runtime.getURL === 'function' &&
    typeof runtime.connect === 'function' &&
    typeof runtime.sendMessage === 'function' &&
    typeof runtime.onMessage?.addListener === 'function' &&
    typeof runtime.onMessage?.removeListener === 'function'
    ? { runtime }
    : null;
}

export function sendGamepadExtensionMessage<Response>(
  api: GamepadExtensionApi,
  message: Readonly<Record<string, unknown>>,
) {
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const settle = (
      callback: (value: Response | PromiseLike<Response>) => void,
      value: unknown,
    ) => {
      if (settled) return;
      settled = true;
      callback(value as Response);
    };
    const handleResponse = (response: unknown) => {
      const lastError = api.runtime.lastError;
      if (lastError) {
        settle(reject, lastError);
        return;
      }
      settle(resolve, response);
    };

    try {
      const sendMessage = api.runtime.sendMessage as unknown as (
        request: unknown,
        callback?: (response: unknown) => void,
      ) => undefined | Promise<unknown>;
      const pending = Reflect.has(api.runtime, 'lastError')
        ? sendMessage.call(api.runtime, message, handleResponse)
        : sendMessage.call(api.runtime, message);
      if (pending && typeof pending.then === 'function') {
        void pending.then(
          (response) => settle(resolve, response),
          (error) => settle(reject, error),
        );
      } else if (!Reflect.has(api.runtime, 'lastError')) {
        settle(resolve, pending);
      }
    } catch (error) {
      settle(reject, error);
    }
  });
}
