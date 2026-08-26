import { hostFetch, invokeFetch } from '../../lib/host-fetch';
import { readResponseBytesWithinLimit } from '../../lib/response-text';
import type { InstalledUserscript } from '../domain/types';
import type { UserscriptFetch } from './update-service';

const MAX_GM_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_REDIRECTS = 10;

export type UserscriptRequestDetails = {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  data?: string | ArrayBuffer | Blob;
  responseType?:
    | ''
    | 'text'
    | 'json'
    | 'arraybuffer'
    | 'blob'
    | 'document'
    | 'stream';
  timeout?: number;
  anonymous?: boolean;
  cookie?: string;
};

export type UserscriptRequestResponse = {
  finalUrl: string;
  readyState: 4;
  status: number;
  statusText: string;
  responseHeaders: string;
  response: string | ArrayBuffer | Blob | unknown;
  responseText: string;
};

export type UserscriptRequestEvent = {
  type: 'loadstart' | 'readystatechange' | 'progress';
  readyState: 1 | 2 | 3;
  loaded: number;
  total: number;
  lengthComputable: boolean;
  finalUrl?: string;
  status?: number;
  statusText?: string;
  responseHeaders?: string;
};

export class UserscriptRequestError extends Error {
  constructor(
    readonly kind: 'abort' | 'timeout' | 'network',
    message: string,
  ) {
    super(message);
    this.name = 'UserscriptRequestError';
  }
}

export interface UserscriptRequestHeaderAdapter {
  request<T>(
    url: string,
    headers: Headers,
    operation: (headers: Headers) => Promise<T>,
  ): Promise<T>;
}

function connectAllows(
  connects: readonly string[],
  sourceUrl: string,
  target: URL,
) {
  const source = new URL(sourceUrl);
  return connects.some((rule) => {
    const normalized = rule.trim().toLowerCase();
    if (normalized === '*') return true;
    if (normalized === 'self') return source.origin === target.origin;
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(2);
      return (
        target.hostname === suffix || target.hostname.endsWith(`.${suffix}`)
      );
    }
    return target.hostname === normalized;
  });
}

function requestUrl(
  script: InstalledUserscript,
  sourceUrl: string,
  value: string,
  enforceConnect: boolean,
) {
  let url: URL;
  try {
    url = new URL(value, sourceUrl);
  } catch {
    throw new Error(`Invalid GM request URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported GM request URL protocol: ${url.protocol}`);
  }
  if (
    enforceConnect &&
    !connectAllows(script.metadata.connects, sourceUrl, url)
  ) {
    throw new Error(
      `GM request host is not allowed by @connect: ${url.hostname}`,
    );
  }
  return url.href;
}

function responseHeaders(headers: Headers) {
  return [...headers.entries()]
    .map(([name, value]) => `${name}: ${value}`)
    .join('\r\n');
}

export class UserscriptRequestService {
  constructor(
    private readonly fetcher: UserscriptFetch = hostFetch,
    private readonly headerAdapter?: UserscriptRequestHeaderAdapter,
  ) {}

