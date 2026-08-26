import { describe, expect, it, vi } from 'vitest';

import { startingContentBlockingSnapshot } from '../../content-blocking/domain/types';
import type { ExtensionApi, ExtensionMessageListener } from './api';
import { ExtensionContentBlockingController } from './content-blocking';
import { EXTENSION_CHANNEL } from './protocol';

function extensionApi() {
  const listeners = new Set<ExtensionMessageListener>();
  let currentUserRules = '';
  const snapshot = {
    ...startingContentBlockingSnapshot(),
    status: 'ready' as const,
  };
  const settings = {
    rulesEnabled: true,
    autoUpdateSubscriptions: true,
    builtInFilters: [],
    userRules: '',
    allowlist: [],
    subscriptions: [],
    snapshot,
  };
  const currentSettings = () => ({
    ...settings,
    userRules: currentUserRules,
  });
  const sendMessage = vi.fn(
    async (request: { type: string; userRules?: string; source?: string }) => {
      if (request.type === 'content-blocking-user-rules-read') {
        return { userRules: currentUserRules };
      }
      if (request.type === 'content-blocking-read') {
        return { settings: currentSettings(), snapshot };
      }
      if (request.type === 'content-blocking-set-rules-enabled') {
        return { snapshot: { ...snapshot, rulesEnabled: false } };
      }
      if (request.type === 'content-blocking-user-rules-add') {
        return { snapshot: { ...snapshot, userRuleCount: 2 } };
      }
      if (request.type === 'content-blocking-element-batch-undo') {
        return { snapshot: { ...snapshot, userRuleCount: 0 } };
      }
      if (request.type === 'content-blocking-configuration-export') {
        return { source: '{"kind":"card-master-content-blocking"}' };
      }
      if (
        request.type === 'content-blocking-general-save' ||
        request.type === 'content-blocking-current-site-set' ||
        request.type === 'content-blocking-configuration-import' ||
        request.type === 'content-blocking-static-filter-toggle' ||
        request.type === 'content-blocking-subscriptions-add' ||
        request.type === 'content-blocking-subscriptions-auto-update'
      ) {
        return { settings: currentSettings() };
      }
      if (request.type === 'content-blocking-user-rules-replace') {
        currentUserRules = request.userRules ?? '';
        return { settings: currentSettings() };
      }
      return { ok: true };
    },
  );
  const api = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (listener: ExtensionMessageListener) =>
          listeners.add(listener),
        removeListener: (listener: ExtensionMessageListener) =>
          listeners.delete(listener),
      },
    },
  } as unknown as ExtensionApi;
  return {
    api,
    listeners,
    sendMessage,
    settings,
    snapshot,
    setUserRules: (userRules: string) => {
      currentUserRules = userRules;
    },
  };
}

