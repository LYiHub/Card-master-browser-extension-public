(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSuggestionActionModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SITE_SEARCH_TYPES = new Set([
    'siteSearch',
    'inlineSiteSearch',
    'siteSearchPrompt'
  ]);

  const COMMAND_SUGGESTION_TYPES = new Set([
    'commandNewTab',
    'commandSettings',
    'modeSwitch',
    'zenSwitch',
    'commandOpenTabs',
    'commandCopyUrl',
    'commandDocumentPip'
  ]);

  const PRIMARY_ENTER_REASONS = new Set([
    'topSite',
    'inline',
    'autocomplete',
    'openTab',
    'currentOpenTab'
  ]);

  function isDirectNavigationSuggestion(suggestion) {
    return Boolean(
      suggestion &&
      (suggestion.type === 'directUrl' || suggestion.type === 'browserPage')
    );
  }

  function isSiteSearchSuggestion(suggestion) {
    return Boolean(suggestion && SITE_SEARCH_TYPES.has(suggestion.type));
  }

  function getVisitButtonAction(suggestion, options) {
    const config = options || {};
    if (!suggestion) {
      return null;
    }
    if (COMMAND_SUGGESTION_TYPES.has(suggestion.type)) {
      return null;
    }
    if (suggestion.type === 'newtab') {
      return 'search';
    }
    if (config.shouldSwitchMatchedTab) {
      return 'switch';
    }
    if (isSiteSearchSuggestion(suggestion)) {
      return 'search';
    }
    if (isDirectNavigationSuggestion(suggestion)) {
      return 'open';
    }
    if (suggestion.type === 'googleSuggest') {
      return 'search';
    }
    return 'openNewTab';
  }

  function getModifierAdjustedAction(action, options) {
    const rawAction = String(action || '');
    const config = options || {};
    if (config.openSwitchInNewTab && rawAction === 'switch') {
      return config.openInBackgroundTab && !config.openInCurrentTab
        ? 'openBackgroundTab'
        : 'openNewTab';
    }
    if (config.openInCurrentTab && rawAction === 'openNewTab') {
      return 'go';
    }
    if (config.openInBackgroundTab && !config.openInCurrentTab &&
        (rawAction === 'openNewTab' || rawAction === 'go' || rawAction === 'switch')) {
      return 'openBackgroundTab';
    }
    return rawAction;
  }

  function shouldOpenNewTabActionInCurrentTab(suggestion, options) {
    const config = options || {};
    if (!config.openInCurrentTab) {
      return false;
    }
    const action = config.action || getVisitButtonAction(suggestion, config);
    return action === 'openNewTab';
  }

  function shouldOpenSwitchActionInNewTab(suggestion, options) {
    const config = options || {};
    if (!config.openSwitchInNewTab || !suggestion || !suggestion.url) {
      return false;
    }
    const action = config.action || getVisitButtonAction(suggestion, config);
    return action === 'switch';
  }

  function getSearchResultOpenDisposition(options) {
    const config = options || {};
    if (config.openInCurrentTab) {
      return 'currentTab';
    }
    if (config.openInBackgroundTab) {
      return 'backgroundTab';
    }
    return 'newTab';
  }

  function createSearchActionModel(options) {
    const config = options || {};
    const suggestion = config.suggestion || null;
    const isPrimaryHighlight = Boolean(config.isPrimaryHighlight);
    const primaryHighlightReason = String(config.primaryHighlightReason || '');
    const onlyKeywordSuggestions = Boolean(config.onlyKeywordSuggestions);
    const isPrimarySearchSuggest = Boolean(config.isPrimarySearchSuggest);
    const isMergedHighlight = Boolean(config.isMergedHighlight);
    const shouldSwitchMatchedTab = Boolean(config.shouldSwitchMatchedTab);
    const enterAction = config.enterAction || 'openNewTab';
    const actionTags = [];
    const isDirectHighlight = isPrimaryHighlight && isDirectNavigationSuggestion(suggestion);
    const shouldShowEnterTag = !isPrimarySearchSuggest &&
      isPrimaryHighlight &&
      !onlyKeywordSuggestions &&
      (
        PRIMARY_ENTER_REASONS.has(primaryHighlightReason) ||
        isDirectHighlight ||
        isMergedHighlight
      );

    if (shouldSwitchMatchedTab) {
      actionTags.push({ action: 'switch', keyLabel: 'Enter' });
    } else if (shouldShowEnterTag) {
      actionTags.push({ action: enterAction, keyLabel: 'Enter' });
    }
    if (isPrimaryHighlight && onlyKeywordSuggestions && suggestion && suggestion.type === 'newtab') {
      actionTags.push({ action: 'search', keyLabel: 'Enter' });
    }

    const visitButtonAction = getVisitButtonAction(suggestion, {
      shouldSwitchMatchedTab
    });
    const alwaysHideVisitButton = !visitButtonAction || Boolean(
      suggestion && (suggestion.type === 'modeSwitch' || suggestion.type === 'zenSwitch')
    );

    return {
      actionTags,
      visitButtonAction,
      alwaysHideVisitButton,
      hasActionTags: actionTags.length > 0,
      hasSwitchAction: shouldSwitchMatchedTab,
      hideSourceTags: shouldSwitchMatchedTab
    };
  }

  function shouldShowVisitButton(model, isActive) {
    if (!model || model.alwaysHideVisitButton || !model.visitButtonAction) {
      return false;
    }
    return !(isActive && model.hasActionTags);
  }

  function getProviderKey(provider) {
    return provider && provider.key ? String(provider.key) : '';
  }

  function getActionContextKey(options) {
    const config = options || {};
    const primarySuggestion = config.primarySuggestion || null;
    const matchedTabId = primarySuggestion && typeof primarySuggestion._xMatchedTabId === 'number'
      ? String(primarySuggestion._xMatchedTabId)
      : '';
    return [
      Number.isInteger(config.primaryHighlightIndex) ? String(config.primaryHighlightIndex) : '-1',
      String(config.primaryHighlightReason || ''),
      config.onlyKeywordSuggestions ? 'keyword' : 'mixed',
      getProviderKey(config.mergedProvider),
      primarySuggestion && primarySuggestion.type ? String(primarySuggestion.type) : '',
      primarySuggestion && primarySuggestion.url ? String(primarySuggestion.url) : '',
      getProviderKey(primarySuggestion && primarySuggestion.provider),
      matchedTabId
    ].join('|');
  }

  function getSuggestionProviderIdentity(suggestion) {
    const provider = suggestion && suggestion.provider;
    if (!provider || typeof provider !== 'object') {
      return '';
    }
    return String(
      provider.key ||
      provider.id ||
      provider.template ||
      provider.name ||
      ''
    );
  }

  function getSuggestionPresentationFingerprint(suggestion, options) {
    if (!suggestion || typeof suggestion !== 'object') {
      return '';
    }
    const config = options || {};
    const provider = suggestion.provider && typeof suggestion.provider === 'object'
      ? suggestion.provider
      : null;
    return JSON.stringify([
      String(suggestion.type || ''),
      String(suggestion.title || ''),
      String(suggestion.url || ''),
      String(suggestion.favicon || ''),
      String(suggestion.path || ''),
      String(suggestion.commandText || ''),
      suggestion.isTopSite === true,
      getSuggestionProviderIdentity(suggestion),
      provider ? String(provider.name || '') : '',
      provider ? String(provider.label || '') : '',
      provider ? String(provider.displayName || '') : '',
      provider ? String(provider.action || '') : '',
      provider ? String(provider.template || '') : '',
      provider ? String(provider.icon || provider.favicon || '') : '',
      String(suggestion.searchQuery || ''),
      suggestion.forceSearch === true,
      String(suggestion._xMatchedTabId ?? ''),
      String(suggestion.nextMode || ''),
      String(suggestion.nextEnabled ?? ''),
      config.includeDebugReasons === true && Array.isArray(suggestion.reasons)
        ? suggestion.reasons
            .map((reason) => String(reason || '').trim())
            .filter(Boolean)
        : []
    ]);
  }

  function getSuggestionStructureIdentity(suggestion) {
    if (!suggestion || typeof suggestion !== 'object') {
      return '';
    }
    const matchedTabId = suggestion._xMatchedTabId;
    if (typeof matchedTabId === 'number' ||
        (typeof matchedTabId === 'string' && matchedTabId)) {
      return `matched-tab:${String(matchedTabId)}`;
    }
    const type = String(suggestion.type || 'suggestion');
    if (type === 'directUrl' || type === 'newtab') {
      return `${type}:query-action`;
    }
    const providerIdentity = getSuggestionProviderIdentity(suggestion);
    if (SITE_SEARCH_TYPES.has(type)) {
      return `${type}:provider:${providerIdentity || 'default'}`;
    }
    const url = String(suggestion.url || '');
    if (url) {
      return `${type}:url:${url}`;
    }
    const commandText = String(suggestion.commandText || '');
    if (commandText) {
      return `${type}:command:${commandText}`;
    }
    const searchQuery = String(suggestion.searchQuery || '');
    if (providerIdentity || searchQuery) {
      return `${type}:provider:${providerIdentity}:query:${searchQuery}`;
    }
    return `${type}:title:${String(suggestion.title || '')}`;
  }

  function hasSameSuggestionSequence(previous, next, compare) {
    if (!Array.isArray(previous) || !Array.isArray(next) ||
        previous.length !== next.length) {
      return false;
    }
    return previous.every((item, index) => compare(item, next[index]));
  }

  function getSuggestionUpdateKind(options) {
    const config = options || {};
    if (config.forceFullRerender === true) {
      return 'structure';
    }
    const sameStructure = hasSameSuggestionSequence(
      config.currentSuggestions,
      config.allSuggestions,
      (previous, next) => {
        const identity = getSuggestionStructureIdentity(previous);
        return Boolean(identity && identity === getSuggestionStructureIdentity(next));
      }
    );
    const sameActionContext =
      config.actionContextKey === config.lastRenderedActionContextKey;
    if (sameStructure) {
      const sameContent = hasSameSuggestionSequence(
        config.currentSuggestions,
        config.allSuggestions,
        (previous, next) => getSuggestionPresentationFingerprint(previous, config) ===
          getSuggestionPresentationFingerprint(next, config)
      );
      return sameContent && sameActionContext ? 'highlight' : 'content';
    }
    const previous = config.currentSuggestions;
    const next = config.allSuggestions;
    const isStablePrefix = sameActionContext &&
      Array.isArray(previous) &&
      Array.isArray(next) &&
      previous.length > 0 &&
      previous.length < next.length &&
      previous.every((item, index) => {
        const identity = getSuggestionStructureIdentity(item);
        return Boolean(identity && identity === getSuggestionStructureIdentity(next[index]));
      });
    return isStablePrefix ? 'append' : 'structure';
  }

  return {
    createSearchActionModel,
    getVisitButtonAction,
    getModifierAdjustedAction,
    getSearchResultOpenDisposition,
    shouldOpenSwitchActionInNewTab,
    shouldOpenNewTabActionInCurrentTab,
    shouldShowVisitButton,
    getActionContextKey,
    getSuggestionPresentationFingerprint,
    getSuggestionStructureIdentity,
    getSuggestionUpdateKind
  };
});
