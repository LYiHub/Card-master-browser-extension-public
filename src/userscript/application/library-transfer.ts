import {
  parseUserscriptMetadata,
  userscriptIdentity,
} from '../domain/metadata';
import {
  type InstalledUserscript,
  isUserscriptPresentation,
  type UserscriptManagerConfig,
  type UserscriptPresentation,
} from '../domain/types';
import { installUserscriptSource } from './install-service';
import { createZipArchive, readZipArchive } from './zip-archive';

const MANIFEST_PATH = 'card-master-library.json';
const USERSCRIPT_HEADER = '==UserScript==';

type ArchiveManifestEntry = {
  path: string;
  id: string;
  manager: UserscriptManagerConfig;
  presentation?: UserscriptPresentation;
  source: {
    origin?: string;
    installedAt: number;
    updatedAt: number;
  };
};

type ArchiveManifest = {
  format: 'card-master-library';
  version: 1;
  exportedAt: string;
  scripts: ArchiveManifestEntry[];
};

export type LibraryImportResult = {
  scripts: InstalledUserscript[];
  installed: number;
  skipped: Array<{ path: string; identity: string; reason: string }>;
  rejected: Array<{ path: string; reason: string }>;
  diagnostics: Array<{
    path: string;
    status: 'installed' | 'skipped' | 'rejected';
    identity?: string;
    reason?: string;
  }>;
};

export function formatLibraryImportReport(
  fileName: string,
  result: LibraryImportResult,
) {
  const lines = [
    `导入文件：${fileName}`,
    `结果：${result.installed} 张新增，${result.skipped.length} 张重复跳过，${result.rejected.length} 张未导入`,
  ];
  if (result.skipped.length > 0) {
    lines.push(
      '',
      '重复跳过：',
      ...result.skipped.map(
        (entry, index) =>
          `${index + 1}. ${entry.path}\n   ${entry.reason}\n   ${entry.identity}`,
      ),
    );
  }
  if (result.rejected.length > 0) {
    lines.push(
      '',
      '未导入：',
      ...result.rejected.map(
        (entry, index) => `${index + 1}. ${entry.path}\n   ${entry.reason}`,
      ),
    );
  }
  return lines.join('\n');
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function managerConfig(value: unknown): value is UserscriptManagerConfig {
  return (
    record(value) &&
    typeof value.enabled === 'boolean' &&
    typeof value.checkForUpdates === 'boolean' &&
    ['userMatches', 'userIncludes', 'userExcludeMatches', 'userExcludes'].every(
      (key) =>
        Array.isArray(value[key]) &&
        value[key].every((entry) => typeof entry === 'string'),
    )
  );
}

function manifestEntry(value: unknown): value is ArchiveManifestEntry {
  return (
    record(value) &&
    typeof value.path === 'string' &&
    typeof value.id === 'string' &&
    managerConfig(value.manager) &&
    (value.presentation === undefined ||
      isUserscriptPresentation(value.presentation)) &&
    record(value.source) &&
    (value.source.origin === undefined ||
      typeof value.source.origin === 'string') &&
    typeof value.source.installedAt === 'number' &&
    typeof value.source.updatedAt === 'number'
  );
}

function parseManifest(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !record(parsed) ||
      parsed.format !== 'card-master-library' ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.scripts) ||
      !parsed.scripts.every(manifestEntry)
    ) {
      return null;
    }
    return parsed as ArchiveManifest;
  } catch {
    return null;
  }
}

function safeFilename(value: string) {
  const normalized = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '-' : character))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'userscript';
}

function scriptPaths(scripts: readonly InstalledUserscript[]) {
  const used = new Set<string>();
  return scripts.map((script) => {
    const base = safeFilename(script.metadata.name);
    let path = `scripts/${base}.user.js`;
    let suffix = 2;
    while (used.has(path.toLocaleLowerCase())) {
      path = `scripts/${base}-${suffix}.user.js`;
      suffix += 1;
    }
    used.add(path.toLocaleLowerCase());
    return path;
  });
}

export function libraryArchiveFilename(now = new Date()) {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  return `card-master-library_${date}.zip`;
}

export function exportUserscriptLibrary(
  scripts: readonly InstalledUserscript[],
  now = new Date(),
) {
  const encoder = new TextEncoder();
  const paths = scriptPaths(scripts);
  const manifest: ArchiveManifest = {
    format: 'card-master-library',
    version: 1,
    exportedAt: now.toISOString(),
    scripts: scripts.map((script, index) => ({
      path: paths[index],
      id: script.id,
      manager: structuredClone(script.manager),
      ...(script.presentation
        ? { presentation: structuredClone(script.presentation) }
        : {}),
      source: {
        ...(script.source.origin ? { origin: script.source.origin } : {}),
        installedAt: script.source.installedAt,
        updatedAt: script.source.updatedAt,
      },
    })),
  };
  const bytes = createZipArchive([
    {
      name: MANIFEST_PATH,
      data: encoder.encode(JSON.stringify(manifest, null, 2)),
    },
    ...scripts.map((script, index) => ({
      name: paths[index],
      data: encoder.encode(script.source.code),
    })),
  ]);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' });
}

