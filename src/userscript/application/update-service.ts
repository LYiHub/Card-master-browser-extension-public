import { hostFetch, invokeFetch } from '../../lib/host-fetch';
import {
  formatMetadataDiagnostic,
  parseUserscriptMetadata,
  stripUserscriptMetadata,
  userscriptIdentity,
} from '../domain/metadata';
import type { InstalledUserscript } from '../domain/types';
import { userscriptInstallationDiagnostics } from './preflight';

export type UpdateCheckResult =
  | { status: 'disabled' }
  | { status: 'unavailable'; reason: string }
  | { status: 'current'; version: string }
  | {
      status: 'available';
      version: string;
      sourceUrl: string | null;
      metadataSource: string;
    };

export type AvailableUserscriptUpdate = Extract<
  UpdateCheckResult,
  { status: 'available' }
>;

export interface UserscriptUpdater {
  check(
    script: InstalledUserscript,
    mode?: 'automatic' | 'manual',
  ): Promise<UpdateCheckResult>;
  download(update: AvailableUserscriptUpdate): Promise<{ source: string }>;
}

export function applyUserscriptUpdate(
  script: InstalledUserscript,
  downloaded: Awaited<ReturnType<UserscriptUpdater['download']>>,
  options: {
    now: () => number;
  },
) {
  const parsed = parseUserscriptMetadata(downloaded.source);
  if (!parsed.metadata) {
    throw new Error(parsed.diagnostics.map(formatMetadataDiagnostic).join(' '));
  }
  if (
    userscriptIdentity(parsed.metadata) !== userscriptIdentity(script.metadata)
  ) {
    throw new Error('下载脚本的 @namespace + @name 与已安装脚本不一致。');
  }
  if (
    compareUserscriptVersions(
      parsed.metadata.version,
      script.metadata.version,
    ) <= 0
  ) {
    throw new Error('下载脚本的版本没有高于当前安装版本。');
  }
  const updated: InstalledUserscript = {
    ...script,
    source: {
      ...script.source,
      code: downloaded.source,
      updatedAt: options.now(),
    },
    metadata: parsed.metadata,
  };
  const errors = userscriptInstallationDiagnostics(updated).filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (errors.length > 0) {
    throw new Error(errors.map(formatMetadataDiagnostic).join(' '));
  }
  return updated;
}

export type UserscriptFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

const VERSION_PRERELEASE = /^(.*?)-([-.0-9a-z]+)|$/i;
const DIGITS = /^\d+$/;

function compareVersionChunk(left: string, right: string, prerelease: boolean) {
  const leftParts = left.split('.');
  const rightParts = right.split('.');
  const length = prerelease
    ? Math.min(leftParts.length, rightParts.length)
    : Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? '';
    const rightPart = rightParts[index] ?? '';
    const difference =
      prerelease && !(DIGITS.test(leftPart) && DIGITS.test(rightPart))
        ? leftPart === rightPart
          ? 0
          : leftPart > rightPart
            ? 1
            : -1
        : (Number.parseInt(leftPart, 10) || 0) -
          (Number.parseInt(rightPart, 10) || 0);
    if (difference !== 0) return Math.sign(difference);
  }

  return prerelease ? Math.sign(leftParts.length - rightParts.length) : 0;
}

export function compareUserscriptVersions(left: string, right: string) {
  const [, leftMain = left || '', leftPrerelease] =
    VERSION_PRERELEASE.exec(left) ?? [];
  const [, rightMain = right || '', rightPrerelease] =
    VERSION_PRERELEASE.exec(right) ?? [];
  const mainDifference = compareVersionChunk(leftMain, rightMain, false);
  if (mainDifference !== 0) return mainDifference;
  if (!leftPrerelease && !rightPrerelease) return 0;
  if (!leftPrerelease) return 1;
  if (!rightPrerelease) return -1;
  return compareVersionChunk(leftPrerelease, rightPrerelease, true);
}

function updateUrl(value: string | undefined, base?: string) {
  if (!value || value.trim().toLowerCase() === 'none') return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function fetchFailure(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class UserscriptUpdateService implements UserscriptUpdater {
  constructor(private readonly fetcher: UserscriptFetch = hostFetch) {}

  async check(
    script: InstalledUserscript,
    mode: 'automatic' | 'manual' = 'automatic',
  ): Promise<UpdateCheckResult> {
    if (mode === 'automatic' && !script.manager.checkForUpdates) {
      return { status: 'disabled' };
    }
    const metadataSource = updateUrl(
      script.metadata.updateUrl ?? script.metadata.downloadUrl,
    );
    if (!metadataSource) {
      return {
        status: 'unavailable',
        reason: '脚本没有声明 @updateURL 或 @downloadURL。',
      };
    }

    let response: Response;
    try {
      response = await invokeFetch(this.fetcher, metadataSource, {
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch (error) {
      return {
        status: 'unavailable',
        reason: `更新元数据请求失败：${fetchFailure(error)}`,
      };
    }
    if (!response.ok) {
      return {
        status: 'unavailable',
        reason: `更新元数据请求失败：HTTP ${response.status}`,
      };
    }
    const metadataCode = await response.text();
    const parsed = parseUserscriptMetadata(metadataCode);
    if (!parsed.metadata) {
      return {
        status: 'unavailable',
        reason: parsed.diagnostics.map(formatMetadataDiagnostic).join(' '),
      };
    }
    if (
      userscriptIdentity(parsed.metadata) !==
      userscriptIdentity(script.metadata)
    ) {
      return {
        status: 'unavailable',
        reason: '更新源中的 @namespace + @name 与已安装脚本不一致。',
      };
    }
    if (
      compareUserscriptVersions(
        parsed.metadata.version,
        script.metadata.version,
      ) <= 0
    ) {
      return { status: 'current', version: script.metadata.version };
    }
    const sourceUrl =
      updateUrl(parsed.metadata.downloadUrl, metadataSource) ??
      updateUrl(script.metadata.downloadUrl, metadataSource) ??
      (stripUserscriptMetadata(metadataCode).trim() ? metadataSource : null);
    return {
      status: 'available',
      version: parsed.metadata.version,
      sourceUrl,
      metadataSource,
    };
  }

  async download(update: AvailableUserscriptUpdate) {
    if (!update.sourceUrl) {
      throw new Error('发现新版本，但更新 metadata 没有提供可下载的脚本源码。');
    }
    const response = await invokeFetch(this.fetcher, update.sourceUrl, {
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!response.ok) {
      throw new Error(`脚本更新下载失败：HTTP ${response.status}`);
    }
    return { source: await response.text() };
  }
}