describe('extension content blocking adapters', () => {
  it('caches the lightweight user-rules read and refreshes it after broadcasts', async () => {
    const { api, listeners, sendMessage, setUserRules } = extensionApi();
    const controller = new ExtensionContentBlockingController(api);

    expect(controller.getCachedUserRules()).toBeNull();
    await expect(controller.readUserRules()).resolves.toBe('');
    await expect(controller.readUserRules()).resolves.toBe('');
    expect(
      sendMessage.mock.calls.filter(
        ([request]) => request.type === 'content-blocking-user-rules-read',
      ),
    ).toHaveLength(1);

    const received = vi.fn();
    const unsubscribe = controller.subscribeUserRules(received);
    setUserRules('example.com##.updated');
    for (const listener of listeners) {
      listener(
        {
          channel: EXTENSION_CHANNEL,
          type: 'content-blocking-user-rules-changed',
        },
        {},
        vi.fn(),
      );
    }

    await vi.waitFor(() =>
      expect(received).toHaveBeenCalledWith('example.com##.updated'),
    );
    expect(controller.getCachedUserRules()).toBe('example.com##.updated');
    unsubscribe();
  });

  it('routes controller commands and live snapshots through the extension channel', async () => {
    const { api, listeners, sendMessage, snapshot } = extensionApi();
    const controller = new ExtensionContentBlockingController(api);
    const received = vi.fn();
    const unsubscribe = controller.subscribe(received);

    vi.useFakeTimers();
    try {
      await expect(controller.read()).resolves.toEqual(snapshot);
      await expect(controller.setRulesEnabled(false)).resolves.toMatchObject({
        rulesEnabled: false,
      });
      const firstRule = controller.addUserRule('example.com##.ad', {
        sessionId: 'session-1',
        startedAt: 1,
      });
      const secondRule = controller.addUserRule('example.com##.sponsor', {
        sessionId: 'session-1',
        startedAt: 1,
      });
      await vi.advanceTimersByTimeAsync(24);
      await expect(firstRule).resolves.toMatchObject({ userRuleCount: 2 });
      await expect(secondRule).resolves.toMatchObject({ userRuleCount: 2 });
      expect(controller.getCachedSettings()).toEqual(
        expect.objectContaining({
          snapshot: expect.objectContaining({ userRuleCount: 2 }),
        }),
      );
      await expect(controller.readSettings()).resolves.toEqual(
        expect.objectContaining({
          snapshot: expect.objectContaining({ userRuleCount: 2 }),
        }),
      );

      for (const listener of listeners) {
        listener(
          {
            channel: EXTENSION_CHANNEL,
            type: 'content-blocking-changed',
            snapshot,
          },
          {},
          vi.fn(),
        );
      }

      expect(received).toHaveBeenCalledWith(snapshot);
      expect(sendMessage.mock.calls.map(([request]) => request.type)).toEqual([
        'content-blocking-read',
        'content-blocking-set-rules-enabled',
        'content-blocking-user-rules-add',
      ]);
      expect(sendMessage.mock.calls[2]?.[0]).toMatchObject({
        rules: ['example.com##.ad', 'example.com##.sponsor'],
        session: { sessionId: 'session-1', startedAt: 1 },
      });
    } finally {
      unsubscribe();
      vi.useRealTimers();
    }
    expect(listeners.size).toBe(0);
  });

  it('uses the settings protocol for persisted rule changes', async () => {
    const { api, sendMessage, settings } = extensionApi();
    const client = new ExtensionContentBlockingController(api);

    await expect(
      client.saveGeneralSettings({
        rulesEnabled: true,
        allowlist: ['example.org'],
      }),
    ).resolves.toEqual(settings);

    expect(sendMessage).toHaveBeenCalledWith({
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-general-save',
      settings: {
        rulesEnabled: true,
        allowlist: ['example.org'],
      },
    });

    await client.replaceUserRules('example.com##.ad');
    await client.undoLastElementBlockingBatch();
    await client.setCurrentSiteFiltering('https://example.org/', false);
    await client.setBuiltInFilterEnabled(4, true);
    await client.addSubscriptions(['https://filters.example/list.txt']);
    await client.setSubscriptionAutoUpdate(false);
    await expect(client.exportConfiguration()).resolves.toContain(
      'card-master-content-blocking',
    );
    await client.importConfiguration('{"kind":"card-master-content-blocking"}');

    expect(sendMessage).toHaveBeenCalledWith({
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-user-rules-replace',
      userRules: 'example.com##.ad',
    });
    expect(sendMessage).toHaveBeenCalledWith({
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-element-batch-undo',
    });
    expect(sendMessage).toHaveBeenCalledWith({
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-current-site-set',
      pageUrl: 'https://example.org/',
      enabled: false,
    });
    expect(sendMessage).toHaveBeenCalledWith({
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-static-filter-toggle',
      filterId: 4,
      enabled: true,
    });
    expect(sendMessage).toHaveBeenCalledWith({
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-subscriptions-add',
      urls: ['https://filters.example/list.txt'],
    });
    expect(sendMessage).toHaveBeenCalledWith({
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-subscriptions-auto-update',
      enabled: false,
    });
    expect(sendMessage).toHaveBeenCalledWith({
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-configuration-export',
    });
    expect(sendMessage).toHaveBeenCalledWith({
      channel: EXTENSION_CHANNEL,
      type: 'content-blocking-configuration-import',
      source: '{"kind":"card-master-content-blocking"}',
    });
  });

  it('writes one structured page diagnostic for a repeated engine failure', () => {
    const { api, listeners } = extensionApi();
    const controller = new ExtensionContentBlockingController(api);
    const write = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const snapshot = {
      ...startingContentBlockingSnapshot(),
      status: 'error' as const,
      errors: ['DNR configuration failed.'],
    };
    const unsubscribe = controller.subscribe(vi.fn());

    for (let index = 0; index < 2; index += 1) {
      for (const listener of listeners) {
        listener(
          {
            channel: EXTENSION_CHANNEL,
            type: 'content-blocking-changed',
            snapshot,
          },
          {},
          vi.fn(),
        );
      }
    }

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      '[Card Master][content-blocking] snapshot-event：DNR configuration failed.',
      expect.objectContaining({
        details: expect.objectContaining({
          status: 'error',
          diagnostics: ['DNR configuration failed.'],
        }),
      }),
    );
    unsubscribe();
    write.mockRestore();
  });
});
