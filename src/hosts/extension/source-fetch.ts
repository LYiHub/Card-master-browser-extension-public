import { hostFetch, invokeFetch } from '../../lib/host-fetch';
import { readResponseTextWithinLimit } from '../../lib/response-text';

export const MAX_USERSCRIPT_SOURCE_BYTES = 4 * 1024 * 1024;
const SOURCE_FETCH_TIMEOUT_MS = 20_000;

export type ExtensionTextDownload = {
  ok: boolean;
  status: number;
  body: string;
  finalUrl: string;
};

export function normalizeExtensionSourceUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('脚本来源不是有效 URL。');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`不支持 ${url.protocol} 脚本来源。`);
  }
  if (url.username || url.password) {
    throw new Error('脚本来源不能包含登录凭据。');
  }
  url.hash = '';
  return url.href;
}

export async function fetchExtensionText(
  value: string,
  fetcher: typeof fetch = hostFetch,
): Promise<ExtensionTextDownload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);
  try {
    const response = await invokeFetch(
      fetcher,
      normalizeExtensionSourceUrl(value),
      {
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
        signal: controller.signal,
      },
    );
    if (controller.signal.aborted) throw new Error('脚本源码下载超时。');
    const finalUrl = normalizeExtensionSourceUrl(response.url || value);
    const contentLength = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_USERSCRIPT_SOURCE_BYTES
    ) {
      throw new Error('脚本源码超过 4 MB 安全上限。');
    }
    return {
      ok: response.ok,
      status: response.status,
      body: await readResponseTextWithinLimit(
        response,
        MAX_USERSCRIPT_SOURCE_BYTES,
        '脚本源码超过 4 MB 安全上限。',
      ),
      finalUrl,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('脚本源码下载超时。', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
