import {
  defaultPageThemeSettings,
  isPageThemeSettings,
  normalizePageThemeSettings,
  PAGE_THEME_STORAGE_KEY,
  type PageThemeSettings,
  type PageThemeSnapshot,
  pageThemeHost,
  togglePageThemeHost,
} from '../../page-theme/domain/types';
import type { ExtensionBackgroundApi } from './api';
import { EXTENSION_CHANNEL } from './protocol';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_FETCH_BYTES = 8 * 1024 * 1024;

type PageThemeFetchRequest = {
  url: string;
  responseType: 'data-url' | 'text';
  mimeType?: string;
  origin: string;
};

type PageThemePageReport = {
  host: string;
  snapshot: PageThemeSnapshot;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function safeHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('暗夜降临只允许读取 HTTP(S) 样式资源。');
  }
  return url;
}

async function boundedBody(response: Response) {
  const announced = Number(response.headers.get('content-length') ?? 0);
  if (announced > MAX_FETCH_BYTES) {
    throw new Error('暗夜降临拒绝了超过 8 MiB 的页面样式资源。');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_FETCH_BYTES) {
      await reader.cancel();
      throw new Error('暗夜降临读取的页面样式资源超过 8 MiB。');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function bytesToBase64(bytes: Uint8Array) {
  let result = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(result);
}

export async function fetchPageThemeResource(request: PageThemeFetchRequest) {
  const requestedUrl = safeHttpUrl(request.url);
  const requestedOrigin = safeHttpUrl(request.origin).origin;
  if (requestedUrl.username || requestedUrl.password) {
    throw new Error('暗夜降临不读取包含凭据的资源地址。');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(requestedUrl, {
      credentials: requestedUrl.origin === requestedOrigin ? 'include' : 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });
    safeHttpUrl(response.url);
    if (!response.ok) {
      throw new Error(`页面样式资源读取失败：HTTP ${response.status}。`);
    }
    const bytes = await boundedBody(response);
    if (request.responseType === 'text') {
      return new TextDecoder().decode(bytes);
    }
    const mimeType =
      request.mimeType ||
      response.headers.get('content-type')?.split(';')[0] ||
      'application/octet-stream';
    return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('暗夜降临读取页面样式资源超时。');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export class ExtensionPageThemeService {
  private settingsPromise: Promise<PageThemeSettings> | null = null;
  private mutationQueue = Promise.resolve();
  private readonly pageReports = new Map<number, PageThemePageReport>();
  private readonly listeners = new Set<(tabId: number) => void>();

  constructor(private readonly api: ExtensionBackgroundApi) {
    api.tabs.onRemoved.addListener((tabId) => {
      this.pageReports.delete(tabId);
    });
    api.tabs.onUpdated.addListener((tabId, change) => {
      if (change.status === 'loading' || change.url) {
        this.pageReports.delete(tabId);
      }
    });
  }

  private async load() {
    const stored = (await this.api.storage.local.get(PAGE_THEME_STORAGE_KEY))[
      PAGE_THEME_STORAGE_KEY
    ];
    if (!isPageThemeSettings(stored)) {
      const settings = defaultPageThemeSettings();
      await this.api.storage.local.set({ [PAGE_THEME_STORAGE_KEY]: settings });
      return settings;
    }
    return normalizePageThemeSettings(stored);
  }

  read() {
    if (!this.settingsPromise) {
      this.settingsPromise = this.load().catch((error) => {
        this.settingsPromise = null;
        throw error;
      });
    }
    return this.settingsPromise;
  }

  pageSnapshot(tabId: number, url: string) {
    const report = this.pageReports.get(tabId);
    return report?.host === pageThemeHost(url) ? report.snapshot : null;
  }

  async reportPage(tabId: number, url: string, snapshot: PageThemeSnapshot) {
    const settings = await this.read();
    const host = pageThemeHost(url);
    if (
      !host ||
      snapshot.currentHost !== host ||
      snapshot.revision !== settings.revision
    ) {
      return;
    }
    const previous = this.pageReports.get(tabId)?.snapshot;
    if (
      previous &&
      (previous.revision > snapshot.revision ||
        (previous.revision === snapshot.revision &&
          previous.status !== 'starting' &&
          snapshot.status === 'starting'))
    ) {
      return;
    }
    this.pageReports.set(tabId, { host, snapshot });
    for (const listener of this.listeners) listener(tabId);
  }

  subscribe(listener: (tabId: number) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private clearPageReports() {
    const tabIds = [...this.pageReports.keys()];
    this.pageReports.clear();
    for (const tabId of tabIds) {
      for (const listener of this.listeners) listener(tabId);
    }
  }

  private async broadcast(settings: PageThemeSettings) {
    const message = {
      channel: EXTENSION_CHANNEL,
      type: 'page-theme-settings-changed',
      settings,
    };
    const tabs = await this.api.tabs.query({});
    const deliveries = [
      this.api.runtime.sendMessage(message),
      ...tabs.flatMap((tab) =>
        typeof tab.id === 'number'
          ? [this.api.tabs.sendMessage(tab.id, message)]
          : [],
      ),
    ];
    void Promise.allSettled(deliveries);
  }

  private mutate(
    mutation: (settings: PageThemeSettings) => PageThemeSettings,
  ): Promise<PageThemeSettings> {
    const operation = this.mutationQueue.then(async () => {
      const current = await this.read();
      const settings = normalizePageThemeSettings({
        ...mutation(structuredClone(current)),
        version: 1,
        revision: current.revision + 1,
      });
      await this.api.storage.local.set({ [PAGE_THEME_STORAGE_KEY]: settings });
      this.settingsPromise = Promise.resolve(settings);
      this.clearPageReports();
      await this.broadcast(settings);
      return settings;
    });
    this.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  setEnabled(enabled: boolean) {
    return this.mutate((settings) => ({ ...settings, enabled }));
  }

  toggleCurrentSite(url: string) {
    return this.mutate((settings) => togglePageThemeHost(settings, url));
  }

  save(settings: PageThemeSettings) {
    if (!isPageThemeSettings(settings)) {
      return Promise.reject(new Error('暗夜降临设置格式无效。'));
    }
    return this.mutate(() => settings);
  }

  reset() {
    return this.mutate(() => defaultPageThemeSettings());
  }

  async fetch(request: PageThemeFetchRequest) {
    try {
      return { data: await fetchPageThemeResource(request) };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }
}
