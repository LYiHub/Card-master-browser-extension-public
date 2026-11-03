import { isExtensionPageLifecycleInterrupted } from '../../lib/extension-errors';
import { t } from '../../localization/messages';

export type ExtensionMessageDeliveryReport = {
  attempted: number;
  failed: number;
  interrupted: number;
  timedOut: number;
};

class ExtensionMessageDeliveryTimeoutError extends Error {}

function withTimeout(delivery: Promise<unknown>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new ExtensionMessageDeliveryTimeoutError(
            t('cm_extension_message_delivery_text_1'),
          ),
        ),
      timeoutMs,
    );
  });
  return Promise.race([delivery, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function settleExtensionMessageDeliveries(
  deliveries: readonly Promise<unknown>[],
  timeoutMs: number,
) {
  const results = await Promise.allSettled(
    deliveries.map((delivery) => withTimeout(delivery, timeoutMs)),
  );
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  const interrupted = rejected.filter(
    (result) =>
      !(result.reason instanceof ExtensionMessageDeliveryTimeoutError) &&
      isExtensionPageLifecycleInterrupted(result.reason),
  );
  const failed = rejected.filter((result) => !interrupted.includes(result));
  return {
    attempted: results.length,
    failed: failed.length,
    interrupted: interrupted.length,
    timedOut: failed.filter(
      (result) => result.reason instanceof ExtensionMessageDeliveryTimeoutError,
    ).length,
  } satisfies ExtensionMessageDeliveryReport;
}

export function monitorExtensionMessageDeliveries(
  deliveries: readonly Promise<unknown>[],
  timeoutMs: number,
  onComplete: (report: ExtensionMessageDeliveryReport) => void,
) {
  void settleExtensionMessageDeliveries(deliveries, timeoutMs).then(onComplete);
}
