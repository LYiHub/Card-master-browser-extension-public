import { readResponseTextWithinLimit } from '../../lib/response-text';
import type { ContentBlockingSubscription } from '../domain/types';

const MAX_SUBSCRIPTION_BYTES = 8 * 1024 * 1024;
const MAX_SUBSCRIPTION_RULES = 60_000;
const REMOTE_EXECUTABLE_RULE = /(?:#@?%#|#@?\$#|#@?#\+js\(|!#include\b)/i;

export type SanitizedSubscription = {
  content: string;
  ruleCount: number;
  rejectedRuleCount: number;
};

export type SubscriptionDownload =
  | { status: 'not-modified'; checkedAt: number }
  | {
      status: 'updated';
      checkedAt: number;
      etag?: string;
      lastModified?: string;
      source: SanitizedSubscription;
    };

function isLocalhost(hostname: string) {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

export function normalizeSubscriptionUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('规则订阅地址不是有效 URL。');
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && isLocalhost(url.hostname))
  ) {
    throw new Error('规则订阅必须使用 HTTPS；仅本机调试允许 HTTP。');
  }
  if (url.username || url.password) {
    throw new Error('规则订阅地址不能包含登录凭据。');
  }
  url.hash = '';
  return url.href;
}

function isRule(line: string) {
  return Boolean(line && !line.startsWith('!') && !line.startsWith('['));
}

export function sanitizeSubscription(source: string): SanitizedSubscription {
  if (new TextEncoder().encode(source).byteLength > MAX_SUBSCRIPTION_BYTES) {
    throw new Error('规则订阅超过 8 MB 安全上限。');
  }
  const accepted: string[] = [];
  let ruleCount = 0;
  let rejectedRuleCount = 0;
  for (const original of source.split(/\r?\n/)) {
    const line = original.trim();
    if (!line) continue;
    if (REMOTE_EXECUTABLE_RULE.test(line)) {
      rejectedRuleCount += 1;
      continue;
    }
    accepted.push(line);
    if (isRule(line)) ruleCount += 1;
    if (ruleCount > MAX_SUBSCRIPTION_RULES) {
      throw new Error('规则订阅超过 60,000 条规则上限。');
    }
  }
  return {
    content: accepted.join('\n'),
    ruleCount,
    rejectedRuleCount,
  };
}

export function subscriptionNameFromSource(source: string, url: string) {
  for (const original of source.split(/\r?\n/, 80)) {
    const match = original.match(/^!\s*(?:title|name)\s*:\s*(.+)$/i);
    const title = match?.[1]?.trim();
    if (title) return title.slice(0, 160);
  }
  const endpoint = new URL(url);
  const filename = endpoint.pathname.split('/').filter(Boolean).at(-1);
  return filename
    ? `${endpoint.hostname} / ${decodeURIComponent(filename).slice(0, 80)}`
    : endpoint.hostname;
}

export class ContentBlockingSubscriptionFetcher {
  constructor(private readonly fetcher: typeof fetch = hostFetch) {}

  async download(
    subscription: Pick<
      ContentBlockingSubscription,
      'url' | 'etag' | 'lastModified'
    >,
  ): Promise<SubscriptionDownload> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const headers = new Headers();
      if (subscription.etag) headers.set('If-None-Match', subscription.etag);
      if (subscription.lastModified) {
        headers.set('If-Modified-Since', subscription.lastModified);
      }
      const response = await invokeFetch(
        this.fetcher,
        normalizeSubscriptionUrl(subscription.url),
        {
          cache: 'no-store',
          credentials: 'omit',
          headers,
          redirect: 'follow',
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) {
        throw new Error('规则订阅下载超时。');
      }
      if (response.url) normalizeSubscriptionUrl(response.url);
      const checkedAt = Date.now();
      if (response.status === 304) {
        return { status: 'not-modified', checkedAt };
      }
      if (!response.ok) {
        throw new Error(`规则订阅下载失败：HTTP ${response.status}。`);
      }
      const contentLength = Number(response.headers.get('content-length'));
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_SUBSCRIPTION_BYTES
      ) {
        throw new Error('规则订阅超过 8 MB 安全上限。');
      }
      return {
        status: 'updated',
        checkedAt,
        etag: response.headers.get('etag') ?? undefined,
        lastModified: response.headers.get('last-modified') ?? undefined,
        source: sanitizeSubscription(
          await readResponseTextWithinLimit(
            response,
            MAX_SUBSCRIPTION_BYTES,
            '规则订阅超过 8 MB 安全上限。',
          ),
        ),
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('规则订阅下载超时。', { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

import { hostFetch, invokeFetch } from '../../lib/host-fetch';
