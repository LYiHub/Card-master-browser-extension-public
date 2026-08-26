import type { ExtensionBackgroundApi } from './api';
import { extensionDiagnostics } from './diagnostics';
import { monitorExtensionMessageDeliveries } from './extension-message-delivery';
import { injectableExtensionPage } from './page-host-refresh';

const DELIVERY_TIMEOUT_MS = 2_000;

export class BackgroundEventBroadcaster {
  constructor(private readonly api: ExtensionBackgroundApi) {}

  async send(
    message: unknown,
    diagnosticEvent: string,
    failureMessage: string,
  ) {
    const tabs = (await this.api.tabs.query({})).filter(
      injectableExtensionPage,
    );
    monitorExtensionMessageDeliveries(
      [
        this.api.runtime.sendMessage(message),
        ...tabs.flatMap((tab) =>
          typeof tab.id === 'number'
            ? [this.api.tabs.sendMessage(tab.id, message, { frameId: 0 })]
            : [],
        ),
      ],
      DELIVERY_TIMEOUT_MS,
      ({ failed, timedOut }) => {
        if (failed === 0) return;
        extensionDiagnostics.warn(
          'background',
          diagnosticEvent,
          new Error(failureMessage),
          {
            attemptedPageHosts: tabs.length,
            attemptedExtensionBroadcasts: 1,
            failedDeliveries: failed,
            timedOutDeliveries: timedOut,
          },
        );
      },
    );
  }
}
