import { afterEach, describe, expect, it, vi } from 'vitest';

import { DECK_VISIBILITY_REQUEST_MESSAGE_TYPE } from '../../features/userscript-deck/deck-entry';
import { installDeckToolbarEntry } from './deck-toolbar-entry';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installDeckToolbarEntry', () => {
  it('uses the legacy browser action API when chrome.action is absent', () => {
    let click: ((tab: chrome.tabs.Tab) => void) | undefined;
    const removeListener = vi.fn();
    const sendMessage = vi.fn(async () => undefined);
    const dispose = installDeckToolbarEntry({
      browserAction: {
        onClicked: {
          addListener: vi.fn((listener) => {
            click = listener;
          }),
          removeListener,
        },
      },
      tabs: { sendMessage },
    });

    click?.({ id: 42 } as chrome.tabs.Tab);
    expect(sendMessage).toHaveBeenCalledWith(42, {
      type: DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
      visibility: 'toggle',
    });

    dispose();
    expect(removeListener).toHaveBeenCalledWith(click);
  });

  it('reinjects the deck host when an extension reload removed the receiver', async () => {
    let click: ((tab: chrome.tabs.Tab) => void) | undefined;
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Receiving end does not exist.'))
      .mockResolvedValueOnce(undefined);
    const executeScript = vi.fn(async () => []);
    installDeckToolbarEntry({
      action: {
        onClicked: {
          addListener: vi.fn((listener) => {
            click = listener;
          }),
          removeListener: vi.fn(),
        },
      },
      scripting: { executeScript },
      tabs: { sendMessage },
    });

    click?.({
      id: 57,
      url: 'https://example.com/',
    } as chrome.tabs.Tab);
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 57 },
      files: ['content.js'],
    });
    expect(sendMessage).toHaveBeenLastCalledWith(57, {
      type: DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
      visibility: 'toggle',
    });
  });

  it('opens only the active command tab from the keyboard shortcut', () => {
    let command:
      | ((command: string, tab?: chrome.tabs.Tab | undefined) => void)
      | undefined;
    const removeListener = vi.fn();
    const sendMessage = vi.fn(async () => undefined);
    const dispose = installDeckToolbarEntry({
      commands: {
        onCommand: {
          addListener: vi.fn((listener) => {
            command = listener;
          }),
          removeListener,
        },
      },
      tabs: { sendMessage },
    });

    command?.('other-command', { id: 10 } as chrome.tabs.Tab);
    command?.('toggle-card-deck', { id: 42 } as chrome.tabs.Tab);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(42, {
      type: DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
      visibility: 'toggle',
    });

    dispose();
    expect(removeListener).toHaveBeenCalledWith(command);
  });

  it('queries the active Edge tab when the command callback omits it', async () => {
    let command:
      | ((command: string, tab?: chrome.tabs.Tab | undefined) => void)
      | undefined;
    const sendMessage = vi.fn(async () => undefined);
    const query = vi.fn(async () => [{ id: 64 } as chrome.tabs.Tab]);
    installDeckToolbarEntry({
      commands: {
        onCommand: {
          addListener: vi.fn((listener) => {
            command = listener;
          }),
          removeListener: vi.fn(),
        },
      },
      tabs: { query, sendMessage },
    });

    command?.('toggle-card-deck');

    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(64, {
        type: DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
        visibility: 'toggle',
      }),
    );
    expect(query).toHaveBeenCalledWith({
      active: true,
      lastFocusedWindow: true,
    });
  });

  it('uses a Firefox toolbar user action for the native assistant sidebar while keeping the shortcut on the deck', async () => {
    let click: ((tab: chrome.tabs.Tab) => void) | undefined;
    let command:
      | ((command: string, tab?: chrome.tabs.Tab | undefined) => void)
      | undefined;
    const openToolbarSurface = vi.fn(async () => undefined);
    const sendMessage = vi.fn(async () => undefined);
    installDeckToolbarEntry(
      {
        action: {
          onClicked: {
            addListener: vi.fn((listener) => {
              click = listener;
            }),
            removeListener: vi.fn(),
          },
        },
        commands: {
          onCommand: {
            addListener: vi.fn((listener) => {
              command = listener;
            }),
            removeListener: vi.fn(),
          },
        },
        tabs: { sendMessage },
      },
      { openToolbarSurface },
    );

    const tab = { id: 42 } as chrome.tabs.Tab;
    click?.(tab);
    command?.('toggle-card-deck', tab);
    await vi.waitFor(() =>
      expect(openToolbarSurface).toHaveBeenCalledWith(tab),
    );

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(42, {
      type: DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
      visibility: 'toggle',
    });
  });

  it('does not stop background startup when no action API exists', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() =>
      installDeckToolbarEntry({
        tabs: { sendMessage: vi.fn() },
      }),
    ).not.toThrow();
  });
});
