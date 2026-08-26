(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoBlacklistUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const DEFAULT_MATCH_MODE = 'prefix';

  function normalizeMatchModes(value, fallbackMode) {
    const source = Array.isArray(value) ? value : [value];
    const set = new Set();
    source.forEach((item) => {
      const mode = String(item || '').trim().toLowerCase();
      if (mode === 'exact' || mode === 'prefix' || mode === 'suffix') {
        set.add(mode);
      }
    });
    if (set.has('exact')) {
      return ['exact'];
    }
    const next = [];
    if (set.has('prefix')) {
      next.push('prefix');
    }
    if (set.has('suffix')) {
      next.push('suffix');
    }
    if (next.length > 0) {
      return next;
    }
    if (!fallbackMode) {
      return [];
    }
    return [fallbackMode];
  }

  function normalizeUrlLikePattern(value) {
    const withoutScheme = String(value || '').trim().replace(/^https?:\/\//i, '').trim();
    if (!withoutScheme) {
      return '';
    }
    try {
      const parsed = new URL(`https://${withoutScheme}`);
      if (!parsed.hostname) {
        return '';
      }
      parsed.hash = '';
      const host = String(parsed.host || '').toLowerCase();
      const path = String(parsed.pathname || '');
      const search = String(parsed.search || '');
      return `${host}${path}${search}`;
    } catch (error) {
      return '';
    }
  }

  function normalizeDomainPattern(value) {
    const raw = String(value || '').trim().replace(/^https?:\/\//i, '').trim();
    if (!raw) {
      return '';
    }
    try {
      const parsed = new URL(`https://${raw}`);
      const hostname = String(parsed.hostname || '').toLowerCase();
      if (!hostname) {
        return '';
      }
      return hostname.startsWith('www.')
        ? hostname.slice(4)
        : hostname;
    } catch (error) {
      return '';
    }
  }

  function normalizePattern(value, matchModes, fallbackMode) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    const modes = normalizeMatchModes(matchModes, fallbackMode);
    if (modes.length === 1 && modes[0] === 'suffix') {
      return normalizeDomainPattern(raw);
    }
    return normalizeUrlLikePattern(raw);
  }

  function normalizeUrlForMatching(url) {
    const raw = String(url || '').trim();
    if (!raw) {
      return '';
    }
    try {
      const parsed = new URL(raw);
      if (!/^https?:$/i.test(parsed.protocol)) {
        return '';
      }
      parsed.hash = '';
      const host = String(parsed.host || '').toLowerCase();
      const path = String(parsed.pathname || '');
      const search = String(parsed.search || '');
      return `${host}${path}${search}`;
    } catch (error) {
      return '';
    }
  }

  function splitHostPathQuery(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return null;
    }
    const queryIndex = normalized.indexOf('?');
    const withoutQuery = queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
    const search = queryIndex >= 0 ? normalized.slice(queryIndex) : '';
    const slashIndex = withoutQuery.indexOf('/');
    const host = (slashIndex >= 0 ? withoutQuery.slice(0, slashIndex) : withoutQuery).toLowerCase();
    const path = slashIndex >= 0 ? withoutQuery.slice(slashIndex) : '/';
    if (!host) {
      return null;
    }
    return { host, path: path || '/', search };
  }

  function canToggleWwwHost(host) {
    const normalized = String(host || '').trim().toLowerCase();
    if (!normalized || normalized === 'localhost' || normalized.includes(':')) {
      return false;
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
      return false;
    }
    return normalized.includes('.');
  }

  function toggleWwwHost(host) {
    const normalized = String(host || '').trim().toLowerCase();
    if (!canToggleWwwHost(normalized)) {
      return '';
    }
    return normalized.startsWith('www.')
      ? normalized.slice(4)
      : `www.${normalized}`;
  }

  function getEquivalentPatterns(pattern) {
    const parts = splitHostPathQuery(pattern);
    if (!parts) {
      return [];
    }
    const toggledHost = toggleWwwHost(parts.host);
    if (!toggledHost || toggledHost === parts.host) {
      return [];
    }
    return [`${toggledHost}${parts.path}${parts.search}`];
  }

  function buildRuleKey(rule, fallbackMode) {
    if (!rule || !rule.pattern) {
      return '';
    }
    const modes = normalizeMatchModes(rule.matchModes, fallbackMode);
    return `${String(rule.pattern)}::${modes.join('|')}`;
  }

  function normalizeItems(items, fallbackMode) {
    if (!Array.isArray(items)) {
      return [];
    }
    const normalized = [];
    const seen = new Set();
    items.forEach((entry) => {
      const matchModes = normalizeMatchModes(
        entry && entry.matchModes ? entry.matchModes : [DEFAULT_MATCH_MODE],
        fallbackMode === undefined ? DEFAULT_MATCH_MODE : fallbackMode
      );
      const pattern = normalizePattern(
        entry && entry.pattern ? entry.pattern : entry,
        matchModes,
        fallbackMode === undefined ? DEFAULT_MATCH_MODE : fallbackMode
      );
      const key = buildRuleKey({ pattern: pattern, matchModes: matchModes }, fallbackMode);
      if (!pattern || !key || seen.has(key)) {
        return;
      }
      seen.add(key);
      normalized.push({
        pattern: pattern,
        matchModes: matchModes
      });
    });
    return normalized;
  }

  function isRuleMatch(rule, url) {
    if (!rule || !rule.pattern) {
      return false;
    }
    const target = normalizeUrlForMatching(url);
    if (!target) {
      return false;
    }
    const modes = normalizeMatchModes(rule.matchModes, null);
    if (modes.includes('exact') && target === rule.pattern) {
      return true;
    }
    if (modes.includes('exact')) {
      const alternates = getEquivalentPatterns(rule.pattern);
      if (alternates.includes(target)) {
        return true;
      }
    }
    if (modes.includes('prefix')) {
      if (target.startsWith(rule.pattern)) {
        return true;
      }
      const alternates = getEquivalentPatterns(rule.pattern);
      if (alternates.some((alternate) => target.startsWith(alternate))) {
        return true;
      }
    }
    if (modes.includes('suffix')) {
      const sitePattern = normalizeDomainPattern(rule.pattern);
      if (!sitePattern) {
        return false;
      }
      const targetParts = splitHostPathQuery(target);
      const targetHost = targetParts ? String(targetParts.host || '').toLowerCase() : '';
      if (targetHost === sitePattern || targetHost.endsWith(`.${sitePattern}`)) {
        return true;
      }
    }
    return false;
  }

  function isUrlBlocked(url, items) {
    const rules = Array.isArray(items) ? items : [];
    return rules.some((rule) => isRuleMatch(rule, url));
  }

  function getPatternInputValue(rule) {
    if (!rule || !rule.pattern) {
      return '';
    }
    return String(rule.pattern);
  }

  return {
    DEFAULT_MATCH_MODE,
    normalizeMatchModes,
    normalizePattern,
    normalizeItems,
    normalizeUrlForMatching,
    buildRuleKey,
    isRuleMatch,
    isUrlBlocked,
    getPatternInputValue
  };
});
