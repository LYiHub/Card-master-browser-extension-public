(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoShortcutReference = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const BROWSER_SHORTCUTS = [
    {
      id: 'show-search',
      commandName: 'show-search',
      titleKey: 'shortcut_reference_show_search_title',
      titleFallback: 'Open command bar',
      descKey: 'shortcut_reference_show_search_desc',
      descFallback: 'Open Lumno on the current page',
      defaultShortcut: {
        default: 'Ctrl+Shift+K',
        mac: 'Command+Shift+K'
      }
    },
    {
      id: 'show-search-prefill',
      commandName: 'show-search-prefill',
      titleKey: 'shortcut_reference_show_search_prefill_title',
      titleFallback: 'Open with current page URL',
      descKey: 'shortcut_reference_show_search_prefill_desc',
      descFallback: 'Open Lumno and prefill the current page URL',
      defaultShortcut: {
        default: 'Ctrl+Shift+L',
        mac: 'Command+Shift+L'
      }
    },
    {
      id: 'show-search-prefill-v',
      commandName: 'show-search-prefill-v',
      titleKey: 'shortcut_reference_copy_url_title',
      titleFallback: 'Copy current page URL',
      descKey: 'shortcut_reference_copy_url_desc',
      descFallback: 'Copy the current page URL without opening the command bar',
      defaultShortcut: {
        default: 'Ctrl+Shift+C',
        mac: 'Command+Shift+C'
      }
    },
    {
      id: 'show-tab-switcher',
      commandName: 'show-tab-switcher',
      titleKey: 'shortcut_reference_tab_switcher_title',
      titleFallback: 'Recent tab switcher',
      descKey: 'shortcut_reference_tab_switcher_desc',
      descFallback: 'Open the recent tab switcher',
      defaultShortcut: {
        default: 'Alt+Q',
        mac: 'Alt+Q'
      }
    }
  ];

  const FIXED_SHORTCUTS = [
    {
      id: 'search-input-history',
      titleKey: 'shortcut_reference_search_input_history_title',
      titleFallback: 'Previous or next input',
      descKey: 'shortcut_reference_search_input_history_desc',
      descFallback: 'Move backward or forward through submitted input history',
      shortcut: 'Alt+ArrowUp / Alt+ArrowDown'
    },
    {
      id: 'search-navigate',
      titleKey: 'shortcut_reference_search_navigate_title',
      titleFallback: 'Move through suggestions',
      descKey: 'shortcut_reference_search_navigate_desc',
      descFallback: 'Move the active result in Lumno search and New Tab',
      shortcut: 'ArrowUp / ArrowDown'
    },
    {
      id: 'search-number-jump',
      titleKey: 'shortcut_reference_search_number_jump_title',
      titleFallback: 'Jump to a numbered result',
      descKey: 'shortcut_reference_search_number_jump_desc',
      descFallback: 'Hold the primary modifier, release it, then press 0–9 to activate the matching result',
      shortcutLabelKey: 'shortcut_reference_search_number_jump_shortcut',
      shortcutLabelFallback: 'Hold {modifier} for 0.4s, release, then press 0–9',
      defaultShortcut: {
        default: 'Ctrl 0.4s → 0–9',
        mac: 'Command 0.4s → 0–9'
      }
    },
    {
      id: 'search-confirm',
      titleKey: 'shortcut_reference_search_confirm_title',
      titleFallback: 'Run selected action',
      descKey: 'shortcut_reference_search_confirm_desc',
      descFallback: 'Open, search, switch tab, or run the selected command',
      shortcut: 'Enter'
    },
    {
      id: 'search-tab-mode',
      titleKey: 'shortcut_reference_search_tab_mode_title',
      titleFallback: 'Complete or enter search mode',
      descKey: 'shortcut_reference_search_tab_mode_desc',
      descFallback: 'Complete the suggestion or enter site/open-tabs search mode',
      shortcut: 'Tab'
    },
    {
      id: 'search-open-scope-menu',
      titleKey: 'shortcut_reference_search_open_scope_menu_title',
      titleFallback: 'Open search scope panel',
      descKey: 'shortcut_reference_search_open_scope_menu_desc',
      descFallback: 'When the input is empty, press Tab twice; with a search scope selected, press Tab once',
      shortcut: 'Tab Tab'
    },
    {
      id: 'search-close',
      titleKey: 'shortcut_reference_search_close_title',
      titleFallback: 'Close or leave mode',
      descKey: 'shortcut_reference_search_close_desc',
      descFallback: 'Close Lumno search or leave site/open-tabs search mode',
      shortcut: 'Escape'
    },
    {
      id: 'search-current-tab',
      titleKey: 'shortcut_reference_search_current_tab_title',
      titleFallback: 'Open in current tab',
      descKey: 'shortcut_reference_search_current_tab_desc',
      descFallback: 'Use the current tab for actions that normally open a new tab',
      shortcut: 'Alt+Enter'
    },
    {
      id: 'search-switch-new-tab',
      titleKey: 'shortcut_reference_search_switch_new_tab_title',
      titleFallback: 'Open matched tab result in new tab',
      descKey: 'shortcut_reference_search_switch_new_tab_desc',
      descFallback: 'When a result matches an opened tab, open its URL in a new tab',
      shortcut: 'Shift+Enter'
    },
    {
      id: 'tab-switcher-cycle',
      titleKey: 'shortcut_reference_tab_switcher_cycle_title',
      titleFallback: 'Cycle recent tabs',
      descKey: 'shortcut_reference_tab_switcher_cycle_desc',
      descFallback: 'Move to the next or previous item in the tab switcher',
      shortcut: 'Q / Tab / Arrow keys'
    },
    {
      id: 'tab-switcher-confirm',
      titleKey: 'shortcut_reference_tab_switcher_confirm_title',
      titleFallback: 'Switch to selected tab',
      descKey: 'shortcut_reference_tab_switcher_confirm_desc',
      descFallback: 'Confirm the selected tab in the tab switcher',
      shortcut: 'Enter / release Alt'
    },
    {
      id: 'document-pip-picker-parent',
      titleKey: 'shortcut_reference_document_pip_parent_title',
      titleFallback: 'Select outer clip target',
      descKey: 'shortcut_reference_document_pip_parent_desc',
      descFallback: 'Move to a larger parent element while choosing a web clip',
      shortcut: '[ / ArrowUp'
    },
    {
      id: 'document-pip-picker-child',
      titleKey: 'shortcut_reference_document_pip_child_title',
      titleFallback: 'Select inner clip target',
      descKey: 'shortcut_reference_document_pip_child_desc',
      descFallback: 'Move to a smaller child element while choosing a web clip',
      shortcut: '] / ArrowDown'
    }
  ];

  const REFERENCE_GROUPS = [
    {
      id: 'search',
      titleKey: 'shortcut_reference_group_search',
      titleFallback: 'Command bar',
      itemIds: [
        'show-search',
        'search-input-history',
        'search-navigate',
        'search-number-jump',
        'search-confirm',
        'search-tab-mode',
        'search-open-scope-menu',
        'search-close',
        'search-current-tab',
        'search-switch-new-tab'
      ]
    },
    {
      id: 'page-link',
      titleKey: 'shortcut_reference_group_page_link',
      titleFallback: 'Page link',
      itemIds: [
        'show-search-prefill',
        'show-search-prefill-v'
      ]
    },
    {
      id: 'tab-switcher',
      titleKey: 'shortcut_reference_group_tab_switcher',
      titleFallback: 'Tab switcher',
      itemIds: [
        'show-tab-switcher',
        'tab-switcher-cycle',
        'tab-switcher-confirm'
      ]
    },
    {
      id: 'web-clip',
      titleKey: 'shortcut_reference_group_web_clip',
      titleFallback: 'Web clip',
      itemIds: [
        'document-pip-picker-parent',
        'document-pip-picker-child'
      ]
    }
  ];

  function cloneShortcut(item) {
    return Object.assign({}, item, {
      defaultShortcut: item.defaultShortcut ? Object.assign({}, item.defaultShortcut) : item.defaultShortcut
    });
  }

  function getBrowserShortcutDefinitions() {
    return BROWSER_SHORTCUTS.map(cloneShortcut);
  }

  function getFixedShortcutDefinitions() {
    return FIXED_SHORTCUTS.map(cloneShortcut);
  }

  function getDefaultShortcut(definition, platform) {
    const defaults = definition && definition.defaultShortcut ? definition.defaultShortcut : {};
    const normalizedPlatform = String(platform || '').toLowerCase();
    if (normalizedPlatform.indexOf('mac') !== -1 && defaults.mac) {
      return defaults.mac;
    }
    return defaults.default || '';
  }

  function getCommandShortcutMap(commands) {
    const map = new Map();
    if (!Array.isArray(commands)) {
      return map;
    }
    commands.forEach((command) => {
      if (!command || !command.name) {
        return;
      }
      map.set(String(command.name), typeof command.shortcut === 'string' ? command.shortcut.trim() : '');
    });
    return map;
  }

  function getShortcutReferenceGroups(options) {
    const config = options || {};
    const hasCommandSnapshot = Array.isArray(config.commands);
    const commandShortcuts = getCommandShortcutMap(config.commands);
    const platform = config.platform || '';
    const browserItems = BROWSER_SHORTCUTS.map((item) => {
      const shortcut = hasCommandSnapshot && commandShortcuts.has(item.commandName)
        ? commandShortcuts.get(item.commandName)
        : getDefaultShortcut(item, platform);
      return Object.assign(cloneShortcut(item), {
        editable: true,
        shortcut
      });
    });
    const fixedItems = FIXED_SHORTCUTS.map((item) => {
      const definition = cloneShortcut(item);
      return Object.assign(definition, {
        editable: false,
        shortcut: definition.defaultShortcut
          ? getDefaultShortcut(definition, platform)
          : definition.shortcut
      });
    });
    const itemById = new Map(browserItems.concat(fixedItems).map((item) => [item.id, item]));
    return REFERENCE_GROUPS.map((group) => ({
      id: group.id,
      titleKey: group.titleKey,
      titleFallback: group.titleFallback,
      items: group.itemIds
        .map((id) => itemById.get(id))
        .filter(Boolean)
    }));
  }

  return {
    getBrowserShortcutDefinitions,
    getFixedShortcutDefinitions,
    getDefaultShortcut,
    getShortcutReferenceGroups
  };
});
