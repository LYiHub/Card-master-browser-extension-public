import { describe, expect, it, vi } from 'vitest';

import type { ExtensionBackgroundApi } from './api';
import { ExtensionAssistantTabSession } from './assistant-tab-session';

function tab(
  id: number,
  overrides: Partial<chrome.tabs.Tab> = {},
): chrome.tabs.Tab {
  return {
    id,
    index: id,
    windowId: 1,
    active: id === 7,
    pinned: false,
    highlighted: id === 7,
    incognito: false,
    selected: id === 7,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
    status: 'complete',
    ...overrides,
  } as chrome.tabs.Tab;
}

describe('extension assistant tab session', () => {
  it('lists current tabs and changes the selected target without activating it', async () => {
    const query = vi.fn(async () => [
      tab(7),
      tab(11, { active: false, windowId: 2 }),
    ]);
    const get = vi.fn(async (tabId: number) =>
      tab(tabId, { active: tabId === 7, windowId: tabId === 11 ? 2 : 1 }),
    );
    const update = vi.fn();
    const onSelectedTabChange = vi.fn();
    const session = new ExtensionAssistantTabSession(
      {
        tabs: { get, query, update },
      } as unknown as ExtensionBackgroundApi,
      7,
      vi.fn(),
      onSelectedTabChange,
    );

    await expect(session.listTabs()).resolves.toMatchObject({
      selectedTabId: 7,
      tabs: [
        { id: 7, selected: true },
        { id: 11, selected: false },
      ],
    });
    await expect(session.selectTab(11)).resolves.toMatchObject({
      selected: true,
      tab: { id: 11, selected: true },
    });

    expect(session.selectedId()).toBe(11);
    expect(onSelectedTabChange).toHaveBeenCalledWith(11);
    expect(update).not.toHaveBeenCalled();
  });

  it('activates and focuses a tab without changing the selected target', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(tab(11, { active: false, windowId: 2 }))
      .mockResolvedValueOnce(tab(11, { active: true, windowId: 2 }));
    const update = vi.fn(async () => tab(11, { active: true, windowId: 2 }));
    const updateWindow = vi.fn(async () => ({ id: 2 }));
    const onSelectedTabChange = vi.fn();
    const session = new ExtensionAssistantTabSession(
      {
        tabs: { get, update },
        windows: { update: updateWindow },
      } as unknown as ExtensionBackgroundApi,
      7,
      vi.fn(),
      onSelectedTabChange,
    );

    await expect(session.activateTab(11)).resolves.toMatchObject({
      activated: true,
      selectedTabId: 7,
      tab: { id: 11, selected: false },
    });

    expect(update).toHaveBeenCalledWith(11, { active: true });
    expect(updateWindow).toHaveBeenCalledWith(2, { focused: true });
    expect(onSelectedTabChange).not.toHaveBeenCalled();
  });

  it('clears the selected target after that tab is closed', async () => {
    const remove = vi.fn(async () => undefined);
    const onSelectedTabChange = vi.fn();
    const session = new ExtensionAssistantTabSession(
      {
        tabs: {
          get: vi.fn(async () => tab(7)),
          remove,
        },
      } as unknown as ExtensionBackgroundApi,
      7,
      vi.fn(),
      onSelectedTabChange,
    );

    await expect(session.closeTab(7)).resolves.toMatchObject({
      closed: true,
      selectedTargetClosed: true,
      selectedTabId: null,
    });
    expect(remove).toHaveBeenCalledWith(7);
    expect(onSelectedTabChange).toHaveBeenCalledWith(null);
    expect(() => session.requireSelectedTabId()).toThrow(
      '当前没有选定可操作的页面',
    );
  });

  it('re-resolves the latest document before every page tool', async () => {
    const executeScript = vi
      .fn()
      .mockResolvedValueOnce([{ result: { title: 'First' } }])
      .mockResolvedValueOnce([{ result: { title: 'Second' } }]);
    const resolvePageAttachment = vi
      .fn()
      .mockResolvedValueOnce({
        context: {
          url: 'https://example.com/first',
          title: 'First',
          language: 'en',
          selectedText: '',
          visibleText: 'First',
        },
        target: { tabId: 7, frameId: 0, documentId: 'document-first' },
      })
      .mockResolvedValueOnce({
        context: {
          url: 'https://example.com/second',
          title: 'Second',
          language: 'en',
          selectedText: '',
          visibleText: 'Second',
        },
        target: { tabId: 7, frameId: 0, documentId: 'document-second' },
      });
    const session = new ExtensionAssistantTabSession(
      {
        tabs: { get: vi.fn(async () => tab(7)) },
        scripting: { executeScript },
      } as unknown as ExtensionBackgroundApi,
      7,
      resolvePageAttachment,
    );

    await session.execute('inspect_page', {});
    await session.execute('inspect_page', {});

    expect(resolvePageAttachment).toHaveBeenCalledTimes(2);
    expect(executeScript.mock.calls[0]?.[0]).toMatchObject({
      target: { tabId: 7, documentIds: ['document-first'] },
    });
    expect(executeScript.mock.calls[1]?.[0]).toMatchObject({
      target: { tabId: 7, documentIds: ['document-second'] },
    });
  });
});
