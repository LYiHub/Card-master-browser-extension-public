import type {
  InstalledUserscript,
  ScriptMatchContext,
  UserscriptManagerConfig,
  UserscriptMetadata,
} from './types';

export type ScriptMatchResult = {
  eligible: boolean;
  reason: 'matched' | 'no-inclusion' | 'excluded' | 'invalid-url' | 'noframes';
};

export type SerializedRegExp = {
  source: string;
  flags: string;
};

export type UserscriptMatchPlan = {
  noframes: boolean;
  inclusions: {
    matches: SerializedRegExp[];
    includes: SerializedRegExp[];
  };
  exclusions: {
    matches: SerializedRegExp[];
    includes: SerializedRegExp[];
  };
};

export type MatchPatternCompatibility = 'native' | 'legacy' | 'invalid';

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function wildcardRegex(value: string) {
  return new RegExp(`^${escapeRegex(value).replaceAll('*', '.*')}$`);
}

function serialized(regex: RegExp): SerializedRegExp {
  return { source: regex.source, flags: regex.flags };
}

export function normalizeMatchPattern(pattern: string) {
  const trimmed = pattern.trim();
  const schemeNormalized = trimmed.startsWith('**://')
    ? `*://${trimmed.slice('**://'.length)}`
    : trimmed;
  const match = /^(\*|http|https|file|ftp):\/\/([^/]*)(\/.*)$/.exec(
    schemeNormalized,
  );
  if (match?.[2] !== '**') return schemeNormalized;
  return `${match[1]}://*${match[3]}`;
}

export function validateMatchPattern(pattern: string) {
  const normalized = normalizeMatchPattern(pattern);
  if (normalized === '<all_urls>') return null;
  const match = /^(\*|http|https|file|ftp):\/\/([^/]*)(\/.*)$/.exec(normalized);
  if (!match) return '需要有效的用户脚本 @match 规则。';
  const [, scheme, host] = match;
  if (scheme === 'file') {
    return host === '' ? null : 'file 匹配规则不能声明主机名。';
  }
  if (
    !host ||
    (host.includes('*') && host !== '*' && !/^\*\.[^*]+$/.test(host))
  ) {
    return '@match 主机通配符必须是 `*` 或以 `*.` 开头。';
  }
  const bracketedHostEnd = host.startsWith('[') ? host.indexOf(']') : -1;
  const declaresPort = host.startsWith('[')
    ? bracketedHostEnd < 0 || bracketedHostEnd !== host.length - 1
    : host.includes(':');
  if (declaresPort) {
    return '用户脚本 @match 规则不能声明端口。';
  }
  return null;
}

export function matchPatternCompatibility(
  pattern: string,
): MatchPatternCompatibility {
  const normalized = normalizeMatchPattern(pattern);
  if (
    !validateMatchPattern(normalized) &&
    !normalized.includes('?') &&
    !normalized.includes('#')
  ) {
    return 'native';
  }
  if (normalized.includes('#')) return 'invalid';
  const match = /^(\*|http|https|file|ftp):\/\/([^/]*)(\/.*)$/.exec(normalized);
  if (!match) return 'invalid';
  const [, scheme, host] = match;
  if (
    scheme === 'file' ||
    !host ||
    host.includes(':') ||
    host.includes('[') ||
    host.includes(']')
  ) {
    return 'invalid';
  }
  return 'legacy';
}

function nativeMatchPatternRegex(pattern: string) {
  const normalized = normalizeMatchPattern(pattern);
  if (normalized === '<all_urls>') {
    return /^(?:https?|file|ftp):/;
  }
  if (matchPatternCompatibility(normalized) !== 'native') return null;
  const match = /^(\*|http|https|file|ftp):\/\/([^/]*)(\/.*)$/.exec(normalized);
  if (!match) return null;
  const [, scheme, host, path] = match;
  const schemeSource = scheme === '*' ? 'https?' : escapeRegex(scheme);
  const hostSource =
    scheme === 'file'
      ? ''
      : host === '*'
        ? '[^/]+'
        : host.startsWith('*.')
          ? `(?:[^/.]+\\.)*${escapeRegex(host.slice(2))}`
          : escapeRegex(host);
  return new RegExp(
    `^${schemeSource}:\\/\\/${hostSource}${escapeRegex(path).replaceAll('*', '.*')}$`,
    'i',
  );
}

function legacyMatchPatternRegex(pattern: string) {
  const normalized = normalizeMatchPattern(pattern);
  if (matchPatternCompatibility(normalized) !== 'legacy') return null;
  const match = /^(\*|http|https|file|ftp):\/\/([^/]*)(\/.*)$/.exec(normalized);
  if (!match) return null;
  const [, scheme, host, path] = match;
  const schemeSource = scheme === '*' ? 'https?' : escapeRegex(scheme);
  const hostSource = escapeRegex(host).replaceAll('*', '[^/]*');
  const pathSource = escapeRegex(path).replaceAll('*', '.*');
  return new RegExp(`^${schemeSource}:\\/\\/${hostSource}${pathSource}$`, 'i');
}

