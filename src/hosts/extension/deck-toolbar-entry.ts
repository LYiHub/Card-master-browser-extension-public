import { DECK_TOGGLE_COMMAND } from '../../features/userscript-deck/deck-entry';
import { requestDeckVisibility } from './deck-visibility';
import { extensionDiagnostics } from './diagnostics';

type DeckToolbarAction = {
  onClicked: Pick<
    typeof chrome.action.onClicked,
    'addListener' | 'removeListener'
  >;
};

type DeckToolbarApi = {
  action?: DeckToolbarAction;
  browserAction?: DeckToolbarAction;
  commands?: {
    onCommand: Pick<
      typeof chrome.commands.onCommand,
      'addListener' | 'removeListener'
    >;
  };
  runtime?: Pick<typeof chrome.runtime, 'sendMessage'>;
  scripting?: Pick<typeof chrome.scripting, 'executeScript'>;
  tabs: Pick<typeof chrome.tabs, 'sendMessage'> &
    Partial<Pick<typeof chrome.tabs, 'query'>>;
};

type DeckToolbarEntryOptions = {
  openToolbarSurface?: (tab: chrome.tabs.Tab) => Promise<void>;
};

export function installDeckToolbarEntry(
  api: DeckToolbarApi,
  options: DeckToolbarEntryOptions = {},
) {
  const action = api.action ?? api.browserAction;
  const commands = api.commands?.onCommand;
  if (!action?.onClicked && !commands) {
    extensionDiagnostics.warn(
      'deck-toolbar',
      'entry-api-unavailable',
      new Error(
        'The browser toolbar action and commands APIs are unavailable.',
      ),
    );
    return () => undefined;
  }
  const openTab = (tab: chrome.tabs.Tab, source: 'toolbar' | 'shortcut') => {
    if (typeof tab.id !== 'number') return;
    void requestDeckVisibility(api, tab.id, 'toggle').catch((error) => {
      extensionDiagnostics.warn(
        'deck-toolbar',
        `${source}-active-tab-open-failed`,
        error,
        { tabId: tab.id, url: tab.url },
      );
    });
  };
  const handleClick = (tab: chrome.tabs.Tab) => {
    if (!options.openToolbarSurface) {
      openTab(tab, 'toolbar');
      return;
    }
    void options.openToolbarSurface(tab).catch((error) => {
      extensionDiagnostics.warn(
        'deck-toolbar',
        'toolbar-surface-open-failed',
        error,
        { tabId: tab.id, url: tab.url },
      );
    });
  };
  const handleCommand = (command: string, tab?: chrome.tabs.Tab) => {
    if (command !== DECK_TOGGLE_COMMAND) return;
    if (tab && typeof tab.id === 'number') {
      openTab(tab, 'shortcut');
      return;
    }
    void api.tabs
      .query?.({ active: true, lastFocusedWindow: true })
      .then(([activeTab]) => {
        if (!activeTab) throw new Error('No active browser tab is available.');
        openTab(activeTab, 'shortcut');
      })
      .catch((error) => {
        extensionDiagnostics.warn(
          'deck-toolbar',
          'shortcut-active-tab-read-failed',
          error,
        );
      });
  };
  action?.onClicked.addListener(handleClick);
  commands?.addListener(handleCommand);
  return () => {
    action?.onClicked.removeListener(handleClick);
    commands?.removeListener(handleCommand);
  };
}
