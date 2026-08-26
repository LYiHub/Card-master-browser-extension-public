import { describe, expect, it, vi } from 'vitest';

import type { ExtensionBackgroundApi } from './api';
import { GamepadBrowserCommandService } from './gamepad-browser-command';

function harness(now = vi.fn(() => 1_000)) {
  const tabs = {
    create: vi.fn().mockResolvedValue({}),
    get: vi.fn(),
    goBack: vi.fn().mockResolvedValue(undefined),
    goForward: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([
      { id: 16, index: 0, windowId: 4 },
      { id: 17, index: 1, windowId: 4 },
      { id: 18, index: 2, windowId: 4 },
    ]),
    reload: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue({}),
  };
  const service = new GamepadBrowserCommandService(
    { tabs } as unknown as ExtensionBackgroundApi,
    {
      readSettings: vi.fn(async () => ({ enabled: true })),
    } as never,
    now,
  );
  const sender = {
    tab: {
      id: 17,
      index: 1,
      windowId: 4,
      url: 'https://example.com/',
    },
  } as chrome.runtime.MessageSender;
  return { tabs, service, sender };
}

describe('gamepad browser commands', () => {
  it('executes navigation in the sender tab', async () => {
    const { service, sender, tabs } = harness();

    await expect(service.execute('back', sender)).resolves.toEqual({
      ok: true,
      outcome: 'handled',
    });
    expect(tabs.goBack).toHaveBeenCalledWith(17);
  });

  it('lets the page history handle unsupported browser navigation', async () => {
    const tabs = {
      create: vi.fn(),
      reload: vi.fn(),
    };
    const service = new GamepadBrowserCommandService(
      { tabs } as unknown as ExtensionBackgroundApi,
      {
        readSettings: vi.fn(async () => ({ enabled: true })),
      } as never,
    );

    await expect(
      service.execute('forward', {
        tab: { id: 3, url: 'https://example.com/' },
      } as chrome.runtime.MessageSender),
    ).resolves.toEqual({ ok: true, outcome: 'unsupported' });
  });

  it('switches to the adjacent browser tab in either direction', async () => {
    const previous = harness();
    await expect(
      previous.service.execute('previous-tab', previous.sender),
    ).resolves.toEqual({
      ok: true,
      outcome: 'handled',
    });
    expect(previous.tabs.update).toHaveBeenCalledWith(16, { active: true });

    const next = harness();
    await expect(
      next.service.execute('next-tab', next.sender),
    ).resolves.toEqual({
      ok: true,
      outcome: 'handled',
    });
    expect(next.tabs.update).toHaveBeenCalledWith(18, { active: true });
  });

  it('wraps browser tab navigation at the window edges', async () => {
    const { service, tabs } = harness();

    await service.execute('previous-tab', {
      tab: {
        id: 16,
        index: 0,
        windowId: 4,
        url: 'https://example.com/',
      },
    } as chrome.runtime.MessageSender);

    expect(tabs.update).toHaveBeenCalledWith(18, { active: true });
  });

  it('suppresses command bounce within the cooldown window', async () => {
    const now = vi.fn(() => 1_000);
    const { service, sender, tabs } = harness(now);

    await service.execute('reload', sender);
    await service.execute('new-tab', sender);

    expect(tabs.reload).toHaveBeenCalledOnce();
    expect(tabs.create).not.toHaveBeenCalled();
  });

  it('denies commands when global control is disabled', async () => {
    const tabs = {
      create: vi.fn(),
      reload: vi.fn(),
    };
    const service = new GamepadBrowserCommandService(
      { tabs } as unknown as ExtensionBackgroundApi,
      {
        readSettings: vi.fn(async () => ({ enabled: false })),
      } as never,
    );

    await expect(
      service.execute('reload', {
        tab: { id: 9, url: 'https://example.com/' },
      } as chrome.runtime.MessageSender),
    ).resolves.toEqual({ ok: true, outcome: 'denied' });
    expect(tabs.reload).not.toHaveBeenCalled();
  });
});
