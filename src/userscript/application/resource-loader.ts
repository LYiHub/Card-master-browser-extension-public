import { hostFetch, invokeFetch } from '../../lib/host-fetch';
import { readResponseBytesWithinLimit } from '../../lib/response-text';
import type { InstalledUserscript } from '../domain/types';
import type { UserscriptFetch } from './update-service';

const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;
const MAX_RESOURCE_BUNDLE_BYTES = 24 * 1024 * 1024;
const RESOURCE_TIMEOUT_MS = 20_000;

export type LoadedUserscriptResource = {
  url: string;
  text: string;
  dataUrl: string;
};

export type UserscriptResourceBundle = {
  requires: string[];
  resources: Record<string, LoadedUserscriptResource>;
};

type RemoteAsset = LoadedUserscriptResource & { byteLength: number };

function resourceUrl(value: string, base?: string) {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new Error(`用户脚本资源地址无效：${value}`);
  }
  if (
    url.protocol !== 'http:' &&
    url.protocol !== 'https:' &&
    url.protocol !== 'data:'
  ) {
    throw new Error(`不支持此用户脚本资源地址：${value}`);
  }
  return url.href;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

export class UserscriptResourceLoader {
  private readonly scriptCaches = new Map<
    string,
    {
      revision: string;
      assets: Map<string, Promise<RemoteAsset>>;
    }
  >();

  constructor(private readonly fetcher: UserscriptFetch = hostFetch) {}

  async load(script: InstalledUserscript): Promise<UserscriptResourceBundle> {
    const revision = `${script.source.origin ?? ''}\u0000${script.source.code}`;
    let cache = this.scriptCaches.get(script.id);
    if (!cache || cache.revision !== revision) {
      cache = {
        revision,
        assets: new Map<string, Promise<RemoteAsset>>(),
      };
      this.scriptCaches.set(script.id, cache);
    }
    const requireAssets = await Promise.all(
      script.metadata.requires.map(async (url) => {
        return await this.loadUrl(url, script.source.origin, cache.assets);
      }),
    );
    const resourceEntries = await Promise.all(
      Object.entries(script.metadata.resources).map(async ([name, url]) => {
        const loaded = await this.loadUrl(
          url,
          script.source.origin,
          cache.assets,
        );
        return [name, loaded] as const;
      }),
    );
    const uniqueAssets = new Set([
      ...requireAssets,
      ...resourceEntries.map(([, asset]) => asset),
    ]);
    const totalBytes = [...uniqueAssets].reduce(
      (total, asset) => total + asset.byteLength,
      0,
    );
    if (totalBytes > MAX_RESOURCE_BUNDLE_BYTES) {
      throw new Error('用户脚本资源包超过 24 MB 安全限制。');
    }
    const requires = requireAssets.map((asset) => asset.text);
    const resources = Object.fromEntries(
      await Promise.all(
        resourceEntries.map(
          async ([name, loaded]) =>
            [
              name,
              { url: loaded.url, text: loaded.text, dataUrl: loaded.dataUrl },
            ] as const,
        ),
      ),
    );
    return { requires, resources };
  }

  private loadUrl(
    value: string,
    base: string | undefined,
    cache: Map<string, Promise<RemoteAsset>>,
  ) {
    const url = resourceUrl(value, base);
    const cached = cache.get(url);
    if (cached) return cached;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESOURCE_TIMEOUT_MS);
    const pending = invokeFetch(this.fetcher, url, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `用户脚本资源请求失败：HTTP ${response.status} ${url}`,
          );
        }
        const bytes = await readResponseBytesWithinLimit(
          response,
          MAX_RESOURCE_BYTES,
          '用户脚本资源超过 8 MB 安全限制。',
        );
        const contentType =
          response.headers.get('content-type')?.split(';')[0] ||
          'application/octet-stream';
        return {
          url,
          byteLength: bytes.byteLength,
          text: new TextDecoder().decode(bytes),
          dataUrl: `data:${contentType};base64,${bytesToBase64(bytes)}`,
        };
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          throw new Error(`用户脚本资源请求超时：${url}`, {
            cause: error,
          });
        }
        throw error;
      })
      .finally(() => clearTimeout(timeout));
    void pending.catch(() => {
      if (cache.get(url) === pending) cache.delete(url);
    });
    cache.set(url, pending);
    return pending;
  }
}