  request(
    script: InstalledUserscript,
    sourceUrl: string,
    details: UserscriptRequestDetails,
    options: {
      enforceConnect?: boolean;
      onEvent?: (event: UserscriptRequestEvent) => void;
    } = {},
  ) {
    const enforceConnect = options.enforceConnect ?? true;
    const responseType = details.responseType ?? '';
    if (
      responseType !== '' &&
      responseType !== 'text' &&
      responseType !== 'json' &&
      responseType !== 'arraybuffer' &&
      responseType !== 'blob' &&
      responseType !== 'document'
    ) {
      throw new Error(
        `Unsupported GM request responseType: ${String(responseType)}`,
      );
    }
    const url = requestUrl(script, sourceUrl, details.url, enforceConnect);
    const controller = new AbortController();
    let abortKind: UserscriptRequestError['kind'] = 'abort';
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (details.timeout && details.timeout > 0) {
      timer = setTimeout(() => {
        abortKind = 'timeout';
        controller.abort();
      }, details.timeout);
    }
    const method = details.method?.toUpperCase() || 'GET';
    const headers = new Headers(details.headers);
    if (details.cookie) {
      const existing = headers.get('cookie');
      headers.set(
        'cookie',
        existing ? `${existing}; ${details.cookie}` : details.cookie,
      );
    }
    options.onEvent?.({
      type: 'loadstart',
      readyState: 1,
      loaded: 0,
      total: 0,
      lengthComputable: false,
    });

    const promise = this.fetchAuthorized(
      script,
      sourceUrl,
      url,
      {
        body: method === 'GET' || method === 'HEAD' ? undefined : details.data,
        cache: 'no-store',
        credentials: details.anonymous ? 'omit' : 'include',
        headers,
        method,
        signal: controller.signal,
      },
      enforceConnect,
    )
      .then(
        async ({ response, finalUrl }): Promise<UserscriptRequestResponse> => {
          const totalHeader = response.headers.get('content-length');
          const totalValue =
            totalHeader === null || totalHeader.trim() === ''
              ? Number.NaN
              : Number(totalHeader);
          const lengthComputable =
            Number.isFinite(totalValue) && totalValue >= 0;
          const total = lengthComputable ? totalValue : 0;
          const commonEvent = {
            finalUrl,
            status: response.status,
            statusText: response.statusText,
            responseHeaders: responseHeaders(response.headers),
          };
          options.onEvent?.({
            type: 'readystatechange',
            readyState: 2,
            loaded: 0,
            total,
            lengthComputable,
            ...commonEvent,
          });
          let loadingReported = false;
          const bytes = await readResponseBytesWithinLimit(
            response,
            MAX_GM_RESPONSE_BYTES,
            'GM request response exceeds the 16 MB safety limit.',
            (loaded, announcedTotal) => {
              const resolvedTotal = announcedTotal ?? 0;
              if (!loadingReported) {
                loadingReported = true;
                options.onEvent?.({
                  type: 'readystatechange',
                  readyState: 3,
                  loaded,
                  total: resolvedTotal,
                  lengthComputable: announcedTotal !== null,
                  ...commonEvent,
                });
              }
              options.onEvent?.({
                type: 'progress',
                readyState: 3,
                loaded,
                total: resolvedTotal,
                lengthComputable: announcedTotal !== null,
                ...commonEvent,
              });
            },
          );
          const responseText =
            responseType === 'arraybuffer' || responseType === 'blob'
              ? ''
              : new TextDecoder().decode(bytes);
          const contentType =
            response.headers.get('content-type') ?? 'application/octet-stream';
          return {
            finalUrl,
            readyState: 4,
            status: response.status,
            statusText: response.statusText,
            responseHeaders: responseHeaders(response.headers),
            response:
              responseType === 'arraybuffer'
                ? bytes.slice().buffer
                : responseType === 'blob'
                  ? new Blob([bytes], { type: contentType })
                  : responseType === 'json'
                    ? JSON.parse(responseText)
                    : responseText,
            responseText,
          };
        },
      )
      .catch((error) => {
        if (controller.signal.aborted) {
          throw new UserscriptRequestError(
            abortKind,
            abortKind === 'timeout'
              ? `GM request timed out: ${url}`
              : `GM request aborted: ${url}`,
          );
        }
        throw new UserscriptRequestError(
          'network',
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });

    return {
      abort: () => controller.abort(),
      promise,
    };
  }

  private async fetchAuthorized(
    script: InstalledUserscript,
    sourceUrl: string,
    initialUrl: string,
    initial: RequestInit,
    enforceConnect: boolean,
  ) {
    let url = initialUrl;
    let method = String(initial.method ?? 'GET').toUpperCase();
    let body = initial.body;
    for (
      let redirectCount = 0;
      redirectCount <= MAX_REDIRECTS;
      redirectCount += 1
    ) {
      const request = (headers: Headers) =>
        invokeFetch(this.fetcher, url, {
          ...initial,
          body,
          headers,
          method,
          redirect: 'manual',
        });
      const headers = new Headers(initial.headers);
      const response = this.headerAdapter
        ? await this.headerAdapter.request(url, headers, request)
        : await request(headers);
      const redirected =
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308;
      if (!redirected) {
        const finalUrl = requestUrl(
          script,
          sourceUrl,
          response.url || url,
          enforceConnect,
        );
        return { response, finalUrl };
      }
      if (redirectCount === MAX_REDIRECTS) {
        throw new Error(`GM request exceeded ${MAX_REDIRECTS} redirects.`);
      }
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(
          'GM request redirect did not expose a Location header.',
        );
      }
      url = requestUrl(
        script,
        sourceUrl,
        new URL(location, url).href,
        enforceConnect,
      );
      if (
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) &&
          method === 'POST')
      ) {
        method = 'GET';
        body = undefined;
      }
    }
    throw new Error(`GM request exceeded ${MAX_REDIRECTS} redirects.`);
  }
}