function userscriptSourcesFromJson(value: unknown, path: string) {
  const sources: Array<{ path: string; source: string }> = [];
  const visit = (candidate: unknown, trail: string) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => {
        visit(entry, `${trail}[${index}]`);
      });
      return;
    }
    if (!record(candidate)) return;
    for (const key of ['code', 'source', 'sourceCode']) {
      const source = candidate[key];
      if (typeof source === 'string' && source.includes(USERSCRIPT_HEADER)) {
        sources.push({ path: `${path}${trail}.${key}`, source });
        return;
      }
    }
    for (const [key, entry] of Object.entries(candidate)) {
      visit(entry, `${trail}.${key}`);
    }
  };
  visit(value, '');
  return sources;
}

async function archiveSources(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoder = new TextDecoder();
  const isZipArchive =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;
  if (
    file.name.toLocaleLowerCase().endsWith('.user.js') ||
    (!isZipArchive &&
      decoder
        .decode(bytes.subarray(0, Math.min(bytes.length, 1024)))
        .includes(USERSCRIPT_HEADER))
  ) {
    return {
      manifest: null,
      sources: [{ path: file.name, source: decoder.decode(bytes) }],
    };
  }
  const entries = await readZipArchive(bytes);
  const manifestBytes = entries.get(MANIFEST_PATH);
  const manifest = parseManifest(
    manifestBytes ? decoder.decode(manifestBytes) : undefined,
  );
  const sources = [...entries.entries()]
    .filter(([path]) => path.toLocaleLowerCase().endsWith('.user.js'))
    .map(([path, source]) => ({ path, source: decoder.decode(source) }));
  if (sources.length === 0) {
    for (const [path, content] of entries) {
      if (!path.toLocaleLowerCase().endsWith('.json')) continue;
      try {
        sources.push(
          ...userscriptSourcesFromJson(
            JSON.parse(decoder.decode(content)),
            path,
          ),
        );
      } catch {
        // A non-JSON entry with a .json suffix is ignored.
      }
    }
  }
  return { manifest, sources };
}

export async function importUserscriptLibrary(
  file: File,
  current: readonly InstalledUserscript[],
): Promise<LibraryImportResult> {
  const { manifest, sources } = await archiveSources(file);
  if (sources.length === 0) {
    throw new Error('归档中没有找到可导入的用户脚本。');
  }
  const manifestByPath = new Map(
    manifest?.scripts.map((entry) => [entry.path, entry]) ?? [],
  );
  let scripts = structuredClone([...current]);
  const localIdentities = new Set(
    current.map((script) => userscriptIdentity(script.metadata)),
  );
  const importedIdentities = new Set<string>();
  let installed = 0;
  const skipped: LibraryImportResult['skipped'] = [];
  const rejected: LibraryImportResult['rejected'] = [];
  const diagnostics: LibraryImportResult['diagnostics'] = [];

  for (const entry of sources) {
    try {
      const archived = manifestByPath.get(entry.path);
      const parsed = parseUserscriptMetadata(entry.source);
      const identity = parsed.metadata
        ? userscriptIdentity(parsed.metadata)
        : null;
      if (identity && localIdentities.has(identity)) {
        const reason =
          '本机已存在同一 @namespace 与 @name 的脚本，已保留本机卡牌。';
        skipped.push({ path: entry.path, identity, reason });
        diagnostics.push({
          path: entry.path,
          status: 'skipped',
          identity,
          reason,
        });
        continue;
      }
      if (identity && importedIdentities.has(identity)) {
        const reason = '归档中存在重复脚本，已保留首次出现的条目。';
        skipped.push({ path: entry.path, identity, reason });
        diagnostics.push({
          path: entry.path,
          status: 'skipped',
          identity,
          reason,
        });
        continue;
      }
      const installation = installUserscriptSource(scripts, {
        source: entry.source,
        origin: `archive:${file.name}#${entry.path}`,
        manager: archived?.manager,
        presentation: archived?.presentation,
        createId: () => crypto.randomUUID(),
        now: Date.now,
      });
      const installedIdentity =
        identity ?? userscriptIdentity(installation.script.metadata);
      const generatedId = installation.script.id;
      const preferredId =
        archived && !scripts.some((script) => script.id === archived.id)
          ? archived.id
          : generatedId;
      const restored: InstalledUserscript = archived
        ? {
            ...installation.script,
            id: preferredId,
            presentation: installation.script.presentation,
            source: {
              code: entry.source,
              origin:
                archived.source.origin ?? `archive:${file.name}#${entry.path}`,
              installedAt: archived.source.installedAt,
              updatedAt: archived.source.updatedAt,
            },
            runtime: {
              ...installation.script.runtime,
              status: archived.manager.enabled ? 'idle' : 'sleeping',
            },
          }
        : installation.script;
      scripts = installation.scripts.map((script) =>
        script.id === generatedId ? restored : script,
      );
      importedIdentities.add(installedIdentity);
      installed += 1;
      diagnostics.push({
        path: entry.path,
        status: 'installed',
        identity: installedIdentity,
      });
    } catch (error) {
      const rejection = {
        path: entry.path,
        reason: error instanceof Error ? error.message : String(error),
      };
      rejected.push(rejection);
      diagnostics.push({
        path: entry.path,
        status: 'rejected',
        reason: rejection.reason,
      });
    }
  }
  return { scripts, installed, skipped, rejected, diagnostics };
}
