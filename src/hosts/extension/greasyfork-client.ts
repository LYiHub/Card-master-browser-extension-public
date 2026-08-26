import { hostFetch, invokeFetch } from '../../lib/host-fetch';
import { readResponseTextWithinLimit } from '../../lib/response-text';
import { MAX_USERSCRIPT_SOURCE_BYTES } from './source-fetch';

const GREASY_FORK_API_ORIGIN = 'https://api.greasyfork.org';
const GREASY_FORK_MARKET_ORIGIN = 'https://greasyfork.org';
const GREASY_FORK_UPDATE_ORIGIN = 'https://update.greasyfork.org';
const GREASY_FORK_PAGE_SIZE = 20;
const GREASY_FORK_REQUEST_TIMEOUT_MS = 10_000;
const MAX_GREASY_FORK_API_BYTES = 2 * 1024 * 1024;
const MAX_GREASY_FORK_DESCRIPTION_LENGTH = 600;
const MAX_GREASY_FORK_QUERY_LENGTH = 512;
const MAX_GREASY_FORK_SITE_LENGTH = 253;

export const GREASY_FORK_SORTS = [
  'daily_installs',
  'total_installs',
  'ratings',
  'created',
  'updated',
  'name',
] as const;

export type GreasyForkSort = (typeof GREASY_FORK_SORTS)[number];

export type GreasyForkSearchInput = {
  site: string;
  query: string | null;
  sort: GreasyForkSort;
  page: number;
};

export type GreasyForkSearchResult = {
  site: string;
  query: string | null;
  sort: GreasyForkSort;
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextPage: number | null;
  scripts: Array<{
    id: number;
    name: string;
    description: string;
    dailyInstalls: number;
    totalInstalls: number;
    fanScore: number | null;
    ratings: {
      good: number;
      ok: number;
      bad: number;
    };
    updatedAt: string | null;
    detailUrl: string;
  }>;
};

export type GreasyForkScriptDownload = {
  scriptId: number;
  name: string;
  detailUrl: string;
  sourceUrl: string;
  source: string;
};

type GreasyForkFetcher = typeof fetch;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function boundedText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function optionalNumber(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function parseScriptId(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function officialDetailUrl(scriptId: number) {
  return `${GREASY_FORK_MARKET_ORIGIN}/scripts/${scriptId}`;
}

function officialCodeUrl(value: unknown, scriptId: number) {
  if (typeof value !== 'string') {
    throw new Error('Greasy Fork 没有返回可安装的脚本地址。');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Greasy Fork 返回了无效的脚本地址。');
  }
  if (
    url.origin !== GREASY_FORK_UPDATE_ORIGIN ||
    url.username ||
    url.password ||
    !url.pathname.startsWith(`/scripts/${scriptId}/`) ||
    !url.pathname.toLowerCase().endsWith('.user.js')
  ) {
    throw new Error('Greasy Fork 返回的脚本地址不属于官方更新源。');
  }
  url.hash = '';
  return url.href;
}

function requestSignal(externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException('Timed out', 'TimeoutError')),
    GREASY_FORK_REQUEST_TIMEOUT_MS,
  );
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abort();
  } else {
    externalSignal?.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abort);
    },
  };
}

async function requestText(
  fetcher: GreasyForkFetcher,
  url: string,
  accept: string,
  maxBytes: number,
  tooLargeMessage: string,
  signal?: AbortSignal,
) {
  const scopedSignal = requestSignal(signal);
  try {
    const response = await invokeFetch(fetcher, url, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      headers: { Accept: accept },
      signal: scopedSignal.signal,
    });
    if (!response.ok) {
      throw new Error(`Greasy Fork 请求失败：HTTP ${response.status}`);
    }
    return {
      body: await readResponseTextWithinLimit(
        response,
        maxBytes,
        tooLargeMessage,
      ),
      finalUrl: response.url || url,
    };
  } catch (error) {
    if (scopedSignal.signal.aborted && !signal?.aborted) {
      throw new Error('Greasy Fork 请求超时。', { cause: error });
    }
    throw error;
  } finally {
    scopedSignal.dispose();
  }
}

async function requestJson(
  fetcher: GreasyForkFetcher,
  url: string,
  signal?: AbortSignal,
) {
  const response = await requestText(
    fetcher,
    url,
    'application/json',
    MAX_GREASY_FORK_API_BYTES,
    'Greasy Fork API 响应超过安全上限。',
    signal,
  );
  if (new URL(response.finalUrl).origin !== GREASY_FORK_API_ORIGIN) {
    throw new Error('Greasy Fork API 请求被重定向到非官方来源。');
  }
  try {
    return JSON.parse(response.body) as unknown;
  } catch (error) {
    throw new Error('Greasy Fork 返回了无效 JSON。', { cause: error });
  }
}