function includePatternRegex(pattern: string) {
  if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
    const end = pattern.lastIndexOf('/');
    try {
      return new RegExp(pattern.slice(1, end), pattern.slice(end + 1));
    } catch {
      return null;
    }
  }
  return wildcardRegex(pattern);
}

export function validateIncludePattern(pattern: string) {
  return includePatternRegex(pattern)
    ? null
    : '需要有效的用户脚本 @include 正则表达式。';
}

function urlWithoutHash(url: URL) {
  const normalized = new URL(url.href);
  normalized.hash = '';
  return normalized.href;
}

function urlForMatchPattern(url: URL) {
  const authority = url.protocol === 'file:' ? '' : `//${url.hostname}`;
  return `${url.protocol}${authority}${url.pathname}`;
}

export function matchesWebExtensionPattern(pattern: string, input: URL) {
  return (
    nativeMatchPatternRegex(pattern)?.test(urlForMatchPattern(input)) ?? false
  );
}

export function matchesIncludePattern(pattern: string, input: URL) {
  return includePatternRegex(pattern)?.test(urlWithoutHash(input)) ?? false;
}

function inclusionRules(
  metadata: UserscriptMetadata,
  manager: UserscriptManagerConfig,
) {
  const hasManagerInclusions =
    manager.userMatches.length > 0 || manager.userIncludes.length > 0;
  return {
    matches: hasManagerInclusions ? manager.userMatches : metadata.matches,
    includes: hasManagerInclusions ? manager.userIncludes : metadata.includes,
    excludeMatches: [...metadata.excludeMatches, ...manager.userExcludeMatches],
    excludes: [...metadata.excludes, ...manager.userExcludes],
  };
}

export function createUserscriptMatchPlan(
  metadata: UserscriptMetadata,
  manager: UserscriptManagerConfig,
): UserscriptMatchPlan {
  const rules = inclusionRules(metadata, manager);
  const matchPatterns = (patterns: readonly string[]) => {
    const native: SerializedRegExp[] = [];
    const legacy: SerializedRegExp[] = [];
    for (const pattern of patterns) {
      const nativeRegex = nativeMatchPatternRegex(pattern);
      if (nativeRegex) {
        native.push(serialized(nativeRegex));
        continue;
      }
      const legacyRegex = legacyMatchPatternRegex(pattern);
      if (legacyRegex) legacy.push(serialized(legacyRegex));
    }
    return { native, legacy };
  };
  const inclusions = matchPatterns(rules.matches);
  const exclusions = matchPatterns(rules.excludeMatches);
  return {
    noframes: metadata.noframes,
    inclusions: {
      matches: inclusions.native,
      includes: [
        ...inclusions.legacy,
        ...rules.includes.flatMap((pattern) => {
          const regex = includePatternRegex(pattern);
          return regex ? [serialized(regex)] : [];
        }),
      ],
    },
    exclusions: {
      matches: exclusions.native,
      includes: [
        ...exclusions.legacy,
        ...rules.excludes.flatMap((pattern) => {
          const regex = includePatternRegex(pattern);
          return regex ? [serialized(regex)] : [];
        }),
      ],
    },
  };
}

export function matchUserscriptPlan(
  plan: UserscriptMatchPlan,
  context: ScriptMatchContext,
): ScriptMatchResult {
  if (!context.topFrame && plan.noframes) {
    return { eligible: false, reason: 'noframes' };
  }

  let url: URL;
  try {
    url = new URL(context.url);
  } catch {
    return { eligible: false, reason: 'invalid-url' };
  }

  const matchTarget = urlForMatchPattern(url);
  const includeTarget = urlWithoutHash(url);
  const test = (patterns: readonly SerializedRegExp[], target: string) =>
    patterns.some(({ source, flags }) =>
      new RegExp(source, flags).test(target),
    );
  const included =
    test(plan.inclusions.matches, matchTarget) ||
    test(plan.inclusions.includes, includeTarget);
  if (!included) return { eligible: false, reason: 'no-inclusion' };

  const excluded =
    test(plan.exclusions.matches, matchTarget) ||
    test(plan.exclusions.includes, includeTarget);
  return excluded
    ? { eligible: false, reason: 'excluded' }
    : { eligible: true, reason: 'matched' };
}

export function matchUserscript(
  metadata: UserscriptMetadata,
  manager: UserscriptManagerConfig,
  context: ScriptMatchContext,
): ScriptMatchResult {
  return matchUserscriptPlan(
    createUserscriptMatchPlan(metadata, manager),
    context,
  );
}

export function matchInstalledUserscript(
  script: InstalledUserscript,
  context: ScriptMatchContext,
) {
  return matchUserscript(script.metadata, script.manager, context);
}
