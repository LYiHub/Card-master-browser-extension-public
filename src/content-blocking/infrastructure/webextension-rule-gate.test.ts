import { describe, expect, it, vi } from 'vitest';

import type { ExtensionBackgroundApi } from '../../hosts/extension/api';
import { INSTALL_REDIRECT_RULE_ID } from '../../hosts/extension/installer';
import { WebExtensionContentBlockingRuleGate } from './webextension-rule-gate';

function event<Listener>() {
  const listeners = new Set<Listener>();
  return {
    addListener: vi.fn((listener: Listener) => listeners.add(listener)),
    removeListener: vi.fn((listener: Listener) => listeners.delete(listener)),
    listeners,
  };
}

type OptionalBrowserCapabilities = {
  getDisabledRuleIds?: typeof chrome.declarativeNetRequest.getDisabledRuleIds;
  getAllFrames?: typeof chrome.webNavigation.getAllFrames;
  handlerBehaviorChanged?: typeof chrome.webRequest.handlerBehaviorChanged;
  updateStaticRules?: typeof chrome.declarativeNetRequest.updateStaticRules;
};

type OwnershipCache = {
  value?: unknown;
};

function harness(
  capabilities: OptionalBrowserCapabilities = {},
  cssContents = new Map<string, string>(),
  ownershipCache: OwnershipCache = {},
) {
  const insertCSS = vi.fn(async () => undefined);
  const removeCSS = vi.fn(async () => undefined);
  const updateDynamicRules = vi.fn(async () => undefined);
  const updateEnabledRulesets = vi.fn(async () => undefined);
  const updateSessionRules = vi.fn(async () => undefined);
  const navigation =
    event<
      (details: chrome.webNavigation.WebNavigationBaseCallbackDetails) => void
    >();
  const tabRemoved = event<(tabId: number) => void>();
  const cssStorage = {
    read: vi.fn(async (contentKey: string) => cssContents.get(contentKey)),
    write: vi.fn(async (contentKey: string, css: string) => {
      cssContents.set(contentKey, css);
    }),
    remove: vi.fn(async (contentKey: string) => {
      cssContents.delete(contentKey);
    }),
    readOwnership: vi.fn(async () => ownershipCache.value),
    writeOwnership: vi.fn(async (ownership: unknown) => {
      ownershipCache.value = structuredClone(ownership);
    }),
  };
  const api = {
    declarativeNetRequest: {
      getDynamicRules: vi.fn(async () => [
        {
          id: 10,
          priority: 1,
          action: {
            type: 'block' as chrome.declarativeNetRequest.RuleActionType,
          },
          condition: { urlFilter: 'ad.example' },
        },
        {
          id: INSTALL_REDIRECT_RULE_ID,
          priority: 100,
          action: {
            type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
            redirect: { url: 'chrome-extension://id/install.html' },
          },
          condition: { urlFilter: '.user.js' },
        },
      ]),
      getEnabledRulesets: vi.fn(async () => ['ruleset_2']),
      getSessionRules: vi.fn(async () => [
        {
          id: 20,
          priority: 1,
          action: {
            type: 'allow' as chrome.declarativeNetRequest.RuleActionType,
          },
          condition: { urlFilter: 'trusted.example' },
        },
        {
          id: 1_700_000_000,
          priority: 1,
          action: {
            type: 'block' as chrome.declarativeNetRequest.RuleActionType,
          },
          condition: { urlFilter: 'userscript.example' },
        },
      ]),
      ...(capabilities.getDisabledRuleIds
        ? { getDisabledRuleIds: capabilities.getDisabledRuleIds }
        : {}),
      updateDynamicRules,
      updateEnabledRulesets,
      updateSessionRules,
      ...(capabilities.updateStaticRules
        ? { updateStaticRules: capabilities.updateStaticRules }
        : {}),
    },
    scripting: {
      executeScript: vi.fn(),
      insertCSS,
      removeCSS,
    },
    tabs: {
      onRemoved: tabRemoved,
      query: vi.fn(),
      sendMessage: vi.fn(),
      update: vi.fn(),
    },
    webNavigation: {
      onBeforeNavigate: navigation,
      ...(capabilities.getAllFrames
        ? { getAllFrames: capabilities.getAllFrames }
        : {}),
    },
    ...(capabilities.handlerBehaviorChanged
      ? {
          webRequest: {
            handlerBehaviorChanged: capabilities.handlerBehaviorChanged,
          },
        }
      : {}),
  } as unknown as ExtensionBackgroundApi;
  const reportError = vi.fn();
  const gate = new WebExtensionContentBlockingRuleGate(api, {
    managedStaticRuleSetIds: ['ruleset_2'],
    cssStorage,
    canOwnDynamicRule: (rule) => rule.id !== INSTALL_REDIRECT_RULE_ID,
    canOwnSessionRule: (rule) => rule.id !== 1_700_000_000,
    reportError,
  });
  return {
    api,
    gate,
    insertCSS,
    removeCSS,
    updateDynamicRules,
    updateEnabledRulesets,
    updateSessionRules,
    reportError,
    cssContents,
    cssStorage,
    ownershipCache,
  };
}

