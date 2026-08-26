(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SEARCH_POLICY = Object.freeze({
    lookupWindowDays: 180,
    fallbackHistoryWindowDays: 365,
    lookupMaxResults: 120,
    fallbackHistoryMaxResults: 600,
    maxEngineSuggestions: 5,
    maxEngineSuggestionsWithLocalResults: 3,
    candidatePoolLimit: 20,
    finalSuggestionLimit: 12,
    displaySuggestionLimit: 10,
    fallbackTopSiteLimit: 5,
    topSiteRepresentativeHostLimit: 1,
    topSiteRepresentativeClusterLimit: 1,
    primaryHostLimit: 3,
    primaryClusterLimit: 1,
    secondaryHostLimit: 5,
    secondaryClusterLimit: 2
  });

  const SEARCH_SELECTION_POLICY = Object.freeze({
    retentionDays: 45,
    maxQueries: 80,
    maxEntriesPerQuery: 12,
    maxSelectionBoost: 320
  });

  const SEARCH_DEDUP_IGNORED_QUERY_PARAM_NAMES = new Set([
    'entry',
    'reason',
    'ref',
    'ref_src',
    'source',
    'from',
    'from_source',
    'feature',
    'feature_source',
    'campaign',
    'campaign_id',
    'campaign_source',
    'channel',
    'via',
    'trk',
    'track',
    'tracking',
    'tracking_id',
    'spm',
    'si'
  ]);

  const SEARCH_SETTINGS_INTENT_TERMS = new Set([
    'setting',
    'settings',
    'option',
    'options',
    'config',
    'configure',
    'preference',
    'preferences',
    'prefs',
    '设置',
    '选项',
    '配置',
    '偏好',
    '管理'
  ]);

  const SEARCH_PATH_INTENT_TERMS = new Set([
    'release',
    'releases',
    'issue',
    'issues',
    'pull',
    'pulls',
    'docs',
    'doc',
    'wiki',
    'guide',
    'guides',
    'pricing',
    'price',
    'download',
    'admin',
    'bookmark',
    'bookmarks',
    'chat',
    'message',
    'messages',
    'dm',
    'dms',
    'setting',
    'settings',
    'profile',
    'account',
    'notification',
    'notifications',
    '设置',
    '通知',
    '文档',
    '价格',
    '下载',
    '发布'
  ]);

  const SEARCH_INFORMATIONAL_TERMS = new Set([
    'how',
    'what',
    'why',
    'when',
    'where',
    'tutorial',
    'tutorials',
    'guide',
    'guides',
    'learn',
    'docs',
    'doc',
    'help',
    'review',
    'reviews',
    'compare',
    'comparison',
    'price',
    'pricing',
    'news',
    '下载',
    '教程',
    '文档',
    '帮助',
    '对比',
    '价格',
    '评测',
    '为什么',
    '怎么',
    '如何'
  ]);

  const SEARCH_HOME_TITLE_TERMS = new Set([
    'home',
    'homepage',
    'overview',
    'workspace',
    'console',
    'dashboard',
    '首页',
    '主页',
    '概览',
    '控制台',
    '工作台'
  ]);

  const SEARCH_UTILITY_SEGMENTS = new Set([
    'settings',
    'setting',
    'preferences',
    'preference',
    'prefs',
    'profile',
    'profiles',
    'account',
    'accounts',
    'notification',
    'notifications',
    'activity',
    'activities',
    'like',
    'likes',
    'admin',
    'dashboard',
    'manage',
    'management',
    'billing',
    'payment',
    'payments'
  ]);

  const SEARCH_ACTION_SEGMENTS = new Set([
    'new',
    'edit',
    'create',
    'update',
    'delete',
    'compose'
  ]);

  const DIRECT_NAVIGATION_SINGLE_COLON_PROTOCOLS = new Set([
    'about:',
    'bitcoin:',
    'blob:',
    'data:',
    'ethereum:',
    'filesystem:',
    'geo:',
    'ipfs:',
    'ipns:',
    'javascript:',
    'magnet:',
    'mailto:',
    'sms:',
    'tel:',
    'urn:',
    'view-source:',
    'webcal:'
  ]);

  const SITE_SEARCH_QUERY_PROBE = '__lumno_site_search_query__';

  const SEARCH_SITE_CONFIG = {
    'lumno.kubai.design': {
      ignoreAllSearchParamsPaths: new Set(['/', '/release', '/onboarding'])
    },
    'analytics.google.com': {
      directNavigationUrl: 'https://analytics.google.com/analytics/web/',
      directNavigationTitle: 'Google Analytics | 首页'
    },
    'github.com': {
      repoAreaCategories: new Map([
        ['issues', 'repo-issues'],
        ['pulls', 'repo-pulls'],
        ['discussions', 'repo-discussions'],
        ['actions', 'repo-actions'],
        ['wiki', 'repo-wiki'],
        ['releases', 'repo-releases']
      ])
    },
    'x.com': {
      directNavigationUrl: 'https://x.com/',
      directNavigationTitle: 'X'
    }
  };

  function normalizeHost(hostname) {
    return String(hostname || '').toLowerCase().replace(/^www\./, '');
  }

  function getSearchSiteConfig(hostname) {
    const host = normalizeHost(hostname);
    return host ? (SEARCH_SITE_CONFIG[host] || null) : null;
  }

  function getSearchDirectNavigationUrl(hostname) {
    const host = normalizeHost(hostname);
    if (!host) {
      return '';
    }
    const siteConfig = getSearchSiteConfig(host);
    return siteConfig && siteConfig.directNavigationUrl
      ? siteConfig.directNavigationUrl
      : `https://${host}/`;
  }

  function getSearchDirectNavigationTitle(hostname, fallbackTitle) {
    const siteConfig = getSearchSiteConfig(hostname);
    const title = siteConfig && siteConfig.directNavigationTitle
      ? siteConfig.directNavigationTitle
      : fallbackTitle;
    return String(title || '').trim();
  }

  function isNumericDirectNavigationHost(hostname) {
    if (!hostname) {
      return false;
    }
    if (!/^(\d{1,3})(\.\d{1,3}){0,3}$/.test(hostname)) {
      return false;
    }
    const parts = hostname.split('.');
    if (parts.length < 1 || parts.length > 4) {
      return false;
    }
    if (parts.length === 1) {
      return parts[0] === '127';
    }
    return parts.every((part) => {
      const value = Number(part);
      return Number.isInteger(value) && value >= 0 && value <= 255;
    });
  }

  function extractDirectNavigationHost(rawInput) {
    const withoutScheme = String(rawInput || '').replace(/^https?:\/\//i, '');
    const authority = withoutScheme.split(/[/?#]/)[0] || '';
    if (!authority) {
      return '';
    }
    if (authority.startsWith('[')) {
      const endBracket = authority.indexOf(']');
      if (endBracket > 1) {
        return authority.slice(1, endBracket).toLowerCase();
      }
      return '';
    }
    if (authority.includes('::') && !authority.includes('.')) {
      return authority.toLowerCase();
    }
    return (authority.split(':')[0] || '').toLowerCase();
  }

  function isDevDirectNavigationHost(hostname) {
    if (!hostname) {
      return false;
    }
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      return true;
    }
    if (hostname === 'host.docker.internal') {
      return true;
    }
    if (
      hostname.endsWith('.local') ||
      hostname.endsWith('.test') ||
      hostname.endsWith('.localdev') ||
      hostname.endsWith('.internal')
    ) {
      return true;
    }
    return hostname === '::1' || hostname === '0:0:0:0:0:0:0:1';
  }

  function getDirectNavigationProtocol(input) {
    const value = String(input || '').trim();
    const match = value.match(/^([a-z][a-z0-9+.-]*):/i);
    if (!match) {
      return '';
    }
    const scheme = String(match[1] || '').toLowerCase();
    if (!scheme || scheme.includes('.')) {
      return '';
    }
    return `${scheme}:`;
  }

  function isExplicitDirectNavigationUrl(input) {
    const value = String(input || '').trim();
    if (!value || /\s/.test(value)) {
      return false;
    }
    const protocol = getDirectNavigationProtocol(value);
    if (!protocol || value.length <= protocol.length) {
      return false;
    }
    if (value.slice(protocol.length).startsWith('//')) {
      return true;
    }
    return DIRECT_NAVIGATION_SINGLE_COLON_PROTOCOLS.has(protocol);
  }

  function getDirectNavigationUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) {
      return '';
    }
    if (isExplicitDirectNavigationUrl(raw)) {
      return raw;
    }
    let normalizedInput = raw.match(/^(\d{1,3})([.\s]\d{1,3}){0,3}(?::\d{1,5})?(?:[/?#].*)?$/)
      ? raw.replace(/\s+/g, '.').replace(/\.{2,}/g, '.')
      : raw;
    const hostOnly = extractDirectNavigationHost(normalizedInput);
    const isDevHost = isDevDirectNavigationHost(hostOnly);
    const isNumericLike = isNumericDirectNavigationHost(hostOnly);
    const protocol = getDirectNavigationProtocol(normalizedInput);
    if (protocol && !isDevHost && !isNumericLike) {
      return '';
    }
    const looksLikeUrl = (normalizedInput.includes('.') && !normalizedInput.includes(' ')) ||
      isDevHost ||
      isNumericLike;
    if (!looksLikeUrl) {
      return '';
    }
    if (hostOnly.includes(':') && !/^https?:\/\//i.test(normalizedInput) && !normalizedInput.startsWith('[')) {
      normalizedInput = `[${normalizedInput}]`;
    }
    if (!normalizedInput.startsWith('http://') && !normalizedInput.startsWith('https://')) {
      return `https://${normalizedInput}`;
    }
    return normalizedInput;
  }

  function splitSearchTerms(value) {
    return Array.from(new Set(
      String(value || '')
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fff]+/i)
        .map((item) => item.trim())
        .filter(Boolean)
    ));
  }

  function splitSearchInitialWords(value) {
    const words = [];
    const asciiRuns = String(value || '').match(/[a-z]+/gi) || [];
    asciiRuns.forEach((run) => {
      const parts = String(run).match(/[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+/g) || [run];
      parts.forEach((part) => {
        const normalized = String(part || '').toLowerCase().replace(/[^a-z]+/g, '');
        if (normalized) {
          words.push(normalized);
        }
      });
    });
    return words;
  }

  function buildSearchTitleInitials(value) {
    return splitSearchInitialWords(value)
      .map((word) => word.charAt(0))
      .join('');
  }

  function getSearchTitleInitialsMatchType(title, term) {
    const query = String(term || '').toLowerCase().replace(/[^a-z]+/g, '');
    if (!query || query.length < 2) {
      return '';
    }
    const initials = buildSearchTitleInitials(title);
    if (!initials || initials.length < query.length) {
      return '';
    }
    if (initials === query) {
      return 'exact';
    }
    return initials.startsWith(query) ? 'prefix' : '';
  }

  function buildSearchQueryContext(query, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const lookupQuery = String(query || '');
    const queryLower = lookupQuery.trim().toLowerCase();
    const normalizedPinyinQuery = String(settings.normalizedPinyinQuery || '').trim();
    const coreQueryTerms = splitSearchTerms(queryLower);
    const queryTerms = splitSearchTerms(queryLower);
    if (queryLower && !queryTerms.includes(queryLower)) {
      queryTerms.unshift(queryLower);
    }
    return {
      lookupQuery,
      queryLower,
      normalizedPinyinQuery,
      useTitlePinyinMatch: Boolean(normalizedPinyinQuery),
      coreQueryTerms,
      queryTerms,
      intentType: classifySearchIntent(lookupQuery, queryTerms),
      hasSettingsIntent: queryTerms.some((term) => SEARCH_SETTINGS_INTENT_TERMS.has(term)),
      hasInformationalIntent: queryTerms.some((term) => SEARCH_INFORMATIONAL_TERMS.has(term))
    };
  }

  function normalizeSearchSelectionQuery(query) {
    const value = String(query || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    return value.length > 120 ? value.slice(0, 120) : value;
  }

  function normalizeSearchSelectionType(type) {
    const value = String(type || '').trim();
    if (!value) {
      return 'history';
    }
    if (value === 'bookmark' || value === 'topSite' || value === 'history' || value === 'directUrl' || value === 'browserPage' || value === 'autocomplete') {
      return value;
    }
    return 'history';
  }

  function normalizeSearchSelectionEntry(urlKey, entry, now, retentionMs) {
    if (!urlKey || !entry || typeof entry !== 'object') {
      return null;
    }
    const lastSelectedAt = Number(entry.lastSelectedAt) || 0;
    if (!lastSelectedAt || now - lastSelectedAt > retentionMs) {
      return null;
    }
    const url = String(entry.url || '').trim();
    if (!url) {
      return null;
    }
    return {
      url,
      title: String(entry.title || '').trim().slice(0, 180),
      type: normalizeSearchSelectionType(entry.type),
      count: Math.max(1, Math.min(999, Math.floor(Number(entry.count) || 1))),
      lastSelectedAt
    };
  }

  function normalizeSearchSelectionStats(rawStats, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const now = getNow(settings);
    const retentionDays = Number(settings.retentionDays) > 0
      ? Number(settings.retentionDays)
      : SEARCH_SELECTION_POLICY.retentionDays;
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    const maxQueries = Number(settings.maxQueries) > 0
      ? Math.floor(Number(settings.maxQueries))
      : SEARCH_SELECTION_POLICY.maxQueries;
    const maxEntriesPerQuery = Number(settings.maxEntriesPerQuery) > 0
      ? Math.floor(Number(settings.maxEntriesPerQuery))
      : SEARCH_SELECTION_POLICY.maxEntriesPerQuery;
    const sourceQueries = rawStats && typeof rawStats === 'object' && rawStats.queries && typeof rawStats.queries === 'object'
      ? rawStats.queries
      : {};
    const buckets = [];

    Object.entries(sourceQueries).forEach(([rawQueryKey, rawBucket]) => {
      const queryKey = normalizeSearchSelectionQuery(rawQueryKey);
      const bucket = rawBucket && typeof rawBucket === 'object' ? rawBucket : {};
      const sourceEntries = bucket.entries && typeof bucket.entries === 'object' ? bucket.entries : {};
      const entries = {};
      Object.entries(sourceEntries)
        .map(([urlKey, entry]) => [urlKey, normalizeSearchSelectionEntry(urlKey, entry, now, retentionMs)])
        .filter(([, entry]) => Boolean(entry))
        .sort((a, b) => {
          const lastDiff = b[1].lastSelectedAt - a[1].lastSelectedAt;
          if (lastDiff !== 0) {
            return lastDiff;
          }
          return b[1].count - a[1].count;
        })
        .slice(0, maxEntriesPerQuery)
        .forEach(([urlKey, entry]) => {
          entries[urlKey] = entry;
        });
      if (!queryKey || Object.keys(entries).length === 0) {
        return;
      }
      const updatedAt = Math.max(
        Number(bucket.updatedAt) || 0,
        ...Object.values(entries).map((entry) => Number(entry.lastSelectedAt) || 0)
      );
      buckets.push([queryKey, { updatedAt, entries }]);
    });

    buckets.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    const queries = {};
    buckets.slice(0, maxQueries).forEach(([queryKey, bucket]) => {
      queries[queryKey] = bucket;
    });
    return {
      version: 1,
      updatedAt: buckets.length > 0 ? buckets[0][1].updatedAt : 0,
      queries
    };
  }

  function recordSearchSelectionInStats(rawStats, selection, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const now = getNow(settings);
    const queryKey = normalizeSearchSelectionQuery(selection && selection.query);
    const url = String(selection && selection.url || '').trim();
    if (!queryKey || !url) {
      return normalizeSearchSelectionStats(rawStats, settings);
    }
    const urlKey = buildSearchDedupUrlKey(url);
    if (!urlKey) {
      return normalizeSearchSelectionStats(rawStats, settings);
    }
    const stats = normalizeSearchSelectionStats(rawStats, settings);
    const bucket = stats.queries[queryKey] || { updatedAt: 0, entries: {} };
    const existing = bucket.entries[urlKey] || null;
    bucket.entries[urlKey] = {
      url,
      title: String(selection.title || (existing && existing.title) || '').trim().slice(0, 180),
      type: normalizeSearchSelectionType(selection.type || (existing && existing.type)),
      count: Math.max(1, Math.min(999, (Number(existing && existing.count) || 0) + 1)),
      lastSelectedAt: now
    };
    bucket.updatedAt = now;
    stats.queries[queryKey] = bucket;
    stats.updatedAt = now;
    return normalizeSearchSelectionStats(stats, settings);
  }

  function shouldIgnoreSearchDedupQueryParam(paramName) {
    const normalized = String(paramName || '').trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return normalized.startsWith('utm_') || SEARCH_DEDUP_IGNORED_QUERY_PARAM_NAMES.has(normalized);
  }

  function buildSearchDedupUrlKey(url) {
    if (!url || typeof url !== 'string') {
      return '';
    }
    try {
      const parsed = new URL(url);
      parsed.protocol = String(parsed.protocol || '').toLowerCase();
      parsed.hostname = normalizeHost(parsed.hostname);
      if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
        parsed.port = '';
      }
      parsed.hash = '';
      const normalizedPathname = parsed.pathname !== '/'
        ? (parsed.pathname.replace(/\/+$/, '') || '/')
        : '/';
      parsed.pathname = normalizedPathname;
      const normalizedHost = normalizeHost(parsed.hostname);
      const siteConfig = getSearchSiteConfig(normalizedHost);
      const ignoreAllSearchParamsPaths = siteConfig && siteConfig.ignoreAllSearchParamsPaths
        ? siteConfig.ignoreAllSearchParamsPaths
        : null;
      const shouldIgnoreAllSearchParams = Boolean(
        ignoreAllSearchParamsPaths && ignoreAllSearchParamsPaths.has(normalizedPathname)
      );
      const nextParams = new URLSearchParams();
      if (!shouldIgnoreAllSearchParams) {
        Array.from(parsed.searchParams.entries())
          .filter(([key]) => !shouldIgnoreSearchDedupQueryParam(key))
          .sort(([keyA, valueA], [keyB, valueB]) => {
            if (keyA === keyB) {
              return String(valueA).localeCompare(String(valueB));
            }
            return String(keyA).localeCompare(String(keyB));
          })
          .forEach(([key, value]) => {
            nextParams.append(key, value);
          });
      }
      parsed.search = nextParams.toString() ? `?${nextParams.toString()}` : '';
      return parsed.toString();
    } catch (e) {
      return String(url).trim().toLowerCase();
    }
  }

  function getStableDirectNavigationTitleForUrl(url, sourceType) {
    if (sourceType === 'bookmark') {
      return '';
    }
    try {
      const parsed = new URL(String(url || '').trim());
      const directTitle = getSearchDirectNavigationTitle(parsed.hostname);
      if (!directTitle) {
        return '';
      }
      return buildSearchDedupUrlKey(url) === buildSearchDedupUrlKey(getSearchDirectNavigationUrl(parsed.hostname))
        ? directTitle
        : '';
    } catch (e) {
      return '';
    }
  }

  function getSearchSuggestionDisplayTitle(item, sourceType) {
    return getStableDirectNavigationTitleForUrl(item && item.url, sourceType) ||
      (item && item.title) ||
      (item && item.url) ||
      '';
  }

  function shouldReplaceDedupedSearchItem(candidate, existing) {
    if (!existing) {
      return true;
    }
    const candidateVisit = Number(candidate && candidate.lastVisitTime) || 0;
    const existingVisit = Number(existing && existing.lastVisitTime) || 0;
    if (candidateVisit !== existingVisit) {
      return candidateVisit > existingVisit;
    }
    const candidateTyped = Number(candidate && candidate.typedCount) || 0;
    const existingTyped = Number(existing && existing.typedCount) || 0;
    if (candidateTyped !== existingTyped) {
      return candidateTyped > existingTyped;
    }
    const candidateVisitCount = Number(candidate && candidate.visitCount) || 0;
    const existingVisitCount = Number(existing && existing.visitCount) || 0;
    if (candidateVisitCount !== existingVisitCount) {
      return candidateVisitCount > existingVisitCount;
    }
    const candidateTitleLength = String(candidate && candidate.title || '').trim().length;
    const existingTitleLength = String(existing && existing.title || '').trim().length;
    return candidateTitleLength > existingTitleLength;
  }

  function normalizeSearchDedupTitle(title) {
    return String(title || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildSearchDedupEntryKey(item) {
    if (!item) {
      return '';
    }
    const urlKey = typeof item.url === 'string' && item.url
      ? buildSearchDedupUrlKey(item.url)
      : '';
    const titleKey = normalizeSearchDedupTitle(item.title);
    if (urlKey && titleKey) {
      return `url:${urlKey}::title:${titleKey}`;
    }
    if (urlKey) {
      return `url:${urlKey}`;
    }
    if (titleKey) {
      return `title:${titleKey}`;
    }
    return `id:${item.id || ''}:${String(item.title || '').trim()}`;
  }

  function mergeItemsByUrl(itemGroups) {
    const merged = [];
    const mergedIndexByKey = new Map();
    (Array.isArray(itemGroups) ? itemGroups : []).forEach((items) => {
      (Array.isArray(items) ? items : []).forEach((item) => {
        if (!item) {
          return;
        }
        const urlKey = buildSearchDedupEntryKey(item);
        const existingIndex = mergedIndexByKey.get(urlKey);
        if (typeof existingIndex === 'number') {
          if (shouldReplaceDedupedSearchItem(item, merged[existingIndex])) {
            merged[existingIndex] = item;
          }
          return;
        }
        mergedIndexByKey.set(urlKey, merged.length);
        merged.push(item);
      });
    });
    return merged;
  }

  function hasSearchHomeTitle(title) {
    const titleTerms = splitSearchTerms(String(title || '').toLowerCase());
    return titleTerms.some((term) => SEARCH_HOME_TITLE_TERMS.has(term));
  }

  function isSearchLikelyBrandProductQuery(context) {
    if (!context || context.intentType !== 'object') {
      return false;
    }
    if (context.hasInformationalIntent || context.hasSettingsIntent) {
      return false;
    }
    if (!Array.isArray(context.queryTerms) || context.queryTerms.length !== 2) {
      return false;
    }
    return context.queryLower.length <= 28;
  }

  function isSearchLikelyDirectNavigationQuery(context) {
    if (!context || context.hasInformationalIntent) {
      return false;
    }
    return context.intentType === 'brand' || isSearchLikelyBrandProductQuery(context);
  }

  function getSearchBrandHostMatchScore(host, context) {
    if (!host || !context || context.intentType !== 'brand') {
      return 0;
    }
    const query = String(context.queryLower || '').trim();
    if (!query) {
      return 0;
    }
    const hostLabels = normalizeHost(host).split('.').filter(Boolean);
    let score = 0;
    hostLabels.forEach((label) => {
      if (label === query) {
        score = Math.max(score, 100);
        return;
      }
      if (query.length >= 2 && label.startsWith(query)) {
        score = Math.max(score, 60);
      }
    });
    return score;
  }

  function getSearchNavigationRepresentativeSignal(item, context) {
    if (!item || !item.url) {
      return 0;
    }
    const info = getSearchSuggestionClusterInfo(item.url);
    const titleLower = String(item.title || '').toLowerCase();
    const hasHomeTitle = hasSearchHomeTitle(titleLower);
    let signal = 0;

    if (info.category === 'site-root' || info.category === 'repo-root') {
      signal += 4;
    } else if (info.category === 'section' || info.category === 'landing') {
      signal += 3;
    } else if (hasHomeTitle && info.category !== 'utility' && info.category !== 'action') {
      signal += 3;
    } else if (info.category === 'content' && info.depth <= 2) {
      signal += 1;
    }

    if (info.category === 'utility' || info.category === 'action' || info.category === 'user') {
      signal -= 3;
    } else if (info.category === 'content' && info.depth >= 2 && !hasHomeTitle) {
      signal -= 1;
    }

    if (titleLower === context.queryLower) {
      signal += 4;
    } else if (titleLower.startsWith(context.queryLower)) {
      signal += 3;
    } else if (context.queryTerms.every((term) => term && titleLower.includes(term))) {
      signal += 2;
    }

    try {
      const hostLabels = normalizeHost(new URL(item.url).hostname).split('.').filter(Boolean);
      context.queryTerms.forEach((term) => {
        if (!term) {
          return;
        }
        if (hostLabels.includes(term)) {
          signal += 2;
          return;
        }
        if (term.length >= 2 && hostLabels.some((label) => label.startsWith(term))) {
          signal += 1;
        }
      });
    } catch (e) {
      // Ignore invalid URL.
    }

    if (item.type === 'topSite' || item.isTopSite) {
      signal += 1;
    } else if (item.type === 'bookmark') {
      signal += 1;
    }

    return signal;
  }

  function getSearchDirectNavigationAdjustment(item, sourceType, context) {
    if (!isSearchLikelyDirectNavigationQuery(context) || !item || !item.url) {
      return 0;
    }
    const info = getSearchSuggestionClusterInfo(item.url);
    const hasHomeTitle = hasSearchHomeTitle(item.title);
    const representativeSignal = getSearchNavigationRepresentativeSignal(item, context);
    const titleLower = String(item.title || '').toLowerCase();
    const pathTokens = [];
    let hostname = '';
    let hostLabels = [];
    try {
      const parsedUrl = new URL(item.url);
      hostname = normalizeHost(parsedUrl.hostname);
      hostLabels = hostname.split('.').filter(Boolean);
      decodeURIComponent(String(parsedUrl.pathname || '').toLowerCase())
        .split('/')
        .filter(Boolean)
        .forEach((segment) => {
          const segmentTokens = segment.split(/[^a-z0-9\u4e00-\u9fff]+/i).filter(Boolean);
          if (segmentTokens.length > 0) {
            pathTokens.push(...segmentTokens);
          }
        });
    } catch (e) {
      hostname = '';
      hostLabels = [];
    }
    const coverageStats = getSearchTermCoverageStats(context, {
      titleLower,
      hostname,
      urlLower: String(item.url || '').toLowerCase(),
      titleTokens: splitSearchTerms(titleLower),
      hostLabels,
      pathTokens
    });
    let adjustment = 0;

    if (context.intentType === 'brand') {
      if (info.category === 'site-root' || info.category === 'repo-root') {
        adjustment += 70;
      } else if (info.category === 'section' || info.category === 'landing') {
        adjustment += 32;
      } else if (hasHomeTitle) {
        adjustment += 42;
      } else if (info.category === 'content' && info.depth >= 2) {
        adjustment -= 28;
      }
    } else if (isSearchLikelyBrandProductQuery(context)) {
      if (info.category === 'site-root' || info.category === 'repo-root') {
        adjustment += 34;
      } else if (info.category === 'section' || info.category === 'landing' || hasHomeTitle) {
        adjustment += 28;
      } else if (info.category === 'content' && info.depth >= 2) {
        adjustment -= 12;
      }
    }

    if (representativeSignal >= 6) {
      adjustment += 18;
    } else if (representativeSignal <= 0) {
      adjustment -= 12;
    }

    if ((info.category === 'utility' || info.category === 'action' || info.category === 'user') && !context.hasSettingsIntent) {
      adjustment -= 36;
    }

    if (sourceType === 'topSite' && (info.category === 'site-root' || hasHomeTitle)) {
      adjustment += 10;
    }

    if (coverageStats.total >= 2 && !coverageStats.allMatched) {
      if (info.category === 'site-root' || info.category === 'section' || info.category === 'landing') {
        adjustment -= Math.min(42, coverageStats.missingCount * 22);
      }
      if (representativeSignal >= 6) {
        adjustment -= 10;
      }
    }

    return adjustment;
  }

  function getSearchEngineSuggestionScore(context, localSuggestions) {
    const candidates = Array.isArray(localSuggestions) ? localSuggestions : [];
    const hasStrongLocalDirectMatch = candidates.some((suggestion) => (
      suggestion &&
      suggestion.type !== 'googleSuggest' &&
      getSearchNavigationRepresentativeSignal(suggestion, context) >= 6
    ));

    if (context.intentType === 'brand') {
      return hasStrongLocalDirectMatch ? 18 : 48;
    }
    if (isSearchLikelyBrandProductQuery(context)) {
      return hasStrongLocalDirectMatch ? 34 : 78;
    }
    if (context.intentType === 'path' || context.intentType === 'revisit') {
      return 52;
    }
    if (context.hasInformationalIntent) {
      return 220;
    }
    return 160;
  }

  function getSearchEngineSuggestionLimit(value) {
    const rawLimit = Number(value);
    return Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.floor(rawLimit)
      : SEARCH_POLICY.maxEngineSuggestions;
  }

  function normalizeSearchEngineSuggestionText(value) {
    return String(value || '').trim();
  }

  function normalizeSearchEngineSuggestions(items, query, options) {
    const suggestions = Array.isArray(items) ? items : [];
    const settings = options && typeof options === 'object' ? options : {};
    const limit = getSearchEngineSuggestionLimit(settings.limit);
    const queryText = normalizeSearchEngineSuggestionText(query);
    const queryKey = queryText.toLowerCase();
    const seen = new Set();
    const normalized = [];
    for (let i = 0; i < suggestions.length && normalized.length < limit; i += 1) {
      const suggestion = normalizeSearchEngineSuggestionText(suggestions[i]);
      if (!suggestion) {
        continue;
      }
      const suggestionKey = suggestion.toLowerCase();
      if (suggestionKey === queryKey || seen.has(suggestionKey)) {
        continue;
      }
      seen.add(suggestionKey);
      normalized.push(suggestion);
    }
    return normalized;
  }

  function isSearchEngineSuggestion(suggestion) {
    return Boolean(suggestion && suggestion.type === 'googleSuggest');
  }

  function isSearchActionSuggestion(suggestion) {
    return Boolean(suggestion && suggestion.type === 'newtab');
  }

  function isKeywordSearchSuggestion(suggestion) {
    return isSearchEngineSuggestion(suggestion) || isSearchActionSuggestion(suggestion);
  }

  function hasLocalResultSuggestion(list) {
    return (Array.isArray(list) ? list : []).some((suggestion) => (
      suggestion && !isKeywordSearchSuggestion(suggestion)
    ));
  }

  function areOnlyKeywordSearchSuggestions(list) {
    const suggestions = Array.isArray(list) ? list : [];
    return suggestions.length > 0 && suggestions.every(isKeywordSearchSuggestion);
  }

  function getAutocompleteSearchSuggestionPool(list) {
    const suggestions = Array.isArray(list) ? list : [];
    if (!hasLocalResultSuggestion(suggestions)) {
      return suggestions.slice();
    }
    return suggestions.filter((suggestion) => !isSearchEngineSuggestion(suggestion));
  }

  function getKeywordSearchSuggestionState(list) {
    const suggestions = Array.isArray(list) ? list : [];
    return {
      onlyKeywordSuggestions: areOnlyKeywordSearchSuggestions(suggestions),
      hasLocalResults: hasLocalResultSuggestion(suggestions),
      autocompleteSuggestions: getAutocompleteSearchSuggestionPool(suggestions)
    };
  }

  function getSearchEngineSuggestionPolicy(context, localSuggestions, policy) {
    const settings = policy && typeof policy === 'object' ? policy : {};
    const hasLocalResults = hasLocalResultSuggestion(localSuggestions);
    const baseScore = getSearchEngineSuggestionScore(context, localSuggestions);
    const maxEngineSuggestions = getSearchEngineSuggestionLimit(settings.maxEngineSuggestions);
    const rawLocalResultLimit = Number(settings.maxEngineSuggestionsWithLocalResults);
    const localResultLimit = Number.isFinite(rawLocalResultLimit) && rawLocalResultLimit > 0
      ? Math.floor(rawLocalResultLimit)
      : SEARCH_POLICY.maxEngineSuggestionsWithLocalResults;
    return {
      hasLocalResults,
      limit: hasLocalResults ? Math.min(localResultLimit, maxEngineSuggestions) : maxEngineSuggestions,
      score: hasLocalResults ? Math.min(baseScore, 1) : baseScore
    };
  }

  function looksLikeVersionSegment(segment) {
    const value = String(segment || '').trim().toLowerCase();
    if (!value) {
      return false;
    }
    return /^v?\d+(\.\d+){1,3}([.-][a-z0-9]+)?$/i.test(value);
  }

  function looksLikeOpaqueIdSegment(segment) {
    const value = String(segment || '').trim().toLowerCase();
    if (!value) {
      return false;
    }
    if (/^\d+$/.test(value)) {
      return true;
    }
    if (/^[0-9a-f]{8,}$/i.test(value)) {
      return true;
    }
    if (/^[0-9a-f]{8}-[0-9a-f-]{8,}$/i.test(value)) {
      return true;
    }
    return false;
  }

  function normalizeClusterSegment(segment) {
    const value = String(segment || '').trim().toLowerCase();
    if (!value) {
      return '';
    }
    if (looksLikeVersionSegment(value)) {
      return ':version';
    }
    if (looksLikeOpaqueIdSegment(value)) {
      return ':id';
    }
    return value;
  }

  function getSearchSuggestionClusterInfo(url) {
    if (!url) {
      return {
        host: '',
        category: 'unknown',
        clusterKey: '',
        depth: 0,
        path: '/'
      };
    }
    try {
      const parsed = new URL(url);
      const host = normalizeHost(parsed.hostname);
      const path = parsed.pathname !== '/' ? (parsed.pathname.replace(/\/+$/, '') || '/') : '/';
      const rawSegments = path.split('/').filter(Boolean).map((item) => decodeURIComponent(item).toLowerCase());
      const segments = rawSegments.map(normalizeClusterSegment);
      const first = segments[0] || '';
      const second = segments[1] || '';
      const third = segments[2] || '';

      const siteConfig = getSearchSiteConfig(host);
      if (host === 'github.com' && segments.length >= 2) {
        const repoBase = `${host}/${segments[0]}/${segments[1]}`;
        if (segments.length === 2) {
          return { host, category: 'repo-root', clusterKey: repoBase, depth: segments.length, path };
        }
        const repoAreaCategories = siteConfig && siteConfig.repoAreaCategories
          ? siteConfig.repoAreaCategories
          : null;
        if (repoAreaCategories && repoAreaCategories.has(third)) {
          return { host, category: repoAreaCategories.get(third), clusterKey: `${repoBase}/${third}`, depth: segments.length, path };
        }
        if (third === 'tree' || third === 'blob') {
          const area = segments[4] || segments[3] || 'root';
          return { host, category: 'repo-code', clusterKey: `${repoBase}/code/${area}`, depth: segments.length, path };
        }
        return { host, category: 'repo-child', clusterKey: `${repoBase}/${third || 'root'}`, depth: segments.length, path };
      }

      if (segments.length === 0) {
        return { host, category: 'site-root', clusterKey: `${host}/`, depth: 0, path };
      }

      if (SEARCH_UTILITY_SEGMENTS.has(first)) {
        return { host, category: 'utility', clusterKey: `${host}/utility/${first}`, depth: segments.length, path };
      }

      if (SEARCH_ACTION_SEGMENTS.has(first)) {
        return { host, category: 'action', clusterKey: `${host}/action/${first}`, depth: segments.length, path };
      }

      if ((first === 'u' || first === 'user' || first === 'users' || first === 'profile' || first === 'profiles') && second) {
        return { host, category: 'user', clusterKey: `${host}/user/${second}`, depth: segments.length, path };
      }

      if (first === 'release' || first === 'releases' || first === 'onboarding' || first === 'changelog') {
        return { host, category: 'landing', clusterKey: `${host}/${first}`, depth: segments.length, path };
      }

      if (first === 'docs' || first === 'doc' || first === 'wiki' || first === 'help' || first === 'guide' || first === 'guides') {
        const docKey = second || 'root';
        return { host, category: 'docs', clusterKey: `${host}/${first}/${docKey}`, depth: segments.length, path };
      }

      if (segments.length === 1) {
        return { host, category: 'section', clusterKey: `${host}/${first}`, depth: segments.length, path };
      }

      return { host, category: 'content', clusterKey: `${host}/${first}/${second}`, depth: segments.length, path };
    } catch (e) {
      return {
        host: '',
        category: 'unknown',
        clusterKey: String(url).trim().toLowerCase(),
        depth: 0,
        path: '/'
      };
    }
  }

  function looksLikeNavigationQuery(query) {
    const value = String(query || '').trim().toLowerCase();
    if (!value) {
      return false;
    }
    if (value.includes('://')) {
      return true;
    }
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/#?].*)?$/i.test(value)) {
      return true;
    }
    return false;
  }

  function classifySearchIntent(query, queryTerms) {
    const raw = String(query || '').trim().toLowerCase();
    const terms = Array.isArray(queryTerms) ? queryTerms.filter(Boolean) : [];
    if (looksLikeNavigationQuery(raw)) {
      return 'navigation';
    }

    if (terms.some((term) => SEARCH_PATH_INTENT_TERMS.has(term))) {
      return 'path';
    }

    if (terms.some((term) => looksLikeVersionSegment(term)) || /v?\d+(\.\d+){1,3}/i.test(raw)) {
      return 'revisit';
    }

    if (terms.length >= 2) {
      if (terms.some((term) => /\d/.test(term))) {
        return 'revisit';
      }
      return 'object';
    }

    if (terms.length === 1) {
      return 'brand';
    }

    return 'object';
  }

  function getSearchSourceAdjustment(sourceType, intentType) {
    const source = String(sourceType || '');
    const intent = String(intentType || 'object');

    if (intent === 'navigation' || intent === 'brand') {
      if (source === 'bookmark') {
        return 24;
      }
      if (source === 'topSite') {
        return 20;
      }
      if (source === 'history') {
        return 4;
      }
    }

    if (intent === 'path' || intent === 'revisit') {
      if (source === 'history') {
        return 18;
      }
      if (source === 'bookmark') {
        return 10;
      }
      if (source === 'topSite') {
        return 8;
      }
    }

    if (intent === 'object') {
      if (source === 'bookmark') {
        return 18;
      }
      if (source === 'history') {
        return 12;
      }
      if (source === 'topSite') {
        return 10;
      }
    }

    return 0;
  }

  function matchesSearchQueryText(item, context) {
    if (!item || !item.url) {
      return false;
    }
    const title = item.title ? String(item.title) : '';
    const titleLower = title.toLowerCase();
    const urlLower = item.url.toLowerCase();
    const titleTokens = splitSearchTerms(titleLower);
    let hostname = '';
    let hostLabels = [];
    try {
      hostname = normalizeHost(new URL(item.url).hostname);
      hostLabels = hostname.split('.').filter(Boolean);
    } catch (e) {
      hostname = '';
      hostLabels = [];
    }
    const matchesTerm = (term) => {
      if (!term) {
        return false;
      }
      if (
        titleLower === term ||
        titleLower.startsWith(term) ||
        titleTokens.includes(term) ||
        titleTokens.some((token) => token.startsWith(term)) ||
        getSearchTitleInitialsMatchType(title, term)
      ) {
        return true;
      }
      if (
        hostname.startsWith(term) ||
        hostLabels.includes(term) ||
        hostLabels.some((label) => label.startsWith(term))
      ) {
        return true;
      }
      if (shouldAllowLooseTextContains(term) && (titleLower.includes(term) || urlLower.includes(term))) {
        return true;
      }
      return false;
    };
    if (matchesTerm(context.queryLower)) {
      return true;
    }
    const coreTerms = Array.isArray(context.coreQueryTerms) && context.coreQueryTerms.length > 0
      ? context.coreQueryTerms
      : (Array.isArray(context.queryTerms) ? context.queryTerms : []);
    return coreTerms.length > 0 && coreTerms.every((term) => matchesTerm(term));
  }

  function isShortAsciiSearchTerm(term) {
    const value = String(term || '').trim().toLowerCase();
    if (!value) {
      return false;
    }
    return /^[a-z0-9]+$/i.test(value) && value.length <= 2;
  }

  function shouldAllowLooseTextContains(term) {
    const value = String(term || '').trim().toLowerCase();
    if (!value) {
      return false;
    }
    if (/[\u4e00-\u9fff]/.test(value)) {
      return true;
    }
    return !isShortAsciiSearchTerm(value);
  }

  function getSearchTermCoverageStats(context, candidateParts) {
    const terms = Array.isArray(context && context.coreQueryTerms) && context.coreQueryTerms.length > 0
      ? context.coreQueryTerms
      : splitSearchTerms(context && context.queryLower ? context.queryLower : '');
    if (terms.length === 0) {
      return {
        total: 0,
        matchedCount: 0,
        missingCount: 0,
        allMatched: false
      };
    }
    const normalizedCandidate = candidateParts && typeof candidateParts === 'object'
      ? candidateParts
      : {};
    const titleLower = String(normalizedCandidate.titleLower || '');
    const hostname = String(normalizedCandidate.hostname || '');
    const urlLower = String(normalizedCandidate.urlLower || '');
    const titleTokens = Array.isArray(normalizedCandidate.titleTokens) ? normalizedCandidate.titleTokens : [];
    const hostLabels = Array.isArray(normalizedCandidate.hostLabels) ? normalizedCandidate.hostLabels : [];
    const pathTokens = Array.isArray(normalizedCandidate.pathTokens) ? normalizedCandidate.pathTokens : [];
    let matchedCount = 0;

    terms.forEach((term) => {
      if (!term) {
        return;
      }
      const matched = (
        titleTokens.includes(term) ||
        hostLabels.includes(term) ||
        pathTokens.includes(term) ||
        titleTokens.some((token) => token.startsWith(term)) ||
        hostLabels.some((label) => label.startsWith(term)) ||
        pathTokens.some((token) => token.startsWith(term)) ||
        (shouldAllowLooseTextContains(term) && (
          titleLower.includes(term) ||
          hostname.includes(term) ||
          urlLower.includes(term)
        ))
      );
      if (matched) {
        matchedCount += 1;
      }
    });

    return {
      total: terms.length,
      matchedCount,
      missingCount: Math.max(0, terms.length - matchedCount),
      allMatched: matchedCount === terms.length
    };
  }

  function getSearchSuggestionCategoryAdjustment(item, context, coverageStats) {
    if (!item || !item.url) {
      return 0;
    }
    const info = getSearchSuggestionClusterInfo(item.url);
    const querySet = new Set(Array.isArray(context && context.queryTerms) ? context.queryTerms : []);
    const hasSettingsIntent = Boolean(context && context.hasSettingsIntent);
    const hasActionIntent = querySet.has('new') || querySet.has('edit') || querySet.has('create') || querySet.has('settings') || querySet.has('设置');
    let adjustment = 0;

    if (info.category === 'site-root' || info.category === 'repo-root') {
      adjustment += 18;
    } else if (info.category === 'section') {
      adjustment += 8;
    } else if (info.category === 'landing' || info.category === 'docs') {
      adjustment += 10;
    }

    if (item.type === 'topSite' || item.isTopSite) {
      if (info.category === 'site-root' || info.category === 'repo-root') {
        adjustment += 20;
      } else if (info.category === 'section' || info.category === 'landing') {
        adjustment += 10;
      } else {
        adjustment += 4;
      }
    }

    if (info.depth >= 3 && info.category !== 'docs' && info.category !== 'repo-code') {
      adjustment -= Math.min(16, (info.depth - 2) * 4);
    }

    if (info.category === 'utility') {
      adjustment -= hasSettingsIntent ? 10 : 95;
    }

    if (info.category === 'action') {
      adjustment -= hasActionIntent ? 8 : 80;
    }

    if (info.category === 'repo-code') {
      adjustment -= 18;
    }

    if (info.category === 'repo-child' && info.depth >= 4) {
      adjustment -= 14;
    }

    if (coverageStats && coverageStats.total >= 2) {
      const isRepresentativePage =
        info.category === 'site-root' ||
        info.category === 'repo-root' ||
        info.category === 'section' ||
        info.category === 'landing';
      if (coverageStats.allMatched) {
        if (info.category === 'repo-root') {
          adjustment += 18;
        } else if (!isRepresentativePage) {
          adjustment += 12;
        }
      } else if (isRepresentativePage) {
        adjustment -= Math.min(36, coverageStats.missingCount * 18);
        if ((item.type === 'topSite' || item.isTopSite) && info.category !== 'repo-root') {
          adjustment -= 6;
        }
      }
    }

    return adjustment;
  }

  function getOwnExtensionUtilityPenalty(item, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const isOwnExtensionUrl = typeof settings.isOwnExtensionUrl === 'function'
      ? settings.isOwnExtensionUrl
      : () => false;
    const hasSettingsIntent = Boolean(settings.hasSettingsIntent);
    if (!item || !item.url || !isOwnExtensionUrl(item.url) || hasSettingsIntent) {
      return 0;
    }
    try {
      const parsedUrl = new URL(item.url);
      const pathnameLower = String(parsedUrl.pathname || '').toLowerCase();
      if (pathnameLower.endsWith('/options.html') || pathnameLower.endsWith('options.html')) {
        return 110;
      }
    } catch (e) {
      return 0;
    }
    return 0;
  }

  function getNow(options) {
    const settings = options && typeof options === 'object' ? options : {};
    return Number(settings.now) || Date.now();
  }

  function getTitlePinyinScore(item, context, options) {
    const settings = options && typeof options === 'object' ? options : {};
    if (typeof settings.getTitlePinyinMatchScore !== 'function') {
      return 0;
    }
    const result = settings.getTitlePinyinMatchScore(item && item.title, context && context.normalizedPinyinQuery);
    return Number(result && result.score) || 0;
  }

  function calculateSearchRelevanceScore(item, sourceType, context, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const title = item.title ? String(item.title) : '';
    const titleLower = title.toLowerCase();
    const urlLower = item.url.toLowerCase();
    let hostname = '';
    let hostLabels = [];
    let titleTokens = [];
    let pathTokens = [];
    let textScore = 0;
    let behaviorScore = 0;
    let sourceScore = 0;
    let coverageStats = null;
    const now = getNow(settings);

    if (titleLower === context.queryLower) textScore += 140;
    if (titleLower.startsWith(context.queryLower)) textScore += 70;

    titleTokens = splitSearchTerms(titleLower);
    if (titleTokens.includes(context.queryLower)) {
      textScore += 45;
    }

    const fullInitialsMatch = getSearchTitleInitialsMatchType(title, context.queryLower);
    if (fullInitialsMatch === 'exact') {
      textScore += 42;
    } else if (fullInitialsMatch === 'prefix') {
      textScore += 28;
    }

    context.queryTerms.forEach((word) => {
      if (!word) {
        return;
      }
      if (titleTokens.includes(word)) {
        textScore += 24;
        return;
      }
      if (titleTokens.some((token) => token.startsWith(word))) {
        textScore += 14;
        return;
      }
      const initialsMatch = getSearchTitleInitialsMatchType(title, word);
      if (initialsMatch === 'exact') {
        textScore += 24;
        return;
      }
      if (initialsMatch === 'prefix') {
        textScore += 16;
        return;
      }
      if (shouldAllowLooseTextContains(word) && titleLower.includes(word)) textScore += 8;
    });

    if (shouldAllowLooseTextContains(context.queryLower) && titleLower.includes(context.queryLower)) textScore += 24;

    try {
      hostname = normalizeHost(new URL(item.url).hostname);
      hostLabels = hostname.split('.').filter(Boolean);
      if (shouldAllowLooseTextContains(context.queryLower) && hostname.includes(context.queryLower)) textScore += 14;
      if (hostname.startsWith(context.queryLower)) textScore += 20;
      if (hostLabels.includes(context.queryLower)) {
        textScore += 42;
      }
      context.queryTerms.forEach((word) => {
        if (!word) {
          return;
        }
        if (hostLabels.includes(word)) {
          textScore += 28;
          return;
        }
        if (hostLabels.some((label) => label.startsWith(word))) {
          textScore += 16;
          return;
        }
        if (shouldAllowLooseTextContains(word) && hostname.includes(word)) {
          textScore += 8;
        }
      });
    } catch (e) {
      // Ignore invalid URL.
    }

    if (shouldAllowLooseTextContains(context.queryLower) && urlLower.includes(context.queryLower)) textScore += 10;
    try {
      const parsedUrl = new URL(item.url);
      const pathnameLower = String(parsedUrl.pathname || '').toLowerCase();
      const decodedPathnameLower = decodeURIComponent(pathnameLower);
      const pathSegments = decodedPathnameLower.split('/').filter(Boolean);
      pathSegments.forEach((segment) => {
        const segmentTokens = segment.split(/[^a-z0-9\u4e00-\u9fff]+/i).filter(Boolean);
        if (segmentTokens.length > 0) {
          pathTokens.push(...segmentTokens);
        }
      });
      if (decodedPathnameLower && context.queryTerms.length > 0) {
        context.queryTerms.forEach((word) => {
          if (!word) {
            return;
          }
          if (pathTokens.includes(word)) {
            textScore += 32;
            return;
          }
          if (pathTokens.some((token) => token.startsWith(word))) {
            textScore += 18;
            return;
          }
          if (shouldAllowLooseTextContains(word) && pathTokens.some((token) => token.includes(word))) {
            textScore += 10;
            return;
          }
          if (shouldAllowLooseTextContains(word) && decodedPathnameLower.includes(word)) {
            textScore += 8;
          }
        });
      }
    } catch (e) {
      // Ignore invalid URL parsing/decoding errors.
    }

    coverageStats = getSearchTermCoverageStats(context, {
      titleLower,
      hostname,
      urlLower,
      titleTokens,
      hostLabels,
      pathTokens
    });

    textScore += getTitlePinyinScore(item, context, settings);

    const isLocalNetworkHost = typeof settings.isLocalNetworkHost === 'function'
      ? settings.isLocalNetworkHost
      : () => false;
    if (hostname && isLocalNetworkHost(hostname)) {
      if (titleLower === context.queryLower) textScore += 60;
      else if (titleLower.startsWith(context.queryLower)) textScore += 42;
      else if (shouldAllowLooseTextContains(context.queryLower) && titleLower.includes(context.queryLower)) textScore += 24;
      else if (shouldAllowLooseTextContains(context.queryLower) && urlLower.includes(context.queryLower)) textScore += 20;
    }

    if (textScore <= 0) {
      return 0;
    }

    if (item.lastVisitTime) {
      const daysSinceVisit = (now - item.lastVisitTime) / (1000 * 60 * 60 * 24);
      if (daysSinceVisit < 1) behaviorScore += 10;
      else if (daysSinceVisit < 7) behaviorScore += 5;
      else if (daysSinceVisit < 30) behaviorScore += 2;
    }

    const visitCount = Number(item.visitCount) > 0 ? Number(item.visitCount) : 0;
    const typedCount = Number(item.typedCount) > 0 ? Number(item.typedCount) : 0;
    if (visitCount > 0) {
      behaviorScore += Math.min(18, Math.log2(visitCount + 1) * 4);
    }
    if (typedCount > 0) {
      behaviorScore += Math.min(12, typedCount * 2);
    }
    if (item.lastVisitTime) {
      const hoursSinceVisit = (now - item.lastVisitTime) / (1000 * 60 * 60);
      if (hoursSinceVisit < 2) behaviorScore += 20;
      else if (hoursSinceVisit < 24) behaviorScore += 14;
      else if (hoursSinceVisit < 72) behaviorScore += 8;
    }

    if (sourceType === 'bookmark') {
      sourceScore += 12;
    } else if (sourceType === 'history') {
      sourceScore += 4;
    } else if (sourceType === 'topSite') {
      sourceScore += 6;
    }
    sourceScore += getSearchSourceAdjustment(sourceType, context.intentType);

    return textScore +
      behaviorScore +
      sourceScore +
      getSearchSuggestionCategoryAdjustment(item, context, coverageStats) +
      getSearchDirectNavigationAdjustment(item, sourceType, context) -
      getOwnExtensionUtilityPenalty(item, {
        hasSettingsIntent: context.hasSettingsIntent,
        isOwnExtensionUrl: settings.isOwnExtensionUrl
      });
  }

  function getRecentPopularityBoost(suggestion, options) {
    if (!suggestion) {
      return 0;
    }
    let boost = 0;
    const now = getNow(options);
    const visitCount = Number(suggestion.visitCount) > 0 ? Number(suggestion.visitCount) : 0;
    const typedCount = Number(suggestion.typedCount) > 0 ? Number(suggestion.typedCount) : 0;
    if (visitCount > 0) {
      boost += Math.min(10, Math.log2(visitCount + 1) * 2.5);
    }
    if (typedCount > 0) {
      boost += Math.min(6, typedCount * 1.25);
    }
    const lastVisitTime = Number(suggestion.lastVisitTime) || 0;
    if (lastVisitTime > 0) {
      const hoursSinceVisit = (now - lastVisitTime) / (1000 * 60 * 60);
      if (hoursSinceVisit < 2) boost += 10;
      else if (hoursSinceVisit < 24) boost += 6;
      else if (hoursSinceVisit < 72) boost += 3;
    }
    return boost;
  }

  function getSearchSelectionBoost(item, context, stats, options) {
    if (!item || !item.url || !context || !stats || typeof stats !== 'object') {
      return 0;
    }
    const queryKey = normalizeSearchSelectionQuery(context.lookupQuery || context.queryLower);
    if (!queryKey) {
      return 0;
    }
    const bucket = stats.queries && stats.queries[queryKey] ? stats.queries[queryKey] : null;
    if (!bucket || !bucket.entries) {
      return 0;
    }
    const urlKey = buildSearchDedupUrlKey(item.url);
    const entry = urlKey ? bucket.entries[urlKey] : null;
    if (!entry) {
      return 0;
    }
    const settings = options && typeof options === 'object' ? options : {};
    const now = getNow(settings);
    const lastSelectedAt = Number(entry.lastSelectedAt) || 0;
    if (!lastSelectedAt) {
      return 0;
    }
    const retentionDays = Number(settings.retentionDays) > 0
      ? Number(settings.retentionDays)
      : SEARCH_SELECTION_POLICY.retentionDays;
    const ageDays = (now - lastSelectedAt) / (1000 * 60 * 60 * 24);
    if (ageDays > retentionDays) {
      return 0;
    }
    const count = Math.max(1, Number(entry.count) || 1);
    const frequencyBoost = Math.min(256, Math.log2(count + 1) * 64);
    let recencyBoost = 0;
    if (ageDays < 1) recencyBoost = 64;
    else if (ageDays < 7) recencyBoost = 44;
    else if (ageDays < 30) recencyBoost = 24;
    else recencyBoost = 10;
    const maxBoost = Number(settings.maxSelectionBoost) > 0
      ? Number(settings.maxSelectionBoost)
      : SEARCH_SELECTION_POLICY.maxSelectionBoost;
    return Math.min(maxBoost, frequencyBoost + recencyBoost);
  }

  function getSearchSuggestionSourceRank(suggestion) {
    if (!suggestion) {
      return 0;
    }
    if (suggestion.type === 'bookmark') {
      return 3;
    }
    if (suggestion.type === 'history') {
      return 2;
    }
    if (suggestion.type === 'topSite' || suggestion.isTopSite) {
      return 1;
    }
    return 0;
  }

  function compareSearchSuggestions(a, b, options) {
    const scoreDiff = ((b.score || 0) + getRecentPopularityBoost(b, options)) -
      ((a.score || 0) + getRecentPopularityBoost(a, options));
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    const sourceRankDiff = getSearchSuggestionSourceRank(b) - getSearchSuggestionSourceRank(a);
    if (sourceRankDiff !== 0) {
      return sourceRankDiff;
    }
    const visitDiff = (Number(b.visitCount) || 0) - (Number(a.visitCount) || 0);
    if (visitDiff !== 0) {
      return visitDiff;
    }
    const aVisit = a.lastVisitTime || 0;
    const bVisit = b.lastVisitTime || 0;
    return bVisit - aVisit;
  }

  function createSearchSuggestion(item, sourceType, score, extras) {
    return {
      type: sourceType,
      title: getSearchSuggestionDisplayTitle(item, sourceType),
      url: item.url,
      favicon: extras && extras.favicon ? extras.favicon : '',
      score,
      lastVisitTime: Number(item.lastVisitTime) || 0,
      visitCount: Number(item.visitCount) || 0,
      typedCount: Number(item.typedCount) || 0,
      reasons: extras && Array.isArray(extras.reasons) ? extras.reasons : [],
      ...(extras || {})
    };
  }

  function buildSearchBrandDirectSuggestion(candidates, context, options) {
    const settings = options && typeof options === 'object' ? options : {};
    if (context.intentType !== 'brand' || context.hasInformationalIntent) {
      return null;
    }
    const hostGroups = new Map();
    (Array.isArray(candidates) ? candidates : []).forEach((suggestion) => {
      if (!suggestion || !suggestion.url || suggestion.type === 'googleSuggest') {
        return;
      }
      const info = getSearchSuggestionClusterInfo(suggestion.url);
      if (!info.host) {
        return;
      }
      const list = hostGroups.get(info.host) || [];
      list.push(suggestion);
      hostGroups.set(info.host, list);
    });

    let bestGroup = null;
    hostGroups.forEach((group, host) => {
      const hostScore = getSearchBrandHostMatchScore(host, context);
      if (hostScore <= 0) {
        return;
      }
      const sourceSuggestion = group
        .slice()
        .sort((a, b) => {
          const signalDiff = getSearchNavigationRepresentativeSignal(b, context) -
            getSearchNavigationRepresentativeSignal(a, context);
          if (signalDiff !== 0) {
            return signalDiff;
          }
          return (b.score || 0) - (a.score || 0);
        })[0];
      const hasRepresentative = group.some((suggestion) => {
        const info = getSearchSuggestionClusterInfo(suggestion && suggestion.url);
        return info.category === 'site-root' ||
          info.category === 'repo-root' ||
          info.category === 'section' ||
          info.category === 'landing' ||
          hasSearchHomeTitle(suggestion && suggestion.title);
      });
      const totalScore = hostScore +
        Math.max(0, getSearchNavigationRepresentativeSignal(sourceSuggestion, context)) +
        Math.min(8, group.length * 2);
      if (!bestGroup || totalScore > bestGroup.totalScore) {
        bestGroup = {
          host,
          sourceSuggestion,
          hasRepresentative,
          totalScore
        };
      }
    });

    if (!bestGroup || bestGroup.hasRepresentative || !bestGroup.sourceSuggestion) {
      return null;
    }

    const directUrl = getSearchDirectNavigationUrl(bestGroup.host);
    const directTitle = getSearchDirectNavigationTitle(
      bestGroup.host,
      bestGroup.sourceSuggestion.title || bestGroup.host
    );
    const sourceType = bestGroup.sourceSuggestion.type === 'bookmark'
      ? 'bookmark'
      : ((bestGroup.sourceSuggestion.type === 'topSite' || bestGroup.sourceSuggestion.isTopSite) ? 'topSite' : 'history');
    const directItem = {
      title: directTitle,
      url: directUrl,
      lastVisitTime: bestGroup.sourceSuggestion.lastVisitTime || 0,
      visitCount: Number(bestGroup.sourceSuggestion.visitCount) || 0,
      typedCount: Number(bestGroup.sourceSuggestion.typedCount) || 0
    };
    const baseScore = calculateSearchRelevanceScore(directItem, sourceType, context, settings);
    if (baseScore <= 0) {
      return null;
    }
    const reasons = ['站点直达'];
    if (typeof settings.buildReasons === 'function') {
      reasons.push(...settings.buildReasons(directItem, sourceType, context));
    }
    return createSearchSuggestion(directItem, sourceType, baseScore + 36, {
      favicon: typeof settings.buildFavicon === 'function' ? settings.buildFavicon(directUrl) : '',
      reasons: reasons.slice(0, 3),
      isTopSite: true,
      isSyntheticDirect: true
    });
  }

  function applySearchSuggestionHostDiversity(list) {
    const candidates = Array.isArray(list) ? list : [];
    const selected = [];
    const selectedKeys = new Set();
    const hostCounts = new Map();
    const clusterCounts = new Map();
    const hostHasTopSiteRepresentative = new Set();

    const tryTake = (suggestion, hostLimit, clusterLimit) => {
      if (!suggestion) {
        return false;
      }
      const dedupKey = buildSearchDedupEntryKey(suggestion);
      if (!dedupKey || selectedKeys.has(dedupKey)) {
        return false;
      }
      const info = getSearchSuggestionClusterInfo(suggestion.url);
      const isEngineSuggestion = suggestion.type === 'googleSuggest';
      const hostKey = isEngineSuggestion ? dedupKey : (info.host || '__nohost__');
      const clusterKey = isEngineSuggestion ? dedupKey : (info.clusterKey || dedupKey);
      const currentHostCount = hostCounts.get(hostKey) || 0;
      const currentClusterCount = clusterCounts.get(clusterKey) || 0;
      if (currentHostCount >= hostLimit || currentClusterCount >= clusterLimit) {
        return false;
      }
      selected.push(suggestion);
      selectedKeys.add(dedupKey);
      hostCounts.set(hostKey, currentHostCount + 1);
      clusterCounts.set(clusterKey, currentClusterCount + 1);
      return true;
    };

    candidates.forEach((suggestion) => {
      if (!suggestion || !(suggestion.type === 'topSite' || suggestion.isTopSite)) {
        return;
      }
      const info = getSearchSuggestionClusterInfo(suggestion.url);
      const hostKey = info.host || '__nohost__';
      if (hostHasTopSiteRepresentative.has(hostKey)) {
        return;
      }
      const isRepresentativeCategory =
        info.category === 'site-root' ||
        info.category === 'repo-root' ||
        info.category === 'section' ||
        info.category === 'landing';
      if (!isRepresentativeCategory) {
        return;
      }
      if (tryTake(
        suggestion,
        SEARCH_POLICY.topSiteRepresentativeHostLimit,
        SEARCH_POLICY.topSiteRepresentativeClusterLimit
      )) {
        hostHasTopSiteRepresentative.add(hostKey);
      }
    });

    candidates.forEach((suggestion) => {
      tryTake(suggestion, SEARCH_POLICY.primaryHostLimit, SEARCH_POLICY.primaryClusterLimit);
    });

    if (selected.length < SEARCH_POLICY.finalSuggestionLimit) {
      candidates.forEach((suggestion) => {
        tryTake(suggestion, SEARCH_POLICY.secondaryHostLimit, SEARCH_POLICY.secondaryClusterLimit);
      });
    }

    return selected.slice(0, SEARCH_POLICY.finalSuggestionLimit);
  }

  function limitSearchSuggestionsForDisplay(list, options) {
    const suggestions = Array.isArray(list) ? list : [];
    const settings = options && typeof options === 'object' ? options : {};
    const rawLimit = Number(settings.limit);
    const fallbackLimit = Number(SEARCH_POLICY.displaySuggestionLimit) || 10;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.floor(rawLimit)
      : fallbackLimit;
    return suggestions.slice(0, limit);
  }

  function normalizeSearchSuggestionSourceFilterType(value) {
    if (value === 'topSite' || value === 'topSites' || value === 'frequent' || value === 'common') {
      return 'topSite';
    }
    if (value === 'bookmark' || value === 'bookmarks') {
      return 'bookmark';
    }
    if (value === 'history') {
      return 'history';
    }
    return '';
  }

  function getSearchSuggestionFilterType(suggestion) {
    if (!suggestion) {
      return '';
    }
    if (suggestion.type === 'topSite' || suggestion.isTopSite) {
      return 'topSite';
    }
    if (suggestion.type === 'bookmark') {
      return 'bookmark';
    }
    if (suggestion.type === 'history') {
      return 'history';
    }
    return '';
  }

  function filterSearchSuggestionsBySourceTypes(list, sourceTypes) {
    const suggestions = Array.isArray(list) ? list : [];
    const selectedTypes = Array.isArray(sourceTypes)
      ? sourceTypes.map(normalizeSearchSuggestionSourceFilterType).filter(Boolean)
      : [];
    if (selectedTypes.length <= 0) {
      return suggestions.slice();
    }
    const selected = new Set(selectedTypes);
    return suggestions.filter((suggestion) => {
      const filterType = getSearchSuggestionFilterType(suggestion);
      return !filterType || selected.has(filterType);
    });
  }

  function getTitlePinyinMatchResult(item, context, options) {
    const settings = options && typeof options === 'object' ? options : {};
    if (!context || !context.useTitlePinyinMatch || !item || !item.title ||
        typeof settings.getTitlePinyinMatchScore !== 'function') {
      return { score: 0, reason: '' };
    }
    return settings.getTitlePinyinMatchScore(item.title, context.normalizedPinyinQuery) || { score: 0, reason: '' };
  }

  function matchesSearchTitlePinyin(item, context, options) {
    return getTitlePinyinMatchResult(item, context, options).score > 0;
  }

  function collectSearchMatches(items, context, searchBlacklistItems, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const isUrlBlocked = typeof settings.isUrlBlockedBySearchBlacklist === 'function'
      ? settings.isUrlBlockedBySearchBlacklist
      : () => false;
    return (Array.isArray(items) ? items : []).filter((item) => (
      (matchesSearchQueryText(item, context) || matchesSearchTitlePinyin(item, context, settings)) &&
      !isUrlBlocked(item && item.url, searchBlacklistItems)
    ));
  }

  function buildComparableNavigationUrl(url) {
    try {
      const parsed = new URL(String(url || '').trim());
      parsed.protocol = String(parsed.protocol || '').toLowerCase();
      parsed.hostname = normalizeHost(parsed.hostname);
      if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
        parsed.port = '';
      }
      parsed.hash = '';
      parsed.pathname = parsed.pathname !== '/' ? (parsed.pathname.replace(/\/+$/, '') || '/') : '/';
      return parsed.toString();
    } catch (e) {
      return String(url || '').trim().toLowerCase();
    }
  }

  function buildTabMatchUrl(url, options) {
    if (!url) {
      return '';
    }
    const settings = options && typeof options === 'object' ? options : {};
    try {
      const parsed = new URL(String(url));
      const protocol = String(parsed.protocol || '').toLowerCase();
      if (protocol !== 'http:' && protocol !== 'https:') {
        return String(url).trim().toLowerCase();
      }
      const hostname = normalizeHost(parsed.hostname);
      const authority = parsed.port ? `${hostname}:${parsed.port}` : hostname;
      let path = parsed.pathname || '/';
      path = path.replace(/\/+$/, '');
      if (!path) {
        path = '/';
      }
      const search = settings.includeSearch === false ? '' : (parsed.search || '');
      return `${authority}${path}${search}`;
    } catch (e) {
      return String(url).trim().toLowerCase();
    }
  }

  function getDirectNavigationUrlForQuery(rawQuery, options) {
    const settings = options && typeof options === 'object' ? options : {};
    if (typeof settings.getDirectNavigationUrl !== 'function') {
      return '';
    }
    try {
      return String(settings.getDirectNavigationUrl(rawQuery) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function isDirectNavigationMatch(suggestion, rawQuery, options) {
    if (!suggestion || !suggestion.url) {
      return false;
    }
    const settings = options && typeof options === 'object' ? options : {};
    const directUrl = String(settings.directNavigationUrl || getDirectNavigationUrlForQuery(rawQuery, settings) || '').trim();
    if (!directUrl) {
      return false;
    }
    return buildComparableNavigationUrl(suggestion.url) === buildComparableNavigationUrl(directUrl);
  }

  function findSearchOpenTabMatchIndex(list, options) {
    const suggestions = Array.isArray(list) ? list : [];
    const settings = options && typeof options === 'object' ? options : {};
    const rawQuery = String(settings.rawQuery || settings.query || '').trim();
    const primaryHighlightIndex = Number.isInteger(settings.primaryHighlightIndex)
      ? settings.primaryHighlightIndex
      : -1;
    const directNavigationPrimaryIndex = primaryHighlightIndex >= 0 ? primaryHighlightIndex : 0;
    const hasDirectNavigationPrimary = Boolean(
      suggestions[directNavigationPrimaryIndex] &&
      isDirectNavigationMatch(suggestions[directNavigationPrimaryIndex], rawQuery, settings)
    );
    const matchesPrimaryNavigationIntent = (suggestion) => (
      !hasDirectNavigationPrimary ||
      isDirectNavigationMatch(suggestion, rawQuery, settings)
    );
    const isEligibleOpenTab = (suggestion) => Boolean(
      suggestion &&
      suggestion.type !== 'newtab' &&
      typeof suggestion._xMatchedTabId === 'number' &&
      matchesPrimaryNavigationIntent(suggestion)
    );

    if (settings.prioritizeCurrentPageMatch && typeof settings.currentTabId === 'number') {
      const currentIndex = suggestions.findIndex((suggestion) => (
        isEligibleOpenTab(suggestion) &&
        suggestion._xMatchedTabId === settings.currentTabId
      ));
      if (currentIndex >= 0) {
        return { index: currentIndex, reason: 'currentOpenTab' };
      }
    }

    if (settings.openTabQuickSwitchEnabled) {
      const openTabIndex = suggestions.findIndex(isEligibleOpenTab);
      if (openTabIndex >= 0) {
        return { index: openTabIndex, reason: 'openTab' };
      }
    }

    return { index: -1, reason: '' };
  }

  function getNavigationSuggestionPathDepth(url) {
    try {
      return new URL(String(url || '').trim()).pathname.split('/').filter(Boolean).length;
    } catch (e) {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  function getDefaultNavigationUrlDisplay(url) {
    try {
      const parsed = new URL(String(url || '').trim());
      return `${normalizeHost(parsed.hostname)}${parsed.pathname === '/' ? '' : parsed.pathname}`;
    } catch (e) {
      return String(url || '').trim();
    }
  }

  function getStrongNavigationMatchScore(suggestion, rawQuery, options) {
    const settings = options && typeof options === 'object' ? options : {};
    if (!suggestion || !suggestion.url || suggestion.type === 'newtab' || suggestion.type === 'googleSuggest') {
      return 0;
    }
    const query = String(rawQuery || '').trim();
    if (!query) {
      return 0;
    }

    const queryLower = query.toLowerCase();
    const directUrl = getDirectNavigationUrlForQuery(query, settings);
    const getUrlDisplay = typeof settings.getUrlDisplay === 'function'
      ? settings.getUrlDisplay
      : getDefaultNavigationUrlDisplay;
    const suggestionUrlText = (getUrlDisplay(suggestion.url) || '').toLowerCase();
    const titleLower = String(suggestion.title || '').toLowerCase();

    if (directUrl) {
      const isDirectMatch = isDirectNavigationMatch(suggestion, query, {
        ...settings,
        directNavigationUrl: directUrl
      });
      if (suggestion.type !== 'directUrl' && isDirectMatch) {
        return 520;
      }
      if (suggestionUrlText && suggestionUrlText === queryLower) {
        return suggestion.type === 'directUrl' ? 420 : 480;
      }
      if (suggestion.type === 'directUrl' && isDirectMatch) {
        return 400;
      }
      if (suggestionUrlText && suggestionUrlText.startsWith(queryLower)) {
        return suggestion.type === 'directUrl' ? 320 : 280;
      }
      return 0;
    }

    if (/\s/.test(query) || queryLower.length < 4) {
      return 0;
    }

    const genericTerms = new Set(['home', 'login', 'account', 'settings', 'dashboard', 'search', 'docs', 'help', 'api']);
    if (genericTerms.has(queryLower)) {
      return 0;
    }

    let score = 0;
    const titleTerms = splitSearchTerms(titleLower);
    if (titleTerms.includes(queryLower)) {
      score += 140;
    } else if (titleLower.startsWith(queryLower)) {
      score += 100;
    } else if (titleLower.includes(queryLower)) {
      score += 42;
    } else {
      return 0;
    }

    const depth = getNavigationSuggestionPathDepth(suggestion.url);
    if (depth === 0) {
      score += 90;
    } else if (depth === 1) {
      score += 36;
    } else if (Number.isFinite(depth)) {
      score -= Math.min(32, (depth - 1) * 8);
    }

    if (/(^|[\s-])(home|首页)([\s-]|$)/i.test(titleLower)) {
      score += 28;
    }
    if (suggestion.type === 'bookmark') {
      score += 16;
    } else if (suggestion.type === 'history') {
      score += 10;
    } else if (suggestion.type === 'topSite' || suggestion.isTopSite) {
      score += 12;
    }
    const selectionBoost = Number(suggestion.selectionBoost) || 0;
    if (selectionBoost > 0) {
      score += Math.min(260, selectionBoost);
    }

    return score;
  }

  function promoteStrongNavigationMatch(list, rawQuery, options) {
    if (!Array.isArray(list)) {
      return null;
    }
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < list.length; i += 1) {
      const score = getStrongNavigationMatchScore(list[i], rawQuery, options);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestScore < 140 || bestIndex < 0) {
      return null;
    }
    if (bestIndex > 0) {
      const [picked] = list.splice(bestIndex, 1);
      list.unshift(picked);
      return picked;
    }
    return list[0] || null;
  }

  function normalizeSiteSearchTemplate(template) {
    if (!template) {
      return '';
    }
    return String(template)
      .trim()
      .replace(/\{\{\{s\}\}\}/g, '{query}')
      .replace(/\{s\}/g, '{query}')
      .replace(/\{searchTerms\}/g, '{query}');
  }

  const LOCAL_SEARCH_SOURCE_TYPES = new Set(['topSite', 'bookmark', 'history']);

  function normalizeLocalSearchScopeTrigger(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function findLocalSearchScope(input, rules) {
    const trigger = normalizeLocalSearchScopeTrigger(input);
    if (!trigger || !Array.isArray(rules)) {
      return null;
    }
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      const sourceType = String(rule && rule.searchSourceType ? rule.searchSourceType : '').trim();
      if (!LOCAL_SEARCH_SOURCE_TYPES.has(sourceType) || !Array.isArray(rule.keys)) {
        continue;
      }
      const matchedKey = rule.keys.find((key) => normalizeLocalSearchScopeTrigger(key) === trigger);
      if (!matchedKey) {
        continue;
      }
      return {
        sourceType,
        trigger,
        key: String(matchedKey)
      };
    }
    return null;
  }

  const INTERACTIVE_SITE_SEARCH_SUBMIT_STRATEGIES = Object.freeze([
    'geminiPrompt',
    'chatgptPrompt',
    'doubaoPrompt',
    'qianwenQuery',
    'yuanbaoPrompt',
    'minimaxPrompt',
    'deepseekPrompt',
    'kimiPrompt'
  ]);

  const DEFAULT_SITE_SEARCH_PROVIDERS = Object.freeze([
    { key: 'yt', aliases: ['youtube'], name: 'YouTube', template: 'https://www.youtube.com/results?search_query={query}' },
    { key: 'bb', aliases: ['bilibili', 'bili'], name: 'Bilibili', template: 'https://search.bilibili.com/all?keyword={query}' },
    { key: 'gh', aliases: ['github'], name: 'GitHub', template: 'https://github.com/search?q={query}' },
    { key: 'sf', aliases: ['stackoverflow', 'stack overflow'], name: 'Stack Overflow', template: 'https://stackoverflow.com/search?q={query}' },
    { key: 'mdn', aliases: ['mdn web docs'], name: 'MDN', template: 'https://developer.mozilla.org/en-US/search?q={query}' },
    { key: 'npm', aliases: ['npmjs'], name: 'npm', template: 'https://www.npmjs.com/search?q={query}' },
    { key: 'hf', aliases: ['huggingface', 'hugging face'], name: 'Hugging Face', template: 'https://huggingface.co/search/full-text?q={query}' },
    { key: 'gs', aliases: ['scholar', 'google scholar'], name: 'Google Scholar', template: 'https://scholar.google.com/scholar?q={query}' },
    { key: 'ss', aliases: ['semantic', 'semantic scholar'], name: 'Semantic Scholar', template: 'https://www.semanticscholar.org/search?q={query}' },
    { key: 'maps', aliases: ['map', 'google maps'], name: 'Google Maps', template: 'https://www.google.com/maps/search/?api=1&query={query}' },
    { key: 'gpt', aliases: ['chatgpt', 'openai'], name: 'ChatGPT', template: 'https://chatgpt.com/?hints=search&ref=ext&q={query}', action: 'openAndSubmit', submitStrategy: 'chatgptPrompt' },
    { key: 'gm', aliases: ['gemini'], name: 'Gemini', template: 'https://gemini.google.com/app', action: 'openAndSubmit', submitStrategy: 'geminiPrompt' },
    { key: 'dbai', aliases: ['doubao', '豆包'], name: '豆包', template: 'https://www.doubao.com/chat/', action: 'openAndSubmit', submitStrategy: 'doubaoPrompt' },
    { key: 'qw', aliases: ['qianwen', 'qwen', '千问'], name: '千问', template: 'https://www.qianwen.com/?q={query}', action: 'openAndSubmit', submitStrategy: 'qianwenQuery' },
    { key: 'yb', aliases: ['yuanbao', 'tencent', '腾讯元宝', '元宝'], name: '元宝', template: 'https://yuanbao.tencent.com/chat/', action: 'openAndSubmit', submitStrategy: 'yuanbaoPrompt' },
    { key: 'mx', aliases: ['minimax', 'mini max'], name: 'MiniMax', template: 'https://chat.minimax.io/', action: 'openAndSubmit', submitStrategy: 'minimaxPrompt' },
    { key: 'ds', aliases: ['deepseek', 'deep seek', '深度求索'], name: 'DeepSeek', template: 'https://chat.deepseek.com/', action: 'openAndSubmit', submitStrategy: 'deepseekPrompt' },
    { key: 'kimi', aliases: ['moonshot', '月之暗面'], name: 'Kimi', template: 'https://www.kimi.com/', action: 'openAndSubmit', submitStrategy: 'kimiPrompt' },
    { key: 'pplx', aliases: ['perplexity'], name: 'Perplexity', template: 'https://www.perplexity.ai/search?q={query}', category: 'aiSearch' },
    { key: 'metaso', aliases: ['秘塔', '秘塔ai', '秘塔搜索'], name: 'Metaso AI Search', template: 'https://metaso.cn/?q={query}', category: 'aiSearch' },
    { key: 'felo', aliases: ['felo search'], name: 'Felo', template: 'https://felo.ai/search?q={query}', category: 'aiSearch' },
    { key: 'bd', aliases: ['baidu', '百度'], name: 'Baidu', template: 'https://www.baidu.com/s?wd={query}', category: 'searchEngine' },
    { key: 'bi', aliases: ['bing'], name: 'Bing', template: 'https://www.bing.com/search?q={query}', category: 'searchEngine' },
    { key: 'gg', aliases: ['google'], name: 'Google', template: 'https://www.google.com/search?q={query}', category: 'searchEngine' },
    { key: 'ddg', aliases: ['duckduckgo', 'duck'], name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q={query}', category: 'searchEngine' },
    { key: 'br', aliases: ['brave', 'brave search'], name: 'Brave Search', template: 'https://search.brave.com/search?q={query}', category: 'searchEngine' },
    { key: 'eco', aliases: ['ecosia'], name: 'Ecosia', template: 'https://www.ecosia.org/search?q={query}', category: 'searchEngine' },
    { key: 'sg', aliases: ['sogou', '搜狗'], name: 'Sogou', template: 'https://www.sogou.com/web?query={query}', category: 'searchEngine' },
    { key: 'yh', aliases: ['yahoo'], name: 'Yahoo', template: 'https://search.yahoo.com/search?p={query}', category: 'searchEngine' },
    { key: 'yx', aliases: ['yandex'], name: 'Yandex', template: 'https://yandex.com/search/?text={query}', category: 'searchEngine' },
    { key: 'sm', aliases: ['shenma', '神马'], name: 'Shenma', template: 'https://m.sm.cn/s?q={query}', category: 'searchEngine' },
    { key: 'zh', aliases: ['zhihu'], name: 'Zhihu', template: 'https://www.zhihu.com/search?q={query}' },
    { key: 'db', aliases: ['douban'], name: 'Douban', template: 'https://www.douban.com/search?q={query}' },
    { key: 'jj', aliases: ['juejin'], name: 'Juejin', template: 'https://juejin.cn/search?query={query}' },
    { key: 'tb', aliases: ['taobao'], name: 'Taobao', template: 'https://s.taobao.com/search?q={query}' },
    { key: 'tm', aliases: ['tmall'], name: 'Tmall', template: 'https://list.tmall.com/search_product.htm?q={query}' },
    { key: 'wx', aliases: ['weixin', 'wechat'], name: 'WeChat Official Accounts', template: 'https://weixin.sogou.com/weixin?query={query}' },
    { key: 'tw', aliases: ['twitter', 'x'], name: 'X', template: 'https://x.com/search?q={query}' },
    { key: 'rd', aliases: ['reddit'], name: 'Reddit', template: 'https://www.reddit.com/search/?q={query}' },
    { key: 'wb', aliases: ['weibo', '微博'], name: 'Weibo', template: 'https://s.weibo.com/weibo?q={query}' },
    { key: 'xhs', aliases: ['rednote', '小红书'], name: 'Xiaohongshu', template: 'https://www.xiaohongshu.com/search_result?keyword={query}' },
    { key: 'dy', aliases: ['douyin', '抖音'], name: 'Douyin', template: 'https://www.douyin.com/search/{query}' },
    { key: 'jd', aliases: ['jingdong', '京东'], name: 'JD.com', template: 'https://search.jd.com/Search?keyword={query}' },
    { key: 'wk', aliases: ['wiki', 'wikipedia'], name: 'Wikipedia', template: 'https://en.wikipedia.org/wiki/Special:Search?search={query}' },
    { key: 'zw', aliases: ['zhwiki'], name: 'Wikipedia', template: 'https://zh.wikipedia.org/wiki/Special:Search?search={query}' }
  ]);

  const SITE_SEARCH_PROVIDER_DISPLAY_NAME_MESSAGES = Object.freeze({
    gpt: ['site_search_name_chatgpt', 'ChatGPT'],
    gm: ['site_search_name_gemini', 'Gemini'],
    dbai: ['site_search_name_doubao', 'Doubao'],
    qw: ['site_search_name_qianwen', 'Qianwen'],
    yb: ['site_search_name_yuanbao', 'Yuanbao'],
    mx: ['site_search_name_minimax', 'MiniMax'],
    ds: ['site_search_name_deepseek', 'DeepSeek'],
    kimi: ['site_search_name_kimi', 'Kimi'],
    metaso: ['site_search_name_metaso', 'Metaso AI Search'],
    bd: ['site_search_name_baidu', 'Baidu'],
    sg: ['site_search_name_sogou', 'Sogou'],
    sm: ['site_search_name_shenma', 'Shenma'],
    zh: ['site_search_name_zhihu', 'Zhihu'],
    db: ['site_search_name_douban', 'Douban'],
    jj: ['site_search_name_juejin', 'Juejin'],
    tb: ['site_search_name_taobao', 'Taobao'],
    tm: ['site_search_name_tmall', 'Tmall'],
    wx: ['site_search_name_wechat', 'WeChat Official Accounts'],
    wb: ['site_search_name_weibo', 'Weibo'],
    xhs: ['site_search_name_xiaohongshu', 'Xiaohongshu'],
    dy: ['site_search_name_douyin', 'Douyin'],
    jd: ['site_search_name_jd', 'JD.com'],
    zw: ['site_search_name_wikipedia', 'Wikipedia']
  });

  function cloneSiteSearchProvider(provider) {
    return {
      ...(provider || {}),
      aliases: Array.isArray(provider && provider.aliases) ? provider.aliases.slice() : []
    };
  }

  function getSiteSearchProviderDisplayNameMessage(provider) {
    if (provider && provider._xIsCustom === true) {
      return null;
    }
    const key = String(provider && provider.key ? provider.key : '').toLowerCase();
    const mapping = SITE_SEARCH_PROVIDER_DISPLAY_NAME_MESSAGES[key];
    if (!mapping) {
      return null;
    }
    return {
      messageKey: mapping[0],
      fallback: mapping[1]
    };
  }

  function getDefaultSiteSearchProviders() {
    return DEFAULT_SITE_SEARCH_PROVIDERS.map(cloneSiteSearchProvider);
  }

  function isInteractiveSiteSearchSubmitStrategy(strategy) {
    return INTERACTIVE_SITE_SEARCH_SUBMIT_STRATEGIES.includes(String(strategy || '').trim());
  }

  function hasOpenAndSubmitSiteSearchAction(provider) {
    return Boolean(
      provider &&
      String(provider.action || '').trim() === 'openAndSubmit'
    );
  }

  function isAiSiteSearchProvider(provider) {
    if (!provider) {
      return false;
    }
    if (String(provider.category || '').trim() === 'aiSearch') {
      return true;
    }
    if (hasOpenAndSubmitSiteSearchAction(provider)) {
      return true;
    }
    const template = normalizeSiteSearchTemplate(provider.template);
    return Boolean(template) && !template.includes('{query}');
  }

  const SEARCH_ENGINE_SITE_SEARCH_PROVIDER_KEYS = new Set([
    'bd',
    'bi',
    'gg',
    'ddg',
    'br',
    'eco',
    'sg',
    'yh',
    'yx',
    'sm'
  ]);

  function isRetiredSearchEngineState(searchEngineState) {
    const state = searchEngineState && typeof searchEngineState === 'object'
      ? searchEngineState
      : {};
    const stateId = String(state.id || '').trim().toLowerCase();
    const stateHost = normalizeHost(state.host) || getUrlHost(state.searchTemplate);
    return stateId === 'so' || stateHost === 'so.com' || stateHost.endsWith('.so.com');
  }

  function isSearchEngineSiteSearchProvider(provider) {
    if (!provider) {
      return false;
    }
    const category = String(provider.category || '').trim();
    if (category === 'searchEngine') {
      return true;
    }
    if (provider._xIsCustom === true) {
      return false;
    }
    const key = String(provider.key || '').trim().toLowerCase();
    return SEARCH_ENGINE_SITE_SEARCH_PROVIDER_KEYS.has(key);
  }

  function getSearchEngineSiteSearchProvider(searchEngineState, providers) {
    const state = searchEngineState && typeof searchEngineState === 'object'
      ? searchEngineState
      : {};
    const engineProviders = (Array.isArray(providers) ? providers : [])
      .filter(isSearchEngineSiteSearchProvider);
    const stateHost = normalizeHost(state.host) || getUrlHost(state.searchTemplate);
    const fallbackProvider = findSiteSearchProvider('google', engineProviders);
    if (isRetiredSearchEngineState(state)) {
      return fallbackProvider || null;
    }
    if (stateHost) {
      const hostMatch = engineProviders.find((provider) => siteSearchHostsMatch(
        stateHost,
        getSiteSearchProviderHost(provider)
      ));
      if (hostMatch) {
        return hostMatch;
      }
    }
    const stateName = String(state.name || '').trim().toLowerCase();
    if (stateName) {
      const nameMatch = engineProviders.find((provider) => (
        String(provider && provider.name || '').trim().toLowerCase() === stateName
      ));
      if (nameMatch) {
        return nameMatch;
      }
    }
    const stateId = String(state.id || '').trim().toLowerCase();
    if (stateId) {
      const aliasMatch = engineProviders.find((provider) => (
        Array.isArray(provider && provider.aliases) &&
        provider.aliases.some((alias) => String(alias || '').trim().toLowerCase() === stateId)
      ));
      if (aliasMatch) {
        return aliasMatch;
      }
    }
    const normalizedTemplate = normalizeSiteSearchTemplate(state.searchTemplate);
    if (!normalizedTemplate || !normalizedTemplate.includes('{query}')) {
      return fallbackProvider || null;
    }
    const keyToken = (stateId || stateHost || stateName || 'detected')
      .replace(/[^a-z0-9.-]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'detected';
    const displayName = String(state.name || state.host || state.id || '').trim() || 'Search';
    return {
      key: `engine-${keyToken}`,
      aliases: stateId ? [stateId] : [],
      name: displayName,
      template: normalizedTemplate,
      category: 'searchEngine',
      _xIsDetectedSearchEngine: true
    };
  }

  function isInteractiveSiteSearchProvider(provider) {
    return Boolean(
      hasOpenAndSubmitSiteSearchAction(provider) &&
      isInteractiveSiteSearchSubmitStrategy(provider.submitStrategy)
    );
  }

  function normalizeSiteSearchProvider(item, baseProvider) {
    if (!item && !baseProvider) {
      return null;
    }
    const key = String((item && item.key) || (baseProvider && baseProvider.key) || '').trim();
    const template = normalizeSiteSearchTemplate(
      (item && item.template) || (baseProvider && baseProvider.template) || ''
    );
    if (!key || !template) {
      return null;
    }
    if (!template.includes('{query}') && !isAiSiteSearchProvider({
      ...(baseProvider || {}),
      ...(item || {}),
      key,
      template
    })) {
      return null;
    }
    const aliasSource = Array.isArray(item && item.aliases)
      ? item.aliases
      : (Array.isArray(baseProvider && baseProvider.aliases) ? baseProvider.aliases : []);
    return {
      key,
      aliases: aliasSource.filter(Boolean),
      name: String((item && item.name) || (baseProvider && baseProvider.name) || key).trim() || key,
      template,
      action: String((item && item.action) || (baseProvider && baseProvider.action) || '').trim(),
      submitStrategy: String(
        (item && item.submitStrategy) || (baseProvider && baseProvider.submitStrategy) || ''
      ).trim(),
      category: String(
        (item && item.category) || (baseProvider && baseProvider.category) || ''
      ).trim(),
      disabled: Boolean(item && item.disabled),
      disabledReason: String((item && item.disabledReason) || '').trim(),
      icon: String((item && item.icon) || (baseProvider && baseProvider.icon) || '').trim(),
      iconUrl: String((item && item.iconUrl) || (baseProvider && baseProvider.iconUrl) || '').trim()
    };
  }

  function sanitizeSiteSearchProviders(items, baseItems) {
    const baseMap = new Map((Array.isArray(baseItems) ? baseItems : []).map((item) => [
      String(item && item.key ? item.key : '').toLowerCase(),
      item
    ]));
    return (Array.isArray(items) ? items : [])
      .map((item) => normalizeSiteSearchProvider(item, baseMap.get(String(item && item.key ? item.key : '').toLowerCase())))
      .filter(Boolean);
  }

  function inheritSiteSearchProviderBehavior(provider, baseProvider) {
    if (!provider) {
      return provider;
    }
    return {
      ...provider,
      action: String(provider.action || (baseProvider && baseProvider.action) || '').trim(),
      submitStrategy: String(
        provider.submitStrategy || (baseProvider && baseProvider.submitStrategy) || ''
      ).trim()
    };
  }

  function mergeCustomProviders(baseItems, customItems) {
    const merged = [];
    const seen = new Set();
    const baseMap = new Map((baseItems || []).map((item) => [String(item && item.key ? item.key : '').toLowerCase(), item]));
    (customItems || []).forEach((item) => {
      if (item && item.disabled) {
        return;
      }
      const key = String(item && item.key ? item.key : '').toLowerCase();
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push({
        ...inheritSiteSearchProviderBehavior(item, baseMap.get(key)),
        _xIsCustom: true
      });
    });
    (baseItems || []).forEach((item) => {
      const key = String(item && item.key ? item.key : '').toLowerCase();
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push(item);
    });
    return merged;
  }

  function buildSearchUrlFromTemplate(template, query) {
    const normalizedTemplate = normalizeSiteSearchTemplate(template);
    if (!normalizedTemplate) {
      return '';
    }
    if (!normalizedTemplate.includes('{query}')) {
      return normalizedTemplate;
    }
    return normalizedTemplate.replace(/\{query\}/g, encodeURIComponent(String(query || '')));
  }

  function buildBlacklistProbeUrlFromTemplate(template, query) {
    return buildSearchUrlFromTemplate(template, String(query || '').trim() || 'test');
  }

  function getUrlHost(url) {
    if (!url) {
      return '';
    }
    try {
      return normalizeHost(new URL(String(url)).hostname);
    } catch (e) {
      return '';
    }
  }

  function getSearchSuggestionHost(suggestion) {
    return getUrlHost(suggestion && suggestion.url);
  }

  function getSiteSearchProviderHost(provider) {
    if (!provider || !provider.template) {
      return '';
    }
    try {
      const url = String(provider.template).replace(/\{query\}/g, 'test');
      return normalizeHost(new URL(url).hostname);
    } catch (e) {
      return '';
    }
  }

  function siteSearchHostsMatch(a, b) {
    const hostA = normalizeHost(a);
    const hostB = normalizeHost(b);
    if (!hostA || !hostB) {
      return false;
    }
    return hostA === hostB || hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`);
  }

  function findSiteSearchProvider(trigger, providers) {
    const key = String(trigger || '').trim().toLowerCase();
    if (!key) {
      return null;
    }
    return (providers || []).find((provider) => {
      const providerKey = String(provider && provider.key || '').toLowerCase();
      if (providerKey === key) {
        return true;
      }
      const providerName = String(provider && provider.name || '').trim().toLowerCase();
      if (providerName === key) {
        return true;
      }
      const aliases = Array.isArray(provider && provider.aliases) ? provider.aliases : [];
      return aliases.some((alias) => String(alias).toLowerCase() === key);
    }) || null;
  }

  function findSiteSearchProviderByKey(trigger, providers) {
    const key = String(trigger || '').toLowerCase();
    if (!key) {
      return null;
    }
    return (providers || []).find((provider) => String(provider && provider.key || '').toLowerCase() === key) || null;
  }

  function findSiteSearchProviderKeyConflict(trigger, providers, allowedKey) {
    const key = String(trigger || '').trim().toLowerCase();
    const allowed = String(allowedKey || '').trim().toLowerCase();
    if (!key || key === allowed) {
      return null;
    }
    return findSiteSearchProviderByKey(key, providers);
  }

  function suggestionMatchesSiteSearchProvider(suggestion, provider) {
    if (!suggestion || !provider || !suggestion.url) {
      return false;
    }
    return siteSearchHostsMatch(getSearchSuggestionHost(suggestion), getSiteSearchProviderHost(provider));
  }

  function isAsciiProviderToken(token) {
    return /^[a-z0-9]+$/i.test(token || '');
  }

  function isSiteSearchProviderTokenEligible(token) {
    if (!token) {
      return false;
    }
    const normalized = String(token).trim();
    if (!normalized) {
      return false;
    }
    if (isAsciiProviderToken(normalized)) {
      return normalized.length >= 3;
    }
    return normalized.length >= 2;
  }

  function providerMatchesSiteSearchSuggestion(provider, suggestion) {
    if (!provider || !suggestion) {
      return false;
    }
    return suggestionMatchesSiteSearchProvider(suggestion, provider);
  }

  function findProviderForSiteSearchSuggestion(suggestion, providers) {
    if (!suggestion) {
      return null;
    }
    const eligibleTypes = new Set(['topSite', 'history', 'bookmark']);
    if (!eligibleTypes.has(suggestion.type) && !suggestion.isTopSite) {
      return null;
    }
    return (providers || []).find((provider) => providerMatchesSiteSearchSuggestion(provider, suggestion)) || null;
  }

  function findSiteSearchProviderByInput(input, providers) {
    const raw = String(input || '').trim();
    if (!raw) {
      return null;
    }
    const firstToken = raw.split(/\s+/)[0];
    const keyMatch = findSiteSearchProvider(firstToken, providers) ||
      findSiteSearchProviderByKey(firstToken, providers);
    if (keyMatch) {
      return keyMatch;
    }
    let host = '';
    if (/[./]/.test(firstToken)) {
      try {
        const url = firstToken.includes('://') ? firstToken : `https://${firstToken}`;
        host = new URL(url).hostname;
      } catch (e) {
        host = firstToken.split('/')[0] || '';
      }
    }
    if (!host) {
      return null;
    }
    const normalizedHost = normalizeHost(host);
    return (providers || []).find((provider) => siteSearchHostsMatch(
      normalizedHost,
      getSiteSearchProviderHost(provider)
    )) || null;
  }

  function getInlineSiteSearchCandidate(input, providers) {
    const raw = String(input || '').trim();
    if (!raw) {
      return null;
    }
    const tokens = raw.split(/\s+/);
    if (tokens.length < 2) {
      return null;
    }
    const provider = findSiteSearchProviderByInput(raw, providers);
    if (!provider) {
      return null;
    }
    const firstToken = tokens[0];
    const remainder = raw.slice(raw.indexOf(firstToken) + firstToken.length).trim();
    if (!remainder) {
      return null;
    }
    return { provider: provider, query: remainder };
  }

  function providerMatchesSiteSearchInputPrefix(provider, input) {
    const needle = String(input || '').toLowerCase();
    if (!needle || !provider) {
      return false;
    }
    const allowPrefix = needle.length >= 2;
    const tokens = [provider.key, provider.name].concat(provider.aliases || []);
    for (let i = 0; i < tokens.length; i += 1) {
      const token = String(tokens[i] || '').toLowerCase();
      if (!token) {
        continue;
      }
      if (token === needle || (allowPrefix && token.startsWith(needle))) {
        return true;
      }
    }
    const host = normalizeHost(getSiteSearchProviderHost(provider));
    if (host) {
      const hostToken = host.split('.')[0] || host;
      if (hostToken === needle || (allowPrefix && hostToken.startsWith(needle))) {
        return true;
      }
    }
    return false;
  }

  function siteSearchTemplatePartMatchesCandidate(candidatePart, probePart) {
    const candidateValue = String(candidatePart || '');
    const probeValue = String(probePart || '');
    if (!probeValue.includes(SITE_SEARCH_QUERY_PROBE)) {
      return candidateValue === probeValue;
    }
    const markerIndex = probeValue.indexOf(SITE_SEARCH_QUERY_PROBE);
    const prefix = probeValue.slice(0, markerIndex);
    const suffix = probeValue.slice(markerIndex + SITE_SEARCH_QUERY_PROBE.length);
    return candidateValue.startsWith(prefix) &&
      candidateValue.endsWith(suffix) &&
      candidateValue.length > prefix.length + suffix.length;
  }

  function isSiteSearchProviderSearchResultUrl(suggestion, provider) {
    const template = normalizeSiteSearchTemplate(provider && provider.template);
    if (!template || !template.includes('{query}') || !suggestion || !suggestion.url) {
      return false;
    }
    try {
      const candidateUrl = new URL(String(suggestion.url));
      const probeUrl = new URL(buildSearchUrlFromTemplate(template, SITE_SEARCH_QUERY_PROBE));
      if (!siteSearchHostsMatch(candidateUrl.hostname, probeUrl.hostname)) {
        return false;
      }
      if (!siteSearchTemplatePartMatchesCandidate(candidateUrl.pathname, probeUrl.pathname)) {
        return false;
      }
      if (probeUrl.pathname.includes(SITE_SEARCH_QUERY_PROBE)) {
        return true;
      }
      let queryParamMatches = false;
      probeUrl.searchParams.forEach((value, key) => {
        if (String(value || '').includes(SITE_SEARCH_QUERY_PROBE) && candidateUrl.searchParams.has(key)) {
          queryParamMatches = true;
        }
      });
      if (queryParamMatches) {
        return true;
      }
      return probeUrl.hash.includes(SITE_SEARCH_QUERY_PROBE) &&
        siteSearchTemplatePartMatchesCandidate(candidateUrl.hash, probeUrl.hash);
    } catch (e) {
      return false;
    }
  }

  function siteSearchSuggestionTitleMatchesInput(suggestion, input) {
    const needle = String(input || '').trim().toLowerCase();
    if (!isSiteSearchProviderTokenEligible(needle)) {
      return false;
    }
    const titleLower = String(suggestion && suggestion.title || '').trim().toLowerCase();
    if (!titleLower) {
      return false;
    }
    if (titleLower === needle || titleLower.startsWith(needle)) {
      return true;
    }
    const titleTokens = splitSearchTerms(titleLower);
    return titleTokens.includes(needle) ||
      titleTokens.some((token) => token.startsWith(needle)) ||
      (shouldAllowLooseTextContains(needle) && titleLower.includes(needle));
  }

  function providerMatchesSiteSearchSuggestionTitle(provider, suggestion, input) {
    if (!provider || !suggestion || !suggestionMatchesSiteSearchProvider(suggestion, provider)) {
      return false;
    }
    if (isSiteSearchProviderSearchResultUrl(suggestion, provider)) {
      return false;
    }
    return siteSearchSuggestionTitleMatchesInput(suggestion, input);
  }

  function getSiteSearchTriggerCandidate(input, providers, topSiteMatch, options) {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
      return null;
    }
    const exactProvider = findSiteSearchProvider(trimmed, providers) ||
      findSiteSearchProviderByKey(trimmed, providers);
    if (/\s/.test(trimmed) && !exactProvider) {
      return null;
    }
    let provider = exactProvider ||
      findSiteSearchProviderByInput(trimmed, providers);
    if (!provider && topSiteMatch) {
      provider = (providers || []).find((candidate) => {
        if (!suggestionMatchesSiteSearchProvider(topSiteMatch, candidate)) {
          return false;
        }
        return providerMatchesSiteSearchInputPrefix(candidate, trimmed) ||
          providerMatchesSiteSearchSuggestionTitle(candidate, topSiteMatch, trimmed);
      }) || null;
    }
    if (!provider) {
      return null;
    }
    const matchesTopSitePrefix = options && typeof options.matchesTopSitePrefix === 'function'
      ? options.matchesTopSitePrefix
      : null;
    if (topSiteMatch && trimmed.length <= 2 && matchesTopSitePrefix && matchesTopSitePrefix(topSiteMatch, trimmed)) {
      const providerHost = getSiteSearchProviderHost(provider);
      const topHost = getSearchSuggestionHost(topSiteMatch);
      if (!siteSearchHostsMatch(providerHost, topHost)) {
        return null;
      }
    }
    return provider;
  }

  return Object.freeze({
    SEARCH_POLICY,
    SEARCH_SELECTION_POLICY,
    applySearchSuggestionHostDiversity,
    buildBlacklistProbeUrlFromTemplate,
    buildSearchBrandDirectSuggestion,
    buildSearchDedupEntryKey,
    buildSearchDedupUrlKey,
    buildSearchQueryContext,
    buildSearchUrlFromTemplate,
    buildComparableNavigationUrl,
    buildTabMatchUrl,
    calculateSearchRelevanceScore,
    classifySearchIntent,
    collectSearchMatches,
    compareSearchSuggestions,
    createSearchSuggestion,
    areOnlyKeywordSearchSuggestions,
    getAutocompleteSearchSuggestionPool,
    getKeywordSearchSuggestionState,
    getSearchEngineSuggestionScore,
    getSearchEngineSuggestionPolicy,
    getSearchEngineSiteSearchProvider,
    getSearchNavigationRepresentativeSignal,
    getSearchSuggestionCategoryAdjustment,
    getSearchSuggestionClusterInfo,
    getSearchSuggestionSourceRank,
    getSearchSelectionBoost,
    getSearchTermCoverageStats,
    getStrongNavigationMatchScore,
    getDirectNavigationUrl,
    getDefaultSiteSearchProviders,
    findSearchOpenTabMatchIndex,
    isDirectNavigationMatch,
    getInlineSiteSearchCandidate,
    getSearchSuggestionHost,
    getSiteSearchProviderDisplayNameMessage,
    getSiteSearchProviderHost,
    getSiteSearchTriggerCandidate,
    getUrlHost,
    hasOpenAndSubmitSiteSearchAction,
    inheritSiteSearchProviderBehavior,
    isAiSiteSearchProvider,
    isSearchEngineSiteSearchProvider,
    isRetiredSearchEngineState,
    isInteractiveSiteSearchProvider,
    isInteractiveSiteSearchSubmitStrategy,
    isKeywordSearchSuggestion,
    isSearchLikelyBrandProductQuery,
    isSearchLikelyDirectNavigationQuery,
    isSearchEngineSuggestion,
    isShortAsciiSearchTerm,
    isSiteSearchProviderTokenEligible,
    limitSearchSuggestionsForDisplay,
    findProviderForSiteSearchSuggestion,
    findLocalSearchScope,
    findSiteSearchProvider,
    findSiteSearchProviderByInput,
    findSiteSearchProviderByKey,
    findSiteSearchProviderKeyConflict,
    filterSearchSuggestionsBySourceTypes,
    mergeCustomProviders,
    mergeItemsByUrl,
    matchesSearchQueryText,
    matchesSearchTitlePinyin,
    normalizeSearchEngineSuggestions,
    normalizeSearchSelectionQuery,
    normalizeSearchSelectionStats,
    normalizeHost,
    normalizeSiteSearchProvider,
    normalizeSiteSearchTemplate,
    providerMatchesSiteSearchInputPrefix,
    providerMatchesSiteSearchSuggestion,
    promoteStrongNavigationMatch,
    recordSearchSelectionInStats,
    sanitizeSiteSearchProviders,
    shouldAllowLooseTextContains,
    siteSearchHostsMatch,
    suggestionMatchesSiteSearchProvider
  });
});
