import type {
  NewTabSearchBlacklistEntry,
  NewTabSearchCandidate,
  NewTabSearchRequestInput,
  NewTabSearchResult,
  NewTabSearchSource,
} from './types';

const SOURCE_SCORE: Readonly<Record<NewTabSearchSource, number>> = {
  'open-tab': 48,
  bookmark: 38,
  history: 28,
  'top-site': 22,
};

function normalizedText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function comparableUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLocaleLowerCase().startsWith('utm_') ||
        key === 'spm_id_from' ||
        key === 'from'
      ) {
        url.searchParams.delete(key);
      }
    }
    const pathname =
      url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';
    return `${url.protocol}//${url.host}${pathname}${url.search}`.toLocaleLowerCase();
  } catch {
    return normalizedText(value);
  }
}

function normalizedDomain(value: string) {
  const input = value.trim().toLocaleLowerCase();
  if (!input) return '';
  try {
    return new URL(input.includes('://') ? input : `https://${input}`).hostname
      .replace(/^www\./, '')
      .replace(/\.$/, '');
  } catch {
    return input.replace(/^www\./, '').replace(/\.$/, '');
  }
}

export function newTabSearchUrlBlocked(
  urlValue: string,
  entries: readonly NewTabSearchBlacklistEntry[],
) {
  const comparable = comparableUrl(urlValue);
  let url: URL | null = null;
  try {
    url = new URL(urlValue);
  } catch {
    url = null;
  }
  return entries.some((entry) => {
    if (entry.mode === 'exact-url') {
      return comparable === comparableUrl(entry.value);
    }
    if (entry.mode === 'url-prefix') {
      return comparable.startsWith(comparableUrl(entry.value));
    }
    const blockedDomain = normalizedDomain(entry.value);
    const host = url?.hostname.replace(/^www\./, '').toLocaleLowerCase() ?? '';
    return (
      Boolean(blockedDomain) &&
      (host === blockedDomain || host.endsWith(`.${blockedDomain}`))
    );
  });
}

function tokenScore(text: string, query: string) {
  if (!query) return 0;
  if (text === query) return 80;
  if (text.startsWith(query)) return 52;
  const boundaryIndex = text.search(
    new RegExp(`(^|[\\s./:_-])${escapeRegExp(query)}`),
  );
  if (boundaryIndex >= 0) return 34;
  if (text.includes(query)) return 18;
  return -24;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function candidateScore(candidate: NewTabSearchCandidate, query: string) {
  const title = normalizedText(candidate.title);
  const url = normalizedText(candidate.url);
  let score =
    SOURCE_SCORE[candidate.source] +
    tokenScore(title, query) +
    Math.round(tokenScore(url, query) * 0.72);
  if (candidate.source === 'history') {
    score += Math.min(18, Math.log2((candidate.visitCount ?? 0) + 1) * 4);
    if (candidate.lastVisitTime) {
      const ageDays = Math.max(
        0,
        (Date.now() - candidate.lastVisitTime) / 86_400_000,
      );
      score += Math.max(0, 14 - Math.log2(ageDays + 1) * 4);
    }
  }
  return Math.round(score * 100) / 100;
}

function candidateIdentity(candidate: NewTabSearchCandidate) {
  return comparableUrl(candidate.url);
}

function preferredCandidate(
  current: NewTabSearchCandidate,
  incoming: NewTabSearchCandidate,
) {
  if (SOURCE_SCORE[incoming.source] > SOURCE_SCORE[current.source]) {
    return incoming;
  }
  if (
    incoming.source === 'history' &&
    current.source === 'history' &&
    (incoming.lastVisitTime ?? 0) > (current.lastVisitTime ?? 0)
  ) {
    return incoming;
  }
  return current;
}

export function rankNewTabSearchCandidates(
  candidates: readonly NewTabSearchCandidate[],
  input: NewTabSearchRequestInput,
): NewTabSearchResult[] {
  const query = normalizedText(input.query);
  if (!query) return [];
  const sourceSet = new Set(input.sources);
  const grouped = new Map<
    string,
    {
      candidate: NewTabSearchCandidate;
      sources: Set<NewTabSearchSource>;
    }
  >();
  for (const candidate of candidates) {
    if (
      !sourceSet.has(candidate.source) ||
      !candidate.url ||
      newTabSearchUrlBlocked(candidate.url, input.blacklist)
    ) {
      continue;
    }
    const identity = candidateIdentity(candidate);
    if (!identity) continue;
    const current = grouped.get(identity);
    if (!current) {
      grouped.set(identity, {
        candidate,
        sources: new Set([candidate.source]),
      });
      continue;
    }
    current.candidate = preferredCandidate(current.candidate, candidate);
    current.sources.add(candidate.source);
  }

  return [...grouped.entries()]
    .map(([id, entry]) => ({
      ...entry.candidate,
      id,
      score: candidateScore(entry.candidate, query),
      sources: [...entry.sources],
    }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        SOURCE_SCORE[right.source] - SOURCE_SCORE[left.source] ||
        left.title.localeCompare(right.title),
    )
    .slice(0, input.limit);
}