describe('WebExtensionContentBlockingRuleGate', () => {
  it('uses harmless fallbacks for browser APIs Safari does not implement', async () => {
    const test = harness();

    await expect(
      test.gate.getDisabledRuleIds({ rulesetId: 'ruleset_2' }),
    ).resolves.toEqual([]);
    await expect(test.gate.handlerBehaviorChanged()).resolves.toBeUndefined();
    await test.gate.updateStaticRules({
      rulesetId: 'ruleset_2',
      enableRuleIds: [],
    });
    expect(test.reportError).not.toHaveBeenCalled();

    await test.gate.updateStaticRules({
      rulesetId: 'ruleset_2',
      disableRuleIds: [17],
    });
    expect(test.reportError).toHaveBeenCalledWith(
      'static-rule-update-unsupported',
      expect.objectContaining({
        message:
          'The browser cannot enable or disable individual static DNR rules.',
      }),
    );
  });

  it('forwards optional static-rule and cache APIs when the browser provides them', async () => {
    const getDisabledRuleIds = vi.fn(async () => [4, 8]);
    const updateStaticRules = vi.fn(async () => undefined);
    const handlerBehaviorChanged = vi.fn(async () => undefined);
    const test = harness({
      getDisabledRuleIds,
      handlerBehaviorChanged,
      updateStaticRules,
    });

    await expect(
      test.gate.getDisabledRuleIds({ rulesetId: 'ruleset_2' }),
    ).resolves.toEqual([4, 8]);
    await test.gate.updateStaticRules({
      rulesetId: 'ruleset_2',
      enableRuleIds: [4],
    });
    await test.gate.handlerBehaviorChanged();

    expect(getDisabledRuleIds).toHaveBeenCalledWith({
      rulesetId: 'ruleset_2',
    });
    expect(updateStaticRules).toHaveBeenCalledWith({
      rulesetId: 'ruleset_2',
      enableRuleIds: [4],
    });
    expect(handlerBehaviorChanged).toHaveBeenCalledTimes(1);
  });

  it('retries Safari main-frame races and suppresses only transient frame failures', async () => {
    const frame = {
      frameId: 0,
      parentFrameId: -1,
      processId: 1,
      url: 'https://example.com/',
    } as chrome.webNavigation.GetAllFrameResultDetails;
    const recoveredGetAllFrames = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'Invalid call to webNavigation.getAllFrames(). Main frame not found.',
        ),
      )
      .mockResolvedValueOnce([frame]);
    const recovered = harness({
      getAllFrames: recoveredGetAllFrames,
    });

    await expect(recovered.gate.getAllFrames({ tabId: 7 })).resolves.toEqual([
      frame,
    ]);
    expect(recoveredGetAllFrames).toHaveBeenCalledTimes(2);

    const closedTabGetAllFrames = vi.fn(async () => {
      throw new Error('No tab with id: 9');
    });
    const closedTab = harness({
      getAllFrames: closedTabGetAllFrames,
    });
    await expect(closedTab.gate.getAllFrames({ tabId: 9 })).resolves.toBeNull();
    expect(closedTabGetAllFrames).toHaveBeenCalledTimes(1);

    const unexpectedError = new Error('Permission denied');
    const failed = harness({
      getAllFrames: vi.fn(async () => {
        throw unexpectedError;
      }),
    });
    await expect(failed.gate.getAllFrames({ tabId: 11 })).rejects.toBe(
      unexpectedError,
    );
  });

  it('returns no startup frames when Safari still lacks a main frame after retry', async () => {
    const getAllFrames = vi.fn(async () => {
      throw new Error(
        'Invalid call to webNavigation.getAllFrames(). Main frame not found.',
      );
    });
    const test = harness({ getAllFrames });

    await expect(test.gate.getAllFrames({ tabId: 7 })).resolves.toBeNull();
    expect(getAllFrames).toHaveBeenCalledTimes(2);
  });

  it('keeps network filtering but skips invasive page scripts on YouTube', async () => {
    const getAllFrames = vi.fn(async () => [
      {
        frameId: 0,
        parentFrameId: -1,
        processId: 1,
        url: 'https://www.youtube.com/watch?v=video',
      } as chrome.webNavigation.GetAllFrameResultDetails,
    ]);
    const test = harness({ getAllFrames });

    await test.gate.executeScript(7, {
      frameId: 0,
      code: 'window.Promise = new Proxy(window.Promise, {});',
    });

    expect(test.api.scripting.executeScript).not.toHaveBeenCalled();
    expect(test.updateEnabledRulesets).not.toHaveBeenCalled();
  });

  it('parks and restores only content-blocking-owned rules', async () => {
    const test = harness();
    const injection: chrome.scripting.CSSInjection = {
      css: '.ad { display: none!important; }',
      origin: 'USER',
      target: { tabId: 7, frameIds: [0] },
    };
    await test.gate.insertCSS(injection);

    await test.gate.setRulesEnabled(false);

    expect(test.updateEnabledRulesets).toHaveBeenCalledWith({
      disableRulesetIds: ['ruleset_2'],
    });
    expect(test.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [10],
    });
    expect(test.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [20],
    });
    expect(test.removeCSS).toHaveBeenCalledWith(injection);

    await test.gate.setRulesEnabled(true);

    expect(test.updateEnabledRulesets).toHaveBeenLastCalledWith({
      enableRulesetIds: ['ruleset_2'],
    });
    expect(test.updateDynamicRules).toHaveBeenLastCalledWith({
      removeRuleIds: [10],
      addRules: [expect.objectContaining({ id: 10 })],
    });
    expect(test.updateSessionRules).toHaveBeenLastCalledWith({
      removeRuleIds: [20],
      addRules: [expect.objectContaining({ id: 20 })],
    });
    expect(test.insertCSS).toHaveBeenCalledTimes(2);
  });

  it('suppresses AdGuard CSS while rules are paused and restores it later', async () => {
    const test = harness();
    const injection: chrome.scripting.CSSInjection = {
      css: '.sponsor { display: none!important; }',
      origin: 'USER',
      target: { tabId: 9, frameIds: [0] },
    };

    await test.gate.prepare(false);
    await test.gate.insertCSS(injection);

    expect(test.insertCSS).not.toHaveBeenCalled();

    await test.gate.synchronize(true);

    expect(test.insertCSS).toHaveBeenCalledWith(injection);
  });

  it('tracks only rules changed inside a managed engine configuration', async () => {
    const test = harness();
    await test.gate.runManagedConfiguration(async () => {
      await test.gate.updateDynamicRules({
        addRules: [
          {
            id: 31,
            priority: 1,
            action: {
              type: 'block' as chrome.declarativeNetRequest.RuleActionType,
            },
            condition: { urlFilter: 'managed.example' },
          },
        ],
      });
    });
    await test.api.declarativeNetRequest.updateDynamicRules({
      addRules: [
        {
          id: 32,
          priority: 1,
          action: {
            type: 'allow' as chrome.declarativeNetRequest.RuleActionType,
          },
          condition: { urlFilter: 'foreign.example' },
        },
      ],
    });

    test.updateDynamicRules.mockClear();
    test.api.declarativeNetRequest.getDynamicRules = vi.fn(async () => [
      {
        id: 31,
        priority: 1,
        action: {
          type: 'block' as chrome.declarativeNetRequest.RuleActionType,
        },
        condition: { urlFilter: 'managed.example' },
      },
      {
        id: 32,
        priority: 1,
        action: {
          type: 'allow' as chrome.declarativeNetRequest.RuleActionType,
        },
        condition: { urlFilter: 'foreign.example' },
      },
    ]);

    await test.gate.setRulesEnabled(false);

    expect(test.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [31],
    });
  });

  it('persists one ownership snapshot for a managed configuration', async () => {
    const test = harness();
    await test.gate.allocateRevision();
    test.cssStorage.writeOwnership.mockClear();

    const managed = await test.gate.runManagedConfiguration(async () => {
      await test.gate.insertCSS({
        css: '.ad { display: none!important; }',
        origin: 'USER',
        target: { tabId: 7, frameIds: [0] },
      });
      await test.gate.insertCSS({
        css: '.sponsor { display: none!important; }',
        origin: 'USER',
        target: { tabId: 7, frameIds: [0] },
      });
      return 'configured';
    });

    expect(managed.result).toBe('configured');
    expect(managed.revision).toBeGreaterThan(0);
    expect(test.cssStorage.writeOwnership).toHaveBeenCalledTimes(1);
    const persisted = JSON.stringify(test.ownershipCache.value);
    expect(persisted).not.toContain('.ad { display: none!important; }');
    expect(persisted).not.toContain('.sponsor { display: none!important; }');
    expect(test.cssContents.size).toBe(2);
  });

  it('protects foreign rules from AdGuard bulk removal during configuration', async () => {
    const test = harness();

    test.updateDynamicRules.mockClear();
    test.updateSessionRules.mockClear();
    await test.gate.runManagedConfiguration(async () => {
      await test.gate.updateDynamicRules({
        removeRuleIds: [10, INSTALL_REDIRECT_RULE_ID],
      });
      await test.gate.updateSessionRules({
        removeRuleIds: [20, 1_700_000_000],
      });
    });

    expect(test.updateDynamicRules).toHaveBeenCalledWith({
      removeRuleIds: [10],
    });
    expect(test.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [20],
    });
  });

  it('does not claim reserved rules added during a managed configuration', async () => {
    const test = harness();
    await test.gate.runManagedConfiguration(async () => {
      await test.gate.updateSessionRules({
        addRules: [
          {
            id: 1_700_000_000,
            priority: 1,
            action: {
              type: 'block' as chrome.declarativeNetRequest.RuleActionType,
            },
            condition: { urlFilter: 'userscript.example' },
          },
          {
            id: 41,
            priority: 1,
            action: {
              type: 'block' as chrome.declarativeNetRequest.RuleActionType,
            },
            condition: { urlFilter: 'managed.example' },
          },
        ],
      });
    });

    expect(test.updateSessionRules).toHaveBeenCalledWith({
      addRules: [expect.objectContaining({ id: 41 })],
    });
    test.updateSessionRules.mockClear();
    test.api.declarativeNetRequest.getSessionRules = vi.fn(async () => [
      {
        id: 1_700_000_000,
        priority: 1,
        action: {
          type: 'block' as chrome.declarativeNetRequest.RuleActionType,
        },
        condition: { urlFilter: 'userscript.example' },
      },
      {
        id: 41,
        priority: 1,
        action: {
          type: 'block' as chrome.declarativeNetRequest.RuleActionType,
        },
        condition: { urlFilter: 'managed.example' },
      },
    ]);

    await test.gate.setRulesEnabled(false);

    expect(test.updateSessionRules).toHaveBeenCalledWith({
      removeRuleIds: [41],
    });
  });

  it('filters reserved dynamic-rule additions before they reach Chromium', async () => {
    const test = harness();

    await test.gate.runManagedConfiguration(async () => {
      await test.gate.updateDynamicRules({
        addRules: [
          {
            id: INSTALL_REDIRECT_RULE_ID,
            priority: 100,
            action: {
              type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
              redirect: { url: 'chrome-extension://test/install.html' },
            },
            condition: { urlFilter: '.user.js' },
          },
          {
            id: 42,
            priority: 1,
            action: {
              type: 'block' as chrome.declarativeNetRequest.RuleActionType,
            },
            condition: { urlFilter: 'managed.example' },
          },
        ],
      });
    });

    expect(test.updateDynamicRules).toHaveBeenCalledWith({
      addRules: [expect.objectContaining({ id: 42 })],
    });
  });

  it('allocates revisions monotonically across persisted gate instances', async () => {
    const firstGate = harness();
    const first = await firstGate.gate.allocateRevision();
    const secondGate = harness(
      {},
      firstGate.cssContents,
      firstGate.ownershipCache,
    );
    const second = await secondGate.gate.allocateRevision();

    expect(second).toBeGreaterThan(first);
  });

  it('restores cosmetic rule ownership after a background context restart', async () => {
    const first = harness();
    const injection: chrome.scripting.CSSInjection = {
      css: '.persisted-ad { display: none!important; }',
      origin: 'USER',
      target: { tabId: 12, frameIds: [0] },
    };
    await first.gate.insertCSS(injection);

    const restarted = harness({}, first.cssContents, first.ownershipCache);
    await restarted.gate.setRulesEnabled(false);

    expect(restarted.removeCSS).toHaveBeenCalledWith(injection);
  });
});
