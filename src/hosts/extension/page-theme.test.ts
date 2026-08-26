import { describe, expect, it, vi } from 'vitest';

import {
  defaultPageThemeSettings,
  type PageThemeSnapshot,
  startingPageThemeSnapshot,
} from '../../page-theme/domain/types';
import type { ExtensionMessageListener } from './api';
import { ExtensionPageThemeController } from './page-theme';
import {
  PAGE_THEME_SNAPSHOT_DATASET,
  PAGE_THEME_SNAPSHOT_EVENT,
  PAGE_THEME_TRANSITION_REQUEST_EVENT,
} from './page-theme-protocol';

function messageEvent() {
  return {
    addListener: vi.fn((_listener: ExtensionMessageListener) => undefined),
    removeListener: vi.fn(),
  };
}

function pageDocument(url: string) {
  const events = new EventTarget();
  return {
    location: { href: url },
    documentElement: { dataset: {} as DOMStringMap },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  } as unknown as Document;
}

describe('ExtensionPageThemeController', () => {
  it('requests the visual transition before toggling the current site', async () => {
    const document = pageDocument('https://example.com/');
    const settings = {
      ...defaultPageThemeSettings(),
      revision: 1,
      disabledFor: ['example.com'],
    };
    const snapshot: PageThemeSnapshot = {
      revision: 1,
      status: 'ready',
      enabled: true,
      activeOnPage: false,
      inactiveReason: 'site-disabled',
      currentHost: 'example.com',
      engine: 'dynamicTheme',
      darkThemeDetected: false,
    };
    const order: string[] = [];
    document.addEventListener(PAGE_THEME_TRANSITION_REQUEST_EVENT, () => {
      order.push('transition');
    });
    const api = {
      runtime: {
        onMessage: messageEvent(),
        sendMessage: vi.fn(async () => {
          order.push('request');
          document.documentElement.dataset[PAGE_THEME_SNAPSHOT_DATASET] =
            JSON.stringify(snapshot);
          return { settings };
        }),
      },
    };
    const controller = new ExtensionPageThemeController(api as never, document);

    await controller.toggleCurrentSite();

    expect(order).toEqual(['transition', 'request']);
    controller.dispose();
  });

  it('waits for a terminal runtime snapshot instead of treating starting as success', async () => {
    const document = pageDocument('https://example.com/');
    const settings = {
      ...defaultPageThemeSettings(),
      revision: 1,
    };
    const api = {
      runtime: {
        onMessage: messageEvent(),
        sendMessage: vi.fn(async () => ({ settings })),
      },
    };
    const controller = new ExtensionPageThemeController(api as never, document);
    let settled = false;
    const operation = controller.setEnabled(true).then((snapshot) => {
      settled = true;
      return snapshot;
    });
    await Promise.resolve();

    document.dispatchEvent(
      new CustomEvent(PAGE_THEME_SNAPSHOT_EVENT, {
        detail: {
          ...startingPageThemeSnapshot('https://example.com/'),
          revision: 1,
          activeOnPage: true,
        },
      }),
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    const ready = {
      ...startingPageThemeSnapshot('https://example.com/'),
      revision: 1,
      status: 'ready' as const,
      activeOnPage: true,
    };
    document.dispatchEvent(
      new CustomEvent(PAGE_THEME_SNAPSHOT_EVENT, { detail: ready }),
    );
    await expect(operation).resolves.toEqual(ready);
    controller.dispose();
  });
});