export function normalizeGreasyForkSite(value: string) {
  const input = value.trim();
  if (!input || input.length > 2_048) {
    throw new Error('search_greasyfork_scripts 需要有效的网站域名或网址。');
  }
  let url: URL;
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`,
    );
  } catch {
    throw new Error('search_greasyfork_scripts 需要有效的网站域名或网址。');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error('Greasy Fork 站点搜索只支持无凭据、无端口的 HTTP 网站。');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const labels = hostname.split('.');
  if (
    !hostname ||
    hostname.length > MAX_GREASY_FORK_SITE_LENGTH ||
    !hostname.includes('.') ||
    hostname.includes(':') ||
    /^\d+(?:\.\d+){3}$/.test(hostname) ||
    labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))
  ) {
    throw new Error('search_greasyfork_scripts 需要有效的公开网站域名。');
  }
  return hostname;
}

export function isGreasyForkSort(value: unknown): value is GreasyForkSort {
  return GREASY_FORK_SORTS.some((sort) => sort === value);
}

export function validateGreasyForkSearchInput(input: {
  site: unknown;
  query: unknown;
  sort: unknown;
  page: unknown;
}): GreasyForkSearchInput {
  const query =
    input.query === null
      ? null
      : typeof input.query === 'string' &&
          input.query.length <= MAX_GREASY_FORK_QUERY_LENGTH
        ? input.query.trim() || null
        : undefined;
  if (
    typeof input.site !== 'string' ||
    query === undefined ||
    !isGreasyForkSort(input.sort) ||
    typeof input.page !== 'number' ||
    !Number.isInteger(input.page) ||
    input.page < 1 ||
    input.page > 10_000
  ) {
    throw new Error(
      'search_greasyfork_scripts 需要有效的 site、query、sort 和 page。',
    );
  }
  return {
    site: normalizeGreasyForkSite(input.site),
    query,
    sort: input.sort,
    page: input.page,
  };
}

function searchScript(value: unknown) {
  if (!record(value)) return null;
  const id = parseScriptId(value.id);
  const name = boundedText(value.name, 300);
  if (!id || !name) return null;
  return {
    id,
    name,
    description: boundedText(
      value.description,
      MAX_GREASY_FORK_DESCRIPTION_LENGTH,
    ),
    dailyInstalls: nonNegativeInteger(value.daily_installs),
    totalInstalls: nonNegativeInteger(value.total_installs),
    fanScore: optionalNumber(value.fan_score),
    ratings: {
      good: nonNegativeInteger(value.good_ratings),
      ok: nonNegativeInteger(value.ok_ratings),
      bad: nonNegativeInteger(value.bad_ratings),
    },
    updatedAt: optionalTimestamp(value.code_updated_at),
    detailUrl: officialDetailUrl(id),
  };
}

export class GreasyForkClient {
  constructor(private readonly fetcher: GreasyForkFetcher = hostFetch) {}

  async search(
    rawInput: GreasyForkSearchInput,
    signal?: AbortSignal,
  ): Promise<GreasyForkSearchResult> {
    const input = validateGreasyForkSearchInput(rawInput);
    const url = new URL(
      `/en/scripts/by-site/${encodeURIComponent(input.site)}.json`,
      GREASY_FORK_API_ORIGIN,
    );
    url.searchParams.set('filter_locale', '0');
    url.searchParams.set('language', 'all');
    url.searchParams.set('per_page', String(GREASY_FORK_PAGE_SIZE));
    url.searchParams.set('sort', input.sort);
    url.searchParams.set('page', String(input.page));
    if (input.query) url.searchParams.set('q', input.query);

    const response = await requestJson(this.fetcher, url.href, signal);
    const candidates = Array.isArray(response)
      ? response
      : record(response) && Array.isArray(response.query)
        ? response.query
        : null;
    if (!candidates) {
      throw new Error('Greasy Fork 返回了无法识别的搜索结果。');
    }
    const scripts = candidates
      .slice(0, GREASY_FORK_PAGE_SIZE)
      .map(searchScript)
      .filter((script) => script !== null);
    const hasMore = candidates.length >= GREASY_FORK_PAGE_SIZE;
    return {
      ...input,
      pageSize: GREASY_FORK_PAGE_SIZE,
      hasMore,
      nextPage: hasMore ? input.page + 1 : null,
      scripts,
    };
  }

  async download(
    scriptId: number,
    signal?: AbortSignal,
  ): Promise<GreasyForkScriptDownload> {
    if (!Number.isSafeInteger(scriptId) || scriptId < 1) {
      throw new Error('install_greasyfork_script 需要有效的 script_id。');
    }
    const detailApiUrl = new URL(
      `/en/scripts/${scriptId}.json`,
      GREASY_FORK_API_ORIGIN,
    );
    const detail = await requestJson(this.fetcher, detailApiUrl.href, signal);
    if (!record(detail) || parseScriptId(detail.id) !== scriptId) {
      throw new Error('Greasy Fork 没有返回匹配的脚本详情。');
    }
    const name = boundedText(detail.name, 300);
    const codeUrl = officialCodeUrl(detail.code_url, scriptId);
    const response = await requestText(
      this.fetcher,
      codeUrl,
      'text/javascript, text/plain;q=0.9',
      MAX_USERSCRIPT_SOURCE_BYTES,
      'Greasy Fork 脚本源码超过 4 MB 安全上限。',
      signal,
    );
    const sourceUrl = officialCodeUrl(response.finalUrl, scriptId);
    const source = response.body;
    if (!source.trim()) throw new Error('Greasy Fork 返回了空脚本源码。');
    return {
      scriptId,
      name: name || `Greasy Fork #${scriptId}`,
      detailUrl: officialDetailUrl(scriptId),
      sourceUrl,
      source,
    };
  }
}
